import { AntDesign, Ionicons } from "@expo/vector-icons";
import { Tabs, useRouter } from "expo-router";
import { Alert } from "react-native";
import { useAuth } from '../../context/AuthContext';
import { useMemories } from '../../context/MemoryContext';

export default function OnboardingLayout() {
    const { addMemory } = useMemories();
    const { user } = useAuth();
    const router = useRouter();

    return (
        <Tabs screenOptions={{ tabBarActiveTintColor: '#3B82F6' }}>
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
                        if (!user) {
                            Alert.alert(
                                'Sign in required',
                                'Sign in to capture and save memories.',
                                [
                                    { text: 'Cancel', style: 'cancel' },
                                    { text: 'Sign in', onPress: () => router.push('/Login') },
                                ],
                            );
                            return;
                        }
                        void addMemory();
                    },
                }}
            />
            <Tabs.Screen
                name="plan"
                options={{
                    title: "Plan",
                    tabBarIcon: ({ color }) => <Ionicons name="calendar-outline" size={24} color={color} />,
                }}
            />
            <Tabs.Screen
                name="Home"
                options={{
                    title: "Map",
                    tabBarIcon: ({ color }) => <Ionicons name="home" size={24} color={color} />,
                }}
            />
        </Tabs>
    );
}
