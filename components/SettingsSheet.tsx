import { useAppTheme } from '@/context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet, { BottomSheetBackdrop, BottomSheetView } from '@gorhom/bottom-sheet';
import React, { forwardRef, useCallback, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';

export interface SettingsSheetRef {
    open: () => void;
    close: () => void;
}

interface Props {
    isDarkMode: boolean;
    setIsDarkMode: React.Dispatch<React.SetStateAction<boolean>>;
    showMemories: boolean;
    onShowMemoriesChange: (enabled: boolean) => void;
    showLoginRow: boolean;
    onOpenLogin: () => void;
    onOpenMarketplace: () => void;
    onOpenInvites: () => void;
    onOpenInfo: () => void;
    onOpenAccount: () => void;
    onOpenPlan: () => void;
}

const SettingsSheet = forwardRef<SettingsSheetRef, Props>(({
    isDarkMode,
    setIsDarkMode,
    showMemories,
    onShowMemoriesChange,
    showLoginRow,
    onOpenLogin,
    onOpenMarketplace,
    onOpenInvites,
    onOpenInfo,
    onOpenAccount,
    onOpenPlan,
}, ref) => {
    const { theme } = useAppTheme();
    const bottomSheetRef = useRef<BottomSheet>(null);
    const snapPoints = useMemo(() => ['55%'], []);
    const pendingActionRef = useRef<(() => void) | null>(null);

    useImperativeHandle(ref, () => ({
        open: () => bottomSheetRef.current?.expand(),
        close: () => bottomSheetRef.current?.close(),
    }));

    const renderBackdrop = useCallback((props: Parameters<typeof BottomSheetBackdrop>[0]) => (
        <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
    ), []);

    const handleSheetClose = useCallback(() => {
        const action = pendingActionRef.current;
        pendingActionRef.current = null;
        action?.();
    }, []);

    const scheduleAfterClose = useCallback((action: () => void) => {
        pendingActionRef.current = action;
        bottomSheetRef.current?.close();
    }, []);

    return (
        <BottomSheet
            ref={bottomSheetRef}
            index={-1}
            snapPoints={snapPoints}
            enablePanDownToClose
            bottomInset={0}
            backdropComponent={renderBackdrop}
            onClose={handleSheetClose}
            animationConfigs={{ duration: 250 }}
            handleIndicatorStyle={{ backgroundColor: theme.colors.handle, width: 40 }}
            backgroundStyle={{
                backgroundColor: theme.colors.surfaceElevated,
                borderTopLeftRadius: 30,
                borderTopRightRadius: 30,
                borderBottomLeftRadius: 0,
                borderBottomRightRadius: 0,
            }}
        >
            <BottomSheetView style={styles.container}>
                <View style={styles.header}>
                    <Text style={[styles.title, { color: theme.colors.text }]}>Settings</Text>
                </View>

                <View style={[styles.row, { borderBottomColor: theme.colors.border }]}>
                    <View style={styles.rowLeft}>
                        <Ionicons name={isDarkMode ? 'moon' : 'sunny'} size={24} color={theme.colors.accent} />
                        <Text style={[styles.rowText, { color: theme.colors.textSecondary }]}>Dark Mode</Text>
                    </View>
                    <Switch
                        trackColor={{ false: theme.colors.borderStrong, true: theme.colors.accentSoft }}
                        thumbColor={isDarkMode ? theme.colors.accent : theme.colors.surfaceMuted}
                        onValueChange={() => setIsDarkMode(prev => !prev)}
                        value={isDarkMode}
                    />
                </View>

                <View style={[styles.row, { borderBottomColor: theme.colors.border }]}>
                    <View style={styles.rowLeft}>
                        <Ionicons name="image" size={24} color={theme.colors.success} />
                        <Text style={[styles.rowText, { color: theme.colors.textSecondary }]}>Show Memos on Map</Text>
                    </View>
                    <Switch
                        trackColor={{ false: theme.colors.borderStrong, true: theme.colors.accentSoft }}
                        thumbColor={showMemories ? theme.colors.accent : theme.colors.surfaceMuted}
                        onValueChange={onShowMemoriesChange}
                        value={showMemories}
                    />
                </View>

                {showLoginRow ? (
                    <TouchableOpacity
                        style={[styles.row, { borderBottomColor: theme.colors.border }]}
                        onPress={() => scheduleAfterClose(onOpenLogin)}
                    >
                        <View style={styles.rowLeft}>
                            <Ionicons name="log-in-outline" size={24} color={theme.colors.accentText} />
                            <Text style={[styles.rowText, { color: theme.colors.textSecondary }]}>Sign in</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color={theme.colors.tabInactive} />
                    </TouchableOpacity>
                ) : null}

                <TouchableOpacity
                    style={[styles.row, { borderBottomColor: theme.colors.border }]}
                    onPress={() => scheduleAfterClose(onOpenMarketplace)}
                >
                    <View style={styles.rowLeft}>
                        <Ionicons name="storefront-outline" size={24} color={theme.colors.accent} />
                        <Text style={[styles.rowText, { color: theme.colors.textSecondary }]}>Marketplace</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={theme.colors.tabInactive} />
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.row, { borderBottomColor: theme.colors.border }]}
                    onPress={() => scheduleAfterClose(onOpenInvites)}
                >
                    <View style={styles.rowLeft}>
                        <Ionicons name="mail-unread-outline" size={24} color="#7c3aed" />
                        <Text style={[styles.rowText, { color: theme.colors.textSecondary }]}>Invites</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={theme.colors.tabInactive} />
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.row, { borderBottomColor: theme.colors.border }]}
                    onPress={() => scheduleAfterClose(onOpenAccount)}
                >
                    <View style={styles.rowLeft}>
                        <Ionicons name="person-circle-outline" size={24} color={theme.colors.accentText} />
                        <Text style={[styles.rowText, { color: theme.colors.textSecondary }]}>Account</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={theme.colors.tabInactive} />
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.row, { borderBottomColor: theme.colors.border }]}
                    onPress={() => scheduleAfterClose(onOpenPlan)}
                >
                    <View style={styles.rowLeft}>
                        <Ionicons name="map-outline" size={24} color={theme.colors.success} />
                        <Text style={[styles.rowText, { color: theme.colors.textSecondary }]}>Trip planner</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={theme.colors.tabInactive} />
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.row, { borderBottomWidth: 0 }]}
                    onPress={() => scheduleAfterClose(onOpenInfo)}
                >
                    <View style={styles.rowLeft}>
                        <Ionicons name="information-circle-outline" size={24} color={theme.colors.accentText} />
                        <Text style={[styles.rowText, { color: theme.colors.textSecondary }]}>About</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={theme.colors.tabInactive} />
                </TouchableOpacity>
            </BottomSheetView>
        </BottomSheet>
    );
});

SettingsSheet.displayName = 'SettingsSheet';
export default SettingsSheet;

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: 25,
        paddingTop: 8,
        paddingBottom: 50,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 20,
    },
    title: {
        fontSize: 22,
        fontWeight: 'bold',
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 15,
        borderBottomWidth: 1,
    },
    rowLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    rowText: {
        fontSize: 16,
        fontWeight: '500',
    },
});
