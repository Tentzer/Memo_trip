import { Stack,Tabs } from "expo-router";
import {Ionicons} from "@expo/vector-icons";
import {AntDesign} from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { View, TouchableOpacity, Text, Image, Alert } from 'react-native';
import { useMemories } from '../../context/MemoryContext';

export default function OnboardingLayout() {
    const { addMemory } = useMemories();

    return (
        <Tabs screenOptions={{ tabBarActiveTintColor: '#3B82F6' }}>
            <Tabs.Screen
                name="index"
                options={{
                    title: "Map",
                    tabBarIcon: ({ color }) => <Ionicons name="map" size={24} color={color} />,
                }}
            />
            <Tabs.Screen
                name="info"
                options={{
                    title: "Info",
                    tabBarIcon: ({ color }) => <Ionicons name="information-circle" size={24} color={color} />,
                }}
            />
            <Tabs.Screen
                name="TakePicture"
                options={{
                    title: "Take Photo",
                    tabBarIcon: ({ color }) => <AntDesign name="camera" size={24} color={color} />,
                }}
                listeners={{
                    tabPress: (e) => {
                        e.preventDefault();
                        addMemory();
                    },
                }}
            />
        </Tabs>
    );
}
