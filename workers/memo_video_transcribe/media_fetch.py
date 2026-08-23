"""
Media download: gallery-dl first; Instagram mobile API; then RapidAPI looter.

Probe (metadata + carousel vs single) still uses yt-dlp via social_download.probe_media.
"""

from __future__ import annotations

import os
import subprocess
from pathlib import Path
from typing import Any, Literal

import instagram_carousel
import rapidapi_ig_looter
from yt_dlp.utils import DownloadError

try:
    from yt_dlp.utils import ExtractorError as _YtdlpExtractorError
except ImportError:  # pragma: no cover
    _YtdlpExtractorError = None

from social_download import hostname_from_url, probe_media

_GALLERY_DL_MEDIA_SUFFIXES = frozenset(
    {
        ".jpg",
        ".jpeg",
        ".png",
        ".webp",
        ".gif",
        ".mp4",
        ".webm",
        ".m4v",
        ".mov",
        ".mkv",
    }
)


def ytdlp_failure_allows_gallery_fallback(exc: BaseException) -> bool:
    if isinstance(exc, FileNotFoundError):
        return True
    if _YtdlpExtractorError is not None and isinstance(exc, _YtdlpExtractorError):
        return True

    needles = (
        "no video formats found",
        "no video formats",
        "unsupported url",
        "there is no video in this post",
        "requested format is not available",
        "unable to download video",
        "login required",
        "private video",
        "video unavailable",
        "redirect loop",
        "http error 302",
    )
    msg = str(exc).lower()
    if any(n in msg for n in needles):
        return True
    return isinstance(exc, DownloadError)


def probe_media_safe(url: str) -> tuple[dict[str, Any], Literal["carousel", "single"]]:
    try:
        return probe_media(url)
    except Exception as e:
        if not ytdlp_failure_allows_gallery_fallback(e):
            raise
        return (
            {"title": "Unknown title", "description": "", "duration": None},
            "single",
        )


def _get_cookies_path() -> str | None:
    from social_download import _get_cookies_file

    return _get_cookies_file()


def _collect_gallery_dl_files(root: Path) -> list[Path]:
    if not root.is_dir():
        return []
    files = [
        p
        for p in root.rglob("*")
        if p.is_file() and p.suffix.lower() in _GALLERY_DL_MEDIA_SUFFIXES
    ]
    return sorted(files)


def run_gallery_dl(url: str, dest_dir: Path) -> list[Path]:
    if os.environ.get("GALLERY_DL_DISABLE", "").strip().lower() in ("1", "true", "yes"):
        return []
    dest_dir.mkdir(parents=True, exist_ok=True)
    cookie = _get_cookies_path()
    timeout = int(os.environ.get("GALLERY_DL_TIMEOUT", "420"))
    cmd = ["gallery-dl", "-q"]
    if cookie:
        cmd.extend(["--cookies", cookie])
    cmd.extend(["--dest", str(dest_dir), url])
    try:
        subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=timeout)
    except (
        subprocess.CalledProcessError,
        subprocess.TimeoutExpired,
        FileNotFoundError,
        OSError,
    ):
        return []
    return _collect_gallery_dl_files(dest_dir)


def _download_media_paths(
    url: str, work: Path
) -> tuple[list[Path], str, dict[str, Any] | None]:
    details: list[str] = []
    gd_root = work / "gallery_dl_out"
    paths = run_gallery_dl(url, gd_root)
    if paths:
        return paths, "gallery_dl", None
    details.append(
        "gallery-dl: no media files (process error, timeout, or extractor produced nothing)"
    )

    if "instagram.com" not in hostname_from_url(url):
        details.append(
            f"Instagram fallbacks skipped (host {hostname_from_url(url)!r})"
        )
        raise RuntimeError(
            "Could not download media after gallery-dl. " + " ".join(details)
        )

    api_paths = instagram_carousel.download_instagram_carousel_via_api(url, work)
    if api_paths:
        return api_paths, "instagram_api", None
    details.append(
        "instagram_api: no media (cookies missing/expired, checkpoint, or API non-OK)"
    )

    looter_paths, looter_reason, looter_meta = (
        rapidapi_ig_looter.download_instagram_via_rapidapi_looter(url, work)
    )
    if looter_paths:
        return looter_paths, "rapidapi_looter", looter_meta
    details.append(looter_reason or "rapidapi_looter: failed (no reason)")

    raise RuntimeError(
        "Could not download media after gallery-dl, Instagram API, and RapidAPI looter. "
        + " ".join(details)
    )


def fetch_media_paths(
    url: str, work: Path, route: Literal["carousel", "single"]
) -> tuple[list[Path], str, dict[str, Any] | None]:
    """Download media without yt-dlp. route is kept for pipeline compatibility (probe only)."""
    del route
    return _download_media_paths(url, work)
