"""
TikTok media download routing:
  - /photo/ slideshows -> gallery-dl (yt-dlp does not support these URLs)
  - regular videos -> yt-dlp, with gallery-dl fallback
"""

from __future__ import annotations

import os
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Literal
from urllib.parse import urlparse

import requests
import ytdlp_fetch
from social_download import MEDIA_DOWNLOAD_SUFFIXES, hostname_from_url
from worker_log import get_logger, log_step

log = get_logger(__name__)

_cookies_tmp_path: str | None = None

_RESOLVE_TIMEOUT = 30
_DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
}


def resolve_tiktok_url(url: str) -> str:
    raw = url.strip()
    if not raw:
        return raw
    try:
        res = requests.get(
            raw,
            allow_redirects=True,
            timeout=_RESOLVE_TIMEOUT,
            headers=_DEFAULT_HEADERS,
        )
        resolved = (res.url or raw).strip()
        if resolved != raw:
            log.info("tiktok resolve url=%r resolved=%r", raw, resolved)
        return resolved
    except requests.RequestException as ex:
        log.warning(
            "tiktok resolve failed url=%r error_type=%s error=%s",
            raw,
            type(ex).__name__,
            ex,
        )
        return raw


def is_tiktok_photo_post(url: str) -> bool:
    path = urlparse(url.strip()).path.lower()
    return "/photo/" in path


def photo_to_video_url(url: str) -> str:
    return url.replace("/photo/", "/video/")


def _get_cookies_path() -> str | None:
    global _cookies_tmp_path

    explicit = (
        os.environ.get("GALLERY_DL_COOKIES_FILE", "").strip()
        or os.environ.get("YDL_COOKIES_FILE", "").strip()
    )
    if explicit:
        return explicit

    raw = (os.environ.get("GALLERY_DL_COOKIES") or os.environ.get("YDL_COOKIES") or "").strip()
    if not raw:
        return None

    if _cookies_tmp_path and os.path.exists(_cookies_tmp_path):
        return _cookies_tmp_path

    fd, path = tempfile.mkstemp(suffix=".txt", prefix="gallery_cookies_")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(raw.encode("utf-8"))
    except Exception:
        os.unlink(path)
        raise
    _cookies_tmp_path = path
    return path


def _collect_gallery_dl_files(root: Path) -> list[Path]:
    if not root.is_dir():
        return []
    files = [
        path
        for path in root.rglob("*")
        if path.is_file() and path.suffix.lower() in MEDIA_DOWNLOAD_SUFFIXES
    ]
    return sorted(files)


def run_gallery_dl(url: str, dest_dir: Path) -> list[Path]:
    if os.environ.get("GALLERY_DL_DISABLE", "").strip().lower() in ("1", "true", "yes"):
        log.info("gallery-dl skipped (GALLERY_DL_DISABLE) url=%r", url)
        return []

    dest_dir.mkdir(parents=True, exist_ok=True)
    cookie = _get_cookies_path()
    timeout = int(os.environ.get("GALLERY_DL_TIMEOUT", "420"))
    cmd = ["gallery-dl", "-q"]
    if cookie:
        cmd.extend(["--cookies", cookie])
    cmd.extend(["--dest", str(dest_dir), url])
    log.info(
        "gallery-dl start url=%r dest=%r timeout_s=%s cookies=%s",
        url,
        dest_dir,
        timeout,
        "yes" if cookie else "no",
    )
    try:
        subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=timeout)
        paths = _collect_gallery_dl_files(dest_dir)
        log.info(
            "gallery-dl done url=%r file_count=%s files=%r",
            url,
            len(paths),
            [path.name for path in paths[:12]],
        )
        return paths
    except subprocess.TimeoutExpired as ex:
        log.warning(
            "gallery-dl timeout url=%r timeout_s=%s partial_stdout=%r partial_stderr=%r",
            url,
            timeout,
            (ex.stdout or "")[:500],
            (ex.stderr or "")[:500],
        )
        return _collect_gallery_dl_files(dest_dir)
    except subprocess.CalledProcessError as ex:
        log.warning(
            "gallery-dl process error url=%r rc=%s stdout=%r stderr=%r",
            url,
            ex.returncode,
            (ex.stdout or "")[:500],
            (ex.stderr or "")[:500],
        )
        return _collect_gallery_dl_files(dest_dir)
    except (FileNotFoundError, OSError) as ex:
        log.warning(
            "gallery-dl launch error url=%r error_type=%s error=%s",
            url,
            type(ex).__name__,
            ex,
        )
        return []


