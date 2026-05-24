import { router } from 'expo-router';
import { Alert } from 'react-native';

const DEFAULT_TITLE = 'Sign in required';
const LOGIN_PATH = '/Login';

/** Optional second argument is the alert title (used by video import & camera flows). */
export function alertRequireSignIn(message: string, title: string = DEFAULT_TITLE) {
    Alert.alert(title, message, [
        { text: 'Cancel', style: 'cancel' },
        {
            text: 'Sign in',
            onPress: () => router.push(LOGIN_PATH),
        },
    ]);
}
