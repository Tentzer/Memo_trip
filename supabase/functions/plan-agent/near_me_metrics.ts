/**
 * Success criteria for monitoring "near me" quality (instrument with your analytics backend).
 *
 * - reportRadiusMeters: standard bucket for "% of pins within Xm of user".
 * - hardCapForMonitoringMeters: results beyond policy max should trend to ~0% after retrieval fixes.
 */
export const NEAR_ME_METRICS = {
    /** Primary dashboard bucket (align with PLAN_AGENT_NEAR_ME_HARD_MAX_METERS when possible). */
    reportRadiusMeters: 3000,
    /** Upper bound typically used before hard-dropping outliers in diagnostics. */
    hardCapForMonitoringMeters: 5000,
} as const;

function median(sorted: readonly number[]): number {
    const n = sorted.length;
    if (n === 0) return NaN;
    const mid = Math.floor(n / 2);
    if (n % 2 !== 0) return sorted[mid]!;
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Share of distances within `withinMeters`; median distance across non-empty inputs. */
export function nearMeDiagnostics(
    distancesMeters: readonly number[],
    withinMeters = NEAR_ME_METRICS.reportRadiusMeters,
): { fractionWithinBucket: number; medianMeters: number; count: number } {
    const n = distancesMeters.length;
    if (n === 0) {
        return { fractionWithinBucket: 0, medianMeters: NaN, count: 0 };
    }
    let within = 0;
    for (const d of distancesMeters) {
        if (d <= withinMeters) within += 1;
    }
    const sorted = [...distancesMeters].sort((a, b) => a - b);
    return {
        fractionWithinBucket: within / n,
        medianMeters: median(sorted),
        count: n,
    };
}
