"""Compare every packed record to the offline source graph, without enabling it."""
import gzip
import hashlib
import json
from pathlib import Path
import struct

from package_vehicle_prototype import canonical, metadata, sha, FORMAT
from vehicle_graph import VehicleGraph

ROOT = Path(__file__).resolve().parents[1]
manifest = json.loads((ROOT / 'artifacts/vehicle-package-prototype.json').read_text('utf8'))
source_path = ROOT / '.tools/taipei-vehicle-source-v1.json.gz'
with gzip.open(source_path, 'rt', encoding='utf8') as file:
    source = json.load(file)
graph = VehicleGraph(source)
nodes = sorted(graph.coordinates)
indices = {node: i for i, node in enumerate(nodes)}
binary_path = ROOT / '.tools/vehicle-graph-prototype-v1.bin.gz'
assert sha(binary_path.read_bytes()) == manifest['binary']['gzipSha256']
digest = hashlib.sha256()
with gzip.open(binary_path, 'rb') as file:
    def read(size):
        data = file.read(size)
        assert len(data) == size
        digest.update(data)
        return data
    magic, count, edges = struct.unpack('<4sII', read(12))
    assert magic == b'VGP1' and count == len(nodes)
    assert edges == sum(len(v) for v in graph.adjacency.values())
    for node in nodes:
        actual = struct.unpack('<Qdd', read(24))
        assert actual == (node, *graph.coordinates[node])
    for node in nodes:
        for target, way, distance in sorted(graph.adjacency.get(node, ())):
            actual = struct.unpack('<IIQd', read(24))
            assert actual == (indices[node], indices[target], way, distance)
    assert not file.read(1)
assert digest.hexdigest() == manifest['binary']['sha256']
meta_path = ROOT / '.tools/vehicle-graph-prototype-v1.meta.json.gz'
assert sha(meta_path.read_bytes()) == manifest['metadata']['gzipSha256']
with gzip.open(meta_path, 'rb') as file:
    raw_meta = file.read()
assert sha(raw_meta) == manifest['metadata']['sha256']
assert raw_meta == canonical(metadata(graph, source))
identity = {k: manifest[k] for k in ('format', 'sourceExtractSha256', 'binarySha256', 'metadataSha256', 'policySha256')}
assert identity['format'] == FORMAT
assert sha(source_path.read_bytes()) == identity['sourceExtractSha256']
assert sha(canonical(identity)) == manifest['revision']
for name, expected in identity['policySha256'].items():
    assert sha((ROOT / 'design' / name).read_bytes()) == expected
result = {'status': 'prototype package matches source graph; not runtime approval', 'revision': manifest['revision'],
          'nodesCompared': count, 'directedEdgesCompared': edges, 'turnRelationsCompared': len(source['turnRestrictions'])}
(ROOT / 'artifacts/vehicle-package-audit.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf8')
print(json.dumps(result), flush=True)
