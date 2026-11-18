"""Build Kaohsiung 300m (SIZE=150m) base hex lattice from Kaohsiung OSM boundaries, water, bridges, tunnel & ferry."""
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
from shapely.geometry import shape, Point, Polygon, LineString
from shapely.ops import unary_union
from shapely import make_valid, STRtree, transform as shapely_transform

SIZE = 150
VERSION = 'kaohsiung-hex-v1'
ORIGIN = [180000, 2505000]
proj = Transformer.from_crs(4326, 3826, always_xy=True)

def to_local_coords(coords):
    xs, ys = proj.transform(coords[:, 0], coords[:, 1])
    return np.column_stack([xs - ORIGIN[0], ORIGIN[1] - ys])

def ll(lon, lat):
    x, y = proj.transform(lon, lat)
    return (x - ORIGIN[0], ORIGIN[1] - y)

def xy(q, r):
    return (SIZE * math.sqrt(3) * (q + r / 2), SIZE * 1.5 * r)

def rounded(p):
    return [round(p[0], 1), round(p[1], 1)]

districts_gj = json.loads((ROOT / 'design/assets/kaohsiung-districts.geojson').read_text('utf-8'))
regions = []
for feat in districts_gj['features']:
    props = feat['properties']
    geom = make_valid(shapely_transform(shape(feat['geometry']), to_local_coords))
    regions.append((props['districtId'], props['zh'], geom))
regions.sort(key=lambda r: r[0])

city = unary_union([g for _, _, g in regions])
overlap = sum(g.area for _, _, g in regions) - city.area
assert overlap < 50, f'District interiors overlap by {overlap} m2'

poi_water = json.loads(gzip.decompress((ROOT / 'design/assets/kaohsiung-poi-water.json.gz').read_bytes()))
walk_source = json.loads(gzip.decompress((ROOT / 'design/assets/kaohsiung-walk-source.json.gz').read_bytes()))

# Water polygons (rivers, reservoirs, harbor basins inside city)
rivers = []
for wp in poi_water['waterPolys']:
    coords = wp['coords']
    if len(coords) < 4:
        continue
    poly = make_valid(Polygon([ll(lon, lat) for lon, lat in coords]))
    if poly.is_valid and not poly.is_empty and poly.area >= 400 and poly.intersects(city):
        rivers.append(poly)
water = unary_union(rivers).intersection(city.buffer(300)) if rivers else Polygon()

# Bridges, tunnels (Cross-Harbor Tunnel!), and Gushan-Qijin ferry corridor
bridges = []
corridor_lines = []
for w in walk_source['ways']:
    t = w['tags']
    is_bridge = t.get('bridge', 'no') not in ('no', '')
    is_tunnel = t.get('tunnel', 'no') not in ('no', '')
    if not (is_bridge or is_tunnel):
        continue
    pts = [ll(lon, lat) for _, lon, lat in w['nodes']]
    if len(pts) < 2:
        continue
    line = LineString(pts)
    if line.length < 15 or not line.intersects(city):
        continue
    if not water.is_empty and line.intersects(water):
        corridor_lines.append(line)
        bridges.append({
            'id': f'osm-{w["id"]}',
            'bridgeCode': f'OSM-{w["id"]}',
            'name': t.get('name:zh-Hant') or t.get('name') or ('過港隧道' if is_tunnel else '跨河橋梁'),
            'en': t.get('name:en', ''),
            'points': [rounded(pts[0]), rounded(pts[-1])],
        })

# Add Gushan-Qijin & Qianzhen-Zhongzhou ferries explicitly as corridors
for f in poi_water['ferries']:
    name = f['name']
    if '鼓山' in name or '前鎮' in name:
        pts = [ll(lon, lat) for _, lon, lat in f['nodes']]
        line = LineString(pts)
        corridor_lines.append(line)
        bridges.append({
            'id': f'ferry-{f["id"]}',
            'bridgeCode': f'FERRY-{f["id"]}',
            'name': name,
            'en': 'Kaohsiung Harbor Ferry',
            'points': [rounded(pts[0]), rounded(pts[-1])],
        })

# Explicit Gushan pier <-> Qijin pier & Qianzhen Cross-Harbor Tunnel safety corridors
gushan_ferry_line = LineString([ll(120.2699, 22.6197), ll(120.2700, 22.6139)])
cross_harbor_line = LineString([ll(120.3130, 22.5812), ll(120.3032, 22.5758)])
corridor_lines.extend([gushan_ferry_line, cross_harbor_line])

