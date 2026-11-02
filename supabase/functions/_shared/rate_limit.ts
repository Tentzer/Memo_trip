import { jsonResponse } from './http.ts';

export const PLAN_AGENT_ENDPOINT = 'plan-agent';
export const IMPORT_VIDEO_ENDPOINT = 'import-video-job';

export const DEFAULT_PLAN_AGENT_DAILY_LIMIT = 40;
export const DEFAULT_IMPORT_VIDEO_DAILY_LIMIT = 20;

const MAX_CONFIGURED_LIMIT = 100_000;

export type RateLimitIncrement = (
    userId: string,
    endpoint: string,
    usageDate: string,
) => Promise<number>;

export function utcDateString(now: Date): string {
    return now.toISOString().slice(0, 10);
}

/** Invalid or empty values use `fallback`. Limits are at least 1. */
export function readDailyLimit(raw: string | undefined, fallback: number): number {
    if (raw == null || raw.trim() === '') return fallback;
    const n = Number.parseInt(raw.trim(), 10);
    if (!Number.isFinite(n) || n < 1 || n > MAX_CONFIGURED_LIMIT) return fallback;
    return n;
}

export function dailyLimitMessage(limit: number, noun: string): string {
    return `Daily limit of ${limit} ${noun} reached. Try again tomorrow.`;
}

/**
 * Increments first, then rejects when the new count is above `limit`.
 * Store failures fail closed with 503 and do not echo the store error.
 */
export async function enforceDailyLimit(
    increment: RateLimitIncrement,
    args: {
        userId: string;
        endpoint: string;
        limit: number;
        now?: Date;
        message?: string;
    },
): Promise<Response | null> {
    const day = utcDateString(args.now ?? new Date());
    let count: number;
    try {
        count = await increment(args.userId, args.endpoint, day);
    } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        console.error('rate limit failed:', detail);
        return jsonResponse({ error: 'Rate limiting is unavailable. Try again later.' }, 503);
    }

    if (count > args.limit) {
        return jsonResponse({
            error: args.message ?? dailyLimitMessage(args.limit, 'requests'),
        }, 429);
    }
    return null;
}
