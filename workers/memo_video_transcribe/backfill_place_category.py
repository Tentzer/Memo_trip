"""
One-time backfill: set memories.place_category from title + description.

Run on Modal (has GEMINI_API_KEY + Supabase secrets):
  cd workers/memo_video_transcribe
  modal run modal_app.py::backfill_place_categories --dry-run
  modal run modal_app.py::backfill_place_categories
"""

from __future__ import annotations

import json
import os
import re
import time
from typing import Any

import requests

from worker_log import get_logger

log = get_logger(__name__)

ALLOWED = frozenset({
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

DEFAULT_GEMINI_LITE_MODEL = "gemini-2.5-flash-lite"
GEMINI_LITE_MODEL = os.environ.get("GEMINI_LITE_MODEL", DEFAULT_GEMINI_LITE_MODEL)

CATEGORY_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    (
        "sushi",
        re.compile(
            r"(?i)\b("
            r"sushi|omakase|nigiri|sashimi|maki|sushi bar|סushi|סושי"
            r")\b",
        ),
    ),
    (
        "ramen",
        re.compile(
            r"(?i)\b("
            r"ramen|ramen-ya|ramen shop|tonkotsu|shoyu|menya|ラーメン|ראמן"
            r")\b",
        ),
    ),
    (
        "pasta",
        re.compile(
            r"(?i)\b("
            r"pasta|carbonara|spaghetti|penne|ragu|bolognese|trattoria|"
            r"פסטה|pasta fresca"
            r")\b",
        ),
    ),
    (
        "restaurant",
        re.compile(
            r"(?i)\b("
            r"restaurant|pizzeria|pizza(?:eria)?|steakhouse|osteria|"
            r"bistro|eatery|diner|grill|izakaya|taqueria|shawarma|souvlaki|gyros|takoyaki|"
            r"burger|hamburger|fine dining|street food|food spot|noodle shop|"
            r"מסעדה|פיצה|המבורגר"
            r")\b",
        ),
    ),
    (
        "cafe",
        re.compile(
            r"(?i)\b("
            r"caf[eé]|coffee shop|coffee house|espresso|brunch|tea house|breakfast spot|"
            r"pancake|budino|קפה|עגלת קפה"
            r")\b",
        ),
    ),
    (
        "bar",
        re.compile(
            r"(?i)\b("
            r"cocktail bar|wine bar|nightclub|speakeasy|\bbar\b|\bpub\b|happy hour"
            r")\b",
        ),
    ),
    (
        "bakery",
        re.compile(
            r"(?i)\b("
            r"bakery|patisserie|pastry shop|bread shop|donut shop|cake shop|tiramisu|"
            r"croissant|gelato shop|popsicle shop"
            r")\b",
        ),
    ),
    (
        "attraction",
        re.compile(
            r"(?i)\b("
            r"museum|monument|viewpoint|landmark|gallery|zoo|historic site|tourist attraction|"
            r"sunset spot|garden of oranges|temple|shrine|castle|beach\b(?!\s+(bar|club))"
            r")\b",
        ),
    ),
    (
        "shopping",
        re.compile(
            r"(?i)\b("
            r"7[\s-]?eleven|convenience store|souvenir shop|boutique|shopping mall|\bmall\b|"
            r"supermarket|grocery|market stall|\bstore\b|\bshop\b"
            r")\b",
        ),
    ),
]

DESCRIPTION_LEAD = re.compile(
    r"(?i)^(?:a|an)\s+[\w\s'-]+\s+"
    r"(restaurant|pasta|ramen|sushi|cafe|bar|bakery|attraction|shopping)\b",
)


def _normalize_category(raw: str | None) -> str | None:
    value = (raw or "").strip().lower()
    if value in ALLOWED:
        return value
    aliases = {
        "coffee shop": "cafe",
        "coffee house": "cafe",
        "pub": "bar",
        "shop": "shopping",
        "store": "shopping",
    }
    return aliases.get(value)


def classify_heuristic(title: str | None, description: str | None) -> str | None:
    title = (title or "").strip()
    description = (description or "").strip()
    combined = f"{title}\n{description}".strip()
    if not combined:
        return None

    lead = DESCRIPTION_LEAD.match(description)
    if lead:
        return _normalize_category(lead.group(1))

    scores: dict[str, int] = {cat: 0 for cat in ALLOWED if cat != "other"}
    for category, pattern in CATEGORY_PATTERNS:
        hits = len(pattern.findall(combined))
        if hits:
            scores[category] += hits

    if title:
        title_lower = title.lower()
        if "ramen" in title_lower or "menya" in title_lower:
            scores["ramen"] += 2
        if "sushi" in title_lower:
            scores["sushi"] += 2
        if "pasta" in title_lower or "trattoria" in title_lower:
            scores["pasta"] += 2
        if "restaurant" in title_lower or "pizzeria" in title_lower:
            scores["restaurant"] += 2
        if "caff" in title_lower or "coffee" in title_lower:
            scores["cafe"] += 2
        if "bar" in title_lower or "pub" in title_lower:
            scores["bar"] += 2
        if "bakery" in title_lower or "patisserie" in title_lower:
            scores["bakery"] += 2

    best_cat = max(scores, key=lambda k: scores[k])
    if scores[best_cat] > 0:
        return best_cat
    return None


def _supabase_headers(service_key: str) -> dict[str, str]:
    return {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }


def fetch_targets(
    supabase_url: str,
    service_key: str,
    *,
    only_null_category: bool = True,
    only_place_category: str | None = None,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    offset = 0
    page_size = 500
    headers = _supabase_headers(service_key)
    while True:
        params: dict[str, str] = {
            "select": "id,title,description,place_category",
            "description": "not.is.null",
            "deleted_at": "is.null",
            "order": "id.asc",
            "offset": str(offset),
            "limit": str(page_size),
        }
        if only_place_category:
            params["place_category"] = f"eq.{only_place_category}"
        elif only_null_category:
            params["place_category"] = "is.null"
        res = requests.get(
            f"{supabase_url.rstrip('/')}/rest/v1/memories",
            headers=headers,
            params=params,
            timeout=60,
        )
        res.raise_for_status()
        batch = res.json()
        if not isinstance(batch, list):
            raise RuntimeError(f"Unexpected Supabase response: {batch!r}")
        rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    return rows


def update_category(
    supabase_url: str,
    service_key: str,
    row_id: str,
    category: str,
) -> None:
    res = requests.patch(
        f"{supabase_url.rstrip('/')}/rest/v1/memories",
        headers=_supabase_headers(service_key),
        params={"id": f"eq.{row_id}"},
        json={"place_category": category},
        timeout=30,
    )
    res.raise_for_status()


def classify_with_gemini_batch(
    items: list[dict[str, Any]],
    api_key: str,
) -> dict[str, str]:
    if not items:
        return {}

    payload = [
        {
            "id": row["id"],
            "title": (row.get("title") or "")[:200],
            "description": (row.get("description") or "")[:800],
        }
        for row in items
    ]
    prompt = (
        "Classify each place into exactly one category for a travel app badge.\n"
        "Allowed values ONLY: restaurant, pasta, ramen, sushi, cafe, bar, bakery, attraction, shopping, other\n\n"
        "Rules:\n"
        "- Use title and description together. Pick the most specific fit.\n"
        "- Use 'other' ONLY when the venue type is genuinely unknowable (no food/drink/shop/sight clues). "
        "If there is any reasonable signal, pick a real category — never use 'other' for lazy classification.\n"
        "- pasta / ramen / sushi: only when that cuisine is clearly the main focus.\n"
        "- restaurant: udon, soba, curry, gyros, burger, pizza, sandwich shop, street food, standing noodle bar, "
        "tofu restaurant, izakaya (food), general dining — any prepared food venue without a dedicated category.\n"
        "- cafe: coffee shop, brunch, tea house; gelato/ice cream shops.\n"
        "- bar: any bar/pub/cocktail bar; use 'bar' if the name or description says bar.\n"
        "- bakery: patisserie, bread/cake/donut shop.\n"
        "- shopping: convenience store (7-Eleven), card/collectible shop, boutique, retail store.\n"
        "- attraction: museum, monument, viewpoint, park, temple, landmark.\n"
        "- Examples: udon shop → restaurant; 7-Eleven → shopping; card shop → shopping; "
        "Bar Unknown → bar; gelato/popsicles → cafe; sandwich/tofu food spot → restaurant.\n\n"
        "Return ONLY valid JSON, no markdown:\n"
        '{"results":[{"id":"uuid","category":"restaurant"}]}\n\n'
        f"Places:\n{json.dumps(payload, ensure_ascii=False)}"
    )
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_LITE_MODEL}"
        f":generateContent?key={api_key}"
    )
    body = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.1},
    }
    last_error: Exception | None = None
    for attempt in range(6):
        try:
            res = requests.post(url, json=body, timeout=120)
        except requests.RequestException as exc:
            last_error = exc
            if attempt < 5:
                wait_s = min(30, 2 ** attempt)
                log.warning("gemini batch retry attempt=%s error=%s wait_s=%s", attempt + 1, exc, wait_s)
                time.sleep(wait_s)
                continue
            raise
        if res.ok:
            break
        if res.status_code in {429, 500, 503, 504} and attempt < 5:
            wait_s = min(30, 2 ** attempt)
            log.warning(
                "gemini batch retry attempt=%s status=%s wait_s=%s",
                attempt + 1,
                res.status_code,
                wait_s,
            )
            time.sleep(wait_s)
            continue
        raise RuntimeError(f"Gemini HTTP {res.status_code}: {res.text[:500]}")
    else:
        if last_error:
            raise last_error
        raise RuntimeError("Gemini request failed after retries")
    data = res.json()
    parts = (data.get("candidates") or [{}])[0].get("content", {}).get("parts") or []
    text = next(
        (p.get("text") for p in parts if isinstance(p, dict) and p.get("text")),
        None,
    )
    if not text:
        raise RuntimeError("Empty Gemini response")
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    parsed = json.loads(text)
    out: dict[str, str] = {}
    for item in parsed.get("results") or []:
        row_id = item.get("id")
        cat = _normalize_category(item.get("category"))
        if row_id and cat:
            out[str(row_id)] = cat
    return out


