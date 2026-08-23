"""
Extract visible text from images via Gemini vision (same GEMINI_API_KEY as place_agent).

Configurable: GEMINI_MODEL (shared), OCR_IMAGE_MAX_SIDE (default 2048), OCR_IMAGE_JPEG_QUALITY (default 85).
"""

from __future__ import annotations

import base64
import io
import os
from pathlib import Path

import requests


def _gemini_model() -> str:
    return os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")


def _guess_mime(path: Path) -> str | None:
    return {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".gif": "image/gif",
    }.get(path.suffix.lower())


def _prepare_image_bytes(path: Path) -> tuple[bytes, str]:
    mime = _guess_mime(path)
    if not mime:
        raise ValueError(f"Unsupported image type: {path.suffix}")

    raw = path.read_bytes()
    max_side = int(os.environ.get("OCR_IMAGE_MAX_SIDE", "2048"))
    q = int(os.environ.get("OCR_IMAGE_JPEG_QUALITY", "85"))

    try:
        from PIL import Image
    except ImportError:
        return raw, mime

    if max_side <= 0:
        return raw, mime

    try:
        img = Image.open(io.BytesIO(raw))
        img = img.convert("RGB") if img.mode not in ("RGB", "L") else img.convert("RGB")
        w, h = img.size
        if w <= max_side and h <= max_side:
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=q, optimize=True)
            return buf.getvalue(), "image/jpeg"
        scale = max_side / max(w, h)
        new_w = max(1, int(w * scale))
        new_h = max(1, int(h * scale))
        img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=q, optimize=True)
        return buf.getvalue(), "image/jpeg"
    except Exception:
        return raw, mime


OCR_PROMPT = """Extract all visible text from these images (travel / place posts). For each image, start a line with SLIDE N: then list text in reading order. Include place names, addresses, hashtags as written. If an image has no readable text, write SLIDE N: (no text). Output plain text only, no JSON."""


def ocr_images_with_gemini(paths: list[Path]) -> str:
    api_key = (os.environ.get("GEMINI_API_KEY") or "").strip()
    if not api_key:
        return ""
    if not paths:
        return ""

    parts: list[dict] = [{"text": OCR_PROMPT}]
    for i, p in enumerate(paths, start=1):
        data, mime = _prepare_image_bytes(p)
        b64 = base64.standard_b64encode(data).decode("ascii")
        parts.append({"text": f"--- Image {i} ({p.name}) ---"})
        parts.append({"inline_data": {"mime_type": mime, "data": b64}})

    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/{_gemini_model()}"
        f":generateContent?key={api_key}"
    )
    body = {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {"temperature": 0.1},
    }
    try:
        res = requests.post(url, json=body, timeout=180)
        if not res.ok:
            return ""
        data = res.json()
        out_parts = (data.get("candidates") or [{}])[0].get("content", {}).get("parts") or []
        texts: list[str] = []
        for part in out_parts:
            if isinstance(part, dict) and part.get("text") and not part.get("thought"):
                texts.append(str(part["text"]))
        return "\n".join(texts).strip()
    except requests.RequestException:
        return ""
