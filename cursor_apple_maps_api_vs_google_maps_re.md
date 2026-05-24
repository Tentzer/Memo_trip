# Apple Maps API vs Google Maps research
_Exported on 5/12/2026 at 11:19:58 GMT+3 from Cursor (3.3.30)_

---

**User**

You are researching Apple Maps API as a potential replacement for Google Maps API in a React Native / Expo mobile app project. The goal is to:

1. **Explore the codebase** to find every place that uses Google Maps or Google APIs (Places API, Geocoding API, Maps SDK, Photos API, etc.)
2. **Research Apple Maps API** (MapKit JS / MapKit for React Native) capabilities and pricing
3. **Produce a detailed comparison** of what can and cannot be replaced

## Codebase Location
`D:\Memo_trip`

## Step 1 — Find all Google API usage in the codebase

Search for:
- `google` (case-insensitive) in all `.ts`, `.tsx`, `.js`, `.json` files (excluding node_modules)
- `maps.googleapis.com`
- `places` API calls
- `geocod` references
- `GOOGLE_` env variables
- Any map-related components (`MapView`, etc.)
- Files: `hooks/useMapLogic.ts`, `lib/memoryApi.ts`, `hooks/useMemoryCRUD.ts`, `components/LibraryModal.tsx`, `components/SearchBar.tsx`, `components/MemoInfoModal.tsx`, `supabase/functions/plan-agent/index.ts`, `supabase/functions/plan-agent/places_search.ts`, `supabase/functions/plan-agent/geo.ts`

Read all relevant files and document exactly:
- Which file
- Which function/line
- Which Google API feature is used (Places Autocomplete, Place Details, Geocoding, Reverse Geocoding, Place Photos, Maps display, Nearby Search, Text Search, etc.)

## Step 2 — Research Apple Maps API

