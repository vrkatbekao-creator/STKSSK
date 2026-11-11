"""Source-node driving graph for offline validation, not yet a runtime asset."""
from collections import defaultdict
import heapq
import math

from vehicle_policy import directions, eligibility
from vehicle_turns import permitted


def metres(a, b):
    lon1, lat1 = map(math.radians, a)
    lon2, lat2 = map(math.radians, b)
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 12742000 * math.asin(min(1, math.sqrt(h)))


class VehicleGraph:
    def __init__(self, source):
        self.adjacency = defaultdict(list)
        self.coordinates = {}
        self.restrictions = defaultdict(list)
        barriers = source['nodeRestrictions']
        via_way_ids = {m['ref'] for relation in source['turnRestrictions'] for m in relation['members']
                       if m['role'] == 'via' and m['type'] == 'w'}
        self.via_nodes_by_way = {w['id']: {n[0] for n in w['nodes']} for w in source['ways']
                                 if w['id'] in via_way_ids}
        for relation in source['turnRestrictions']:
            members = relation['members']
            incoming = {m['ref'] for m in members if m['type'] == 'w' and m['role'] == 'from'}
            if not incoming:
                incoming = {m['ref'] for m in members if m['type'] == 'w'}
            for way_id in incoming:
                self.restrictions[way_id].append(relation)
        for way in source['ways']:
            if not eligibility(way['tags'])[0]:
                continue
            forward, backward = directions(way['tags'])
            previous = None
            for node_id, lon, lat in way['nodes']:
                if str(node_id) in barriers and not eligibility(barriers[str(node_id)], node=True)[0]:
                    previous = None
                    continue
                coord = (lon, lat)
                if node_id in self.coordinates and self.coordinates[node_id] != coord:
                    raise ValueError(f'Conflicting coordinates for node {node_id}')
                self.coordinates[node_id] = coord
                if previous is not None:
                    old_id, old_coord = previous
                    distance = metres(old_coord, coord)
                    if distance > 0:
                        if forward:
                            self.adjacency[old_id].append((node_id, way['id'], distance))
                        if backward:
                            self.adjacency[node_id].append((old_id, way['id'], distance))
                previous = (node_id, coord)

    def distances(self, start, targets, max_metres=100000):
        """Directed shortest distances to a set of nodes, subject to turn policy."""
        remaining = set(targets)
        found = {}
        if start not in self.coordinates:
            return found
        best = {(start, None): 0.0}
        heap = [(0.0, start, -1)]
        while heap and remaining:
            distance, node, incoming = heapq.heappop(heap)
            incoming = None if incoming == -1 else incoming
            if distance != best.get((node, incoming)):
                continue
            if node in remaining:
                found[node] = distance
                remaining.remove(node)
            for target, way, length in self.adjacency.get(node, ()):
                if incoming is not None and not permitted(incoming, node, way, self.restrictions.get(incoming, ()), self.via_nodes_by_way):
                    continue
                total = distance + length
                nxt = (target, way)
                if total <= max_metres and total < best.get(nxt, math.inf):
                    best[nxt] = total
                    heapq.heappush(heap, (total, target, way))
        return found

    def route(self, start, end, max_metres=100000):
        if start not in self.coordinates or end not in self.coordinates:
            return None
        initial = (start, None)
        best = {initial: 0.0}
        previous = {}
        heap = [(0.0, start, -1)]
        while heap:
            distance, node, incoming = heapq.heappop(heap)
            incoming = None if incoming == -1 else incoming
            state = (node, incoming)
            if distance != best.get(state):
                continue
            if node == end:
                edges = []
                while state != initial:
                    old, way, length = previous[state]
                    edges.append((old[0], state[0], way, length))
                    state = old
                return {'metres': distance, 'edges': list(reversed(edges))}
            for target, way, length in self.adjacency.get(node, ()):
                if incoming is not None and not permitted(incoming, node, way, self.restrictions.get(incoming, ()), self.via_nodes_by_way):
                    continue
                total = distance + length
                nxt = (target, way)
                if total <= max_metres and total < best.get(nxt, math.inf):
                    best[nxt] = total
                    previous[nxt] = (state, way, length)
                    heapq.heappush(heap, (total, target, way))
        return None
