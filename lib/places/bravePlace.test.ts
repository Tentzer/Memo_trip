import { mapBravePlace, mapBraveSearchResponse, bravePlaceSearchUrl } from '@/lib/places/bravePlace';

const sushiPlace = {
    id: 'loc4G4LX7WYT25AUBNMX',
    title: 'Sushi Dai',
    url: 'https://sushidai.example',
    description: 'Sushi Restaurant',
    coordinates: [35.665, 139.77],
    thumbnail: { src: 'https://img.example/thumb.jpg', original: 'https://img.example/original.jpg' },
    postal_address: { displayAddress: '5-2-1 Tsukiji, Tokyo' },
    opening_hours: {
        current_day: [{ abbr_name: 'Mon', full_name: 'Monday', opens: '11:00', closes: '14:00' }],
        days: [[{ abbr_name: 'Mon', full_name: 'Monday', opens: '11:00', closes: '14:00' }]],
    },
    contact: { telephone: '+81 3-0000-0000' },
    rating: { ratingValue: 4.6, bestRating: 5, reviewCount: 1200 },
    pictures: {
        results: [
            { src: 'https://img.example/1.jpg' },
            { src: 'https://img.example/logo.jpg', logo: true },
            { src: 'https://img.example/2.jpg', duplicated: true },
            { src: 'https://img.example/3.jpg' },
        ],
    },
    categories: ['restaurant'],
    icon_category: 'restaurant',
    serves_cuisine: ['Japanese', 'Asian'],
};

describe('mapBravePlace', () => {
    it('maps a place search result onto the app place shape', () => {
        const mapped = mapBravePlace(sushiPlace);
        expect(mapped).toMatchObject({
            placeId: 'loc4G4LX7WYT25AUBNMX',
            name: 'Sushi Dai',
            description: 'Sushi Dai, 5-2-1 Tsukiji, Tokyo',
            typeLabel: 'Sushi Restaurant',
            address: '5-2-1 Tsukiji, Tokyo',
            latitude: 35.665,
            longitude: 139.77,
            category: 'sushi',
            rating: 4.6,
            reviewCount: 1200,
            phone: '+81 3-0000-0000',
            website: 'https://sushidai.example',
            hours: 'Monday: 11:00-14:00',
            photoUrls: ['https://img.example/1.jpg', 'https://img.example/3.jpg'],
            placePhotos: [
                { thumb: 'https://img.example/1.jpg', full: 'https://img.example/1.jpg' },
                { thumb: 'https://img.example/3.jpg', full: 'https://img.example/3.jpg' },
            ],
        });
    });

    it('stores title, coordinates, and address when the result has no id', () => {
        const mapped = mapBravePlace({
            title: 'Blue Bottle',
            description: 'Cafe',
            coordinates: [35.66, 139.7],
            postal_address: { displayAddress: 'Kiyosumi, Tokyo' },
        });
        expect(mapped?.placeId).toBe('brave:blue bottle:35.66000:139.70000:kiyosumi, tokyo');
        expect(mapped?.category).toBe('cafe');
        expect(mapped?.photoUrls).toEqual([]);
    });

    it('reads the locations envelope and skips rows without a name or coordinates', () => {
        const mapped = mapBraveSearchResponse({
            type: 'locations',
            results: [sushiPlace, { title: 'Missing coords' }, { coordinates: [1, 2] }],
        });
        expect(mapped).toHaveLength(1);
        expect(mapped[0]?.placeId).toBe('loc4G4LX7WYT25AUBNMX');
    });

    it('builds the place search URL without putting a key in the query', () => {
        const url = bravePlaceSearchUrl({
            query: 'ramen tokyo',
            latitude: 35.6,
            longitude: 139.7,
            radiusMeters: 3000,
        });
        expect(url.startsWith('https://api.search.brave.com/res/v1/local/place_search?')).toBe(true);
        expect(url).toContain('q=ramen+tokyo');
        expect(url).toContain('latitude=35.6');
        expect(url).toContain('longitude=139.7');
        expect(url).toContain('radius=3000');
        expect(url).not.toContain('key=');
    });
});
