import { AntDesign, Ionicons } from "@expo/vector-icons";
import { Redirect, Tabs } from "expo-router";
import { useAuth } from '../../context/AuthContext';
import { useMemories } from '../../context/MemoryContext';

export default function OnboardingLayout() {
    const { addMemory } = useMemories();
    const { user, loading } = useAuth();

    if (!loading && !user) {
        return <Redirect href="/" />;
    }

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
