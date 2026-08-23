import { fetchGooglePlaceDetails, fetchGooglePlacePredictions } from '@/lib/googlePlaces';
import { supabase } from '@/lib/supabase';
import type { ModalImportResult, ModalPlace } from '@/types/videoImport';
import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { AppState } from 'react-native';
import { useAuth } from './AuthContext';

const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const PLACEHOLDER_PHOTO = 'https://placehold.co/400x400/e2e8f0/94a3b8.png?text=?';
/** Orphaned server jobs (edge wall-clock killed background work without updating the row). */
const STALE_JOB_MS = 10 * 60 * 1000;
const STALE_JOB_ERROR =
    'Import timed out on the server. Tap Retry — Instagram reels finish much faster than photo posts.';
const POLL_INTERVAL_MS = 3_000;
const NETWORK_ERROR_LOG_COOLDOWN_MS = 60_000;

function isTransientNetworkError(message: string): boolean {
    const lower = message.toLowerCase();
    return (
        lower.includes('network request failed')
        || lower.includes('failed to fetch')
        || lower.includes('network error')
        || lower.includes('aborted')
    );
}

export interface ResolvedPlaceData {
    placeId: string;
    lat: number;
    lng: number;
    photoReference: string | null;
    photoUri: string;
    country: string | null;
}

export type ImportJobStatus = 'loading' | 'done' | 'error';

export interface ImportJob {
    id: string;
    url: string;
    status: ImportJobStatus;
    result: ModalImportResult | null;
    error: string | null;
    savedKeys: string[];
    resolvedPlaces: Record<string, ResolvedPlaceData | null>;
    enqueuedAt: string;
}

interface ImportQueueContextType {
    jobs: ImportJob[];
    enqueueUrl: (url: string) => void;
    retryJob: (jobId: string) => void;
    markSaved: (jobId: string, key: string) => void;
    removeJob: (jobId: string) => void;
    clearDoneJobs: () => void;
    /** Re-fetch active jobs from DB (use while Import tab is open). */
    refreshJobs: () => void;
}

const ImportQueueContext = createContext<ImportQueueContextType | undefined>(undefined);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dbStatusToLocal(dbStatus: string): ImportJobStatus {
    if (dbStatus === 'done') return 'done';
    if (dbStatus === 'error') return 'error';
    return 'loading'; // pending | processing → loading
}

function isStaleDbRow(status: string, updatedAt: string): boolean {
    if (status !== 'pending' && status !== 'processing') return false;
    return Date.now() - new Date(updatedAt).getTime() > STALE_JOB_MS;
}

function rowToImportJob(row: {
    id: string;
    url: string;
    status: string;
    result: ModalImportResult | null;
    error: string | null;
    created_at: string;
    updated_at: string;
}): ImportJob {
    if (isStaleDbRow(row.status, row.updated_at)) {
        return {
            id: row.id,
            url: row.url,
            status: 'error',
            result: null,
            error: STALE_JOB_ERROR,
            savedKeys: [],
            resolvedPlaces: {},
            enqueuedAt: row.created_at,
        };
    }
    return {
        id: row.id,
        url: row.url,
        status: dbStatusToLocal(row.status),
        result: row.result ?? null,
        error: row.error ?? null,
        savedKeys: [],
        resolvedPlaces: {},
        enqueuedAt: row.created_at,
    };
}

async function markStaleJobFailed(jobId: string): Promise<void> {
    await supabase
        .from('video_import_jobs')
        .update({ status: 'error', error: STALE_JOB_ERROR })
        .eq('id', jobId);
}

// ─── Provider ────────────────────────────────────────────────────────────────

const REALTIME_USER_FILTER = (userId: string) => `user_id=eq.${userId}`;

