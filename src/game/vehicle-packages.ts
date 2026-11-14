import type {VehicleAsset} from './vehicle-verified-backend.ts';

const filenames:Record<VehicleAsset,string>={
 graph:'vehicle-graph-prototype-v3.bin.gz',
 metadata:'vehicle-graph-prototype-v1.meta.json.gz',
 connectors:'vehicle-connectors-prototype-v1.json.gz',
};

export async function readVehicleGzip(url:string){
 const response=await fetch(url,{signal:AbortSignal.timeout(30_000)});
 if(!response.ok||!response.body)throw new Error('Vehicle package unavailable');
 if(response.headers.get('Content-Encoding')==='gzip')return response.arrayBuffer();
 return new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}

type VehiclePackages=Record<VehicleAsset,ArrayBuffer>;
const preload=new Map<string,Promise<VehiclePackages>>();

function download(base:string){
 return Promise.all([
  readVehicleGzip(base+filenames.graph),
  readVehicleGzip(base+filenames.metadata),
  readVehicleGzip(base+filenames.connectors),
 ]).then(([graph,metadata,connectors])=>({graph,metadata,connectors}));
}

export function preloadVehiclePackages(base:string){
 if(preload.has(base))return;
 const pending=download(base);
 preload.set(base,pending);
 void pending.catch(()=>{if(preload.get(base)===pending)preload.delete(base);});
}

export async function takeVehiclePackages(base:string){
 const pending=preload.get(base);
 preload.delete(base);
 return pending?pending.catch(()=>download(base)):download(base);
}
