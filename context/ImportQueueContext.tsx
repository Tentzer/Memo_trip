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
import { useAuth } from './AuthContext';

const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const PLACEHOLDER_PHOTO = 'https://placehold.co/400x400/e2e8f0/94a3b8.png?text=?';

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
}

const ImportQueueContext = createContext<ImportQueueContextType | undefined>(undefined);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dbStatusToLocal(dbStatus: string): ImportJobStatus {
    if (dbStatus === 'done') return 'done';
    if (dbStatus === 'error') return 'error';
    return 'loading'; // pending | processing → loading
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function ImportQueueProvider({ children }: { children: React.ReactNode }) {
    const { user } = useAuth();
    const [jobs, setJobs] = useState<ImportJob[]>([]);
    // Track in-flight enqueues to prevent duplicate submissions
    const enqueuingUrlsRef = useRef<Set<string>>(new Set());

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
                const loaded: ImportJob[] = data.map((row: any) => ({
                    id: row.id,
                    url: row.url,
                    status: dbStatusToLocal(row.status),
                    result: row.result ?? null,
                    error: row.error ?? null,
                    savedKeys: [],
                    resolvedPlaces: {},
                    enqueuedAt: row.created_at,
                }));
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

        const mapRowToJob = (row: Record<string, unknown>): ImportJob => ({
            id: row.id as string,
            url: row.url as string,
            status: dbStatusToLocal(row.status as string),
            result: (row.result ?? null) as ModalImportResult | null,
            error: (row.error ?? null) as string | null,
            savedKeys: [],
            resolvedPlaces: {},
            enqueuedAt: row.created_at as string,
        });

        const applyDoneResolution = (row: Record<string, unknown>) => {
            const status = dbStatusToLocal(row.status as string);
            const result: ModalImportResult | null = (row.result ?? null) as ModalImportResult | null;
            if (status === 'done' && result && result.places.length > 0) {
                void resolvePlacesForJob(row.id as string, result.places);
            }
        };

        const channel = supabase
            .channel(`import-jobs:${user.id}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'video_import_jobs',
                    filter: `user_id=eq.${user.id}`,
                },
                (payload) => {
                    const row = payload.new as Record<string, unknown>;
                    const job = mapRowToJob(row);
                    setJobs(prev => {
                        if (prev.some(j => j.id === job.id)) return prev;
                        return [job, ...prev];
                    });
                    applyDoneResolution(row);
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'video_import_jobs',
                    filter: `user_id=eq.${user.id}`,
                },
                (payload) => {
                    const row = payload.new as Record<string, unknown>;
                    const status = dbStatusToLocal(row.status as string);
                    const result: ModalImportResult | null = (row.result ?? null) as ModalImportResult | null;

                    setJobs(prev => {
                        const exists = prev.some(j => j.id === row.id);
                        if (!exists) {
                            return [mapRowToJob(row), ...prev];
                        }
                        return prev.map(j => j.id === row.id
                            ? { ...j, status, result, error: (row.error ?? null) as string | null }
                            : j
                        );
                    });

                    applyDoneResolution(row);
                }
            )
            .subscribe();

        return () => {
            void supabase.removeChannel(channel);
        };
    }, [user, resolvePlacesForJob]);

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
    }), [jobs, enqueueUrl, retryJob, markSaved, removeJob, clearDoneJobs]);

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