export function ImportQueueProvider({ children }: { children: React.ReactNode }) {
    const { user, session } = useAuth();
    const [jobs, setJobs] = useState<ImportJob[]>([]);
    const enqueuingUrlsRef = useRef<Set<string>>(new Set());
    const jobsRef = useRef<ImportJob[]>([]);
    const refreshInFlightRef = useRef(false);
    const lastNetworkErrorLogAtRef = useRef(0);
    jobsRef.current = jobs;

    // ── Google Places resolution (still client-side) ──────────────────────────

    const resolvePlacesForJob = useCallback(async (jobId: string, places: ModalPlace[]) => {
        for (const place of places) {
            const key = place.maps_search_hint;
            try {
                const predictions = await fetchGooglePlacePredictions(place.maps_search_hint, GOOGLE_API_KEY);
                const first = predictions[0];
                if (!first) {
                    setJobs(prev => prev.map(j => j.id === jobId
                        ? { ...j, resolvedPlaces: { ...j.resolvedPlaces, [key]: null } }
                        : j
                    ));
                    continue;
                }
                const details = await fetchGooglePlaceDetails(first.place_id, place.name, GOOGLE_API_KEY);
                if (!details) {
                    setJobs(prev => prev.map(j => j.id === jobId
                        ? { ...j, resolvedPlaces: { ...j.resolvedPlaces, [key]: null } }
                        : j
                    ));
                    continue;
                }
                const photoUri = details.photoReference && GOOGLE_API_KEY
                    ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${details.photoReference}&key=${GOOGLE_API_KEY}`
                    : PLACEHOLDER_PHOTO;
                setJobs(prev => prev.map(j => j.id === jobId
                    ? {
                        ...j,
                        resolvedPlaces: {
                            ...j.resolvedPlaces,
                            [key]: {
                                placeId: first.place_id,
                                lat: details.latitude,
                                lng: details.longitude,
                                photoReference: details.photoReference,
                                photoUri,
                                country: details.country,
                            },
                        },
                    }
                    : j
                ));
            } catch {
                setJobs(prev => prev.map(j => j.id === jobId
                    ? { ...j, resolvedPlaces: { ...j.resolvedPlaces, [key]: null } }
                    : j
                ));
            }
        }
    }, []);

    // ── Load existing jobs from DB on login ───────────────────────────────────

    useEffect(() => {
        if (!user) {
            setJobs([]);
            return;
        }

        supabase
            .from('video_import_jobs')
            .select('*')
            .eq('user_id', user.id)
            .neq('status', 'error')
            .order('created_at', { ascending: false })
            .limit(20)
            .then(({ data }) => {
                if (!data) return;
                const loaded: ImportJob[] = data.map((row: {
                    id: string;
                    url: string;
                    status: string;
                    result: ModalImportResult | null;
                    error: string | null;
                    created_at: string;
                    updated_at: string;
                }) => rowToImportJob(row));
                for (const row of data) {
                    if (isStaleDbRow(row.status, row.updated_at)) {
                        void markStaleJobFailed(row.id);
                    }
                }
                setJobs(loaded);
                // Kick off Google Places for any already-done jobs
                loaded.forEach(job => {
                    if (job.status === 'done' && job.result && job.result.places.length > 0) {
                        void resolvePlacesForJob(job.id, job.result.places);
                    }
                });
            });
    }, [user, resolvePlacesForJob]);

    // ── Realtime: INSERT (e.g. share extension) + UPDATE (Edge Function progress) ─

    useEffect(() => {
        if (!user) return;

        let channel: ReturnType<typeof supabase.channel> | null = null;
        let cancelled = false;

        const mergeRowIntoJobs = (
            prev: ImportJob[],
            row: Record<string, unknown>,
        ): ImportJob[] => {
            const job = rowToImportJob({
                id: row.id as string,
                url: row.url as string,
                status: row.status as string,
                result: (row.result ?? null) as ModalImportResult | null,
                error: (row.error ?? null) as string | null,
                created_at: row.created_at as string,
                updated_at: row.updated_at as string,
            });
            const exists = prev.some(j => j.id === job.id);
            const base = exists ? prev : [job, ...prev];
            return base.map(j => {
                if (j.id !== job.id) return j;
                const merged = { ...job, savedKeys: j.savedKeys, resolvedPlaces: j.resolvedPlaces };
                if (
                    j.status === 'loading'
                    && merged.status === 'done'
                    && merged.result
                    && merged.result.places.length > 0
                ) {
                    void resolvePlacesForJob(merged.id, merged.result.places);
                }
                return merged;
            });
        };

        const setup = async () => {
            const accessToken = session?.access_token;
            if (!accessToken || cancelled) return;
            await supabase.realtime.setAuth(accessToken);
            if (cancelled) return;

            const rowFilter = REALTIME_USER_FILTER(user.id);

            channel = supabase
                .channel(`import-jobs:${user.id}`)
                .on(
                    'postgres_changes',
                    {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'video_import_jobs',
                        filter: rowFilter,
                    },
                    (payload) => {
                        const row = payload.new as Record<string, unknown>;
                        setJobs(prev => mergeRowIntoJobs(prev, row));
                    },
                )
                .on(
                    'postgres_changes',
                    {
                        event: 'UPDATE',
                        schema: 'public',
                        table: 'video_import_jobs',
                        filter: rowFilter,
                    },
                    (payload) => {
                        const row = payload.new as Record<string, unknown>;
                        setJobs(prev => mergeRowIntoJobs(prev, row));
                    },
                )
                .subscribe((status, err) => {
                    if (status === 'CHANNEL_ERROR') {
                        console.warn(
                            '[ImportQueue] realtime channel error (imports still sync via polling):',
                            err?.message ?? 'unknown',
                        );
                    }
                });
        };

        void setup();

        return () => {
            cancelled = true;
            if (channel) void supabase.removeChannel(channel);
        };
    }, [user, session?.access_token, resolvePlacesForJob]);

    // Full sync from DB — avoids broken .in('id', ['temp-…']) polls and missed Realtime events
    const refreshJobs = useCallback(async () => {
        if (!user) return;
        if (!SUPABASE_URL) return;
        if (AppState.currentState !== 'active') return;
        if (refreshInFlightRef.current) return;

        refreshInFlightRef.current = true;

        let data:
            | Array<{
                id: string;
                url: string;
                status: string;
                result: ModalImportResult | null;
                error: string | null;
                created_at: string;
                updated_at: string;
            }>
            | null = null;
        let error: { message: string } | null = null;

        try {
            const result = await supabase
                .from('video_import_jobs')
                .select('id, url, status, result, error, created_at, updated_at')
                .eq('user_id', user.id)
                .neq('status', 'error')
                .order('created_at', { ascending: false })
                .limit(20);
            data = result.data;
            error = result.error;
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            if (isTransientNetworkError(message)) {
                const now = Date.now();
                if (now - lastNetworkErrorLogAtRef.current > NETWORK_ERROR_LOG_COOLDOWN_MS) {
                    lastNetworkErrorLogAtRef.current = now;
                    console.warn('[ImportQueue] refreshJobs: offline or unreachable, will retry');
                }
            } else {
                console.error('[ImportQueue] refreshJobs:', message);
            }
            return;
        } finally {
            refreshInFlightRef.current = false;
        }

        if (error) {
            if (isTransientNetworkError(error.message)) {
                const now = Date.now();
                if (now - lastNetworkErrorLogAtRef.current > NETWORK_ERROR_LOG_COOLDOWN_MS) {
                    lastNetworkErrorLogAtRef.current = now;
                    console.warn('[ImportQueue] refreshJobs: offline or unreachable, will retry');
                }
            } else {
                console.error('[ImportQueue] refreshJobs:', error.message);
            }
            return;
        }
        if (!data) return;

        for (const row of data) {
            if (isStaleDbRow(row.status, row.updated_at)) {
                void markStaleJobFailed(row.id);
            }
        }

        const prev = jobsRef.current;

        setJobs(() => {
            const prevById = new Map(prev.map(j => [j.id, j]));
            const prevByUrl = new Map(prev.map(j => [j.url, j]));

            const synced = data.map(row => {
                const old = prevById.get(row.id) ?? prevByUrl.get(row.url);
                const next = rowToImportJob(row);
                return {
                    ...next,
                    savedKeys: old?.savedKeys ?? [],
                    resolvedPlaces: old?.resolvedPlaces ?? {},
                };
            });

            const temps = prev.filter(
                j => j.id.startsWith('temp-') && !data.some(r => r.url === j.url),
            );

            return [...temps, ...synced];
        });

        for (const row of data) {
            const old = prev.find(j => j.id === row.id || j.url === row.url);
            const job = rowToImportJob(row);
            if (
                old?.status === 'loading'
                && job.status === 'done'
                && job.result
                && job.result.places.length > 0
            ) {
                void resolvePlacesForJob(job.id, job.result.places);
            }
        }
    }, [user, resolvePlacesForJob]);

    useEffect(() => {
        if (!user) return;

        void refreshJobs();

        const interval = setInterval(() => {
            const hasLoading = jobsRef.current.some(j => j.status === 'loading');
            if (!hasLoading || AppState.currentState !== 'active') return;
            void refreshJobs();
        }, POLL_INTERVAL_MS);

        const appStateSub = AppState.addEventListener('change', state => {
            if (state !== 'active') return;
            const hasLoading = jobsRef.current.some(j => j.status === 'loading');
            if (hasLoading) void refreshJobs();
        });

        return () => {
            clearInterval(interval);
            appStateSub.remove();
        };
    }, [user, refreshJobs]);

    // ── Public actions ────────────────────────────────────────────────────────

    const enqueueUrl = useCallback(async (url: string) => {
        if (!user) return;
        if (enqueuingUrlsRef.current.has(url)) return;
        enqueuingUrlsRef.current.add(url);

        // Optimistically add a loading job so the UI responds immediately
        const tempId = `temp-${Date.now()}`;
        const optimisticJob: ImportJob = {
            id: tempId,
            url,
            status: 'loading',
            result: null,
            error: null,
            savedKeys: [],
            resolvedPlaces: {},
            enqueuedAt: new Date().toISOString(),
        };
        setJobs(prev => [optimisticJob, ...prev]);

        try {
            const session = await supabase.auth.getSession();
            const token = session.data.session?.access_token;
            if (!token) throw new Error('Not authenticated');

            const res = await fetch(`${SUPABASE_URL}/functions/v1/import-video-job`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'apikey': SUPABASE_ANON_KEY,
                },
                body: JSON.stringify({ url }),
            });

            if (!res.ok) {
                const text = await res.text().catch(() => '');
                throw new Error(`Failed to queue import: ${text.slice(0, 100)}`);
            }

            const { jobId } = await res.json();

            // Replace optimistic job with real DB-backed job
            setJobs(prev => prev.map(j => j.id === tempId
                ? { ...j, id: jobId }
                : j
            ));
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to queue import.';
            setJobs(prev => prev.map(j => j.id === tempId
                ? { ...j, status: 'error', error: errorMessage }
                : j
            ));
        } finally {
            enqueuingUrlsRef.current.delete(url);
        }
    }, [user]);

    const retryJob = useCallback((jobId: string) => {
        setJobs(prev => {
            const job = prev.find(j => j.id === jobId);
            if (!job) return prev;
            // Remove from local state and re-enqueue with the same URL
            void supabase.from('video_import_jobs').delete().eq('id', jobId);
            void enqueueUrl(job.url);
            return prev.filter(j => j.id !== jobId);
        });
    }, [enqueueUrl]);

    const markSaved = useCallback((jobId: string, key: string) => {
        setJobs(prev => prev.map(j => j.id === jobId
            ? { ...j, savedKeys: j.savedKeys.includes(key) ? j.savedKeys : [...j.savedKeys, key] }
            : j
        ));
    }, []);

    const removeJob = useCallback((jobId: string) => {
        setJobs(prev => prev.filter(j => j.id !== jobId));
        void supabase.from('video_import_jobs').delete().eq('id', jobId);
    }, []);

    const clearDoneJobs = useCallback(async () => {
        // Filter UI first so the user sees instant feedback
        setJobs(prev => prev.filter(j => j.status !== 'done'));
        if (!user) return;
        // Delete by status for this user — more reliable than collecting IDs
        // inside a state updater where errors would be silently swallowed
        const { error } = await supabase
            .from('video_import_jobs')
            .delete()
            .eq('user_id', user.id)
            .eq('status', 'done');
        if (error) console.error('[ImportQueue] clearDoneJobs delete error:', error.message);
    }, [user]);

    const value = useMemo<ImportQueueContextType>(() => ({
        jobs,
        enqueueUrl,
        retryJob,
        markSaved,
        removeJob,
        clearDoneJobs,
        refreshJobs: () => void refreshJobs(),
    }), [jobs, enqueueUrl, retryJob, markSaved, removeJob, clearDoneJobs, refreshJobs]);

    return (
        <ImportQueueContext.Provider value={value}>
            {children}
        </ImportQueueContext.Provider>
    );
}

export function useImportQueue(): ImportQueueContextType {
    const ctx = useContext(ImportQueueContext);
    if (!ctx) throw new Error('useImportQueue must be used inside ImportQueueProvider');
    return ctx;
}
