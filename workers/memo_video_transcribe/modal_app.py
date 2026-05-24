"""
Deploy to Modal:

  cd workers/memo_video_transcribe
  modal deploy modal_app.py

Secrets (create once in Modal dashboard or CLI):

  modal secret create replicate-api-token REPLICATE_API_TOKEN=r8_...
  modal secret create gemini-api-key GEMINI_API_KEY=...

  # Supabase service role (video_cache needs platform + media_code + result):
  modal secret create supabase-service SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=eyJ...

  # RapidAPI (Instagram only): secret RAPIDAPI_KEY with IG_LOOTER_RAPIDAPI_KEY or RAPIDAPI_KEY.

Optional env (on either secret or function env):
  GEMINI_LITE_MODEL  (default gemini-2.5-flash-lite — place extraction, backfill)
  GEMINI_OCR_MODEL   (default gemini-2.5-flash — image OCR only)
  VIDEO_DESCRIPTION_MAX_CHARS (default 4000, max caption/description sent to Gemini)
  TRANSCRIBE_MODEL   (defaults to incredibly-fast-whisper version in pipeline.py)
  IG_LOOTER_RAPIDAPI_KEY / RAPIDAPI_KEY (secret RAPIDAPI_KEY — Instagram only)
  IG_LOOTER_RAPIDAPI_HOST  (optional; default instagram-looter2.p.rapidapi.com)
  IG_LOOTER_RAPIDAPI_DISABLE (set to 1/true to skip Instagram RapidAPI)
  YDL_COOKIES / YDL_COOKIES_FILE (optional; TikTok yt-dlp cookies)
  YDL_FORMAT (optional; default bestaudio/best/bestvideo*+bestaudio/best for single videos)
  YDL_CAROUSEL_FORMAT (optional; default best — downloads all TikTok photo/video slides)
  GALLERY_DL_TIMEOUT (optional; default 420 seconds for TikTok /photo/ carousels)
  GALLERY_DL_DISABLE (set to 1/true to skip gallery-dl)

Download:
  - Instagram -> RapidAPI instagram-looter2 post-dl
  - TikTok video -> yt-dlp (gallery-dl fallback)
  - TikTok /photo/ carousel -> gallery-dl (+ yt-dlp audio via /video/ URL rewrite)

Supported URL hosts: TikTok, Instagram, Facebook (Facebook not implemented in worker yet).

You may use one Modal secret that contains both REPLICATE_API_TOKEN and GEMINI_API_KEY;
then set secrets=[modal.Secret.from_name("your-secret")] on each function.

The image pins replicate==0.34.1 (same calling style as the transcript project; Replicate 1.x can surface ReplicateError on file uploads).

HTTP POST JSON body: {"url": "https://..."}
Response JSON includes: title, description, platform, pipeline_route, download_source,
  text, ocr_text, segments, places, agent_summary, agent_error if applicable.
"""

from pathlib import Path

import modal

APP_NAME = "memo-video-transcribe"
WORKDIR = Path(__file__).parent.resolve()

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install(
        "moviepy==1.0.3",
        "replicate==0.34.1",
        "yt-dlp",
        "gallery-dl",
        "numpy",
        "decorator",
        "imageio",
        "imageio-ffmpeg",
        "proglog",
        "requests",
        "tqdm",
        "fastapi",
        "pillow",
    )
    .add_local_dir(
        str(WORKDIR),
        remote_path="/worker",
        copy=True,
    )
)

app = modal.App(APP_NAME)


_SECRETS = [
    modal.Secret.from_name("replicate-api-token"),
    modal.Secret.from_name("gemini-api-key"),
    modal.Secret.from_name("supabase-service"),
    modal.Secret.from_name("RAPIDAPI_KEY"),
]


@app.function(
    image=image,
    secrets=_SECRETS,
    timeout=60 * 15,
    memory=2048,
)
def run_transcribe(url: str) -> dict:
    import sys

    sys.path.insert(0, "/worker")
    import pipeline  # noqa: E402

    return pipeline.transcribe_from_url(url)


@app.function(
    image=image,
    secrets=_SECRETS,
    timeout=60 * 30,
    memory=2048,
)
def backfill_place_categories(
    dry_run: bool = False,
    gemini_only: bool = False,
    reclassify_all: bool = False,
    only_place_category: str = "",
) -> dict:
    import sys

    sys.path.insert(0, "/worker")
    from backfill_place_category import run_backfill  # noqa: E402

    return run_backfill(
        dry_run=dry_run,
        gemini_only=gemini_only,
        reclassify_all=reclassify_all,
        only_place_category=only_place_category or None,
    )


@app.local_entrypoint()
def backfill_place_categories_cli(
    dry_run: bool = False,
    gemini_only: bool = False,
    reclassify_all: bool = False,
    only_place_category: str = "",
):
    print(
        backfill_place_categories.remote(
            dry_run=dry_run,
            gemini_only=gemini_only,
            reclassify_all=reclassify_all,
            only_place_category=only_place_category,
        )
    )


@app.function(
    image=image,
    secrets=_SECRETS,
    timeout=60 * 15,
    memory=2048,
)
@modal.fastapi_endpoint(method="POST")
def transcribe_web(data: dict) -> dict:
    import sys

    sys.path.insert(0, "/worker")
    import pipeline  # noqa: E402

    url = data.get("url") if isinstance(data, dict) else None
    if not url or not str(url).strip():
        return {"error": "Missing or empty 'url' in JSON body"}
    try:
        return pipeline.transcribe_from_url(str(url).strip())
    except Exception as e:  # noqa: BLE001
        err: dict = {"error": str(e), "error_type": type(e).__name__}
        body = getattr(e, "body", None)
        if body is not None:
            err["replicate_body"] = body if isinstance(body, str) else str(body)
        status = getattr(e, "status", None)
        if status is not None:
            err["http_status"] = status
        return err
