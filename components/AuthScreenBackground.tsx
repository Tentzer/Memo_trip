import { AuthGradientBackground } from '@/components/AuthGradientBackground';
import { useAppTheme } from '@/context/ThemeContext';
import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, SafeAreaView, StyleSheet } from 'react-native';
import Animated, {
    Easing,
    interpolate,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

type Props = {
    children: React.ReactNode;
};

const DRIFT_DURATION_MS = 16000;

export function AuthScreenBackground({ children }: Props) {
    const { theme } = useAppTheme();
    const [reduceMotion, setReduceMotion] = useState(false);
    const drift = useSharedValue(0);

    useEffect(() => {
        void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
        const subscription = AccessibilityInfo.addEventListener(
            'reduceMotionChanged',
            setReduceMotion,
        );
        return () => subscription.remove();
    }, []);

    useEffect(() => {
        if (reduceMotion) {
            drift.value = 0;
            return;
        }
        drift.value = withRepeat(
            withTiming(1, {
                duration: DRIFT_DURATION_MS,
                easing: Easing.inOut(Easing.sin),
            }),
            -1,
            true,
        );
    }, [drift, reduceMotion]);

    const [base, blue, magenta] = theme.colors.authBackgroundGradient;

    const driftOverlayStyle = useAnimatedStyle(() => ({
        opacity: interpolate(drift.value, [0, 1], [0, 0.9]),
    }));

    const baseOverlayStyle = useAnimatedStyle(() => ({
        opacity: interpolate(drift.value, [0, 1], [0.9, 0]),
    }));

    return (
        <AuthGradientBackground>
            {!reduceMotion ? (
                <>
                    <Animated.View
                        pointerEvents="none"
                        style={[StyleSheet.absoluteFill, baseOverlayStyle]}
                    >
                        <LinearGradient
                            colors={[base, blue, magenta, base]}
                            locations={[0, 0.4, 0.75, 1]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={StyleSheet.absoluteFill}
                        />
                    </Animated.View>

                    <Animated.View
                        pointerEvents="none"
                        style={[StyleSheet.absoluteFill, driftOverlayStyle]}
                    >
                        <LinearGradient
                            colors={[base, magenta, blue, base]}
                            locations={[0, 0.35, 0.72, 1]}
                            start={{ x: 1, y: 0 }}
                            end={{ x: 0, y: 1 }}
                            style={StyleSheet.absoluteFill}
                        />
                    </Animated.View>
                </>
            ) : null}

            <SafeAreaView className="flex-1" style={styles.content}>
                {children}
            </SafeAreaView>
        </AuthGradientBackground>
    );
}

const styles = StyleSheet.create({
    content: {
        backgroundColor: 'transparent',
        flex: 1,
    },
});
