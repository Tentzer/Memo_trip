import { useLibrariesOverlay } from '@/context/LibrariesOverlayContext';
import { useAppTheme } from '@/context/ThemeContext';
import {
    BottomTabBarHeightCallbackContext,
    type BottomTabBarProps,
} from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import React, { useContext } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

const PILL_GAP_ABOVE_SAFE_AREA = 10;

function isHiddenTab(style: BottomTabBarProps['descriptors'][string]['options']['tabBarItemStyle']): boolean {
    const flat = StyleSheet.flatten(style);
    return flat?.display === 'none';
}

export default function FloatingTabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
    const onHeightChange = useContext(BottomTabBarHeightCallbackContext);
    const { theme, isDarkMode } = useAppTheme();
    const { visible: librariesOverlayVisible } = useLibrariesOverlay();
    const routes = state.routes.filter((route) => !isHiddenTab(descriptors[route.key].options.tabBarItemStyle));

    return (
        <View
            pointerEvents={librariesOverlayVisible ? 'none' : 'box-none'}
            onLayout={(event) => onHeightChange?.(event.nativeEvent.layout.height)}
            style={[
                styles.wrap,
                {
                    paddingBottom: insets.bottom + PILL_GAP_ABOVE_SAFE_AREA,
                    opacity: librariesOverlayVisible ? 0 : 1,
                },
            ]}
        >
            <View style={[styles.shadow, { shadowColor: theme.colors.shadow }]}>
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
                        const isCamera = route.name === 'TakePicture';
                        const color = isCamera
                            ? '#FFFFFF'
                            : focused
                                ? theme.colors.accent
                                : theme.colors.tabInactive;
                        const label = options.title ?? route.name;
                        const onPress = () => {
                            const event = navigation.emit({
                                type: 'tabPress',
                                target: route.key,
                                canPreventDefault: true,
                            });
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
                                {isCamera ? (
                                    <View style={[styles.cameraButton, { backgroundColor: theme.colors.accent }]}>
                                        {options.tabBarIcon?.({ focused: true, color, size: 26 })}
                                    </View>
                                ) : (
                                    options.tabBarIcon?.({ focused, color, size: 22 })
                                )}
                                <Text
                                    numberOfLines={1}
                                    style={[styles.label, { color: isCamera ? theme.colors.accentText : color }]}
                                >
                                    {label}
                                </Text>
                            </Pressable>
                        );
                    })}
                </BlurView>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingHorizontal: 16,
    },
    shadow: {
        borderRadius: 32,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.16,
        shadowRadius: 18,
        elevation: 10,
    },
    pill: {
        overflow: 'hidden',
        borderRadius: 32,
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        paddingHorizontal: 8,
        paddingTop: 8,
        paddingBottom: 8,
    },
    item: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 4,
        minHeight: 58,
    },
    cameraButton: {
        width: 46,
        height: 46,
        borderRadius: 23,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: -6,
    },
    label: {
        fontSize: 11,
        fontWeight: '600',
        letterSpacing: 0.1,
    },
});
