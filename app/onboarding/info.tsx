import { useAppTheme } from '@/context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type FeatureIcon = React.ComponentProps<typeof Ionicons>['name'];

/** Space for tab bar + comfortable scroll padding when tabs are at the bottom. */
const TAB_BAR_SCROLL_PADDING = 96;

export default function InfoPage() {
    const insets = useSafeAreaInsets();
    const { theme } = useAppTheme();
    const paddingBottom = insets.bottom + TAB_BAR_SCROLL_PADDING;

    return (
        <ScrollView
            className="flex-1"
            style={{ backgroundColor: theme.colors.background }}
            contentContainerStyle={{ paddingBottom }}
        >
            <View
                className="bg-blue-600 pb-12 px-6 rounded-b-[36px]"
                style={{ paddingTop: Math.max(insets.top, 12) + 8 }}
            >
                <View className="flex-row items-center mb-2">
                    <View className="bg-white/20 rounded-full p-2">
                        <Ionicons name="globe-outline" size={26} color="#fff" />
                    </View>
                </View>
                <Text className="text-white text-4xl font-bold tracking-tight">Memo Trip</Text>
                <Text className="text-blue-100 text-base mt-2 leading-5 font-medium">
                    Pictures with a place — on a map you actually want to scroll.
                </Text>
            </View>

            <View className="px-5 -mt-6">
                <View className="p-5 rounded-3xl shadow-sm border" style={{ backgroundColor: theme.colors.surface, borderColor: theme.colors.border }}>
                    <Text className="text-xl font-extrabold mb-1" style={{ color: theme.colors.text }}>Your trip, live on the map</Text>
                    <Text className="text-blue-600 text-sm font-semibold mb-4">Snap it. Pin it. Show it off.</Text>

                    <View className="gap-3">
                        <HookRow icon="camera-outline" text="Grab a photo — we tuck it right where you stood." />
                        <HookRow icon="map-outline" text="Zoom around your own dotted history; folders keep the chaos cute." />
                        <HookRow icon="sparkles-outline" text="Bored? Plan tab vibes — ask what's nearby, save what you love." />
                    </View>
                </View>

                <Text className="text-lg font-bold mt-8 mb-3 px-0.5" style={{ color: theme.colors.text }}>What you can do</Text>
                <View className="flex-row flex-wrap justify-between">
                    <FeatureItem
                        icon="map-outline"
                        title="Map & markers"
                        desc="Browse your memories and shared-library pins; filter by folder or show everything."
                    />
                    <FeatureItem
                        icon="camera-outline"
                        title="Capture"
                        desc="Take a photo — it is saved with location and appears on your map when you are signed in."
                    />
                    <FeatureItem
                        icon="search-outline"
                        title="Places & routes"
                        desc="Search the world, preview a walk to a place, then add it to your memories."
                    />
                    <FeatureItem
                        icon="folder-open-outline"
                        title="Libraries"
                        desc="Country collections and custom folders; open My Memos from settings and jump back to the map."
                    />
                    <FeatureItem
                        icon="sparkles-outline"
                        title="Plan"
                        desc="Ask the assistant for ideas, itineraries, and nearby spots — then save places you like."
                    />
                    <FeatureItem
                        icon="people-outline"
                        title="Share"
                        desc="Share a memory or invite others to a library; shared memos can appear on your map."
                    />
                </View>

                <View className="p-5 rounded-3xl mt-6" style={{ backgroundColor: theme.isDark ? theme.colors.surfaceElevated : '#1E293B' }}>
                    <Text className="text-white text-lg font-bold mb-1">Built with</Text>
                    <Text className="text-sm mb-4 leading-5" style={{ color: theme.colors.textMuted }}>
                        Same stack as this app build.
                    </Text>
                    <View className="flex-row flex-wrap gap-2">
                        <Badge text="Expo" className="bg-sky-500" />
                        <Badge text="React Native" className="bg-blue-600" />
                        <Badge text="TypeScript" className="bg-indigo-600" />
                        <Badge text="NativeWind" className="bg-teal-600" />
                        <Badge text="Supabase" className="bg-emerald-600" />
                        <Badge text="Google Maps" className="bg-amber-600" />
                    </View>
                </View>

                <View className="py-8 items-center">
                    <Text className="text-xs text-center leading-5 px-4" style={{ color: theme.colors.textMuted }}>
                        Map tab for the big picture, Plan for ideas, Camera from the tab bar, and the menu for memos, invites, and your account.
                    </Text>
                </View>
            </View>
        </ScrollView>
    );
}

function HookRow({ icon, text }: { icon: FeatureIcon; text: string }) {
    const { theme } = useAppTheme();
    return (
        <View className="flex-row items-start gap-3">
            <View className="rounded-xl p-2 mt-0.5" style={{ backgroundColor: theme.colors.accentSoft }}>
                <Ionicons name={icon} size={18} color={theme.colors.accent} />
            </View>
            <Text className="text-[15px] leading-5 flex-1 font-medium" style={{ color: theme.colors.textSecondary }}>{text}</Text>
        </View>
    );
}

function FeatureItem({ icon, title, desc }: { icon: FeatureIcon; title: string; desc: string }) {
    const { theme } = useAppTheme();
    return (
        <View className="w-[48%] p-4 rounded-2xl mb-3 border shadow-sm" style={{ backgroundColor: theme.colors.surface, borderColor: theme.colors.border }}>
            <Ionicons name={icon} size={22} color={theme.colors.accent} />
            <Text className="font-bold mt-2 text-[15px]" style={{ color: theme.colors.text }}>{title}</Text>
            <Text className="text-xs mt-1 leading-4" style={{ color: theme.colors.textMuted }}>{desc}</Text>
        </View>
    );
}

function Badge({ text, className }: { text: string; className: string }) {
    return (
        <View className={`${className} px-3 py-1.5 rounded-full`}>
            <Text className="text-white text-xs font-bold">{text}</Text>
        </View>
    );
}
