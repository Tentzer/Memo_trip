import { supabase } from '@/lib/supabase';
import { mapBraveSearchResponse, predictionFromBravePlace } from '@/lib/places/bravePlace';
import { getPlacesClient } from '@/lib/places/client';
import { saveSearchedPlace } from '@/lib/places/saveSearchedPlace';
import { selectSearchedPlace } from '@/lib/places/selectPlace';

jest.mock('@/lib/supabase', () => ({
    supabase: { functions: { invoke: jest.fn() } },
}));

const invoke = supabase.functions.invoke as jest.Mock;

const braveBody = {
    type: 'locations',
    results: [{
        id: 'loc4G4LX7WYT25AUBNMX',
        title: 'Sushi Dai',
        description: 'Sushi Restaurant',
        coordinates: [35.665, 139.77],
        postal_address: { displayAddress: '5-2-1 Tsukiji, Tokyo' },
        thumbnail: { src: 'https://imgs.search.brave.com/thumb-only' },
        pictures: {
            results: [
                {
                    src: 'https://imgs.search.brave.com/cover-thumb',
                    original: 'https://imgs.search.brave.com/cover-full',
                },
                { src: 'https://imgs.search.brave.com/second' },
                { src: 'https://imgs.search.brave.com/third' },
                { src: 'https://imgs.search.brave.com/fourth' },
            ],
        },
    }],
};

describe('search, select, and save a Brave place', () => {
    beforeEach(() => {
        invoke.mockReset();
        invoke.mockImplementation(async (_name: string, options: { body?: { op?: string } }) => {
            if (options.body?.op === 'search') {
                const predictions = mapBraveSearchResponse(braveBody).map(predictionFromBravePlace);
                return { data: { predictions }, error: null };
            }
            return { data: { photos: [] }, error: null };
        });
    });

    it('saves the Brave cover photo and does not report a missing photo', async () => {
        const predictions = await getPlacesClient().search('sushi dai', {
            latitude: 35.66,
            longitude: 139.7,
        });
        const selected = selectSearchedPlace(predictions[0]);
        expect(selected?.placeId).toBe('loc4G4LX7WYT25AUBNMX');

        const addPlaceMemory = jest.fn().mockResolvedValue(undefined);
        const saved = await saveSearchedPlace({
            prediction: predictions[0],
            country: 'Japan',
            addPlaceMemory,
        });

        expect(saved.photoUri).toBe('https://imgs.search.brave.com/cover-full');
        expect(addPlaceMemory).toHaveBeenCalledWith(
            'https://imgs.search.brave.com/cover-full',
            35.665,
            139.77,
            'Japan',
            undefined,
            'Sushi Dai',
            { placeCategory: 'sushi' },
        );
        expect(invoke).toHaveBeenCalledTimes(1);
    });

    it('saves a placeholder when the place has no pictures and does not throw', async () => {
        const prediction = {
            place_id: 'locNOPHOTO',
            description: 'Quiet Park',
            structured_formatting: { main_text: 'Quiet Park', secondary_text: '' },
            latitude: 35.6,
            longitude: 139.7,
            placePhotos: [],
        };
        const addPlaceMemory = jest.fn().mockResolvedValue(undefined);
        const saved = await saveSearchedPlace({ prediction, addPlaceMemory });
        expect(saved.photoUri).toContain('placehold.co');
        expect(addPlaceMemory).toHaveBeenCalledWith(
            saved.photoUri,
            35.6,
            139.7,
            '',
            undefined,
            'Quiet Park',
            { placeCategory: undefined },
        );
    });
});
