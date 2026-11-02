/** Set to true to show Take Photo in the floating tab bar again. The camera route stays registered either way. */
export const SHOW_TAKE_PHOTO_TAB = false;

export function isFloatingTabVisible(routeName: string): boolean {
    if (routeName === 'TakePicture') return SHOW_TAKE_PHOTO_TAB;
    return true;
}
