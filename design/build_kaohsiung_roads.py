"""Clip frozen OSM Kaohsiung roads to the 12 Kaohsiung campaign zones and 300m hexes."""
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
from shapely.geometry import shape, LineString, Polygon
from shapely.ops import unary_union
from shapely import make_valid, STRtree, transform as shapely_transform

ORIGIN = [180000, 2505000]
proj = Transformer.from_crs(4326, 3826, always_xy=True)

def to_local_coords(coords):
    xs, ys = proj.transform(coords[:, 0], coords[:, 1])
    return np.column_stack([xs - ORIGIN[0], ORIGIN[1] - ys])

def ll(lon, lat):
    x, y = proj.transform(lon, lat)
    return (x - ORIGIN[0], ORIGIN[1] - y)

districts_gj = json.loads((ROOT / 'design/assets/kaohsiung-districts.geojson').read_text('utf-8'))
regions = sorted(
    [(f['properties']['districtId'], make_valid(shapely_transform(shape(f['geometry']), to_local_coords)))
     for f in districts_gj['features']],
    key=lambda x: x[0],
)
city = unary_union([g for _, g in regions])
region_tree = STRtree([g for _, g in regions])

raw_path = ROOT / 'design/assets/kaohsiung-roads-osm-source.json.gz'
raw = json.loads(gzip.decompress(raw_path.read_bytes()))
meta = json.loads((ROOT / 'design/assets/kaohsiung-roads-source-metadata.json').read_text('utf-8'))
game = json.loads((ROOT / 'src/data/kaohsiung-map.json').read_text('utf-8'))
R = game['radiusMetres']
hex_polys = [Polygon([(c['x'] + R * math.cos(math.radians(i * 60 - 30)), c['y'] + R * math.sin(math.radians(i * 60 - 30))) for i in range(6)]) for c in game['cells']]
hex_tree = STRtree(hex_polys)

classes = {
    **{v: 'express' for v in ['motorway', 'motorway_link', 'trunk', 'trunk_link']},
    **{v: 'arterial' for v in ['primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link']},
    **{v: 'street' for v in ['residential', 'living_street', 'unclassified', 'road']},
    **{v: 'alley' for v in ['service', 'track']},
    **{v: 'path' for v in ['footway', 'pedestrian', 'path', 'steps', 'cycleway', 'bridleway']},
}

roads = []
cell_index = {}
excluded = {}
district_counts = {did: 0 for did, _ in regions}

for e in sorted(raw['elements'], key=lambda e: e['id']):
    tags = e.get('tags', {})
    highway = tags.get('highway', '')
    if e.get('type') != 'way' or highway not in classes or tags.get('area') == 'yes':
        excluded[highway] = excluded.get(highway, 0) + 1
        continue
    coords = [ll(p['lon'], p['lat']) for p in e.get('geometry', []) if 'lon' in p and 'lat' in p]
    if len(coords) < 2:
        continue
    line = LineString(coords)
    if not line.intersects(city):
        continue
    clipped = line.intersection(city)
    parts = [clipped] if clipped.geom_type == 'LineString' else [g for g in getattr(clipped, 'geoms', []) if g.geom_type == 'LineString']
    for part_no, part in enumerate(parts):
        if part.length < 2:
            continue
        shown = part.simplify(2.0, preserve_topology=True)
        points = [[round(x, 1), round(y, 1)] for x, y in shown.coords]
        if len(set(map(tuple, points))) < 2:
            continue
        ds = [regions[int(i)][0] for i in sorted(region_tree.query(part, predicate='intersects'))]
        if not ds:
            continue
        for did in ds:
            district_counts[did] += 1
        name = tags.get('name:zh-Hant') or tags.get('name:zh') or tags.get('name') or ''
        en = tags.get('name:en') or ''
        road = {
            'id': f'osm-way-{e["id"]}-{part_no}',
            'osmId': e['id'],
            'highway': highway,
            'class': classes[highway],
            'name': {'zh-TW': name, 'en': en},
            'ref': tags.get('ref', ''),
            'points': points,
            'bounds': [round(v, 1) for v in shown.bounds],
            'districtIds': ds,
            'lengthMetres': round(part.length, 1),
            'bridge': tags.get('bridge', 'no'),
            'tunnel': tags.get('tunnel', 'no'),
            'layer': tags.get('layer', '0'),
            'access': tags.get('access', 'unknown'),
            'foot': tags.get('foot', 'unknown'),
            'oneway': tags.get('oneway', 'unknown'),
            'restricted': highway in ['motorway', 'motorway_link'] or tags.get('motorroad') == 'yes' or tags.get('access') in ['private', 'no'] or tags.get('foot') in ['private', 'no'],
        }
        index = len(roads)
        roads.append(road)
        for i in sorted(hex_tree.query(part, predicate='intersects')):
            c = game['cells'][int(i)]
            cell_index.setdefault(c['id'], []).append(index)

assert len(roads) > 1000 and all(v > 0 for v in district_counts.values()), district_counts
out = {
    'version': 'kaohsiung-osm-roads-v1',
    'projection': game['projection'],
    'origin': ORIGIN,
    'source': meta,
    'clipBoundarySha256': hashlib.sha256((ROOT / 'design/assets/kaohsiung-districts.geojson').read_bytes()).hexdigest(),
    'displaySimplifyMetres': 2.0,
    'coordinateRoundMetres': 0.1,
    'districtCounts': district_counts,
    'roads': roads,
    'cellIndex': cell_index,
    'excludedHighways': excluded,
}
target = ROOT / 'public/data/kaohsiung-roads-v1.json.gz'
target.write_bytes(gzip.compress(json.dumps(out, ensure_ascii=False, separators=(',', ':')).encode(), mtime=0))
print(json.dumps({'roads': len(roads), 'hexes': len(cell_index), 'districtCounts': district_counts, 'bytes': target.stat().st_size}), flush=True)
