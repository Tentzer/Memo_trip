import { StyleSheet } from 'react-native';

export const OWNED_PIN_COLOR = '#1d4ed8';
export const SHARED_PIN_COLOR = '#7c3aed';
export const IG_GRADIENT = ['#f9ce34', '#ee2a7b', '#6228d7'] as const;
export const MIXED_PIN_GRADIENT = [OWNED_PIN_COLOR, SHARED_PIN_COLOR] as const;

export const markerStyles = StyleSheet.create({
    markerContainer: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 5,
    },
    markerPinWrapper: {
        width: 72,
        height: 86,
        alignItems: 'center',
        justifyContent: 'flex-start',
        overflow: 'visible',
    },
    markerAvatarOuter: {
        width: 68,
        height: 68,
        borderRadius: 34,
        borderWidth: 3,
        backgroundColor: 'transparent',
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
    },
    markerAccentRing: {
        width: 58,
        height: 58,
        borderRadius: 29,
        borderWidth: 2,
        overflow: 'hidden',
        backgroundColor: 'transparent',
    },
    markerGradientInner: {
        flex: 1,
        margin: 2,
        borderRadius: 27,
        overflow: 'hidden',
    },
    markerAvatarImage: {
        width: '100%',
        height: '100%',
        borderRadius: 29,
        backgroundColor: 'transparent',
    },
    markerPlaceholder: {
        backgroundColor: '#e2e8f0',
        alignItems: 'center',
        justifyContent: 'center',
    },
    markerStem: {
        width: 3,
        height: 16,
        marginTop: -5,
        borderRadius: 999,
    },
    countBadge: {
        position: 'absolute',
        top: 0,
        right: 0,
        minWidth: 22,
        height: 22,
        paddingHorizontal: 4,
        borderRadius: 11,
        backgroundColor: '#0f172a',
        borderWidth: 2,
        borderColor: '#ffffff',
        alignItems: 'center',
        justifyContent: 'center',
    },
    countBadgeText: {
        color: '#ffffff',
        fontSize: 11,
        fontWeight: '800',
    },
});
