import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, SafeAreaView, Alert, ActivityIndicator } from 'react-native';
import {Link, useRouter} from "expo-router";
import { supabase } from '../lib/supabase'; // Import the client you created

export default function LoginScreen() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    async function handleLogin() {
        if (!email || !password) {
            Alert.alert("Error", "Please enter both email and password");
            return;
        }

        setLoading(true);
        const { error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (error) {
            Alert.alert("Login Failed", error.message);
        } else {
            router.replace('/onboarding');
        }
        setLoading(false);
    }


    return (
        <SafeAreaView className="flex-1 bg-white px-6 ">
            <Text className="text-3xl font-bold text-slate-800 mb-2">Log in</Text>
            <Text className="text-slate-500 mb-8">Good to see you are back!</Text>

            {/* Name Input */}
            <View className="mb-4">
                <Text className="text-slate-600 font-medium mb-2">Email address</Text>
                <TextInput
                    className="bg-slate-50 border border-slate-200 p-4 rounded-2xl text-slate-800"
                    placeholder="Smaul Deek"
                    value={email}
                    onChangeText={setEmail}
                />
            </View>

            {/* Email Input */}
            <View className="mb-8">
                <Text className="text-slate-600 font-medium mb-2">Password</Text>
                <TextInput
                    className="bg-slate-50 border border-slate-200 p-4 rounded-2xl text-slate-800"
                    placeholder="Your best password"
                    keyboardType="visible-password"
                    value={password}
                    onChangeText={setPassword}
                />
            </View>

            {/* Sign In Button */}
            <TouchableOpacity
                onPress={handleLogin}
                disabled={loading}
                className="mx-auto h-[55px] w-[275px] bg-blue-600 p-4 rounded-2xl items-center justify-center shadow-lg"
            >
                {loading ? (
                    <ActivityIndicator color="white" />
                ) : (
                    <Text className="text-white font-bold text-lg">Sign In</Text>
                )}
            </TouchableOpacity>
        </SafeAreaView>
    );
}