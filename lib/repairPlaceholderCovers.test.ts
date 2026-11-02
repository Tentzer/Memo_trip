import { repairPlaceholderCovers } from '@/lib/repairPlaceholderCovers';
import type { Memory } from '@/types/memory';

const placeholder = 'https://placehold.co/400x400/e2e8f0/94a3b8.png?text=?';

function memory(overrides: Partial<Memory> = {}): Memory {
    return {
        id: 'zozobra',
        uri: placeholder,
        thumb_uri: placeholder,
        latitude: 32.07,
        longitude: 34.78,
        created_at: '2026-11-02T00:00:00.000Z',
        title: 'Zozobra',
        placeId: 'locZOZOBRA',
        customFolderIds: [],
        ...overrides,
    };
}

describe('repairPlaceholderCovers', () => {
    it('replaces a placeholder pin photo with the Brave cover', async () => {
        const updateCover = jest.fn().mockResolvedValue(true);
        const repaired = await repairPlaceholderCovers([memory()], {
            loadPhotos: async () => [{
                thumb: 'https://imgs.search.brave.com/zozobra/rs:fit:1200:800:1:0/g:ce/photo',
                full: 'https://cdn.example/zozobra.jpg',
            }],
            updateCover,
        });
        expect(updateCover).toHaveBeenCalledWith('zozobra', {
            image_url: 'https://imgs.search.brave.com/zozobra/rs:fit:1200:800:1:0/g:ce/photo',
            thumb_uri: 'https://imgs.search.brave.com/zozobra/rs:fit:200:200:1:0/g:ce/photo',
        });
        expect(repaired?.[0].uri).toBe('https://imgs.search.brave.com/zozobra/rs:fit:1200:800:1:0/g:ce/photo');
        expect(repaired?.[0].thumb_uri).toContain('rs:fit:200:200');
    });

    it('leaves a real camera photo alone', async () => {
        const updateCover = jest.fn();
        const repaired = await repairPlaceholderCovers([
            memory({ uri: 'file:///camera.jpg', thumb_uri: 'https://cdn.example/thumb.jpg', placeId: undefined }),
        ], { updateCover });
        expect(repaired).toBeNull();
        expect(updateCover).not.toHaveBeenCalled();
    });
});