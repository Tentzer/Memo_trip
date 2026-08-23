"""
RapidAPI instagram-looter2 (GET /post-dl): last-resort Instagram download without browser cookies.

Requires IG_LOOTER_RAPIDAPI_KEY. Optional IG_LOOTER_RAPIDAPI_HOST (default instagram-looter2.p.rapidapi.com).
"""

from __future__ import annotations

import os
import uuid
from pathlib import Path
from typing import Any

import requests

from social_download import hostname_from_url

DEFAULT_HOST = "instagram-looter2.p.rapidapi.com"
POST_DL_PATH = "/post-dl"
TIMEOUT_API = 90
TIMEOUT_DOWNLOAD = 300
_CHUNK = 256 * 1024


def _rapidapi_key() -> str:
    for name in (
        "IG_LOOTER_RAPIDAPI_KEY",
        "RAPIDAPI_KEY",
        "X_RAPIDAPI_KEY",
    ):
        v = (os.environ.get(name) or "").strip()
        if v:
            return v
    return ""


def _rapidapi_host() -> str:
    h = (os.environ.get("IG_LOOTER_RAPIDAPI_HOST") or "").strip()
    return h if h else DEFAULT_HOST


def _disabled() -> bool:
    return os.environ.get("IG_LOOTER_RAPIDAPI_DISABLE", "").strip().lower() in (
        "1",
        "true",
        "yes",
    )


def _suffix_for_media(item: dict, link: str) -> str:
    mtype = str(item.get("type") or "").lower()
    if mtype == "video":
        return ".mp4"
    if mtype == "image":
        low = link.lower()
        if ".png" in low:
            return ".png"
        if ".webp" in low:
            return ".webp"
        return ".jpg"
    low = link.lower()
    return ".mp4" if ".mp4" in low else ".jpg"


def _truncate(s: str, n: int) -> str:
    s = s.strip()
    return s if len(s) <= n else s[: n - 3] + "..."


def meta_from_looter_data(data: dict) -> dict[str, Any]:
    """Map instagram-looter2 post-dl `data` to pipeline metadata (title, description, optional duration)."""
    max_desc = int(os.environ.get("VIDEO_DESCRIPTION_MAX_CHARS", "4000"))
    caption = str(data.get("caption") or "").strip()
    if len(caption) > max_desc:
        caption = caption[:max_desc] + "\n...[truncated]"

    full_name = str(data.get("full_name") or "").strip()
    username = str(data.get("username") or "").strip()
    if full_name and username:
        title = f"{full_name} (@{username})"
    elif full_name:
        title = full_name
    elif username:
        title = f"@{username}"
    else:
        title = "Instagram"

    out: dict[str, Any] = {"title": title, "description": caption}
    raw_dur = data.get("video_duration")
    if raw_dur is None and isinstance(data.get("medias"), list):
        first = next((m for m in data["medias"] if isinstance(m, dict)), None)
        if first is not None:
            raw_dur = first.get("duration") or first.get("video_duration")
    if raw_dur is not None:
        try:
            out["duration"] = float(raw_dur)
        except (TypeError, ValueError):
            pass
    return out


def download_instagram_via_rapidapi_looter(
    url: str, output_dir: Path
) -> tuple[list[Path] | None, str, dict[str, Any] | None]:
    """
    Call post-dl, download each media link to disk.

    On success returns (paths, "", meta). On failure returns (None, reason, None).
    """
    if _disabled():
        return None, "rapidapi_looter: disabled (IG_LOOTER_RAPIDAPI_DISABLE)", None
    if not _rapidapi_key():
        return (
            None,
            "rapidapi_looter: no API key in env. "
            "Set IG_LOOTER_RAPIDAPI_KEY or RAPIDAPI_KEY inside the Modal secret named RAPIDAPI_KEY "
            "(RapidAPI integration) and redeploy, or add one of those variables to the instagram-cookies secret.",
            None,
        )
    if "instagram.com" not in hostname_from_url(url):
        return None, "rapidapi_looter: not an instagram.com URL", None

    host = _rapidapi_host()
    api_url = f"https://{host}{POST_DL_PATH}"
    headers = {
        "x-rapidapi-key": _rapidapi_key(),
        "x-rapidapi-host": host,
    }
    try:
        res = requests.get(
            api_url,
            params={"url": url},
            headers=headers,
            timeout=TIMEOUT_API,
        )
        if not res.ok:
            return None, _truncate(
                f"rapidapi_looter: post-dl HTTP {res.status_code} {res.text or ''}",
                400,
            ), None
        payload = res.json()
    except requests.RequestException as ex:
        return None, _truncate(f"rapidapi_looter: request error {type(ex).__name__}: {ex}", 400), None
    except ValueError as ex:
        return None, _truncate(f"rapidapi_looter: invalid JSON from API: {ex}", 400), None

    if not isinstance(payload, dict):
        return None, "rapidapi_looter: API response is not a JSON object", None

    st = payload.get("status")
    if st is not True and st != "true" and st != 1:
        return None, _truncate(f"rapidapi_looter: API status not ok: {payload!r}", 450), None

    data = payload.get("data")
    if not isinstance(data, dict):
        return None, "rapidapi_looter: missing data object in API response", None
    medias = data.get("medias")
    if not isinstance(medias, list) or not medias:
        return None, "rapidapi_looter: data.medias empty or missing", None

    output_dir.mkdir(parents=True, exist_ok=True)
    stem = f"ig_looter_{uuid.uuid4().hex[:10]}"
    dl_headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        ),
        "Accept": "*/*",
        "Referer": "https://www.instagram.com/",
    }
    paths: list[Path] = []
    failed_http: list[int] = []

    for idx, raw in enumerate(medias, start=1):
        if not isinstance(raw, dict):
            continue
        link = raw.get("link")
        if not isinstance(link, str) or not link.strip():
            continue
        link = link.strip()
        suffix = _suffix_for_media(raw, link)
        out = output_dir / f"{stem}_{idx:02d}{suffix}"
        try:
            dl = requests.get(
                link,
                headers=dl_headers,
                timeout=TIMEOUT_DOWNLOAD,
                stream=True,
            )
            if not dl.ok:
                failed_http.append(dl.status_code)
                continue
            with open(out, "wb") as f:
                for chunk in dl.iter_content(chunk_size=_CHUNK):
                    if chunk:
                        f.write(chunk)
            if out.is_file() and out.stat().st_size > 0:
                paths.append(out)
            elif out.exists():
                out.unlink(missing_ok=True)
        except OSError:
            if out.exists():
                out.unlink(missing_ok=True)

    if paths:
        return paths, "", meta_from_looter_data(data)
    extra = f" (CDN HTTP codes: {failed_http})" if failed_http else ""
    return (
        None,
        "rapidapi_looter: API returned medias but every CDN download failed or was empty"
        + extra,
        None,
    )
