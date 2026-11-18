"""Build Kaohsiung 300m (SIZE=150m) OSM directed walking graph (kaohsiung-street-hex-v1)."""
from collections import defaultdict, Counter
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
from walk_policy import eligibility, walking_directions

SIZE = 150
VERSION = 'kaohsiung-street-hex-v1'
ORIGIN = [180000, 2505000]
STEP_METRES = 40

legacy = json.loads((ROOT / 'src/data/kaohsiung-map.json').read_text('utf-8'))
rawpath = ROOT / 'design/assets/kaohsiung-walk-source.json.gz'
source = json.loads(gzip.decompress(rawpath.read_bytes()))
districts_gj = json.loads((ROOT / 'design/assets/kaohsiung-districts.geojson').read_text('utf-8'))

proj = Transformer.from_crs(4326, 3826, always_xy=True)
def to_local_coords(coords):
    xs, ys = proj.transform(coords[:, 0], coords[:, 1])
    return np.column_stack([xs - ORIGIN[0], ORIGIN[1] - ys])

def ll(lon, lat):
    x, y = proj.transform(lon, lat)
    return (x - ORIGIN[0], ORIGIN[1] - y)

def xy(q, r):
    return (SIZE * math.sqrt(3) * (q + r / 2), SIZE * 1.5 * r)

def axial(x, y, size=SIZE):
    q = x / (math.sqrt(3) * size) - y / (3 * size)
    r = y / (1.5 * size)
    a, b, c = round(q), round(r), round(-q - r)
    da, db, dc = abs(a - q), abs(b - r), abs(c + q + r)
    if da > db and da > dc:
        a = -b - c
    elif db > dc:
        b = -a - c
    return a, b

regions = sorted(
    [(f['properties']['districtId'], make_valid(shapely_transform(shape(f['geometry']), to_local_coords)))
     for f in districts_gj['features']],
    key=lambda x: x[0],
)
city = unary_union([g for _, g in regions])
regiontree = STRtree([g for _, g in regions])
water = unary_union([Polygon(r) for r in legacy['rivers']]).buffer(-4) if legacy['rivers'] else Polygon()

def nearest_node_id(ways_list, target_ll):
    tx, ty = target_ll
    best = None
    best_d = 1e18
    for w in ways_list:
        ok, _, _ = eligibility(w['tags'])
        if not ok:
            continue
        for nid, lon, lat in w['nodes']:
            px, py = ll(lon, lat)
            d = math.hypot(px - tx, py - ty)
            if d < best_d:
                best_d = d
                best = (nid, lon, lat)
    return best, best_d

