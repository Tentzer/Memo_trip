"""
Extract venue / restaurant candidates from transcript, OCR text, title, and description using Gemini (JSON).

Uses GEMINI_API_KEY and GEMINI_LITE_MODEL (default gemini-2.5-flash-lite).
"""

from __future__ import annotations

import json
import os
from typing import Any

import requests

from worker_log import get_logger

log = get_logger(__name__)

DEFAULT_GEMINI_LITE_MODEL = "gemini-2.5-flash-lite"

ALLOWED_CATEGORIES = frozenset({
    "restaurant",
    "pasta",
    "ramen",
    "sushi",
    "cafe",
    "bar",
    "bakery",
    "attraction",
    "shopping",
    "other",
})

SYSTEM = """You extract real-world places (especially restaurants, cafes, bars, bakeries, shops, and tourist sights) from a social video transcript, optional on-screen text (OCR), and platform metadata (title and description/caption).

WHEN TO FAIL (plain text only, NOT JSON):
- If you cannot identify a specific venue/business name with reasonable confidence from the transcript, OCR, title, or caption, do NOT return it in JSON.
- Reply with plain text only (1-2 sentences) explaining that extraction failed because no concrete place name was found.
- Example: "Failed: no restaurant or venue name was mentioned in this video."
- Also use plain-text failure when the video only mentions generic food ("great pasta", "amazing coffee") without naming the business.
- Do not guess or invent a place name. If you are not sure of the proper business name, fail with plain text.

WHEN TO SUCCEED (JSON only):
- When you are confident about at least one concrete venue with a clear, proper business name explicitly stated in the source material, return ONLY valid JSON with no markdown fences and no extra commentary.

CATEGORY (REQUIRED FOR EVERY PLACE — classify decisively):
- Every place in "places" MUST include "category". Never omit it.
- Infer from ALL signals: spoken words, OCR/signage, hashtags, dishes, business name, caption, and what the creator is doing.
- Allowed values ONLY: "restaurant" | "pasta" | "ramen" | "sushi" | "cafe" | "bar" | "bakery" | "attraction" | "shopping" | "other"
- Pick the most specific category that fits. Use "other" ONLY as a last resort when the venue type is genuinely unknowable from the source (no food/drink/shop/sight clues at all). If there is ANY reasonable food-service or retail signal, you MUST pick a real category — do NOT use "other" for lazy classification.
- Specific categories first:
  - pasta: pasta-focused spot, trattoria, carbonara/spaghetti/bolognese specialist
  - ramen: ramen shop, ramen-ya, tonkotsu/shoyu/miso ramen specialist
  - sushi: sushi bar, omakase, nigiri/sashimi specialist
- restaurant (broad food service — use when no more specific category applies):
  - udon, soba, curry, gyros, shawarma, burger, pizza/pizzeria, steakhouse, izakaya (when food-focused), sandwich shop, street food, bento, hot pot, Korean BBQ, fried chicken, taco/taqueria, general sit-down dining
  - If it serves prepared food to eat (even standing/quick-service like a standing udon bar), it is "restaurant" unless it clearly fits pasta/ramen/sushi/cafe/bar/bakery
- cafe: coffee shop, brunch cafe, tea house; also gelato/ice cream shops when the focus is dessert drinks or a cafe-style stop
- bar: any bar, pub, cocktail bar, wine bar; if the business name or caption includes "bar" and drinks are the point, use "bar" even if food is also served
- bakery: patisserie, bread shop, donut/cake shop, croissant-focused shop
- attraction: museum, monument, viewpoint, park, temple, landmark, gallery, zoo, beach (sightseeing)
- shopping: convenience store (7-Eleven, Lawson), supermarket, card/collectible shop, boutique, mall, souvenir shop, any retail store
- Mapping examples you MUST follow:
  - "udon kintaro" / sukiyaki udon / standing udon → restaurant (NOT other, NOT ramen unless explicitly ramen)
  - 7-Eleven / convenience store → shopping
  - card shop / PSA slabs / collectible store → shopping
  - "Bar Unknown" / cocktail pub → bar
  - gelato / popsicle / ice cream shop → cafe (or bakery if clearly a patisserie)
  - sandwich specialty store / street food stick / tofu dishes served to eat → restaurant
- Prefer pasta, ramen, or sushi over "restaurant" only when that cuisine is clearly the main focus.
- Do NOT default everything to "restaurant", but DO prefer "restaurant" over "other" for any identifiable food venue that lacks a dedicated category.

JSON RULES:
- Use the transcript, OCR text, title, and description metadata; do not invent full street addresses. If no address is stated, set "address" to null.
- Prefer the business name as spoken, shown on-screen, written in the description, or in the title; "maps_search_hint" must be an English string useful for Google Maps text search (include city/area when known).
- "description" is a short recommendation (2-3 sentences) for the place, written as if recommending it to a friend. The first sentence MUST begin with the venue type and cuisine or style when known, e.g. "An Italian restaurant...", "A pasta spot...", "A ramen shop...", "A sushi restaurant...", "A specialty coffee cafe...", "A cocktail bar...". Use the "category" field to pick the right noun (restaurant, pasta, ramen, sushi, cafe, bar, bakery, etc.). Base the rest only on what the creator says or shows in the transcript, OCR, title, or caption — dishes, vibe, price, tips, why to visit. Match the creator's language when clear; otherwise use English. Do not invent details not supported by the source material.
- "evidence_quote" must be a short exact or near-exact snippet from the transcript or OCR (or empty if only from title/description).
- If nothing is a concrete venue with a proper name, use plain-text failure instead of returning an empty "places" array.
- "confidence" is high | medium | low for how sure the place identification is. Only include places with high or medium confidence where the proper business name is explicitly stated.

Return shape (JSON success only):
{
  "places": [
    {
      "name": string,
      "address": string | null,
      "city": string | null,
      "country": string | null,
      "category": "restaurant" | "pasta" | "ramen" | "sushi" | "cafe" | "bar" | "bakery" | "attraction" | "shopping" | "other",
      "maps_search_hint": string,
      "description": string,
      "evidence_quote": string,
      "confidence": "high" | "medium" | "low",
      "notes": string | null
    }
  ],
  "agent_summary": string
}
"""