def _meta_for_photo_post(resolved_url: str) -> dict[str, Any]:
    video_url = photo_to_video_url(resolved_url)
    try:
        meta, _route = ytdlp_fetch.probe_media(video_url)
        meta["pipeline_route"] = "carousel"
        return meta
    except Exception as ex:
        log.warning(
            "tiktok photo metadata probe failed url=%r error_type=%s error=%s",
            resolved_url,
            type(ex).__name__,
            ex,
        )
        return {
            "title": "Unknown title",
            "description": "",
            "duration": None,
            "pipeline_route": "carousel",
        }


def _download_photo_post(resolved_url: str, work: Path) -> tuple[list[Path], dict[str, Any]]:
    meta = _meta_for_photo_post(resolved_url)
    gd_root = work / "gallery_dl_out"
    with log_step(log, "gallery_dl", url=resolved_url):
        paths = run_gallery_dl(resolved_url, gd_root)

    if not paths:
        raise RuntimeError(
            "TikTok photo carousel: gallery-dl returned no media files. "
            "yt-dlp cannot download /photo/ URLs."
        )

    has_audio = any(path.suffix.lower() in {".mp3", ".m4a", ".aac", ".opus", ".ogg", ".wav", ".flac"} for path in paths)
    if not has_audio:
        video_url = photo_to_video_url(resolved_url)
        audio_root = work / "ytdlp_audio"
        try:
            with log_step(log, "ytdlp_audio", url=video_url):
                audio_paths, audio_meta = ytdlp_fetch.download_media(
                    video_url,
                    audio_root,
                    fmt=os.environ.get("YDL_PHOTO_AUDIO_FORMAT", "bestaudio/best"),
                )
            if audio_paths:
                paths = sorted(set(paths + audio_paths))
            for key in ("title", "description", "duration"):
                value = audio_meta.get(key)
                if value and not meta.get(key):
                    meta[key] = value
        except Exception as ex:
            log.warning(
                "tiktok photo audio download failed url=%r error_type=%s error=%s",
                video_url,
                type(ex).__name__,
                ex,
            )

    meta["pipeline_route"] = "carousel"
    return paths, meta


def probe_tiktok_post(url: str) -> tuple[dict[str, Any], Literal["carousel", "single"]]:
    ytdlp_fetch.assert_tiktok_url(url)
    resolved = resolve_tiktok_url(url)
    if is_tiktok_photo_post(resolved):
        meta = _meta_for_photo_post(resolved)
        route = meta.pop("pipeline_route", "carousel")
        return meta, route if route in ("carousel", "single") else "carousel"
    return ytdlp_fetch.probe_media(resolved)


def download_tiktok_media(url: str, work: Path) -> tuple[list[Path], str, dict[str, Any] | None]:
    ytdlp_fetch.assert_tiktok_url(url)
    resolved = resolve_tiktok_url(url)
    log.info(
        "download start url=%r resolved=%r host=%r photo=%s",
        url,
        resolved,
        hostname_from_url(resolved),
        is_tiktok_photo_post(resolved),
    )

    if is_tiktok_photo_post(resolved):
        paths, meta = _download_photo_post(resolved, work)
        log.info("download success source=gallery_dl url=%r file_count=%s", url, len(paths))
        return paths, "gallery_dl", meta

    details: list[str] = []
    try:
        with log_step(log, "ytdlp_download", url=resolved):
            paths, meta = ytdlp_fetch.download_media(resolved, work)
        log.info("download success source=ytdlp url=%r file_count=%s", url, len(paths))
        return paths, "ytdlp", meta
    except Exception as ex:
        details.append(f"yt-dlp: {type(ex).__name__}: {ex}")
        log.warning("yt-dlp failed url=%r error=%s; trying gallery-dl fallback", url, ex)

    gd_root = work / "gallery_dl_out"
    with log_step(log, "gallery_dl", url=resolved):
        paths = run_gallery_dl(resolved, gd_root)
    if paths:
        log.info("download success source=gallery_dl url=%r file_count=%s", url, len(paths))
        return paths, "gallery_dl", None

    details.append("gallery-dl: no media files (process error, timeout, or extractor produced nothing)")
    log.error("download failed url=%r details=%s", url, details)
    raise RuntimeError(
        "Could not download TikTok media after yt-dlp and gallery-dl. " + " ".join(details)
    )
