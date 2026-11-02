import type { MemoryPlaceCategory } from '../../types/memory';

const RANK: Record<MemoryPlaceCategory, number> = {
    sushi: 1,
    ramen: 2,
    pasta: 3,
    bakery: 4,
    cafe: 5,
    bar: 6,
    shopping: 7,
    attraction: 8,
    restaurant: 9,
    other: 10,
};

interface CategoryRule {
    category: MemoryPlaceCategory;
    pattern: RegExp;
}

/** Name and short-type text. Specific cuisines outrank the generic restaurant bucket. */
const TEXT_RULES: CategoryRule[] = [
    { category: 'sushi', pattern: /\b(sushi|omakase|nigiri|sashimi|maki)\b/i },
    { category: 'ramen', pattern: /\b(ramen|ramen-ya|tonkotsu|shoyu)\b/i },
    { category: 'pasta', pattern: /\b(pasta|carbonara|spaghetti|penne|bolognese|trattoria)\b/i },
    { category: 'bakery', pattern: /\b(bakery|patisserie|pastry|boulangerie|croissant|donut|doughnut)\b/i },
    { category: 'cafe', pattern: /\b(cafes?|café|coffee|espresso|brunch|tea house|creperie|crêperie|crepe|crêpe)\b/i },
    { category: 'bar', pattern: /\b(cocktail bar|wine bar|speakeasy|nightclub|night club|pub|bar)\b/i },
    { category: 'shopping', pattern: /\b(7[\s-]?eleven|convenience store|souvenir|boutique|shopping mall|mall|supermarket|grocery|store|shop)\b/i },
    { category: 'attraction', pattern: /\b(museum|monument|viewpoint|landmark|gallery|zoo|temple|shrine|castle|tourist attraction)\b/i },
    { category: 'restaurant', pattern: /\b(restaurant|pizzeria|pizza|steakhouse|osteria|bistro|eatery|diner|grill|izakaya|taqueria|shawarma|burger)\b/i },
];

/** Provider type tokens. Generic map pins such as point_of_interest are ignored by the caller. */
const TYPE_RULES: CategoryRule[] = [
    ...TEXT_RULES,
    { category: 'restaurant', pattern: /\b(food|meal takeaway|meal delivery|meal_takeaway|meal_delivery)\b/i },
    { category: 'shopping', pattern: /\b(convenience store|grocery or supermarket|department store|clothing store|book store|shopping)\b/i },
    { category: 'attraction', pattern: /\b(park|church|mosque|hindu temple|place of worship|aquarium|art gallery|stadium|zoo)\b/i },
    { category: 'bar', pattern: /\bnight club\b/i },
    { category: 'cafe', pattern: /\b(coffee shop|ice cream shop)\b/i },
];

const CUISINE_RULES: CategoryRule[] = [
    { category: 'sushi', pattern: /sushi|omakase|nigiri|sashimi/i },
    { category: 'ramen', pattern: /ramen|tonkotsu/i },
    { category: 'pasta', pattern: /pasta|spaghetti|carbonara/i },
    { category: 'cafe', pattern: /coffee|café|cafe/i },
    { category: 'bakery', pattern: /bakery|pastry|patisserie/i },
    { category: 'bar', pattern: /\b(bar|pub|wine)\b/i },
    {
        category: 'restaurant',
        pattern: /japan|japon|japones|japonaise|giappones|日本|asian|chinese|thai|korean|indian|italian|french|mexican|greek|mediterranean|vietnamese|turkish|american/i,
    },
];

const HEURISTIC_RULES: CategoryRule[] = [
    { category: 'sushi', pattern: /sushi|omakase|nigiri|sashimi|\bmaki\b|סושי/i },
    { category: 'ramen', pattern: /ramen|ramen-ya|tonkotsu|shoyu|menya|ラーメン|ראמן/i },
    { category: 'pasta', pattern: /pasta|carbonara|spaghetti|penne|ragu|bolognese|trattoria|פסטה/i },
    {
        category: 'restaurant',
        pattern: /restaurant|pizzeria|pizza(?:eria)?|steakhouse|osteria|bistro|eatery|diner|grill|izakaya|taqueria|shawarma|souvlaki|gyros|takoyaki|burger|hamburger|fine dining|street food|food spot|noodle shop|מסעדה/i,
    },
    { category: 'cafe', pattern: /caf[eé]|coffee shop|coffee house|espresso|brunch|tea house|breakfast spot|pancake|קפה/i },
    { category: 'bar', pattern: /cocktail bar|wine bar|nightclub|speakeasy|\bbar\b|\bpub\b|happy hour/i },
    { category: 'bakery', pattern: /bakery|patisserie|pastry shop|bread shop|donut shop|cake shop|tiramisu|croissant|gelato shop/i },
    { category: 'attraction', pattern: /museum|monument|viewpoint|landmark|gallery|zoo|historic site|tourist attraction|temple|shrine|castle/i },
    { category: 'shopping', pattern: /7[\s-]?eleven|convenience store|souvenir shop|boutique|shopping mall|\bmall\b|supermarket|grocery|market stall|\bstore\b|\bshop\b/i },
];

