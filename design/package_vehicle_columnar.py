"""Experimental lossless columnar VGP2 package; not a runtime or save format."""
from array import array
import gzip
import json
import struct
import sys
import time
from pathlib import Path

from package_vehicle_prototype import ROOT, EXTRACT_HASH, SOURCE_HASH, canonical, metadata, sha
from vehicle_graph import VehicleGraph

FORMAT = 'vehicle-graph-columnar-prototype-v2'


def bytes_le(values):
    if sys.byteorder != 'little':
        values.byteswap()
    return values.tobytes()


def encode(graph):
    """Node IDs, coordinates, CSR offsets, and directed-edge columns, exactly."""
    nodes = sorted(graph.coordinates)
    indices = {node: index for index, node in enumerate(nodes)}
    ids = array('Q', nodes)
    lons = array('d', (graph.coordinates[node][0] for node in nodes))
    lats = array('d', (graph.coordinates[node][1] for node in nodes))
    offsets, targets, ways, distances = array('I', [0]), array('I'), array('Q'), array('d')
    if ids.itemsize != 8 or lons.itemsize != 8 or offsets.itemsize != 4:
        raise RuntimeError('Unexpected platform array layout')
    for node in nodes:
        for target, way, distance in sorted(graph.adjacency.get(node, ())):
            targets.append(indices[target]); ways.append(way); distances.append(distance)
        offsets.append(len(targets))
    columns = [ids, lons, lats, offsets, targets, ways, distances]
    return struct.pack('<4sII', b'VGP2', len(nodes), len(targets)) + b''.join(bytes_le(c) for c in columns)


def main():
    source_path = ROOT / '.tools/taipei-vehicle-source-v1.json.gz'
    source_sha = sha(source_path.read_bytes())
    if source_sha != EXTRACT_HASH:
        raise SystemExit('Unexpected vehicle extract hash')
    with gzip.open(source_path, 'rt', encoding='utf8') as f:
        source = json.load(f)
    if source['sourceSha256'] != SOURCE_HASH:
        raise SystemExit('Unexpected vehicle source hash')
    graph = VehicleGraph(source)
    started = time.perf_counter()
    binary = encode(graph)
    encoding_seconds = time.perf_counter() - started
    started = time.perf_counter()
    packed = gzip.compress(binary, compresslevel=6, mtime=0)
    compression_seconds = time.perf_counter() - started
    path = ROOT / '.tools/vehicle-graph-prototype-v2.bin.gz'
    path.write_bytes(packed)
    raw_meta = canonical(metadata(graph, source))
    identity = {'format': FORMAT, 'sourceExtractSha256': source_sha, 'binarySha256': sha(binary),
                'metadataSha256': sha(raw_meta), 'v1Revision': json.loads(
                    (ROOT / 'artifacts/vehicle-package-prototype.json').read_text('utf8'))['revision']}
    previous = json.loads((ROOT / 'artifacts/vehicle-package-prototype.json').read_text('utf8'))
    result = {'status': 'offline prototype; not published or approved for gameplay', **identity,
              'revision': sha(canonical(identity)), 'nodes': len(graph.coordinates),
              'directedEdges': sum(map(len, graph.adjacency.values())), 'bytes': len(binary),
              'gzipBytes': len(packed), 'gzipSha256': sha(packed),
              'previousGzipBytes': previous['binary']['gzipBytes'],
              'encodingSeconds': round(encoding_seconds, 3), 'compressionSeconds': round(compression_seconds, 3),
              'timingNote': 'One local Python run; not a browser or hardware compatibility benchmark.'}
    (ROOT / 'artifacts/vehicle-package-columnar.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf8')
    print(json.dumps(result), flush=True)


if __name__ == '__main__':
    main()
