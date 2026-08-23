"""
yt-dlp helpers: probe playlist vs single item and metadata (download=False only).

Downloads use gallery-dl / Instagram API / RapidAPI looter in media_fetch.py.
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path
from typing import Any, Literal
from urllib.parse import urlparse

import yt_dlp

MAX_VIDEO_SECONDS = int(os.environ.get("MAX_VIDEO_SECONDS", "300"))

_MEDIA_IMAGE_SUFFIXES = frozenset({".jpg", ".jpeg", ".png", ".webp", ".gif"})

_cookies_tmp_path: str | None = None


def _get_cookies_file() -> str | None:
    """
    Netscape cookies.txt path for yt-dlp and Instagram API fallback.

    Priority:
      1. YDL_COOKIES_FILE  – explicit path
      2. YDL_COOKIES_B64   – base64-encoded cookies.txt
      3. YDL_COOKIES       – raw cookies.txt body (Modal secret pattern)
    """
    global _cookies_tmp_path

    explicit = os.environ.get("YDL_COOKIES_FILE", "").strip()
    if explicit:
        return explicit

    b64 = os.environ.get("YDL_COOKIES_B64", "").strip()
    if b64:
        if _cookies_tmp_path and os.path.exists(_cookies_tmp_path):
            return _cookies_tmp_path

        import base64 as _b64

        raw_bytes = _b64.b64decode(b64)

        fd, path = tempfile.mkstemp(suffix=".txt", prefix="ydl_cookies_")
        try:
            with os.fdopen(fd, "wb") as f:
                f.write(raw_bytes)
        except Exception:
            os.unlink(path)
            raise
        _cookies_tmp_path = path
        return path

    raw = os.environ.get("YDL_COOKIES", "").strip()
    if raw:
        if _cookies_tmp_path and os.path.exists(_cookies_tmp_path):
            return _cookies_tmp_path

        fd, path = tempfile.mkstemp(suffix=".txt", prefix="ydl_cookies_raw_")
        try:
            with os.fdopen(fd, "wb") as f:
                f.write(raw.encode("utf-8"))
        except Exception:
            os.unlink(path)
            raise
        _cookies_tmp_path = path
        return path

    return None


def hostname_from_url(url: str) -> str:
    parsed = urlparse(url.strip())
    host = (parsed.hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]
    return host


def is_allowed_social_url(url: str) -> bool:
    host = hostname_from_url(url)
    if not host:
        return False
    if "tiktok.com" in host or host.endswith(".tiktok.com"):
        return True
    if host == "instagram.com" or host.endswith(".instagram.com"):
        return True
    if host in ("facebook.com", "m.facebook.com", "fb.watch", "l.facebook.com"):
        return True
    if host.endswith(".facebook.com"):
        return True
    return False


def assert_allowed_social_url(url: str) -> None:
    if not url or not url.strip():
        raise ValueError("url is empty")
    if not is_allowed_social_url(url):
        raise ValueError(
            "Only TikTok, Instagram, and Facebook URLs are supported (not YouTube or other hosts)."
        )


def _ydl_base_opts() -> dict[str, Any]:
    opts: dict[str, Any] = {"quiet": True}
    cookiefile = _get_cookies_file()
    if cookiefile:
        opts["cookiefile"] = cookiefile
    return opts


def extract_ytdlp_info(url: str, *, noplaylist: bool) -> dict[str, Any]:
    opts = {**_ydl_base_opts(), "noplaylist": noplaylist}
    with yt_dlp.YoutubeDL(opts) as ydl:
        return ydl.extract_info(url, download=False)


def classify_media_route(info: dict[str, Any]) -> Literal["carousel", "single"]:
    if info.get("_type") == "playlist":
        entries = [e for e in (info.get("entries") or []) if isinstance(e, dict)]
        if len(entries) > 1:
            return "carousel"
    return "single"


def extract_root_metadata(info: dict[str, Any]) -> dict[str, Any]:
    max_desc = int(os.environ.get("VIDEO_DESCRIPTION_MAX_CHARS", "4000"))
    title = str(info.get("title") or "").strip() or "Unknown title"

    raw = (
        info.get("description")
        or info.get("summary")
        or info.get("alt_title")
        or ""
    )
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
        entries = [e for e in (info.get("entries") or []) if isinstance(e, dict)]
        cand: list[float] = []
        for e in entries:
            d = e.get("duration")
            try:
                if d is not None:
                    cand.append(float(d))
            except (TypeError, ValueError):
                continue
        if cand:
            duration = max(cand)

    return {"title": title, "description": description, "duration": duration}


def probe_media(url: str) -> tuple[dict[str, Any], Literal["carousel", "single"]]:
    """Single yt-dlp probe with noplaylist=False so carousel entries are visible."""
    info = extract_ytdlp_info(url, noplaylist=False)
    meta = extract_root_metadata(info)
    route = classify_media_route(info)
    return meta, route


def is_image_media_path(path: Path) -> bool:
    return path.suffix.lower() in _MEDIA_IMAGE_SUFFIXES
