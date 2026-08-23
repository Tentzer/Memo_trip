import { Alert } from 'react-native';

const DEFAULT_TITLE = 'Sign in required';

/** Optional second argument is the alert title (used by video import & camera flows). */
export function alertRequireSignIn(message: string, title: string = DEFAULT_TITLE) {
    Alert.alert(title, message);
}
