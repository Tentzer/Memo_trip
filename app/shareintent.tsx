import { useAppTheme } from '@/context/ThemeContext';
import { View } from 'react-native';

/** Placeholder route for expo-share-intent deep links; ShareIntentHandler performs navigation. */
export default function ShareIntentScreen() {
    const { theme } = useAppTheme();
    return <View style={{ flex: 1, backgroundColor: theme.colors.background }} />;
}
