import { allCells, streetSource } from './campaign-map.ts';
import { campaignRoadQuery } from './rust-campaign-routing.ts';
import type { Campaign, CampaignUnit } from './campaign.ts';
import { encodeRoutingMetadata } from './rust-routing.ts';
import type { RoutingWorkerRequest, RoutingWorkerReply, RustCampaignResult } from './rust-routing.ts';
import type { VehicleCommand } from './campaign-vehicle-runtime.ts';
import type { TravelIntent } from './campaign-travel.ts';
import { manifest, readPackage } from '../map-packages.ts';

export type RoadMovePlanner = (game: Campaign, unit: CampaignUnit, destination: string) => Promise<Uint32Array | null>;
export type CampaignWasmRunner = (game: Campaign, command?: VehicleCommand) => Promise<RustCampaignResult>;

export function createRustCampaignClient(wasmUrl: string, vehicleBase?: string) {
  type Request<T = RoutingWorkerRequest> = T extends RoutingWorkerRequest ? Omit<T, 'id'> : never;
  let session: Promise<ReturnType<typeof connect>> | undefined;
  function connect(worker: Worker) {
    let id = 0;
    return {
      worker,
      request(payload: Request, transfer: ArrayBuffer[] = []) {
        return new Promise<RoutingWorkerReply>((resolve, reject) => {
          const requestId = ++id;
          const cleanup = () => {
            clearTimeout(timer);
            worker.removeEventListener('message', onReply);
            worker.removeEventListener('error', onError);
          };
          const onReply = ({ data }: MessageEvent<RoutingWorkerReply>) => {
            if (data.id !== requestId) return;
            cleanup();
            resolve(data);
          };
          const onError = (event?: ErrorEvent) => {
            cleanup();
            reject(new Error(event?.message || `Routing worker timed out during ${payload.kind}`));
          };
          const timer = setTimeout(() => onError(), payload.kind === 'campaign' ? 120_000 : 25_000);
          worker.addEventListener('message', onReply);
          worker.addEventListener('error', onError);
          try { worker.postMessage({ ...payload, id: requestId }, transfer); }
          catch (error) { cleanup(); reject(error); }
        });
      },
    };
  }
  async function initialize() {
    const [graph, response] = await Promise.all([readPackage(manifest.core), fetch(wasmUrl, { signal: AbortSignal.timeout(25_000) })]);
    if (!response.ok) throw new Error('routing wasm unavailable');
    const module = await WebAssembly.compile(await response.arrayBuffer());
    const metadata = encodeRoutingMetadata(streetSource);
    const connection = connect(new Worker(new URL('./rust-routing.worker.ts', import.meta.url), { type: 'module' }));
    try {
      const reply = await connection.request({ kind: 'init', module, graph, metadata }, [graph, metadata]);
      if ('error' in reply) throw new Error(reply.error);
      return connection;
    } catch (error) {
      connection.worker.terminate();
      throw error;
    }
  }
  async function request(payload: Request) {
    const pending = session ??= initialize();
    let connection: Awaited<typeof pending> | undefined;
    try {
      connection = await pending;
      const reply = await connection.request(payload);
      if ('error' in reply) throw new Error(reply.error);
      return reply;
    } catch (error) {
      if (session === pending) {
        connection?.worker.terminate();
        session = undefined;
      }
      throw error;
    }
  }
  const move: RoadMovePlanner = async (game, unit, destination) => {
    const start = allCells.get(unit.cellId)?.roadNode;
    const target = allCells.get(destination)?.roadNode;
    if (start === undefined || target === undefined || start === target) return null;
    const reply = await request({ kind: 'query', query: { ...campaignRoadQuery(game, unit, unit.ap),
      target, algorithm: 'dijkstra' } });
    if (!('result' in reply) || (reply.result && reply.result.kind !== 'route')) throw new Error('Unexpected WASM move result');
    return reply.result?.values ?? null;
  };
  const run: CampaignWasmRunner = async (game, command) => {
    const reply = await request({ kind: 'campaign', game, command, base: vehicleBase });
    if (!('campaign' in reply)) throw new Error('Unexpected WASM campaign result');
    return reply.campaign;
  };
  const travel=async(game:Campaign,travel:TravelIntent)=>{
    const reply=await request({kind:'campaign',game,travel,base:vehicleBase});
    if(!('campaign' in reply))throw new Error('Unexpected WASM travel result');
    return reply.campaign;
  };
  return { move, run, travel };
}