const DESCRIPTION_LEAD = /^(?:a|an)\s+[\w\s'-]+\s+(restaurant|pasta|ramen|sushi|cafe|bar|bakery|attraction|shopping)\b/i;

const IGNORED_TYPE = /^(point of interest|establishment|geocode|political|locality|route|street address|premise|subpremise|plus code|postal code|neighborhood|colloquial area)$/;

function isGeneric(category: MemoryPlaceCategory): boolean {
    return category === 'restaurant' || category === 'other';
}

function preferCategory(
    current: MemoryPlaceCategory | undefined,
    next: MemoryPlaceCategory | undefined,
): MemoryPlaceCategory | undefined {
    if (!next) return current;
    if (!current || RANK[next] < RANK[current]) return next;
    return current;
}

function bestMatch(text: string | null | undefined, rules: CategoryRule[]): MemoryPlaceCategory | undefined {
    const value = text?.trim();
    if (!value) return undefined;
    let best: MemoryPlaceCategory | undefined;
    for (const rule of rules) {
        if (!rule.pattern.test(value)) continue;
        best = preferCategory(best, rule.category);
    }
    return best;
}

function bestFromList(
    values: string[] | null | undefined,
    rules: CategoryRule[],
): MemoryPlaceCategory | undefined {
    let best: MemoryPlaceCategory | undefined;
    for (const value of values ?? []) {
        best = preferCategory(best, bestMatch(value, rules));
    }
    return best;
}

/**
 * Earlier fields win. A generic restaurant match does not hide a more specific
 * category found on a later field (description "Restaurant", name "Ippudo Ramen").
 */
function firstSpecific(
    candidates: (MemoryPlaceCategory | undefined)[],
): MemoryPlaceCategory | undefined {
    let current: MemoryPlaceCategory | undefined;
    for (const next of candidates) {
        if (!next) continue;
        if (!current) {
            current = next;
            if (!isGeneric(current)) return current;
            continue;
        }
        if (isGeneric(current) && !isGeneric(next)) return next;
    }
    return current;
}

function countMatches(text: string, pattern: RegExp): number {
    const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
    return text.match(new RegExp(pattern.source, flags))?.length ?? 0;
}

/**
 * Port of the title/description scorer used to backfill memory categories.
 * Used only after the structured Brave and Google fields do not classify the place.
 */
export function classifyPlaceText(
    title: string | null | undefined,
    description: string | null | undefined,
): MemoryPlaceCategory | undefined {
    const titleText = title?.trim() ?? '';
    const descriptionText = description?.trim() ?? '';
    const combined = `${titleText}\n${descriptionText}`.trim();
    if (!combined) return undefined;

    const lead = DESCRIPTION_LEAD.exec(descriptionText);
    if (lead) return lead[1].toLowerCase() as MemoryPlaceCategory;

    const scores = new Map<MemoryPlaceCategory, number>();
    for (const rule of HEURISTIC_RULES) {
        const hits = countMatches(combined, rule.pattern);
        if (hits > 0) scores.set(rule.category, (scores.get(rule.category) ?? 0) + hits);
    }

    const titleLower = titleText.toLowerCase();
    const bump = (category: MemoryPlaceCategory, when: boolean) => {
        if (!when) return;
        scores.set(category, (scores.get(category) ?? 0) + 2);
    };
    bump('ramen', titleLower.includes('ramen') || titleLower.includes('menya'));
    bump('sushi', titleLower.includes('sushi'));
    bump('pasta', titleLower.includes('pasta') || titleLower.includes('trattoria'));
    bump('restaurant', titleLower.includes('restaurant') || titleLower.includes('pizzeria'));
    bump('cafe', titleLower.includes('caff') || titleLower.includes('coffee'));
    bump('bar', titleLower.includes('bar') || titleLower.includes('pub'));
    bump('bakery', titleLower.includes('bakery') || titleLower.includes('patisserie'));

    let best: MemoryPlaceCategory | undefined;
    let bestScore = 0;
    for (const [category, score] of scores) {
        if (score > bestScore) {
            best = category;
            bestScore = score;
        }
    }
    return bestScore > 0 ? best : undefined;
}

export interface BraveCategoryInput {
    name?: string | null;
    /** Short type such as "Sushi Restaurant" or "Creperie". Not a long review. */
    description?: string | null;
    servesCuisine?: string[] | null;
    categories?: string[] | null;
    iconCategory?: string | null;
}

/**
 * Description, then name, then cuisine, then categories and icon, then the
 * existing title/description scorer.
 */
export function mapBravePlaceCategory(input: BraveCategoryInput): MemoryPlaceCategory | undefined {
    const matched = firstSpecific([
        bestMatch(input.description, TEXT_RULES),
        bestMatch(input.name, TEXT_RULES),
        bestFromList(input.servesCuisine, CUISINE_RULES),
        bestFromList(input.categories, TYPE_RULES),
        bestMatch(input.iconCategory, TYPE_RULES),
    ]);
    return matched ?? classifyPlaceText(input.name, input.description);
}

const SKIPPED_GOOGLE_TYPE = /^(point_of_interest|establishment|geocode|political|locality)$/i;

function categoryFromGoogleType(raw: string | null | undefined): MemoryPlaceCategory | undefined {
    const token = raw?.trim().toLowerCase() ?? '';
    if (!token || SKIPPED_GOOGLE_TYPE.test(token)) return undefined;
    const spaced = token.replace(/[_-]+/g, ' ');
    if (IGNORED_TYPE.test(spaced)) return undefined;
    return bestMatch(spaced, TYPE_RULES);
}

export interface GoogleCategoryInput {
    name?: string | null;
    description?: string | null;
    primaryType?: string | null;
    types?: string[] | null;
}

/** primaryType, then name, then types, then the same text scorer. */
export function mapGooglePlaceCategory(input: GoogleCategoryInput): MemoryPlaceCategory | undefined {
    const fromTypes = (input.types ?? [])
        .map((type) => categoryFromGoogleType(type))
        .reduce<MemoryPlaceCategory | undefined>((best, next) => preferCategory(best, next), undefined);
    const matched = firstSpecific([
        categoryFromGoogleType(input.primaryType),
        bestMatch(input.name, TEXT_RULES),
        fromTypes,
    ]);
    return matched ?? classifyPlaceText(input.name, input.description);
}
