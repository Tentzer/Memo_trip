import { pinThumbnailForRemoteCover, type RemotePinThumbnailDeps } from '@/lib/remotePinThumbnail';

const BRAVE_COVER = 'https://imgs.search.brave.com/abc/rs:fit:1200:800:1:0/g:ce/original-tripadvisor';

function deps(overrides: Partial<RemotePinThumbnailDeps> = {}): RemotePinThumbnailDeps {
    return {
        edge: 200,
        compress: 0.7,
        cacheDirectory: 'file:///cache/',
        downloadAsync: jest.fn().mockResolvedValue({ uri: 'file:///cache/pin-thumb.jpg', status: 200 }),
        getImageSize: jest.fn().mockResolvedValue({ width: 800, height: 600 }),
        manipulateAsync: jest.fn().mockResolvedValue({ uri: 'file:///cache/pin-thumb-small.jpg' }),
        ...overrides,
    };
}

describe('pinThumbnailForRemoteCover', () => {
    it('downloads the resized Brave src and manipulates the local file', async () => {
        const used = deps();
        const result = await pinThumbnailForRemoteCover(BRAVE_COVER, used);

        expect(used.downloadAsync).toHaveBeenCalledWith(
            'https://imgs.search.brave.com/abc/rs:fit:200:200:1:0/g:ce/original-tripadvisor',
            expect.stringMatching(/^file:\/\/\/cache\/pin-thumb-\d+\.jpg$/),
        );
        expect(used.manipulateAsync).toHaveBeenCalledWith(
            'file:///cache/pin-thumb.jpg',
            [{ resize: { width: 200 } }],
            { compress: 0.7, format: 'jpeg' },
        );
        expect(result).toEqual({ uploadUri: 'file:///cache/pin-thumb-small.jpg' });
    });

    it('keeps the small Brave URL when download or render fails and does not throw', async () => {
        const downloadFailed = await pinThumbnailForRemoteCover(BRAVE_COVER, deps({
            downloadAsync: jest.fn().mockRejectedValue(new Error('network')),
        }));
        expect(downloadFailed).toEqual({
            fallbackUrl: 'https://imgs.search.brave.com/abc/rs:fit:200:200:1:0/g:ce/original-tripadvisor',
        });

        const renderFailed = await pinThumbnailForRemoteCover(BRAVE_COVER, deps({
            manipulateAsync: jest.fn().mockRejectedValue(new Error('calling the renderAsync function has failed')),
        }));
        expect(renderFailed).toEqual({
            fallbackUrl: 'https://imgs.search.brave.com/abc/rs:fit:200:200:1:0/g:ce/original-tripadvisor',
        });
    });
});
