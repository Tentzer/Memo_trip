import React from 'react';
import { View, Text, ScrollView, Linking, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function InfoPage() {
    return (
        <ScrollView className="flex-1 bg-slate-50">
            <View className="bg-blue-600 pt-16 pb-10 px-6 rounded-b-[40px] shadow-xl">
                <Text className="text-white text-4xl font-bold">MemoTrip</Text>
                <Text className="text-blue-100 text-lg mt-2">Personal Travel Mapping Assistant</Text>
            </View>

            <View className="px-6 -mt-8">
                <View className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                    <Text className="text-slate-800 text-xl font-bold mb-3">About the Project</Text>
                    <Text className="text-slate-600 leading-6">
                        MemoTrip is a mobile application designed to help travelers track their journeys in real-time.
                        It combines live GPS tracking with interactive mapping to create a digital memory of every trip.
                    </Text>
                </View>


                <Text className="text-slate-800 text-lg font-bold mt-8 mb-4">Core Features</Text>
                <View className="flex-row flex-wrap justify-between">
                    <FeatureItem icon="map" title="Live Map" desc="Interactive Google Maps integration" />
                    <FeatureItem icon="navigate" title="Routing" desc="Dotted path polyline tracking" />
                    <FeatureItem icon="search" title="Places API" desc="Global location search" />
                    <FeatureItem icon="locate" title="GPS" desc="High-precision location logic" />
                </View>


                <View className="bg-slate-800 p-6 rounded-3xl mt-6 shadow-lg">
                    <Text className="text-white text-xl font-bold mb-4">Technical Stack</Text>
                    <View className="flex-row flex-wrap gap-2">
                        <Badge text="React Native" color="bg-blue-500" />
                        <Badge text="Expo" color="bg-slate-600" />
                        <Badge text="TypeScript" color="bg-blue-700" />
                        <Badge text="NativeWind" color="bg-teal-500" />
                        <Badge text="Google Cloud" color="bg-red-500" />
                    </View>
                </View>


                <TouchableOpacity
                    onPress={() => Linking.openURL('https://github.com/yourusername')}
                    className="my-10 items-center"
                >
                    <View className="flex-row items-center bg-slate-200 px-5 py-3 rounded-full">
                        <Ionicons name="logo-github" size={20} color="#1e293b" />
                        <Text className="text-slate-800 font-bold ml-2">View Source on GitHub</Text>
                    </View>
                </TouchableOpacity>
            </View>
        </ScrollView>
    );
}

const FeatureItem = ({ icon, title, desc }: { icon: any, title: string, desc: string }) => (
    <View className="w-[48%] bg-white p-4 rounded-2xl mb-4 border border-slate-100 shadow-sm">
        <Ionicons name={icon} size={24} color="#3b82f6" />
        <Text className="text-slate-800 font-bold mt-2">{title}</Text>
        <Text className="text-slate-500 text-xs mt-1">{desc}</Text>
    </View>
);

const Badge = ({ text, color }: { text: string, color: string }) => (
    <View className={`${color} px-3 py-1 rounded-full`}>
        <Text className="text-white text-xs font-bold">{text}</Text>
    </View>
);