bridge_corridor = unary_union([l.buffer(175) for l in corridor_lines]) if corridor_lines else Polygon()
blocked_water = water.difference(bridge_corridor) if not water.is_empty else Polygon()

# Sample 300m hexes across all 12 zones
minx, miny, maxx, maxy = city.bounds
region_tree = STRtree([g for _, _, g in regions])
cells = []
for r in range(math.floor(miny / (SIZE * 1.5)) - 1, math.ceil(maxy / (SIZE * 1.5)) + 2):
    for q in range(math.floor(minx / (SIZE * math.sqrt(3)) - r / 2) - 1, math.ceil(maxx / (SIZE * math.sqrt(3)) - r / 2) + 2):
        x, y = xy(q, r)
        p = Point(x, y)
        hits = sorted(int(i) for i in region_tree.query(p, predicate='intersects'))
        if not hits:
            continue
        in_corridor = not bridge_corridor.is_empty and bridge_corridor.covers(p)
        is_water = (not in_corridor) and (not blocked_water.is_empty) and blocked_water.covers(p)
        cells.append({
            'id': f'{VERSION}:{q},{r}',
            'q': q,
            'r': r,
            'x': round(x, 1),
            'y': round(y, 1),
            'districtId': regions[hits[0]][0],
            'terrain': 'water' if is_water else 'urban',
            'neighbors': [],
        })

by_coord = {(c['q'], c['r']): c for c in cells}
for c in cells:
    if c['terrain'] == 'water':
        continue
    for dq, dr in [(1, 0), (1, -1), (0, -1), (-1, 0), (-1, 1), (0, 1)]:
        n = by_coord.get((c['q'] + dq, c['r'] + dr))
        if n and n['terrain'] != 'water':
            seg = LineString([(c['x'], c['y']), (n['x'], n['y'])])
            if blocked_water.is_empty or bridge_corridor.intersects(seg) or not blocked_water.intersects(seg):
                c['neighbors'].append(n['id'])

# Verify Qijin Ferry / Tunnel neighbor bridge even if harbor channel > 300m wide
catalog = json.loads((ROOT / 'src/data/kaohsiung-wonders.json').read_text('utf-8'))
themes = ['music', 'river', 'temple', 'skyline', 'civic', 'market', 'park', 'arts', 'ecology', 'culture', 'hill', 'spring']
districts = []
nodes = []
occupied = set()
lookup = {c['id']: c for c in cells}

# Ensure single connected component across mainland + Qijin (connect nearest harbor crossings if gap > 1 hex)
def bfs(start_id):
    seen = {start_id}
    q = [start_id]
    for cid in q:
        for nb in lookup[cid]['neighbors']:
            if nb not in seen:
                seen.add(nb)
                q.append(nb)
    return seen

main_seed = min([c for c in cells if c['districtId'] == '6400600' and c['terrain'] != 'water' and c['neighbors']],
                key=lambda c: math.hypot(c['x'], c['y']))['id']
main_comp = bfs(main_seed)
qijin_land = [c for c in cells if c['districtId'] == '6400200' and c['terrain'] != 'water' and c['neighbors']]
if qijin_land and not any(c['id'] in main_comp for c in qijin_land):
    # Connect Gushan Ferry Pier cell to nearest Qijin land cell & Cross-Harbor Tunnel ends
    gushan_land = [c for c in cells if c['districtId'] == '6400100' and c['id'] in main_comp]
    gp = ll(120.2699, 22.6197)
    qp = ll(120.2700, 22.6139)
    ga = min(gushan_land, key=lambda c: math.hypot(c['x'] - gp[0], c['y'] - gp[1]))
    qa = min(qijin_land, key=lambda c: math.hypot(c['x'] - qp[0], c['y'] - qp[1]))
    if qa['id'] not in ga['neighbors']:
        ga['neighbors'].append(qa['id'])
        qa['neighbors'].append(ga['id'])
    qz_land = [c for c in cells if c['districtId'] == '6400800' and c['id'] in main_comp]
    if qz_land:
        tp1, tp2 = ll(120.3130, 22.5812), ll(120.3032, 22.5758)
        ta = min(qz_land, key=lambda c: math.hypot(c['x'] - tp1[0], c['y'] - tp1[1]))
        tb = min(qijin_land, key=lambda c: math.hypot(c['x'] - tp2[0], c['y'] - tp2[1]))
        if tb['id'] not in ta['neighbors']:
            ta['neighbors'].append(tb['id'])
            tb['neighbors'].append(ta['id'])
    main_comp = bfs(main_seed)

