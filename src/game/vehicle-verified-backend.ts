/** Backend-only prototype loader. The caller supplies decompressed immutable local bytes. */
import {streetSource,routingNodes} from './campaign-map.ts';
import type {CoverageDistrict} from './vehicle-geometry.ts';
import {parseVehicleGraph} from './vehicle-graph-format.ts';
import {parseVehicleConnectors} from './vehicle-connectors.ts';
import {parseVehicleTurnMetadata,createVehicleRuntime,createVehicleSaveContext} from './vehicle-runtime-factory.ts';

const fixed=Object.freeze({
 revision:'7de215380c56bc2a4dcca4aceacefa768d2490fea0b69ab7a5d15d2c754c3841',
 walkingRevision:'13446e24a86edcda147420f6d6d3799bda7acbff7818550292c656e70895a2f7',
 source:'16e35ff21c254f81649bd1692f8bb1ba3a5eb6276a6603433c4e25459b4a0259',
 graph:'82cf8302c13cced9bf0377362ccaf314320ede3d1fa366ed4285608b59e5c27d',
 metadata:'64955b5bfbab8558bce8a452e323fc45461ca1237ba75254100d59dc26de0ee7',
 connectors:'82f69f34e5596895654648c6c1a41e4ff2cac64919ba245574290e4fb0072c29',
});
export type VehicleAsset='graph'|'metadata'|'connectors';
async function authenticated(bytes:ArrayBuffer,hash:string,maximum:number){
 if(!(bytes instanceof ArrayBuffer)||bytes.byteLength===0||bytes.byteLength>maximum)throw Error('Invalid vehicle package size');
 const actual=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
 if(actual!==hash)throw Error('Vehicle package checksum mismatch');
}

/** Never accepts an externally supplied manifest; failed loads do not initialize game state. */
export async function loadVerifiedVehicleBackend(read:(asset:VehicleAsset)=>Promise<ArrayBuffer>,districts:readonly CoverageDistrict[]){
 if(streetSource.revision!==fixed.walkingRevision)throw Error('Incompatible walking network');
 const [binary,metadataBytes,connectorBytes]=await Promise.all([read('graph'),read('metadata'),read('connectors')]);
 await Promise.all([authenticated(binary,fixed.graph,60_000_000),authenticated(metadataBytes,fixed.metadata,20_000_000),authenticated(connectorBytes,fixed.connectors,10_000_000)]);
 const graph=parseVehicleGraph(binary),decoder=new TextDecoder('utf-8',{fatal:true});
 const metadata=JSON.parse(decoder.decode(metadataBytes)),connectorData=JSON.parse(decoder.decode(connectorBytes));
 const turns=parseVehicleTurnMetadata(metadata,fixed.source),connectors=parseVehicleConnectors(connectorData,{walkingRevision:fixed.walkingRevision,
  vehicleRevision:fixed.revision,walkingNodes:routingNodes.length,vehicleNodes:graph.ids.length});
 const runtime=createVehicleRuntime(fixed.revision,graph,connectors,turns,districts);
 return {graph,runtime,turns,districts,saveContext:createVehicleSaveContext(runtime,graph,connectors,districts)};
}
