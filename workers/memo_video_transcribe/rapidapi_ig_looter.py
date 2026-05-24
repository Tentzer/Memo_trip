"""
RapidAPI instagram-looter2 (GET /post-dl): Instagram download and metadata.

Requires IG_LOOTER_RAPIDAPI_KEY. Optional IG_LOOTER_RAPIDAPI_HOST (default instagram-looter2.p.rapidapi.com).
"""

from __future__ import annotations

import os
import uuid
from pathlib import Path
from typing import Any, Literal

import requests

from social_download import hostname_from_url
from worker_log import get_logger

log = get_logger(__name__)

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


def _referer_for_url(url: str) -> str:
    host = hostname_from_url(url)
    if "tiktok.com" in host:
        return "https://www.tiktok.com/"
    if "facebook.com" in host or host == "fb.watch":
        return "https://www.facebook.com/"
    return "https://www.instagram.com/"


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


def meta_from_looter_data(data: dict) -> dict[str, Any]:
    """Map post-dl `data` to pipeline metadata (title, description, optional duration)."""
    max_desc = int(os.environ.get("VIDEO_DESCRIPTION_MAX_CHARS", "4000"))
    caption = str(
        data.get("caption")
        or data.get("description")
        or data.get("text")
        or data.get("title")
        or ""
    ).strip()
    if len(caption) > max_desc:
        caption = caption[:max_desc] + "\n...[truncated]"

    full_name = str(data.get("full_name") or data.get("author") or "").strip()
    username = str(data.get("username") or data.get("author_id") or "").strip()
    if full_name and username:
        title = f"{full_name} (@{username})"
    elif full_name:
        title = full_name
    elif username:
        title = f"@{username}"
    else:
        title = str(data.get("title") or "Unknown title").strip() or "Unknown title"

    out: dict[str, Any] = {"title": title, "description": caption}
    raw_dur = data.get("video_duration") or data.get("duration")
    if raw_dur is None and isinstance(data.get("medias"), list):
        first = next((m for m in data["medias"] if isinstance(m, dict)), None)
        if first is not None:
            raw_dur = first.get("duration") or first.get("video_duration")
    if raw_dur is not None:
        try:
            out["duration"] = float(raw_dur)
        except (TypeError, ValueError):
            pass
    out["pipeline_route"] = _pipeline_route_from_data(data)
    return out


def _truncate(s: str, n: int) -> str:
    s = s.strip()
    return s if len(s) <= n else s[: n - 3] + "..."


def _pipeline_route_from_data(data: dict) -> Literal["carousel", "single"]:
    medias = data.get("medias")
    if isinstance(medias, list) and len(medias) > 1:
        return "carousel"
    return "single"


def _call_post_dl_api(url: str) -> tuple[dict | None, str]:
    if _disabled():
        return None, "rapidapi_looter: disabled (IG_LOOTER_RAPIDAPI_DISABLE)"
    if not _rapidapi_key():
        return (
            None,
            "rapidapi_looter: no API key in env. "
            "Set IG_LOOTER_RAPIDAPI_KEY or RAPIDAPI_KEY inside the Modal secret named RAPIDAPI_KEY "
            "and redeploy.",
        )
    if "instagram.com" not in hostname_from_url(url):
        return None, "rapidapi_looter: not an instagram.com URL"

    host = _rapidapi_host()
    api_url = f"https://{host}{POST_DL_PATH}"
    headers = {
        "x-rapidapi-key": _rapidapi_key(),
        "x-rapidapi-host": host,
    }
    log.info("rapidapi_looter post-dl start url=%r host=%r", url, host)
    try:
        res = requests.get(
            api_url,
            params={"url": url},
            headers=headers,
            timeout=TIMEOUT_API,
        )
        if not res.ok:
            log.warning(
                "rapidapi_looter post-dl HTTP error url=%r status=%s body=%r",
                url,
                res.status_code,
                res.text[:300],
            )
            return None, _truncate(
                f"rapidapi_looter: post-dl HTTP {res.status_code} {res.text or ''}",
                400,
            )
        payload = res.json()
    except requests.RequestException as ex:
        log.warning(
            "rapidapi_looter post-dl request failed url=%r error_type=%s error=%s",
            url,
            type(ex).__name__,
            ex,
        )
        return None, _truncate(f"rapidapi_looter: request error {type(ex).__name__}: {ex}", 400)
    except ValueError as ex:
        log.warning("rapidapi_looter post-dl invalid JSON url=%r error=%s", url, ex)
        return None, _truncate(f"rapidapi_looter: invalid JSON from API: {ex}", 400)

    if not isinstance(payload, dict):
        return None, "rapidapi_looter: API response is not a JSON object"

    st = payload.get("status")
    if st is not True and st != "true" and st != 1:
        return None, _truncate(f"rapidapi_looter: API status not ok: {payload!r}", 450)

    data = payload.get("data")
    if not isinstance(data, dict):
        return None, "rapidapi_looter: missing data object in API response"
    medias = data.get("medias")
    if not isinstance(medias, list) or not medias:
        return None, "rapidapi_looter: data.medias empty or missing"

    log.info("rapidapi_looter post-dl ok url=%r media_count=%s", url, len(medias))
    return data, ""


