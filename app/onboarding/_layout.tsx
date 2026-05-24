import { LibrariesOverlayProvider, useLibrariesOverlay } from '@/context/LibrariesOverlayContext';
import { useMemories } from '@/context/MemoryContext';
import { useAppTheme } from '@/context/ThemeContext';
import { AntDesign, Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Tabs, useRouter } from 'expo-router';

function OnboardingTabs() {
    const { addMemory } = useMemories();
    const { theme } = useAppTheme();
    const router = useRouter();
    const { visible: librariesOverlayVisible, open: openLibrariesOverlay } = useLibrariesOverlay();

    return (
        <Tabs
            screenOptions={{
                tabBarActiveTintColor: theme.colors.accent,
                tabBarInactiveTintColor: theme.colors.tabInactive,
                headerShown: false,
                tabBarStyle: {
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: theme.colors.surface,
                    borderTopColor: theme.colors.border,
                    opacity: librariesOverlayVisible ? 0 : 1,
                    pointerEvents: librariesOverlayVisible ? 'none' : 'auto',
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
                listeners={{
                    tabPress: (e) => {
                        e.preventDefault();
                        router.replace('/onboarding/Home');
                        openLibrariesOverlay();
                    },
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

export default function OnboardingLayout() {
    return (
        <LibrariesOverlayProvider>
            <OnboardingTabs />
        </LibrariesOverlayProvider>
    );
}
