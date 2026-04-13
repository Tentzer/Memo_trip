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
    setShowMemories: React.Dispatch<React.SetStateAction<boolean>>;
    onOpenGallery: () => void;
    onLogout: () => void;
}

const SettingsSheet = forwardRef<SettingsSheetRef, Props>(({
    isDarkMode,
    setIsDarkMode,
    showMemories,
    setShowMemories,
    onOpenGallery,
    onLogout,
}, ref) => {
    const bottomSheetRef = useRef<BottomSheet>(null);
    const snapPoints = useMemo(() => ['45%'], []);

    useImperativeHandle(ref, () => ({
        open: () => bottomSheetRef.current?.expand(),
        close: () => bottomSheetRef.current?.close(),
    }));

    const renderBackdrop = useCallback((props: any) => (
        <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
    ), []);

    return (
        <BottomSheet
            ref={bottomSheetRef}
            index={-1}
            snapPoints={snapPoints}
            enablePanDownToClose={true}
            backdropComponent={renderBackdrop}
            handleIndicatorStyle={{ backgroundColor: '#cbd5e1', width: 40 }}
            backgroundStyle={{ backgroundColor: 'white', borderRadius: 30 }}
        >
            <BottomSheetView style={styles.container}>
                <View style={styles.header}>
                    <Text style={styles.title}>Settings</Text>
                </View>

                <View style={styles.row}>
                    <View style={styles.rowLeft}>
                        <Ionicons name={isDarkMode ? 'moon' : 'sunny'} size={24} color="#735e21" />
                        <Text style={styles.rowText}>Dark Mode</Text>
                    </View>
                    <Switch
                        trackColor={{ false: '#767577', true: '#735e21' }}
                        onValueChange={() => setIsDarkMode(prev => !prev)}
                        value={isDarkMode}
                    />
                </View>

                <View style={styles.row}>
                    <View style={styles.rowLeft}>
                        <Ionicons name="image" size={24} color="#228B22" />
                        <Text style={styles.rowText}>Memo Saves</Text>
                    </View>
                    <Switch
                        trackColor={{ false: '#767577', true: '#735e21' }}
                        onValueChange={() => setShowMemories(prev => !prev)}
                        value={showMemories}
                    />
                </View>

                <TouchableOpacity
                    onPress={() => {
                        bottomSheetRef.current?.close();
                        onOpenGallery();
                    }}
                    style={styles.row}
                >
                    <View style={styles.rowLeft}>
                        <Ionicons name="images" size={24} color="#065F46" />
                        <Text style={styles.rowText}>My Memos</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#ccc" />
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.row}
                    onPress={() => {
                        bottomSheetRef.current?.close();
                        onLogout();
                    }}
                >
                    <View style={styles.rowLeft}>
                        <Ionicons name="log-out-outline" size={24} color="#ef4444" />
                        <Text style={styles.rowText}>Logout</Text>
                    </View>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.row, { borderBottomWidth: 0 }]}
                    onPress={() => alert('Coming soon!')}
                >
                    <View style={styles.rowLeft}>
                        <Ionicons name="person-circle-outline" size={24} color="#3B82F6" />
                        <Text style={styles.rowText}>Account</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#cbd5e1" />
                </TouchableOpacity>
            </BottomSheetView>
        </BottomSheet>
    );
});

SettingsSheet.displayName = 'SettingsSheet';
export default SettingsSheet;

const styles = StyleSheet.create({
    container: {
        padding: 25,
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
        color: '#1e293b',
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#f1f5f9',
    },
    rowLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    rowText: {
        fontSize: 16,
        color: '#334155',
        fontWeight: '500',
    },
});
