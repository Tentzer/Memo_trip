import { useAppTheme } from '@/context/ThemeContext';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, View } from 'react-native';

type Props = {
    children: React.ReactNode;
};

export function AuthGradientBackground({ children }: Props) {
    const { theme } = useAppTheme();
    const [base, blue, magenta] = theme.colors.authBackgroundGradient;

    return (
        <View style={styles.container}>
            <LinearGradient
                colors={[base, blue, magenta, base]}
                locations={[0, 0.4, 0.75, 1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
            />
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
});
