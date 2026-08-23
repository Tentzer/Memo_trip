const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const GOOGLE_API_KEY = Deno.env.get('GOOGLE_MAPS_API_KEY') ?? '';

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_BASE_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CORE_RULES = `You are a trip planning engine for a mobile app. Prioritize correct, actionable outputs: structured data for maps, minimal prose, no small talk unless the user is clearly chatting.

LANGUAGE: Detect the user's language from the latest user message and prior turns when provided. All user-facing text must be in that language. Google Maps search strings (maps_query_english, searchQuery, structured English query fields) stay in English.

TRUTH: Never invent place names, addresses, ratings, or opening hours. Only describe venues that appear in supplied Google results or structured data you were given.

QUERIES: Use specific English place queries including city and neighborhood or landmark when known. Never output bare activity words as a final query (e.g. not just "breakfast").

OUTPUT: When JSON is required, return only a valid JSON object — no markdown fences, no commentary. Default to one-sentence intros unless the user asks for more.

CONTEXT: Use prior conversation turns. Pronouns ("these", "those", "there", "the first list") refer to earlier assistant messages. When exclude_prior_place_results is true, do not suggest the same place_id values already shown.

SAFETY: No medical or legal advice. Do not guarantee opening hours; suggest verifying before visiting when relevant.`;

const JSON_ONLY = 'Return a single JSON object only. No markdown.';

// ---- Types ----

type PlanAgentHistoryItem =
    | { role: 'user'; text: string }
    | { role: 'assistant'; text: string }
    | {
        role: 'assistant';
        kind: 'recommendations';
        intro: string;
        places: { name: string; placeId: string }[];
    }
    | {
        role: 'assistant';
        kind: 'itinerary';
        narrative: string;
        stops: { name: string; placeId: string }[];
    }
    | {
        role: 'assistant';
        kind: 'plan_with_recommendations';
        narrative: string;
        sections: { title: string; places: { name: string; placeId: string }[] }[];
        stops: { name: string; placeId: string }[];
    };

type StopCategory = 'food' | 'shopping' | 'attraction' | 'other';
type IntentType = 'chat' | 'recommend' | 'plan' | 'plan_with_recommendations';

interface ClassifiedIntent {
    intent: IntentType;
    chatResponse: string | null;
    searchQuery: string | null;
    exclude_prior_place_results?: boolean;
}

interface HybridSegmentRecommend {
    type: 'recommend';
    category: StopCategory;
    maps_query_english: string;
    user_language_label: string;
    duration_minutes: number;
}

interface HybridSegmentPlace {
    type: 'place';
    category: StopCategory;
    maps_query_english: string;
    user_language_label: string | null;
    duration_minutes: number;
}

type HybridSegment = HybridSegmentRecommend | HybridSegmentPlace;

interface HybridParse {
    trip_destination: string;
    start_time_minutes: number;
    segments: HybridSegment[];
}

interface ParsedStop {
    query: string;
    category: StopCategory;
    duration_minutes: number;
}

interface ParsedPlan {
    stops: ParsedStop[];
    start_time_minutes: number;
    trip_destination?: string | null;
}

interface ResolvedStop {
    name: string;
    category: StopCategory;
    placeId: string;
    lat: number;
    lng: number;
    durationMinutes: number;
    photoReference: string | null;
    openingHours: string | null;
    country: string;
}

interface PlanStop {
    order: number;
    name: string;
    category: StopCategory;
    placeId: string;
    lat: number;
    lng: number;
    arrivalTime: string;
    departureTime: string;
    durationMinutes: number;
    travelFromPreviousMinutes: number;
    photoReference: string | null;
    openingHours: string | null;
    country: string;
    warnings: string[];
}

interface RecommendedPlace {
    name: string;
    address: string;
    rating: number;
    userRatingsTotal: number;
    placeId: string;
    photoReference: string | null;
    lat: number;
    lng: number;
    country: string;
    description: string;
}

// ---- Helpers ----

function formatTime(totalMinutes: number): string {
    const h = Math.floor(totalMinutes / 60) % 24;
    const m = totalMinutes % 60;
    const period = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return `${hour12}:${m.toString().padStart(2, '0')} ${period}`;
}

function jsonResponse(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
}