def build_graph():
    oldcoords = {(c['q'], c['r']): c for c in legacy['cells']}
    cells = []
    bycoord = {}
    minx, miny, maxx, maxy = city.bounds
    for r in range(math.floor(miny / (SIZE * 1.5)) - 1, math.ceil(maxy / (SIZE * 1.5)) + 2):
        for q in range(math.floor(minx / (SIZE * math.sqrt(3)) - r / 2) - 1, math.ceil(maxx / (SIZE * math.sqrt(3)) - r / 2) + 2):
            x, y = xy(q, r)
            p = Point(x, y)
            owners = sorted(int(i) for i in regiontree.query(p, predicate='intersects'))
            if not owners:
                continue
            parent = oldcoords.get((q, r))
            terrain = parent['terrain'] if parent else 'urban'
            c = {'q': q, 'r': r, 'x': round(x, 1), 'y': round(y, 1), 'district': owners[0], 'terrain': terrain}
            bycoord[(q, r)] = len(cells)
            cells.append(c)
    print(f'{len(cells)} shared 300m hexes', flush=True)

    # Inject synthetic Gushan-Qijin Ferry walking connector between real nearest OSM walk nodes on both piers
    gushan_ways = [w for w in source['ways'] if any(120.268 <= n[1] <= 120.273 and 22.6175 <= n[2] <= 22.622 for n in w['nodes'])]
    qijin_ways = [w for w in source['ways'] if any(120.268 <= n[1] <= 120.273 and 22.611 <= n[2] <= 22.6152 for n in w['nodes'])]
    gn, gd = nearest_node_id(gushan_ways or source['ways'], ll(120.2699, 22.6197))
    qn, qd = nearest_node_id(qijin_ways or source['ways'], ll(120.2700, 22.6139))
    ferry_way = {
        'id': 990000001,
        'tags': {'highway': 'pedestrian', 'name': '鼓山—旗津渡輪線', 'name:zh-Hant': '鼓山—旗津渡輪線', 'name:en': 'Gushan–Qijin Ferry', 'foot': 'yes', 'bridge': 'yes', 'layer': '1'},
        'nodes': [list(gn), list(qn)],
    }
    print(f'Injected Gushan-Qijin Ferry connector: snap {gd:.1f}m / {qd:.1f}m', flush=True)

    points = {}
    nodehex = {}
    adj = defaultdict(list)
    reverse = defaultdict(list)
    wayinfo = {}
    excluded = Counter()
    rawedges = 0

    def register(nid, p):
        if nid in nodehex:
            return nodehex[nid]
        cell = bycoord.get(axial(*p))
        nodehex[nid] = cell if cell is not None and city.covers(Point(p)) else None
        if nodehex[nid] is not None:
            points[nid] = p
        return nodehex[nid]

    for way in [*source['ways'], ferry_way]:
        tags = way['tags']
        allowed, assumed, why = eligibility(tags)
        if not allowed:
            excluded[why] += 1
            continue
        wayinfo[way['id']] = {
            'id': way['id'],
            'name': {'zh-TW': tags.get('name:zh-Hant') or tags.get('name:zh') or tags.get('name', ''), 'en': tags.get('name:en', '')},
            'highway': tags['highway'],
            'foot': tags.get('foot', 'unknown'),
            'access': tags.get('access', 'unknown'),
            'bridge': tags.get('bridge', 'no'),
            'tunnel': tags.get('tunnel', 'no'),
            'layer': tags.get('layer', '0'),
            'onewayFoot': tags.get('oneway:foot', 'no'),
            'assumed': assumed,
        }
        previous = None
        for j, (osmid, lon, lat) in enumerate(way['nodes']):
            p = ll(lon, lat)
            nid_str = str(osmid)
            register(nid_str, p)
            restriction = source['nodeRestrictions'].get(nid_str, {})
            if restriction and not eligibility(restriction, True)[0]:
                previous = None
                continue
            if previous is not None:
                aid, a = previous
                length = math.dist(a, p)
                if length > 0 and city.covers(LineString([a, p])):
                    if way['id'] != ferry_way['id'] and tags.get('bridge', 'no') == 'no' and tags.get('tunnel', 'no') == 'no' and not water.is_empty and LineString([a, p]).intersection(water).length > 5:
                        excluded['water-segment'] += 1
                    else:
                        count = max(1, math.ceil(length / STEP_METRES))
                        last = aid
                        for k in range(1, count + 1):
                            nid = nid_str if k == count else f'v:{way["id"]}:{j}:{k}'
                            pos = p if k == count else (a[0] + (p[0] - a[0]) * k / count, a[1] + (p[1] - a[1]) * k / count)
                            register(nid, pos)
                            if nodehex.get(last) is not None and nodehex.get(nid) is not None:
                                ca, cb = cells[nodehex[last]], cells[nodehex[nid]]
                                dq, dr = cb['q'] - ca['q'], cb['r'] - ca['r']
                                if max(abs(dq), abs(dr), abs(dq + dr)) <= 1:
                                    edge = (nid, length / count, way['id'])
                                    back = (last, length / count, way['id'])
                                    forward, backward = walking_directions(tags)
                                    if forward:
                                        adj[last].append(edge)
                                        reverse[nid].append(back)
                                    if backward:
                                        adj[nid].append(back)
                                        reverse[last].append(edge)
                                    rawedges += 1
                            last = nid
            previous = (nid_str, p)

    print(f'{len(points)} source/virtual vertices, {rawedges} source segments', flush=True)

    def reachable(graph, seed):
        seen = {seed}
        q = [seed]
        for cur in q:
            for item in graph.get(cur, []):
                nxt = item[0]
                if nxt not in seen:
                    seen.add(nxt)
                    q.append(nxt)
        return seen

    central = next(d for d in legacy['districts'] if d['id'] == '6400600')
    origin = next(c for c in legacy['cells'] if c['id'] == central['anchor'])
    seed = min(adj, key=lambda id: math.dist(points[id], (origin['x'], origin['y'])))
    main = reachable(adj, seed) & reachable(reverse, seed)

    bycell = defaultdict(list)
    for id in main:
        bycell[nodehex[id]].append(id)
    anchors = {i: min(ids, key=lambda id: (math.dist(points[id], (cells[i]['x'], cells[i]['y'])), id)) for i, ids in bycell.items()}
    keep = set(anchors.values())
    for id in main:
        out = [v for v in adj.get(id, []) if v[0] in main]
        back = [v for v in reverse.get(id, []) if v[0] in main]
        if len(out) != 2 or len(back) != 2 or {v[0] for v in out} != {v[0] for v in back} or len({v[2] for v in out + back}) != 1 or any(nodehex[v[0]] != nodehex[id] for v in out + back):
            keep.add(id)

    ordered = sorted(keep)
    indices = {id: i for i, id in enumerate(ordered)}
    links = []
    pairs = {}
    cell_links = set()
    for id in sorted(main):
        for n, _, _ in adj.get(id, []):
            if n in main and nodehex[id] != nodehex[n]:
                cell_links.add((nodehex[id], nodehex[n]))
    for start in ordered:
        for n, length, way in adj.get(start, []):
            if n not in main:
                continue
            previous = start
            ids = [start, n]
            distance = length
            while n not in keep:
                following = [v for v in adj[n] if v[0] in main and v[0] != previous]
                assert len(following) == 1
                to, cost, wid = following[0]
                assert way == wid
                previous, n = n, to
                distance += cost
                ids.append(n)
            if n == start:
                continue
            flat = []
            for id in ids:
                x, y = points[id]
                pt = [round(x, 1), round(y, 1)]
                if flat[-2:] != pt:
                    flat.extend(pt)
            key = (indices[start], indices[n], way)
            reverse_key = (indices[n], indices[start], way)
            if reverse_key in pairs:
                old = links[pairs[reverse_key]]
                if old[4] == sum([flat[k:k + 2] for k in range(len(flat) - 2, -1, -2)], []):
                    old[5] = 1
                    continue
            pairs[key] = len(links)
            links.append([indices[start], indices[n], round(distance, 2), way, flat, 0])

    used = {edge[3] for edge in links}
    by_dist = Counter(cells[i]['district'] for i in bycell)
    print(f'{len(main)} source vertices -> {len(ordered)} routing nodes / {len(links)} links; {len(anchors)} road hexes; per-district walkable: {dict(sorted(by_dist.items()))}', flush=True)
    return {
        'cells': cells,
        'core': sorted(bycell),
        'positions': {str(i): points[anchors[i]] for i in bycell},
        'anchorNodes': {str(i): indices[anchors[i]] for i in bycell},
        'graphNodes': [[round(points[id][0], 1), round(points[id][1], 1), nodehex[id], id] for id in ordered],
        'graphLinks': links,
        'cellLinks': sorted(cell_links),
        'ways': {str(id): wayinfo[id] for id in used},
        'audit': {'rawVertices': len(points), 'rawEdges': rawedges, 'sourceComponent': len(main), 'walkableCells': len(bycell), 'excluded': dict(excluded)},
    }

