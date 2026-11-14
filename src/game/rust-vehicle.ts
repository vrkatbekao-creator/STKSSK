import type { VehicleGraphColumns } from './vehicle-graph-format.ts';
import type { VehicleLegOptions, VehicleLegPlan } from './vehicle-leg-planner.ts';
import { quoteVehicleCost, vehicleBoardingAP, vehicleCostPolicy } from './vehicle-cost.ts';
import { vehicleEdgeQuarterMetres } from './vehicle-routing.ts';

type VehicleExports = {
  memory: WebAssembly.Memory;
  routing_input(size: number): number;
  routing_output(): number;
  routing_output_len(): number;
  vehicle_init(): number;
  vehicle_query(origins: number, destinations: number, ap: number, supplies: number,
    priorWeighted: bigint, priorActual: bigint, perAp: number, perSupply: number): number;
};

export async function instantiateRustVehicle(module: WebAssembly.Module, graph: VehicleGraphColumns) {
  let policy: VehicleLegOptions | undefined;
  const instance = await WebAssembly.instantiate(module, { env: {
    vehicle_weight: (edge: number) => policy!.edgeWeightQuarters(edge),
    vehicle_turn: (node: number, incoming: number, outgoing: number) =>
      Number(policy!.allowTurn(graph.ways[incoming], graph.ids[node], graph.ways[outgoing])),
  } });
  const api = instance.exports as unknown as VehicleExports;
  const input = (length: number) => {
    const pointer = api.routing_input(length);
    if (!pointer) throw new Error('Vehicle WASM input is too large');
    return new DataView(api.memory.buffer, pointer, length);
  };
  const binary = new Uint8Array(graph.ids.buffer);
  const buffer = input(binary.byteLength);
  new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength).set(binary);
  if (!api.vehicle_init()) throw new Error('Invalid VGP3 routing data');

  return (options: VehicleLegOptions): VehicleLegPlan | null => {
    const { origins, destinations, ap, reservedAp, materials, mode,
      previousWeightedQuarterMetres, previousTeamQuarterMetres } = options;
    if (!origins.length || !destinations.length || ap < reservedAp) return null;
    const stops = [...origins, ...destinations];
    const bytes = input(stops.length * 16);
    const footAp = (stop: typeof stops[number]) => vehicleBoardingAP(stop.effort, stop.edgeIds.length > 0);
    stops.forEach((stop, index) => {
      bytes.setUint32(index * 16, stop.vehicleNode, true);
      bytes.setUint32(index * 16 + 4, footAp(stop), true);
      bytes.setFloat64(index * 16 + 8, stop.metres, true);
    });
    const perAp = mode === 'drive' ? vehicleCostPolicy.quarterMetresPerDriveAP : vehicleCostPolicy.quarterMetresPerMotorcadeAP;
    policy = options;
    let found: number;
    try {
      found = api.vehicle_query(origins.length, destinations.length, ap - reservedAp, materials,
        BigInt(previousWeightedQuarterMetres), BigInt(previousTeamQuarterMetres), perAp, vehicleCostPolicy.quarterMetresPerSupply);
    } finally {
      policy = undefined;
    }
    if (!found) return null;
    const values = new Uint32Array(api.memory.buffer, api.routing_output(), api.routing_output_len());
    const boarding = origins[values[0]], alighting = destinations[values[1]], edgeIndices = Array.from(values.subarray(2));
    if (!boarding || !alighting || !edgeIndices.length || edgeIndices.length > 10000) throw new Error('Invalid WASM vehicle route');
    const nodeIndices = [boarding.vehicleNode];
    let node = boarding.vehicleNode, actualQuarterMetres = 0, weightedQuarterMetres = 0, incoming: bigint | undefined;
    for (const edge of edgeIndices) {
      if (edge < graph.offsets[node] || edge >= graph.offsets[node + 1] ||
          (incoming !== undefined && !options.allowTurn(incoming, graph.ids[node], graph.ways[edge]))) throw new Error('Illegal WASM vehicle edge');
      const quarters = options.edgeWeightQuarters(edge);
      if (!Number.isInteger(quarters) || quarters < 4 || quarters > 7) throw new Error('Invalid vehicle weight');
      const distance = vehicleEdgeQuarterMetres(graph.metres[edge]);
      actualQuarterMetres += distance;
      weightedQuarterMetres += Math.ceil(distance * quarters / 4);
      incoming = graph.ways[edge];
      node = graph.targets[edge];
      nodeIndices.push(node);
    }
    if (node !== alighting.vehicleNode) throw new Error('Invalid WASM vehicle destination');
    const fee = quoteVehicleCost({ mode, previousWeightedQuarterMetres, previousTeamQuarterMetres,
      addedWeightedQuarterMetres: weightedQuarterMetres, addedTeamQuarterMetres: actualQuarterMetres });
    const walkingAp = footAp(boarding) + footAp(alighting), totalAp = walkingAp + fee.ap;
    if (totalAp + reservedAp > ap || fee.supplies > materials) throw new Error('Unaffordable WASM vehicle route');
    return { boarding, alighting, nodeIndices, edgeIndices, walkingAp, vehicleAp: fee.ap,
      totalAp, materials: fee.supplies, actualQuarterMetres, weightedQuarterMetres };
  };
}
