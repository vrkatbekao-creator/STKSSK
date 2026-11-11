/** Experimental pure vehicle routing. Not yet connected to campaign commands. */
import type {VehicleGraphColumns} from './vehicle-graph-format.ts';

export type VehicleRoute = {nodeIndices: number[]; edgeIndices: number[]; actualQuarterMetres: number; weightedQuarterMetres: number};
export type VehicleRoutePolicy = {
  allowTurn: (incomingWay: bigint, nodeId: bigint, outgoingWay: bigint) => boolean;
  /** Multipliers in quarters: 4 = dry, 5 = rain, 6 = construction, 7 = both. */
  edgeWeightQuarters: (edgeIndex: number) => number;
  maxWeightedQuarterMetres: number;
};

type State = {node: number; way: bigint | null; cost: number; prev: number; edge: number; actual: number};
type HeapItem = {cost: number; state: number};
class Heap {
  private items: HeapItem[] = [];
  push(item: HeapItem) {let i = this.items.length; this.items.push(item); while (i > 0) {const p = (i-1) >> 1; if (this.items[p].cost <= item.cost) break; this.items[i] = this.items[p]; i = p;} this.items[i] = item;}
  pop(): HeapItem | undefined {if (!this.items.length) return undefined; const first = this.items[0], last = this.items.pop()!; if (this.items.length) {let i=0; while (i*2+1 < this.items.length) {let c=i*2+1; if (c+1<this.items.length && this.items[c+1].cost<this.items[c].cost)c++; if (this.items[c].cost>=last.cost)break; this.items[i]=this.items[c]; i=c;} this.items[i]=last;} return first;}
}

/** Quantize each source edge once, not each user-selected segment, to preserve split accounting. */
export function vehicleEdgeQuarterMetres(metres: number): number {
  if (!Number.isFinite(metres) || metres <= 0) throw new RangeError('Invalid vehicle edge');
  const distance = Math.max(1, Math.round(metres * 4));
  if (!Number.isSafeInteger(distance)) throw new RangeError('Vehicle edge too long');
  return distance;
}

/** Dijkstra state includes the arriving road so turn restrictions cannot be skipped. */
export function vehicleRoute(graph: VehicleGraphColumns, start: number, end: number, policy: VehicleRoutePolicy): VehicleRoute | null {
  const count = graph.ids.length;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start<0 || end<0 || start>=count || end>=count ||
      !Number.isSafeInteger(policy.maxWeightedQuarterMetres) || policy.maxWeightedQuarterMetres<0) return null;
  if (start === end) return null;
  const states: State[] = [{node:start,way:null,cost:0,prev:-1,edge:-1,actual:0}], queue = new Heap();
  const best = new Map<string,number>([[`${start}:start`,0]]); queue.push({cost:0,state:0});
  while (true) {
    const item = queue.pop(); if (!item) return null;
    const state = states[item.state], key = `${state.node}:${state.way===null?'start':state.way}`;
    if (best.get(key)!==item.state) continue;
    if (state.node===end) {
      const edgeIndices:number[]=[], nodeIndices:number[]=[end]; let at=item.state;
      while (states[at].prev>=0) {edgeIndices.push(states[at].edge); at=states[at].prev; nodeIndices.push(states[at].node);}
      return {nodeIndices:nodeIndices.reverse(),edgeIndices:edgeIndices.reverse(),actualQuarterMetres:state.actual,weightedQuarterMetres:state.cost};
    }
    for (let edge=graph.offsets[state.node]; edge<graph.offsets[state.node+1]; edge++) {
      const way=graph.ways[edge], target=graph.targets[edge];
      if (state.way!==null && !policy.allowTurn(state.way,graph.ids[state.node],way)) continue;
      const weight=policy.edgeWeightQuarters(edge);
      if (!Number.isInteger(weight) || weight<4 || weight>7) throw new RangeError('Invalid vehicle edge weight');
      const actual=vehicleEdgeQuarterMetres(graph.metres[edge]);
      if (!Number.isSafeInteger(actual*weight)) throw new RangeError('Vehicle weighted edge too long');
      const weighted=Math.ceil(actual*weight/4);
      const cost=state.cost+weighted, total=state.actual+actual;
      if (!Number.isSafeInteger(cost) || !Number.isSafeInteger(total) || cost>policy.maxWeightedQuarterMetres) continue;
      const nextKey=`${target}:${way}`, existing=best.get(nextKey);
      if (existing!==undefined && states[existing].cost<=cost) continue;
      const next=states.length; states.push({node:target,way,cost,prev:item.state,edge,actual:total}); best.set(nextKey,next); queue.push({cost,state:next});
    }
  }
}
