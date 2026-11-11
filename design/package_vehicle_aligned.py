"""Repack audited VGP2 into aligned VGP3; experimental, not a runtime asset."""
import gzip
import json
import struct
from pathlib import Path
from package_vehicle_prototype import canonical, sha, ROOT


def align8(value):
    return (value + 7) & ~7


def encode_v3(raw):
    if len(raw) < 12:
        raise ValueError('Truncated VGP2')
    magic, n, m = struct.unpack_from('<4sII', raw)
    expected = 12 + 24 * n + 4 * (n + 1) + 20 * m
    if magic != b'VGP2' or len(raw) != expected:
        raise ValueError('Invalid VGP2 size')
    first_length = 24 * n + 4 * (n + 1) + 4 * m
    prefix = struct.pack('<4sIII', b'VGP3', n, m, 0) + raw[12:12 + first_length]
    return prefix + bytes(align8(len(prefix)) - len(prefix)) + raw[12 + first_length:]


def main():
    source = ROOT / '.tools/vehicle-graph-prototype-v2.bin.gz'
    v2 = json.loads((ROOT / 'artifacts/vehicle-package-columnar.json').read_text('utf8'))
    packed = source.read_bytes()
    if sha(packed) != v2['gzipSha256']:
        raise SystemExit('Unexpected VGP2 gzip SHA')
    raw = gzip.decompress(packed)
    if sha(raw) != v2['binarySha256']:
        raise SystemExit('Unexpected VGP2 content SHA')
    output = encode_v3(raw)
    compressed = gzip.compress(output, compresslevel=6, mtime=0)
    (ROOT / '.tools/vehicle-graph-prototype-v3.bin.gz').write_bytes(compressed)
    identity = {'format': 'vehicle-graph-aligned-prototype-v3', 'v2Revision': v2['revision'],
                'binarySha256': sha(output), 'metadataSha256': v2['metadataSha256']}
    result = {'status': 'offline prototype; not approved for gameplay', **identity,
              'revision': sha(canonical(identity)), 'nodes': v2['nodes'], 'directedEdges': v2['directedEdges'],
              'bytes': len(output), 'gzipBytes': len(compressed), 'gzipSha256': sha(compressed)}
    (ROOT / 'artifacts/vehicle-package-aligned.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf8')
    print(json.dumps(result), flush=True)


if __name__ == '__main__':
    main()