function formatAssistantForModel(item: PlanAgentHistoryItem): string {
    if (item.role !== 'assistant') return '';
    if (!('kind' in item)) {
        return `Assistant: ${item.text}`;
    }
    if (item.kind === 'recommendations') {
        return `Assistant showed recommendations. Intro: ${item.intro}\nPlaces:\n${item.places.map((p) => `- ${p.name} [place_id:${p.placeId}]`).join('\n')}`;
    }
    if (item.kind === 'itinerary') {
        return `Assistant showed an itinerary. Summary: ${item.narrative}\nStops:\n${item.stops.map((s) => `- ${s.name} [place_id:${s.placeId}]`).join('\n')}`;
    }
    const secLines = item.sections.map(
        (s) =>
            `${s.title}:\n${s.places.map((p) => `  - ${p.name} [place_id:${p.placeId}]`).join('\n')}`,
    );
    return `Assistant showed plan with recommendation sections.\n${item.narrative}\n${secLines.join('\n')}\nItinerary stops:\n${item.stops.map((s) => `- ${s.name} [place_id:${s.placeId}]`).join('\n')}`;
}

function historyToGeminiContents(
    history: PlanAgentHistoryItem[] | undefined,
): { role: string; parts: { text: string }[] }[] {
    const out: { role: string; parts: { text: string }[] }[] = [];
    for (const item of history ?? []) {
        if (item.role === 'user') {
            out.push({ role: 'user', parts: [{ text: item.text }] });
        } else {
            out.push({ role: 'model', parts: [{ text: formatAssistantForModel(item) }] });
        }
    }
    return out;
}

function collectPlaceIdsFromHistory(history: PlanAgentHistoryItem[] | undefined): Set<string> {
    const ids = new Set<string>();
    for (const item of history ?? []) {
        if (item.role !== 'assistant' || !('kind' in item)) continue;
        if (item.kind === 'recommendations') {
            item.places.forEach((p) => ids.add(p.placeId));
        } else if (item.kind === 'itinerary') {
            item.stops.forEach((s) => ids.add(s.placeId));
        } else if (item.kind === 'plan_with_recommendations') {
            item.sections.forEach((sec) => sec.places.forEach((p) => ids.add(p.placeId)));
            item.stops.forEach((s) => ids.add(s.placeId));
        }
    }
    return ids;
}

async function callGemini(
    systemInstruction: string,
    userMessage: string,
    jsonMode = false,
    priorHistory?: PlanAgentHistoryItem[],
): Promise<string> {
    const contents = [...historyToGeminiContents(priorHistory), { role: 'user', parts: [{ text: userMessage }] }];
    const body: Record<string, unknown> = {
        system_instruction: { parts: [{ text: systemInstruction }] },
        contents,
        generationConfig: {
            temperature: 0.3,
            ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
        },
    };

    const res = await fetch(`${GEMINI_BASE_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const errText = await res.text();
        console.error('Gemini API error:', res.status, errText);
        throw new Error(`Gemini ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const parts: { text?: string; thought?: boolean }[] =
        data.candidates?.[0]?.content?.parts ?? [];
    const responsePart = parts.find((p) => !p.thought && p.text) ?? parts.find((p) => p.text);
    const text = responsePart?.text;
    if (!text) throw new Error(`Empty Gemini response. Parts: ${JSON.stringify(parts)}`);
    return text as string;
}

async function geocodeDestination(address: string): Promise<{ lat: number; lng: number } | null> {
    const trimmed = address?.trim();
    if (!trimmed) return null;
    const params = new URLSearchParams({ address: trimmed, key: GOOGLE_API_KEY });
    const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params}`);
    const data = await res.json();
    const loc = data.results?.[0]?.geometry?.location;
    if (loc == null || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') return null;
    return { lat: loc.lat, lng: loc.lng };
}

async function getCityName(lat: number, lng: number): Promise<string> {
    try {
        const params = new URLSearchParams({
            latlng: `${lat},${lng}`,
            result_type: 'locality',
            key: GOOGLE_API_KEY,
        });
        const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params}`);
        const data = await res.json();
        const components: { types: string[]; long_name: string }[] =
            data.results?.[0]?.address_components ?? [];
        const locality = components.find((c) => c.types.includes('locality'));
        const country = components.find((c) => c.types.includes('country'));
        const city = locality?.long_name ?? '';
        const countryName = country?.long_name ?? '';
        return [city, countryName].filter(Boolean).join(', ') || 'your area';
    } catch {
        return 'your area';
    }
}

