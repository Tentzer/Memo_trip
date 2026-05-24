import { useAppTheme } from '@/context/ThemeContext';
import { BlurView } from 'expo-blur';
import LottieView from 'lottie-react-native';
import React from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';

interface MemoriesMapLoadOverlayProps {
    visible: boolean;
}

export function MemoriesMapLoadOverlay({ visible }: MemoriesMapLoadOverlayProps) {
    const { theme, isDarkMode } = useAppTheme();

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            statusBarTranslucent
            onRequestClose={() => {}}
        >
            <View style={styles.root} accessibilityViewIsModal>
                <BlurView
                    intensity={isDarkMode ? 55 : 40}
                    tint={isDarkMode ? 'dark' : 'light'}
                    style={StyleSheet.absoluteFill}
                />
                <View
                    style={[
                        styles.scrim,
                        { backgroundColor: isDarkMode ? 'rgba(15,23,42,0.55)' : 'rgba(248,250,252,0.45)' },
                    ]}
                />
                <View style={styles.content}>
                    <LottieView
                        autoPlay
                        loop
                        style={styles.globe}
                        source={require('@/assets/animations/Globe-Spinning-splash.json')}
                    />
                    <Text style={[styles.title, { color: theme.colors.text }]}>
                        Loading memos
                    </Text>
                    <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
                        Placing your memories on the map…
                    </Text>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    scrim: {
        ...StyleSheet.absoluteFillObject,
    },
    content: {
        alignItems: 'center',
        paddingHorizontal: 32,
    },
    globe: {
        width: 120,
        height: 120,
        marginBottom: 20,
    },
    title: {
        fontSize: 20,
        fontWeight: '700',
        letterSpacing: 0.2,
        marginBottom: 6,
    },
    subtitle: {
        fontSize: 15,
        textAlign: 'center',
        lineHeight: 22,
    },
});
