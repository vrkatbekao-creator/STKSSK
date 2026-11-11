// Offline local Node prototype: one full campaign-state preview, not playable yet.
import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {initialCampaign} from '../src/game/campaign.ts';
import {mapFor,routingNodes} from '../src/game/campaign-map.ts';
import {parseVehicleGraph} from '../src/game/vehicle-graph-format.ts';
import {parseVehicleConnectors} from '../src/game/vehicle-connectors.ts';
import {vehicleTurnPolicy} from '../src/game/vehicle-turn-policy.ts';
import {newVehicleLedger} from '../src/game/vehicle-ledger.ts';
import {previewCampaignVehicleLeg} from '../src/game/campaign-vehicle-plans.ts';

const root=new URL('../',import.meta.url),read=path=>readFileSync(new URL(path,root)),sha=b=>createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(read('artifacts/vehicle-package-aligned.json'));
const linksManifest=JSON.parse(read('artifacts/vehicle-connectors-prototype.json'));
const zipped=read('.tools/vehicle-graph-prototype-v3.bin.gz');if(sha(zipped)!==manifest.gzipSha256)throw Error('vehicle package hash');
const raw=gunzipSync(zipped);if(sha(raw)!==manifest.binarySha256)throw Error('vehicle graph hash');
const graph=parseVehicleGraph(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength));
const compressedLinks=read('.tools/vehicle-connectors-prototype-v1.json.gz');if(sha(compressedLinks)!==linksManifest.gzipSha256)throw Error('connector compressed hash');
const links=gunzipSync(compressedLinks);if(sha(links)!==linksManifest.sha256)throw Error('connector hash');
const g=initialCampaign(17,'blue','streets-v2'),u=g.units.find(v=>v.id==='blue1'),map=mapFor(g);
g.news='clear';g.surprise=null;
const connectors=parseVehicleConnectors(JSON.parse(links),{walkingRevision:map.revision,vehicleRevision:manifest.revision,walkingNodes:routingNodes.length,vehicleNodes:graph.ids.length});
const metaRaw=gunzipSync(read('.tools/vehicle-graph-prototype-v1.meta.json.gz'));if(sha(metaRaw)!==manifest.metadataSha256)throw Error('turn metadata hash');
const meta=JSON.parse(metaRaw),via=new Map(Object.entries(meta.viaNodesByWay).map(([way,nodes])=>[BigInt(way),new Set(nodes.map(BigInt))]));
const context={graph,connectors,allowTurn:vehicleTurnPolicy(meta.turnRestrictions,via),edgeWeightQuarters:()=>4};
const dest=map.districts.find(d=>d.id==='6300200').anchor;
const beforeRss=process.memoryUsage().rss;
console.log('Starting full campaign preview');
const began=performance.now(),plan=previewCampaignVehicleLeg(g,u,dest,'drive',newVehicleLedger(g.day,u.team),context,{ap:2,materials:1});
const result={status:'offline Node preview; not a gameplay command',elapsedMs:Math.round(performance.now()-began),
  found:!!plan,from:u.cellId,to:dest,ap:plan?.totalAp??null,vehicleAp:plan?.vehicleAp??null,
  walkingAp:plan?.walkingAp??null,materials:plan?.materials??null,vehicleEdges:plan?.edgeIndices.length??null,
  rssBeforeBytes:beforeRss,rssAfterBytes:process.memoryUsage().rss,
  note:'Dry cost, no UI, no actual vehicle executor, local machine only; RSS includes process and loaded graphs.'};
writeFileSync(new URL('artifacts/vehicle-campaign-preview-audit.json',root),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
