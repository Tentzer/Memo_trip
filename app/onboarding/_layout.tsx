import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { AntDesign } from '@expo/vector-icons';
import { useMemories } from '../../context/MemoryContext';

export default function OnboardingLayout() {
    const { addMemory } = useMemories();

    return (
        <Tabs screenOptions={{ tabBarActiveTintColor: '#3B82F6' }}>
            <Tabs.Screen
                name="Home"
                options={{
                    title: "Map",
                    tabBarIcon: ({ color }) => <Ionicons name="home" size={24} color={color} />,
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
