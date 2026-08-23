import ImportCandidateCard from '@/components/ImportCandidateCard';
import { useAuth } from '@/context/AuthContext';
import { type ImportJob, type ResolvedPlaceData, useImportQueue } from '@/context/ImportQueueContext';
import { useMemories } from '@/context/MemoryContext';
import { useAppTheme } from '@/context/ThemeContext';
import { fetchGooglePlaceDetails, fetchGooglePlacePredictions } from '@/lib/googlePlaces';
import { hasDuplicateInCountryFolder } from '@/lib/placeMemoryDuplicate';
import { alertRequireSignIn } from '@/lib/requireSignInAlert';
import { hasShareExtensionAccessToken } from '@/lib/shareExtensionAuthSync';
import { SHARE_VIDEO_URL_PATTERN } from '@/lib/extractShareVideoUrl';
import type { ModalPlace } from '@/types/videoImport';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const PLACEHOLDER_PHOTO = 'https://placehold.co/400x400/e2e8f0/94a3b8.png?text=?';
const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
const PLATFORMS = ['TikTok', 'Instagram', 'Facebook'];

interface BatchProps {
    job: ImportJob;
    savingKey: string | null;
    saveErrors: Record<string, string>;
    onAdd: (place: ModalPlace) => void;
    onAddAll: () => void;
    onRetry: () => void;
    onDismiss: () => void;
}

