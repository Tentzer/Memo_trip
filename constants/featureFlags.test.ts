import { describe, expect, it } from '@jest/globals';
import { SHOW_TAKE_PHOTO_TAB, isFloatingTabVisible } from '@/constants/featureFlags';

describe('floating tab flags', () => {
    it('hides Take Photo while the flag is off and keeps the other tabs', () => {
        expect(SHOW_TAKE_PHOTO_TAB).toBe(false);
        expect(isFloatingTabVisible('TakePicture')).toBe(false);
        expect(isFloatingTabVisible('Home')).toBe(true);
        expect(isFloatingTabVisible('libraries')).toBe(true);
        expect(isFloatingTabVisible('video-import')).toBe(true);
    });
});
