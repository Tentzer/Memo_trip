import LottieView from 'lottie-react-native';
import React, { useEffect, useRef } from 'react';
import { Image, StyleSheet, View } from 'react-native';

type AppSplashProps = {
    onDone: () => void;
    onMeasured: () => void;
};

export function AppSplash({ onDone, onMeasured }: AppSplashProps) {
    const animationRef = useRef<LottieView>(null);
    const finishedRef = useRef(false);

    useEffect(() => {
        onMeasured();
        const timer = setTimeout(() => {
            if (!finishedRef.current) {
                finishedRef.current = true;
                onDone();
            }
        }, 2200);

        return () => clearTimeout(timer);
    }, [onDone, onMeasured]);

    return (
        <View style={styles.container} onLayout={onMeasured}>
            <Image
                source={require('../assets/screenshots/MemoTrip_Logo.png')}
                style={styles.logo}
                resizeMode="contain"
            />
            <LottieView
                ref={animationRef}
                autoPlay
                loop={false}
                source={require('../assets/animations/Globe-Spinning.json')}
                style={styles.animation}
                onAnimationFinish={() => {
                    if (finishedRef.current) return;
                    finishedRef.current = true;
                    onDone();
                }}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f8fafc',
        zIndex: 999,
    },
    logo: {
        width: 120,
        height: 120,
        marginBottom: 12,
    },
    animation: {
        width: 220,
        height: 220,
    },
});
