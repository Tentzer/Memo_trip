"""
Social URL -> transcript and/or image OCR -> Gemini place extraction (TikTok / Instagram / Facebook).

Orchestration:
  - yt-dlp probes playlist vs single (carousel vs single URL); probe may fall back to defaults on known extract errors.
  - Download: gallery-dl; for instagram.com then Instagram mobile API and RapidAPI looter (media_fetch.py). yt-dlp is probe-only.
  - Images: Gemini vision OCR (image_ocr.py).
  - Video/audio files: ffmpeg/Replicate Whisper when an audio track exists.
  - Gemini merges transcript + OCR + caption into structured places.

Supabase video_cache is keyed by (platform, media_code) derived from the URL (video_cache_key.py), not the raw URL string.

Requires: ffmpeg, REPLICATE_API_TOKEN (when transcribing audio), GEMINI_API_KEY (optional for places/OCR).

Local test:
  set REPLICATE_API_TOKEN=...
  set GEMINI_API_KEY=...
  python -c \"import json; from pipeline import transcribe_from_url; print(json.dumps(transcribe_from_url('https://www.tiktok.com/@user/video/123'), indent=2)[:1200])\"
"""

from __future__ import annotations

import io
import os
import tempfile
from pathlib import Path

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


def cache_get(platform: str, media_code: str) -> dict | None:
    import requests

    headers = _cache_headers()
    endpoint = _cache_endpoint()
    if not headers or not endpoint:
        return None
    try:
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
                return rows[0]["result"]
    except Exception:
        pass
    return None


def cache_set(platform: str, media_code: str, result: dict) -> None:
    import requests

    headers = _cache_headers()
    endpoint = _cache_endpoint()
    if not headers or not endpoint:
        return
    try:
        requests.post(
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
    except Exception:
        pass


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
    buf = io.BytesIO(raw)
    buf.name = "audio.mp3"
    return replicate.run(_transcribe_model(), input={"audio": buf})


def transcribe_from_url(url: str) -> dict:
    """
    Download media, run OCR on images and/or Whisper on audio, then Gemini place extraction.

    Checks Supabase video_cache first when URL parses to (platform, media_code).

    Response adds:
      pipeline_route: \"carousel\" | \"single\" (yt-dlp playlist heuristic)
      download_source: \"gallery_dl\" | \"instagram_api\" | \"rapidapi_looter\"
      ocr_text: concatenated OCR when images were processed (may be empty)
    """
    url = url.strip()
    assert_allowed_social_url(url)

    cache_pair = video_cache_key.parse_video_cache_key(url)

    cached = cache_get(cache_pair[0], cache_pair[1]) if cache_pair else None
    if cached is not None:
        cached["cached"] = True
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

    meta, route = media_fetch.probe_media_safe(url)
    title = str(meta.get("title") or "").strip() or "Unknown title"
    description = str(meta.get("description") or "").strip()

    duration = meta.get("duration")

    transcript_text = ""
    segments = None
    ocr_text = ""

    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        paths, download_source, fetch_meta = media_fetch.fetch_media_paths(
            url, work, route
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

        if duration is not None and duration > MAX_VIDEO_SECONDS:
            mins = int(MAX_VIDEO_SECONDS // 60)
            raise ValueError(
                f"Video is too long ({int(duration // 60)}m {int(duration % 60)}s). "
                f"Maximum allowed length is {mins} minutes."
            )

        image_paths = sorted(p for p in paths if is_image_media_path(p))
        video_paths = sorted(p for p in paths if not is_image_media_path(p))

        if image_paths:
            ocr_text = image_ocr.ocr_images_with_gemini(image_paths)

        if video_paths:
            try:
                mp3_path = extract_audio_mp3(video_paths[0], work)
                whisper_out = transcribe_audio_mp3(mp3_path)
                transcript_text = whisper_out.get("text") or ""
                if transcript_text is None:
                    transcript_text = ""
                segments = whisper_out.get("segments")
            except Exception:
                pass

    if not transcript_text.strip() and not ocr_text.strip():
        raise RuntimeError(
            "No usable transcript or OCR text: no speech/audio track on downloaded media "
            "and image OCR produced nothing (check GEMINI_API_KEY for OCR)."
        )

    agent = place_agent.extract_places_from_transcript(
        transcript=transcript_text,
        video_title=title,
        video_description=description,
        source_platform=platform,
        ocr_text=ocr_text,
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
    return out


def get_video_metadata(url: str) -> dict:
    """Backward-compatible metadata helper using full yt-dlp probe (with safe fallback)."""
    meta, _route = media_fetch.probe_media_safe(url)
    return meta

