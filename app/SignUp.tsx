import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, SafeAreaView, Alert, ActivityIndicator } from 'react-native';
import {Link, useRouter} from "expo-router";
import { supabase } from '../lib/supabase'; // Import the client you created

export default function SignUpScreen() {

    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

async function handleSignUp() {
    if (!email || !password) {
        Alert.alert("Error", "Please fill in all fields");
        return;
    }

    setLoading(true);

    // 1. Create the user in Supabase Auth
    const { data, error } = await supabase.auth.signUp({
        email: email,
        password: password,
    });

    if (error) {
        Alert.alert("Signup Error", error.message);
    } else {
        Alert.alert("Success!", "Check your email for the confirmation link.");
        router.push('/Login');
    }
    setLoading(false);
}



    return (
        <SafeAreaView className="flex-1 bg-white px-6">
            <Text className="text-3xl font-bold text-slate-800 mb-2">Create Account</Text>
            <Text className="text-slate-500 mb-8">Join MemoTrip to save your travels.</Text>

            {/* Email Input */}
            <View className="mb-8">
                <Text className="text-slate-600 font-medium mb-2">Email Address</Text>
                <TextInput
                    className="bg-slate-50 border border-slate-200 p-4 rounded-2xl text-slate-800"
                    placeholder="john@example.com"
                    keyboardType="email-address" // Shows the '@' on the keyboard
                    value={email}
                    onChangeText={setEmail}
                />
            </View>

            {/* Password Input */}
            <View className="mb-4">
                <Text className="text-slate-600 font-medium mb-2">Password</Text>
                <TextInput
                    className="bg-slate-50 border border-slate-200 p-4 rounded-2xl text-slate-800"
                    placeholder="********"
                    value={password}
                    onChangeText={setPassword}
                />
            </View>

            {/* Sign Up Button */}
            <TouchableOpacity
                onPress={handleSignUp} // Added the connection here!
                disabled={loading}
                className="mx-auto h-[55px] w-[275px] bg-blue-600 p-4 rounded-2xl items-center justify-center shadow-lg"
            >
                {loading ? <ActivityIndicator color="white" /> : <Text className="text-white font-bold text-lg">Sign Up</Text>}
            </TouchableOpacity>

            <Link href="/Login" asChild>
                <TouchableOpacity className="mt-6 items-center">
                    <Text className="text-slate-500">Already have an account? <Text className="text-blue-600 font-bold">Log In</Text></Text>
                </TouchableOpacity>
            </Link>
        </SafeAreaView>
    );
}