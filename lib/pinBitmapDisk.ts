import { Directory, File, Paths } from 'expo-file-system';
import { peekPinBitmap, rememberPinBitmap } from '@/lib/pinBitmapCache';
import { pinBitmapFileName } from '@/lib/pinBitmapKey';

const DIRECTORY_NAME = 'pin-bitmaps';

function bitmapFile(key: string): File {
    const directory = new Directory(Paths.cache, DIRECTORY_NAME);
    if (!directory.exists) directory.create({ idempotent: true });
    return new File(directory, pinBitmapFileName(key));
}

export function readDiskPinBitmap(key: string): string | null {
    const memoryHit = peekPinBitmap(key);
    if (memoryHit) return memoryHit;
    try {
        const file = bitmapFile(key);
        if (!file.exists) return null;
        rememberPinBitmap(key, file.uri);
        return file.uri;
    } catch {
        return null;
    }
}

export function persistPinBitmap(key: string, tmpUri: string): string {
    try {
        const file = bitmapFile(key);
        if (!file.exists) new File(tmpUri).copy(file);
        rememberPinBitmap(key, file.uri);
        return file.uri;
    } catch {
        rememberPinBitmap(key, tmpUri);
        return tmpUri;
    }
}
