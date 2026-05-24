"""
Media download routing:
  - Instagram -> RapidAPI instagram-looter2
  - TikTok -> gallery-dl for /photo/ carousels; yt-dlp for videos (gallery-dl fallback)
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Literal

import rapidapi_ig_looter
import tiktok_download
import ytdlp_fetch
from social_download import hostname_from_url
from worker_log import get_logger, log_step

log = get_logger(__name__)


def _is_instagram(url: str) -> bool:
    return "instagram.com" in hostname_from_url(url)


def _is_tiktok(url: str) -> bool:
    return ytdlp_fetch.is_tiktok_url(url)


def probe_media_safe(url: str) -> tuple[dict[str, Any], Literal["carousel", "single"]]:
    if _is_instagram(url):
        meta, route, error = rapidapi_ig_looter.probe_instagram_post(url)
        if error or not meta:
            log.warning("probe_media_safe fallback url=%r error=%r", url, error)
            return (
                {"title": "Unknown title", "description": "", "duration": None},
                "single",
            )
        return meta, route

    if _is_tiktok(url):
        try:
            return tiktok_download.probe_tiktok_post(url)
        except Exception as e:
            log.warning(
                "probe_media_safe fallback url=%r error_type=%s error=%s",
                url,
                type(e).__name__,
                str(e)[:500],
            )
            return (
                {"title": "Unknown title", "description": "", "duration": None},
                "single",
            )

    raise ValueError(
        f"Unsupported host for import worker: {hostname_from_url(url)!r}. "
        "Only Instagram and TikTok URLs are supported."
    )


def fetch_media_paths(
    url: str,
    work: Path,
    route: Literal["carousel", "single"] | None = None,
) -> tuple[list[Path], str, dict[str, Any] | None]:
    del route

    if _is_instagram(url):
        log.info("download start url=%r source=rapidapi_looter", url)
        with log_step(log, "rapidapi_looter", url=url):
            paths, reason, meta = rapidapi_ig_looter.download_instagram_via_rapidapi_looter(url, work)
        if paths:
            log.info(
                "download success source=rapidapi_looter url=%r file_count=%s",
                url,
                len(paths),
            )
            return paths, "rapidapi_looter", meta
        log.error("download failed url=%r reason=%r", url, reason)
        raise RuntimeError(reason or "rapidapi_looter: download failed")

    if _is_tiktok(url):
        log.info("download start url=%r source=tiktok_router", url)
        with log_step(log, "tiktok_download", url=url):
            paths, source, meta = tiktok_download.download_tiktok_media(url, work)
        log.info("download success source=%s url=%r file_count=%s", source, url, len(paths))
        return paths, source, meta

    raise ValueError(
        f"Unsupported host for import worker: {hostname_from_url(url)!r}. "
        "Only Instagram and TikTok URLs are supported."
    )
