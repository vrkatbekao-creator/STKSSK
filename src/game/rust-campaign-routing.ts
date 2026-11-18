import { allCells, districts, streetSource } from './campaign-map.ts';
import { adapted } from './campaign-events.ts';
import type { Campaign, CampaignUnit } from './campaign.ts';
import { roadAPCost, roadAPPolicy } from './road-movement.ts';
import type { RoadMovement } from './road-movement.ts';
import { NO_ROUTING_NODE } from './rust-routing.ts';
import type { RoutingQuery, RoutingResult } from './rust-routing.ts';

const cellIds = streetSource.cells.map(([q, r]) => `${streetSource.version}:${q},${r}`);
const cellIndex = new Map(cellIds.map((id, index) => [id, index]));

export function campaignRoadQuery(game: Campaign, unit: CampaignUnit, budget: number): RoutingQuery {
  const start = allCells.get(unit.cellId)!.roadNode!;
  const blockedCells = game.units.filter(other =>
    other.id !== unit.id && other.mobilization > 0 && other.withdrawUntil <= game.day)
    .map(other => cellIndex.get(other.cellId)!);
  const event = game.surprise;
  const worksDistrict = event?.id === 'streetworks' && !adapted(event, unit.team)
    ? districts.findIndex(district => district.id === event.districtId)
    : undefined;
  const walked = unit.walkedEffort ?? 0, credit = unit.walkCredit ?? 0;
  const freeCredit = Math.max(0, credit - walked);
  const effectiveBudget = freeCredit / roadAPPolicy.metresPerAP + budget;
  return { start, budget: effectiveBudget, rain: game.news === 'rain', worksDistrict, blockedCells };
}

/** Reuse the most recent tree for the matching AI command. */
export function rustRoadSearch(query: (options: RoutingQuery) => RoutingResult | null) {
  let last: { game: Campaign; unit: string; budget: number; result: RoadMovement } | undefined;
  return (game: Campaign, unit: CampaignUnit, budget: number): RoadMovement => {
    if (last?.game === game && last.unit === unit.id && last.budget === budget) return last.result;
    const options = campaignRoadQuery(game, unit, budget);
    const response = query({ ...options, tree: true });
    if (response?.kind !== 'tree') throw new Error('Expected a WASM search tree');
    const values = response.values, end = 1 + values[0] * 2;
    const walked = unit.walkedEffort ?? 0, credit = unit.walkCredit ?? 0;
    const costs = new Map<string, number>(), previous = new Map<number, number>(), effort = new Map<number, number>();
    const bytes = new DataView(values.buffer, values.byteOffset, values.byteLength);
    for (let i = end; i < values.length; i += 4) {
      if (values[i + 1] !== NO_ROUTING_NODE) previous.set(values[i], values[i + 1]);
      effort.set(values[i], bytes.getFloat64((i + 2) * 4, true));
    }
    for (let i = 1; i < end; i += 2) {
      const cell = cellIds[values[i]];
      const node = allCells.get(cell)?.roadNode;
      const dist = node === undefined ? undefined : effort.get(node);
      costs.set(cell, dist === undefined ? values[i + 1] : roadAPCost(dist, walked, credit));
    }
    const result = { costs, previous: new Map(), road: { start: options.start, previous, effort } };
    last = { game, unit: unit.id, budget, result };
    return result;
  };
}
