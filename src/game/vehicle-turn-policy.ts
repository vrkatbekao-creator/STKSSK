/** Conservative turn prototype mirroring the offline source-graph policy. */
export type TurnMember={type:string;ref:number;role:string};
export type TurnRelation={tags:Record<string,string>;members:TurnMember[]};

/** Input must be schema- and SHA-validated against the graph revision by the caller. */
export function vehicleTurnPolicy(relations:TurnRelation[],viaNodesByWay:ReadonlyMap<bigint,ReadonlySet<bigint>>) {
  const indexed=new Map<bigint,TurnRelation[]>();
  for(const r of relations){
    const from=r.members.filter(m=>m.type==='w'&&m.role==='from');
    const candidates=from.length?from:r.members.filter(m=>m.type==='w');
    for(const id of new Set(candidates.map(m=>BigInt(m.ref)))){const items=indexed.get(id)??[];items.push(r);indexed.set(id,items);}
  }
  const allowTurn = (incoming:bigint,node:bigint,outgoing:bigint):boolean=>{
    for(const r of indexed.get(incoming)??[]){
      const exceptions=r.tags.except?.split(';').map(s=>s.trim())??[];
      if(exceptions.some(s=>['motorcar','motor_vehicle','vehicle'].includes(s)))continue;
      const from=r.members.filter(m=>m.type==='w'&&m.role==='from').map(m=>BigInt(m.ref));
      if(!from.length)return false;
      if(!from.includes(incoming))continue;
      if(r.members.some(m=>!['from','via','to'].includes(m.role)))return false;
      const viaWays=r.members.filter(m=>m.type==='w'&&m.role==='via').map(m=>BigInt(m.ref));
      const value=r.tags['restriction:motorcar']??r.tags['restriction:motor_vehicle']??r.tags.restriction??'';
      const conditional=Object.keys(r.tags).some(k=>k.includes('conditional'));
      if(viaWays.length){
        if(viaWays.every(w=>viaNodesByWay.has(w))&&!viaWays.some(w=>viaNodesByWay.get(w)!.has(node)))continue;
        if(viaWays.includes(outgoing)||value.startsWith('only_')||!value||conditional)return false;
        continue;
      }
      const viaNodes=r.members.filter(m=>m.type==='n'&&m.role==='via').map(m=>BigInt(m.ref));
      if(!viaNodes.length)return false;
      if(!viaNodes.includes(node))continue;
      const to=r.members.filter(m=>m.type==='w'&&m.role==='to').map(m=>BigInt(m.ref));
      if(!to.length||conditional)return false;
      if(value.startsWith('no_')&&to.includes(outgoing))return false;
      if(value.startsWith('only_')&&!to.includes(outgoing))return false;
      if(!value.startsWith('no_')&&!value.startsWith('only_'))return false;
    }
    return true;
  };
  return Object.assign(allowTurn, { restrictedWays: new Set(indexed.keys()) });
}
