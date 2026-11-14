#[cfg(target_arch = "wasm32")]
use std::cell::RefCell;
use std::cmp::Reverse;
use std::collections::{BinaryHeap, HashMap};

#[cfg(target_arch = "wasm32")]
#[link(wasm_import_module = "env")]
extern "C" {
    fn vehicle_weight(edge: u32) -> u32;
    fn vehicle_turn(node: u32, incoming: u32, outgoing: u32) -> u32;
}

struct Graph {
    offsets: Vec<u32>,
    targets: Vec<u32>,
    ways: Vec<u64>,
    distances: Vec<u32>,
    points: Vec<[f64; 3]>,
}

#[cfg(target_arch = "wasm32")]
fn read_u32(bytes: &[u8], at: usize) -> Option<u32> {
    Some(u32::from_le_bytes(bytes.get(at..at + 4)?.try_into().ok()?))
}

#[cfg(target_arch = "wasm32")]
fn read_u64(bytes: &[u8], at: usize) -> Option<u64> {
    Some(u64::from_le_bytes(bytes.get(at..at + 8)?.try_into().ok()?))
}

#[cfg(target_arch = "wasm32")]
impl Graph {
    fn parse(bytes: &[u8]) -> Option<Self> {
        if read_u32(bytes, 0)? != 0x33504756 || read_u32(bytes, 12)? != 0 {
            return None;
        }
        let n = read_u32(bytes, 4)? as usize;
        let m = read_u32(bytes, 8)? as usize;
        if n == 0 || n > 2_000_000 || m > 5_000_000 {
            return None;
        }
        let lon = 16 + 8 * n;
        let lat = lon + 8 * n;
        let off = lat + 8 * n;
        let target = off + 4 * (n + 1);
        let way = (target + 4 * m + 7) & !7;
        let metres = way + 8 * m;
        if bytes.len() != metres + 8 * m {
            return None;
        }
        let offsets: Vec<u32> = (0..=n)
            .map(|i| read_u32(bytes, off + 4 * i).unwrap())
            .collect();
        if offsets[0] != 0 || offsets[n] as usize != m || offsets.windows(2).any(|p| p[0] > p[1]) {
            return None;
        }
        let mut points = Vec::with_capacity(n);
        for i in 0..n {
            let x = f64::from_bits(read_u64(bytes, lon + 8 * i)?);
            let y = f64::from_bits(read_u64(bytes, lat + 8 * i)?);
            if !(x.abs() <= 180.0 && y.abs() <= 90.0) {
                return None;
            }
            let (x, y) = (x.to_radians(), y.to_radians());
            let c = y.cos() * 6_371_000.0;
            points.push([c * x.cos(), c * x.sin(), 6_371_000.0 * y.sin()]);
        }
        let mut targets = Vec::with_capacity(m);
        let mut ways = Vec::with_capacity(m);
        let mut distances = Vec::with_capacity(m);
        for i in 0..m {
            let to = read_u32(bytes, target + 4 * i)?;
            let d = f64::from_bits(read_u64(bytes, metres + 8 * i)?);
            let quarters = (d * 4.0).round();
            if to as usize >= n || !(d > 0.0 && quarters <= f64::from(u32::MAX)) {
                return None;
            }
            targets.push(to);
            ways.push(read_u64(bytes, way + 8 * i)?);
            distances.push(quarters.max(1.0) as u32);
        }
        Some(Self {
            offsets,
            targets,
            ways,
            distances,
            points,
        })
    }
}

#[derive(Clone, Copy)]
struct Stop {
    node: u32,
    ap: u32,
    metres: f64,
}

#[derive(Clone, Copy)]
struct Label {
    node: u32,
    origin: usize,
    actual: u64,
    weighted: u64,
    previous: Option<(usize, u32)>,
}

struct Budget {
    ap: u64,
    supplies: u64,
    previous_weighted: u64,
    previous_actual: u64,
    per_ap: u64,
    per_supply: u64,
}

fn allowance(previous: u64, added: u64, divisor: u64) -> u64 {
    (previous + added).div_ceil(divisor) - previous.div_ceil(divisor)
}

fn chord(a: [f64; 3], b: [f64; 3]) -> f64 {
    ((a[0] - b[0]).powi(2) + (a[1] - b[1]).powi(2) + (a[2] - b[2]).powi(2)).sqrt()
}

struct Search<'a> {
    graph: &'a Graph,
    origins: &'a [Stop],
    labels: Vec<Label>,
    frontier: HashMap<(u32, Option<u64>), Vec<usize>>,
    queue: BinaryHeap<Reverse<(u64, usize)>>,
    estimates: Vec<Option<u32>>,
    center: [f64; 3],
    radius: f64,
    per_ap: u64,
}

