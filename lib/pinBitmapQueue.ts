import { readDiskPinBitmap, persistPinBitmap } from '@/lib/pinBitmapDisk';
import { peekPinBitmap, placeholderBitmapUri, rememberPinBitmap } from '@/lib/pinBitmapCache';
import {
    PIN_BITMAP_CAPTURE_ATTEMPTS,
    PIN_BITMAP_CAPTURE_TIMEOUT_MS,
    PIN_BITMAP_FLUSH_MS,
} from '@/lib/pinBitmapCapture';
import {
    bitmapKeyForSpec,
    type BitmapSpec,
} from '@/lib/pinBitmapKey';

export type BitmapJob = {
    key: string;
    spec: BitmapSpec;
    resolve: (uri: string) => void;
};

type PendingResolve = {
    resolve: (uri: string) => void;
    uri: string;
};

let renderer: ((job: BitmapJob) => void) | null = null;
let paused = false;
let activeJob: BitmapJob | null = null;
let deadlineTimer: ReturnType<typeof setTimeout> | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const queue: BitmapJob[] = [];
const pending = new Map<string, Promise<string>>();
const pendingResolves: PendingResolve[] = [];

const JOB_DEADLINE_MS = PIN_BITMAP_CAPTURE_TIMEOUT_MS * PIN_BITMAP_CAPTURE_ATTEMPTS + 1500;

function clearDeadline() {
    if (deadlineTimer == null) return;
    clearTimeout(deadlineTimer);
    deadlineTimer = null;
}

function logPinBitmap(message: string, detail?: string) {
    if (!__DEV__) return;
    console.warn(`[pin-bitmap] ${message}`, detail ?? '');
}

function scheduleFlush() {
    if (flushTimer != null) return;
    flushTimer = setTimeout(flushResolves, PIN_BITMAP_FLUSH_MS);
}

function flushResolves() {
    flushTimer = null;
    if (paused) {
        if (pendingResolves.length > 0) scheduleFlush();
        return;
    }
    const batch = pendingResolves.splice(0, pendingResolves.length);
    for (const item of batch) item.resolve(item.uri);
}

function pump() {
    if (paused || activeJob || !renderer || queue.length === 0) return;
    const job = queue.shift();
    if (!job) return;
    activeJob = job;
    clearDeadline();
    deadlineTimer = setTimeout(() => {
        logPinBitmap('capture deadline, skipping photo', job.key);
        finishJob(job, placeholderBitmapUri(), false);
    }, JOB_DEADLINE_MS);
    renderer(job);
}

function finishJob(job: BitmapJob, uri: string, persist: boolean) {
    if (activeJob !== job) return;
    activeJob = null;
    clearDeadline();
    pending.delete(job.key);
    const stored = persist ? persistPinBitmap(job.key, uri) : rememberFallback(job.key, uri);
    pendingResolves.push({ resolve: job.resolve, uri: stored });
    scheduleFlush();
    pump();
}

function rememberFallback(key: string, uri: string): string {
    rememberPinBitmap(key, uri);
    return uri;
}

export function setPinBitmapCapturePaused(next: boolean) {
    if (paused === next) return;
    paused = next;
    if (!paused) {
        flushResolves();
        pump();
    }
}

export function registerPinBitmapRenderer(next: ((job: BitmapJob) => void) | null) {
    renderer = next;
    if (next) pump();
}

export function completePinBitmapJob(job: BitmapJob, tmpUri: string, persist = true) {
    finishJob(job, tmpUri, persist);
}

export function failPinBitmapJob(job: BitmapJob) {
    logPinBitmap('capture failed', job.key);
    finishJob(job, placeholderBitmapUri(), false);
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
