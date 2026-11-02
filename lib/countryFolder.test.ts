import { describe, expect, it } from '@jest/globals';
import { countryFolderName, UNITED_STATES_FOLDER, UNKNOWN_COUNTRY_FOLDER } from '@/lib/countryFolder';

describe('country folder grouping', () => {
    it('groups a US state under the United States', () => {
        expect(countryFolderName({ country: 'Maryland' })).toBe(UNITED_STATES_FOLDER);
        expect(countryFolderName({ country: '  california ' })).toBe(UNITED_STATES_FOLDER);
        expect(countryFolderName({ country: 'District of Columbia' })).toBe(UNITED_STATES_FOLDER);
        expect(countryFolderName({ country: 'USA' })).toBe(UNITED_STATES_FOLDER);
    });

    it('keeps real countries, including Georgia', () => {
        expect(countryFolderName({ country: 'Italy' })).toBe('Italy');
        expect(countryFolderName({ country: 'Georgia' })).toBe('Georgia');
        expect(countryFolderName({ country: '' })).toBe(UNKNOWN_COUNTRY_FOLDER);
        expect(countryFolderName({ country: undefined })).toBe(UNKNOWN_COUNTRY_FOLDER);
    });
});