impl Search<'_> {
    fn key(&self, label: Label) -> (u32, Option<u64>) {
        (
            label.node,
            label
                .previous
                .map(|(_, edge)| self.graph.ways[edge as usize]),
        )
    }

    fn estimate(&mut self, node: u32) -> u64 {
        u64::from(*self.estimates[node as usize].get_or_insert_with(|| {
            let metres =
                (chord(self.graph.points[node as usize], self.center) - self.radius - 1.0).max(0.0);
            // Keep the same conservative lower bound for per-edge quarter-metre rounding.
            (metres * 2.6).floor() as u32
        }))
    }

    fn insert(&mut self, label: Label) {
        let key = self.key(label);
        let dominates = |a: Label, b: Label| {
            let (a_stop, b_stop) = (self.origins[a.origin], self.origins[b.origin]);
            a_stop.ap <= b_stop.ap
                && a_stop.metres <= b_stop.metres
                && a.actual <= b.actual
                && a.weighted <= b.weighted
        };
        let entries = self.frontier.entry(key).or_default();
        if entries.iter().any(|&i| dominates(self.labels[i], label)) {
            return;
        }
        entries.retain(|&i| !dominates(label, self.labels[i]));
        let id = self.labels.len();
        self.labels.push(label);
        entries.push(id);
        let priority = label.weighted
            + u64::from(self.origins[label.origin].ap) * self.per_ap
            + self.estimate(label.node);
        self.queue.push(Reverse((priority, id)));
    }
}

fn plan(
    graph: &Graph,
    origins: &[Stop],
    destinations: &[Stop],
    budget: Budget,
    weight: impl Fn(u32) -> u32,
    turn: impl Fn(u32, u32, u32) -> bool,
) -> Option<Vec<u32>> {
    if origins.is_empty() || destinations.is_empty() {
        return None;
    }
    let mut targets = HashMap::<u32, Vec<usize>>::new();
    let mut center = [0.0; 3];
    for (i, stop) in destinations.iter().enumerate() {
        if !targets.contains_key(&stop.node) {
            for (total, coord) in center.iter_mut().zip(graph.points[stop.node as usize]) {
                *total += coord;
            }
        }
        targets.entry(stop.node).or_default().push(i);
    }
    for coord in &mut center {
        *coord /= targets.len() as f64;
    }
    let radius = targets
        .keys()
        .map(|&i| chord(center, graph.points[i as usize]))
        .fold(0.0, f64::max);
    let min_alight = destinations
        .iter()
        .map(|stop| stop.metres)
        .fold(f64::INFINITY, f64::min);
    let mut search = Search {
        graph,
        origins,
        labels: Vec::new(),
        frontier: HashMap::new(),
        queue: BinaryHeap::new(),
        estimates: vec![None; graph.points.len()],
        center,
        radius,
        per_ap: budget.per_ap,
    };
    for (origin, stop) in origins.iter().enumerate() {
        if u64::from(stop.ap) <= budget.ap {
            search.insert(Label {
                node: stop.node,
                origin,
                actual: 0,
                weighted: 0,
                previous: None,
            });
        }
    }
    let mut best_ap = budget.ap;
    let mut best_distance = f64::INFINITY;
    let mut best = None;
    while let Some(Reverse((_, id))) = search.queue.pop() {
        let label = search.labels[id];
        if !search.frontier[&search.key(label)].contains(&id) {
            continue;
        }
        let origin = origins[label.origin];
        let estimate = search.estimate(label.node);
        let lower = u64::from(origin.ap)
            + allowance(
                budget.previous_weighted,
                label.weighted + estimate,
                budget.per_ap,
            );
        if lower > best_ap {
            break;
        }
        if lower == best_ap
            && origin.metres + (label.actual + estimate) as f64 / 4.0 + min_alight > best_distance
        {
            continue;
        }
        if label.previous.is_some() {
            for &i in targets.get(&label.node).into_iter().flatten() {
                let dest = destinations[i];
                let ap = u64::from(origin.ap)
                    + u64::from(dest.ap)
                    + allowance(budget.previous_weighted, label.weighted, budget.per_ap);
                let distance = origin.metres + dest.metres + label.actual as f64 / 4.0;
                if ap < best_ap || (ap == best_ap && distance < best_distance) {
                    best = Some((id, i));
                    best_ap = ap;
                    best_distance = distance;
                }
            }
        }
        let node = label.node as usize;
        for edge in graph.offsets[node]..graph.offsets[node + 1] {
            if label
                .previous
                .is_some_and(|(_, incoming)| !turn(label.node, incoming, edge))
            {
                continue;
            }
            let quarters = weight(edge);
            if !(4..=7).contains(&quarters) {
                return None;
            }
            let d = u64::from(graph.distances[edge as usize]);
            let actual = label.actual + d;
            let weighted = label.weighted + (d * u64::from(quarters)).div_ceil(4);
            let ap =
                u64::from(origin.ap) + allowance(budget.previous_weighted, weighted, budget.per_ap);
            if ap > best_ap
                || allowance(budget.previous_actual, actual, budget.per_supply) > budget.supplies
            {
                continue;
            }
            search.insert(Label {
                node: graph.targets[edge as usize],
                origin: label.origin,
                actual,
                weighted,
                previous: Some((id, edge)),
            });
        }
    }
    let (mut id, destination) = best?;
    let origin = search.labels[id].origin;
    let mut output = Vec::new();
    while let Some((previous, edge)) = search.labels[id].previous {
        output.push(edge);
        id = previous;
    }
    output.push(destination as u32);
    output.push(origin as u32);
    output.reverse();
    Some(output)
}

