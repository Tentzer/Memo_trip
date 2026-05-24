import { TextStyle } from 'react-native';

/** Hebrew, Arabic, and related RTL scripts in imported or user-generated text. */
const RTL_SCRIPT_PATTERN = /[\u0590-\u05FF\u0600-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;

export function isRtlText(text: string | null | undefined): boolean {
    if (!text?.trim()) return false;
    return RTL_SCRIPT_PATTERN.test(text);
}

export function rtlAwareTextStyle(text: string | null | undefined): TextStyle {
    if (!isRtlText(text)) return {};
    return {
        writingDirection: 'rtl',
        textAlign: 'right',
    };
}
