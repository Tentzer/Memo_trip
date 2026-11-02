import React from 'react';
import { act, create } from 'react-test-renderer';

import { usePlacePhotos } from '@/hooks/usePlacePhotos';
import { loadPlacePhotos } from '@/lib/places/loadPlacePhotos';
import type { Memory } from '@/types/memory';

jest.mock('@/lib/places/loadPlacePhotos', () => ({
    loadPlacePhotos: jest.fn(),
}));

const mockedLoad = loadPlacePhotos as jest.MockedFunction<typeof loadPlacePhotos>;

const memory: Memory = {
    id: 'memo-1',
    uri: 'https://example.com/memo.jpg',
    latitude: 35.665,
    longitude: 139.77,
    created_at: '2026-11-02T00:00:00.000Z',
    title: 'Sushi Dai',
    customFolderIds: [],
};

function renderPhotos(current: Memory | null) {
    let latest = { photos: [] as { thumb: string; full: string }[], loading: false, error: null as string | null };
    function Probe() {
        latest = usePlacePhotos(current);
        return null;
    }
    let renderer: { unmount(): void };
    act(() => {
        renderer = create(React.createElement(Probe));
    });
    return {
        get latest() {
            return latest;
        },
        async flush() {
            await act(async () => {
                await Promise.resolve();
            });
            return latest;
        },
        unmount() {
            act(() => renderer.unmount());
        },
    };
}

describe('usePlacePhotos', () => {
    beforeEach(() => {
        mockedLoad.mockReset();
    });

    it('stays idle when no memory is open', () => {
        const view = renderPhotos(null);
        expect(view.latest).toEqual({ photos: [], loading: false, error: null });
        expect(mockedLoad).not.toHaveBeenCalled();
        view.unmount();
    });

    it('loads photos after the sheet asks for them', async () => {
        mockedLoad.mockResolvedValue([
            { thumb: 'https://imgs.search.brave.com/a', full: 'https://cdn.example/a.jpg' },
        ]);
        const view = renderPhotos(memory);
        expect(view.latest.loading).toBe(true);
        const settled = await view.flush();
        expect(mockedLoad).toHaveBeenCalledWith(expect.objectContaining({
            id: 'memo-1',
            title: 'Sushi Dai',
            latitude: 35.665,
            longitude: 139.77,
        }));
        expect(settled).toEqual({
            photos: [{ thumb: 'https://imgs.search.brave.com/a', full: 'https://cdn.example/a.jpg' }],
            loading: false,
            error: null,
        });
        view.unmount();
    });
});
