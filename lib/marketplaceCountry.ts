const UNKNOWN_LOCATION = 'unknown location';

export function isUnknownCountry(country?: string | null): boolean {
    const normalized = country?.trim().toLowerCase();
    return !normalized || normalized === UNKNOWN_LOCATION;
}

export type MarketplaceCountryResult =
    | { ok: true; country: string }
    | { ok: false; error: string };

export function resolveMarketplaceCountry(
    items: { country?: string | null }[],
): MarketplaceCountryResult {
    const knownCountries = [
        ...new Set(
            items
                .map((item) => item.country?.trim())
                .filter((country): country is string => !!country && !isUnknownCountry(country)),
        ),
    ];

    if (knownCountries.length === 0) {
        return {
            ok: false,
            error: 'At least one memo must have a known country before publishing.',
        };
    }

    if (knownCountries.length > 1) {
        return {
            ok: false,
            error: `All memos must be from the same country. Found: ${knownCountries.join(', ')}.`,
        };
    }

    return { ok: true, country: knownCountries[0] };
}

export function normalizeMarketplaceCountryDisplay(country?: string | null): string | undefined {
    if (isUnknownCountry(country)) {
        return undefined;
    }
    return country?.trim() || undefined;
}

export function displayMarketplaceCountry(
    libraryCountry: string | undefined,
    photos: { country?: string | null }[],
): string | undefined {
    const fromLibrary = normalizeMarketplaceCountryDisplay(libraryCountry);
    if (fromLibrary) {
        return fromLibrary;
    }

    const resolved = resolveMarketplaceCountry(photos);
    return resolved.ok ? resolved.country : undefined;
}
