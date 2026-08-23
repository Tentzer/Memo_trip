/** Overpass QL prototype to compare alternate POI coverage (logged only; not merged into UX). */

function buildOverpassQuery(lat: number, lng: number, radiusM: number): string {
    const r = Math.min(radiusM, 12000);
    return `
[out:json][timeout:25];
(
  node["amenity"="fast_food"](around:${r},${lat},${lng});
  node["amenity"="restaurant"](around:${r},${lat},${lng});
);
out tags 40;
`.trim();
}

export interface OsmElementSample {
    name: string | null;
    amenity: string | null;
    lat: number;
    lng: number;
}

/** Parse minimal info from Overpass JSON for logging. */
function parseOverpassElements(json: Record<string, unknown>): OsmElementSample[] {
    const elements = json.elements as Record<string, unknown>[] | undefined;
    if (!Array.isArray(elements)) return [];
    const out: OsmElementSample[] = [];
    for (const el of elements) {
        const tags = (el.tags as Record<string, string> | undefined) ?? {};
        let lat = typeof el.lat === 'number' ? el.lat : null;
        let lng: number | null = typeof el.lon === 'number' ? el.lon : null;
        const center = el.center as Record<string, unknown> | undefined;
        if (lat == null && typeof center?.lat === 'number') lat = center.lat as number;
        if (lng == null && typeof center?.lon === 'number') lng = center.lon as number;
        if (lat == null || lng == null) continue;
        out.push({
            name: tags.name ?? null,
            amenity: tags.amenity ?? null,
            lat,
            lng,
        });
    }
    return out;
}

/** When PLAN_AGENT_ENABLE_OSM_PROTOTYPE=true, logs OSM eatery counts/samples near centroid for ops comparison vs Google. */
export async function logOsmPrototypeSample(
    lat: number,
    lng: number,
    radiusM: number,
): Promise<void> {
    if (Deno.env.get('PLAN_AGENT_ENABLE_OSM_PROTOTYPE') !== 'true') return;

    const q = buildOverpassQuery(lat, lng, radiusM);
    const base = Deno.env.get('PLAN_AGENT_OVERPASS_URL') ??
        'https://overpass-api.de/api/interpreter';
    const res = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(q)}`,
    });
    if (!res.ok) return;
    const json = await res.json() as Record<string, unknown>;
    const els = parseOverpassElements(json);
    console.log(
        '[osm prototype]',
        JSON.stringify({
            centroidLat: lat,
            centroidLng: lng,
            radiusM,
            candidateCount: els.length,
            sample: els.slice(0, 5),
        }),
    );
}
