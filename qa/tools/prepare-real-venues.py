#!/usr/bin/env python3
"""Build a review catalog and a bounded inactive intake packet from real source files.

Offline, standard-library only. Never connects to a database, retrieves contacts,
changes an existing venue, or treats a provider's status as current opening hours.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import hashlib
import json
import math
from pathlib import Path
import re
import shutil
import unicodedata
import uuid

BOUNDS = (-71.30, 42.18, -70.88, 42.50)
DATASET_LICENSES = {
    **{name: 'CDLA-Permissive-2.0' for name in (
        'meta', 'Overture', 'Overture-signals', 'BrightQuery', 'Microsoft',
        'Uberall', 'Birdeye', 'DAC', 'Krick', 'OpenTravel', 'PinMeTo', 'RenderSEO')},
    'Foursquare': 'Apache-2.0', 'AllThePlaces': 'CC0-1.0',
}
UNKNOWN = ('rating', 'review_count', 'buzz_score', 'going_count', 'friends_going',
           'price_level', 'image_url', 'cover_image_url', 'hours_display',
           'hours_json', 'is_open_now', 'reservation_url', 'website', 'phone')


def digest(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def write_json(path, value):
    Path(path).write_text(json.dumps(value, ensure_ascii=False, sort_keys=True,
                                    indent=2, allow_nan=False) + '\n')


def write_lines(path, rows):
    with Path(path).open('w') as stream:
        for row in rows:
            stream.write(json.dumps(row, ensure_ascii=False, sort_keys=True,
                                    separators=(',', ':'), allow_nan=False) + '\n')


def lines(path):
    with Path(path).open() as stream:
        for line in stream:
            if line.strip():
                yield json.loads(line.lstrip('\x1e'))


def norm(value):
    value = unicodedata.normalize('NFKD', str(value or '')).encode('ascii', 'ignore').decode()
    value = value.lower().replace('&', ' and ')
    value = re.sub(r"['’]", '', value)
    value = re.sub(r'[^a-z0-9]+', ' ', value).strip()
    return re.sub(r'\s+', ' ', re.sub(r'\b(llc|inc|corp|corporation)\b', '', value)).strip()


def name_key(value):
    return re.sub(r'^the ', '', norm(value))


def address_key(value):
    value = norm(value)
    for long, short in [('street', 'st'), ('avenue', 'ave'), ('road', 'rd'),
                        ('boulevard', 'blvd'), ('place', 'pl'), ('square', 'sq'),
                        ('drive', 'dr'), ('court', 'ct'), ('parkway', 'pkwy'),
                        ('terrace', 'ter'), ('lane', 'ln')]:
        value = re.sub(r'\b' + long + r'\b', short, value)
    # Unit removal is only a conservative collision/identity-review key.
    # The complete source address is always retained in canonical proposals.
    value = re.sub(r'\b(ste|suite|unit|floor|fl)\b.*$', '', value).strip()
    return re.sub(r'\s+(st|ave|rd|blvd|pl|sq|dr|ct|way|ln|pkwy|ter)$', '', value).strip()


def canonical_street_key(value):
    # A permissive key is evidence for a potential collision, never a merge.
    key = address_key(str(value or '').split(',')[0])
    return key if re.match(r'^\d+[a-z]?(?:\s+\d+)?\s+\S', key) else ''


def identity_name_cores(value):
    """Conservative alias candidates, always constrained by address or distance."""
    tokens = name_key(value).split()
    variants = [tokens]
    if len(tokens) > 1 and tokens[-1] == 'boston':
        variants.append(tokens[:-1])
    descriptors = {'cafe', 'caffe', 'restaurant', 'bar'}
    variants += [[token for token in variant if token not in descriptors] for variant in list(variants)]
    stop = descriptors | {'a', 'an', 'and', 'at', 'by', 'for', 'in', 'of', 'on', 'the', 'to', 'boston'}
    cores = set()
    for variant in variants:
        meaningful = [token for token in variant if token not in stop]
        if any(len(token) >= 4 for token in meaningful) or len(set(meaningful)) >= 2:
            cores.add(' '.join(sorted(variant)))
    return cores


def address_components(value):
    raw = re.sub(r'#\s*(?=[a-zA-Z0-9])', ' unit ', str(value or ''))
    normalized = norm(raw)
    units = {}
    for label, number in re.findall(r'\b(ste|suite|unit|floor|fl)\s+([a-z0-9]+)\b', normalized):
        units['floor' if label in ('floor', 'fl') else 'unit'] = number
    street = norm(raw.split(',')[0])
    street = re.sub(r'\b(ste|suite|unit|floor|fl)\b.*$', '', street).strip()
    aliases = {'street': 'st', 'avenue': 'ave', 'road': 'rd', 'boulevard': 'blvd',
               'place': 'pl', 'square': 'sq', 'drive': 'dr', 'court': 'ct',
               'parkway': 'pkwy', 'terrace': 'ter', 'lane': 'ln', 'way': 'way'}
    last = street.split()[-1] if street else ''
    suffix = aliases.get(last, last if last in aliases.values() else None)
    return suffix, units


def conflicting_address_components(left, right):
    left_suffix, left_units = address_components(left)
    right_suffix, right_units = address_components(right)
    reasons = []
    if left_suffix and right_suffix and left_suffix != right_suffix:
        reasons.append('different_explicit_street_types')
    if any(left_units[k] != right_units[k] for k in left_units.keys() & right_units.keys()):
        reasons.append('different_explicit_units')
    return reasons


def zip_prefix(value):
    match = re.fullmatch(r'(\d{5})(?:[- ]?\d{4})?', str(value or '').strip())
    return match.group(1) if match else None


def canonical_zip(provider_postcode, city_matches):
    prefix = zip_prefix(provider_postcode)
    city_prefixes = {zip_prefix(row.get('zip')) for row in city_matches} - {None}
    if prefix and city_prefixes - {prefix}:
        return None, {'zip_code': {
            'provider': provider_postcode, 'city': sorted({str(row.get('zip')) for row in city_matches if zip_prefix(row.get('zip'))}),
            'reason': 'different_valid_five_digit_prefixes',
        }}
    return prefix, {}


def as_number(value):
    if isinstance(value, bool):
        return None
    try:
        number = float(value)
        return number if math.isfinite(number) else None
    except (TypeError, ValueError):
        return None


def distance(lng, lat, other_lng, other_lat):
    values = [as_number(v) for v in (lng, lat, other_lng, other_lat)]
    if any(v is None for v in values):
        return math.inf
    x, y, xx, yy = map(math.radians, values)
    a = math.sin((yy-y)/2)**2 + math.cos(y)*math.cos(yy)*math.sin((xx-x)/2)**2
    return 6371008.8 * 2 * math.asin(min(1, math.sqrt(a)))


def in_ring(x, y, ring):
    inside = False
    for i in range(len(ring)):
        x1, y1 = ring[i-1][:2]
        x2, y2 = ring[i][:2]
        if (y1 > y) != (y2 > y) and x < (x2-x1)*(y-y1)/(y2-y1)+x1:
            inside = not inside
    return inside


def prepare_boundary(boundary):
    """Index ring bounds once while retaining the original point-in-ring rule."""
    prepared = []
    for feature in boundary['features']:
        geometry = feature['geometry']
        if geometry['type'] not in ('Polygon', 'MultiPolygon'):
            raise ValueError('Saved city boundary must contain polygons')
        polygons = geometry['coordinates'] if geometry['type'] == 'MultiPolygon' else [geometry['coordinates']]
        for polygon in polygons:
            rings = []
            for ring in polygon:
                xs, ys = zip(*(point[:2] for point in ring))
                rings.append(((min(xs), min(ys), max(xs), max(ys)), ring))
            prepared.append(rings)
    return prepared


def in_city(x, y, boundary):
    if x is None or y is None:
        return False
    if isinstance(boundary, dict):
        boundary = prepare_boundary(boundary)

    def in_bounded_ring(prepared):
        (west, south, east, north), ring = prepared
        return west <= x <= east and south <= y <= north and in_ring(x, y, ring)

    for polygon in boundary:
        if in_bounded_ring(polygon[0]) and not any(in_bounded_ring(hole) for hole in polygon[1:]):
            return True
    return False


def city_identity(record):
    # CKAN _id is a volatile row index, not a stable license identifier.
    parts = [norm(record.get(k)) for k in ('businessname', 'dbaname', 'address', 'property_id', 'licensecat')]
    return 'city-food-identity:' + hashlib.sha256(json.dumps(parts, separators=(',', ':')).encode()).hexdigest()


def classify(properties, mapping):
    tax = properties.get('taxonomy') or {}
    labels = list(dict.fromkeys([tax.get('primary')] + list(reversed(tax.get('hierarchy') or []))
                               + [properties.get('basic_category')]))
    for label in labels:
        if label in mapping['specific_review_rules']:
            return None, mapping['specific_review_rules'][label]
    for label in labels:
        if label in mapping['recommended_label_mapping']:
            return mapping['recommended_label_mapping'][label], 'mapped_from_' + label
    for label in labels:
        if label in mapping['generic_review_rules']:
            return None, mapping['generic_review_rules'][label]
    return None, 'outside_current_launch_types'


def catalog_uuid(value):
    if isinstance(value, list):
        return str(uuid.UUID(bytes=bytes(value)))
    return str(uuid.UUID(str(value)))


def parse_holds(value):
    """Keep inherited holds independently of improvements to source parsing."""
    declared_count = value.get('hold_count') if isinstance(value, dict) else None
    if isinstance(value, dict):
        for key in ('records', 'held', 'holds'):
            if key in value:
                value = value[key]
                break
    if isinstance(value, dict):
        value = [{'external_id': key, 'reasons': reasons if isinstance(reasons, list)
                  else reasons.get('reasons', ['inherited_review_hold'])}
                 for key, reasons in value.items()]
    if not isinstance(value, list):
        raise ValueError('Hold registry must contain a record list or ID mapping')
    held = {}
    for record in value:
        uid = record.get('external_id') if isinstance(record, dict) else None
        if not isinstance(uid, str) or not uid:
            raise ValueError('Hold record must contain a nonempty external_id')
        reasons = record.get('reasons') or record.get('hold_reasons') or ['inherited_review_hold']
        if not isinstance(reasons, list) or any(not isinstance(reason, str) or not reason for reason in reasons):
            raise ValueError('Hold reasons must be a list of nonempty strings')
        held[uid] = sorted(set(held.get(uid, []) + reasons))
    if declared_count is not None and declared_count != len(held):
        raise ValueError('Hold registry count does not match unique held IDs')
    return held


def verified_license_files(directory):
    """Verify saved source bytes before including license and notice evidence."""
    directory = Path(directory)
    required = {'CDLA-Permissive-2.0.txt', 'Apache-2.0.txt', 'CC0-1.0.txt',
                'PDDL-1.0.txt', 'NOTICE-Foursquare.txt'}
    manifest = json.loads((directory / 'license-source-manifest.json').read_text())
    if not isinstance(manifest, list):
        raise ValueError('License source manifest must be a record list')
    names = set()
    for entry in manifest:
        name = entry.get('file')
        if not isinstance(name, str) or Path(name).name != name or name in ('.', '..') or name in names:
            raise ValueError('Invalid or duplicate license evidence filename')
        path = directory / name
        if not path.is_file() or digest(path) != entry.get('sha256'):
            raise ValueError('License/notice bytes do not match source manifest: ' + name)
        names.add(name)
    if not required <= names:
        raise ValueError('Missing source license/notice manifest entries: ' + ', '.join(sorted(required - names)))
    names.update(('NOTICE-CHANGES.txt', 'license-source-manifest.json'))
    for name in names:
        path = directory / name
        if not path.is_file() or path.stat().st_size < 20:
            raise ValueError('Missing source license/notice evidence: ' + name)
    return [directory / name for name in sorted(names)]


def prepare(args):
    out = Path(args.out)
    if out.exists() and any(out.iterdir()):
        raise ValueError('Output directory must be empty; use a new path to avoid stale intake packets')
    out.mkdir(parents=True, exist_ok=True)
    license_files = verified_license_files(args.licenses)
    metadata = json.loads(Path(args.source_metadata).read_text())
    source_sha = digest(args.source)
    source_entry = next((x for x in metadata['outputs'] if x['path'] == Path(args.source).name), None)
    if not source_entry or source_entry['sha256'] != source_sha:
        raise ValueError('Source bytes do not match official extraction metadata')
    city_metadata = json.loads(Path(args.city_metadata).read_text())
    if digest(args.city) != city_metadata['sha256']:
        raise ValueError('City source bytes do not match retrieval metadata')
    city = list(lines(args.city))
    if len(city) != city_metadata['record_count']:
        raise ValueError('City record count does not match metadata')
    catalog_envelope = json.loads(Path(args.catalog).read_text())
    catalog = catalog_envelope['rows']
    if len(catalog) != catalog_envelope['count']:
        raise ValueError('Catalog row count mismatch')
    for row in catalog:
        row['id'] = catalog_uuid(row['id'])
    if len({r['id'] for r in catalog}) != len(catalog):
        raise ValueError('Duplicate catalog row IDs')
    mapping = json.loads(Path(args.taxonomy).read_text())
    boundary = prepare_boundary(json.loads(Path(args.boundary).read_text()))
    selection = json.loads(Path(args.selection).read_text())
    if not isinstance(selection, list) or not 1 <= len(selection) <= 5000 or len(set(selection)) != len(selection):
        raise ValueError('Selection must contain 1–5000 unique exact source IDs')
    held = parse_holds(json.loads(Path(args.holds).read_text()))

    by_city_key = defaultdict(list)
    for row in city:
        if row.get('licstatus') != 'Active':
            continue
        for key in {name_key(row.get('businessname')), name_key(row.get('dbaname'))} - {''}:
            by_city_key[key, address_key(row.get('address'))].append(row)
    existing_by_key, existing_by_name, existing_by_source = defaultdict(list), defaultdict(list), defaultdict(list)
    existing_by_core = defaultdict(list)
    for row in catalog:
        if row.get('address'):
            existing_by_key[name_key(row['name']), address_key(row['address'])].append(row)
        existing_by_name[name_key(row['name'])].append(row)
        if row.get('source') == 'overture' and row.get('external_id'):
            existing_by_source[row['external_id']].append(row)
        for core in identity_name_cores(row['name']):
            existing_by_core[core].append(row)

    all_ids, records, source_counts = set(), {}, Counter()
    source_by_key, source_by_name, source_city_identity = defaultdict(list), defaultdict(list), defaultdict(list)
    for feature in lines(args.source):
        source_counts['raw_records'] += 1
        uid = feature['id']
        if uid in all_ids:
            raise ValueError('Duplicate raw GERS ID: ' + uid)
        all_ids.add(uid)
        p = feature.get('properties') or {}
        target, category_reason = classify(p, mapping)
        if not target and category_reason == 'outside_current_launch_types':
            source_counts['outside_launch_categories'] += 1
            if uid not in selection:
                continue
        geometry = feature.get('geometry') or {}
        coordinates = geometry.get('coordinates') or []
        lng, lat = (map(as_number, coordinates[:2]) if len(coordinates) >= 2 else (None, None))
        reasons = list(held.get(uid, []))
        if not target:
            reasons.append(category_reason)
        if geometry.get('type') != 'Point' or lng is None or lat is None or not (BOUNDS[0] <= lng <= BOUNDS[2] and BOUNDS[1] <= lat <= BOUNDS[3]):
            reasons.append('outside_exact_point_scope')
        name = (p.get('names') or {}).get('primary')
        if not isinstance(name, str) or not name.strip():
            reasons.append('missing_name')
        addresses = [a for a in p.get('addresses') or [] if a.get('country') == 'US' and a.get('region') in ('MA', 'US-MA')
                     and isinstance(a.get('freeform'), str) and a['freeform'].strip()
                     and isinstance(a.get('locality'), str) and a['locality'].strip()]
        distinct = {(norm(a['freeform']), norm(a['locality'])) for a in addresses}
        address = addresses[0] if len(distinct) == 1 else {}
        if not addresses:
            reasons.append('missing_canonical_complete_US_MA_address')
        elif len(distinct) != 1:
            reasons.append('multiple_distinct_addresses')
        score = as_number(p.get('confidence'))
        if score is None or not .8 <= score <= 1:
            reasons.append('low_or_invalid_existence_confidence')
        if p.get('operating_status') != 'open':
            reasons.append('provider_not_explicitly_open')
        sources = p.get('sources') or []
        if not sources or any(DATASET_LICENSES.get(s.get('dataset')) != s.get('license') for s in sources):
            reasons.append('source_license_mapping_review')
        if any('property' not in s or not isinstance(s['property'], str) or (s['property'] and not s['property'].startswith('/')) for s in sources):
            reasons.append('invalid_source_pointer')
        key = name_key(name), address_key(address.get('freeform'))
        potential_city_matches = by_city_key.get(key, []) if all(key) else []
        city_address_conflicts = [
            {'record': match, 'reasons': conflicts}
            for match in potential_city_matches
            if (conflicts := conflicting_address_components(address.get('freeform'), match.get('address')))
        ]
        matches = [match for match in potential_city_matches
                   if not conflicting_address_components(address.get('freeform'), match.get('address'))]
        if city_address_conflicts:
            reasons.append('municipal_explicit_address_components_conflict')
        postcode, field_conflicts = canonical_zip(address.get('postcode'), matches)
        ids = set()
        existing_matches = []
        for method, matches_by_method in (
            ('source_id', existing_by_source.get(uid, [])),
            ('normalized_name_address', existing_by_key.get(key, []) if all(key) else []),
            ('same_name_nearby', [r for r in existing_by_name.get(key[0], [])
                                  if distance(lng, lat, r.get('lng'), r.get('lat')) < 165]),
        ):
            for existing in matches_by_method:
                if existing['id'] not in ids:
                    ids.add(existing['id'])
                    existing_matches.append({'venue_id': existing['id'], 'method': method,
                                             'match_status': 'potential_identity_requires_review',
                                             'distance_m': round(distance(lng, lat, existing.get('lng'), existing.get('lat')), 1)
                                             if distance(lng, lat, existing.get('lng'), existing.get('lat')) != math.inf else None})
        street = canonical_street_key(address.get('freeform'))
        for core in sorted(identity_name_cores(name)):
            for existing in existing_by_core.get(core, []):
                if existing['id'] in ids:
                    continue
                same_street = street and street == canonical_street_key(existing.get('address'))
                separation = distance(lng, lat, existing.get('lng'), existing.get('lat'))
                if same_street or separation < 165:
                    ids.add(existing['id'])
                    existing_matches.append({
                        'venue_id': existing['id'],
                        'method': 'potential_name_core_same_street' if same_street else 'potential_name_core_nearby',
                        'match_status': 'potential_alias_requires_review',
                        'name_core': core, 'distance_m': round(separation, 1) if separation != math.inf else None,
                    })
        if existing_matches:
            reasons.append('existing_catalog_identity_review')
        city_distances = [distance(lng, lat, r.get('longitude'), r.get('latitude')) for r in matches]
        city_distance = min(city_distances, default=math.inf)
        if matches and city_distance > 200:
            reasons.append('municipal_coordinates_disagree_or_missing')
        is_boston = in_city(lng, lat, boundary)
        if matches and not is_boston:
            reasons.append('municipal_identity_outside_saved_Boston_boundary')
        # These are potential access/classification issues, never closure findings.
        hierarchy = (p.get('taxonomy') or {}).get('hierarchy') or []
        if 'cafeteria' in hierarchy or re.search(r'\b(dining hall|employee|student|hospital|university|college|campus)\b', name_key(name)):
            reasons.append('public_access_review')
        item = {
            'external_id': uid, 'name': name, 'address': address.get('freeform'),
            'city': address.get('locality'), 'state': 'MA' if address else None,
            'zip_code': postcode, 'lat': lat, 'lng': lng,
            'type': target, 'category': (p.get('taxonomy') or {}).get('primary') or p.get('basic_category'),
            'category_mapping_reason': category_reason, 'source': 'overture',
            'source_release': metadata['release'], 'confidence': score,
            'provider_operating_status': p.get('operating_status'),
            'city_identity_matches': matches, 'city_coordinate_distance_m': round(city_distance, 1) if city_distance != math.inf else None,
            'city_address_conflicts': city_address_conflicts, 'field_conflicts': field_conflicts,
            'inside_saved_Boston_boundary': is_boston, 'existing_matches': existing_matches,
            'review_reasons': sorted(set(reasons)), 'publication_ready': False,
            'source_phones': p.get('phones'), 'source_websites': p.get('websites'),
            'raw_taxonomy': p.get('taxonomy'), 'basic_category': p.get('basic_category'),
            'is_active': False, 'needs_manual_review': True,
        }
        records[uid] = (item, p)
        if all(key):
            source_by_key[key].append(uid)
        if key[0]:
            source_by_name[key[0]].append(uid)
        for match in matches:
            source_city_identity[city_identity(match)].append(uid)

    if source_counts['raw_records'] != metadata['record_count']:
        raise ValueError('Raw provider record count mismatch')
    for uid, (item, p) in records.items():
        key = name_key(item['name']), address_key(item['address'])
        reasons = item['review_reasons']
        if all(key) and len(source_by_key[key]) > 1:
            reasons.append('provider_name_address_collision')
        if any(other != uid and distance(item['lng'], item['lat'], records[other][0]['lng'], records[other][0]['lat']) < 60
               for other in source_by_name.get(key[0], [])):
            reasons.append('provider_same_name_nearby_collision')
        if any(len(set(source_city_identity[city_identity(m)])) > 1 for m in item['city_identity_matches']):
            reasons.append('municipal_identity_collision')
        item['review_reasons'] = sorted(set(reasons))
        item['review_state'] = ('existing_identity_review' if item['existing_matches'] else 'held'
                                if reasons else 'city_corroborated_review' if item['city_identity_matches'] and item['inside_saved_Boston_boundary']
                                else 'provider_only_review')
    ordered = [records[k][0] for k in sorted(records)]
    write_lines(out / 'venue-review-queue.jsonl', ordered)

    catalog_by_id = {r['id']: r for r in catalog}
    proposals = []
    for item in ordered:
        if len(item['existing_matches']) != 1:
            continue
        if item['existing_matches'][0]['match_status'] == 'potential_alias_requires_review':
            continue
        existing = catalog_by_id[item['existing_matches'][0]['venue_id']]
        missing = {field: item[field] for field in ('address', 'city', 'state', 'zip_code', 'lat', 'lng')
                   if existing.get(field) in (None, '') and item.get(field) not in (None, '')}
        conflicts = {field: {'existing': existing.get(field), 'provider': item.get(field)}
                     for field in ('address', 'city', 'state') if existing.get(field) and item.get(field)
                     and norm(existing[field]) != norm(item[field])}
        if missing or conflicts:
            proposals.append({'venue_id': existing['id'], 'name': existing['name'], 'external_id': item['external_id'],
                              'match': item['existing_matches'][0], 'proposed_missing_fields': missing,
                              'conflicts': conflicts, 'source_release': metadata['release'],
                              'review_reasons': item['review_reasons'], 'applied': False})
    write_lines(out / 'existing-venue-field-proposals.jsonl', proposals)
    closed_active = [r for r in catalog if r.get('is_active') and 'closed' in str(r.get('business_status') or '').lower()]
    write_lines(out / 'existing-active-closed-status-review.jsonl', closed_active)

    accepted, selected_holds = [], []
    for uid in selection:
        if uid not in records:
            selected_holds.append({'external_id': uid, 'reasons': ['missing_from_launch_source_review']})
            continue
        item, p = records[uid]
        reasons = list(item['review_reasons'])
        if not item['city_identity_matches'] or not item['inside_saved_Boston_boundary']:
            reasons.append('first_batch_requires_Boston_city_identity')
        if reasons:
            selected_holds.append({'external_id': uid, 'name': item['name'], 'reasons': sorted(set(reasons))})
        else:
            accepted.append((item, p))
    if not accepted:
        raise ValueError('No selected source records passed the inactive intake checks')
    packet = out / 'first-batch'
    packet.mkdir(exist_ok=True)
    evidence = packet / 'evidence'
    evidence.mkdir(exist_ok=True)
    rows, provenance = [], {}
    for item, p in accepted:
        uid = item['external_id']
        row = {k: item[k] for k in ('external_id', 'name', 'address', 'city', 'state', 'zip_code', 'lat', 'lng', 'type', 'category', 'source')}
        row.update({k: None for k in UNKNOWN})
        row.update({'is_active': False, 'needs_manual_review': True, 'featured': False, 'trending': False, 'spotlight': False})
        rows.append(row)
        provenance[uid] = {
            'release': metadata['release'], 'sources': p['sources'], 'existence_confidence': p['confidence'],
            'verification_status': 'provider_record_not_independently_verified', 'operating_status': p.get('operating_status'),
            'feature_version': p.get('version'), 'source_file_sha256': source_sha,
            'raw_provider_fields': {k: p.get(k) for k in ('names', 'addresses', 'phones', 'websites', 'socials', 'basic_category', 'taxonomy')},
            'field_conflicts': item['field_conflicts'],
            'intake_identity_keys': sorted({city_identity(r) for r in item['city_identity_matches']}),
            'city_license_evidence': {'dataset_url': city_metadata['dataset_url'], 'source_sha256': city_metadata['sha256'],
                                     'retrieved_at': city_metadata['retrieved_at'], 'records': item['city_identity_matches'],
                                     'meaning': 'Business identity corroboration only; not current operation, opening hours, public access, or booking availability.'},
            'identity_review': {'catalog_observed_at': catalog_envelope['observed_at'], 'catalog_sha256': digest(args.catalog),
                                'existing_matches': [], 'review_reasons': [], 'public_access_verified': False,
                                'city_coordinate_distance_m': item['city_coordinate_distance_m']},
        }
    write_json(packet / 'candidate-import.json', {'ifExists': 'skip', 'rows': rows})
    write_json(packet / 'provenance.json', provenance)
    write_json(packet / 'report.json', {
        'release': metadata['release'], 'input_sha256': source_sha, 'candidate_count': len(rows),
        'production_import_ready': False, 'publication_ready': False, 'production_writes': False,
        'purpose': 'Bounded insert-only inactive intake; separate review and execution prerequisites remain.',
        'catalog_observed_at': catalog_envelope['observed_at'], 'catalog_count': len(catalog),
        'catalog_sha256': digest(args.catalog), 'city_source_sha256': city_metadata['sha256'],
        'taxonomy_mapping_sha256': digest(args.taxonomy), 'boundary_sha256': digest(args.boundary),
        'selected_count': len(selection), 'selected_held_count': len(selected_holds),
        'unknown_public_fields': list(UNKNOWN),
    })
    entries = []
    def copy_evidence(source, filename, kind):
        shutil.copyfile(source, evidence / filename)
        entries.append({'path': 'evidence/' + filename, 'sha256': digest(evidence / filename), 'kind': kind})
    for source, filename, kind in (
        (args.source_metadata, 'overture-extract-metadata.json', 'source'),
        (args.city, 'active-food-business-only.jsonl', 'city'),
        (args.city_metadata, 'active-food-source-metadata.json', 'city'),
        (args.taxonomy, 'taxonomy-mapping-review.json', 'source'),
        (args.boundary, 'saved-Boston-boundary.geojson', 'city'),
        (args.selection, 'selected-source-ids.json', 'source'),
        (args.holds, 'inherited-hold-registry.json', 'source'),
    ):
        copy_evidence(source, filename, kind)
    selected_features = [feature for feature in lines(args.source) if feature['id'] in provenance]
    write_lines(evidence / 'selected-provider-features.geojsonseq', selected_features)
    entries.append({'path': 'evidence/selected-provider-features.geojsonseq', 'sha256': digest(evidence / 'selected-provider-features.geojsonseq'), 'kind': 'source'})
    for source in license_files:
        name = source.name
        copy_evidence(source, name, 'notice' if 'NOTICE' in name or 'manifest' in name or name.endswith('.html') else 'license')
    final_holds = [{'external_id': key, 'reasons': value} for key, value in sorted(held.items())]
    final_holds += selected_holds
    write_json(packet / 'intake-manifest.json', {
        'version': 1, 'scope': 'inactive_venue_intake',
        'files': {name: digest(packet / name) for name in ('candidate-import.json', 'provenance.json', 'report.json')},
        'evidence': sorted(entries, key=lambda x: x['path']), 'held': final_holds,
    })
    state_counts = Counter(r['review_state'] for r in ordered)
    type_counts = Counter(r['type'] or 'category_review' for r in ordered)
    reasons = Counter(reason for r in ordered for reason in r['review_reasons'])
    by_city = defaultdict(Counter)
    for row in ordered:
        by_city[row['city'] or '(missing canonical MA address)'][row['review_state']] += 1
    summary = {
        'source_release': metadata['release'], 'source_sha256': source_sha,
        'source_counts': dict(source_counts), 'review_record_count': len(ordered),
        'review_state_counts': dict(state_counts), 'type_counts_before_quality_checks': dict(type_counts),
        'multi_reason_counts': dict(reasons), 'by_provider_city': {k: dict(v) for k, v in sorted(by_city.items())},
        'existing_field_proposal_count': len(proposals),
        'existing_venues_with_missing_field_proposals': len({r['venue_id'] for r in proposals if r['proposed_missing_fields']}),
        'existing_active_closed_status_count': len(closed_active),
        'first_batch_count': len(rows), 'selected_holds': selected_holds,
        'first_batch_packet_sha256': digest(packet / 'intake-manifest.json'),
        'production_writes': False, 'live_rows_added': 0, 'publication_ready_count': 0,
    }
    write_json(out / 'review-summary.json', summary)
    print(json.dumps({k: v for k, v in summary.items() if k not in ('by_provider_city', 'multi_reason_counts')}, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('source', 'source-metadata', 'city', 'city-metadata', 'catalog', 'taxonomy',
                 'boundary', 'selection', 'holds', 'licenses', 'out'):
        parser.add_argument('--' + name, required=True)
    prepare(parser.parse_args())


if __name__ == '__main__':
    main()
