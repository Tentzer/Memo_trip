import { useAuth } from "@/context/AuthContext";
import { useAppTheme } from "@/context/ThemeContext";
import { AppSplash } from "@/components/AppSplash";
import { Link } from "expo-router";
import LottieView from 'lottie-react-native';
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';

export default function HomeScreen() {
    const animation = useRef<LottieView>(null);
    const auth = useAuth();
    const { theme } = useAppTheme();
    const [previewSplash, setPreviewSplash] = useState(false);

    if (auth.loading || auth.user) {
        return <View style={{ flex: 1, backgroundColor: theme.colors.background }} />;
    }

    return (
        <View className="flex-1 justify-between items-center py-10" style={{ backgroundColor: theme.colors.background }}>
            <View>
                <Text className="px-6 text-5xl shadow-lg font-bold mt-10 text-center" style={{ color: theme.colors.accentText }}>
                    Hi! Welcome to MemoTrip
                </Text>
            </View>

            <LottieView
                autoPlay
                loop
                ref={animation}
                style={{
                    width: 350,
                    height: 350,
                    marginTop: -40,
                }}
                source={require('../assets/animations/Globe-Spinning.json')}
            />

            <View className="w-full gap-y-3 mb-10 items-center">
                <Link href="/Login" asChild>
                    <TouchableOpacity className="bg-blue-500 py-2 w-60 rounded-xl shadow-md active:bg-blue-600">
                        <Text className="text-white text-lg font-bold text-center">Sign In</Text>
                    </TouchableOpacity>
                </Link>

                <Link href="/SignUp" asChild>
                    <TouchableOpacity className="bg-blue-500 py-2 w-60 rounded-xl shadow-md active:bg-blue-600">
                        <Text className="text-white text-lg font-bold text-center">Sign Up</Text>
                    </TouchableOpacity>
                </Link>

                {__DEV__ && (
                    <TouchableOpacity
                        onPress={() => setPreviewSplash(true)}
                        className="mt-4 py-2 w-60 rounded-xl border"
                        style={{ borderColor: theme.colors.border }}
                    >
                        <Text className="text-center text-sm" style={{ color: theme.colors.textMuted }}>
                            [DEV] Preview Splash
                        </Text>
                    </TouchableOpacity>
                )}
            </View>

            {previewSplash && (
                <AppSplash onDone={() => setPreviewSplash(false)} />
            )}
        </View>
    );
}
