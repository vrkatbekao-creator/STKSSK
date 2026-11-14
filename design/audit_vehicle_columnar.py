"""Lossless VGP2 record-by-record audit against the source graph."""
import gzip
import json
from pathlib import Path
import struct
import sys
import time

from package_vehicle_prototype import canonical, metadata, sha
from vehicle_graph import VehicleGraph

ROOT = Path(__file__).resolve().parents[1]
manifest = json.loads((ROOT / 'artifacts/vehicle-package-columnar.json').read_text('utf8'))
packed = (ROOT / '.tools/vehicle-graph-prototype-v2.bin.gz').read_bytes()
assert sha(packed) == manifest['gzipSha256']
start = time.perf_counter()
raw = gzip.decompress(packed)
decompress_seconds = time.perf_counter() - start
assert sha(raw) == manifest['binarySha256']
magic, n, m = struct.unpack_from('<4sII', raw)
assert magic == b'VGP2' and n == manifest['nodes'] and m == manifest['directedEdges']
assert len(raw) == 12 + 24 * n + 4 * (n + 1) + 20 * m
if sys.byteorder != 'little':
    raise RuntimeError('Prototype audit requires little-endian host')
view = memoryview(raw)
cursor = 12
def column(count, kind, width):
    global cursor
    end = cursor + count * width
    result = view[cursor:end].cast(kind)
    cursor = end
    return result
ids = column(n, 'Q', 8)
lons = column(n, 'd', 8)
lats = column(n, 'd', 8)
offsets = column(n + 1, 'I', 4)
targets = column(m, 'I', 4)
ways = column(m, 'Q', 8)
distances = column(m, 'd', 8)
assert cursor == len(raw) and offsets[0] == 0 and offsets[-1] == m
assert all(a <= b for a, b in zip(offsets, offsets[1:]))
assert all(target < n for target in targets)
source_path = ROOT / '.tools/taipei-vehicle-source-v1.json.gz'
assert sha(source_path.read_bytes()) == manifest['sourceExtractSha256']
with gzip.open(source_path, 'rt', encoding='utf8') as file:
    source = json.load(file)
graph = VehicleGraph(source)
nodes = sorted(graph.coordinates)
indices = {node: i for i, node in enumerate(nodes)}
assert len(nodes) == n
for index, node in enumerate(nodes):
    assert ids[index] == node and (lons[index], lats[index]) == graph.coordinates[node]
    edges = sorted(graph.adjacency.get(node, ()))
    assert offsets[index + 1] - offsets[index] == len(edges)
    for edge_index, (target, way, metres) in enumerate(edges, offsets[index]):
        assert (targets[edge_index], ways[edge_index], distances[edge_index]) == (indices[target], way, metres)
assert sha(canonical(metadata(graph, source))) == manifest['metadataSha256']
identity = {key: manifest[key] for key in ('format', 'sourceExtractSha256', 'binarySha256', 'metadataSha256', 'v1Revision')}
assert sha(canonical(identity)) == manifest['revision']
result = {'status': 'lossless offline audit only; not runtime approval', 'revision': manifest['revision'],
          'nodesCompared': n, 'directedEdgesCompared': m, 'turnRelationsCompared': len(source['turnRestrictions']),
          'gzipDecompressSeconds': round(decompress_seconds, 3),
          'note': 'Local Python decompression only; no browser load or memory benchmark.'}
(ROOT / 'artifacts/vehicle-package-columnar-audit.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf8')
print(json.dumps(result), flush=True)
