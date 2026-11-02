import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

import { authenticateRequest } from "../_shared/auth_supabase.ts";
import { jsonResponse, CORS_HEADERS } from "../_shared/http.ts";
import {
  dailyLimitMessage,
  DEFAULT_IMPORT_VIDEO_DAILY_LIMIT,
  enforceDailyLimit,
  IMPORT_VIDEO_ENDPOINT,
  readDailyLimit,
} from "../_shared/rate_limit.ts";
import { consumeEdgeDailyRequest } from "../_shared/rate_limit_supabase.ts";

declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void;
};

/** Supabase background tasks cap wall-clock around 400s; stay under that so catch runs. */
const MODAL_FETCH_TIMEOUT_MS = 380_000;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const authResult = await authenticateRequest(req);
    if (authResult instanceof Response) return authResult;

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const modalUrl = Deno.env.get("MODAL_TRANSCRIBE_URL") ?? "";

    const body = await req.json();
    const url: string | undefined = body?.url;
    if (!url || typeof url !== "string") {
      return jsonResponse({ error: "url is required" }, 400);
    }

    const dailyLimit = readDailyLimit(
      Deno.env.get("IMPORT_VIDEO_DAILY_LIMIT"),
      DEFAULT_IMPORT_VIDEO_DAILY_LIMIT,
    );
    const limited = await enforceDailyLimit(consumeEdgeDailyRequest, {
      userId: authResult.userId,
      endpoint: IMPORT_VIDEO_ENDPOINT,
      limit: dailyLimit,
      message: dailyLimitMessage(dailyLimit, "video imports"),
    });
    if (limited) return limited;

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: job, error: insertError } = await adminClient
      .from("video_import_jobs")
      .insert({ user_id: authResult.userId, url, status: "pending" })
      .select("id")
      .single();

    if (insertError || !job) {
      console.error("insert error:", insertError);
      return jsonResponse({ error: "Failed to create job" }, 500);
    }

    const jobId: string = job.id;

    const response = jsonResponse({ jobId });

    EdgeRuntime.waitUntil((async () => {
      try {
        await adminClient
          .from("video_import_jobs")
          .update({ status: "processing" })
          .eq("id", jobId);

        const res = await fetch(modalUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
          signal: AbortSignal.timeout(MODAL_FETCH_TIMEOUT_MS),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`Worker returned ${res.status}: ${text.slice(0, 200)}`);
        }

        const result = await res.json();
        if (result.error) throw new Error(result.error);

        const places = Array.isArray(result.places) ? result.places : [];
        const agentFailed = typeof result.agent_error === "string"
          && result.agent_error.trim().length > 0
          && places.length === 0;

        if (agentFailed) {
          await adminClient
            .from("video_import_jobs")
            .update({ status: "error", error: result.agent_error.trim(), result })
            .eq("id", jobId);
          return;
        }

        await adminClient
          .from("video_import_jobs")
          .update({ status: "done", result })
          .eq("id", jobId);
      } catch (err) {
        const errorMessage = err instanceof Error
          ? (err.name === "TimeoutError"
            ? "Video analysis timed out. Try a shorter reel link, or retry in a few minutes."
            : err.message)
          : "Failed to process video.";
        console.error("job failed:", jobId, errorMessage);
        await adminClient
          .from("video_import_jobs")
          .update({ status: "error", error: errorMessage })
          .eq("id", jobId);
      }
    })());

    return response;
  } catch (err) {
    console.error("unexpected error:", err);
    return jsonResponse({ error: "Something went wrong. Please try again." }, 500);
  }
});
