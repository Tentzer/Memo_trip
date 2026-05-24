"""
yt-dlp probe/download for TikTok only (Instagram uses RapidAPI).

TikTok photo carousels are extracted as playlists; use a broad format (`best`)
so image slides are downloaded, not skipped by video-only format selectors.
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path
from typing import Any, Literal

import yt_dlp

from social_download import MEDIA_DOWNLOAD_SUFFIXES, hostname_from_url
from worker_log import get_logger

log = get_logger(__name__)

_cookies_tmp_path: str | None = None

_DEFAULT_SINGLE_FORMAT = "bestaudio/best/bestvideo*+bestaudio/best"
_DEFAULT_CAROUSEL_FORMAT = "best"


def is_tiktok_url(url: str) -> bool:
    host = hostname_from_url(url)
    return "tiktok.com" in host or host.endswith(".tiktok.com")


def assert_tiktok_url(url: str) -> None:
    if not is_tiktok_url(url):
        raise ValueError(f"yt-dlp is configured for TikTok URLs only, not {hostname_from_url(url)!r}")


def _get_cookies_file() -> str | None:
    global _cookies_tmp_path

    explicit = os.environ.get("YDL_COOKIES_FILE", "").strip()
    if explicit:
        return explicit

    raw = os.environ.get("YDL_COOKIES", "").strip()
    if not raw:
        return None

    if _cookies_tmp_path and os.path.exists(_cookies_tmp_path):
        return _cookies_tmp_path

    fd, path = tempfile.mkstemp(suffix=".txt", prefix="ydl_cookies_")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(raw.encode("utf-8"))
    except Exception:
        os.unlink(path)
        raise
    _cookies_tmp_path = path
    return path


def _ydl_base_opts() -> dict[str, Any]:
    opts: dict[str, Any] = {"quiet": True}
    cookiefile = _get_cookies_file()
    if cookiefile:
        opts["cookiefile"] = cookiefile
    return opts


def _list_entries(info: dict[str, Any]) -> list[dict[str, Any]]:
    entries = info.get("entries")
    if isinstance(entries, list):
        return [entry for entry in entries if isinstance(entry, dict)]
    return []


def _is_carousel_info(info: dict[str, Any]) -> bool:
    entries = _list_entries(info)
    if len(entries) > 1:
        return True

    for key in ("images", "image_urls"):
        raw = info.get(key)
        if isinstance(raw, list) and len(raw) > 1:
            return True

    image_post = info.get("image_post_info") or info.get("image_post")
    if isinstance(image_post, dict):
        images = image_post.get("images") or image_post.get("image_urls")
        if isinstance(images, list) and len(images) > 1:
            return True

    return False


def _format_for_info(info: dict[str, Any]) -> str:
    if _is_carousel_info(info):
        return os.environ.get("YDL_CAROUSEL_FORMAT", _DEFAULT_CAROUSEL_FORMAT).strip() or _DEFAULT_CAROUSEL_FORMAT
    return os.environ.get("YDL_FORMAT", _DEFAULT_SINGLE_FORMAT).strip() or _DEFAULT_SINGLE_FORMAT


def _extract_root_metadata(info: dict[str, Any]) -> dict[str, Any]:
    max_desc = int(os.environ.get("VIDEO_DESCRIPTION_MAX_CHARS", "4000"))
    title = str(info.get("title") or "").strip() or "Unknown title"

    raw = info.get("description") or info.get("summary") or info.get("alt_title") or ""
    if not isinstance(raw, str):
        raw = str(raw)
    description = raw.strip()
    if len(description) > max_desc:
        description = description[:max_desc] + "\n...[truncated]"

    duration = info.get("duration")
    try:
        duration = float(duration) if duration is not None else None
    except (TypeError, ValueError):
        duration = None

    if duration is None:
        cand: list[float] = []
        for entry in _list_entries(info):
            value = entry.get("duration")
            try:
                if value is not None:
                    cand.append(float(value))
            except (TypeError, ValueError):
                continue
        if cand:
            duration = max(cand)

    route: Literal["carousel", "single"] = "carousel" if _is_carousel_info(info) else "single"

    return {
        "title": title,
        "description": description,
        "duration": duration,
        "pipeline_route": route,
    }


def _collect_downloaded_files(root: Path) -> list[Path]:
    if not root.is_dir():
        return []
    files = [
        path
        for path in root.rglob("*")
        if path.is_file() and path.suffix.lower() in MEDIA_DOWNLOAD_SUFFIXES
    ]
    return sorted(files)


def _download_with_format(url: str, work: Path, fmt: str) -> tuple[dict[str, Any], list[Path]]:
    work.mkdir(parents=True, exist_ok=True)
    outtmpl = str(work / "%(playlist_index)s_%(id)s.%(ext)s")
    opts: dict[str, Any] = {
        **_ydl_base_opts(),
        "format": fmt,
        "outtmpl": outtmpl,
        "noplaylist": False,
        "ignoreerrors": True,
    }
    log.info(
        "ytdlp download start url=%r format=%r cookies=%s",
        url,
        fmt,
        "yes" if opts.get("cookiefile") else "no",
    )
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=True)
    if not isinstance(info, dict):
        raise RuntimeError("yt-dlp returned no metadata.")
    paths = _collect_downloaded_files(work)
    log.info(
        "ytdlp download pass url=%r format=%r file_count=%s files=%r",
        url,
        fmt,
        len(paths),
        [path.name for path in paths[:12]],
    )
    return info, paths


def probe_media(url: str) -> tuple[dict[str, Any], Literal["carousel", "single"]]:
    assert_tiktok_url(url)
    log.info("ytdlp probe start url=%r host=%r", url, hostname_from_url(url))
    opts = {**_ydl_base_opts(), "noplaylist": False}
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=False)
    if not isinstance(info, dict):
        raise RuntimeError("yt-dlp probe returned no metadata.")
    meta = _extract_root_metadata(info)
    route = meta.pop("pipeline_route", "single")
    log.info(
        "ytdlp probe done url=%r route=%s entry_count=%s duration=%s title=%r",
        url,
        route,
        len(_list_entries(info)) or 1,
        meta.get("duration"),
        meta.get("title"),
    )
    return meta, route


def download_media(
    url: str,
    work: Path,
    fmt: str | None = None,
) -> tuple[list[Path], dict[str, Any]]:
    assert_tiktok_url(url)

    probe_opts = {**_ydl_base_opts(), "noplaylist": False}
    with yt_dlp.YoutubeDL(probe_opts) as ydl:
        probe_info = ydl.extract_info(url, download=False)
    if not isinstance(probe_info, dict):
        raise RuntimeError("yt-dlp probe returned no metadata.")

    fmt = _format_for_info(probe_info) if fmt is None else fmt
    is_carousel = _is_carousel_info(probe_info)
    log.info(
        "ytdlp download plan url=%r carousel=%s entry_count=%s format=%r",
        url,
        is_carousel,
        len(_list_entries(probe_info)) or 1,
        fmt,
    )

    info, paths = _download_with_format(url, work, fmt)

    if not paths and fmt != _DEFAULT_CAROUSEL_FORMAT:
        log.warning(
            "ytdlp download retry url=%r previous_format=%r retry_format=%r",
            url,
            fmt,
            _DEFAULT_CAROUSEL_FORMAT,
        )
        info, paths = _download_with_format(url, work, _DEFAULT_CAROUSEL_FORMAT)

    meta = _extract_root_metadata(info)
    log.info(
        "ytdlp download done url=%r route=%s file_count=%s",
        url,
        meta.get("pipeline_route"),
        len(paths),
    )
    if not paths:
        raise RuntimeError("yt-dlp finished but no media files were saved.")
    return paths, meta
