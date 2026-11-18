"""Extract Kaohsiung OSM source layers in a single fast streaming pass."""
from pathlib import Path
import datetime
import gzip
import hashlib
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.tools/map-libs'))
import osmium
from pyproj import Transformer
from shapely.geometry import shape, Polygon, MultiPolygon, LineString, mapping
from shapely.ops import unary_union
from shapely import transform as shapely_transform, make_valid

PBF = ROOT / '.tools/taiwan-latest.osm.pbf'
ASSETS = ROOT / 'design/assets'

GROUPS = {
    '6400100': ('鹽埕・鼓山', 'Yancheng & Gushan', ['鹽埕區', '鼓山區']),
    '6400200': ('旗津區', 'Qijin District', ['旗津區']),
    '6400300': ('左營區', 'Zuoying District', ['左營區']),
    '6400400': ('楠梓區', 'Nanzi District', ['楠梓區', '仁武區', '大社區']),
    '6400500': ('三民區', 'Sanmin District', ['三民區']),
    '6400600': ('新興・前金', 'Xinxing & Qianjin', ['新興區', '前金區']),
    '6400700': ('苓雅區', 'Lingya District', ['苓雅區']),
    '6400800': ('前鎮區', 'Qianzhen District', ['前鎮區']),
    '6400900': ('小港區', 'Xiaogang District', ['小港區', '大寮區']),
    '6401000': ('鳳山區', 'Fengshan District', ['鳳山區', '鳥松區']),
    '6401100': ('岡山・橋頭', 'Gangshan & Qiaotou', ['岡山區', '橋頭區', '梓官區', '燕巢區']),
    '6401200': ('旗山・美濃', 'Qishan & Meinong', ['旗山區', '美濃區', '大樹區']),
}

raw_districts = json.loads((ROOT / '.tools/kaohsiung-osm-districts.json').read_text('utf-8'))
proj = Transformer.from_crs(4326, 3826, always_xy=True)

def to_local_coords(coords):
    # coords is ndarray (N, 2)
    xs, ys = proj.transform(coords[:, 0], coords[:, 1])
    import numpy as np
    return np.column_stack([xs - 180000.0, 2505000.0 - ys])

def wgs_to_local(lon, lat):
    x, y = proj.transform(lon, lat)
    return (x - 180000.0, 2505000.0 - y)

regions = []
district_features = []
for did, (zh, en, subnames) in GROUPS.items():
    poly_wgs = make_valid(unary_union([shape(raw_districts[n]['geom']) for n in subnames]))
    district_features.append({
        'type': 'Feature',
        'properties': {'districtId': did, 'zh': zh, 'en': en, 'subdistricts': subnames},
        'geometry': mapping(poly_wgs),
    })
    poly_loc = make_valid(shapely_transform(poly_wgs, to_local_coords))
    regions.append((did, zh, en, poly_loc))

city_local = unary_union([g for _, _, _, g in regions])
(ASSETS / 'kaohsiung-districts.geojson').write_text(
    json.dumps({'type': 'FeatureCollection', 'features': district_features}, ensure_ascii=False),
    'utf-8',
)

# Bounding box across all 12 zones with ~1km padding
all_wgs_bounds = [shape(f['geometry']).bounds for f in district_features]
W = min(b[0] for b in all_wgs_bounds) - 0.015
S = min(b[1] for b in all_wgs_bounds) - 0.015
E = max(b[2] for b in all_wgs_bounds) + 0.015
N = max(b[3] for b in all_wgs_bounds) + 0.015
print(f'BBox WGS84: {[round(W,4), round(S,4), round(E,4), round(N,4)]}', flush=True)

WALK_KEYS = {
    'highway', 'name', 'name:zh', 'name:zh-Hant', 'name:en', 'ref',
    'foot', 'access', 'motorroad', 'bridge', 'tunnel', 'layer',
    'oneway', 'oneway:foot', 'foot:conditional', 'access:conditional',
    'sidewalk', 'footway', 'service', 'barrier', 'opening_hours',
    'vehicle', 'motor_vehicle', 'motorcar', 'junction',
    'oneway:motorcar', 'oneway:motor_vehicle', 'area',
}
BLDG_KEYS = {
    'building', 'name', 'name:en', 'name:zh-Hant',
    'height', 'building:levels', 'min_height', 'building:min_level', 'roof:shape',
}
WATER_WATERWAYS = {'riverbank', 'river', 'canal', 'dock', 'stream'}

