import { mapBravePlace, predictionFromBravePlace } from '@/lib/places/bravePlace';
import { selectSearchedPlace } from '@/lib/places/selectPlace';

const braveResult = {
    id: 'loc4G4LX7WYT25AUBNMX',
    title: 'Sushi Dai',
    description: 'Sushi Restaurant',
    coordinates: [35.665, 139.77],
    postal_address: { displayAddress: '5-2-1 Tsukiji, Tokyo' },
};

describe('selectSearchedPlace', () => {
    it('moves to a Brave result using the coordinates on the search row', () => {
        const mapped = mapBravePlace(braveResult);
        expect(mapped).not.toBeNull();
        const prediction = predictionFromBravePlace(mapped!);
        expect(selectSearchedPlace(prediction)).toEqual({
            placeId: 'loc4G4LX7WYT25AUBNMX',
            latitude: 35.665,
            longitude: 139.77,
            title: 'Sushi Dai',
            query: 'Sushi Dai, 5-2-1 Tsukiji, Tokyo',
            category: 'sushi',
        });
    });

    it('reads a [lat, lng] pair even when the values arrive as strings', () => {
        const mapped = mapBravePlace({
            ...braveResult,
            coordinates: ['35.665', '139.77'] as unknown as number[],
        });
        expect(mapped?.latitude).toBe(35.665);
        expect(mapped?.longitude).toBe(139.77);
    });

    it('does not invent a map target when the row has no coordinates', () => {
        expect(selectSearchedPlace({
            place_id: 'loc4G4LX7WYT25AUBNMX',
            description: 'Sushi Dai',
            structured_formatting: { main_text: 'Sushi Dai', secondary_text: '' },
        })).toBeNull();
    });
});