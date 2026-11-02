import { useLibrariesOverlay } from '@/context/LibrariesOverlayContext';
import { useAppTheme } from '@/context/ThemeContext';
import {
    BottomTabBarHeightCallbackContext,
    type BottomTabBarProps,
} from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import React, { useContext } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Reanimated, { Extrapolation, interpolate, useAnimatedStyle } from 'react-native-reanimated';

const PILL_GAP_ABOVE_SAFE_AREA = 10;
const PILL_HEIGHT = 58;
const ICON_SIZE = 22;

function isHiddenTab(style: BottomTabBarProps['descriptors'][string]['options']['tabBarItemStyle']): boolean {
    const flat = StyleSheet.flatten(style);
    return flat?.display === 'none';
}

export default function FloatingTabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
    const onHeightChange = useContext(BottomTabBarHeightCallbackContext);
    const { theme, isDarkMode } = useAppTheme();
    const { visible: librariesOverlayVisible, sheetTranslateY, sheetTravel } = useLibrariesOverlay();
    const routes = state.routes.filter((route) => !isHiddenTab(descriptors[route.key].options.tabBarItemStyle));
    const barStyle = useAnimatedStyle(() => {
        const travel = Math.max(sheetTravel.value, 1);
        return {
            opacity: interpolate(sheetTranslateY.value, [0, Math.min(travel, 240)], [0, 1], Extrapolation.CLAMP),
            transform: [{
                translateY: interpolate(
                    sheetTranslateY.value,
                    [0, Math.min(travel, 240)],
                    [PILL_HEIGHT + 12, 0],
                    Extrapolation.CLAMP,
                ),
            }],
        };
    });

    return (
        <View
            pointerEvents={librariesOverlayVisible ? 'none' : 'box-none'}
            onLayout={(event) => onHeightChange?.(event.nativeEvent.layout.height)}
            style={[
                styles.wrap,
                {
                    paddingBottom: insets.bottom + PILL_GAP_ABOVE_SAFE_AREA,
                },
            ]}
        >
            <Reanimated.View style={[styles.shadow, barStyle, { shadowColor: theme.colors.shadow }]}>
                <BlurView
                    intensity={isDarkMode ? 48 : 72}
                    tint={isDarkMode ? 'dark' : 'light'}
                    style={styles.pill}
                >
                    <View
                        pointerEvents="none"
                        style={[
                            StyleSheet.absoluteFill,
                            { backgroundColor: isDarkMode ? 'rgba(15, 27, 45, 0.72)' : 'rgba(255, 255, 255, 0.74)' },
                        ]}
                    />
                    {routes.map((route) => {
                        const { options } = descriptors[route.key];
                        const focused = state.routes[state.index]?.key === route.key;
                        const color = focused ? theme.colors.accent : theme.colors.tabInactive;
                        const label = options.title ?? route.name;
                        const onPress = () => {
                            const event = navigation.emit({
                                type: 'tabPress',
                                target: route.key,
                                canPreventDefault: true,
                            });
                            if (route.name === 'libraries') {
                                navigation.navigate('Home');
                                return;
                            }
                            if (!focused && !event.defaultPrevented) {
                                navigation.navigate(route.name, route.params);
                            }
                        };

                        return (
                            <Pressable
                                key={route.key}
                                accessibilityRole="button"
                                accessibilityState={{ selected: focused }}
                                accessibilityLabel={label}
                                onPress={onPress}
                                style={styles.item}
                            >
                                {options.tabBarIcon?.({ focused, color, size: ICON_SIZE })}
                                <Text numberOfLines={1} style={[styles.label, { color }]}>
                                    {label}
                                </Text>
                            </Pressable>
                        );
                    })}
                </BlurView>
            </Reanimated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingHorizontal: 28,
    },
    shadow: {
        borderRadius: PILL_HEIGHT / 2,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.16,
        shadowRadius: 18,
        elevation: 10,
    },
    pill: {
        overflow: 'hidden',
        borderRadius: PILL_HEIGHT / 2,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        height: PILL_HEIGHT,
        paddingHorizontal: 4,
    },
    item: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        height: '100%',
    },
    label: {
        fontSize: 10,
        lineHeight: 12,
        fontWeight: '600',
        textAlign: 'center',
        width: '100%',
    },
});
