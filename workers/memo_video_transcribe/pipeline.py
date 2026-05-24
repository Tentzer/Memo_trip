"""
Social URL -> transcript and/or image OCR -> Gemini place extraction (TikTok / Instagram / Facebook).

Orchestration:
  - Instagram: RapidAPI instagram-looter2 post-dl (rapidapi_ig_looter.py).
  - TikTok: gallery-dl for /photo/ carousels; yt-dlp for videos (tiktok_download.py).
  - Images: Gemini vision OCR (image_ocr.py).
  - Video/audio files: ffmpeg/Replicate Whisper when an audio track exists.
  - Gemini merges transcript + OCR + caption into structured places.
"""

from __future__ import annotations

import io
import os
import tempfile
from pathlib import Path
from typing import Literal

import replicate
from moviepy.editor import AudioFileClip, VideoFileClip

import image_ocr
import media_fetch
import place_agent
import video_cache_key
from social_download import (
    MAX_VIDEO_SECONDS,
    assert_allowed_social_url,
    hostname_from_url,
    is_image_media_path,
)
from worker_log import get_logger, log_step

log = get_logger(__name__)


def _cache_headers() -> dict[str, str] | None:
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not key:
        return None
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }


def _cache_endpoint() -> str | None:
    url = os.environ.get("SUPABASE_URL", "").strip()
    if not url:
        return None
    return f"{url}/rest/v1/video_cache"


def _should_cache_result(result: dict) -> bool:
    if not isinstance(result, dict):
        return False
    if result.get("agent_error"):
        return False
    places = result.get("places")
    if not isinstance(places, list) or not places:
        return False
    for place in places:
        if not isinstance(place, dict):
            return False
        name = str(place.get("name") or "").strip()
        maps_hint = str(place.get("maps_search_hint") or "").strip()
        if not name or not maps_hint:
            return False
    return True


def cache_delete(platform: str, media_code: str) -> None:
    import requests

    headers = _cache_headers()
    endpoint = _cache_endpoint()
    if not headers or not endpoint:
        return
    try:
        log.info("cache_delete start platform=%r media_code=%r", platform, media_code)
        res = requests.delete(
            endpoint,
            headers=headers,
            params={
                "platform": f"eq.{platform}",
                "media_code": f"eq.{media_code}",
            },
            timeout=10,
        )
        log.info(
            "cache_delete done platform=%r media_code=%r status=%s",
            platform,
            media_code,
            res.status_code,
        )
    except Exception as e:
        log.warning(
            "cache_delete error platform=%r media_code=%r error_type=%s error=%s",
            platform,
            media_code,
            type(e).__name__,
            e,
        )


def cache_get(platform: str, media_code: str) -> dict | None:
    import requests

    headers = _cache_headers()
    endpoint = _cache_endpoint()
    if not headers or not endpoint:
        log.info("cache_get skip no_supabase_config platform=%r media_code=%r", platform, media_code)
        return None
    try:
        log.info("cache_get start platform=%r media_code=%r", platform, media_code)
        res = requests.get(
            endpoint,
            headers={**headers, "Accept": "application/json"},
            params={
                "platform": f"eq.{platform}",
                "media_code": f"eq.{media_code}",
                "select": "result",
            },
            timeout=10,
        )
        if res.ok:
            rows = res.json()
            if rows:
                result = rows[0]["result"]
                if _should_cache_result(result):
                    log.info("cache_get hit platform=%r media_code=%r", platform, media_code)
                    return result
                log.info(
                    "cache_get skip invalid cached result platform=%r media_code=%r",
                    platform,
                    media_code,
                )
                cache_delete(platform, media_code)
        log.info(
            "cache_get miss platform=%r media_code=%r status=%s",
            platform,
            media_code,
            res.status_code,
        )
    except Exception as e:
        log.warning(
            "cache_get error platform=%r media_code=%r error_type=%s error=%s",
            platform,
            media_code,
            type(e).__name__,
            e,
        )
    return None


