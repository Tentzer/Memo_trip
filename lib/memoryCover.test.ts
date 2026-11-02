import { memoryCoverFields } from '@/lib/memoryCover';

describe('memoryCoverFields', () => {
    it('writes the Brave cover to both uri and thumb_uri', () => {
        const cover = 'https://imgs.search.brave.com/zozobra/rs:fit:1200:800:1:0/g:ce/photo';
        expect(memoryCoverFields(cover)).toEqual({
            uri: cover,
            thumbUri: 'https://imgs.search.brave.com/zozobra/rs:fit:200:200:1:0/g:ce/photo',
        });
    });

    it('does not treat the question-mark placeholder as a cover', () => {
        const placeholder = 'https://placehold.co/400x400/e2e8f0/94a3b8.png?text=?';
        expect(memoryCoverFields(placeholder)).toEqual({ uri: placeholder, thumbUri: null });
    });
});