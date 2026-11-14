use std::cmp::Ordering;
use std::collections::{BinaryHeap, HashSet};

pub const NO_NODE: u32 = u32::MAX;
const METRES_PER_AP: f64 = 1500.0;
const EPSILON: f64 = 0.000001;

struct Cursor<'a> {
    data: &'a [u8],
    offset: usize,
}

impl<'a> Cursor<'a> {
    fn take(&mut self, count: usize, width: usize) -> Option<&'a [u8]> {
        let start = self.offset.checked_add(width - 1)? & !(width - 1);
        let end = start.checked_add(count.checked_mul(width)?)?;
        let slice = self.data.get(start..end)?;
        self.offset = end;
        Some(slice)
    }

    fn finished(&self) -> bool {
        self.offset == self.data.len()
    }
}

fn word(bytes: &[u8], index: usize) -> u32 {
    let start = index * 4;
    u32::from_le_bytes(bytes[start..start + 4].try_into().unwrap())
}

fn double(bytes: &[u8], index: usize) -> f64 {
    let start = index * 8;
    f64::from_le_bytes(bytes[start..start + 8].try_into().unwrap())
}

#[derive(Clone, Copy)]
struct Edge {
    from: u32,
    to: u32,
    metres: f64,
    stairs: bool,
}

pub struct Graph {
    coordinates: Vec<[f64; 2]>,
    node_cells: Vec<u32>,
    anchors: Vec<u32>,
    districts: Vec<u32>,
    edges: Vec<Edge>,
    adjacency: Vec<u32>,
    offsets: Vec<usize>,
    heuristic_scale: f64,
}

pub struct SearchResult {
    pub values: Vec<u32>,
    pub effort: f64,
}

#[derive(Clone, Copy)]
struct QueueEntry {
    priority: f64,
    effort: f64,
    node: u32,
}

impl Ord for QueueEntry {
    fn cmp(&self, other: &Self) -> Ordering {
        other
            .priority
            .total_cmp(&self.priority)
            .then_with(|| other.effort.total_cmp(&self.effort))
            .then_with(|| other.node.cmp(&self.node))
    }
}
impl PartialOrd for QueueEntry {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}
impl PartialEq for QueueEntry {
    fn eq(&self, other: &Self) -> bool {
        self.cmp(other) == Ordering::Equal
    }
}
impl Eq for QueueEntry {}

fn separation(a: [f64; 2], b: [f64; 2]) -> f64 {
    let x = a[0] - b[0];
    let y = a[1] - b[1];
    (x * x + y * y).sqrt()
}

fn initialise_edges(nodes: usize, edges: &[Edge]) -> (Vec<u32>, Vec<usize>) {
    let mut offsets = vec![0; nodes + 1];
    for edge in edges {
        offsets[edge.from as usize + 1] += 1;
    }
    for node in 0..nodes {
        offsets[node + 1] += offsets[node];
    }
    let mut positions = offsets.clone();
    let mut adjacency = vec![0; edges.len()];
    for (id, edge) in edges.iter().enumerate() {
        let position = &mut positions[edge.from as usize];
        adjacency[*position] = id as u32;
        *position += 1;
    }
    (adjacency, offsets)
}

