"""Inspect vehicle graph and source-node connection candidates; not acceptance QA."""
import gzip
import heapq
import json
import math
import sys
from pathlib import Path
import numpy as np
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import connected_components
from vehicle_graph import VehicleGraph

ROOT = Path(__file__).resolve().parents[1]
with gzip.open(ROOT / '.tools/taipei-vehicle-source-v1.json.gz', 'rt', encoding='utf8') as f:
    source = json.load(f)
graph = VehicleGraph(source)
del source
node_ids = list(graph.coordinates)
node_index = {node: index for index, node in enumerate(node_ids)}
starts, ends = [], []
for node, edges in graph.adjacency.items():
    for target, _, _ in edges:
        starts.append(node_index[node])
        ends.append(node_index[target])
adjacency = csr_matrix((np.ones(len(starts), dtype=np.int8), (starts, ends)),
                       shape=(len(node_ids), len(node_ids)))
del starts, ends
_, labels = connected_components(adjacency, directed=True, connection='strong')
largest_component = int(np.bincount(labels).argmax())
main_nodes = {node for node, index in node_index.items() if labels[index] == largest_component}
del adjacency, labels, node_ids, node_index
with (ROOT / 'src/data/kaohsiung-street-map-v2.json').open(encoding='utf8') as f:
    walking = json.load(f)
anchors = dict(walking['anchors'])
by_district = {}
for district, cell in walking['districtAnchors'].items():
    district_index = walking['cells'][cell][2]
    anchor = walking['graphNodes'][anchors[cell]]
    best = None
    for x, y, cell_id, source_id in walking['graphNodes']:
        if walking['cells'][cell_id][2] != district_index or not source_id.isdecimal():
            continue
        node = int(source_id)
        if node not in main_nodes:
            continue
        candidate = (math.hypot(x - anchor[0], y - anchor[1]), node, cell_id)
        if best is None or candidate < best:
            best = candidate
    if best:
        by_district[district] = {'node': best[1], 'cell': best[2],
                                 'straightLineMetresFromDistrictAnchor': round(best[0], 1)}
walk_edges = [[] for _ in walking['graphNodes']]
walk_reverse = [[] for _ in walking['graphNodes']]
way_classes = {way[0]: way[2] for way in walking['ways']}
for start, end, distance, _way, _geometry, both in walking['graphLinks']:
    # Dry-weather walking effort includes the existing stairs multiplier.
    distance *= 1.5 if way_classes[_way] == 'steps' else 1
    walk_edges[start].append((end, distance))
    walk_reverse[end].append((start, distance))
    if both:
        walk_edges[end].append((start, distance))
        walk_reverse[start].append((end, distance))
node_indices = {}
for index, row in enumerate(walking['graphNodes']):
    if row[3].isdecimal():
        node_indices.setdefault(int(row[3]), set()).add(index)
def walk_distance(start, targets, edges):
    distances = {start: 0.0}
    heap = [(0.0, start)]
    answer = None
    while heap:
        distance, node = heapq.heappop(heap)
        if distance != distances[node]:
            continue
        if node in targets:
            answer = distance
            break
        for nxt, length in edges[node]:
            total = distance + length
            if total <= 600 and total < distances.get(nxt, math.inf):
                distances[nxt] = total
                heapq.heappush(heap, (total, nxt))
    return round(answer, 1) if answer is not None else None
for district, entry in by_district.items():
    start = anchors[walking['districtAnchors'][district]]
    targets = node_indices[entry['node']]
    entry['walkingWeightedMetresFromDistrictAnchorWithin600m'] = walk_distance(start, targets, walk_edges)
    entry['walkingWeightedMetresToDistrictAnchorWithin600m'] = walk_distance(start, targets, walk_reverse)