def _gemini_model() -> str:
    return os.environ.get("GEMINI_LITE_MODEL", DEFAULT_GEMINI_LITE_MODEL)


def _normalize_category(raw: Any) -> str:
    cat = str(raw or "").strip().lower()
    if cat in ALLOWED_CATEGORIES:
        return cat
    return "other"


def _valid_places(raw_places: Any) -> list[dict[str, Any]]:
    if not isinstance(raw_places, list):
        return []

    valid: list[dict[str, Any]] = []
    for place in raw_places:
        if not isinstance(place, dict):
            continue
        name = str(place.get("name") or "").strip()
        maps_hint = str(place.get("maps_search_hint") or "").strip()
        confidence = str(place.get("confidence") or "").strip().lower()
        if not name or not maps_hint:
            continue
        if confidence == "low":
            continue
        place = dict(place)
        place["category"] = _normalize_category(place.get("category"))
        valid.append(place)
    return valid[:15]


def _strip_markdown_fence(text: str) -> str:
    stripped = text.strip()
    if not stripped.startswith("```"):
        return stripped
    lines = stripped.splitlines()
    if lines and lines[0].startswith("```"):
        lines = lines[1:]
    if lines and lines[-1].strip() == "```":
        lines = lines[:-1]
    return "\n".join(lines).strip()


def _parse_agent_response(text: str) -> dict[str, Any]:
    stripped = _strip_markdown_fence(text)
    if not stripped:
        return {
            "places": [],
            "agent_summary": "",
            "agent_error": "Empty Gemini response",
        }

    if not (stripped.startswith("{") and stripped.endswith("}")):
        return {
            "places": [],
            "agent_summary": "",
            "agent_error": stripped,
        }

    parsed = json.loads(stripped)
    places = _valid_places(parsed.get("places"))
    summary = parsed.get("agent_summary")
    if not isinstance(summary, str):
        summary = ""

    if not places:
        return {
            "places": [],
            "agent_summary": summary,
            "agent_error": summary.strip()
            or "No concrete venue name found in this video.",
        }

    return {"places": places, "agent_summary": summary}


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
        log.warning("place_extraction skip no GEMINI_API_KEY platform=%r", source_platform)
        return {
            "places": [],
            "agent_summary": "",
            "agent_error": "GEMINI_API_KEY is not set; skipping place extraction.",
        }

    log.info(
        "place_extraction start platform=%r model=%r transcript_chars=%s ocr_chars=%s title=%r",
        source_platform,
        _gemini_model(),
        len(transcript or ""),
        len(ocr_text or ""),
        (video_title or "")[:80],
    )

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
        },
    }

    try:
        res = requests.post(url, json=body, timeout=120)
        if not res.ok:
            log.warning(
                "place_extraction Gemini HTTP error status=%s body=%r",
                res.status_code,
                res.text[:300],
            )
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
            log.warning("place_extraction empty Gemini response platform=%r", source_platform)
            return {
                "places": [],
                "agent_summary": "",
                "agent_error": "Empty Gemini response",
            }
        parsed = _parse_agent_response(text)
        log.info(
            "place_extraction done platform=%r place_count=%s agent_error=%r",
            source_platform,
            len(parsed.get("places") or []),
            parsed.get("agent_error"),
        )
        return parsed
    except json.JSONDecodeError as e:
        log.warning("place_extraction invalid JSON platform=%r error=%s", source_platform, e)
        return {
            "places": [],
            "agent_summary": "",
            "agent_error": f"Invalid JSON from Gemini: {e}",
        }
    except requests.RequestException as e:
        log.warning(
            "place_extraction request failed platform=%r error_type=%s error=%s",
            source_platform,
            type(e).__name__,
            e,
        )
        return {
            "places": [],
            "agent_summary": "",
            "agent_error": f"Gemini request failed: {e}",
        }