def probe_instagram_post(
    url: str,
) -> tuple[dict[str, Any] | None, Literal["carousel", "single"], str | None]:
    data, reason = _call_post_dl_api(url)
    if not data:
        return None, "single", reason or "rapidapi_looter: probe failed"
    meta = meta_from_looter_data(data)
    return meta, _pipeline_route_from_data(data), None


def download_instagram_via_rapidapi_looter(
    url: str, output_dir: Path
) -> tuple[list[Path] | None, str, dict[str, Any] | None]:
    """
    Call post-dl, download each media link to disk.

    On success returns (paths, "", meta). On failure returns (None, reason, None).
    """
    data, reason = _call_post_dl_api(url)
    if not data:
        return None, reason or "rapidapi_looter: post-dl failed", None

    medias = data.get("medias")
    if not isinstance(medias, list) or not medias:
        return None, "rapidapi_looter: data.medias empty or missing", None

    output_dir.mkdir(parents=True, exist_ok=True)
    stem = f"rapidapi_{uuid.uuid4().hex[:10]}"
    dl_headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        ),
        "Accept": "*/*",
        "Referer": _referer_for_url(url),
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
            log.info("rapidapi_looter CDN download start idx=%s url=%r", idx, url)
            dl = requests.get(
                link,
                headers=dl_headers,
                timeout=TIMEOUT_DOWNLOAD,
                stream=True,
            )
            if not dl.ok:
                log.warning(
                    "rapidapi_looter CDN HTTP error idx=%s status=%s url=%r",
                    idx,
                    dl.status_code,
                    url,
                )
                failed_http.append(dl.status_code)
                continue
            with open(out, "wb") as f:
                for chunk in dl.iter_content(chunk_size=_CHUNK):
                    if chunk:
                        f.write(chunk)
            if out.is_file() and out.stat().st_size > 0:
                paths.append(out)
                log.info(
                    "rapidapi_looter CDN saved idx=%s bytes=%s dest=%r",
                    idx,
                    out.stat().st_size,
                    out.name,
                )
            elif out.exists():
                log.warning("rapidapi_looter CDN empty file idx=%s url=%r", idx, url)
                out.unlink(missing_ok=True)
        except OSError as e:
            log.warning(
                "rapidapi_looter CDN write failed idx=%s url=%r error=%s",
                idx,
                url,
                e,
            )
            if out.exists():
                out.unlink(missing_ok=True)

    if paths:
        log.info("rapidapi_looter done url=%r file_count=%s", url, len(paths))
        return paths, "", meta_from_looter_data(data)
    log.warning(
        "rapidapi_looter all CDN downloads failed url=%r failed_http=%s",
        url,
        failed_http,
    )
    extra = f" (CDN HTTP codes: {failed_http})" if failed_http else ""
    return (
        None,
        "rapidapi_looter: API returned medias but every CDN download failed or was empty"
        + extra,
        None,
    )
