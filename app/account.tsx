import { useAuth } from '@/context/AuthContext';
import { useAppTheme } from '@/context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function AccountScreen() {
    const { user, loading, logout } = useAuth();
    const { theme } = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme.colors), [theme.colors]);
    const [signingOut, setSigningOut] = React.useState(false);
    const [profileUsername, setProfileUsername] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!user?.id) {
            setProfileUsername(null);
            return;
        }
        let cancelled = false;
        void (async () => {
            const { data } = await supabase
                .from('profiles')
                .select('username')
                .eq('id', user.id)
                .maybeSingle();
            if (cancelled) return;
            const trimmed = data?.username?.trim();
            setProfileUsername(trimmed ? trimmed : null);
        })();
        return () => {
            cancelled = true;
        };
    }, [user?.id]);

    const displayName =
        profileUsername ??
        (typeof user?.user_metadata?.username === 'string'
            ? user.user_metadata.username.trim()
            : null) ??
        user?.email ??
        '';

    const handleLogout = () => {
        Alert.alert('Sign out', 'You will need to sign in again to sync your memos.', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Sign out',
                style: 'destructive',
                onPress: () => {
                    void (async () => {
                        setSigningOut(true);
                        try {
                            await logout();
                            router.replace('/');
                        } finally {
                            setSigningOut(false);
                        }
                    })();
                },
            },
        ]);
    };

    if (loading) {
        return (
            <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
                <View style={styles.loadingBox}>
                    <ActivityIndicator size="large" color={theme.colors.accent} />
                </View>
            </SafeAreaView>
        );
    }

    if (!user) {
        return (
            <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
                <View style={styles.header}>
                    <TouchableOpacity
                        onPress={() => (router.canGoBack() ? router.back() : router.replace('/onboarding/Home'))}
                        style={styles.backButton}
                        hitSlop={12}
                        accessibilityRole="button"
                        accessibilityLabel="Back"
                    >
                        <Ionicons name="chevron-back" size={26} color={theme.colors.accentText} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Account</Text>
                    <View style={styles.headerSpacer} />
                </View>
                <View style={styles.signedOutBox}>
                    <Ionicons name="lock-closed-outline" size={48} color={theme.colors.borderStrong} />
                    <Text style={styles.signedOutTitle}>You are not signed in</Text>
                    <Text style={styles.signedOutHint}>
                        Sign in to sync your memories and manage your subscription.
                    </Text>
                    <TouchableOpacity style={styles.signedOutButton} onPress={() => router.push('/Login')}>
                        <Text style={styles.signedOutButtonLabel}>Sign in</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
            <View style={styles.header}>
                <TouchableOpacity
                    onPress={() => router.back()}
                    style={styles.backButton}
                    hitSlop={12}
                    accessibilityRole="button"
                    accessibilityLabel="Back"
                >
                    <Ionicons name="chevron-back" size={26} color={theme.colors.accentText} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Account</Text>
                <View style={styles.headerSpacer} />
            </View>

            <ScrollView
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
            >
                <View style={styles.profileCard}>
                    <View style={styles.avatarCircle}>
                        <Ionicons name="person" size={36} color={theme.colors.textMuted} />
                    </View>
                    <Text style={styles.profileLabel}>Signed in as</Text>
                    <Text style={styles.profileUsername} numberOfLines={2}>
                        {displayName}
                    </Text>
                </View>

                <Text style={styles.sectionTitle}>Session</Text>
                <View style={styles.sessionCard}>
                    <Text style={styles.sessionHint}>
                        Signing out ends this session on the device. Your data stays with your account in the cloud.
                    </Text>
                    <TouchableOpacity
                        style={[styles.logoutButton, signingOut && styles.logoutButtonDisabled]}
                        onPress={handleLogout}
                        disabled={signingOut || !user}
                        activeOpacity={0.85}
                    >
                        {signingOut ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <View style={styles.logoutRow}>
                                <Ionicons name="log-out-outline" size={22} color="#fff" />
                                <Text style={styles.logoutLabel}>Sign out</Text>
                            </View>
                        )}
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

type ThemeColors = ReturnType<typeof useAppTheme>['theme']['colors'];

const createStyles = (colors: ThemeColors) => StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: colors.background,
    },
    loadingBox: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    signedOutBox: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 32,
        gap: 14,
    },
    signedOutTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: colors.text,
        textAlign: 'center',
    },
    signedOutHint: {
        fontSize: 14,
        lineHeight: 21,
        color: colors.textMuted,
        textAlign: 'center',
    },
    signedOutButton: {
        marginTop: 8,
        paddingHorizontal: 28,
        paddingVertical: 14,
        borderRadius: 24,
        backgroundColor: '#3B82F6',
    },
    signedOutButtonLabel: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 8,
        paddingVertical: 8,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
        backgroundColor: colors.background,
    },
    backButton: {
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: colors.text,
    },
    headerSpacer: {
        width: 44,
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 32,
    },
    profileCard: {
        backgroundColor: colors.surface,
        borderRadius: 20,
        padding: 24,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: colors.border,
        shadowColor: colors.shadow,
        shadowOpacity: 0.06,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 2,
    },
    avatarCircle: {
        width: 88,
        height: 88,
        borderRadius: 44,
        backgroundColor: colors.surfaceMuted,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 14,
    },
    profileLabel: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.textMuted,
        marginBottom: 4,
    },
    profileUsername: {
        fontSize: 17,
        fontWeight: '800',
        color: colors.text,
        textAlign: 'center',
    },
    sectionTitle: {
        marginTop: 28,
        marginBottom: 10,
        fontSize: 14,
        fontWeight: '800',
        color: colors.textMuted,
        textTransform: 'uppercase',
        letterSpacing: 0.6,
    },
    sessionCard: {
        backgroundColor: colors.surface,
        borderRadius: 20,
        padding: 18,
        borderWidth: 1,
        borderColor: colors.border,
    },
    sessionHint: {
        fontSize: 14,
        lineHeight: 21,
        color: colors.textMuted,
        marginBottom: 16,
    },
    logoutButton: {
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#dc2626',
        paddingVertical: 14,
        borderRadius: 14,
    },
    logoutButtonDisabled: {
        opacity: 0.7,
    },
    logoutRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    logoutLabel: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '800',
        marginLeft: 10,
    },
});