async function searchNearbyPlaces(
    query: string,
    lat: number,
    lng: number,
    radiusMeters = 3000,
    excludePlaceIds?: Set<string>,
): Promise<RecommendedPlace[]> {
    const params = new URLSearchParams({
        query: `${query}`,
        location: `${lat},${lng}`,
        radius: String(radiusMeters),
        key: GOOGLE_API_KEY,
    });
    const res = await fetch(
        `https://maps.googleapis.com/maps/api/place/textsearch/json?${params}`,
    );
    const data = await res.json();
    const results: Record<string, unknown>[] = (data.results ?? []).slice(0, 20);

    const mapped = results
        .map((r) => ({
            name: r.name as string,
            address: (r.formatted_address ?? r.vicinity ?? '') as string,
            rating: (r.rating ?? 0) as number,
            userRatingsTotal: (r.user_ratings_total ?? 0) as number,
            placeId: r.place_id as string,
            photoReference:
                ((r.photos as Record<string, unknown>[])?.[0]?.photo_reference as string) ?? null,
            lat: ((r.geometry as Record<string, unknown>)?.location as Record<string, number>)
                ?.lat ?? 0,
            lng: ((r.geometry as Record<string, unknown>)?.location as Record<string, number>)
                ?.lng ?? 0,
            country: '',
            description: '',
        }))
        .filter((p) => p.name && p.placeId);

    const rated = mapped.filter((p) => p.rating >= 3.5);
    let pool = rated.length ? rated : mapped;
    if (excludePlaceIds?.size) {
        const filtered = pool.filter((p) => !excludePlaceIds.has(p.placeId));
        if (filtered.length > 0) pool = filtered;
    }
    return pool.sort((a, b) => b.rating - a.rating).slice(0, 5);
}

async function searchPlace(
    query: string,
    userLat: number,
    userLng: number,
): Promise<{ placeId: string; name: string } | null> {
    const params = new URLSearchParams({
        input: query,
        location: `${userLat},${userLng}`,
        radius: '50000',
        key: GOOGLE_API_KEY,
    });
    const res = await fetch(
        `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params}`,
    );
    const data = await res.json();
    if (!data.predictions?.length) return null;
    const first = data.predictions[0];
    return {
        placeId: first.place_id,
        name: first.structured_formatting?.main_text ?? first.description,
    };
}