def cache_set(platform: str, media_code: str, result: dict) -> None:
    import requests

    if not _should_cache_result(result):
        log.info(
            "cache_set skip invalid result platform=%r media_code=%r place_count=%s agent_error=%r",
            platform,
            media_code,
            len(result.get("places") or []) if isinstance(result, dict) else 0,
            result.get("agent_error") if isinstance(result, dict) else None,
        )
        return

    headers = _cache_headers()
    endpoint = _cache_endpoint()
    if not headers or not endpoint:
        log.info("cache_set skip no_supabase_config platform=%r media_code=%r", platform, media_code)
        return
    try:
        log.info("cache_set start platform=%r media_code=%r", platform, media_code)
        res = requests.post(
            endpoint,
            headers={
                **headers,
                "Prefer": "resolution=merge-duplicates",
            },
            params={"on_conflict": "platform,media_code"},
            json={
                "platform": platform,
                "media_code": media_code,
                "result": result,
            },
            timeout=10,
        )
        log.info(
            "cache_set done platform=%r media_code=%r status=%s",
            platform,
            media_code,
            res.status_code,
        )
    except Exception as e:
        log.warning(
            "cache_set error platform=%r media_code=%r error_type=%s error=%s",
            platform,
            media_code,
            type(e).__name__,
            e,
        )


DEFAULT_TRANSCRIBE_MODEL = (
    "vaibhavs10/incredibly-fast-whisper:"
    "3ab86df6c8f54c11309d4d1f930ac292bad43ace52d10c80d87eb258b3c9f79c"
)

_AUDIO_ONLY_SUFFIXES = frozenset(
    {".mp3", ".m4a", ".aac", ".opus", ".ogg", ".wav", ".flac", ".oga"}
)


def _transcribe_model() -> str:
    return os.environ.get("TRANSCRIBE_MODEL", DEFAULT_TRANSCRIBE_MODEL)


def ensure_replicate_token() -> None:
    token = (os.environ.get("REPLICATE_API_TOKEN") or "").strip()
    if not token:
        raise RuntimeError(
            "REPLICATE_API_TOKEN is not set. Use Modal secret replicate-api-token with that exact key name."
        )
    os.environ["REPLICATE_API_TOKEN"] = token
    replicate.api_token = token


def extract_audio_mp3(media_path: Path, output_dir: Path) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    audio_path = output_dir / f"{media_path.stem}.mp3"
    suffix = media_path.suffix.lower()

    if suffix in _AUDIO_ONLY_SUFFIXES:
        with AudioFileClip(str(media_path)) as clip:
            clip.write_audiofile(str(audio_path), verbose=False)
        return audio_path

    with VideoFileClip(str(media_path)) as clip:
        if clip.audio is None:
            raise RuntimeError("Downloaded file has no audio track; cannot transcribe.")
        clip.audio.write_audiofile(str(audio_path), verbose=False)
    return audio_path


def transcribe_audio_mp3(mp3_path: Path) -> dict:
    ensure_replicate_token()
    raw = mp3_path.read_bytes()
    if len(raw) < 64:
        raise RuntimeError(
            f"Extracted MP3 is too small ({len(raw)} bytes); download or ffmpeg likely failed."
        )
    log.info("whisper start mp3=%r bytes=%s model=%r", mp3_path.name, len(raw), _transcribe_model())
    buf = io.BytesIO(raw)
    buf.name = "audio.mp3"
    out = replicate.run(_transcribe_model(), input={"audio": buf})
    text_len = len((out.get("text") or "") if isinstance(out, dict) else "")
    log.info("whisper done mp3=%r transcript_chars=%s", mp3_path.name, text_len)
    return out