function ImportBatch({ job, savingKey, saveErrors, onAdd, onAddAll, onRetry, onDismiss }: BatchProps) {
    const { theme } = useAppTheme();
    const styles = useMemo(() => createStyles(theme.colors), [theme.colors]);

    const allSaved = !!job.result
        && job.result.places.length > 0
        && job.result.places.every(p => job.savedKeys.includes(p.maps_search_hint));

    return (
        <View style={styles.batch}>
            <View style={styles.batchHeader}>
                <View style={styles.batchHeaderLeft}>
                    {job.status === 'loading' && (
                        <ActivityIndicator size="small" color={theme.colors.accent} style={{ marginRight: 8 }} />
                    )}
                    {job.status === 'error' && (
                        <Ionicons name="alert-circle-outline" size={18} color="#EF4444" style={{ marginRight: 8 }} />
                    )}
                    {job.status === 'done' && (
                        <Ionicons name="film-outline" size={16} color={theme.colors.textMuted} style={{ marginRight: 6 }} />
                    )}
                    <Text style={styles.batchTitle} numberOfLines={1}>
                        {job.status === 'loading'
                            ? 'Analyzing video...'
                            : job.status === 'error'
                            ? 'Import failed'
                            : job.result?.title || 'Untitled video'}
                    </Text>
                </View>
                <View style={styles.batchHeaderRight}>
                    {job.status === 'done' && job.result && job.result.places.length > 1 && (
                        <TouchableOpacity
                            onPress={onAddAll}
                            disabled={allSaved || !!savingKey}
                            style={[styles.addAllBtn, allSaved && styles.addAllBtnDone]}
                        >
                            <Ionicons
                                name={allSaved ? 'checkmark-done' : 'add-circle-outline'}
                                size={14}
                                color="#fff"
                            />
                            <Text style={styles.addAllText}>
                                {allSaved ? 'All added' : 'Add all'}
                            </Text>
                        </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={onDismiss} hitSlop={8} style={{ marginLeft: 6 }}>
                        <Ionicons name="close" size={18} color={theme.colors.textMuted} />
                    </TouchableOpacity>
                </View>
            </View>

            {job.status === 'error' && (
                <View style={styles.batchError}>
                    <Text style={styles.errorText}>{job.error}</Text>
                    <TouchableOpacity onPress={onRetry} style={styles.retryBtn}>
                        <Ionicons name="refresh-outline" size={14} color="#3B82F6" />
                        <Text style={styles.retryText}>Retry</Text>
                    </TouchableOpacity>
                </View>
            )}

            {job.status === 'loading' && (
                <View style={styles.batchLoading}>
                    <Text style={styles.loadingSubtext}>Downloading, transcribing, and extracting places…</Text>
                </View>
            )}

            {job.status === 'done' && job.result && (
                <>
                    {!!job.result.agent_summary && (
                        <Text style={styles.agentSummary}>{job.result.agent_summary}</Text>
                    )}
                    {job.result.places.length === 0 ? (
                        <Text style={styles.noPlaces}>No places found in this video.</Text>
                    ) : (
                        job.result.places.map(place => (
                            <ImportCandidateCard
                                key={place.maps_search_hint}
                                place={place}
                                photoUri={job.resolvedPlaces[place.maps_search_hint]?.photoUri}
                                isSaving={savingKey === place.maps_search_hint}
                                isSaved={job.savedKeys.includes(place.maps_search_hint)}
                                saveError={saveErrors[place.maps_search_hint] ?? null}
                                onAdd={() => onAdd(place)}
                            />
                        ))
                    )}
                </>
            )}
        </View>
    );
}

export default function VideoImportScreen() {
    const { user } = useAuth();
    const { theme } = useAppTheme();
    const styles = useMemo(() => createStyles(theme.colors), [theme.colors]);
    const { jobs, enqueueUrl, retryJob, markSaved, removeJob, clearDoneJobs, refreshJobs } = useImportQueue();
    const { addPlaceMemory, memories } = useMemories();

    useFocusEffect(
        useCallback(() => {
            void refreshJobs();
        }, [refreshJobs]),
    );

    const [urlInput, setUrlInput] = useState('');
    const [savingKeys, setSavingKeys] = useState<Record<string, string | null>>({});
    const [saveErrors, setSaveErrors] = useState<Record<string, Record<string, string>>>({});

    const isValidUrl = useMemo(() => SHARE_VIDEO_URL_PATTERN.test(urlInput), [urlInput]);
    const [shareExtAuthReady, setShareExtAuthReady] = useState(false);
    useFocusEffect(
        useCallback(() => {
            if (__DEV__ && Platform.OS === 'ios') {
                setShareExtAuthReady(hasShareExtensionAccessToken());
            }
        }, []),
    );

    const resolvePlace = useCallback(async (place: ModalPlace): Promise<ResolvedPlaceData> => {
        const predictions = await fetchGooglePlacePredictions(place.maps_search_hint, GOOGLE_API_KEY);
        const first = predictions[0];
        if (!first) throw new Error(`"${place.name}" not found on Google Maps.`);
        const details = await fetchGooglePlaceDetails(first.place_id, place.name, GOOGLE_API_KEY);
        if (!details) throw new Error(`Could not load details for "${place.name}".`);
        const photoUri = details.photoReference && GOOGLE_API_KEY
            ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1200&photo_reference=${details.photoReference}&key=${GOOGLE_API_KEY}`
            : PLACEHOLDER_PHOTO;
        return {
            placeId: first.place_id,
            lat: details.latitude,
            lng: details.longitude,
            photoReference: details.photoReference,
            photoUri,
            country: details.country,
        };
    }, []);

    const handleAdd = useCallback(async (job: ImportJob, place: ModalPlace) => {
        if (!user?.id) {
            alertRequireSignIn('Sign in to save imported places to your map.');
            return;
        }
        const key = place.maps_search_hint;
        if (savingKeys[job.id] || job.savedKeys.includes(key)) return;

        setSavingKeys(prev => ({ ...prev, [job.id]: key }));
        setSaveErrors(prev => {
            const jobErrors = { ...(prev[job.id] ?? {}) };
            delete jobErrors[key];
            return { ...prev, [job.id]: jobErrors };
        });

        try {
            const resolved = job.resolvedPlaces[key] ?? await resolvePlace(place);
            const country = resolved.country ?? place.country ?? '';
            if (hasDuplicateInCountryFolder(memories, resolved.lat, resolved.lng, country)) {
                markSaved(job.id, key);
                return;
            }
            await addPlaceMemory(
                resolved.photoUri,
                resolved.lat,
                resolved.lng,
                country,
                place.description || undefined,
                place.name,
                { source: 'video_import', sourceUrl: job.url },
            );
            markSaved(job.id, key);
        } catch (err) {
            setSaveErrors(prev => ({
                ...prev,
                [job.id]: {
                    ...(prev[job.id] ?? {}),
                    [key]: err instanceof Error ? err.message : 'Could not save place.',
                },
            }));
        } finally {
            setSavingKeys(prev => ({ ...prev, [job.id]: null }));
        }
    }, [user?.id, savingKeys, memories, resolvePlace, addPlaceMemory, markSaved]);

    const handleAddAll = useCallback(async (job: ImportJob) => {
        if (!user?.id) {
            alertRequireSignIn('Sign in to save imported places to your map.');
            return;
        }
        const unsaved = job.result?.places.filter(p => !job.savedKeys.includes(p.maps_search_hint)) ?? [];
        for (const place of unsaved) {
            await handleAdd(job, place);
        }
    }, [user?.id, handleAdd]);

    const handleManualImport = useCallback(() => {
        if (!user?.id) {
            alertRequireSignIn(
                'Sign in to analyze a video link and add the places we find to your map.',
                'Unlock import',
            );
            return;
        }
        if (!isValidUrl) return;
        enqueueUrl(urlInput.trim());
        setUrlInput('');
        Keyboard.dismiss();
    }, [user?.id, isValidUrl, urlInput, enqueueUrl]);

    const hasDone = jobs.some(j => j.status === 'done');

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            {__DEV__ && Platform.OS === 'ios' ? (
                <View style={styles.shareExtDevBanner}>
                    <Text style={styles.shareExtDevText}>
                        Share extension auth: {shareExtAuthReady ? 'ready' : 'missing — sign in once'}
                    </Text>
                </View>
            ) : null}
            <KeyboardAvoidingView
                style={styles.flex}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={0}
            >
                {jobs.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Ionicons name="film-outline" size={52} color={theme.colors.borderStrong} />
                        <Text style={styles.emptyTitle}>Import from a video</Text>
                        <Text style={styles.emptySubtitle}>
                            Paste a link or share a reel from Instagram, TikTok, or Facebook using the share sheet.
                        </Text>
                        <View style={styles.chipRow}>
                            {PLATFORMS.map(p => (
                                <View key={p} style={styles.chip}>
                                    <Text style={styles.chipText}>{p}</Text>
                                </View>
                            ))}
                        </View>
                    </View>
                ) : (
                    <ScrollView
                        style={styles.flex}
                        contentContainerStyle={styles.listContent}
                        keyboardShouldPersistTaps="handled"
                        keyboardDismissMode="on-drag"
                    >
                        {hasDone && (
                            <TouchableOpacity onPress={clearDoneJobs} style={styles.clearDoneBtn}>
                                <Text style={styles.clearDoneText}>Clear completed</Text>
                            </TouchableOpacity>
                        )}
                        {jobs.map(job => (
                            <ImportBatch
                                key={job.id}
                                job={job}
                                savingKey={savingKeys[job.id] ?? null}
                                saveErrors={saveErrors[job.id] ?? {}}
                                onAdd={place => void handleAdd(job, place)}
                                onAddAll={() => void handleAddAll(job)}
                                onRetry={() => retryJob(job.id)}
                                onDismiss={() => removeJob(job.id)}
                            />
                        ))}
                    </ScrollView>
                )}

                <View style={styles.inputBar}>
                    <View style={styles.inputWrapper}>
                        <TextInput
                            style={styles.input}
                            value={urlInput}
                            onChangeText={setUrlInput}
                            placeholder="Paste a video link..."
                            placeholderTextColor={theme.colors.placeholder}
                            autoCapitalize="none"
                            autoCorrect={false}
                            keyboardType="url"
                            onSubmitEditing={handleManualImport}
                            returnKeyType="go"
                        />
                        {urlInput.length > 0 && (
                            <TouchableOpacity style={styles.clearBtn} onPress={() => setUrlInput('')}>
                                <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
                            </TouchableOpacity>
                        )}
                    </View>
                    <TouchableOpacity
                        style={[styles.importBtn, !isValidUrl && styles.importBtnDisabled]}
                        onPress={handleManualImport}
                        disabled={!isValidUrl}
                    >
                        <Ionicons name="add" size={22} color="#fff" />
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

type ThemeColors = ReturnType<typeof useAppTheme>['theme']['colors'];

const createStyles = (colors: ThemeColors) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    shareExtDevBanner: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        backgroundColor: colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    shareExtDevText: { fontSize: 11, color: colors.textMuted, textAlign: 'center' },
    flex: { flex: 1 },
    emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 },
    emptyTitle: { fontSize: 22, fontWeight: '700', color: colors.text },
    emptySubtitle: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 21 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 4 },
    chip: { backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 6 },
    chipText: { fontSize: 12, color: colors.textSecondary, fontWeight: '500' },
    listContent: { paddingVertical: 12 },
    clearDoneBtn: { alignSelf: 'flex-end', marginRight: 16, marginBottom: 4 },
    clearDoneText: { fontSize: 12, color: colors.textMuted, fontWeight: '500' },
    batch: {
        marginHorizontal: 12,
        marginBottom: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        overflow: 'hidden',
    },
    batchHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    batchHeaderLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 },
    batchHeaderRight: { flexDirection: 'row', alignItems: 'center', flexShrink: 0 },
    batchTitle: { fontSize: 14, fontWeight: '600', color: colors.text, flex: 1 },
    addAllBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: '#3B82F6',
        borderRadius: 14,
        paddingHorizontal: 10,
        paddingVertical: 5,
    },
    addAllBtnDone: { backgroundColor: '#22c55e' },
    addAllText: { fontSize: 12, fontWeight: '600', color: '#fff' },
    batchError: { paddingHorizontal: 14, paddingVertical: 12, gap: 8 },
    errorText: { fontSize: 13, color: '#EF4444', lineHeight: 18 },
    retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
    retryText: { fontSize: 13, color: '#3B82F6', fontWeight: '600' },
    batchLoading: { paddingHorizontal: 14, paddingVertical: 14 },
    loadingSubtext: { fontSize: 12, color: colors.textMuted },
    agentSummary: { fontSize: 12, color: colors.textMuted, lineHeight: 18, fontStyle: 'italic', paddingHorizontal: 14, paddingTop: 10 },
    noPlaces: { fontSize: 13, color: colors.textMuted, paddingHorizontal: 14, paddingVertical: 12 },
    inputBar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        gap: 8,
        backgroundColor: colors.surface,
    },
    inputWrapper: { flex: 1, position: 'relative', justifyContent: 'center' },
    input: {
        height: 44,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: colors.border,
        paddingHorizontal: 16,
        paddingRight: 36,
        fontSize: 14,
        color: colors.text,
        backgroundColor: colors.input,
    },
    clearBtn: { position: 'absolute', right: 10, padding: 4 },
    importBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#3B82F6',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    importBtnDisabled: { backgroundColor: colors.disabled },
});