async function getPlaceDetails(placeId: string): Promise<{
    lat: number;
    lng: number;
    photoReference: string | null;
    openingHours: string | null;
    country: string;
    formattedAddress: string;
}> {
    const params = new URLSearchParams({
        place_id: placeId,
        fields: 'geometry,photos,address_components,opening_hours,formatted_address',
        key: GOOGLE_API_KEY,
    });
    const res = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?${params}`,
    );
    const data = await res.json();
    const result = data.result ?? {};

    const lat: number = result.geometry?.location?.lat ?? 0;
    const lng: number = result.geometry?.location?.lng ?? 0;
    const photoReference: string | null = result.photos?.[0]?.photo_reference ?? null;

    let openingHours: string | null = null;
    const weekdayText: string[] = result.opening_hours?.weekday_text ?? [];
    if (weekdayText.length) {
        const jsDay = new Date().getDay();
        const googleDay = jsDay === 0 ? 6 : jsDay - 1;
        openingHours = weekdayText[googleDay] ?? weekdayText[0];
    }

    const components: { types: string[]; long_name: string }[] =
        result.address_components ?? [];
    const countryComp = components.find((c) => c.types.includes('country'));
    const country = countryComp?.long_name ?? '';
    const formattedAddress = (result.formatted_address as string) ?? '';

    return { lat, lng, photoReference, openingHours, country, formattedAddress };
}

async function enrichPlacesWithGemini(
    places: RecommendedPlace[],
    userMessage: string,
    sectionHint: string,
    priorHistory?: PlanAgentHistoryItem[],
): Promise<{ intro: string; places: RecommendedPlace[] }> {
    if (!places.length) return { intro: '', places: [] };
    const placesList = places
        .map((p, i) => `${i + 1}. ${p.name} — ${p.rating}/5 (${p.userRatingsTotal} reviews) — ${p.address}`)
        .join('\n');
    const descSystem = `${CORE_RULES}

${JSON_ONLY}

Section context: ${sectionHint}

Tasks:
1. ONE short intro sentence for this list (user's language).
2. For each place, ONE factual sentence (max 18 words) based only on the data given.

Return JSON: { "intro": string, "descriptions": string[] }`;
    const descResult = await callGemini(
        descSystem,
        `Latest user message: "${userMessage}"\n\nPlaces data:\n${placesList}`,
        true,
        priorHistory,
    );
    const descData: { intro: string; descriptions: string[] } = JSON.parse(descResult);
    return {
        intro: descData.intro ?? '',
        places: places.map((p, i) => ({ ...p, description: descData.descriptions?.[i] ?? '' })),
    };
}

async function finalizeItinerary(
    resolved: ResolvedStop[],
    originLat: number,
    originLng: number,
    startMinutes: number,
    message: string,
    contextLabel: string,
    priorHistory?: PlanAgentHistoryItem[],
): Promise<{ stops: PlanStop[]; narrative: string }> {
    let orderedStops = [...resolved];
    const legDurationsSeconds: number[] = new Array(resolved.length).fill(0);

    const lastStop = resolved[resolved.length - 1];
    const dirParams: Record<string, string> = {
        origin: `${originLat},${originLng}`,
        destination: `place_id:${lastStop.placeId}`,
        mode: 'driving',
        key: GOOGLE_API_KEY,
    };

    if (resolved.length === 2) {
        dirParams.waypoints = `place_id:${resolved[0].placeId}`;
    } else if (resolved.length >= 3) {
        const intermediates = resolved.slice(0, -1);
        dirParams.waypoints = `optimize:true|${intermediates.map((s) => `place_id:${s.placeId}`).join('|')}`;
    }

    const dirRes = await fetch(
        `https://maps.googleapis.com/maps/api/directions/json?${new URLSearchParams(dirParams)}`,
    );
    const dirData = await dirRes.json();

    if (dirData.status === 'OK' && dirData.routes?.[0]) {
        const route = dirData.routes[0];
        const legs: { duration: { value: number } }[] = route.legs ?? [];

        if (resolved.length >= 3) {
            const optimizedOrder: number[] = route.waypoint_order ?? [];
            const intermediates = resolved.slice(0, -1);
            orderedStops = [...optimizedOrder.map((i) => intermediates[i]), lastStop];
        }

        for (let i = 0; i < legs.length; i++) {
            legDurationsSeconds[i] = legs[i]?.duration?.value ?? 0;
        }
    }

    let cursor = startMinutes;
    const timedStops: PlanStop[] = orderedStops.map((stop, idx) => {
        const travelMinutes = Math.ceil(legDurationsSeconds[idx] / 60);
        cursor += travelMinutes;
        const arrivalTime = formatTime(cursor);
        cursor += stop.durationMinutes;
        const departureTime = formatTime(cursor);
        return {
            order: idx + 1,
            name: stop.name,
            category: stop.category,
            placeId: stop.placeId,
            lat: stop.lat,
            lng: stop.lng,
            arrivalTime,
            departureTime,
            durationMinutes: stop.durationMinutes,
            travelFromPreviousMinutes: travelMinutes,
            photoReference: stop.photoReference,
            openingHours: stop.openingHours,
            country: stop.country,
            warnings: [],
        };
    });

    const stopsSummary = timedStops
        .map(
            (s) =>
                `${s.order}. ${s.name} (${s.category}) — arrive ${s.arrivalTime}, leave ${s.departureTime}, travel from previous: ${s.travelFromPreviousMinutes} min, today's hours: ${s.openingHours ?? 'unknown'}`,
        )
        .join('\n');

    const narrativeSystem = `${CORE_RULES}

Trip context: ${contextLabel}.

Summarize the optimized day plan in 3-5 concise, practical sentences in the user's language. Mention stop order and timing risks. No emojis.`;
    const narrative = await callGemini(
        narrativeSystem,
        `Latest user message: "${message}"\n\nSchedule:\n${stopsSummary}`,
        false,
        priorHistory,
    );
    return { stops: timedStops, narrative };
}

