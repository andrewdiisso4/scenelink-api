'use strict';

// Deliberately exact, not fuzzy: explicit unknown names must not broaden into
// unrelated recommendations. Quotes allow constraints outside the venue name.
function explicitName(message) {
    const text = String(message || '').trim().slice(0, 500);
    const quoted = text.match(/["“]([^"”]{0,500})["”]/);
    if (quoted) return { name: quoted[1].trim(), filterText: text.replace(quoted[0], '') };
    const named = text.match(/^(?:tell me about|show me|look up|lookup|find)\s+(?:(?:the\s+)?(?:venue|restaurant|bar|cafe)\s+(?:named|called)\s+)(.+?)\s*[?.!]?$/i)
        || text.match(/^(?:tell me about|look up|lookup)\s+(.+?)\s*[?.!]?$/i);
    if (!named) return null;
    const parts = named[1].split(/\s+(?=(?:in|near|under|below|for)\s)/i);
    return { name: parts.shift().trim(), filterText: parts.join(' ') };
}

async function resolveNamedVenue(pool, message) {
    const explicit = explicitName(message);
    if (explicit) return explicit;
    const text = String(message || '').trim().slice(0, 500);
    if (!text) return null;
    // Exact bare-name detection uses the whole catalog, before either candidate
    // limit. Existence detection intentionally includes unavailable/hidden names:
    // this prevents unrelated fallback, not permission to disclose those rows.
    // Final candidate queries still enforce availability and visibility.
    // Only the user's input name leaves this helper; never row/status metadata.
    // All SQL values are bound; wildcard characters are literal.
    const result = await pool.query(`SELECT name FROM venues WHERE lower(name) = lower($1) ORDER BY id LIMIT 1`, [text]);
    return result.rows.some(row => String(row.name).toLowerCase() === text.toLowerCase())
        ? { name: text, filterText: '' } : null;
}
module.exports = { explicitName, resolveNamedVenue };