def run_backfill(
    *,
    dry_run: bool = False,
    batch_size: int = 15,
    gemini_only: bool = False,
    reclassify_all: bool = False,
    only_place_category: str | None = None,
) -> dict[str, Any]:
    supabase_url = (os.environ.get("SUPABASE_URL") or "").strip()
    service_key = (os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    gemini_key = (os.environ.get("GEMINI_API_KEY") or "").strip()

    if not supabase_url or not service_key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")

    rows = fetch_targets(
        supabase_url,
        service_key,
        only_null_category=not reclassify_all and not only_place_category,
        only_place_category=only_place_category,
    )
    log.info(
        "backfill fetched rows=%s dry_run=%s gemini_only=%s reclassify_all=%s only_place_category=%s model=%s",
        len(rows),
        dry_run,
        gemini_only,
        reclassify_all,
        only_place_category,
        GEMINI_LITE_MODEL,
    )

    heuristic: dict[str, str] = {}
    pending: list[dict[str, Any]] = []
    if gemini_only:
        pending = list(rows)
    else:
        for row in rows:
            cat = classify_heuristic(row.get("title"), row.get("description"))
            if cat:
                heuristic[str(row["id"])] = cat
            else:
                pending.append(row)

    gemini: dict[str, str] = {}
    if pending:
        if not gemini_key:
            raise RuntimeError(
                f"GEMINI_API_KEY required for {len(pending)} rows",
            )
        for i in range(0, len(pending), batch_size):
            batch = pending[i : i + batch_size]
            try:
                gemini.update(classify_with_gemini_batch(batch, gemini_key))
            except Exception as e:
                log.warning("gemini batch failed offset=%s error=%s", i, e)
                raise
            time.sleep(1.0)

    still_missing = [
        row for row in pending if str(row["id"]) not in gemini
    ]
    for row in still_missing:
        gemini[str(row["id"])] = "other"

    assignments = gemini if gemini_only else {**heuristic, **gemini}
    counts: dict[str, int] = {}
    for cat in assignments.values():
        counts[cat] = counts.get(cat, 0) + 1

    updated = 0
    failures = 0
    if not dry_run:
        for row_id, category in assignments.items():
            try:
                update_category(supabase_url, service_key, row_id, category)
                updated += 1
            except Exception as e:
                failures += 1
                log.warning("update failed id=%s error=%s", row_id, e)

    summary = {
        "total": len(rows),
        "heuristic": len(heuristic),
        "gemini": len(gemini),
        "counts": counts,
        "updated": updated,
        "failures": failures,
        "dry_run": dry_run,
        "gemini_only": gemini_only,
        "reclassify_all": reclassify_all,
        "only_place_category": only_place_category,
        "model": GEMINI_LITE_MODEL,
    }
    log.info("backfill done %s", summary)
    return summary