// ---- Main handler ----

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: CORS_HEADERS });
    }

    try {
        const { message, userLocation, history: rawHistory } = (await req.json()) as {
            message: string;
            userLocation: { latitude: number; longitude: number };
            history?: PlanAgentHistoryItem[];
        };
        const history: PlanAgentHistoryItem[] = Array.isArray(rawHistory) ? rawHistory : [];

        if (!message?.trim()) {
            return jsonResponse({
                type: 'chat',
                text: 'Hi! How can I help you plan your day?',
            });
        }

        // Get city name for context
        const cityName = await getCityName(userLocation.latitude, userLocation.longitude);
        console.log('User city:', cityName);

        // Step 1: Classify intent and handle chat/recommend in one Gemini call
        const classifySystem = `${CORE_RULES}

${JSON_ONLY}

Device location area (for "near me"): ${cityName}. Earlier turns may appear as conversation history — use them for follow-ups and pronouns.

Classify the LATEST user message:

1. "chat" — greeting, general question, or not about places or trip planning. Set chatResponse (user's language, brief).

2. "recommend" — find one category of places (food type, shopping, museum, etc.). Set searchQuery: concise English for Google Text Search.

3. "plan" — only an ordered multi-stop day, no multi-part "give me options for breakfast AND shopping" lists.

4. "plan_with_recommendations" — lists of options for several vague parts of the day plus an ordered plan (e.g. breakfast ideas + shopping ideas + plan).

5. "exclude_prior_place_results": true if the user wants different venues than already shown (e.g. "other", "not these", "somewhere else", "more but different", "another place"). false otherwise.

Return JSON:
{
  "intent": "chat" | "recommend" | "plan" | "plan_with_recommendations",
  "chatResponse": string | null,
  "searchQuery": string | null,
  "exclude_prior_place_results": boolean
}`;

        const classifyResult = await callGemini(classifySystem, message, true, history);
        const classified: ClassifiedIntent = JSON.parse(classifyResult);
        console.log('Classified intent:', classified.intent);

        const excludePrior = classified.exclude_prior_place_results === true;
        const excludedPlaceIds = excludePrior ? collectPlaceIdsFromHistory(history) : new Set<string>();

        // ---- CHAT ----
        if (classified.intent === 'chat') {
            const direct = classified.chatResponse?.trim();
            const text =
                direct ||
                (await callGemini(
                    `${CORE_RULES}\n\nReply briefly in the user's language. No emojis.`,
                    message,
                    false,
                    history,
                ));
            return jsonResponse({ type: 'chat', text });
        }

        // ---- RECOMMEND ----
        if (classified.intent === 'recommend') {
            const query = classified.searchQuery ?? message;
            console.log('Searching for:', query, 'in', cityName);

            const places = await searchNearbyPlaces(
                query,
                userLocation.latitude,
                userLocation.longitude,
                3000,
                excludedPlaceIds,
            );

            if (!places.length) {
                const noResultsMsg = await callGemini(
                    `${CORE_RULES}\n\nReply in the user's language. One or two sentences. No emojis.`,
                    `User asked: "${message}". No suitable new results (area: ${cityName}). Suggest a different search or wider area.`,
                    false,
                    history,
                );
                return jsonResponse({ type: 'chat', text: noResultsMsg });
            }

            // Generate intro + per-place descriptions in one Gemini call
            const placesList = places
                .map((p, i) => `${i + 1}. ${p.name} — ${p.rating}/5 (${p.userRatingsTotal} reviews) — ${p.address}`)
                .join('\n');

            const descSystem = `${CORE_RULES}

${JSON_ONLY}

Area: ${cityName}.

Tasks:
1. ONE intro sentence for these results (user's language).
2. For each place, ONE sentence (max 18 words), only from supplied data.

Return JSON: { "intro": string, "descriptions": string[] }`;

            const descResult = await callGemini(
                descSystem,
                `Latest user message: "${message}"\n\n${placesList}`,
                true,
                history,
            );
            const descData: { intro: string; descriptions: string[] } = JSON.parse(descResult);

            const placesWithDesc = places.map((p, i) => ({
                ...p,
                description: descData.descriptions?.[i] ?? '',
            }));

            return jsonResponse({ type: 'recommendations', intro: descData.intro, places: placesWithDesc });
        }

        // ---- PLAN + RECOMMENDATIONS (hybrid) ----
        if (classified.intent === 'plan_with_recommendations') {
            const hybridSystem = `${CORE_RULES}

${JSON_ONLY}

The user may be planning for a city they are NOT in. Set trip_destination (e.g. "Rome, Italy"). If they say "here" only, use: "${cityName}".

For vague parts (breakfast, shopping, cafes) use type "recommend" with maps_query_english in English including city (e.g. "best breakfast brunch cafe Rome").

For named venues use type "place" with maps_query_english in English including city.

Preserve segment order. duration_minutes: breakfast/brunch 60-75, lunch 75-90, dinner 90, shopping 90-120, attraction 90.

user_language_label: short section title in the user's language.

Return JSON:
{
  "trip_destination": string,
  "start_time_minutes": number,
  "segments": [
    { "type": "recommend", "category": "food"|"shopping"|"attraction"|"other", "maps_query_english": string, "user_language_label": string, "duration_minutes": number },
    { "type": "place", "category": "food"|"shopping"|"attraction"|"other", "maps_query_english": string, "user_language_label": string | null, "duration_minutes": number }
  ]
}`;

            const hybridRaw = await callGemini(hybridSystem, message, true, history);
            const hybridParsed: HybridParse = JSON.parse(hybridRaw);

            if (!hybridParsed.segments?.length) {
                const noSegMsg = await callGemini(
                    `${CORE_RULES}\n\nReply in the user's language. One short paragraph. No emojis.`,
                    `User said: "${message}". Ask them to list activities and the city.`,
                    false,
                    history,
                );
                return jsonResponse({ type: 'chat', text: noSegMsg });
            }

            let tripCoords = await geocodeDestination(hybridParsed.trip_destination);
            if (!tripCoords) {
                tripCoords = { lat: userLocation.latitude, lng: userLocation.longitude };
            }
            const tripLabel = hybridParsed.trip_destination || cityName;
            const destRadius = 12000;

            const sections: { title: string; intro: string; places: RecommendedPlace[] }[] = [];
            const resolvedRoute: ResolvedStop[] = [];

            for (const seg of hybridParsed.segments) {
                if (seg.type === 'recommend') {
                    const rawPlaces = await searchNearbyPlaces(
                        seg.maps_query_english,
                        tripCoords.lat,
                        tripCoords.lng,
                        destRadius,
                        excludePrior ? excludedPlaceIds : undefined,
                    );
                    const { intro, places: withDesc } = await enrichPlacesWithGemini(
                        rawPlaces,
                        message,
                        `${seg.user_language_label}: ${seg.maps_query_english}`,
                        history,
                    );
                    sections.push({ title: seg.user_language_label, intro, places: withDesc });
                    const pick = withDesc[0];
                    if (pick) {
                        const details = await getPlaceDetails(pick.placeId);
                        resolvedRoute.push({
                            name: pick.name,
                            category: seg.category,
                            placeId: pick.placeId,
                            durationMinutes: seg.duration_minutes,
                            lat: details.lat,
                            lng: details.lng,
                            photoReference: details.photoReference,
                            openingHours: details.openingHours,
                            country: details.country,
                        });
                    }
                } else {
                    const found = await searchPlace(
                        seg.maps_query_english,
                        tripCoords.lat,
                        tripCoords.lng,
                    );
                    if (found) {
                        const details = await getPlaceDetails(found.placeId);
                        const single: RecommendedPlace = {
                            name: found.name,
                            address: details.formattedAddress,
                            rating: 0,
                            userRatingsTotal: 0,
                            placeId: found.placeId,
                            photoReference: details.photoReference,
                            lat: details.lat,
                            lng: details.lng,
                            country: details.country,
                            description: '',
                        };
                        const label = seg.user_language_label ?? found.name;
                        const { intro, places: withDesc } = await enrichPlacesWithGemini(
                            [single],
                            message,
                            `${label}: ${seg.maps_query_english}`,
                            history,
                        );
                        sections.push({ title: label, intro, places: withDesc });
                        resolvedRoute.push({
                            name: found.name,
                            category: seg.category,
                            placeId: found.placeId,
                            durationMinutes: seg.duration_minutes,
                            lat: details.lat,
                            lng: details.lng,
                            photoReference: details.photoReference,
                            openingHours: details.openingHours,
                            country: details.country,
                        });
                    }
                }
            }

            if (!resolvedRoute.length) {
                const noResolvedMsg = await callGemini(
                    `${CORE_RULES}\n\nReply in the user's language. No emojis.`,
                    `Trip: ${tripLabel}. User said: "${message}". Places could not be resolved on Maps — suggest clearer names.`,
                    false,
                    history,
                );
                return jsonResponse({ type: 'chat', text: noResolvedMsg });
            }

            const overview = await callGemini(
                `${CORE_RULES}\n\nTrip: ${tripLabel}. Reply in the user's language. 2-3 sentences. No emojis.`,
                `User said: "${message}". Summarize: you listed options per part of the day; the schedule uses one pick per part (often top-rated) plus named stops; they can swap using the lists.`,
                false,
                history,
            );

            const { stops: timedStops, narrative: legNarrative } = await finalizeItinerary(
                resolvedRoute,
                tripCoords.lat,
                tripCoords.lng,
                hybridParsed.start_time_minutes ?? 540,
                message,
                tripLabel,
                history,
            );

            const narrative = `${overview}\n\n${legNarrative}`;

            return jsonResponse({
                type: 'plan_with_recommendations',
                narrative,
                sections,
                stops: timedStops,
            });
        }

        // ---- PLAN (itinerary) ----
        const parseSystem = `${CORE_RULES}

${JSON_ONLY}

Device area (for "here"): ${cityName}. Use prior turns if the user refers to earlier plans.

Return JSON:
{
  "trip_destination": string | null,
  "stops": [
    { "query": string, "category": "food"|"shopping"|"attraction"|"other", "duration_minutes": number }
  ],
  "start_time_minutes": number
}

Rules:
- "trip_destination": city if named (e.g. "Rome, Italy"); null if only "here".
- Include at least one stop when any place or activity is mentioned.
- "query": concrete English Maps string with city when known (not bare "breakfast").
- "category": food / shopping / attraction / other.
- "duration_minutes": food 60-90, shopping 60-120, attraction 60-120.
- "start_time_minutes": minutes since midnight; default 540.
- Preserve user stop order.`;

        const parseResult = await callGemini(parseSystem, message, true, history);
        const parsed: ParsedPlan = JSON.parse(parseResult);

        if (!parsed.stops?.length) {
            const noStopsMsg = await callGemini(
                `${CORE_RULES}\n\nReply in the user's language. No emojis.`,
                `User said: "${message}". Could not extract stops — give a short example of how to describe a day plan.`,
                false,
                history,
            );
            return jsonResponse({ type: 'chat', text: noStopsMsg });
        }

        let searchLat = userLocation.latitude;
        let searchLng = userLocation.longitude;
        let originLat = userLocation.latitude;
        let originLng = userLocation.longitude;
        const tripDest = parsed.trip_destination?.trim();
        if (tripDest) {
            const geo = await geocodeDestination(tripDest);
            if (geo) {
                searchLat = geo.lat;
                searchLng = geo.lng;
                originLat = geo.lat;
                originLng = geo.lng;
            }
        }
        const planContextLabel = tripDest || cityName;

        const resolved: ResolvedStop[] = [];
        for (const stop of parsed.stops) {
            const found = await searchPlace(stop.query, searchLat, searchLng);
            if (!found) continue;
            const details = await getPlaceDetails(found.placeId);
            resolved.push({
                name: found.name,
                category: stop.category,
                placeId: found.placeId,
                durationMinutes: stop.duration_minutes,
                lat: details.lat,
                lng: details.lng,
                photoReference: details.photoReference,
                openingHours: details.openingHours,
                country: details.country,
            });
        }

        if (!resolved.length) {
            const noResolvedMsg = await callGemini(
                `${CORE_RULES}\n\nReply in the user's language. No emojis.`,
                `Trip: ${planContextLabel}. User said: "${message}". Places not found on Maps — suggest more specific names.`,
                false,
                history,
            );
            return jsonResponse({ type: 'chat', text: noResolvedMsg });
        }

        const { stops: timedStops, narrative } = await finalizeItinerary(
            resolved,
            originLat,
            originLng,
            parsed.start_time_minutes ?? 540,
            message,
            planContextLabel,
            history,
        );

        return jsonResponse({ type: 'itinerary', narrative, stops: timedStops });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('plan-agent error:', msg);
        return jsonResponse({ error: msg }, 500);
    }
});
