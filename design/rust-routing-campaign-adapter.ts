import { allCells, districts, streetSource } from '../src/game/campaign-map.ts';
import { adapted } from '../src/game/campaign-events.ts';
import type { Campaign, CampaignUnit } from '../src/game/campaign.ts';
import type { RoadMovement } from '../src/game/road-movement.ts';
import { encodeRoutingMetadata, instantiateRustRouting, NO_ROUTING_NODE } from '../src/game/rust-routing.ts';
import { manifest, readPackage } from '../src/map-packages.ts';

export { checkedRoadMove, roadRoute } from '../src/game/road-movement.ts';

const cellIds = streetSource.cells.map(([q, r]) => `${streetSource.version}:${q},${r}`);
const cellIndex = new Map(cellIds.map((id, index) => [id, index]));
let query: Awaited<ReturnType<typeof instantiateRustRouting>>;
export const metrics = { calls: 0, milliseconds: 0 };

export async function init(module: WebAssembly.Module) {
  query = await instantiateRustRouting(module, await readPackage(manifest.core), encodeRoutingMetadata(streetSource));
}

export function roadMovement(game: Campaign, unit: CampaignUnit, budget: number): RoadMovement {
  const started = performance.now();
  const start = allCells.get(unit.cellId)!.roadNode!;
  const blockedCells = game.units.filter((other) =>
    other.id !== unit.id && other.mobilization > 0 && other.withdrawUntil <= game.day)
    .map((other) => cellIndex.get(other.cellId)!);
  const event = game.surprise;
  const worksDistrict = event?.id === 'streetworks' && !adapted(event, unit.team)
    ? districts.findIndex((district) => district.id === event.districtId)
    : undefined;
  const result = query({ start, budget, rain: game.news === 'rain', worksDistrict, blockedCells, tree: true });
  if (result?.kind !== 'tree') throw new Error('Rust did not return a search tree');
  const values = result.values;
  const end = 1 + values[0] * 2;
  const costs = new Map<string, number>();
  const previous = new Map<number, number>();
  const effort = new Map<number, number>();
  const bytes = new DataView(values.buffer, values.byteOffset, values.byteLength);
  for (let i = 1; i < end; i += 2) costs.set(cellIds[values[i]], values[i + 1]);
  for (let i = end; i < values.length; i += 4) {
    if (values[i + 1] !== NO_ROUTING_NODE) previous.set(values[i], values[i + 1]);
    effort.set(values[i], bytes.getFloat64((i + 2) * 4, true));
  }
  metrics.calls++;
  metrics.milliseconds += performance.now() - started;
  return { costs, previous: new Map(), road: { start, previous, effort } };
}
