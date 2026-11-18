"""Extract Kaohsiung vehicle graph + turn restrictions and build .tools/vehicle-* artifacts."""
from pathlib import Path
import gzip
import hashlib
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.tools/map-libs'))
sys.path.insert(0, str(ROOT / 'design'))
import osmium
from vehicle_policy import eligibility, directions
from vehicle_graph import VehicleGraph
from package_vehicle_columnar import encode as encode_v2
from package_vehicle_aligned import encode_v3
from build_vehicle_connectors import joins

PBF = ROOT / '.tools/taiwan-latest.osm.pbf'
META = json.loads((ROOT / 'design/assets/kaohsiung-roads-source-metadata.json').read_text('utf-8'))
W, S, E, N = META['bboxWgs84']

KEYS = {
    'highway', 'name', 'ref', 'access', 'vehicle', 'motor_vehicle', 'motorcar',
    'access:conditional', 'vehicle:conditional', 'motor_vehicle:conditional',
    'motorcar:conditional', 'oneway', 'oneway:motorcar', 'oneway:motor_vehicle',
    'oneway:conditional', 'oneway:motorcar:conditional', 'oneway:motor_vehicle:conditional',
    'motorcar:oneway:conditional', 'junction', 'motorroad',
    'bridge', 'tunnel', 'layer', 'service', 'barrier', 'opening_hours',
}

def canonical(data):
    return json.dumps(data, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode('utf-8')

def sha_bytes(data):
    return hashlib.sha256(data).hexdigest()

def sha_file(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()

class VehicleExtract(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.ways = []
        self.barriers = {}
        self.way_ids = set()
        self.relations = []

    def node(self, node):
        if not node.location.valid() or not (W <= node.location.lon <= E and S <= node.location.lat <= N):
            return
        tags = {k: v for k, v in node.tags if k in KEYS}
        if any(k in tags for k in (
            'barrier', 'access', 'vehicle', 'motor_vehicle', 'motorcar',
            'access:conditional', 'vehicle:conditional', 'motor_vehicle:conditional', 'motorcar:conditional',
        )):
            self.barriers[str(node.id)] = tags

    def way(self, way):
        if 'highway' not in way.tags or len(way.nodes) < 2 or not all(p.location.valid() for p in way.nodes):
            return
        xs = [p.lon for p in way.nodes]
        ys = [p.lat for p in way.nodes]
        if min(xs) > E or max(xs) < W or min(ys) > N or max(ys) < S:
            return
        tags = {k: v for k, v in way.tags if k in KEYS}
        if not eligibility(tags)[0] or not any(directions(tags)):
            return
        self.way_ids.add(way.id)
        self.ways.append({'id': way.id, 'tags': tags, 'nodes': [[p.ref, p.lon, p.lat] for p in way.nodes]})

    def relation(self, rel):
        if rel.tags.get('type') != 'restriction':
            return
        members = [{'type': m.type, 'ref': m.ref, 'role': m.role} for m in rel.members]
        if not any(m['type'] == 'w' and m['ref'] in self.way_ids for m in members):
            return
        self.relations.append({'id': rel.id, 'tags': dict(rel.tags), 'members': members})

def main():
    pbf_sha = sha_file(PBF)
    print('Extracting Kaohsiung vehicle network...', flush=True)
    h = VehicleExtract()
    h.apply_file(str(PBF), locations=True, idx='sparse_file_array,' + str(ROOT / '.tools/kh-locations.cache'))

    source = {
        'format': 'osm-vehicle-source-v1',
        'sourceUrl': 'https://download.geofabrik.de/asia/taiwan-latest.osm.pbf',
        'sourceSha256': pbf_sha,
        'bboxWgs84': [W, S, E, N],
        'licence': 'ODbL-1.0',
        'ways': h.ways,
        'nodeRestrictions': h.barriers,
        'turnRestrictions': h.relations,
    }
    print(f'Extracted {len(h.ways)} ways, {len(h.barriers)} barriers, {len(h.relations)} turn restrictions', flush=True)

    graph = VehicleGraph(source)
    v2_bin = encode_v2(graph)
    v3_bin = encode_v3(v2_bin)
    v3_gz = gzip.compress(v3_bin, compresslevel=6, mtime=0)
    (ROOT / '.tools/vehicle-graph-prototype-v3.bin.gz').write_bytes(v3_gz)

    meta = {
        'format': 'vehicle-graph-prototype-v1',
        'sourceSha256': pbf_sha,
        'bboxWgs84': [W, S, E, N],
        'licence': 'ODbL-1.0',
        'ways': sorted([{'id': w['id'], 'tags': w['tags']} for w in source['ways']], key=lambda x: x['id']),
        'turnRestrictions': sorted(source['turnRestrictions'], key=lambda r: r['id']),
        'viaNodesByWay': {str(k): sorted(v) for k, v in sorted(graph.via_nodes_by_way.items())},
        'limitations': [],
    }
    raw_meta = canonical(meta)
    meta_gz = gzip.compress(raw_meta, compresslevel=6, mtime=0)
    (ROOT / '.tools/vehicle-graph-prototype-v1.meta.json.gz').write_bytes(meta_gz)

    v3_sha = sha_bytes(v3_bin)
    meta_sha = sha_bytes(raw_meta)
    v2_meta = {'format': 'vehicle-graph-columnar-prototype-v2', 'binarySha256': sha_bytes(v2_bin), 'metadataSha256': meta_sha}
    identity = {'format': 'vehicle-graph-aligned-prototype-v3', 'v2Revision': sha_bytes(canonical(v2_meta)), 'binarySha256': v3_sha, 'metadataSha256': meta_sha}
    vehicle_rev = sha_bytes(canonical(identity))

    walking = json.loads((ROOT / 'src/data/kaohsiung-street-map-v2.json').read_text('utf-8'))
    walk_rev = walking['revision']
    vehicle_ids = sorted(graph.coordinates)
    pairs = joins(walking['graphNodes'], vehicle_ids)
    conn_data = {
        'format': 'vehicle-connectors-prototype-v1',
        'vehicleRevision': vehicle_rev,
        'walkingRevision': walk_rev,
        'pairs': pairs,
        'note': 'Source-node identity only.',
    }
    raw_conn = json.dumps(conn_data, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    (ROOT / '.tools/vehicle-connectors-prototype-v1.json.gz').write_bytes(gzip.compress(raw_conn, compresslevel=6, mtime=0))
    conn_sha = sha_bytes(raw_conn)

    print(json.dumps({
        'revision': vehicle_rev,
        'walkingRevision': walk_rev,
        'source': pbf_sha,
        'graph': v3_sha,
        'metadata': meta_sha,
        'connectors': conn_sha,
        'nodes': len(vehicle_ids),
        'pairs': len(pairs),
        'gzipGraphBytes': len(v3_gz),
    }, indent=2), flush=True)

if __name__ == '__main__':
    main()
