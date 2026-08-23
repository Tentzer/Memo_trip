"""
Deploy to Modal:

  cd workers/memo_video_transcribe
  modal deploy modal_app.py

Secrets (create once in Modal dashboard or CLI):

  modal secret create replicate-api-token REPLICATE_API_TOKEN=r8_...
  modal secret create gemini-api-key GEMINI_API_KEY=...

  # Instagram / Facebook cookies (Netscape format):
  modal secret create instagram-cookies YDL_COOKIES="$(cat cookies.txt)"

  # Supabase service role (video_cache needs platform + media_code + result):
  modal secret create supabase-service SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=eyJ...

  # RapidAPI: Modal → connect RapidAPI adds a secret named RAPIDAPI_KEY (see _SECRETS).
  # Set env IG_LOOTER_RAPIDAPI_KEY there (or RAPIDAPI_KEY — rapidapi_ig_looter reads both).

Optional env (on either secret or function env):
  GEMINI_MODEL       (default gemini-2.5-flash)
  VIDEO_DESCRIPTION_MAX_CHARS (default 4000, max caption/description sent to Gemini)
  TRANSCRIBE_MODEL   (defaults to incredibly-fast-whisper version in pipeline.py)
  YDL_FORMAT         (defaults to bestaudio/best/bestvideo*+bestaudio for TikTok/IG/FB)
  YDL_CAROUSEL_FORMAT (defaults to \"best\"; yt-dlp playlist when route is carousel; ignoreerrors enabled)
  YDL_COOKIES        (raw Netscape cookies.txt content; stored via instagram-cookies secret)
  YDL_COOKIES_FILE   (alternative: path to a pre-existing Netscape cookies.txt file)
  GALLERY_DL_DISABLE (set to 1/true to skip gallery-dl fallback)
  GALLERY_DL_TIMEOUT (seconds, default 420)
  IG_LOOTER_RAPIDAPI_KEY / RAPIDAPI_KEY (inside secret RAPIDAPI_KEY from Modal RapidAPI integration, or on instagram-cookies)
  IG_LOOTER_RAPIDAPI_HOST  (optional; default instagram-looter2.p.rapidapi.com)
  IG_LOOTER_RAPIDAPI_DISABLE (set to 1/true to skip RapidAPI fallback)

Download order: gallery-dl, Instagram mobile API (cookies), RapidAPI looter (instagram.com only; media_fetch.py). yt-dlp is probe-only.

Supported URL hosts only: TikTok, Instagram, Facebook (YouTube is rejected).

You may use one Modal secret that contains both REPLICATE_API_TOKEN and GEMINI_API_KEY;
then set secrets=[modal.Secret.from_name("your-secret")] on each function.

The image pins replicate==0.34.1 (same calling style as the transcript project; Replicate 1.x can surface ReplicateError on file uploads).

HTTP POST JSON body: {"url": "https://..."}
Response JSON includes: title, description, platform, pipeline_route, download_source,
  (gallery_dl|instagram_api|rapidapi_looter),
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
        "numpy",
        "decorator",
        "imageio",
        "imageio-ffmpeg",
        "proglog",
        "requests",
        "tqdm",
        "fastapi",
        "pillow",
        "gallery-dl",
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
    modal.Secret.from_name("instagram-cookies"),
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