def transcribe_from_url(url: str) -> dict:
    """
    Download media, run OCR on images and/or Whisper on audio, then Gemini place extraction.

    Checks Supabase video_cache first when URL parses to (platform, media_code).

    Response adds:
      pipeline_route: \"carousel\" | \"single\"
      download_source: \"rapidapi_looter\" | \"ytdlp\" | \"gallery_dl\"
      ocr_text: concatenated OCR when images were processed (may be empty)
    """
    url = url.strip()
    assert_allowed_social_url(url)
    log.info("transcribe_from_url start url=%r host=%r", url, hostname_from_url(url))

    cache_pair = video_cache_key.parse_video_cache_key(url)

    with log_step(log, "cache_lookup", url=url, cache_pair=cache_pair):
        cached = cache_get(cache_pair[0], cache_pair[1]) if cache_pair else None
    if cached is not None:
        cached["cached"] = True
        log.info("transcribe_from_url cache_hit url=%r", url)
        return cached

    host = hostname_from_url(url)
    if "tiktok.com" in host:
        platform = "tiktok"
    elif "instagram.com" in host:
        platform = "instagram"
    elif "facebook.com" in host or host == "fb.watch":
        platform = "facebook"
    else:
        platform = "unknown"

    title = "Unknown title"
    description = ""
    duration = None
    route: Literal["carousel", "single"] = "single"

    transcript_text = ""
    segments = None
    ocr_text = ""

    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        with log_step(log, "download", url=url):
            paths, download_source, fetch_meta = media_fetch.fetch_media_paths(url, work)
        log.info(
            "download result url=%r source=%s file_count=%s files=%r",
            url,
            download_source,
            len(paths),
            [p.name for p in paths[:10]],
        )
        if fetch_meta:
            ft = fetch_meta.get("title")
            if isinstance(ft, str) and ft.strip():
                title = ft.strip()
            fd = fetch_meta.get("description")
            if isinstance(fd, str):
                description = fd.strip()
            fraw = fetch_meta.get("duration")
            if fraw is not None:
                try:
                    duration = float(fraw)
                except (TypeError, ValueError):
                    pass
            pr = fetch_meta.get("pipeline_route")
            if pr in ("carousel", "single"):
                route = pr
            elif len(paths) > 1:
                route = "carousel"

        if duration is not None and duration > MAX_VIDEO_SECONDS:
            mins = int(MAX_VIDEO_SECONDS // 60)
            raise ValueError(
                f"Video is too long ({int(duration // 60)}m {int(duration % 60)}s). "
                f"Maximum allowed length is {mins} minutes."
            )

        image_paths = sorted(p for p in paths if is_image_media_path(p))
        video_paths = sorted(p for p in paths if not is_image_media_path(p))
        log.info(
            "media split url=%r image_count=%s video_count=%s",
            url,
            len(image_paths),
            len(video_paths),
        )

        if image_paths:
            with log_step(log, "ocr", url=url, image_count=len(image_paths)):
                ocr_text = image_ocr.ocr_images_with_gemini(image_paths)
            log.info("ocr result url=%r ocr_chars=%s", url, len(ocr_text))

        if video_paths:
            try:
                with log_step(log, "extract_audio", url=url, video=video_paths[0].name):
                    mp3_path = extract_audio_mp3(video_paths[0], work)
                with log_step(log, "whisper", url=url, mp3=mp3_path.name):
                    whisper_out = transcribe_audio_mp3(mp3_path)
                transcript_text = whisper_out.get("text") or ""
                if transcript_text is None:
                    transcript_text = ""
                segments = whisper_out.get("segments")
                log.info(
                    "whisper result url=%r transcript_chars=%s segment_count=%s",
                    url,
                    len(transcript_text),
                    len(segments) if isinstance(segments, list) else 0,
                )
            except Exception as e:
                log.warning(
                    "audio pipeline failed url=%r error_type=%s error=%s",
                    url,
                    type(e).__name__,
                    e,
                )

    if not transcript_text.strip() and not ocr_text.strip():
        log.error(
            "no usable text url=%r transcript_chars=%s ocr_chars=%s",
            url,
            len(transcript_text),
            len(ocr_text),
        )
        raise RuntimeError(
            "No usable transcript or OCR text: no speech/audio track on downloaded media "
            "and image OCR produced nothing (check GEMINI_API_KEY for OCR)."
        )

    with log_step(log, "place_extraction", url=url):
        agent = place_agent.extract_places_from_transcript(
            transcript=transcript_text,
            video_title=title,
            video_description=description,
            source_platform=platform,
            ocr_text=ocr_text,
        )
    log.info(
        "place_extraction result url=%r place_count=%s agent_error=%r",
        url,
        len(agent.get("places") or []),
        agent.get("agent_error"),
    )

    out: dict = {
        "title": title,
        "description": description,
        "platform": platform,
        "pipeline_route": route,
        "download_source": download_source,
        "text": transcript_text,
        "segments": segments,
        "ocr_text": ocr_text,
        "places": agent.get("places") or [],
        "agent_summary": agent.get("agent_summary") or "",
    }
    if agent.get("agent_error"):
        out["agent_error"] = agent["agent_error"]

    if cache_pair:
        cache_set(cache_pair[0], cache_pair[1], out)
    out["cached"] = False
    log.info(
        "transcribe_from_url done url=%r platform=%r download_source=%s place_count=%s cached=false",
        url,
        platform,
        out.get("download_source"),
        len(out.get("places") or []),
    )
    return out


def get_video_metadata(url: str) -> dict:
    """Metadata helper: RapidAPI for Instagram, yt-dlp probe for TikTok."""
    meta, _route = media_fetch.probe_media_safe(url)
    return meta

