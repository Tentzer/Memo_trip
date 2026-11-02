import { readDiskPinBitmap, persistPinBitmap } from '@/lib/pinBitmapDisk';
import { peekPinBitmap } from '@/lib/pinBitmapCache';
import {
    PIN_BITMAP_PLACEHOLDER_KEY,
    bitmapKeyForSpec,
    type BitmapSpec,
} from '@/lib/pinBitmapKey';

export type BitmapJob = {
    key: string;
    spec: BitmapSpec;
    resolve: (uri: string) => void;
};

let renderer: ((job: BitmapJob) => void) | null = null;
let active = false;
const queue: BitmapJob[] = [];
const pending = new Map<string, Promise<string>>();

function pump() {
    if (active || !renderer || queue.length === 0) return;
    active = true;
    const job = queue.shift();
    if (!job) {
        active = false;
        return;
    }
    renderer(job);
}

export function registerPinBitmapRenderer(next: ((job: BitmapJob) => void) | null) {
    renderer = next;
    if (next) pump();
}

export function completePinBitmapJob(job: BitmapJob, tmpUri: string) {
    const stored = persistPinBitmap(job.key, tmpUri);
    job.resolve(stored);
    pending.delete(job.key);
    active = false;
    pump();
}

export function failPinBitmapJob(job: BitmapJob) {
    pending.delete(job.key);
    active = false;
    pump();
}

export function requestPinBitmap(spec: BitmapSpec, front = false): Promise<string> {
    const key = bitmapKeyForSpec(spec);
    const memoryHit = peekPinBitmap(key);
    if (memoryHit) return Promise.resolve(memoryHit);
    const diskHit = readDiskPinBitmap(key);
    if (diskHit) return Promise.resolve(diskHit);
    const existing = pending.get(key);
    if (existing) return existing;
    const promise = new Promise<string>((resolve) => {
        const job = { key, spec, resolve };
        if (front) queue.unshift(job);
        else queue.push(job);
        pump();
    });
    pending.set(key, promise);
    return promise;
}

export function placeholderBitmapSpec(): BitmapSpec {
    return { kind: 'placeholder' };
}

export { PIN_BITMAP_PLACEHOLDER_KEY };
