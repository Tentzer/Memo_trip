/// <reference path="./deno-global.d.ts" />
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/** Supabase background tasks cap wall-clock around 400s; stay under that so catch runs. */
const MODAL_FETCH_TIMEOUT_MS = 380_000;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: CORS_HEADERS,
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const modalUrl = Deno.env.get("MODAL_TRANSCRIBE_URL") ?? "";

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: CORS_HEADERS,
      });
    }

    const body = await req.json();
    const url: string | undefined = body?.url;
    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ error: "url is required" }), {
        status: 400,
        headers: CORS_HEADERS,
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: job, error: insertError } = await adminClient
      .from("video_import_jobs")
      .insert({ user_id: user.id, url, status: "pending" })
      .select("id")
      .single();

    if (insertError || !job) {
      console.error("insert error:", insertError);
      return new Response(JSON.stringify({ error: "Failed to create job" }), {
        status: 500,
        headers: CORS_HEADERS,
      });
    }

    const jobId: string = job.id;

    const response = new Response(
      JSON.stringify({ jobId }),
      { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );

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
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }
});
