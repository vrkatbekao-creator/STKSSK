mod routing;
#[cfg(any(test, target_arch = "wasm32"))]
mod vehicle;

use routing::{Graph, NO_NODE};
use std::cell::RefCell;

#[derive(Default)]
struct Runtime {
    input: Vec<u8>,
    graph: Vec<u8>,
    routing: Option<Graph>,
    output: Vec<u32>,
    effort: f64,
}

thread_local! {
    static RUNTIME: RefCell<Runtime> = RefCell::new(Runtime::default());
}

// The worker writes only into this owned buffer and refreshes its memory view per call.
#[no_mangle]
pub extern "C" fn routing_input(size: u32) -> *mut u8 {
    RUNTIME.with_borrow_mut(|runtime| {
        if size > 128 * 1024 * 1024 {
            return std::ptr::null_mut();
        }
        runtime.input.resize(size as usize, 0);
        runtime.input.as_mut_ptr()
    })
}

#[no_mangle]
pub extern "C" fn routing_stage_graph() {
    RUNTIME.with_borrow_mut(|runtime| runtime.graph = std::mem::take(&mut runtime.input));
}

#[no_mangle]
pub extern "C" fn routing_init() -> u32 {
    RUNTIME.with_borrow_mut(|runtime| {
        runtime.routing = Graph::parse(&runtime.graph, &runtime.input);
        runtime.graph = Vec::new();
        runtime.input = Vec::new();
        u32::from(runtime.routing.is_some())
    })
}

#[no_mangle]
pub extern "C" fn routing_query(
    start: u32,
    destination: u32,
    budget: f64,
    rain: u32,
    works: u32,
    astar: u32,
) -> u32 {
    RUNTIME.with_borrow_mut(|runtime| {
        runtime.output.clear();
        runtime.effort = 0.0;
        let Some(graph) = runtime.routing.as_ref() else {
            return 0;
        };
        if runtime.input.len() % 4 != 0 || runtime.input.len() > graph.cell_count() * 4 {
            return 0;
        }
        let mut blocked = vec![false; graph.cell_count()];
        for chunk in runtime.input.chunks_exact(4) {
            let cell = u32::from_le_bytes(chunk.try_into().unwrap());
            let Some(entry) = blocked.get_mut(cell as usize) else {
                return 0;
            };
            *entry = true;
        }
        let result = if destination == NO_NODE - 1 {
            graph.search_tree(start, budget, rain != 0, works, &blocked)
        } else {
            let target = (destination != NO_NODE).then_some(destination);
            graph.search(
                start,
                target,
                budget,
                rain != 0,
                works,
                &blocked,
                astar != 0,
            )
        };
        match result {
            Some(result) => {
                runtime.output = result.values;
                runtime.effort = result.effort;
                1
            }
            None => 0,
        }
    })
}

#[no_mangle]
pub extern "C" fn routing_output() -> *const u32 {
    RUNTIME.with_borrow(|runtime| runtime.output.as_ptr())
}

#[no_mangle]
pub extern "C" fn routing_output_len() -> u32 {
    RUNTIME.with_borrow(|runtime| runtime.output.len() as u32)
}

#[no_mangle]
pub extern "C" fn routing_effort() -> f64 {
    RUNTIME.with_borrow(|runtime| runtime.effort)
}

#[no_mangle]
pub extern "C" fn routing_ap() -> u32 {
    RUNTIME.with_borrow(|runtime| routing::action_points(runtime.effort))
}