stage_path = ROOT / '.tools/kaohsiung-street-stage-v1.json.gz'
fp = hashlib.sha256(rawpath.read_bytes() + (ROOT / 'design/assets/kaohsiung-districts.geojson').read_bytes() + (ROOT / 'src/data/kaohsiung-map.json').read_bytes()).hexdigest()
stage = json.loads(gzip.decompress(stage_path.read_bytes())) if stage_path.exists() else {}
if stage.get('fingerprint') != fp:
    stage = build_graph()
    stage['fingerprint'] = fp
    stage_path.write_bytes(gzip.compress(json.dumps(stage, separators=(',', ':')).encode(), mtime=0))
cells = stage['cells']
core = set(stage['core'])
positions = stage['positions']
wayinfo = stage['ways']

nodecells = {}
occupied = set()
snaps = {}
district_anchors = {}
catalog = json.loads((ROOT / 'src/data/kaohsiung-wonders.json').read_text('utf-8'))

for n in legacy['nodes']:
    district_index = next(i for i, (did, _) in enumerate(regions) if did == n['districtId'])
    if n['kind'] == 'wonder':
        target = ll(*next(w for w in catalog['wonders'] if w['id'] == n['wonderId'])['geography']['coordinates'])
    else:
        hub = positions[str(district_anchors[n['districtId']])]
        dx, dy = {'market': (-600, 0), 'transit': (600, 0), 'venue': (0, -600), 'community': (0, 600), 'waterfront': (0, 600)}[n['kind']]
        target = (hub[0] + dx, hub[1] + dy)
    choices = [i for i in core if cells[i]['district'] == district_index and i not in occupied]
    assert choices, f'No walkable cells left for {n["id"]} in district {n["districtId"]}'
    index = min(choices, key=lambda i: (math.dist(positions[str(i)], target), i))
    snap = math.dist(positions[str(index)], target)
    assert snap < 800, (n['id'], snap)
    nodecells[n['id']] = index
    occupied.add(index)
    snaps[n['id']] = round(snap, 1)
    cells[index]['terrain'] = 'plaza'
    if n['kind'] == 'wonder':
        district_anchors[n['districtId']] = index

