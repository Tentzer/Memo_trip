import { useAppTheme } from '@/context/ThemeContext';
import { AntDesign, Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Tabs } from 'expo-router';
import { useMemories } from '@/context/MemoryContext';

export default function OnboardingLayout() {
    const { addMemory } = useMemories();
    const { theme } = useAppTheme();

    return (
        <Tabs
            screenOptions={{
                tabBarActiveTintColor: theme.colors.accent,
                tabBarInactiveTintColor: theme.colors.tabInactive,
                headerShown: false,
                tabBarStyle: {
                    backgroundColor: theme.colors.surface,
                    borderTopColor: theme.colors.border,
                },
            }}
            screenListeners={{
                tabPress: () => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                },
            }}
        >
            <Tabs.Screen
                name="info"
                options={{
                    title: 'Info',
                    href: null,
                }}
            />
            <Tabs.Screen
                name="TakePicture"
                options={{
                    title: 'Take Photo',
                    tabBarIcon: ({ color }) => <AntDesign name="camera" size={24} color={color} />,
                }}
                listeners={{
                    tabPress: (e) => {
                        e.preventDefault();
                        void addMemory();
                    },
                }}
            />
            <Tabs.Screen
                name="Home"
                options={{
                    title: 'Map',
                    tabBarIcon: ({ color }) => <Ionicons name="home" size={24} color={color} />,
                }}
            />
            <Tabs.Screen
                name="libraries"
                options={{
                    title: 'Libraries',
                    tabBarIcon: ({ color }) => <Ionicons name="albums-outline" size={24} color={color} />,
                }}
            />
            <Tabs.Screen
                name="plan"
                options={{
                    title: 'Plan',
                    href: null,
                }}
            />
            <Tabs.Screen
                name="video-import"
                options={{
                    title: 'Import',
                    tabBarIcon: ({ color }) => <Ionicons name="film-outline" size={24} color={color} />,
                }}
            />
        </Tabs>
    );
}