for index, (did, name, geom) in enumerate(regions):
    w = next(w for w in catalog['wonders'] if w['districtId'] == did)
    wx, wy = ll(*w['geography']['coordinates'])
    available = [c for c in cells if c['districtId'] == did and c['id'] in main_comp]
    assert len(available) >= 5, f'{did} only has {len(available)} connected cells'
    anchor = min(available, key=lambda c: math.hypot(c['x'] - wx, c['y'] - wy))
    offset = math.hypot(anchor['x'] - wx, anchor['y'] - wy)
    assert offset < 650, (did, name, offset)
    nearby = sorted(available, key=lambda c: math.hypot(c['x'] - anchor['x'], c['y'] - anchor['y']))
    chosen = [anchor]
    for c in nearby:
        if len(chosen) == 5:
            break
        if c['id'] not in occupied and c not in chosen and math.hypot(c['x'] - anchor['x'], c['y'] - anchor['y']) >= 500:
            chosen.append(c)
    assert len(chosen) == 5, (did, len(chosen))
    kinds = ['wonder', 'market', 'transit', 'venue', 'community']
    if did == '6400500':
        kinds[-1] = 'waterfront'
    for kind, c in zip(kinds, chosen):
        occupied.add(c['id'])
        nodes.append({
            'id': w['id'] if kind == 'wonder' else f'{did}_{kind}',
            'districtId': did,
            'cellId': c['id'],
            'kind': kind,
            'wonderId': w['id'] if kind == 'wonder' else None,
            'syntheticVenue': True,
            **({'sourceCoordinates': w['geography']['coordinates'], 'snapMetres': round(offset, 1)} if kind == 'wonder' else {}),
        })
    polys = geom.geoms if geom.geom_type == 'MultiPolygon' else [geom]
    rings = []
    for poly in polys:
        simple = poly.simplify(25, preserve_topology=True)
        rings.extend([[rounded(p) for p in ring.coords] for ring in [simple.exterior, *simple.interiors]])
    center = geom.representative_point()
    districts.append({
        'id': did,
        'name': w['districtName'],
        'theme': themes[index],
        'rings': rings,
        'center': rounded(center.coords[0]),
        'bounds': [round(v, 1) for v in geom.bounds],
        'anchor': anchor['id'],
        'wonderId': w['id'],
    })
    for c in available:
        h = abs(c['q'] * 31 + c['r'] * 17) % 13
        if c['id'] in [n['cellId'] for n in nodes if n['districtId'] == did]:
            c['terrain'] = 'plaza'
        elif did in ['6400100', '6401100', '6401200'] and h < 3:
            c['terrain'] = 'slope'
        elif h < 3 or did == '6400700' and h < 6:
            c['terrain'] = 'park'
        elif h == 7:
            c['terrain'] = 'lane'

for c in cells:
    for n in c['neighbors']:
        assert c['id'] in lookup[n]['neighbors']
for d in districts:
    assert d['anchor'] in main_comp, d['name']
    assert all(n['cellId'] in main_comp for n in nodes if n['districtId'] == d['id']), d['name']

water_polys = water.geoms if hasattr(water, 'geoms') else ([water] if not water.is_empty else [])
water_rings = [[rounded(v) for v in p.simplify(15).exterior.coords] for p in water_polys if p.geom_type == 'Polygon' and p.area >= 1000]

sources = []
for f in ['kaohsiung-districts.geojson', 'kaohsiung-poi-water.json.gz']:
    sources.append({'file': f, 'sha256': hashlib.sha256((ROOT / 'design/assets' / f).read_bytes()).hexdigest()})

out = {
    'version': VERSION,
    'projection': 'EPSG:3826',
    'origin': ORIGIN,
    'radiusMetres': SIZE,
    'maxWonderSnapMetres': 650,
    'syntheticTerrain': True,
    'topologyOverlapSquareMetres': round(overlap, 3),
    'sources': sources,
    'districts': districts,
    'cells': cells,
    'nodes': nodes,
    'rivers': water_rings,
    'bridges': bridges,
}

path = ROOT / 'src/data/kaohsiung-map.json'
path.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), 'utf-8')
print(json.dumps({'cells': len(cells), 'land': len(main_comp), 'nodes': len(nodes), 'districts': len(districts), 'bridges': len(bridges), 'waterRings': len(water_rings), 'bytes': path.stat().st_size}), flush=True)
