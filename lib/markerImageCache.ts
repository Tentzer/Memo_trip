export type PaintedMarkerPhase = 'loaded' | 'error';

type PaintedMarker = {
    imageUri: string;
    phase: PaintedMarkerPhase;
};

const paintedByMemoryId = new Map<string, PaintedMarker>();

/** The last snapshot phase for a memory, or null when the photo changed. */
export function paintedMarkerPhase(memoryId: string, imageUri: string): PaintedMarkerPhase | null {
    const painted = paintedByMemoryId.get(memoryId);
    if (!painted || painted.imageUri !== imageUri) return null;
    return painted.phase;
}

/** Remember a finished snapshot so a later remount can show the photo immediately. */
export function rememberPaintedMarker(memoryId: string, imageUri: string, phase: PaintedMarkerPhase): void {
    paintedByMemoryId.set(memoryId, { imageUri, phase });
}
