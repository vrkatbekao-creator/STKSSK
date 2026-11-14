import { automatedFactionTurn, endCampaignPhase } from './campaign.ts';
import type { Campaign } from './campaign.ts';
import { endVehicleCampaignPhase } from './campaign-vehicle-phase.ts';
import { campaignVehicleCommand } from './campaign-vehicle-runtime.ts';
import type { VehicleCommand } from './campaign-vehicle-runtime.ts';
import { campaignRoadQuery, rustRoadSearch } from './rust-campaign-routing.ts';
import { allCells, districts as campaignDistricts } from './campaign-map.ts';
import { prepareCampaignTravel } from './campaign-travel.ts';
import type { TravelIntent } from './campaign-travel.ts';
import { readPreparedVehiclePolicy, readRustVehicleBackend } from './rust-vehicle-backend.ts';
import { instantiateRustVehicle } from './rust-vehicle.ts';
import { encodeVehiclePolicy } from './rust-vehicle-policy.ts';
import type { RoutingQuery, RoutingResult } from './rust-routing.ts';

export function createRustCampaignWorker(module: WebAssembly.Module, query: (options: RoutingQuery) => RoutingResult | null,
    loadBackend = readRustVehicleBackend) {
  let vehicle: ReturnType<typeof loadVehicle> | undefined;
  let activeQueries = 0;
  const roadSearch = rustRoadSearch(options => { activeQueries++; return query(options); });
  async function loadVehicle(base: string) {
    const prepared=loadBackend===readRustVehicleBackend?readPreparedVehiclePolicy(base,campaignDistricts).catch(()=>undefined):undefined;
    const { graph, runtime, turns, districts } = await loadBackend(base);
    const planLeg = await instantiateRustVehicle(module, graph, (await prepared)??encodeVehiclePolicy(graph, turns, districts));
    return {
      ...runtime,
      contextFor: (game: Campaign, team: Campaign['playerTeam']) => ({
        ...runtime.contextFor(game, team),
        planLeg: (options: Parameters<typeof planLeg>[0]) => { activeQueries++; return planLeg(options); },
      }),
    };
  }
  async function runtime(base: string | undefined) {
    if (!base) throw new Error('Vehicle mode unavailable');
    return vehicle ??= loadVehicle(base);
  }
  return {
    async run(game: Campaign, base: string | undefined, command?: VehicleCommand, travel?: TravelIntent) {
      activeQueries = 0;
      if(travel){
        const backend=travel.mode==='drive'||travel.mode==='motorcade'?await runtime(base):undefined;
        const out=prepareCampaignTravel(game,travel,backend,game.movementProfile==='streets-v2'?(unit,cellId)=>{
          const target=allCells.get(cellId)?.roadNode;
          if(target===undefined)return null;
          activeQueries++;
          return query({...campaignRoadQuery(game,unit,unit.ap),target,algorithm:'dijkstra'})?.values??null;
        }:undefined);
        return {...out,searches:activeQueries};
      }
      let result: { game: Campaign; error?: string };
      if (command) {
        result = campaignVehicleCommand(game, game.playerTeam, command, await runtime(base));
      } else if (game.vehicle) {
        const backend = await runtime(base);
        if (game.vehicle.revision !== backend.revision) throw new Error('Incompatible vehicle network');
        result = endVehicleCampaignPhase(game, game.vehicle, backend.contextFor,
          { roadSearch, fragmentsForRoute: backend.fragmentsForRoute });
      } else {
        result = { game: endCampaignPhase(game, { automatedTurn: (state, team) =>
          automatedFactionTurn(state, team, { roadSearch }) }) };
      }
      // The main thread only needs the committed game, not search trees or the vehicle plan.
      return { game: result.game, error: result.error, searches: activeQueries };
    },
  };
}