if '--venues' in sys.argv:
    with (ROOT / 'src/data/kaohsiung-places.json').open(encoding='utf8') as f:
        places = json.load(f)['places']
    cell_by_axial = {(cell[0], cell[1]): i for i, cell in enumerate(walking['cells'])}

    def all_walk_distances(start, edges):
        distances = {start: 0.0}
        heap = [(0.0, start)]
        while heap:
            distance, node = heapq.heappop(heap)
            if distance != distances[node]:
                continue
            for nxt, length in edges[node]:
                total = distance + length
                if total <= 600 and total < distances.get(nxt, math.inf):
                    distances[nxt] = total
                    heapq.heappush(heap, (total, nxt))
        return distances

    by_district = {}
    for district in sorted(walking['districtAnchors']):
        choices = sorted((p for p in places if p['districtId'] == district),
                         key=lambda p: (p['placeType'] != 'market', p['id']))
        if not choices:
            continue
        place = choices[0]
        axial = tuple(map(int, place['cellId'].rsplit(':', 1)[1].split(',')))
        cell = cell_by_axial[axial]
        start = anchors[cell]
        forwards = all_walk_distances(start, walk_edges)
        backwards = all_walk_distances(start, walk_reverse)
        candidates = []
        for index in forwards.keys() & backwards.keys():
            source_id = walking['graphNodes'][index][3]
            if source_id.isdecimal() and int(source_id) in main_nodes:
                candidates.append((forwards[index] + backwards[index], int(source_id), index))
        entry = {'placeId': place['id'], 'placeName': place['name']['zh-TW'],
                 'placeType': place['placeType'], 'cell': cell}
        if candidates:
            _, node, index = min(candidates)
            entry.update({'node': node, 'walkingOutWeightedMetres': forwards[index],
                          'walkingInWeightedMetres': backwards[index]})
        by_district[district] = entry
print(f'Graph: {len(graph.coordinates)} nodes, {sum(map(len, graph.adjacency.values()))} directed edges; '
      f'{len(by_district)} district candidates', flush=True)
# A single directed example verifies the search can execute on the real dataset.
items = [(district, entry) for district, entry in sorted(by_district.items()) if 'node' in entry]
example = None
if len(items) >= 2:
    a, b = items[0], items[1]
    route = graph.route(a[1]['node'], b[1]['node'], max_metres=100000)
    example = {'from': a[0], 'to': b[0], 'reachable': route is not None,
               'metres': round(route['metres']) if route else None,
               'edges': len(route['edges']) if route else None}
    if route is None:
        # Diagnostic upper bound only: never use this relaxed graph for gameplay.
        saved = graph.restrictions
        graph.restrictions = {}
        unrestricted = graph.route(a[1]['node'], b[1]['node'], max_metres=100000)
        graph.restrictions = saved
        example['diagnosticWithoutTurnRestrictions'] = {
            'reachable': unrestricted is not None,
            'metres': round(unrestricted['metres']) if unrestricted else None}
result = {'status': 'offline prototype only; not validated for runtime or district accessibility',
          'nodes': len(graph.coordinates), 'directedEdges': sum(map(len, graph.adjacency.values())),
          'largestStrongComponentIgnoringTurnRestrictions': len(main_nodes),
          'districtCandidates': by_district, 'singleExample': example,
          'limitations': ['Dry walking effort includes stairs; the 600m search limit uses weighted distance conservatively and ignores occupancy/weather/closures.',
                          'Only one directed example is tested; 132 ordered pairs remain pending.',
                          'Candidates use a strong component calculated without turn restrictions.',
                          'Conservative turn prototype can exclude legal routes and needs further audit.',
                          'District candidates are not representative venue routes.']}
if '--all' in sys.argv:
    pairs = []
    for district, entry in items:
        destinations = {v['node']: key for key, v in items if key != district}
        found = graph.distances(entry['node'], destinations)
        for node, other in destinations.items():
            pairs.append({'from': district, 'to': other, 'metres': found[node] if node in found else None})
        print(f'Completed {district}: {len(found)}/{len(destinations)} candidate routes', flush=True)
    result['candidatePairs'] = pairs
    result['limitations'][1] = ('One fixed market per district; routes use one chosen connector, not the optimal combined route.'
                                if '--venues' in sys.argv else
                                'These are candidate-node paths only; 132 representative venue routes remain pending.')
    if '--venues' in sys.argv:
        for pair in pairs:
            origin, destination = by_district[pair['from']], by_district[pair['to']]
            if pair['metres'] is not None:
                pair['dryFreshApWithVisit'] = (math.ceil(origin['walkingOutWeightedMetres'] / 200)
                    + math.ceil(pair['metres'] / 4000) + math.ceil(destination['walkingInWeightedMetres'] / 200) + 2)
        result['limitations'][4] = 'Fixed market selection and dry fresh AP do not cover all venues, weather or occupancy.'
target = 'vehicle-venue-prototype.json' if '--venues' in sys.argv else 'vehicle-graph-prototype.json'
(ROOT / 'artifacts' / target).write_text(json.dumps(result, indent=2, ensure_ascii=False) + '\n', encoding='utf8')
print(json.dumps(result), flush=True)
