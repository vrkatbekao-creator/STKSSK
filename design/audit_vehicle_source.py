"""Audit extracted topology; does not claim vehicle routes are playable."""
from collections import Counter
import gzip
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'design'))
from vehicle_policy import directions, eligibility

vehicle_path = ROOT / '.tools/taipei-vehicle-source-v1.json.gz'
walk_path = ROOT / 'design/assets/taipei-walk-source.json.gz'
with gzip.open(vehicle_path, 'rt', encoding='utf8') as f:
    vehicle = json.load(f)
with gzip.open(walk_path, 'rt', encoding='utf8') as f:
    walk = json.load(f)

ways = vehicle['ways']
assert len({w['id'] for w in ways}) == len(ways)
for way in ways:
    assert len(way['nodes']) >= 2 and eligibility(way['tags'])[0]
    assert any(directions(way['tags']))
    assert all(len(node) == 3 and -180 <= node[1] <= 180 and -90 <= node[2] <= 90 for node in way['nodes'])
way_ids = {w['id'] for w in ways}
vehicle_nodes = {node[0] for way in ways for node in way['nodes']}
walk_nodes = {node[0] for way in walk['ways'] for node in way['nodes']}
common_nodes = vehicle_nodes & walk_nodes
relations = vehicle['turnRestrictions']
assert len({r['id'] for r in relations}) == len(relations)
assert all(any(m['type'] == 'w' and m['ref'] in way_ids for m in r['members']) for r in relations)
roles = Counter(','.join(m['type'] + ':' + m['role'] for m in r['members']) for r in relations)
restriction_types = Counter(r['tags'].get('restriction', '(missing or specialized)') for r in relations)
incomplete = sum(not all(any(m['role'] == role and m['type'] in kinds for m in r['members'])
                         for role, kinds in [('from', {'w'}), ('via', {'n', 'w'}), ('to', {'w'})])
                 for r in relations)
result = {
    'status': 'source audit only; graph, turn enforcement and walk connectors not yet validated',
    'sourceSha256': vehicle['sourceSha256'],
    'vehicleExtractSha256': hashlib.sha256(vehicle_path.read_bytes()).hexdigest(),
    'bboxWgs84': vehicle['bboxWgs84'],
    'ways': len(ways), 'vehicleSourceNodes': len(vehicle_nodes),
    'sharedSourceNodesWithWalkSnapshot': len(common_nodes),
    'nodeRestrictions': len(vehicle['nodeRestrictions']), 'turnRelations': len(relations),
    'incompleteRelations': incomplete,
    'restrictionTypes': dict(restriction_types), 'memberPatterns': dict(roles),
    'note': 'Shared source IDs are candidates only, not proof of an accessible walk connector.'
}
target = ROOT / 'artifacts/vehicle-source-audit.json'
target.write_text(json.dumps(result, indent=2, ensure_ascii=False) + '\n', encoding='utf8')
print(json.dumps(result, ensure_ascii=False))
