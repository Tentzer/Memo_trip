import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

import { haversineDistanceMeters } from './geo.ts';

import type { RecommendedPlace } from './plan_agent_types.ts';

interface MemoryRow {
    id: string;
    latitude: number;
    longitude: number;
    title: string | null;
    description: string | null;
}

function bboxPadForRadiusMeters(lat: number, assocRadiusM: number): { dLat: number; dLng: number } {
    const dLat = assocRadiusM / 111_320;
    const cosLat = Math.max(0.2, Math.cos((lat * Math.PI) / 180));
    const dLng = assocRadiusM / (111_320 * cosLat);
    return { dLat, dLng };
}

function bboxFromPlaces(places: { lat: number; lng: number }[], assocRadiusM: number): {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
} | null {
    if (!places.length) return null;
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;
    let sumLat = 0;
    for (const p of places) {
        sumLat += p.lat;
        minLat = Math.min(minLat, p.lat);
        maxLat = Math.max(maxLat, p.lat);
        minLng = Math.min(minLng, p.lng);
        maxLng = Math.max(maxLng, p.lng);
    }
    const refLat = sumLat / places.length;
    const pad = bboxPadForRadiusMeters(refLat, assocRadiusM);
    return {
        minLat: minLat - pad.dLat,
        maxLat: maxLat + pad.dLat,
        minLng: minLng - pad.dLng,
        maxLng: maxLng + pad.dLng,
    };
}

function assocRadius(): number {
    const raw = Deno.env.get('PLAN_AGENT_MEMORY_ASSOCIATION_RADIUS_M');
    if (!raw?.trim()) return 500;
    const n = Number.parseInt(raw.trim(), 10);
    return Number.isFinite(n) && n >= 50 && n <= 10_000 ? n : 500;
}

function maxRows(): number {
    const raw = Deno.env.get('PLAN_AGENT_MEMORY_RAG_FETCH_CAP');
    if (!raw?.trim()) return 200;
    const n = Number.parseInt(raw.trim(), 10);
    return Number.isFinite(n) && n >= 10 && n <= 2000 ? n : 200;
}

/** Supabase scoped to caller JWT — respects RLS on `memories`. */
export function createUserSupabase(req: Request): ReturnType<typeof createClient> | null {
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_ANON_KEY');
    const auth = req.headers.get('Authorization');
    if (!url || !key || !auth?.includes('Bearer')) return null;
    return createClient(url, key, { global: { headers: { Authorization: auth } } });
}

/**
 * User-owned memo text near suggestion coordinates for grounded LLM prose.
 */
export async function fetchMemorySnippetBlockForPlaces(
    supabase: ReturnType<typeof createClient>,
    places: RecommendedPlace[],
): Promise<string> {
    if (Deno.env.get('PLAN_AGENT_MEMORY_RAG_ENABLED') === 'false') return '';
    const radiusM = assocRadius();
    const box = bboxFromPlaces(places.map((p) => ({ lat: p.lat, lng: p.lng })), radiusM);
    if (!box) return '';

    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData.user?.id) return '';

    const { data: rows, error } = await supabase
        .from('memories')
        .select('id, latitude, longitude, title, description')
        .eq('user_id', authData.user.id)
        .is('deleted_at', null)
        .gte('latitude', box.minLat)
        .lte('latitude', box.maxLat)
        .gte('longitude', box.minLng)
        .lte('longitude', box.maxLng)
        .limit(maxRows());

    if (error || !rows?.length) return '';

    const targets = places.map((p) => ({ lat: p.lat, lng: p.lng }));
    const lines: string[] = [];
    for (const raw of rows as MemoryRow[]) {
        let nearest = Infinity;
        for (const t of targets) {
            const d = haversineDistanceMeters(raw.latitude, raw.longitude, t.lat, t.lng);
            if (d < nearest) nearest = d;
        }
        if (nearest > radiusM) continue;
        const text = [raw.title?.trim(), raw.description?.trim()].filter(Boolean).join(' ');
        if (!text.trim()) continue;
        lines.push(`- ~${Math.round(nearest)}m from a suggestion: ${text}`);
        if (lines.length >= 8) break;
    }

    if (!lines.length) return '';
    return [
        `User's saved Memo Trip notes physically near suggestions (reuse sparingly; do not invent venues):`,
        ...lines,
    ].join('\n');
}