#[cfg(target_arch = "wasm32")]
thread_local! {
    static GRAPH: RefCell<Option<Graph>> = const { RefCell::new(None) };
}

#[cfg(target_arch = "wasm32")]
#[no_mangle]
pub extern "C" fn vehicle_init() -> u32 {
    crate::RUNTIME.with_borrow_mut(|runtime| {
        let graph = Graph::parse(&std::mem::take(&mut runtime.input));
        let ok = graph.is_some();
        GRAPH.with_borrow_mut(|stored| *stored = graph);
        u32::from(ok)
    })
}

#[cfg(target_arch = "wasm32")]
#[no_mangle]
pub extern "C" fn vehicle_query(
    origins: u32,
    destinations: u32,
    ap: u32,
    supplies: u32,
    previous_weighted: u64,
    previous_actual: u64,
    per_ap: u32,
    per_supply: u32,
) -> u32 {
    crate::RUNTIME.with_borrow_mut(|runtime| {
        GRAPH.with_borrow(|stored| {
            runtime.output.clear();
            let Some(graph) = stored.as_ref() else {
                return 0;
            };
            let input = &runtime.input;
            let count = origins as usize + destinations as usize;
            if count > 100_000
                || input.len() != count * 16
                || per_ap == 0
                || per_supply == 0
                || previous_weighted > (1 << 53)
                || previous_actual > (1 << 53)
            {
                return 0;
            }
            let mut stops = Vec::with_capacity(count);
            for i in 0..count {
                let at = i * 16;
                let node = read_u32(input, at).unwrap();
                let ap = read_u32(input, at + 4).unwrap();
                let metres = f64::from_bits(read_u64(input, at + 8).unwrap());
                if node as usize >= graph.points.len() || !(0.0..=600.0).contains(&metres) {
                    return 0;
                }
                stops.push(Stop { node, ap, metres });
            }
            let (origins, destinations) = stops.split_at(origins as usize);
            let budget = Budget {
                ap: u64::from(ap),
                supplies: u64::from(supplies),
                previous_weighted,
                previous_actual,
                per_ap: u64::from(per_ap),
                per_supply: u64::from(per_supply),
            };
            let result = plan(
                graph,
                origins,
                destinations,
                budget,
                |edge| unsafe { vehicle_weight(edge) },
                |node, incoming, outgoing| unsafe { vehicle_turn(node, incoming, outgoing) != 0 },
            );
            if let Some(output) = result {
                runtime.output = output;
                1
            } else {
                0
            }
        })
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn revisits_a_junction_by_a_legal_way_and_uses_prepaid_allowance() {
        let graph = Graph {
            offsets: vec![0, 2, 3, 4, 4],
            targets: vec![1, 2, 3, 1],
            ways: vec![7, 8, 9, 8],
            distances: vec![10, 20, 10, 20],
            points: vec![[0.0; 3]; 4],
        };
        let start = Stop {
            node: 0,
            ap: 0,
            metres: 0.0,
        };
        let end = Stop {
            node: 3,
            ap: 0,
            metres: 0.0,
        };
        let budget = || Budget {
            ap: 0,
            supplies: 0,
            previous_weighted: 1,
            previous_actual: 1,
            per_ap: 100,
            per_supply: 100,
        };
        let turn = |_: u32, incoming, outgoing| !(incoming == 0 && outgoing == 2);
        assert_eq!(
            plan(&graph, &[start], &[end], budget(), |_| 7, turn),
            Some(vec![0, 0, 1, 3, 2])
        );
        assert!(plan(
            &graph,
            &[start],
            &[end],
            Budget {
                previous_actual: 0,
                ..budget()
            },
            |_| 4,
            turn
        )
        .is_none());
    }
}
