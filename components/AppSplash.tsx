import { useAppTheme } from '@/context/ThemeContext';
import {
    PlayfairDisplay_400Regular_Italic,
    useFonts,
} from '@expo-google-fonts/playfair-display';
import LottieView from 'lottie-react-native';
import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, {
    Easing,
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withTiming,
} from 'react-native-reanimated';

interface AppSplashProps {
    onDone: () => void;
    onMeasured?: () => void;
}

const FONT_SIZE_MEMO = 58;
const FONT_SIZE_TRIP = 64;
const GLOBE_SIZE = 86;
const GLOBE_OVERLAP_X = -24;
const GLOBE_OVERLAP_Y = 12;
// Extra space the orbit adds beyond the wordmark bounding box on each side
const ORBIT_PAD = 44;

const TIMING = {
    memoIn: 550,
    tripDelay: 220,
    tripIn: 500,
    taglineDelay: 460,
    taglineIn: 460,
    holdBeforeOrbit: 400,
    orbitDuration: 1600,
    holdAfterOrbit: 300,
    fadeOut: 480,
} as const;

export function AppSplash({ onDone, onMeasured }: AppSplashProps) {
    const { theme } = useAppTheme();
    const lottieRef = useRef<LottieView>(null);
    const hasAnimated = useRef(false);

    const [fontsLoaded] = useFonts({ PlayfairDisplay_400Regular_Italic });

    const [memWidth, setMemWidth] = useState(0);
    const [trWidth, setTrWidth] = useState(0);
    const [iWidth, setIWidth] = useState(0);
    const [wordmarkWidth, setWordmarkWidth] = useState(0);
    const [wordmarkHeight, setWordmarkHeight] = useState(0);

    const measured = memWidth > 0 && trWidth > 0 && iWidth > 0;
    const wordmarkMeasured = wordmarkWidth > 0 && wordmarkHeight > 0;

    const tripOffset = measured
        ? memWidth + GLOBE_OVERLAP_X + GLOBE_SIZE / 2 - trWidth - iWidth / 2
        : 0;

    const memoOpacity = useSharedValue(0);
    const memoTranslateY = useSharedValue(12);
    const tripOpacity = useSharedValue(0);
    const tripTranslateY = useSharedValue(10);
    const taglineOpacity = useSharedValue(0);
    const containerOpacity = useSharedValue(1);
    const orbitProgress = useSharedValue(0);

    // Orbit radii stored as shared values so the worklet can read them
    const orbitRX = useSharedValue(0);
    const orbitRY = useSharedValue(0);

    useEffect(() => {
        if (!wordmarkMeasured) return;
        orbitRX.value = wordmarkWidth / 2 + ORBIT_PAD;
        orbitRY.value = wordmarkHeight / 2 + ORBIT_PAD;
    }, [wordmarkWidth, wordmarkHeight, wordmarkMeasured, orbitRX, orbitRY]);

    useEffect(() => {
        if (wordmarkMeasured) onMeasured?.();
    // onMeasured is intentionally excluded — we only want this to fire once
    // when wordmarkMeasured first transitions to true.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [wordmarkMeasured]);

    useEffect(() => {
        if (!fontsLoaded || !measured || !wordmarkMeasured || hasAnimated.current) return;
        hasAnimated.current = true;

        memoOpacity.value = withTiming(1, { duration: TIMING.memoIn });
        memoTranslateY.value = withTiming(0, { duration: TIMING.memoIn });

        tripOpacity.value = withDelay(
            TIMING.tripDelay,
            withTiming(1, { duration: TIMING.tripIn })
        );
        tripTranslateY.value = withDelay(
            TIMING.tripDelay,
            withTiming(0, { duration: TIMING.tripIn })
        );

        taglineOpacity.value = withDelay(
            TIMING.taglineDelay,
            withTiming(1, { duration: TIMING.taglineIn })
        );

        const revealEnd = Math.max(
            TIMING.tripDelay + TIMING.tripIn,
            TIMING.taglineDelay + TIMING.taglineIn
        );

        orbitProgress.value = withDelay(
            revealEnd + TIMING.holdBeforeOrbit,
            withTiming(1, {
                duration: TIMING.orbitDuration,
                easing: Easing.inOut(Easing.cubic),
            }, (finished) => {
                if (!finished) return;
                containerOpacity.value = withDelay(
                    TIMING.holdAfterOrbit,
                    withTiming(0, { duration: TIMING.fadeOut }, (done) => {
                        if (done) runOnJS(onDone)();
                    })
                );
            })
        );
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fontsLoaded, measured, wordmarkMeasured]);

    const containerStyle = useAnimatedStyle(() => ({
        opacity: containerOpacity.value,
    }));
    const memoStyle = useAnimatedStyle(() => ({
        opacity: memoOpacity.value,
        transform: [{ translateY: memoTranslateY.value }],
    }));
    const tripStyle = useAnimatedStyle(() => ({
        opacity: tripOpacity.value,
        transform: [{ translateY: tripTranslateY.value }],
    }));
    const taglineStyle = useAnimatedStyle(() => ({
        opacity: taglineOpacity.value,
    }));

    // Orbit formula: both terms are 0 at t=0 and t=1, tracing a full ellipse
    //   translateX = −rx · sin(2π·t)       →  0 → left → 0 → right → 0
    //   translateY =  ry · (1 − cos(2π·t)) →  0 → down → 2ry → down → 0
    // Direction: globe departs LEFT-DOWN, sweeps below Trip, returns from the
    // RIGHT side — proven to clear the Trip text on both the outgoing and
    // return legs regardless of measured text widths.
    const globeOrbitStyle = useAnimatedStyle(() => {
        const t = orbitProgress.value;
        const angle = 2 * Math.PI * t;
        return {
            transform: [
                { translateX: -orbitRX.value * Math.sin(angle) },
                { translateY: orbitRY.value * (1 - Math.cos(angle)) },
            ],
        };
    });

    const boldSans = {
        fontFamily: Platform.OS === 'ios' ? 'System' : ('sans-serif' as string),
        fontWeight: '800' as const,
    };

    return (
        // Outer View: solid background, always opaque, only removed when the
        // component unmounts. This prevents any screen showing through during
        // the JS frame gap between opacity reaching 0 and React state updating.
        <View
            style={[
                StyleSheet.absoluteFill,
                styles.outerBackground,
                { backgroundColor: theme.colors.background },
            ]}
        >
        <Animated.View
            style={[StyleSheet.absoluteFill, styles.container, containerStyle]}
        >
            <View
                style={styles.wordmark}
                onLayout={(e) => {
                    setWordmarkWidth(e.nativeEvent.layout.width);
                    setWordmarkHeight(e.nativeEvent.layout.height);
                }}
            >
                <Animated.View style={[styles.memoRow, memoStyle]}>
                    <Animated.Text
                        onLayout={(e) => setMemWidth(e.nativeEvent.layout.width)}
                        style={[
                            styles.memoText,
                            {
                                color: theme.colors.accentText,
                                fontFamily: fontsLoaded
                                    ? 'PlayfairDisplay_400Regular_Italic'
                                    : undefined,
                                fontStyle: fontsLoaded ? 'normal' : 'italic',
                            },
                        ]}
                    >
                        Mem
                    </Animated.Text>

                    {/* Globe wrapper receives the orbit transform; the globe
                        stays visually at rest until orbitProgress > 0.
                        Because `transform` doesn't affect layout, the "O" gap
                        in the Mem row is preserved while the globe orbits. */}
                    <Animated.View style={[styles.globeWrapper, globeOrbitStyle]}>
                        <LottieView
                            ref={lottieRef}
                            autoPlay
                            loop
                            style={styles.globe}
                            source={require('../assets/animations/Globe-Spinning-splash.json')}
                        />
                    </Animated.View>
                </Animated.View>

                <Animated.View
                    style={[
                        styles.tripRow,
                        tripStyle,
                        { marginLeft: tripOffset },
                    ]}
                >
                    <Animated.Text
                        onLayout={(e) => setTrWidth(e.nativeEvent.layout.width)}
                        style={[
                            styles.tripText,
                            { color: theme.colors.accentText, ...boldSans },
                        ]}
                    >
                        Tr
                    </Animated.Text>
                    <Animated.Text
                        onLayout={(e) => setIWidth(e.nativeEvent.layout.width)}
                        style={[
                            styles.tripText,
                            {
                                color: theme.colors.accentText,
                                lineHeight: FONT_SIZE_TRIP,
                                ...boldSans,
                            },
                        ]}
                    >
                        ı
                    </Animated.Text>
                    <Animated.Text
                        style={[
                            styles.tripText,
                            { color: theme.colors.accentText, ...boldSans },
                        ]}
                    >
                        p
                    </Animated.Text>
                </Animated.View>
            </View>

            <Animated.Text
                style={[
                    styles.tagline,
                    taglineStyle,
                    { color: theme.colors.textMuted },
                ]}
            >
                Your travel memories, beautifully kept
            </Animated.Text>
        </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    outerBackground: {
        zIndex: 999,
    },
    container: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    wordmark: {
        alignItems: 'flex-start',
    },
    memoRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    memoText: {
        fontSize: FONT_SIZE_MEMO,
        lineHeight: FONT_SIZE_MEMO,
        letterSpacing: 1,
    },
    globeWrapper: {
        marginLeft: GLOBE_OVERLAP_X,
        marginTop: GLOBE_OVERLAP_Y,
    },
    globe: {
        width: GLOBE_SIZE,
        height: GLOBE_SIZE,
    },
    tripRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        marginTop: -30,
    },
    tripText: {
        fontSize: FONT_SIZE_TRIP,
        lineHeight: FONT_SIZE_TRIP,
        letterSpacing: -1,
    },
    tagline: {
        fontSize: 13,
        letterSpacing: 1.8,
        textTransform: 'uppercase',
        marginTop: 28,
        fontWeight: '300',
    },
});
