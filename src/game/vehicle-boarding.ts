/** Pure walking-to-vehicle connector search. Not connected to campaign commands yet. */
export type BoardingEdge={id:number;from:number;to:number;metres:number};
export type BoardingSearch={start:number;nodeCount:number;edges:readonly BoardingEdge[];
  outgoing:readonly (readonly number[])[];incoming:readonly (readonly number[])[];
  connectors:ReadonlyMap<number,readonly number[]>;direction:'toVehicle'|'fromVehicle';
  blocked:(edge:BoardingEdge)=>boolean;edgeEffort:(edge:BoardingEdge)=>number;maxMetres?:number};
export type BoardingRoute={walkingNode:number;vehicleNode:number;edgeIds:number[];metres:number;effort:number};
type Label={node:number;metres:number;effort:number;previous:number;edge:number};
type Item={label:number;metres:number};
class MinHeap {
 private data:Item[]=[];
 push(x:Item){let i=this.data.length;this.data.push(x);while(i){const p=(i-1)>>1;if(this.data[p].metres<=x.metres)break;this.data[i]=this.data[p];i=p;}this.data[i]=x;}
 pop(){if(!this.data.length)return undefined;const first=this.data[0],last=this.data.pop()!;if(this.data.length){let i=0;while(i*2+1<this.data.length){let c=i*2+1;if(c+1<this.data.length&&this.data[c+1].metres<this.data[c].metres)c++;if(this.data[c].metres>=last.metres)break;this.data[i]=this.data[c];i=c;}this.data[i]=last;}return first;}
}

/** Keep non-dominated physical-distance/effort alternatives; a cheaper long path can exceed 600 m later. */
export function boardingRoutes(search:BoardingSearch):BoardingRoute[]{
 const {start,nodeCount,edges,outgoing,incoming,connectors,direction,blocked,edgeEffort}=search,max=search.maxMetres??600;
 if(!Number.isInteger(nodeCount)||nodeCount<1||!Number.isInteger(start)||start<0||start>=nodeCount||
    !Number.isFinite(max)||max<0||!['toVehicle','fromVehicle'].includes(direction)||outgoing.length!==nodeCount||incoming.length!==nodeCount)throw new RangeError('Invalid boarding graph');
 const labels:Label[]=[{node:start,metres:0,effort:0,previous:-1,edge:-1}],front=new Map<number,number[]>([[start,[0]]]),queue=new MinHeap();queue.push({label:0,metres:0});
 while(true){const item=queue.pop();if(!item)break;const current=labels[item.label];if(!front.get(current.node)?.includes(item.label))continue;
  const adjacency=direction==='toVehicle'?outgoing[current.node]:incoming[current.node];
  for(const id of adjacency){const edge=edges[id];if(!edge||edge.id!==id||!Number.isInteger(edge.from)||!Number.isInteger(edge.to)||edge.from<0||edge.to<0||edge.from>=nodeCount||edge.to>=nodeCount||
     (direction==='toVehicle'?edge.from!==current.node:edge.to!==current.node)||!Number.isFinite(edge.metres)||edge.metres<=0)throw new RangeError('Invalid boarding edge');
   if(blocked(edge))continue;const edgeCost=edgeEffort(edge);if(!Number.isFinite(edgeCost)||edgeCost<edge.metres)throw new RangeError('Invalid boarding effort');
   const node=direction==='toVehicle'?edge.to:edge.from,metres=current.metres+edge.metres,effort=current.effort+edgeCost;if(metres>max)continue;
   const prior=front.get(node)??[];if(prior.some(i=>labels[i].metres<=metres&&labels[i].effort<=effort))continue;
   const kept=prior.filter(i=>!(metres<=labels[i].metres&&effort<=labels[i].effort)),index=labels.length;labels.push({node,metres,effort,previous:item.label,edge:id});kept.push(index);front.set(node,kept);queue.push({label:index,metres});
  }
 }
 const result:BoardingRoute[]=[];
 for(const [node,vehicleNodes] of connectors){if(!Number.isInteger(node)||node<0||node>=nodeCount)throw new RangeError('Invalid connector node');
  for(const labelIndex of front.get(node)??[]){const label=labels[labelIndex],edgeIds:number[]=[];let i=labelIndex;while(labels[i].previous>=0){edgeIds.push(labels[i].edge);i=labels[i].previous;}
   if(direction==='toVehicle')edgeIds.reverse();
   for(const vehicleNode of vehicleNodes){if(!Number.isInteger(vehicleNode)||vehicleNode<0)throw new RangeError('Invalid vehicle node');result.push({walkingNode:node,vehicleNode,edgeIds:[...edgeIds],metres:label.metres,effort:label.effort});}
  }
 }
 return result.sort((a,b)=>a.effort-b.effort||a.metres-b.metres||a.walkingNode-b.walkingNode||a.vehicleNode-b.vehicleNode);
}
