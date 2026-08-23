import { localitiesAlign, type LocalityProfile } from './locality_filter.ts';

function p(country: string, ...settlements: string[]): LocalityProfile {
    return {
        countryKey: country,
        settlementKeys: new Set(settlements),
    };
}

Deno.test('localitiesAlign same primary settlement', () => {
    const ok = localitiesAlign(
        p('israel', 'tel aviv-yafo'),
        p('israel', 'tel aviv-yafo'),
    );
    if (!ok) throw new Error('expected match');
});

Deno.test('localitiesAlign different cities same country', () => {
    const ok = localitiesAlign(
        p('israel', 'haifa'),
        p('israel', 'tel aviv-yafo'),
    );
    if (ok) throw new Error('expected no match');
});

Deno.test('localitiesAlign substring for compound city names', () => {
    const ok = localitiesAlign(
        p('israel', 'tel aviv-yafo'),
        p('israel', 'tel aviv'),
    );
    if (!ok) throw new Error('expected fuzzy match');
});

Deno.test('localitiesAlign rejects different country', () => {
    const ok = localitiesAlign(
        p('israel', 'tel aviv-yafo'),
        p('france', 'tel aviv-yafo'),
    );
    if (ok) throw new Error('expected no match');
});
