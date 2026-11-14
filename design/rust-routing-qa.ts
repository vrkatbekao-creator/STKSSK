import { encodeRoutingMetadata, NO_ROUTING_NODE } from '../src/game/rust-routing.ts';
import type { RoutingQuery, RoutingWorkerReply, RoutingWorkerRequest } from '../src/game/rust-routing.ts';
import { manifest, readPackage } from '../src/map-packages.ts';
import wasmUrl from '../stksst-core/target/wasm32-unknown-unknown/release/stksst_core.wasm?url';

type Payload = RoutingWorkerRequest extends infer Request
  ? Request extends { id: number } ? Omit<Request, 'id'> : never
  : never;

const button = document.querySelector<HTMLButtonElement>('#run')!;
const status = document.querySelector<HTMLPreElement>('#result')!;

async function check() {
  const worker = new Worker(new URL('../src/game/rust-routing.worker.ts', import.meta.url), { type: 'module' });
  let id = 0;
  const request = (payload: Payload, transfer: Transferable[] = []) => new Promise<RoutingWorkerReply>((resolve, reject) => {
    const requestId = ++id;
    const timer = window.setTimeout(() => finish(() => reject(new Error('Worker 回應逾時'))), 15_000);
    const finish = (complete: () => void) => {
      clearTimeout(timer);
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      complete();
    };
    const onMessage = ({ data }: MessageEvent<RoutingWorkerReply>) => {
      if (data.id === requestId) finish(() => resolve(data));
    };
    const onError = (event: ErrorEvent) => finish(() => reject(new Error(event.message || 'Worker 載入失敗')));
    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    try {
      worker.postMessage({ ...payload, id: requestId }, transfer);
    } catch (error) {
      finish(() => reject(error));
    }
  });

  try {
    const [{ allCells, mapFor, routingEdges, streetSource }, { initialCampaign }, { roadMovement, roadRoute, roadEffort }] =
      await Promise.all([import('../src/game/campaign-map.ts'), import('../src/game/campaign.ts'), import('../src/game/road-movement.ts')]);
    const begin = performance.now();
    const [graph, response] = await Promise.all([readPackage(manifest.core), fetch(wasmUrl)]);
    if (!response.ok) throw new Error(`WASM HTTP ${response.status}`);
    const module = await WebAssembly.compile(await response.arrayBuffer());
    const metadata = encodeRoutingMetadata(streetSource);
    const rejected = await request({ kind: 'init', module, graph: graph.slice(0, 16), metadata });
    if (!('error' in rejected)) throw new Error('截斷圖資未被拒絕');
    const ready = await request({ kind: 'init', module, graph, metadata }, [graph, metadata]);
    if ('error' in ready) throw new Error(ready.error);
    if (graph.byteLength || metadata.byteLength) throw new Error('Worker 輸入未轉移所有權');
    const setupMs = performance.now() - begin;
    const game = initialCampaign(17, 'blue', 'streets-v2');
    const actor = game.units[0];
    const districts = mapFor(game).districts;
    const cellIds = streetSource.cells.map(([q, r]) => `${streetSource.version}:${q},${r}`);
    const blocked = new Set(game.units.slice(1).map((unit) => unit.cellId));
    const blockedCells = [...blocked].map((cell) => cellIds.indexOf(cell));
    const timings: { scenario: string; typescriptMs: number; workerMs: number; cells: number }[] = [];
    let routes = 0;
    for (const [scenario, rain, worksDistrict, budget] of [
      ['晴天', false, undefined, 14],
      ['雨天', true, undefined, 14],
      ['雨天及施工', true, districts.findIndex((district) => district.id === allCells.get(actor.cellId)!.districtId), 2],
      ['零 AP', false, undefined, 0],
    ] as const) {
      game.news = rain ? 'rain' : 'clear';
      game.surprise = worksDistrict === undefined ? null : {
        id: 'streetworks', districtId: districts[worksDistrict].id, responses: { blue: null, green: null, white: null },
      };
      const query = { start: allCells.get(actor.cellId)!.roadNode!, budget, rain, worksDistrict, blockedCells };
      const baselineStart = performance.now();
      const baseline = roadMovement(game, actor, budget);
      const typescriptMs = performance.now() - baselineStart;
      const workerStart = performance.now();
      const reach = await queryWorker(query);
      const workerMs = performance.now() - workerStart;
      if (reach?.kind !== 'reach' || reach.values.length !== baseline.costs.size * 2) throw new Error(`${scenario}可達格數不同`);
      const seen = new Set<number>();
      for (let i = 0; i < reach.values.length; i += 2) {
        const cell = reach.values[i];
        if (seen.has(cell) || baseline.costs.get(cellIds[cell]) !== reach.values[i + 1]) throw new Error(`${scenario}可達格 AP 不同`);
        seen.add(cell);
      }
      timings.push({ scenario, typescriptMs, workerMs, cells: seen.size });
      const tree = await queryWorker({ ...query, tree: true });
      if (tree?.kind !== 'tree' || tree.values[0] !== seen.size) throw new Error(`${scenario}搜尋樹格數不同`);
      const offset = 1 + tree.values[0] * 2;
      if (tree.values.length !== offset + baseline.road.effort.size * 4) throw new Error(`${scenario}搜尋樹節點數不同`);
      const treeBytes = new DataView(tree.values.buffer, tree.values.byteOffset, tree.values.byteLength);
      const treeNodes = new Set<number>();
      for (let i = offset; i < tree.values.length; i += 4) {
        const node = tree.values[i];
        const edge = tree.values[i + 1];
        const effort = treeBytes.getFloat64((i + 2) * 4, true);
        if (treeNodes.has(node) || baseline.road.effort.get(node) !== effort ||
            (baseline.road.previous.get(node) ?? NO_ROUTING_NODE) !== edge) {
          throw new Error(`${scenario}搜尋樹路段或加權距離不同`);
        }
        treeNodes.add(node);
      }
      for (const district of districts) {
        const target = allCells.get(district.anchor)!.roadNode!;
        const expected = roadRoute(baseline, district.anchor);
        const dijkstra = await queryWorker({ ...query, target, algorithm: 'dijkstra' });
        const astar = await queryWorker({ ...query, target, algorithm: 'astar' });
        if (Boolean(expected) !== Boolean(dijkstra) || Boolean(expected) !== Boolean(astar)) throw new Error(`${scenario}路線可達性不同`);
        if (expected && dijkstra && astar) {
          if (expected.edgeIds.length !== dijkstra.values.length ||
              expected.edgeIds.some((edge, index) => edge !== dijkstra.values[index]) ||
              expected.cost !== dijkstra.ap || expected.cost !== astar.ap ||
              dijkstra.effort !== astar.effort) throw new Error(`${scenario}路段或 AP 不同`);
          let node = query.start;
          let effort = 0;
          for (const edgeId of astar.values) {
            const edge = routingEdges[edgeId];
            if (edge.from !== node || edge.cellIds.some((cell) => blocked.has(cell))) throw new Error('A* 路段不連續或穿越佔格');
            node = edge.to;
            effort += roadEffort(game, edgeId, actor.team);
          }
          if (node !== target || effort !== astar.effort) throw new Error('A* 終點或加權距離不同');
        }
        routes++;
      }
    }
    return { setupMs, routes, timings };
  } finally {
    worker.terminate();
  }

  async function queryWorker(query: RoutingQuery) {
    const reply = await request({ kind: 'query', query });
    if ('error' in reply) throw new Error(reply.error);
    if (!('result' in reply)) throw new Error('Unexpected routing worker reply');
    return reply.result;
  }
}

button.addEventListener('click', async () => {
  button.disabled = true;
  status.textContent = '正在比較全市路網。';
  try {
    const { setupMs, routes, timings } = await check();
    status.textContent = [
      `通過。比對 ${timings.length} 組可達格與搜尋樹及 ${routes} 組目的地，截斷圖資拒絕與重新初始化正常。`,
      `初始化 ${setupMs.toFixed(1)} ms（圖資讀取、SHA 驗證、WASM 編譯及 Worker 啟動，含一次錯誤重試）`,
      ...timings.map(({ scenario, typescriptMs, workerMs, cells }) =>
        `${scenario}　${cells} 格　TypeScript ${typescriptMs.toFixed(1)} ms　WASM Worker ${workerMs.toFixed(1)} ms`),
    ].join('\n');
  } catch (error) {
    status.textContent = `失敗。 ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    button.disabled = false;
  }
});
