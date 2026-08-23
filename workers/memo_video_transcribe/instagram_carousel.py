"""
Instagram carousel / multi-slide posts: fetch slide URLs via the same mobile API yt-dlp uses.

Logged-in carousel playlists often include photo slides with no yt-dlp formats
(No video formats found). This module downloads image_versions2 / video_versions
directly when cookies are available.
"""

from __future__ import annotations

import http.cookiejar
import re
import uuid
from pathlib import Path
from typing import Any

import requests

try:
    from yt_dlp.utils import decode_base_n
except ImportError:  # pragma: no cover
    try:
        from yt_dlp.utils._utils import decode_base_n
    except ImportError:
        decode_base_n = None

from social_download import _get_cookies_file, hostname_from_url

_ENCODING_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"

SHORTCODE_RE = re.compile(
    r"instagram\.com/(?:p|reel|reels)/([^/?#]+)",
    re.I,
)

_API_BASE = "https://i.instagram.com/api/v1"


def _instagram_shortcode(url: str) -> str | None:
    m = SHORTCODE_RE.search(url)
    if not m:
        return None
    code = m.group(1).strip()
    if len(code) > 28:
        code = code[:-28]
    return code


def _media_pk(shortcode: str) -> int:
    if decode_base_n is None:
        raise RuntimeError("yt-dlp decode_base_n unavailable")
    sc = shortcode
    if len(sc) > 28:
        sc = sc[:-28]
    return decode_base_n(sc, table=_ENCODING_CHARS)


def _api_headers() -> dict[str, str]:
    return {
        "User-Agent": (
            "Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) "
            "AppleWebKit/605.1.15 (KHTML, like Gecko) "
            "Version/14.0.3 Mobile/15E148 Safari/604.1"
        ),
        "X-IG-App-ID": "936619743392459",
        "X-ASBD-ID": "198387",
        "Referer": "https://www.instagram.com/",
    }


def _session_with_instagram_cookies() -> requests.Session:
    session = requests.Session()
    path = _get_cookies_file()
    if not path:
        return session
    try:
        jar = http.cookiejar.MozillaCookieJar(path)
        jar.load(ignore_discard=True, ignore_expires=True)
    except Exception:
        return session
    for c in jar:
        session.cookies.set(c.name, c.value, domain=c.domain, path=c.path or "/")
    return session


def _best_slide_url(slide: dict[str, Any]) -> str | None:
    vv = slide.get("video_versions") or []
    if vv:
        best = max(
            vv,
            key=lambda x: (int(x.get("width") or 0), int(x.get("height") or 0)),
        )
        return best.get("url")
    cands = (slide.get("image_versions2") or {}).get("candidates") or []
    if not cands:
        return None
    best = max(
        cands,
        key=lambda x: (int(x.get("width") or 0), int(x.get("height") or 0)),
    )
    return best.get("url")


def download_instagram_carousel_via_api(url: str, output_dir: Path) -> list[Path] | None:
    """
    Returns local paths for each carousel slide, or None if not Instagram / unusable response.
    Requires browser cookies for many posts (same Netscape file as yt-dlp).
    """
    host = hostname_from_url(url)
    if "instagram.com" not in host:
        return None
    if decode_base_n is None:
        return None

    shortcode = _instagram_shortcode(url)
    if not shortcode:
        return None

    try:
        pk = _media_pk(shortcode)
    except Exception:
        return None

    session = _session_with_instagram_cookies()
    endpoint = f"{_API_BASE}/media/{pk}/info/"
    try:
        res = session.get(endpoint, headers=_api_headers(), timeout=30)
        if not res.ok:
            return None
        payload = res.json()
    except Exception:
        return None

    items = payload.get("items")
    if not isinstance(items, list) or not items or not isinstance(items[0], dict):
        return None

    item = items[0]
    slides = item.get("carousel_media")
    media_list = slides if isinstance(slides, list) and slides else [item]

    output_dir.mkdir(parents=True, exist_ok=True)
    stem = f"ig_carousel_{uuid.uuid4().hex[:10]}"
    paths: list[Path] = []
    hdr_dl = {**_api_headers(), "Referer": "https://www.instagram.com/"}

    for idx, slide in enumerate(media_list, start=1):
        if not isinstance(slide, dict):
            continue
        media_url = _best_slide_url(slide)
        if not media_url:
            continue
        try:
            r = session.get(media_url, headers=hdr_dl, timeout=90)
            if not r.ok:
                continue
            ctype = (r.headers.get("Content-Type") or "").split(";")[0].strip().lower()
            if "video" in ctype or ".mp4" in media_url.split("?", 1)[0]:
                ext = ".mp4"
            elif "webp" in ctype:
                ext = ".webp"
            else:
                ext = ".jpg"
            dest = output_dir / f"{stem}_{idx:02d}{ext}"
            dest.write_bytes(r.content)
            paths.append(dest)
        except Exception:
            continue

    return paths if paths else None
