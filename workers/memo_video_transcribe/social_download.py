"""
URL validation and media path helpers for the social video import pipeline.
"""

from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import urlparse

MAX_VIDEO_SECONDS = int(os.environ.get("MAX_VIDEO_SECONDS", "300"))

_MEDIA_IMAGE_SUFFIXES = frozenset({".jpg", ".jpeg", ".png", ".webp", ".gif"})
_MEDIA_AUDIO_VIDEO_SUFFIXES = frozenset(
    {".mp4", ".webm", ".m4v", ".mov", ".mkv", ".mp3", ".m4a", ".aac", ".opus", ".ogg", ".wav", ".flac"}
)
MEDIA_DOWNLOAD_SUFFIXES = _MEDIA_IMAGE_SUFFIXES | _MEDIA_AUDIO_VIDEO_SUFFIXES


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


def is_image_media_path(path: Path) -> bool:
    return path.suffix.lower() in _MEDIA_IMAGE_SUFFIXES
