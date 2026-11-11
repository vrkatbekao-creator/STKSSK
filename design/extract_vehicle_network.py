"""Extract vehicle source topology and restriction relations, without planarizing.

This is a source snapshot, not a playable routing graph. Turn restrictions and
walking connections must be built and validated before using it in the game.
"""
from pathlib import Path
import gzip
import hashlib
import json
import math
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.tools/map-libs'))
import osmium
from vehicle_policy import eligibility, directions

SOURCE = ROOT / '.tools/taiwan-261029.osm.pbf'
EXPECTED = 'b7ff3500b40dfbb508f59a93026a950f16f9a9efa1dec63bb278b474823d3ffe'
META = json.loads((ROOT / 'design/assets/taipei-roads-source-metadata.json').read_text('utf8'))
w, s, e, n = META['bboxWgs84']
# Conservative geographic envelope containing a 30 km buffer at Taipei latitude.
lat_pad = 30 / 110.5
lon_pad = 30 / (111.0 * math.cos(math.radians(max(abs(s), abs(n)) + lat_pad)))
w, s, e, n = w - lon_pad, s - lat_pad, e + lon_pad, n + lat_pad
KEYS = {'highway', 'name', 'ref', 'access', 'vehicle', 'motor_vehicle', 'motorcar',
        'access:conditional', 'vehicle:conditional', 'motor_vehicle:conditional',
        'motorcar:conditional', 'oneway', 'oneway:motorcar', 'oneway:motor_vehicle',
        'oneway:conditional', 'oneway:motorcar:conditional', 'oneway:motor_vehicle:conditional',
        'motorcar:oneway:conditional', 'junction', 'motorroad',
        'bridge', 'tunnel', 'layer', 'service', 'barrier', 'opening_hours'}


def sha256(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


class Extract(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.ways = []
        self.barriers = {}
        self.way_ids = set()
        self.relations = []

    def node(self, node):
        if not node.location.valid() or not (w <= node.location.lon <= e and s <= node.location.lat <= n):
            return
        tags = {k: v for k, v in node.tags if k in KEYS}
        if any(k in tags for k in ('barrier', 'access', 'vehicle', 'motor_vehicle', 'motorcar',
                                   'access:conditional', 'vehicle:conditional',
                                   'motor_vehicle:conditional', 'motorcar:conditional')):
            self.barriers[str(node.id)] = tags

    def way(self, way):
        if 'highway' not in way.tags or len(way.nodes) < 2 or not all(p.location.valid() for p in way.nodes):
            return
        xs = [p.lon for p in way.nodes]
        ys = [p.lat for p in way.nodes]
        if min(xs) > e or max(xs) < w or min(ys) > n or max(ys) < s:
            return
        tags = {k: v for k, v in way.tags if k in KEYS}
        if not eligibility(tags)[0] or not any(directions(tags)):
            return
        self.way_ids.add(way.id)
        self.ways.append({'id': way.id, 'tags': tags,
                          'nodes': [[p.ref, p.lon, p.lat] for p in way.nodes]})

    def relation(self, rel):
        if rel.tags.get('type') != 'restriction':
            return
        members = [{'type': m.type, 'ref': m.ref, 'role': m.role} for m in rel.members]
        if not any(m['type'] == 'w' and m['ref'] in self.way_ids for m in members):
            return
        # Preserve all tags, including exceptions and unsupported conditional forms.
        self.relations.append({'id': rel.id, 'tags': dict(rel.tags), 'members': members})


def main():
    digest = sha256(SOURCE)
    if digest != EXPECTED:
        raise SystemExit(f'Unexpected source SHA256: {digest}')
    h = Extract()
    h.apply_file(str(SOURCE), locations=True, idx='sparse_file_array,' + str(ROOT / '.tools/vehicle-locations.cache'))
    out = {'format': 'osm-vehicle-source-v1', 'sourceUrl': 'https://download.geofabrik.de/asia/taiwan-261029.osm.pbf',
           'sourceSha256': digest, 'bboxWgs84': [w, s, e, n], 'licence': 'ODbL-1.0',
           'ways': h.ways, 'nodeRestrictions': h.barriers, 'turnRestrictions': h.relations}
    target = ROOT / '.tools/taipei-vehicle-source-v1.json.gz'
    target.write_bytes(gzip.compress(json.dumps(out, ensure_ascii=False, separators=(',', ':')).encode(), mtime=0))
    print(json.dumps({'ways': len(h.ways), 'nodeRestrictions': len(h.barriers),
                      'turnRestrictions': len(h.relations), 'sha256': sha256(target), 'bytes': target.stat().st_size}))


if __name__ == '__main__':
    main()
