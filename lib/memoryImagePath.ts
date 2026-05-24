/** Path inside bucket `memories`, e.g. `uuid.jpg` or `library-covers/foo.jpg`. */
export function pathFromMemoryPublicUrl(url: string): string | null {
    const trimmed = decodeURIComponent(url.trim());
    const markers = ['/object/public/memories/', '/storage/v1/object/public/memories/'];
    for (const marker of markers) {
        const index = trimmed.indexOf(marker);
        if (index !== -1) {
            return trimmed.slice(index + marker.length).split('?')[0] || null;
        }
    }
    return null;
}
