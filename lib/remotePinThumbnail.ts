const BRAVE_FIT = /rs:fit:\d+:\d+/;

/** Smallest reliable Brave image: the proxied `src`, resized, not the original host URL. */
export function braveProxiedThumbUrl(coverUrl: string, edge: number): string {
    const size = Math.max(1, Math.round(edge));
    if (!coverUrl.includes('imgs.search.brave.com')) return coverUrl;
    if (BRAVE_FIT.test(coverUrl)) {
        return coverUrl.replace(BRAVE_FIT, `rs:fit:${size}:${size}`);
    }
    try {
        const url = new URL(coverUrl);
        url.searchParams.set('w', String(size));
        url.searchParams.set('h', String(size));
        return url.toString();
    } catch {
        return coverUrl;
    }
}

export interface RemotePinThumbnailDeps {
    edge: number;
    compress: number;
    cacheDirectory: string;
    downloadAsync: (from: string, to: string) => Promise<{ uri?: string; status?: number }>;
    getImageSize: (uri: string) => Promise<{ width: number; height: number }>;
    manipulateAsync: (
        localUri: string,
        actions: { resize: { width?: number; height?: number } }[],
        options: { compress: number; format: 'jpeg' },
    ) => Promise<{ uri: string }>;
}

function resizeActions(width: number, height: number, edge: number) {
    if (Math.max(width, height) <= edge) return [];
    return width >= height
        ? [{ resize: { width: edge } }]
        : [{ resize: { height: edge } }];
}

/**
 * Download a remote cover to a cache file, then resize it locally.
 * Throws when the download or render cannot produce a file.
 */
export async function renderRemotePinThumbnail(
    coverUrl: string,
    deps: RemotePinThumbnailDeps,
): Promise<string> {
    if (!deps.cacheDirectory) {
        throw new Error('No cache directory.');
    }
    const source = braveProxiedThumbUrl(coverUrl, deps.edge);
    const destination = `${deps.cacheDirectory}pin-thumb-${Date.now()}.jpg`;
    const downloaded = await deps.downloadAsync(source, destination);
    const status = downloaded.status ?? 0;
    if (!downloaded.uri || status < 200 || status >= 300) {
        throw new Error(`Cover download failed (${status}).`);
    }

    const { width, height } = await deps.getImageSize(downloaded.uri);
    if (!(width > 0) || !(height > 0)) {
        throw new Error('Image has no dimensions.');
    }
    const rendered = await deps.manipulateAsync(
        downloaded.uri,
        resizeActions(width, height, deps.edge),
        { compress: deps.compress, format: 'jpeg' },
    );
    if (!rendered.uri) {
        throw new Error('Thumbnail render failed.');
    }
    return rendered.uri;
}

/** Local file to upload, or the remote small thumbnail when download/render fails. */
export async function pinThumbnailForRemoteCover(
    coverUrl: string,
    deps: RemotePinThumbnailDeps,
): Promise<{ uploadUri: string } | { fallbackUrl: string }> {
    try {
        return { uploadUri: await renderRemotePinThumbnail(coverUrl, deps) };
    } catch {
        return { fallbackUrl: braveProxiedThumbUrl(coverUrl, deps.edge) };
    }
}
