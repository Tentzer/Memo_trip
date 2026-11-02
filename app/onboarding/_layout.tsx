import FloatingTabBar from '@/components/navigation/FloatingTabBar';
import { LibrariesOverlayProvider, useLibrariesOverlay } from '@/context/LibrariesOverlayContext';
import { useMemories } from '@/context/MemoryContext';
import { AntDesign, Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Tabs } from 'expo-router';

function OnboardingTabs() {
    const { addMemory } = useMemories();
    const { open: openLibrariesOverlay } = useLibrariesOverlay();

    return (
        <Tabs
            tabBar={(props) => <FloatingTabBar {...props} />}
            screenOptions={{
                headerShown: false,
                animation: 'none',
                tabBarStyle: {
                    position: 'absolute',
                    backgroundColor: 'transparent',
                    borderTopWidth: 0,
                    elevation: 0,
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
