import { loadPlacePhotos } from '@/lib/places/loadPlacePhotos';
import { clearPlacePhotoSession } from '@/lib/places/placePhotoSession';
import type { PlacePhotoLoader } from '@/lib/places/loadPlacePhotos';

jest.mock('@/lib/supabase', () => ({
    supabase: { functions: { invoke: jest.fn() } },
}));

jest.mock('@/lib/googlePlaces', () => ({
    fetchGooglePlacePhotoReferences: jest.fn(),
    fetchGooglePlacePredictions: jest.fn(),
}));

const memory = {
    id: 'm1',
    title: 'Sushi Dai',
    latitude: 35.665,
    longitude: 139.77,
};

function loader(overrides: Partial<PlacePhotoLoader> = {}) {
    const braveDetails = jest.fn().mockResolvedValue({
        place: {
            placeId: 'loc4G4LX7WYT25AUBNMX',
            placePhotos: [
                { thumb: 'https://imgs.search.brave.com/a', full: 'https://cdn.example/a.jpg' },
            ],
        },
    });
    const googleReferences = jest.fn().mockResolvedValue(['ref-1', 'ref-2']);
    const deps: PlacePhotoLoader = {
        braveDetails,
        googleReferences,
        googlePlaceIdForTitle: jest.fn().mockResolvedValue('ChIJlegacy'),
        googleApiKey: () => 'google-key',
        provider: () => 'brave',
        ...overrides,
    };
    return { deps, braveDetails, googleReferences };
}

describe('loadPlacePhotos', () => {
    beforeEach(() => {
        clearPlacePhotoSession();
    });

    it('loads Brave photos through place details and reuses the session cache', async () => {
        const { deps, braveDetails, googleReferences } = loader();
        const first = await loadPlacePhotos(memory, deps);
        const second = await loadPlacePhotos(memory, deps);
        expect(first).toEqual([
            { thumb: 'https://imgs.search.brave.com/a', full: 'https://cdn.example/a.jpg' },
        ]);
        expect(second).toEqual(first);
        expect(braveDetails).toHaveBeenCalledTimes(1);
        expect(googleReferences).not.toHaveBeenCalled();
    });

    it('maps legacy Google place ids through the photo URL helper', async () => {
        const { deps, braveDetails, googleReferences } = loader();
        const photos = await loadPlacePhotos({
            ...memory,
            placeId: 'ChIJlegacyplace',
        }, deps);
        expect(braveDetails).not.toHaveBeenCalled();
        expect(googleReferences).toHaveBeenCalledWith('ChIJlegacyplace');
        expect(photos[0]?.thumb).toContain('maxwidth=400');
        expect(photos[0]?.full).toContain('maxwidth=1200');
        expect(photos).toHaveLength(2);
    });

    it('does not call the network when the memory has no title or place id', async () => {
        const { deps, braveDetails } = loader();
        const photos = await loadPlacePhotos({ ...memory, title: '  ' }, deps);
        expect(photos).toEqual([]);
        expect(braveDetails).not.toHaveBeenCalled();
    });
});