impl Graph {
    pub fn parse(str1: &[u8], metadata: &[u8]) -> Option<Self> {
        let mut core = Cursor {
            data: str1,
            offset: 0,
        };
        let header = core.take(4, 4)?;
        if &header[..4] != b"STR1" {
            return None;
        }
        let nodes = word(header, 1) as usize;
        let links = word(header, 2) as usize;
        let points = word(header, 3) as usize;
        if nodes == 0 || nodes > 1_000_000 || links > 2_000_000 || points > 16_000_000 {
            return None;
        }
        let xy = core.take(nodes * 2, 8)?;
        let cells = core.take(nodes, 4)?;
        let references = core.take(links * 3, 4)?;
        let metres = core.take(links, 8)?;
        let directions = core.take(links, 1)?;
        let geometry_offsets = core.take(links + 1, 4)?;
        let geometry = core.take(points, 8)?;
        if !core.finished()
            || word(geometry_offsets, 0) != 0
            || word(geometry_offsets, links) as usize != points
            || geometry
                .chunks_exact(8)
                .any(|bytes| !double(bytes, 0).is_finite())
        {
            return None;
        }

        let mut meta = Cursor {
            data: metadata,
            offset: 0,
        };
        let meta_header = meta.take(3, 4)?;
        if &meta_header[..4] != b"RMD1" {
            return None;
        }
        let cell_count = word(meta_header, 1) as usize;
        let stairs_count = word(meta_header, 2) as usize;
        if cell_count == 0 || cell_count > 100_000 || stairs_count > links {
            return None;
        }
        let districts: Vec<_> = meta
            .take(cell_count, 4)?
            .chunks_exact(4)
            .map(|b| word(b, 0))
            .collect();
        let anchors: Vec<_> = meta
            .take(cell_count, 4)?
            .chunks_exact(4)
            .map(|b| word(b, 0))
            .collect();
        let stairs: HashSet<_> = meta
            .take(stairs_count, 4)?
            .chunks_exact(4)
            .map(|b| word(b, 0))
            .collect();
        if !meta.finished() || districts.iter().any(|district| *district >= 12) {
            return None;
        }
        let mut coordinates = Vec::with_capacity(nodes);
        let mut node_cells = Vec::with_capacity(nodes);
        for node in 0..nodes {
            let point = [double(xy, node * 2), double(xy, node * 2 + 1)];
            let cell = word(cells, node);
            if point
                .iter()
                .any(|value| !value.is_finite() || value.abs() > 1e7)
                || cell as usize >= cell_count
            {
                return None;
            }
            coordinates.push(point);
            node_cells.push(cell);
        }
        for (cell, &node) in anchors.iter().enumerate() {
            if node != NO_NODE && node_cells.get(node as usize) != Some(&(cell as u32)) {
                return None;
            }
        }

        let mut edges = Vec::with_capacity(links * 2);
        let mut heuristic_scale: f64 = 1.0;
        for link in 0..links {
            let from = word(references, link * 3);
            let to = word(references, link * 3 + 1);
            let distance = double(metres, link);
            let both = directions[link];
            let span =
                word(geometry_offsets, link + 1).checked_sub(word(geometry_offsets, link))?;
            if !distance.is_finite() || distance <= 0.0 || both > 1 || span < 4 || span % 2 != 0 {
                return None;
            }
            let chord = separation(
                *coordinates.get(from as usize)?,
                *coordinates.get(to as usize)?,
            );
            if chord > 0.0 {
                heuristic_scale = heuristic_scale.min(distance / chord);
            }
            let edge = Edge {
                from,
                to,
                metres: distance,
                stairs: stairs.contains(&word(references, link * 3 + 2)),
            };
            edges.push(edge);
            if both == 1 {
                edges.push(Edge {
                    from: to,
                    to: from,
                    ..edge
                });
            }
        }
        let (adjacency, offsets) = initialise_edges(nodes, &edges);
        Some(Self {
            coordinates,
            node_cells,
            anchors,
            districts,
            edges,
            adjacency,
            offsets,
            heuristic_scale: heuristic_scale * (1.0 - 1e-10),
        })
    }

    pub fn cell_count(&self) -> usize {
        self.anchors.len()
    }

    pub fn search(
        &self,
        start: u32,
        target: Option<u32>,
        budget: f64,
        rain: bool,
        works: u32,
        blocked: &[bool],
        astar: bool,
    ) -> Option<SearchResult> {
        self.run_search(start, target, budget, rain, works, blocked, astar, false)
    }

    pub fn search_tree(
        &self,
        start: u32,
        budget: f64,
        rain: bool,
        works: u32,
        blocked: &[bool],
    ) -> Option<SearchResult> {
        self.run_search(start, None, budget, rain, works, blocked, false, true)
    }