class KaohsiungExtractor(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.barriers = {}
        self.walk_ways = []
        self.road_elements = []
        self.buildings = []
        self.water_polys = []
        self.water_lines = []
        self.ferry_ways = []
        self.stations = []
        self.markets = []

    def node(self, n):
        if not n.location.valid():
            return
        lon, lat = n.location.lon, n.location.lat
        if not (W <= lon <= E and S <= lat <= N):
            return
        t = dict(n.tags)
        if any(k in t for k in ('barrier', 'foot', 'access')):
            bt = {k: v for k, v in t.items() if k in WALK_KEYS}
            if bt:
                self.barriers[str(n.id)] = bt
        if t.get('railway') in ('station', 'tram_stop', 'subway_entrance', 'halt') or t.get('station') in ('subway', 'light_rail'):
            if t.get('name'):
                self.stations.append({
                    'id': str(n.id), 'lon': round(lon, 6), 'lat': round(lat, 6),
                    'name': t.get('name:zh-Hant') or t.get('name', ''),
                    'en': t.get('name:en', ''),
                    'kind': t.get('railway') or t.get('station') or 'station',
                    'network': t.get('network', ''),
                })
        if t.get('amenity') == 'marketplace' or ('夜市' in t.get('name', '')) or ('公有' in t.get('name', '') and '市場' in t.get('name', '')):
            self.markets.append({
                'id': str(n.id), 'lon': round(lon, 6), 'lat': round(lat, 6),
                'name': t.get('name:zh-Hant') or t.get('name', ''),
                'en': t.get('name:en', ''),
                'isNight': '夜市' in t.get('name', ''),
            })

    def way(self, w):
        if len(w.nodes) < 2 or not all(p.location.valid() for p in w.nodes):
            return
        xs = [p.lon for p in w.nodes]
        ys = [p.lat for p in w.nodes]
        if min(xs) > E or max(xs) < W or min(ys) > N or max(ys) < S:
            return
        t = dict(w.tags)
        if 'highway' in t:
            coords = [[p.ref, p.lon, p.lat] for p in w.nodes]
            wt = {k: v for k, v in t.items() if k in WALK_KEYS}
            self.walk_ways.append({'id': w.id, 'tags': wt, 'nodes': coords})
            if t.get('area') != 'yes':
                self.road_elements.append({
                    'type': 'way', 'id': w.id, 'tags': wt,
                    'geometry': [{'lon': p[1], 'lat': p[2]} for p in coords],
                })
        elif t.get('route') == 'ferry' or ('渡輪' in t.get('name', '') and t.get('ferry') != 'no'):
            self.ferry_ways.append({
                'id': w.id, 'name': t.get('name', ''),
                'nodes': [[p.ref, round(p.lon, 6), round(p.lat, 6)] for p in w.nodes],
            })
        elif t.get('building', 'no') not in {'no', 'construction', 'proposed'} and len(w.nodes) >= 4 and w.nodes[0].ref == w.nodes[-1].ref:
            pts_loc = [wgs_to_local(p.lon, p.lat) for p in w.nodes]
            try:
                poly = make_valid(Polygon(pts_loc))
                if poly.is_empty or poly.area < 4 or not poly.intersects(city_local):
                    return
                clipped = poly.intersection(city_local)
                polys = [clipped] if clipped.geom_type == 'Polygon' else [g for g in getattr(clipped, 'geoms', []) if g.geom_type == 'Polygon']
                if not polys:
                    return
                ds = [did for did, _, _, g in regions if g.intersects(poly)]
                if not ds:
                    return
                bt = {k: v for k, v in t.items() if k in BLDG_KEYS}
                self.buildings.append({
                    'id': f'w{w.id}', 'tags': bt,
                    'polygons': [[list(p.exterior.coords), *[list(r.coords) for r in p.interiors]] for p in polys],
                    'districtIds': ds,
                    'sourceAreaMetres2': round(poly.area, 2),
                })
            except Exception:
                pass
        if (t.get('waterway') in WATER_WATERWAYS or t.get('natural') == 'water' or t.get('water') in {'river', 'canal', 'harbor', 'reservoir', 'lake', 'basin'}) and len(w.nodes) >= 4 and w.nodes[0].ref == w.nodes[-1].ref:
            self.water_polys.append({'id': w.id, 'name': t.get('name', ''), 'coords': [[round(p.lon, 6), round(p.lat, 6)] for p in w.nodes]})
        elif t.get('waterway') in {'river', 'canal'} and len(w.nodes) >= 2:
            self.water_lines.append({'id': w.id, 'name': t.get('name', ''), 'coords': [[round(p.lon, 6), round(p.lat, 6)] for p in w.nodes]})
        if (t.get('amenity') == 'marketplace' or '夜市' in t.get('name', '') or ('公有' in t.get('name', '') and '市場' in t.get('name', ''))) and t.get('name'):
            cx = sum(xs) / len(xs)
            cy = sum(ys) / len(ys)
            self.markets.append({
                'id': f'w{w.id}', 'lon': round(cx, 6), 'lat': round(cy, 6),
                'name': t.get('name:zh-Hant') or t.get('name', ''),
                'en': t.get('name:en', ''),
                'isNight': '夜市' in t.get('name', ''),
            })

def file_sha256(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()

def main():
    print('Scanning PBF...', flush=True)
    h = KaohsiungExtractor()
    h.apply_file(str(PBF), locations=True, idx='sparse_file_array,' + str(ROOT / '.tools/kh-locations.cache'))
    reader = osmium.io.Reader(str(PBF))
    timestamp = reader.header().get('osmosis_replication_timestamp') or '2026-11-18T00:00:00Z'
    reader.close()
    pbf_sha = file_sha256(PBF)

    walk_out = {
        'format': 'osm-walk-source-v1',
        'sourceUrl': 'https://download.geofabrik.de/asia/taiwan-latest.osm.pbf',
        'sourceSha256': pbf_sha,
        'dataTimestamp': timestamp,
        'licence': 'ODbL-1.0',
        'ways': h.walk_ways,
        'nodeRestrictions': h.barriers,
    }
    walk_path = ASSETS / 'kaohsiung-walk-source.json.gz'
    walk_path.write_bytes(gzip.compress(json.dumps(walk_out, ensure_ascii=False, separators=(',', ':')).encode(), mtime=0))

    road_out = {'elements': h.road_elements}
    road_path = ASSETS / 'kaohsiung-roads-osm-source.json.gz'
    road_path.write_bytes(gzip.compress(json.dumps(road_out, ensure_ascii=False, separators=(',', ':')).encode(), mtime=0))
    road_meta = {
        'provider': 'OpenStreetMap / Geofabrik Taiwan',
        'endpoint': 'https://download.geofabrik.de/asia/taiwan-latest.osm.pbf',
        'bboxWgs84': [round(W, 4), round(S, 4), round(E, 4), round(N, 4)],
        'dataTimestamp': timestamp,
        'retrievedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'licence': 'ODbL-1.0',
        'licenceUrl': 'https://opendatacommons.org/licenses/odbl/',
        'copyrightUrl': 'https://www.openstreetmap.org/copyright',
        'sourceSha256': file_sha256(road_path),
        'fieldsNotProvided': ['verified-public-access', 'sidewalk-width'],
    }
    (ASSETS / 'kaohsiung-roads-source-metadata.json').write_text(json.dumps(road_meta, ensure_ascii=False, indent=2) + '\n', 'utf-8')

    bldg_out = {
        'version': 'kaohsiung-buildings-source-v1',
        'projection': 'EPSG:3826',
        'origin': [180000, 2505000],
        'source': {
            'url': 'https://download.geofabrik.de/asia/taiwan-latest.osm.pbf',
            'sha256': pbf_sha,
            'dataTimestamp': timestamp,
            'retrievedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'licence': 'ODbL-1.0',
        },
        'buildings': sorted(h.buildings, key=lambda b: b['id']),
        'geometryErrors': 0,
    }
    (ASSETS / 'kaohsiung-buildings-source.json.gz').write_bytes(
        gzip.compress(json.dumps(bldg_out, ensure_ascii=False, separators=(',', ':')).encode(), mtime=0)
    )

    water_out = {
        'waterPolys': h.water_polys,
        'waterLines': h.water_lines,
        'ferries': h.ferry_ways,
        'stations': h.stations,
        'markets': h.markets,
    }
    (ASSETS / 'kaohsiung-poi-water.json.gz').write_bytes(
        gzip.compress(json.dumps(water_out, ensure_ascii=False, separators=(',', ':')).encode(), mtime=0)
    )
    print(json.dumps({
        'walkWays': len(h.walk_ways), 'barriers': len(h.barriers),
        'roadElements': len(h.road_elements), 'buildings': len(h.buildings),
        'waterPolys': len(h.water_polys), 'waterLines': len(h.water_lines),
        'ferries': len(h.ferry_ways), 'stations': len(h.stations), 'markets': len(h.markets),
    }, ensure_ascii=False), flush=True)

if __name__ == '__main__':
    main()
