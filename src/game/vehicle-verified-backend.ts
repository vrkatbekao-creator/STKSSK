/** Backend-only prototype loader. The caller supplies decompressed immutable local bytes. */
import {streetSource,routingNodes} from './campaign-map.ts';
import type {CoverageDistrict} from './vehicle-geometry.ts';
import {parseVehicleGraph} from './vehicle-graph-format.ts';
import {parseVehicleConnectors} from './vehicle-connectors.ts';
import {parseVehicleTurnMetadata,createVehicleRuntime,createVehicleSaveContext} from './vehicle-runtime-factory.ts';

const fixed=Object.freeze({
 revision:'bcfe2b6758c6943be71adad779a5a639125107c0116bdcb6b94b518825428955',
 walkingRevision:'324e9a8435d22e7d1876af469e16e7c23ae0d2e9eb06116f1810e34b7106477f',
 source:'b7ff3500b40dfbb508f59a93026a950f16f9a9efa1dec63bb278b474823d3ffe',
 graph:'8a024d1b7a313b7e895b808920ea6e4da8d6d99515d2e48f057fc66dc07ffb1f',
 metadata:'9efb8952c183f1f84e007ab2ad5891e6a0bccaab245694f4cec905659ba906ed',
 connectors:'ec1d8865e495e3348382be43e88cc69f15983d63579098c9ee318ac733ceebd9',
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
 return {runtime,saveContext:createVehicleSaveContext(runtime,graph,connectors,districts)};
}
