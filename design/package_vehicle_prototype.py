"""Build a reproducible offline prototype package; not a shippable runtime asset.

VGP1 binary: magic + uint32 node/edge counts; sorted nodes are <Qdd> OSM ID,
longitude and latitude, followed by directed edges <IIQd> node indexes, way ID,
and unrounded source-segment metres. Turn metadata is a separate JSON object.
"""
from pathlib import Path
import gzip
import hashlib
import json
import struct

from vehicle_graph import VehicleGraph

ROOT = Path(__file__).resolve().parents[1]
FORMAT = 'vehicle-graph-prototype-v1'
SOURCE_HASH = 'b7ff3500b40dfbb508f59a93026a950f16f9a9efa1dec63bb278b474823d3ffe'
EXTRACT_HASH = '3e3db298019f7c103d26628328106638a439c4dc2bcac58959843f3c0e8e204d'


def canonical(data):
    return json.dumps(data, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode('utf8')


def sha(data):
    return hashlib.sha256(data).hexdigest()


def write_binary(graph, stream):
    """Write deterministic geometry and topology, returning hash of raw bytes."""
    nodes = sorted(graph.coordinates)
    indices = {node: i for i, node in enumerate(nodes)}
    edge_count = sum(len(edges) for edges in graph.adjacency.values())
    digest = hashlib.sha256()
    size = 0

    def emit(data):
        nonlocal size
        digest.update(data)
        stream.write(data)
        size += len(data)

    emit(struct.pack('<4sII', b'VGP1', len(nodes), edge_count))
    for node in nodes:
        lon, lat = graph.coordinates[node]
        emit(struct.pack('<Qdd', node, lon, lat))
    for node in nodes:
        for target, way, distance in sorted(graph.adjacency.get(node, ())):
            emit(struct.pack('<IIQd', indices[node], indices[target], way, distance))
    return {'sha256': digest.hexdigest(), 'bytes': size, 'nodes': len(nodes), 'directedEdges': edge_count}


def metadata(graph, source):
    return {'format': FORMAT, 'sourceSha256': source['sourceSha256'], 'bboxWgs84': source['bboxWgs84'],
            'licence': source['licence'],
            'ways': sorted([{'id': way['id'], 'tags': way['tags']} for way in source['ways']], key=lambda x: x['id']),
            'turnRestrictions': sorted(source['turnRestrictions'], key=lambda r: r['id']),
            'viaNodesByWay': {str(k): sorted(v) for k, v in sorted(graph.via_nodes_by_way.items())},
            'limitations': ['Offline prototype only, not approved for gameplay.',
                            'Via-way and malformed turn restrictions are conservatively approximated.',
                            'No runtime connectors, occupied-cell rules, or district/sector coverage are included.']}


def main():
    source_path = ROOT / '.tools/taipei-vehicle-source-v1.json.gz'
    source_extract_sha = sha(source_path.read_bytes())
    if source_extract_sha != EXTRACT_HASH:
        raise SystemExit('Unexpected vehicle extract hash')
    with gzip.open(source_path, 'rt', encoding='utf8') as f:
        source = json.load(f)
    if source['sourceSha256'] != SOURCE_HASH:
        raise SystemExit('Unexpected vehicle source hash')
    graph = VehicleGraph(source)
    path = ROOT / '.tools/vehicle-graph-prototype-v1.bin.gz'
    with path.open('wb') as file:
        with gzip.GzipFile(filename='', mode='wb', fileobj=file, mtime=0, compresslevel=6) as compressed:
            binary = write_binary(graph, compressed)
    binary['gzipSha256'] = sha(path.read_bytes())
    binary['gzipBytes'] = path.stat().st_size
    raw_meta = canonical(metadata(graph, source))
    meta_path = ROOT / '.tools/vehicle-graph-prototype-v1.meta.json.gz'
    meta_path.write_bytes(gzip.compress(raw_meta, compresslevel=6, mtime=0))
    meta = {'sha256': sha(raw_meta), 'bytes': len(raw_meta), 'gzipSha256': sha(meta_path.read_bytes()),
            'gzipBytes': meta_path.stat().st_size}
    # Policy changes must alter the revision even when a small fixture produces the same graph.
    policy = {name: sha((ROOT / 'design' / name).read_bytes())
              for name in ['vehicle_policy.py', 'vehicle_graph.py', 'vehicle_turns.py']}
    identity = {'format': FORMAT, 'sourceExtractSha256': source_extract_sha, 'binarySha256': binary['sha256'],
                'metadataSha256': meta['sha256'], 'policySha256': policy}
    result = {'status': 'offline prototype; not published or approved for gameplay', **identity,
              'revision': sha(canonical(identity)), 'binary': binary, 'metadata': meta}
    (ROOT / 'artifacts/vehicle-package-prototype.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf8')
    print(json.dumps(result), flush=True)


if __name__ == '__main__':
    main()