terrain_list = ['urban', 'lane', 'park', 'slope', 'plaza', 'water']
packed = []
anchorpoints = {}
for i, c in enumerate(cells):
    if i in core:
        anchorpoints[str(i)] = stage['anchorNodes'][str(i)]
        if c['terrain'] == 'water':
            c['terrain'] = 'lane'
    packed.append([c['q'], c['r'], c['district'], terrain_list.index(c['terrain'])])

for edge in stage['graphLinks']:
    if len(edge[4]) == 2:
        edge[4] = edge[4] * 2

usedways = {int(id) for id in wayinfo}
out = {
    'version': VERSION,
    'radiusMetres': SIZE,
    'projection': 'EPSG:3826',
    'origin': ORIGIN,
    'source': {k: source[k] for k in ['sourceUrl', 'sourceSha256', 'dataTimestamp', 'licence']},
    'sourceExtractSha256': hashlib.sha256(rawpath.read_bytes()).hexdigest(),
    'policy': 'walk-game-policy-v1',
    'cells': packed,
    'anchors': [[int(i), index] for i, index in anchorpoints.items()],
    'graphNodes': stage['graphNodes'],
    'graphLinks': stage['graphLinks'],
    'cellLinks': stage['cellLinks'],
    'nodeCells': nodecells,
    'nodeSnaps': snaps,
    'districtAnchors': district_anchors,
    'ways': [[wayinfo[str(id)][k] for k in ['id', 'name', 'highway', 'foot', 'access', 'bridge', 'tunnel', 'layer', 'onewayFoot', 'assumed']] for id in sorted(usedways)],
    'audit': {**stage['audit'], 'maxNodeSnap': max(snaps.values())},
    'venueLayout': 'kaohsiung-300m-public-road-sites',
}
out['revision'] = hashlib.sha256(json.dumps(out, separators=(',', ':'), sort_keys=True).encode()).hexdigest()
target = ROOT / 'src/data/kaohsiung-street-map-v2.json'
target.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), 'utf-8')
(ROOT / 'src/data/kaohsiung-street-map-v2.js').write_text("import data from './kaohsiung-street-map-v2.json' with { type: 'json' };\nexport default data;\n", 'utf-8')
(ROOT / 'src/data/kaohsiung-street-map-v2.d.ts').write_text('declare const data: unknown;\nexport default data;\n', 'utf-8')
(ROOT / 'public/data/kaohsiung-walk-network-v2.json.gz').write_bytes(gzip.compress(json.dumps(out, ensure_ascii=False, separators=(',', ':')).encode(), mtime=0))
print(json.dumps({'cells': len(cells), 'walkableCells': len(core), 'links': len(stage['graphLinks']), 'nodes': len(nodecells), 'maxSnap': max(snaps.values()), 'bytes': target.stat().st_size, 'revision': out['revision']}), flush=True)
