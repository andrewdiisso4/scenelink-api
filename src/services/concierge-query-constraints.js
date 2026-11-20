'use strict';

// Only fixed SQL fragments live here. All user values remain bound parameters.
function venueTypeSQL(kind) {
    const type = "regexp_replace(lower(btrim(COALESCE(type,''))), '[_-]+', ' ', 'g')";
    const category = "regexp_replace(lower(btrim(COALESCE(category,''))), '[_-]+', ' ', 'g')";
    if (kind === 'restaurant') return `(${type} = 'restaurant' OR ${category} = 'restaurant')`;
    if (kind === 'cocktail_bar') return `(${category} IN ('cocktail_bar','cocktail bar','cocktail lounge','cocktail','speakeasy') OR (${category} IN ('','bar','bars') AND ${type} IN ('bar','cocktail','cocktail_bar','cocktail bar')))`;
    if (kind === 'bar') return `(${type} IN ('bar','bars','cocktail','cocktail_bar','cocktail bar','pub','lounge','nightlife') OR ${category} ~ '(^|[ _-])(bar|bars|pub|lounge|speakeasy)($|[ _-])')`;
    if (kind === 'cafe') return `(${type} IN ('cafe','café','coffee') OR ${category} ~ '(cafe|café|coffee)')`;
    if (kind === 'nightlife' || kind === 'club') return `(${type} IN ('nightlife','club','nightclub') OR ${category} ~ '(nightclub|night_club|nightlife|dance_club)')`;
    const categories = {
        pub: ['pub'], brewery: ['brewery', 'breweries', 'brewpub'], winery: ['winery', 'wineries'],
        lounge: ['lounge'], music: ['music', 'music_venue', 'music venue', 'live_music', 'live music']
    };
    if (categories[kind]) {
        const values = categories[kind].map(v => `'${v.replace(/[_-]/g, ' ')}'`).join(',');
        return `(${type} IN (${values}) OR ${category} IN (${values}))`;
    }
    return null;
}

function exclusionSQL(filters, startIndex) {
    const conditions = [], values = [];
    const bind = value => { values.push(value); return '$' + (startIndex + values.length - 1); };
    const cuisine = filters.excludedCuisines || [];
    if (cuisine.length) {
        const parts = cuisine.map(value => `cuisine ILIKE ${bind('%' + value.replace(/[\\%_]/g, '\\$&') + '%')}`);
        // Unknown cuisine cannot establish that an excluded cuisine is absent.
        conditions.push(`(NULLIF(btrim(cuisine),'') IS NOT NULL AND NOT (${parts.join(' OR ')}))`);
    }
    const areas = filters.excludedNeighborhoods || [];
    if (areas.length) {
        const param = bind(areas.map(v => v.toLowerCase()));
        conditions.push(`(NULLIF(btrim(neighborhood),'') IS NOT NULL AND NOT (lower(neighborhood) = ANY(${param}::text[]) OR lower(COALESCE(city,'')) = ANY(${param}::text[])))`);
    }
    const typeExclusions = filters.excludedVenueTypes || [];
    if (typeExclusions.length) conditions.push("(NULLIF(btrim(type),'') IS NOT NULL OR NULLIF(btrim(category),'') IS NOT NULL)");
    for (const type of typeExclusions) {
        const clause = venueTypeSQL(type);
        if (clause) conditions.push(`NOT ${clause}`);
    }
    if (filters.excludedVenueNames?.length) {
        conditions.push(`NOT (lower(name) = ANY(${bind(filters.excludedVenueNames.map(v => v.toLowerCase()))}::text[]))`);
    }
    return { conditions, values, nextIndex: startIndex + values.length };
}

module.exports = { venueTypeSQL, exclusionSQL };
