// Local routing prototype audit. This does not enable vehicle travel in the game.
import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {parseVehicleGraph} from '../src/game/vehicle-graph-format.ts';
import {vehicleRoute} from '../src/game/vehicle-routing.ts';
import {vehicleTurnPolicy} from '../src/game/vehicle-turn-policy.ts';
import {vehicleRouteFragments} from '../src/game/vehicle-geometry.ts';

const root=new URL('../',import.meta.url),hash=b=>createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(readFileSync(new URL('artifacts/vehicle-package-aligned.json',root),'utf8'));
const venues=JSON.parse(readFileSync(new URL('artifacts/vehicle-venue-prototype.json',root),'utf8'));
const packed=readFileSync(new URL('.tools/vehicle-graph-prototype-v3.bin.gz',root));
if(hash(packed)!==manifest.gzipSha256)throw Error('Vehicle graph compressed hash mismatch');
const raw=gunzipSync(packed);if(hash(raw)!==manifest.binarySha256)throw Error('Vehicle graph hash mismatch');
const graph=parseVehicleGraph(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength));
const metadata=gunzipSync(readFileSync(new URL('.tools/vehicle-graph-prototype-v1.meta.json.gz',root)));
if(hash(metadata)!==manifest.metadataSha256)throw Error('Vehicle metadata hash mismatch');
const data=JSON.parse(metadata.toString('utf8'));
const districts=JSON.parse(readFileSync(new URL('src/data/taipei-map.json',root),'utf8')).districts;
const viaNodes=new Map(Object.entries(data.viaNodesByWay).map(([way,nodes])=>[BigInt(way),new Set(nodes.map(BigInt))]));
const allowTurn=vehicleTurnPolicy(data.turnRestrictions,viaNodes);
function indexOfNode(id){const target=BigInt(id);let lo=0,hi=graph.ids.length;while(lo<hi){const mid=(lo+hi)>>1;if(graph.ids[mid]<target)lo=mid+1;else hi=mid;}if(graph.ids[lo]!==target)throw Error('Missing shared source node');return lo;}
const selected=[['6300100','6300200'],['6300500','6301200'],['6301200','6300800'],
 ['6301000','6300700'],['6300800','6301100'],['6300400','6300900']];
const cases=[];
for(const [from,to] of selected){
 const start=indexOfNode(venues.districtCandidates[from].node),end=indexOfNode(venues.districtCandidates[to].node);
 const began=performance.now(),route=vehicleRoute(graph,start,end,{allowTurn,edgeWeightQuarters:()=>4,maxWeightedQuarterMetres:400000});
 const elapsed=Math.round(performance.now()-began);
 if(!route)throw Error(`Expected dry venue candidate route not found: ${from} to ${to}`);
 const py=venues.candidatePairs.find(p=>p.from===from&&p.to===to);
 const fragments=vehicleRouteFragments(graph,route,districts),covered=fragments.reduce((sum,p)=>sum+p.end-p.start,0);
 if(covered>route.actualQuarterMetres)throw Error('Coverage exceeds vehicle distance');
 cases.push({from,to,edges:route.edgeIndices.length,actualMetres:route.actualQuarterMetres/4,pythonUnroundedMetres:py.metres,
  differenceMetres:Math.round((route.actualQuarterMetres/4-py.metres)*100)/100,routingMs:elapsed,
  coverageFragments:fragments.length,inCityMetres:covered/4,districts:[...new Set(fragments.map(p=>p.district))]});
}
const result={status:'local Node routing prototype; not a playable campaign route',cases,
 limitations:['Six dry candidate-node routes; no occupancy or walk connectors.',
 'Per-source-edge quarter-metre rounding changes length slightly and must be reviewed.',
 'District outlines use the existing game map; via-way and malformed restrictions are conservatively approximated.',
 'No independent geometry clipping audit or browser timing.']};
writeFileSync(new URL('artifacts/vehicle-routing-node-audit.json',root),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
