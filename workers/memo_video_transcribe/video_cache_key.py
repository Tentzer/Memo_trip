"""
Normalize social URLs for video_cache lookups so http/https, trailing slashes,
and query strings still hit the same row.

Returns (platform, media_code):
  platform: instagram | tiktok | facebook
  media_code: stable id / shortcode from the path or ?v=

TikTok vt/vm or /t/ short links store media_code as "short:<slug>" (lowercase slug).

Unrecognized patterns return None (cache is skipped).
"""

from __future__ import annotations

import re
from urllib.parse import parse_qs, urlparse


def parse_video_cache_key(url: str) -> tuple[str, str] | None:
    raw = (url or "").strip()
    if not raw:
        return None
    if "://" not in raw:
        raw = f"https://{raw}"
    parsed = urlparse(raw)
    host = (parsed.hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]
    path = parsed.path or ""
    q = parse_qs(parsed.query)

    if "tiktok.com" in host:
        m = re.search(r"/video/(\d+)", path)
        if m:
            return ("tiktok", m.group(1))
        m = re.search(r"/photo/(\d+)", path)
        if m:
            return ("tiktok", m.group(1))
        if host in ("vt.tiktok.com", "vm.tiktok.com"):
            seg = path.strip("/").split("/")[0]
            if seg and re.fullmatch(r"[A-Za-z0-9_-]{6,32}", seg):
                return ("tiktok", f"short:{seg.lower()}")
        m = re.search(r"/t/([A-Za-z0-9_-]{6,32})", path)
        if m:
            return ("tiktok", f"short:{m.group(1).lower()}")
        return None

    if host.endswith("instagram.com"):
        m = re.search(r"/(?:p|reel|reels|tv)/([^/?#]+)", path)
        if m:
            return ("instagram", m.group(1).lower())
        return None

    if host == "fb.watch":
        seg = path.strip("/").split("/")[0]
        if seg:
            return ("facebook", seg.lower())
        return None

    if host.endswith("facebook.com") or host == "facebook.com":
        for key in ("v", "video_id"):
            vals = q.get(key)
            if vals and vals[0].isdigit():
                return ("facebook", vals[0])
        m = re.search(r"/videos/(\d+)", path)
        if m:
            return ("facebook", m.group(1))
        m = re.search(r"/reel/(\d+)", path)
        if m:
            return ("facebook", m.group(1))
        m = re.search(r"/watch/live/(\d+)", path)
        if m:
            return ("facebook", m.group(1))
        return None

    return None
