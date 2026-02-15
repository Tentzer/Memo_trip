import React, { useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, SafeAreaView } from 'react-native';
import LottieView from 'lottie-react-native';
import {Link} from "expo-router";
import { useState } from 'react';



export default function HomeScreen() {
    const animation = useRef<LottieView>(null);

    return (
        <View className="flex-1 justify-between items-center bg-slate-700 py-10">
            {/* Header Section */}
            <View>
                <Text className="px-6 text-5xl text-blue-200 shadow-lg font-bold mt-10 text-center">
                    Hi! Welcome to MemoTrip
                </Text>
            </View>

            {/* Animation Section - Scaled down to fit screen better */}
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

            {/* Button Section - Using 'gap' for perfect equal spacing */}
            <View className="w-full gap-y-3 mb-10 items-center">
                {/* Button 1 */}
                <Link href="/Login" asChild>
                    <TouchableOpacity className="bg-blue-500 py-2 w-60 rounded-xl shadow-md active:bg-blue-600">
                        <Text className="text-white text-lg font-bold text-center">Sign In</Text>
                    </TouchableOpacity>
                </Link>

                {/* Button 2 */}
                <Link href="/SignUp" asChild>
                    <TouchableOpacity className="bg-blue-500 py-2 w-60 rounded-xl shadow-md active:bg-blue-600">
                        <Text className="text-white text-lg font-bold text-center">Sign Up</Text>
                    </TouchableOpacity>
                </Link>

                {/* Button 3 */}
                <Link href="/onboarding" asChild>
                    <TouchableOpacity className="bg-blue-500 py-2 w-60 rounded-xl shadow-md active:bg-blue-600">
                        <Text className="text-white text-lg font-bold text-center">Admin</Text>
                    </TouchableOpacity>
                </Link>
            </View>
        </View>
    );
}
