import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isMainThread, parentPort, Worker } from 'node:worker_threads';
import { encodeRoutingMetadata, routingWorkerHandler } from '../src/game/rust-routing.ts';

if (!isMainThread) {
  parentPort.on('message', routingWorkerHandler((message, transfer) => parentPort.postMessage(message, transfer)));
} else {
  await benchmark();
}

async function benchmark() {
  const { initialCampaign } = await import('../src/game/campaign.ts');
  const { allCells, mapFor, routingEdges, streetSource } = await import('../src/game/campaign-map.ts');
  const { roadEffort, roadMovement, roadRoute } = await import('../src/game/road-movement.ts');
  const { manifest, readPackage } = await import('../src/map-packages.ts');
  const started = performance.now();
  const [graph, wasm] = await Promise.all([
    readPackage(manifest.core),
    readFile(new URL('../stksst-core/target/wasm32-unknown-unknown/release/stksst_core.wasm', import.meta.url)),
  ]);
  const metadata = encodeRoutingMetadata(streetSource);
  const module = await WebAssembly.compile(wasm);
  const worker = new Worker(new URL(import.meta.url));
  let id = 0;
  const request = (payload, transfer = []) => new Promise((resolve, reject) => {
    const requestId = ++id;
    const onError = (error) => { worker.off('message', onReply); reject(error); };
    const onReply = (reply) => {
      if (reply.id !== requestId) return;
      worker.off('message', onReply);
      worker.off('error', onError);
      if (reply.error) reject(new Error(reply.error));
      else resolve(reply.result);
    };
    worker.on('message', onReply);
    worker.once('error', onError);
    worker.postMessage({ id: requestId, ...payload }, transfer);
  });
  try {
    await assert.rejects(request({ kind: 'init', module, graph: graph.slice(0, 16), metadata }), /invalid STR1/);
    await request({ kind: 'init', module, graph, metadata }, [graph, metadata]);
    const setupMs = performance.now() - started;
    const game = initialCampaign(17, 'blue', 'streets-v2');
    const actor = game.units.find((unit) => unit.id === 'blue1');
    const districts = mapFor(game).districts;
    const cellIds = streetSource.cells.map(([q, r]) => `${streetSource.version}:${q},${r}`);
    const cellIndex = new Map(cellIds.map((cell, index) => [cell, index]));
    const occupied = new Set(game.units.filter((unit) => unit.id !== actor.id).map((unit) => unit.cellId));
    const origins = [actor.cellId, ...districts.slice().reverse().map((district) => district.anchor)
      .filter((cell) => cell !== actor.cellId && !occupied.has(cell)).slice(0, 2)];
    const times = { tsReach: [], wasmReach: [], wasmDijkstra: [], wasmAstar: [] };
    let routes = 0;
    const timed = async (key, operation) => {
      const begin = performance.now();
      const result = await operation();
      times[key].push(performance.now() - begin);
      return result;
    };
    for (const origin of origins) {
      actor.cellId = origin;
      for (const [rain, worksDistrict] of [[false, undefined], [true, undefined], [true, 4]]) {
        game.news = rain ? 'rain' : 'clear';
        game.surprise = worksDistrict === undefined ? null : { id: 'streetworks',
          districtId: districts[worksDistrict].id, responses: { blue: null, green: null, white: null } };
        const blockedCells = game.units.filter((unit) => unit.id !== actor.id && unit.cellId !== origin)
          .map((unit) => cellIndex.get(unit.cellId));
        assert.ok(!game.units.some((unit) => unit.id !== actor.id && unit.cellId === origin), 'fixture origin is occupied');
        const query = { start: allCells.get(origin).roadNode, budget: worksDistrict === undefined ? 14 : 2, rain, worksDistrict, blockedCells };
        const baseline = await timed('tsReach', () => roadMovement(game, actor, query.budget));
        const reachable = await timed('wasmReach', () => request({ kind: 'query', query }));
        assert.equal(reachable.values.length, baseline.costs.size * 2);
        const actualCosts = new Map();
        for (let i = 0; i < reachable.values.length; i += 2)
          actualCosts.set(cellIds[reachable.values[i]], reachable.values[i + 1]);
        assert.deepEqual(actualCosts, baseline.costs);
        for (const district of districts) {
          const expected = roadRoute(baseline, district.anchor);
          const target = allCells.get(district.anchor).roadNode;
          const dijkstra = await timed('wasmDijkstra', () => request({ kind: 'query', query: { ...query, target, algorithm: 'dijkstra' } }));
          const astar = await timed('wasmAstar', () => request({ kind: 'query', query: { ...query, target } }));
          assert.equal(Boolean(dijkstra), Boolean(expected));
          assert.equal(Boolean(astar), Boolean(expected));
          if (expected) {
            assert.deepEqual([...dijkstra.values], expected.edgeIds);
            assert.equal(astar.ap, expected.cost);
            assert.equal(astar.effort, dijkstra.effort);
            let node = query.start;
            let effort = 0;
            for (const id of astar.values) {
              const edge = routingEdges[id];
              assert.equal(edge.from, node);
              assert.ok(edge.cellIds.every((cell) => !occupied.has(cell)));
              node = edge.to;
              effort += roadEffort(game, id, actor.team);
            }
            assert.equal(node, target);
            assert.equal(effort, astar.effort);
          }
          routes++;
        }
      }
    }
    const milliseconds = Object.fromEntries(Object.entries(times).map(([key, samples]) => {
      const sorted = [...samples].sort((a, b) => a - b);
      return [key, { median: +sorted[Math.ceil(sorted.length / 2) - 1].toFixed(2),
        p95: +sorted[Math.ceil(sorted.length * 0.95) - 1].toFixed(2), count: sorted.length }];
    }));
    console.log(JSON.stringify({ revision: manifest.revision, wasmBytes: wasm.byteLength,
      setupMs: +setupMs.toFixed(2), routes, milliseconds }, null, 2));
  } finally {
    await worker.terminate();
  }
}
