"""Offline regressions using synthetic data only; no provider or database calls."""
import argparse
import contextlib
import copy
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
import uuid


MODULE_PATH = Path(__file__).parent / 'tools' / 'prepare-real-venues.py'
SPEC = importlib.util.spec_from_file_location('prepare_real_venues', MODULE_PATH)
mapper = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(mapper)

MAPPING = {
    'recommended_label_mapping': {
        'restaurant': 'restaurant', 'casual_eatery': 'restaurant', 'cafe': 'cafe',
        'coffee_shop': 'cafe', 'bakery': 'cafe', 'bar': 'bar', 'lounge': 'bar',
        'dance_club': 'club', 'music_venue': 'music',
    },
    'specific_review_rules': {
        'airport_lounge': 'restricted_access_lounge_review',
        'theatre_venue': 'theatre_requires_distinct_category_review',
        'comedy_club': 'comedy_requires_distinct_category_review',
        'chocolatier': 'retail_child_not_restaurant',
    },
    'generic_review_rules': {
        'performing_arts_venue': 'performance_subtype_review',
        'arts_and_entertainment': 'entertainment_subtype_review',
        'nightlife_venue': 'nightlife_subtype_review',
    },
}


def feature(number, region='US-MA'):
    return {
        'type': 'Feature', 'id': str(uuid.UUID(int=number)),
        'geometry': {'type': 'Point', 'coordinates': [-71.10 + number * .001, 42.35]},
        'properties': {
            'names': {'primary': f'Synthetic Cafe {number}'},
            'addresses': [{'freeform': f'{number} Example Street', 'locality': 'Boston',
                           'country': 'US', 'region': region, 'postcode': '02110'}],
            'confidence': .99, 'operating_status': 'open', 'version': 2,
            'basic_category': 'cafe',
            'taxonomy': {'primary': 'cafe', 'hierarchy': ['food_and_drink', 'casual_eatery', 'cafe']},
            'phones': ['+1 202-555-0100'], 'websites': ['https://example.invalid'],
            'sources': [{'property': '', 'dataset': 'Overture', 'license': 'CDLA-Permissive-2.0'}],
        },
    }


class OfflineMapperTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='scenelink-synthetic-mapper-test-')
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)

    def write(self, filename, value):
        path = self.base / filename
        mapper.write_json(path, value)
        return str(path)

    def case(self, features=None, holds=None, catalog=None):
        features = copy.deepcopy(features or [feature(1)])
        source = self.base / 'synthetic.geojsonseq'
        # RFC 8142 record separator is allowed; feature ID is top-level, not a property.
        source.write_text(''.join('\x1e' + json.dumps(f) + '\n' for f in features))
        city_rows = []
        for number, item in enumerate(features, 1):
            properties = item['properties']
            city_rows.append({
                '_id': number, 'businessname': properties['names']['primary'], 'dbaname': '',
                'address': f'{number} Example', 'city': 'Boston', 'state': 'MA', 'zip': '02110',
                'licstatus': 'Active', 'licensecat': 'FT', 'property_id': str(100 + number),
                'longitude': item['geometry']['coordinates'][0], 'latitude': item['geometry']['coordinates'][1],
            })
        city = self.base / 'synthetic-city.jsonl'
        mapper.write_lines(city, city_rows)
        licenses = self.base / 'licenses'
        licenses.mkdir()
        license_entries = []
        for name in ('CDLA-Permissive-2.0.txt', 'Apache-2.0.txt', 'CC0-1.0.txt', 'PDDL-1.0.txt',
                     'NOTICE-Foursquare.txt', 'foursquare-notice.html', 'overture-attribution.html',
                     'cdla-permissive-2.0.html'):
            path = licenses / name
            path.write_text('Synthetic regression fixture only; not actual license text: ' + name)
            license_entries.append({'file': name, 'sha256': mapper.digest(path), 'source_url': 'https://example.invalid'})
        (licenses / 'NOTICE-CHANGES.txt').write_text('Synthetic regression fixture; no actual source data transformed.')
        mapper.write_json(licenses / 'license-source-manifest.json', license_entries)
        return argparse.Namespace(
            source=str(source),
            source_metadata=self.write('source-metadata.json', {
                'release': 'synthetic-regression-only', 'record_count': len(features),
                'outputs': [{'path': source.name, 'sha256': mapper.digest(source)}],
            }),
            city=str(city),
            city_metadata=self.write('city-metadata.json', {
                'record_count': len(city_rows), 'sha256': mapper.digest(city),
                'dataset_url': 'https://example.invalid/synthetic-city', 'retrieved_at': '2026-11-20T00:00:00Z',
            }),
            catalog=self.write('catalog.json', {'rows': catalog or [], 'count': len(catalog or []),
                                                'observed_at': '2026-11-20T00:00:00Z'}),
            taxonomy=self.write('mapping.json', MAPPING),
            boundary=self.write('boundary.geojson', {'type': 'FeatureCollection', 'features': [{
                'type': 'Feature', 'geometry': {'type': 'Polygon', 'coordinates': [[
                    [-71.3, 42.18], [-70.88, 42.18], [-70.88, 42.50], [-71.3, 42.50], [-71.3, 42.18],
                ]]},
            }]}),
            selection=self.write('selection.json', [f['id'] for f in features]),
            holds=self.write('holds.json', holds if holds is not None else {'hold_count': 0, 'holds': []}),
            licenses=str(licenses), out=str(self.base / 'output'),
        )

    def run_case(self, args):
        with contextlib.redirect_stdout(io.StringIO()):
            mapper.prepare(args)
        packet = Path(args.out) / 'first-batch'
        return (json.loads((packet / 'candidate-import.json').read_text()),
                json.loads((packet / 'provenance.json').read_text()),
                json.loads((packet / 'intake-manifest.json').read_text()))

    def test_specific_v2_categories_do_not_inherit_an_inaccurate_parent_type(self):
        cases = [
            ('coffee_roastery', ['food_and_drink', 'non_alcoholic_beverage_venue', 'coffee_shop', 'coffee_roastery'], 'cafe'),
            ('dance_club', ['arts_and_entertainment', 'nightlife_venue', 'dance_club'], 'club'),
            ('music_venue', ['arts_and_entertainment', 'performing_arts_venue', 'music_venue'], 'music'),
            ('theatre_venue', ['arts_and_entertainment', 'performing_arts_venue', 'theatre_venue'], None),
            ('comedy_club', ['arts_and_entertainment', 'nightlife_venue', 'comedy_club'], None),
            ('performing_arts_venue', ['arts_and_entertainment', 'performing_arts_venue'], None),
            ('chocolatier', ['food_and_drink', 'casual_eatery', 'chocolatier'], None),
            ('airport_lounge', ['food_and_drink', 'lounge', 'airport_lounge'], None),
        ]
        for primary, hierarchy, expected in cases:
            with self.subTest(primary=primary):
                actual, _ = mapper.classify({'taxonomy': {'primary': primary, 'hierarchy': hierarchy},
                                             'basic_category': hierarchy[-2]}, MAPPING)
                self.assertEqual(actual, expected)

    def test_binary_uuid_from_catalog_preserves_exact_database_identity(self):
        raw = [0, 31, 184, 24, 132, 209, 75, 4, 167, 15, 187, 118, 206, 235, 214, 209]
        self.assertEqual(mapper.catalog_uuid(raw), '001fb818-84d1-4b04-a70f-bb76ceebd6d1')
        with self.assertRaises(ValueError):
            mapper.catalog_uuid(raw[:-1])

    def test_real_geojson_shape_ma_alias_and_root_source_pointer_retain_evidence(self):
        args = self.case([feature(1, region='MA')])
        candidate, provenance, manifest = self.run_case(args)
        row = candidate['rows'][0]
        self.assertEqual(row['external_id'], feature(1)['id'])
        self.assertEqual((row['address'], row['state'], row['category']), ('1 Example Street', 'MA', 'cafe'))
        self.assertFalse(row['is_active'])
        self.assertTrue(row['needs_manual_review'])
        for field in ('website', 'phone', 'hours_display', 'hours_json', 'is_open_now', 'reservation_url',
                      'rating', 'review_count', 'price_level', 'image_url'):
            self.assertIsNone(row[field], field)
        evidence = provenance[row['external_id']]
        self.assertEqual(evidence['sources'][0]['property'], '')
        self.assertEqual(evidence['raw_provider_fields']['addresses'][0]['region'], 'MA')
        self.assertEqual(evidence['raw_provider_fields']['phones'], ['+1 202-555-0100'])
        self.assertEqual(evidence['verification_status'], 'provider_record_not_independently_verified')
        self.assertFalse(evidence['identity_review']['public_access_verified'])
        files = {entry['path']: entry['sha256'] for entry in manifest['evidence']}
        for name in ('PDDL-1.0.txt', 'CC0-1.0.txt', 'foursquare-notice.html', 'overture-attribution.html'):
            self.assertEqual(files['evidence/' + name], mapper.digest(Path(args.licenses) / name))
        city_hash = mapper.digest(args.city)
        self.assertEqual(evidence['city_license_evidence']['source_sha256'], city_hash)
        self.assertEqual(files['evidence/active-food-business-only.jsonl'], city_hash)

    def test_ma_alias_never_lifts_an_inherited_hold_from_the_real_envelope_shape(self):
        blocked = feature(2, region='MA')
        holds = {'publication_ready': False, 'eligible_for_import': False, 'hold_count': 1,
                 'holds': [{'external_id': blocked['id'], 'name': blocked['properties']['names']['primary'],
                            'reasons': ['inherited_noncanonical_region_review']}]}
        candidate, _, manifest = self.run_case(self.case([feature(1), blocked], holds=holds))
        self.assertEqual([row['external_id'] for row in candidate['rows']], [feature(1)['id']])
        preserved = [entry for entry in manifest['held'] if entry['external_id'] == blocked['id']]
        self.assertTrue(preserved)
        self.assertTrue(all('inherited_noncanonical_region_review' in entry['reasons'] for entry in preserved))

    def test_malformed_hold_count_is_rejected_instead_of_dropping_holds(self):
        with self.assertRaisesRegex(ValueError, 'Hold registry count'):
            mapper.parse_holds({'hold_count': 2, 'holds': [{'external_id': feature(1)['id'], 'reasons': ['review']}]})

    def test_missing_source_pointer_is_held_but_empty_root_pointer_is_accepted(self):
        blocked = feature(2)
        del blocked['properties']['sources'][0]['property']
        candidate, _, manifest = self.run_case(self.case([feature(1), blocked]))
        self.assertEqual(len(candidate['rows']), 1)
        self.assertIn('invalid_source_pointer', next(entry for entry in manifest['held']
                                                   if entry['external_id'] == blocked['id'])['reasons'])

    def test_existing_catalog_binary_id_blocks_a_new_row(self):
        existing = {'id': list(uuid.UUID('001fb818-84d1-4b04-a70f-bb76ceebd6d1').bytes),
                    'name': 'Synthetic Cafe 2', 'address': '2 Example St', 'lat': '42.35', 'lng': '-71.098',
                    'is_active': False, 'source': 'another-public-source'}
        args = self.case([feature(1), feature(2)], catalog=[existing])
        candidate, _, manifest = self.run_case(args)
        self.assertEqual(len(candidate['rows']), 1)
        self.assertIn('existing_catalog_identity_review', next(entry for entry in manifest['held']
                                                              if entry['external_id'] == feature(2)['id'])['reasons'])
        queue = list(mapper.lines(Path(args.out) / 'venue-review-queue.jsonl'))
        existing_match = next(row for row in queue if row['external_id'] == feature(2)['id'])['existing_matches'][0]
        self.assertEqual(existing_match['venue_id'], '001fb818-84d1-4b04-a70f-bb76ceebd6d1')

    def test_aliases_are_held_even_with_inactive_rows_or_bad_catalog_coordinates(self):
        names = {2: ('Skylark', 'Skylark - Boston'),
                 3: ('Lantern and Lark', 'Lantern & Lark'),
                 4: ("Fable's Cafe", 'Fables'),
                 5: ('Caffe Piccolo Roma', 'Piccolo Roma'),
                 6: ("Pollo Brasa Nando's", "Nando's Pollo Brasa")}
        features = [feature(number) for number in range(1, 8)]
        catalog = []
        for number, (source_name, catalog_name) in names.items():
            features[number - 1]['properties']['names']['primary'] = source_name
            catalog.append({
                'id': str(uuid.UUID(int=100 + number)), 'name': catalog_name, 'is_active': False,
                'address': f'{number} Example Street' + (', Boston, MA 02110' if number == 3 else '')
                           if number in (2, 3) else None,
                'lat': 42.35, 'lng': -71.20 if number in (2, 3) else features[number - 1]['geometry']['coordinates'][0],
            })
        # The same brand at a genuinely different, distant address is not globally matched.
        features[6]['properties']['names']['primary'] = 'Skylark'
        args = self.case(features, catalog=catalog)
        candidate, _, _ = self.run_case(args)
        self.assertEqual({row['external_id'] for row in candidate['rows']}, {feature(1)['id'], feature(7)['id']})
        queue = {row['external_id']: row for row in mapper.lines(Path(args.out) / 'venue-review-queue.jsonl')}
        for number in names:
            row = queue[feature(number)['id']]
            self.assertIn('existing_catalog_identity_review', row['review_reasons'])
            self.assertEqual(row['existing_matches'][0]['match_status'], 'potential_alias_requires_review')
            self.assertEqual(row['existing_matches'][0]['method'],
                             'potential_name_core_same_street' if number in (2, 3) else 'potential_name_core_nearby')
        # An alias suspicion does not become a field proposal for an assumed identity.
        self.assertEqual(list(mapper.lines(Path(args.out) / 'existing-venue-field-proposals.jsonl')), [])

    def test_city_address_join_allows_omission_but_holds_explicit_conflicts(self):
        self.assertEqual(mapper.conflicting_address_components('3 Example Street Suite 2', '3 Example'), [])
        self.assertEqual(mapper.conflicting_address_components('3 Example Street #2', '3 Example St Unit 2'), [])
        self.assertEqual(set(mapper.conflicting_address_components('3 Example Street Suite 2', '3 Example Avenue Unit 9')),
                         {'different_explicit_street_types', 'different_explicit_units'})
        blocked = feature(2)
        blocked['properties']['addresses'][0]['freeform'] = '2 Example Street Suite 2'
        args = self.case([feature(1), blocked])
        city = list(mapper.lines(args.city))
        city[1]['address'] = '2 Example Avenue Suite 9'
        mapper.write_lines(args.city, city)
        metadata = json.loads(Path(args.city_metadata).read_text())
        metadata['sha256'] = mapper.digest(args.city)
        mapper.write_json(args.city_metadata, metadata)
        candidate, _, manifest = self.run_case(args)
        self.assertEqual(len(candidate['rows']), 1)
        reasons = next(entry['reasons'] for entry in manifest['held'] if entry['external_id'] == blocked['id'])
        self.assertIn('municipal_explicit_address_components_conflict', reasons)
        queue = list(mapper.lines(Path(args.out) / 'venue-review-queue.jsonl'))
        self.assertEqual(next(row for row in queue if row['external_id'] == blocked['id'])['city_identity_matches'], [])

    def test_conflicting_zip_prefixes_stay_unknown_without_holding_identity(self):
        self.assertEqual(mapper.canonical_zip('02115-1234', [{'zip': '02115-9999'}]), ('02115', {}))
        self.assertEqual(mapper.canonical_zip('unparseable', [{'zip': '02115'}]), (None, {}))
        changed = feature(2)
        changed['properties']['addresses'][0]['postcode'] = '02115-1234'
        args = self.case([feature(1), changed])
        city = list(mapper.lines(args.city))
        city[1]['zip'] = '02215-9999'
        mapper.write_lines(args.city, city)
        metadata = json.loads(Path(args.city_metadata).read_text())
        metadata['sha256'] = mapper.digest(args.city)
        mapper.write_json(args.city_metadata, metadata)
        candidate, provenance, _ = self.run_case(args)
        self.assertEqual(len(candidate['rows']), 2)
        row = next(row for row in candidate['rows'] if row['external_id'] == changed['id'])
        self.assertIsNone(row['zip_code'])
        evidence = provenance[changed['id']]
        self.assertEqual(evidence['field_conflicts']['zip_code']['provider'], '02115-1234')
        self.assertEqual(evidence['field_conflicts']['zip_code']['city'], ['02215-9999'])
        self.assertEqual(evidence['raw_provider_fields']['addresses'][0]['postcode'], '02115-1234')

    def test_point_must_be_inside_exact_scope_not_merely_a_provider_bbox(self):
        outside = feature(2)
        outside['geometry']['coordinates'][1] = 42.179997
        outside['properties']['bbox'] = {'miny': 42.179996, 'maxy': 42.180001}
        candidate, _, manifest = self.run_case(self.case([feature(1), outside]))
        self.assertEqual(len(candidate['rows']), 1)
        self.assertIn('outside_exact_point_scope', next(entry for entry in manifest['held']
                                                      if entry['external_id'] == outside['id'])['reasons'])

    def test_country_is_required_when_accepting_ma_alias(self):
        outside = feature(2, region='MA')
        outside['properties']['addresses'][0]['country'] = 'CA'
        candidate, _, manifest = self.run_case(self.case([feature(1), outside]))
        self.assertEqual(len(candidate['rows']), 1)
        self.assertIn('missing_canonical_complete_US_MA_address', next(entry for entry in manifest['held']
                                                                    if entry['external_id'] == outside['id'])['reasons'])

    def test_tampered_city_bytes_and_license_text_are_rejected(self):
        args = self.case()
        city = Path(args.city)
        original = city.read_text()
        city.write_text(original + '\n')
        with self.assertRaisesRegex(ValueError, 'City source bytes'):
            self.run_case(args)
        city.write_text(original)
        (Path(args.licenses) / 'PDDL-1.0.txt').write_text('Tampered synthetic license fixture for regression testing only.')
        with self.assertRaisesRegex(ValueError, 'License/notice bytes'):
            self.run_case(args)

    def test_incomplete_full_source_count_cannot_produce_a_packet(self):
        args = self.case()
        metadata = json.loads(Path(args.source_metadata).read_text())
        metadata['record_count'] += 1
        mapper.write_json(args.source_metadata, metadata)
        with self.assertRaisesRegex(ValueError, 'Raw provider record count'):
            self.run_case(args)
        self.assertFalse((Path(args.out) / 'first-batch').exists())

    def test_rerun_cannot_leave_a_stale_packet_looking_new(self):
        args = self.case()
        self.run_case(args)
        packet = Path(args.out) / 'first-batch' / 'candidate-import.json'
        before = mapper.digest(packet)
        with self.assertRaisesRegex(ValueError, 'Output directory must be empty'):
            self.run_case(args)
        self.assertEqual(mapper.digest(packet), before)

    def test_indexed_city_boundary_retains_holes_and_separate_polygons(self):
        outer = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]
        hole = [[3, 3], [7, 3], [7, 7], [3, 7], [3, 3]]
        island = [[20, 20], [22, 20], [22, 22], [20, 22], [20, 20]]
        raw = {'features': [{'geometry': {'type': 'MultiPolygon', 'coordinates': [[outer, hole], [island]]}}]}
        indexed = mapper.prepare_boundary(raw)
        for point, expected in [((1, 1), True), ((5, 5), False), ((21, 21), True), ((15, 15), False)]:
            with self.subTest(point=point):
                self.assertEqual(mapper.in_city(*point, indexed), expected)
                self.assertEqual(mapper.in_city(*point, raw), expected)


if __name__ == '__main__':
    unittest.main()
