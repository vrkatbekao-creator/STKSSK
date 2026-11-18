"""Join frozen walking and vehicle graphs by OSM source node ID only.

Output is an offline candidate index. It does not claim parking legality or
that a particular player can reach a candidate while avoiding occupied cells.
"""
from pathlib import Path
import gzip
import hashlib
import json
import struct
import sys

ROOT = Path(__file__).resolve().parents[1]
WALK_REVISION = '324e9a8435d22e7d1876af469e16e7c23ae0d2e9eb06116f1810e34b7106477f'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def joins(walk_nodes, vehicle_ids):
    """Return sorted unique walking-index / vehicle-index source-node matches."""
    lookup = {node: index for index, node in enumerate(vehicle_ids)}
    pairs = []
    for index, node in enumerate(walk_nodes):
        source = node[3]
        if isinstance(source, str) and source.isdecimal():
            target = lookup.get(int(source))
            if target is not None:
                pairs.append([index, target])
    return pairs


def main():
    if sys.byteorder != 'little':
        raise SystemExit('Prototype requires little-endian machine')
    package = json.loads((ROOT / 'artifacts/vehicle-package-aligned.json').read_text('utf8'))
    compressed = (ROOT / '.tools/vehicle-graph-prototype-v3.bin.gz').read_bytes()
    if sha(compressed) != package['gzipSha256']:
        raise SystemExit('Vehicle package gzip hash mismatch')
    binary = gzip.decompress(compressed)
    if sha(binary) != package['binarySha256'] or len(binary) < 16:
        raise SystemExit('Vehicle package hash mismatch')
    magic, n, m, reserved = struct.unpack_from('<4sIII', binary)
    if magic != b'VGP3' or reserved or n != package['nodes'] or m != package['directedEdges']:
        raise SystemExit('Vehicle package header mismatch')
    ids = memoryview(binary)[16:16+8*n].cast('Q')
    if len(ids) != n or any(ids[i] >= ids[i+1] for i in range(n-1)):
        raise SystemExit('Vehicle source IDs invalid')
    walking = json.loads((ROOT / 'src/data/kaohsiung-street-map-v2.json').read_text('utf8'))
    walk_revision = walking['revision']
    if walk_revision != WALK_REVISION:
        raise SystemExit('Unexpected walking graph revision')
    pairs = joins(walking['graphNodes'], ids)
    data = {'format': 'vehicle-connectors-prototype-v1', 'vehicleRevision': package['revision'],
            'walkingRevision': walk_revision, 'pairs': pairs,
            'note': 'Source-node identity only; accessibility, occupancy and legal stopping are not certified.'}
    raw = json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode('utf8')
    target = ROOT / '.tools/vehicle-connectors-prototype-v1.json.gz'
    target.write_bytes(gzip.compress(raw, compresslevel=6, mtime=0))
    result = {'status': 'offline connector candidates; not yet used by game', 'vehicleRevision': package['revision'],
              'walkingRevision': walk_revision, 'pairs': len(pairs), 'walkingNodes': len(walking['graphNodes']),
              'sha256': sha(raw), 'gzipSha256': sha(target.read_bytes()), 'gzipBytes': target.stat().st_size}
    (ROOT / 'artifacts/vehicle-connectors-prototype.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf8')
    print(json.dumps(result), flush=True)


if __name__ == '__main__':
    main()
