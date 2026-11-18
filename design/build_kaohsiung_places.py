"""Freeze Kaohsiung transit stations, public markets, and night markets onto the 300m walk graph."""
from collections import Counter
from pathlib import Path
import gzip
import hashlib
import json
import math
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.tools/map-libs'))
import numpy as np
from pyproj import Transformer
from shapely.geometry import shape, Point
from shapely.ops import unary_union
from shapely import make_valid, transform as shapely_transform

ORIGIN = [180000, 2505000]
proj = Transformer.from_crs(4326, 3826, always_xy=True)

def to_local_coords(coords):
    xs, ys = proj.transform(coords[:, 0], coords[:, 1])
    return np.column_stack([xs - ORIGIN[0], ORIGIN[1] - ys])

def ll(lon, lat):
    x, y = proj.transform(lon, lat)
    return (x - ORIGIN[0], ORIGIN[1] - y)

raw = json.loads((ROOT / 'src/data/kaohsiung-street-map-v2.json').read_text('utf-8'))
base = json.loads((ROOT / 'src/data/kaohsiung-map.json').read_text('utf-8'))
poi_path = ROOT / 'design/assets/kaohsiung-poi-water.json.gz'
poi_bytes = poi_path.read_bytes()
poi = json.loads(gzip.decompress(poi_bytes))
districts_gj = json.loads((ROOT / 'design/assets/kaohsiung-districts.geojson').read_text('utf-8'))

polygons = [make_valid(shapely_transform(shape(f['geometry']), to_local_coords)) for f in sorted(districts_gj['features'], key=lambda x: x['properties']['districtId'])]
anchors = {index: raw['graphNodes'][node][:2] for index, node in raw['anchors']}
by_district = [[(index, p) for index, p in anchors.items() if raw['cells'][index][2] == d] for d in range(12)]

rejected = Counter()
groups = {}

def add_poi(kind, osm_id, lon, lat, name, en):
    name = (name or en or '').strip()
    if not name or not (120.1 <= lon <= 120.7 and 22.4 <= lat <= 23.1):
        rejected['invalid'] += 1
        return
    p = ll(lon, lat)
    district = next((i for i, poly in enumerate(polygons) if poly.covers(Point(p))), None)
    if district is None:
        rejected['outside-kaohsiung'] += 1
        return
    index, target = min(by_district[district], key=lambda item: (math.dist(item[1], p), item[0]))
    snap = math.dist(target, p)
    if snap > 350:
        rejected['road-snap-over-350m'] += 1
        return
    entry = groups.setdefault((kind, index), {'names': [], 'en': [], 'ids': [], 'coordinates': [], 'snaps': [], 'district': district})
    entry['names'].append(name)
    entry['en'].append((en or name).strip())
    entry['ids'].append(osm_id)
    entry['coordinates'].append([lon, lat])
    entry['snaps'].append(snap)

# Prioritize real transit stations & night/public markets
for s in sorted(poi['stations'], key=lambda x: (x['kind'] == 'subway_entrance', x['id'])):
    if s['kind'] == 'subway_entrance' and '出入口' in s['name'] and len(s['name']) <= 6:
        continue
    add_poi('station', s['id'], s['lon'], s['lat'], s['name'], s['en'])

for m in sorted(poi['markets'], key=lambda x: x['id']):
    kind = 'nightmarket' if m.get('isNight') else 'market'
    add_poi(kind, m['id'], m['lon'], m['lat'], m['name'], m['en'])

places = []
for (kind, index), group in sorted(groups.items()):
    q, r = raw['cells'][index][:2]
    identity = kind + ':' + ','.join(sorted(group['ids']))
    zh = '／'.join(dict.fromkeys(group['names']))
    en = ' / '.join(dict.fromkeys(group['en']))
    places.append({
        'id': 'poi_' + kind + '_' + hashlib.sha256(identity.encode()).hexdigest()[:12],
        'districtId': base['districts'][group['district']]['id'],
        'cellId': f"{raw['version']}:{q},{r}",
        'kind': 'transit' if kind == 'station' else 'market',
        'wonderId': None,
        'syntheticVenue': False,
        'sourcePlace': True,
        'placeType': kind,
        'name': {'zh-TW': zh, 'en': en},
        'sourceIds': sorted(group['ids']),
        'sourceCoordinates': group['coordinates'][0],
        'snapMetres': round(max(group['snaps']), 1),
    })

result = {
    'version': 'kaohsiung-places-v1',
    'date': '2026-11-18',
    'routingRevision': raw['revision'],
    'sources': [{'id': 'osm', 'dataset': 'OpenStreetMap Kaohsiung Transit & Markets', 'sha256': hashlib.sha256(poi_bytes).hexdigest(), 'licence': 'ODbL-1.0'}],
    'policy': 'OSM transit & marketplaces in Kaohsiung 12 zones, same-district walkable road anchors within 350m; merge same-kind facilities sharing an anchor',
    'places': places,
    'audit': {
        'count': len(places),
        'rejected': dict(rejected),
        'byType': dict(Counter(p['placeType'] for p in places)),
        'byDistrict': {d['id']: sum(p['districtId'] == d['id'] for p in places) for d in base['districts']},
    },
}
result['revision'] = hashlib.sha256(json.dumps(result, ensure_ascii=False, separators=(',', ':'), sort_keys=True).encode()).hexdigest()

for out_path in [ROOT / 'src/data/kaohsiung-places.json', ROOT / 'public/data/kaohsiung-places-v1.json']:
    out_path.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')), 'utf-8')
print(json.dumps(result['audit'], ensure_ascii=False), flush=True)
