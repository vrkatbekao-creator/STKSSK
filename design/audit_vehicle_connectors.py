"""Recompute every offline candidate pair and check both graph revisions."""
import gzip
import json
from pathlib import Path
import sys
from build_vehicle_connectors import joins, sha, WALK_REVISION

ROOT = Path(__file__).resolve().parents[1]
if sys.byteorder != 'little':
    raise SystemExit('Prototype audit requires little endian')
summary = json.loads((ROOT / 'artifacts/vehicle-connectors-prototype.json').read_text('utf8'))
package = json.loads((ROOT / 'artifacts/vehicle-package-aligned.json').read_text('utf8'))
packed = (ROOT / '.tools/vehicle-connectors-prototype-v1.json.gz').read_bytes()
assert sha(packed) == summary['gzipSha256']
raw = gzip.decompress(packed)
assert sha(raw) == summary['sha256']
data = json.loads(raw)
assert data['walkingRevision'] == WALK_REVISION == summary['walkingRevision']
assert data['vehicleRevision'] == package['revision'] == summary['vehicleRevision']
vehicle = gzip.decompress((ROOT / '.tools/vehicle-graph-prototype-v3.bin.gz').read_bytes())
assert sha(vehicle) == package['binarySha256']
ids = memoryview(vehicle)[16:16 + 8 * package['nodes']].cast('Q')
walk = json.loads((ROOT / 'src/data/kaohsiung-street-map-v2.json').read_text('utf8'))
assert walk['revision'] == WALK_REVISION
assert joins(walk['graphNodes'], ids) == data['pairs']
result = {'status': 'source-node join verified; no legal stopping or route guarantee',
          'pairsCompared': len(data['pairs']), 'walkingRevision': WALK_REVISION,
          'vehicleRevision': package['revision'], 'gzipSha256': summary['gzipSha256']}
(ROOT / 'artifacts/vehicle-connectors-audit.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf8')
print(json.dumps(result), flush=True)