    fn run_search(
        &self,
        start: u32,
        target: Option<u32>,
        budget: f64,
        rain: bool,
        works: u32,
        blocked: &[bool],
        astar: bool,
        tree: bool,
    ) -> Option<SearchResult> {
        let nodes = self.coordinates.len();
        if start as usize >= nodes
            || !budget.is_finite()
            || budget < 0.0
            || target.is_some_and(|node| node as usize >= nodes)
            || (works != NO_NODE && works >= 12)
            || blocked.len() != self.cell_count()
        {
            return None;
        }
        let heuristic = |node: u32| {
            target.filter(|_| astar).map_or(0.0, |destination| {
                self.heuristic_scale
                    * separation(
                        self.coordinates[node as usize],
                        self.coordinates[destination as usize],
                    )
            })
        };
        let limit = budget * METRES_PER_AP + EPSILON;
        let mut distance = vec![f64::INFINITY; nodes];
        let mut previous = vec![NO_NODE; nodes];
        let mut queue = BinaryHeap::new();
        let mut values = if tree { vec![0] } else { Vec::new() };
        distance[start as usize] = 0.0;
        queue.push(QueueEntry {
            priority: heuristic(start),
            effort: 0.0,
            node: start,
        });
        while let Some(QueueEntry { node, effort, .. }) = queue.pop() {
            let index = node as usize;
            if effort != distance[index] {
                continue;
            }
            if target == Some(node) {
                let mut cursor = node;
                while cursor != start {
                    let id = previous[cursor as usize];
                    values.push(id);
                    cursor = self.edges[id as usize].from;
                }
                values.reverse();
                return Some(SearchResult { values, effort });
            }
            let cell = self.node_cells[index] as usize;
            if target.is_none() && self.anchors[cell] == node {
                values.extend([cell as u32, action_points(effort)]);
            }
            for &id in &self.adjacency[self.offsets[index]..self.offsets[index + 1]] {
                let edge = self.edges[id as usize];
                let to = edge.to as usize;
                let destination = self.node_cells[to] as usize;
                if blocked[cell] || blocked[destination] {
                    continue;
                }
                let factor = 1.0
                    + if edge.stairs { 0.5 } else { 0.0 }
                    + if rain { 0.25 } else { 0.0 }
                    + if self.districts[destination] == works {
                        0.5
                    } else {
                        0.0
                    };
                let next = effort + edge.metres * factor;
                if next > limit || next >= distance[to] {
                    continue;
                }
                distance[to] = next;
                previous[to] = id;
                queue.push(QueueEntry {
                    priority: next + heuristic(edge.to),
                    effort: next,
                    node: edge.to,
                });
            }
        }
        if tree {
            values[0] = ((values.len() - 1) / 2) as u32;
            for (node, effort) in distance.into_iter().enumerate() {
                if effort.is_finite() {
                    let bits = effort.to_bits();
                    values.extend([
                        node as u32,
                        previous[node],
                        bits as u32,
                        (bits >> 32) as u32,
                    ]);
                }
            }
        }
        target.is_none().then_some(SearchResult {
            values,
            effort: 0.0,
        })
    }
}

pub fn action_points(effort: f64) -> u32 {
    if effort == 0.0 {
        0
    } else {
        ((effort - EPSILON) / METRES_PER_AP).ceil().max(1.0) as u32
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn one_way_graph() -> Graph {
        let edges = vec![
            Edge {
                from: 0,
                to: 1,
                metres: 600.0,
                stairs: true,
            },
            Edge {
                from: 1,
                to: 2,
                metres: 600.0,
                stairs: false,
            },
            Edge {
                from: 0,
                to: 2,
                metres: 1900.0,
                stairs: false,
            },
        ];
        let (adjacency, offsets) = initialise_edges(3, &edges);
        Graph {
            coordinates: vec![[0.0, 0.0], [600.0, 0.0], [1200.0, 0.0]],
            node_cells: vec![0, 1, 2],
            anchors: vec![0, 1, 2],
            districts: vec![0, 1, 0],
            edges,
            adjacency,
            offsets,
            heuristic_scale: 1.0,
        }
    }

    #[test]
    fn respects_direction_occupancy_and_ap_boundary() {
        let graph = one_way_graph();
        let open = [false; 3];
        for astar in [false, true] {
            let route = graph
                .search(0, Some(2), 1.0, false, NO_NODE, &open, astar)
                .unwrap();
            assert_eq!(route.values, [0, 1]);
            assert_eq!(action_points(route.effort), 1);
            assert!(graph
                .search(2, Some(0), 2.0, false, NO_NODE, &open, astar)
                .is_none());
            assert!(graph
                .search(
                    0,
                    Some(2),
                    1.0,
                    false,
                    NO_NODE,
                    &[false, true, false],
                    astar
                )
                .is_none());
            let detour = graph
                .search(
                    0,
                    Some(2),
                    2.0,
                    false,
                    NO_NODE,
                    &[false, true, false],
                    astar,
                )
                .unwrap();
            assert_eq!(detour.values, [2]);
        }
    }

    #[test]
    fn reachable_cost_includes_rain_stairs_and_destination_district() {
        let graph = one_way_graph();
        let reach = graph
            .search(0, None, 2.0, true, 1, &[false; 3], false)
            .unwrap();
        assert_eq!(reach.values, [0, 0, 1, 1, 2, 2]);
        let route = graph
            .search(0, Some(2), 2.0, true, 1, &[false; 3], true)
            .unwrap();
        assert_eq!(route.effort, 2100.0);
    }
}
