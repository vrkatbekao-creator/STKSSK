import type { Campaign } from './campaign.ts';
import type { VehicleCommand } from './campaign-vehicle-runtime.ts';
import type { TravelIntent, TravelQuote } from './campaign-travel.ts';

export const NO_ROUTING_NODE = 0xffffffff;
const ROUTING_TREE = NO_ROUTING_NODE - 1;

type RoutingMetadata = {
  cells: number[][];
  anchors: [number, number][];
  ways: readonly (readonly [number, unknown, string, ...unknown[]])[];
};

export function encodeRoutingMetadata(meta: RoutingMetadata): ArrayBuffer {
  const stairs = meta.ways.filter((way) => way[2] === 'steps');
  const cells = meta.cells.length;
  const bytes = new ArrayBuffer((3 + cells * 2 + stairs.length) * 4);
  const data = new DataView(bytes);
  const set = (index: number, value: number) => data.setUint32(index * 4, value, true);
  set(0, 0x31444d52); // RMD1
  set(1, cells);
  set(2, stairs.length);
  meta.cells.forEach((cell, index) => {
    set(3 + index, cell[2]);
    set(3 + cells + index, NO_ROUTING_NODE);
  });
  meta.anchors.forEach(([cell, node]) => set(3 + cells + cell, node));
  stairs.forEach(([way], index) => set(3 + 2 * cells + index, way));
  return bytes;
}

type RoutingExports = {
  memory: WebAssembly.Memory;
  routing_input(size: number): number;
  routing_stage_graph(): void;
  routing_init(): number;
  routing_query(start: number, target: number, budget: number, rain: number, works: number, astar: number): number;
  routing_output(): number;
  routing_output_len(): number;
  routing_effort(): number;
  routing_ap(): number;
};

export type RoutingQuery = {
  start: number;
  target?: number;
  budget: number;
  rain?: boolean;
  worksDistrict?: number;
  blockedCells?: readonly number[];
  algorithm?: 'astar' | 'dijkstra';
  tree?: boolean;
};
export type RoutingResult = {
  kind: 'route' | 'reach' | 'tree';
  values: Uint32Array<ArrayBuffer>;
  ap: number;
  effort: number;
};

export async function instantiateRustRouting(module: WebAssembly.Module, str1: ArrayBuffer, metadata: ArrayBuffer) {
  const instance = await WebAssembly.instantiate(module, { env: { vehicle_weight: () => 0, vehicle_turn: () => 0 } });
  const api = instance.exports as unknown as RoutingExports;
  const write = (bytes: ArrayBuffer) => {
    const pointer = api.routing_input(bytes.byteLength);
    if (pointer === 0) throw new RangeError('routing input too large');
    new Uint8Array(api.memory.buffer, pointer, bytes.byteLength).set(new Uint8Array(bytes));
  };
  write(str1);
  api.routing_stage_graph();
  write(metadata);
  if (!api.routing_init()) throw new Error('invalid STR1 routing data');

  return (query: RoutingQuery): RoutingResult | null => {
    const { start, target, budget, rain, worksDistrict, blockedCells = [], algorithm = 'astar', tree = false } = query;
    const isId = (value: number) => Number.isInteger(value) && value >= 0 && value < ROUTING_TREE;
    if (!isId(start) || (target !== undefined && !isId(target)) ||
        (worksDistrict !== undefined && (!isId(worksDistrict) || worksDistrict >= 12)) ||
        !Number.isFinite(budget) || budget < 0 || (tree && target !== undefined) || !blockedCells.every(isId)) {
      throw new RangeError('invalid routing query');
    }
    const blocked = new ArrayBuffer(blockedCells.length * 4);
    const view = new DataView(blocked);
    blockedCells.forEach((cell, index) => view.setUint32(index * 4, cell, true));
    write(blocked);
    if (!api.routing_query(start, tree ? ROUTING_TREE : target ?? NO_ROUTING_NODE, budget, Number(Boolean(rain)),
      worksDistrict ?? NO_ROUTING_NODE, Number(algorithm === 'astar'))) return null;
    // Copy the result out of linear memory before another query can mutate or grow it.
    const values = new Uint32Array(api.memory.buffer, api.routing_output(), api.routing_output_len()).slice();
    return { kind: tree ? 'tree' : target === undefined ? 'reach' : 'route', values, ap: api.routing_ap(), effort: api.routing_effort() };
  };
}

export type RoutingWorkerRequest =
  | { id: number; kind: 'init'; module: WebAssembly.Module; graph: ArrayBuffer; metadata: ArrayBuffer }
  | { id: number; kind: 'query'; query: RoutingQuery }
  | { id: number; kind: 'campaign'; game: Campaign; base?: string; command?: VehicleCommand; travel?: TravelIntent };
export type RustCampaignResult = { game: Campaign; error?: string; searches: number; quote?: TravelQuote };
export type RoutingWorkerReply = { id: number; result: RoutingResult | null } |
  { id: number; campaign: RustCampaignResult } | { id: number; error: string };

export function routingWorkerHandler(reply: (message: RoutingWorkerReply, transfer?: ArrayBuffer[]) => void) {
  let query: ReturnType<typeof instantiateRustRouting> | undefined;
  let module: WebAssembly.Module;
  let campaign: Promise<ReturnType<typeof import('./rust-campaign-worker.ts')['createRustCampaignWorker']>> | undefined;
  return async (request: RoutingWorkerRequest) => {
    try {
      if (request.kind === 'init') {
        module = request.module;
        campaign = undefined;
        query = instantiateRustRouting(request.module, request.graph, request.metadata);
        await query;
        reply({ id: request.id, result: null });
      } else if (request.kind === 'query') {
        if (!query) throw new Error('routing worker is not initialized');
        const result = (await query)(request.query);
        reply({ id: request.id, result }, result ? [result.values.buffer] : []);
      } else {
        if (!query) throw new Error('routing worker is not initialized');
        const ready = await query;
        campaign ??= import('./rust-campaign-worker.ts').then(worker => worker.createRustCampaignWorker(module, ready));
        const output = await (await campaign).run(request.game, request.base, request.command, request.travel);
        reply({ id: request.id, campaign: output });
      }
    } catch (error) {
      reply({ id: request.id, error: error instanceof Error ? error.message : String(error) });
    }
  };
}