Use web search to find up-to-date information (2025-2026) on:
- **Apple MapKit JS** — what it offers (web/server APIs)
- **Apple MapKit for React Native** — community libraries, maturity
- **Apple Maps Server API** — Geocoding, Reverse Geocoding, Search, Place details, ETAs (https://developer.apple.com/documentation/applemapsserverapi)
- **Pricing**: Apple Maps API pricing vs Google Maps Platform pricing
- **Limitations**: what Google features have NO Apple equivalent

## Step 3 — Gap analysis

For each Google API feature found in the codebase, state:
- Whether Apple Maps Server API / MapKit has an equivalent
- Quality/maturity of that equivalent
- Any known React Native / Expo compatibility issues

## Step 4 — Cost comparison

Research current (2026) pricing:
- Google Maps Platform: Places API (Autocomplete, Details, Photos, Nearby Search, Text Search), Geocoding API, Maps SDK for Mobile
- Apple Maps Server API pricing (it is free up to certain limits — find the exact limits)

## Output

Return a **comprehensive markdown report** with:
1. Full inventory of Google API usage in this codebase (file-by-file)
2. Apple Maps API capability matrix (what maps to what)
3. Cost comparison with concrete numbers
4. Recommendation: which parts are safe to migrate, which are risky, which have no Apple equivalent
5. Any React Native / Expo specific notes (e.g. `react-native-maps` supports both providers)


---

**Cursor**

I now have everything needed. Here is the full research report:

---

# Apple Maps API vs. Google Maps API — Migration Analysis

## Executive Summary

This codebase makes **deep, pervasive use of nine distinct Google Maps/Places API features**. Apple Maps Server API covers most of them adequately, with one critical gap: **there is no Apple equivalent to Google Place Photos**. A full migration is feasible but non-trivial, and the Android map display layer will always require Google Maps regardless.

---

## Part 1 — Complete Google API Inventory

### 1.1 Environment Variables

| Variable | Scope | Used for |
|---|---|---|
| `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` | React Native client | Maps SDK (Android), Places Autocomplete, Place Details, Place Photos, Directions |
| `GOOGLE_MAPS_API_KEY` | Supabase Edge Function | Geocoding, Reverse Geocoding, Place Details, Nearby Search, Text Search, Autocomplete, Directions |
| `GEMINI_API_KEY` | Supabase Edge Function | `generativelanguage.googleapis.com` (Gemini LLM — **not a Maps API**, out of scope) |

---

### 1.2 File-by-File API Usage

#### `lib/googlePlaces.ts`

| Function | API | Endpoint |
|---|---|---|
| `fetchGooglePlacePredictions()` | **Places Autocomplete** | `maps.googleapis.com/maps/api/place/autocomplete/json` |
| `fetchGooglePlaceDetails()` | **Place Details** (geometry, photos, address_components) | `maps.googleapis.com/maps/api/place/details/json` |
| `fetchFolderNameFromGoogleCoords()` | **Reverse Geocoding** | `maps.googleapis.com/maps/api/geocode/json` |

Notes: `fetchGooglePlaceDetails` returns `photo_reference` (used downstream to build Place Photo URLs). Falls back to `api.bigdatacloud.net` for country name when Google fails.

---

#### `hooks/useMapLogic.ts`

| Location | API | Detail |
|---|---|---|
| Line 99 | **Places Autocomplete** | Calls `fetchGooglePlacePredictions()` |
| Line 107 | **Place Details** | Calls `fetchGooglePlaceDetails()` |
| Line 149 | **Directions API (walking)** | Calls `fetchWalkingRoutePreview()` |
| Lines 222–224 | **Place Photos** | Constructs URL: `maps.googleapis.com/maps/api/place/photo?maxwidth=1200&photo_reference=${ref}&key=…` |
| Line 62 | Env var | `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` |

---

#### `lib/routing.ts`

| Function | API | Detail |
|---|---|---|
| `fetchWalkingRoutePreview()` | **Directions API** (`mode=walking`) | `maps.googleapis.com/maps/api/directions/json` — decodes Google encoded polyline via `@mapbox/polyline` |
| `fetchMultiStopRoute()` | **Directions API** (`mode=driving`, waypoints) | Same endpoint with `waypoints=place_id:…` — uses Google `place_id` directly |

Both functions depend on Google's **encoded polyline format** (decoded by `@mapbox/polyline`).

---

#### `lib/geocoding.ts`

| Function | API | Detail |
|---|---|---|
| `getFormattedAddressFromCoords()` | **Expo Location** `reverseGeocodeAsync` | Uses the OS-level geocoder (Apple on iOS, Google on Android) — **not a direct Google API call** |
| `getCountryNameFromCoords()` | Same | OS-level reverse geocoding |
| `getFolderNameFromGoogleAddressComponents()` | N/A — parsing only | Parses `address_components` structure from Google responses |

> `lib/geocoding.ts` itself does not make direct Google API calls. It depends on the **Google response format** (the `address_components` schema) when results arrive from `lib/googlePlaces.ts`.

---

#### `components/MemoInfoModal.tsx`

| Location | API | Detail |
|---|---|---|
| Lines 61–68 | **Expo Location** reverse geocode | `getFormattedAddressFromCoords()` for displaying address |
| Lines 121–127 | **Google Maps deep link** | `comgooglemaps://` (native app) or `https://www.google.com/maps/search/?api=1&query=…` (web) |

The Google Maps deep link is a **UI feature** (opens Google Maps for navigation) — not a paid API call.

---

#### `components/RecommendationsCard.tsx`

| Location | API | Detail |
|---|---|---|
| Lines 91–94 | **Google Maps web URL** | `https://www.google.com/maps/search/?api=1&query=…` — opens in browser |

UI-only deep link, not a paid API call.

---

#### `app/onboarding/Home.tsx`

| Location | API | Detail |
|---|---|---|
| Line 29 | **Maps SDK (react-native-maps)** | `import … PROVIDER_GOOGLE from 'react-native-maps'` |
| Line 350 | **Maps SDK** | `<MapView provider={PROVIDER_GOOGLE} …>` |

This makes Android use the **Google Maps SDK** (tile rendering). iOS with `PROVIDER_GOOGLE` also requires the Google Maps SDK pod.

---

#### `app.config.js`

| Location | API | Detail |
|---|---|---|
| Lines 9, 17–19 | **Maps SDK Android** | Injects `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` as `googleMaps.apiKey` into Android manifest |
| Line 22 | **Maps SDK Android** | `AndroidConfig.GoogleMapsApiKey.withGoogleMapsApiKey` Expo config plugin |

---

#### `supabase/functions/plan-agent/index.ts`

| Function | API | Endpoint |
|---|---|---|
| `geocodeDestination()` | **Geocoding (forward)** | `maps.googleapis.com/maps/api/geocode/json?address=…` |
| `getCityName()` | **Reverse Geocoding** | `maps.googleapis.com/maps/api/geocode/json?latlng=…&result_type=locality` |
| `getPlaceDetails()` | **Place Details Pro** | `maps.googleapis.com/maps/api/place/details/json` — requests `geometry, photos, address_components, opening_hours, formatted_address` |
| `finalizeItinerary()` | **Directions API (driving)** with `optimize:true` waypoints | `maps.googleapis.com/maps/api/directions/json` — uses Google's **waypoint order optimization** |

---

#### `supabase/functions/plan-agent/places_search.ts`

| Function | API | Endpoint |
|---|---|---|
| `fetchNearByKeyword()` | **Places Nearby Search** | `maps.googleapis.com/maps/api/place/nearbysearch/json` |
| `fetchTextSearch()` | **Places Text Search** | `maps.googleapis.com/maps/api/place/textsearch/json` |
| `searchPlaceAutocomplete()` | **Places Autocomplete** (location-biased) | `maps.googleapis.com/maps/api/place/autocomplete/json` |

All three functions read `place_id` from results and propagate Google `place_id` values throughout the entire plan-agent pipeline.

---

#### `supabase/functions/plan-agent/locality_filter.ts`

| Function | API | Endpoint |
|---|---|---|
| `reverseGeocodeProfile()` | **Reverse Geocoding** | `maps.googleapis.com/maps/api/geocode/json?latlng=…` — parses `address_components` for locality filtering |

---

#### `app/onboarding/plan.tsx`

| Location | API | Detail |
|---|---|---|
| Lines 41–42, 47–48 | **Place Photos** | `maps.googleapis.com/maps/api/place/photo?maxwidth=1200&photo_reference=${stop.photoReference}&key=…` |

---

#### `components/LibraryModal.tsx`

| Location | API | Detail |
|---|---|---|
| Line 475 | **Place Photos** | `maps.googleapis.com/maps/api/place/photo?maxwidth=1200&photo_reference=…&key=…` |

---

### 1.3 Summary: All Google API Features Used

| Feature | Files |
|---|---|
| **Places Autocomplete** | `googlePlaces.ts`, `useMapLogic.ts`, `places_search.ts` |
| **Place Details** (geometry + photos + address + opening hours) | `googlePlaces.ts`, `places_search.ts` (indirectly), `index.ts` |
| **Place Photos** | `useMapLogic.ts`, `plan.tsx`, `LibraryModal.tsx` |
| **Nearby Search** | `places_search.ts` |
| **Text Search** | `places_search.ts` |
| **Geocoding (forward)** | `index.ts` (`geocodeDestination`) |
| **Reverse Geocoding** | `googlePlaces.ts`, `index.ts` (`getCityName`), `locality_filter.ts` |
| **Directions API** (walking + driving + waypoint optimization) | `routing.ts`, `index.ts` |
| **Maps SDK for Android** (tile rendering) | `Home.tsx`, `app.config.js` |

---

## Part 2 — Apple Maps API Capability Matrix

### 2.1 Apple Maps Server API (REST, server-side)

Available endpoints as of May 2026:

| Endpoint | Description |
|---|---|
| `GET /v1/geocode` | Forward geocoding (address → coordinates) |
| `GET /v1/reverseGeocode` | Reverse geocoding (coordinates → address) |
| `GET /v1/search` | Places search (text + location bias + category filters) |
| `GET /v1/searchAutocomplete` | Search autocomplete |
| `GET /v1/place` | Place lookup by Apple place ID (multiple identifiers) |
| `GET /v1/directions` | Directions (walking, driving, cycling) + ETAs |
| `GET /v1/etas` | Batch ETA calculation |
| `GET /v1/token` | Auth token management |

**Authentication**: JWT signed with an Apple Maps private key. Token expires; requires refresh logic.

**Rate limit**: 25,000 calls/day per team, shared across Apple Maps Server API and MapKit JS combined.

---

### 2.2 MapKit / react-native-maps (on-device, map rendering)

`react-native-maps` supports two providers:

| Provider | Platform | Notes |
|---|---|---|
| `PROVIDER_GOOGLE` | Android + iOS | Requires Google Maps API key on both platforms |
| `PROVIDER_DEFAULT` (Apple MapKit) | **iOS only** | Free, no API key required, works in Expo Go (SDK 51+) |

Apple Maps **does not exist on Android** — Android will always require `PROVIDER_GOOGLE`.

---

## Part 3 — Gap Analysis

### Feature-by-Feature Replacement Assessment

#### ✅ Places Autocomplete → Apple `/v1/searchAutocomplete`

**Replacement quality: Good**

- Returns place names and structured results with Apple place IDs.
- Response shape is different — `place_id` becomes an Apple-specific `Id` (e.g. `I10279085833`).
- **Migration impact**: The entire `PlacePrediction` type and all downstream consumers (`handleSelectPlace`, `searchPlaceAutocomplete` in plan-agent) must switch to Apple place IDs. This cascades through the entire routing and details pipeline because Google `place_id` is used in Directions API `waypoints` and the plan-agent state.

---

#### ✅ Place Details (geometry + address) → Apple `/v1/place`

**Replacement quality: Moderate**

- Returns coordinates, formatted address, category, hours.
- `address_components` structure is different from Google's — `getFolderNameFromGoogleAddressComponents()` in `lib/geocoding.ts` would need rewriting.
- **Opening hours**: Apple `/v1/place` returns `structuredOpeningHours` but the format differs from Google's `weekday_text` array used in `plan-agent/index.ts` (`getPlaceDetails`).

---

#### ❌ Place Photos → **No Apple Equivalent**

**Replacement quality: None**

Apple Maps Server API **has no photo endpoint**. This is the most significant blocker.

Currently used in three places:
- `hooks/useMapLogic.ts` line 222: cover photo for "Save Place" memory
- `app/onboarding/plan.tsx` lines 41–48: cover photos for plan itinerary stops
- `components/LibraryModal.tsx` line 475: cover photo for library place

**Without Place Photos**, saved places and plan stops would always fall back to the placeholder image (`placehold.co/400x400`). The app would lose its visual richness.

**Alternatives to consider**:
1. Keep only the Google Places Photos API key (one endpoint) while migrating everything else to Apple. Photos are billed at $7.00/1,000 requests (1,000/month free).
2. Use a third-party photo service (Foursquare, Unsplash for generic category images, Mapillary, or Wikimedia Commons).
3. Accept placeholder images — only viable if the product does not rely on photo quality.

---

#### ✅ Nearby Search → Apple `/v1/search` with location+radius

**Replacement quality: Good**

- Apple's `/v1/search` accepts `ll` (lat/lng), `radius`, and `q` (text query) parameters.
- Returns rating equivalent via `pointOfInterestCategory` and user count data — but Apple does not return a numeric `rating` like Google's 1–5 star scale.
- **Migration impact**: `RecommendedPlace.rating` and `RecommendedPlace.userRatingsTotal` would be unavailable. The `ItineraryCard` and `RecommendationsCard` UI components display ratings prominently.

---

#### ✅ Text Search → Apple `/v1/search`

**Replacement quality: Good**

Same endpoint as Nearby Search. Same limitation: no numeric rating returned.

---

#### ✅ Geocoding (forward) → Apple `/v1/geocode`

**Replacement quality: Excellent**

Direct drop-in replacement for `geocodeDestination()` in `plan-agent/index.ts`. Response format differs but the data (lat/lng) is equivalent.

---

#### ✅ Reverse Geocoding → Apple `/v1/reverseGeocode`

**Replacement quality: Good**

- Covers `getCityName()`, `getFolderNameFromGoogleCoords()`, and `reverseGeocodeProfile()` in `locality_filter.ts`.
- `lib/geocoding.ts`'s `getFormattedAddressFromCoords()` and `getCountryNameFromCoords()` already use **Expo Location** `reverseGeocodeAsync` (OS-level) — these are already Apple Maps on iOS with zero API cost.
- The `locality_filter.ts` calls Google Reverse Geocoding once per candidate place (up to 18 calls per search query). This is the highest-volume reverse geocoding use in the codebase.

---

#### ⚠️ Directions API (walking + driving) → Apple `/v1/directions`

**Replacement quality: Moderate — requires adapter work**

Apple's Directions API supports walking, driving, and cycling. However:

1. **Polyline format is different.** Apple returns step coordinates as arrays of `[lat, lng]` pairs in each step, **not** Google's encoded polyline string. The `@mapbox/polyline` library in `lib/routing.ts` would be replaced with coordinate extraction logic.
2. **Waypoint optimization.** Google Directions supports `optimize:true` waypoints and returns `waypoint_order` for reordering. Apple Directions accepts waypoints but does not guarantee the same optimization response structure — behavior needs validation.
3. **Apple place IDs in waypoints.** `fetchMultiStopRoute()` passes `place_id:${s.placeId}` directly to Google Directions. Apple Directions uses its own place identifiers.

---

#### ⚠️ Maps SDK (Android tile rendering) → No Apple equivalent on Android

**Replacement quality: None on Android**

`PROVIDER_GOOGLE` in `Home.tsx` is required on Android. Apple MapKit does not exist on Android. This means:

- **iOS**: Remove `provider={PROVIDER_GOOGLE}` → use `PROVIDER_DEFAULT` (Apple Maps). Works in Expo Go SDK 51+. Eliminates the Maps SDK billing on iOS.
- **Android**: Must keep `PROVIDER_GOOGLE`. `AndroidConfig.GoogleMapsApiKey` in `app.config.js` must remain.

Note: Maps SDK for Mobile (`Maps SDK` SKU) is currently **free/unlimited** per Google's pricing table — so keeping Google Maps tiles on Android has no cost.

---

#### ✅ Google Maps deep link (MemoInfoModal, RecommendationsCard) → Apple Maps deep link

**Replacement quality: Excellent**

Swap `comgooglemaps://` → `maps://` (Apple Maps) and `https://www.google.com/maps/search/` → `https://maps.apple.com/?q=`. Both are free UI actions, not paid APIs.

---

## Part 4 — Cost Comparison

### 4.1 Google Maps Platform Pricing (post March 2025)

All prices are USD per 1,000 requests. Free caps reset monthly.

| API Feature | Free Cap/month | Tier 1 (up to 100K) | Tier 2 (100K–500K) | Notes |
|---|---|---|---|---|
| **Places Autocomplete** | 10,000 | $2.83 | $2.27 | Per individual request |
| **Place Details Essentials** (geometry + address only) | 10,000 | $5.00 | $4.00 | No opening_hours/photos |
| **Place Details Pro** (with opening_hours) | 5,000 | $17.00 | $13.60 | Used by plan-agent |
| **Nearby Search Pro** | 5,000 | $32.00 | $25.60 | Used by plan-agent |
| **Text Search Pro** | 5,000 | $32.00 | $25.60 | Used as fallback |
| **Place Photos** | 1,000 | $7.00 | $5.60 | Used in 3 files |
| **Geocoding** | 10,000 | $5.00 | $4.00 | Forward + reverse |
| **Directions (Legacy)** | 10,000 | $5.00 | $4.00 | Walking + driving |
| **Maps SDK for Mobile** | Unlimited | Free | Free | Android tile rendering |

**Highest-cost APIs in this codebase**: Nearby Search Pro ($32/1K) and Text Search Pro ($32/1K) — both used extensively by the plan-agent for every recommendation query.

---

### 4.2 Apple Maps Server API Pricing (2026)

| Tier | Cost | Details |
|---|---|---|
| **Free** | $0 | 25,000 calls/day shared across all Apple Maps Server API endpoints + MapKit JS |
| **Over limit** | Contact Apple | HTTP 429 returned; quota increase via Apple Developer request form |
| **Billing model** | Not publicly disclosed | Apple has not published a pay-as-you-go pricing table |

**25,000 calls/day = ~750,000 calls/month** at no cost. For a growing app where each plan-agent request triggers ~5–10 API calls (autocomplete + nearby search + place details × N stops + reverse geocode + directions), this covers roughly **75,000–150,000 plan-agent interactions per month for free**.

**Key caveat**: Once you hit 25,000 calls/day, requests fail with HTTP 429. There is no automatic pay-as-you-go overflow — you must pre-negotiate a quota increase with Apple. This makes Apple Maps unsuitable as a drop-in for high-scale apps without prior planning.

---

### 4.3 Cost Comparison Scenario

Assuming a moderately active app with 10,000 monthly active users averaging 3 plan-agent sessions each (30,000 sessions/month), and each session triggering:
- 5 autocomplete requests
- 3 nearby/text searches
- 3 place details fetches
- 1 directions call
- 1 photo fetch per stop (3 stops)

That's roughly **450,000 API calls/month**.

| Provider | Estimated Monthly Cost |
|---|---|
| **Google Maps Platform** | ~$1,200–$1,800/month (dominated by Nearby Search Pro at $32/1K) |
| **Apple Maps Server API** | **$0** (450,000 calls/month is well under 750,000/month free cap) |

The cost advantage of Apple Maps is **substantial** at typical indie/small-team scale. The break-even point where Google's free caps cover the same usage is far below 30,000 plan sessions/month.

---

## Part 5 — Recommendation

### 5.1 Safe to Migrate (Low Risk)

| Feature | Apple Replacement | Effort |
|---|---|---|
| **Forward Geocoding** (`geocodeDestination`) | `/v1/geocode` | Low — response shape adapter |
| **Reverse Geocoding** (`getCityName`, `locality_filter`) | `/v1/reverseGeocode` | Low — response shape adapter |
| **Maps tile display on iOS** | `PROVIDER_DEFAULT` in `react-native-maps` | Very low — remove one prop |
| **Google Maps deep links** (MemoInfoModal, RecommendationsCard) | `maps://` Apple Maps links | Very low |
| **"Open in Google Maps" button** | "Open in Apple Maps" | UX decision only |

---

### 5.2 Migratable but Requires Significant Adapter Work

| Feature | Apple Replacement | Effort | Risk |
|---|---|---|---|
| **Places Autocomplete** | `/v1/searchAutocomplete` | Medium — type changes cascade through `PlacePrediction`, `useMapLogic`, `SearchBar`, `places_search.ts` | **Place ID incompatibility** — all downstream routing and detail calls must also switch |
| **Nearby Search + Text Search** | `/v1/search` | Medium — result mapping, loss of numeric rating | Plan-agent recommendation quality may change; `RecommendationsCard` star ratings would be unavailable |
| **Place Details** | `/v1/place` | Medium — `opening_hours` format change, `address_components` structure change | Plan-agent's opening hours warnings would need rewrite |
| **Directions API** (walking + driving) | `/v1/directions` | Medium-High — polyline decoding must be replaced; waypoint optimization behavior must be validated | Regression risk in `routing.ts` and `finalizeItinerary` |

---

### 5.3 No Apple Equivalent — Must Keep Google or Find Alternative

| Feature | Status | Recommendation |
|---|---|---|
| **Place Photos** | **No Apple equivalent** | Keep Google Places Photos API key only for photo fetches; or switch to a third-party image source (Foursquare, Unsplash by category) |
| **Android Map Tiles** | Apple Maps is iOS-only | Keep `PROVIDER_GOOGLE` on Android; Google Maps SDK is currently free |
| **Numeric place ratings** | Apple Search API does not return a 1–5 star rating | Hide/remove rating UI when on Apple Maps path, or use Foursquare API for ratings |

---

### 5.4 Strategic Recommendation

**A hybrid approach is optimal:**

1. **Migrate geocoding** (forward + reverse) to Apple Maps Server API. This eliminates the highest-volume, most straightforward calls.

2. **Migrate the search + autocomplete** pipeline to Apple Maps Server API for the plan-agent and map search bar. Replace `place_id` throughout with Apple place IDs. This eliminates the most expensive SKUs (Nearby Search Pro at $32/1K, Text Search Pro at $32/1K).

3. **Keep Google only for Place Photos.** The photo endpoint is the only one with no Apple alternative. At 1,000 free/month + $7/1,000, this is also the cheapest Google SKU used.

4. **Keep `PROVIDER_GOOGLE` on Android** (it's free and has no alternative).

5. **Switch iOS to `PROVIDER_DEFAULT`** (remove `PROVIDER_GOOGLE` on iOS) — eliminates need for Google Maps iOS SDK configuration.

---

## Part 6 — React Native / Expo Specific Notes

- **`react-native-maps` dual-provider support**: The library supports both providers simultaneously. You can use `Platform.OS === 'ios' ? undefined : PROVIDER_GOOGLE` for the `provider` prop to use Apple Maps on iOS and Google on Android with a single `MapView` component.
- **Expo Go (SDK 51+)**: `PROVIDER_GOOGLE` is **no longer supported in Expo Go on iOS** as of SDK 51. Using `PROVIDER_DEFAULT` (or omitting the prop) is the correct approach for Expo Go iOS testing.
- **Apple Maps Server API JWT auth**: Requires generating a JWT from an ES256 private key (`MapsPrivateKey`). This must be done server-side (the Supabase Edge Function is the right place). The client must never hold the private key.
- **Apple place IDs are opaque strings** starting with `I` followed by digits (e.g. `I10279085833`). They are stable but format differently from Google's `ChIJ…` place IDs. Your `PlanStop`, `RecommendedPlace`, and `PlacePrediction` types would need schema comments indicating which ID system is active.
- **Expo `Location.reverseGeocodeAsync`** already uses Apple's geocoder on iOS — so `lib/geocoding.ts`'s `getFormattedAddressFromCoords` and `getCountryNameFromCoords` are **already free and Apple-native on iOS** with no changes needed.
- **`@mapbox/polyline`** (used in `lib/routing.ts`) is a Google-specific encoding library. If migrating Directions to Apple, this dependency can be removed.

---

Here are the key findings from the full analysis:

**9 Google Maps API features** are used across 11 files. The critical points:

**The one hard blocker**: `Place Photos` — three files (`useMapLogic.ts`, `plan.tsx`, `LibraryModal.tsx`) construct `maps.googleapis.com/maps/api/place/photo?…` URLs. Apple Maps Server API has no photo endpoint. Without this, all saved place memories fall back to a placeholder image.

**The biggest cost driver**: The plan-agent's `Nearby Search Pro` and `Text Search Pro` at **$32/1,000 requests** (5,000/month free cap). A hybrid migration to Apple Maps for these alone eliminates the dominant cost.

**Android is stuck on Google**: `PROVIDER_GOOGLE` in `Home.tsx` and `app.config.js`. Apple Maps is iOS-only — but the Maps SDK itself is already free per Google's pricing table.

**Already free on iOS**: `lib/geocoding.ts`'s `getFormattedAddressFromCoords` and `getCountryNameFromCoords` use Expo Location's `reverseGeocodeAsync` — which already uses Apple's geocoder on iOS at zero cost.

**Recommended hybrid strategy**:
1. Migrate geocoding + reverse geocoding → Apple `/v1/geocode` + `/v1/reverseGeocode`
2. Migrate search + autocomplete → Apple `/v1/search` + `/v1/searchAutocomplete` (eliminates $32/1K Nearby/Text Search)
3. Keep Google **only** for Place Photos ($7/1K, 1K free/month)
4. Switch iOS `MapView` to `PROVIDER_DEFAULT` (remove `PROVIDER_GOOGLE` on iOS)
5. Keep `PROVIDER_GOOGLE` on Android (free anyway)

