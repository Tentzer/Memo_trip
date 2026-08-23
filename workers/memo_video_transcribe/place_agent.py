"""
Extract venue / restaurant candidates from transcript, OCR text, title, and description using Gemini (JSON).

Uses GEMINI_API_KEY (same as plan-agent). Does not call Google Places; downstream code can resolve addresses.
"""

from __future__ import annotations

import json
import os
from typing import Any

import requests

DEFAULT_GEMINI_MODEL = "gemini-2.5-flash"

SYSTEM = """You extract real-world places (especially restaurants, cafes, bars, bakeries) from a social video transcript, optional on-screen text (OCR), and platform metadata (title and description/caption).

RULES:
- Output ONLY valid JSON, no markdown.
- Use the transcript, OCR text, title, and description metadata; do not invent full street addresses. If no address is stated, set "address" to null.
- Prefer the business name as spoken, shown on-screen, written in the description, or in the title; "maps_search_hint" must be an English string useful for Google Maps text search (include city/area when known).
- "evidence_quote" must be a short exact or near-exact snippet from the transcript or OCR (or empty if only from title/description).
- If nothing is a concrete venue, return an empty "places" array.
- "confidence" is high | medium | low for how sure the place identification is.

Return shape:
{
  "places": [
    {
      "name": string,
      "address": string | null,
      "city": string | null,
      "country": string | null,
      "category": "restaurant" | "cafe" | "bar" | "bakery" | "attraction" | "shopping" | "other",
      "maps_search_hint": string,
      "evidence_quote": string,
      "confidence": "high" | "medium" | "low",
      "notes": string | null
    }
  ],
  "agent_summary": string
}
"""


def _gemini_model() -> str:
    return os.environ.get("GEMINI_MODEL", DEFAULT_GEMINI_MODEL)


def extract_places_from_transcript(
    *,
    transcript: str,
    video_title: str,
    video_description: str,
    source_platform: str,
    ocr_text: str = "",
) -> dict[str, Any]:
    """
    Returns dict with keys: places (list), agent_summary (str), and optionally agent_error (str).
    """
    api_key = (os.environ.get("GEMINI_API_KEY") or "").strip()
    if not api_key:
        return {
            "places": [],
            "agent_summary": "",
            "agent_error": "GEMINI_API_KEY is not set; skipping place extraction.",
        }

    transcript = (transcript or "").strip()
    if len(transcript) > 12000:
        transcript = transcript[:12000] + "\n...[truncated]"

    ocr_text = (ocr_text or "").strip()
    if len(ocr_text) > 8000:
        ocr_text = ocr_text[:8000] + "\n...[truncated]"

    description = (video_description or "").strip()
    if len(description) > 4000:
        description = description[:4000] + "\n...[truncated]"

    blocks = [
        f"Video platform: {source_platform}",
        f"Video title (metadata): {video_title}",
    ]
    if description:
        blocks.append(f"Video description/caption:\n{description}")
    if transcript:
        blocks.append(f"Transcript:\n{transcript}")
    if ocr_text:
        blocks.append(f"On-screen text (OCR):\n{ocr_text}")
    user_block = "\n\n".join(blocks)

    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/{_gemini_model()}"
        f":generateContent?key={api_key}"
    )
    body: dict[str, Any] = {
        "system_instruction": {"parts": [{"text": SYSTEM}]},
        "contents": [{"role": "user", "parts": [{"text": user_block}]}],
        "generationConfig": {
            "temperature": 0.2,
            "responseMimeType": "application/json",
        },
    }

    try:
        res = requests.post(url, json=body, timeout=120)
        if not res.ok:
            return {
                "places": [],
                "agent_summary": "",
                "agent_error": f"Gemini HTTP {res.status_code}: {res.text[:500]}",
            }
        data = res.json()
        parts = (data.get("candidates") or [{}])[0].get("content", {}).get("parts") or []
        text = next(
            (
                p.get("text")
                for p in parts
                if isinstance(p, dict) and p.get("text") and not p.get("thought")
            ),
            None,
        )
        if not text:
            return {
                "places": [],
                "agent_summary": "",
                "agent_error": "Empty Gemini response",
            }
        parsed = json.loads(text)
        places = parsed.get("places")
        if not isinstance(places, list):
            places = []
        summary = parsed.get("agent_summary")
        if not isinstance(summary, str):
            summary = ""
        return {"places": places[:15], "agent_summary": summary}
    except json.JSONDecodeError as e:
        return {
            "places": [],
            "agent_summary": "",
            "agent_error": f"Invalid JSON from Gemini: {e}",
        }
    except requests.RequestException as e:
        return {
            "places": [],
            "agent_summary": "",
            "agent_error": f"Gemini request failed: {e}",
        }
