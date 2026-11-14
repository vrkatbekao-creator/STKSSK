import test from 'node:test';
import assert from 'node:assert/strict';
import {initialCampaign,campaignCommand} from '../src/game/campaign.ts';
import {streetCellMap,routingOutgoing,routingEdges,mapFor} from '../src/game/campaign-map.ts';
import {newVehicleLedger} from '../src/game/vehicle-ledger.ts';
import {executeCampaignDrive} from '../src/game/campaign-vehicle-drive.ts';
import {simulateDriveItinerary} from '../src/game/campaign-vehicle-drive-itinerary.ts';
import {validVehicleJournal} from '../src/game/vehicle-journal.ts';
import {executeCampaignMotorcade} from '../src/game/campaign-vehicle-motorcade.ts';
import {newMotorcadeLedger} from '../src/game/campaign-motorcade.ts';
import {allCells} from '../src/game/campaign-map.ts';
import {initialVehicleState} from '../src/game/campaign-vehicle-state.ts';
import {encodeVehicleSave,decodeVehicleSave} from '../src/game/campaign-vehicle-save.ts';
import {encodeSave} from '../src/game/campaign-save.ts';
import {campaignVehicleCommand} from '../src/game/campaign-vehicle-runtime.ts';
import {outreachQuote,sectorKey} from '../src/game/campaign-outreach.ts';
import {replayVehicleExposure} from '../src/game/campaign-vehicle-replay.ts';

function setup(){
 const game=initialCampaign(17,'blue','streets-v2'),unit=game.units.find(u=>u.id==='blue1'),start=streetCellMap.get(unit.cellId).roadNode;
 const occupied=new Set(game.units.filter(x=>x.id!==unit.id).map(x=>x.cellId));
 const edge=routingOutgoing[start].map(i=>routingEdges[i]).find(e=>e.metres<500&&!e.cellIds.some(c=>occupied.has(c)));
 assert.ok(edge);
 const graph={ids:BigUint64Array.from([1n,2n]),longitudes:new Float64Array(2),latitudes:new Float64Array(2),
  offsets:Uint32Array.from([0,1,1]),targets:Uint32Array.from([1]),ways:BigUint64Array.from([10n]),metres:Float64Array.from([300])};
 return {game,unit,ledger:newVehicleLedger(game.day,'blue'),context:{graph,connectors:new Map([[start,[0]],[edge.to,[1]]]),allowTurn:()=>true,edgeWeightQuarters:()=>4}};
}
test('active vehicle rules reject legacy transfers without changing resources',()=>{
 const {game,unit}=setup();game.vehicle=initialVehicleState(game,'a'.repeat(64),'new');
 const before=structuredClone(game);
 for(const cmd of [{type:'transport',unitId:unit.id,districtId:'6300300'},{type:'siteTransfer',unitId:unit.id,nodeId:'invalid'}]){
  const result=campaignCommand(game,cmd);assert.equal(result.error,'c_errorTransport');assert.equal(result.game,game);
 }
 assert.deepEqual(game,before);
});
test('vehicle commands refuse an active campaign without the required history baseline',()=>{
 const {game,unit,context}=setup(),revision='a'.repeat(64);game.vehicle=initialVehicleState(game,revision,'new');
 game.vehicle.teams.blue.history.baseline=null;const before=structuredClone(game);
 const out=campaignVehicleCommand(game,'blue',{unitId:unit.id,mode:'drive',cellId:unit.cellId},
  {revision,contextFor:()=>context,fragmentsForRoute:()=>[]});
 assert.equal(out.error,'c_errorRoute');assert.equal(out.game,game);assert.deepEqual(game,before);
});
test('successful drive updates only copies with actual walking and vehicle costs',()=>{
 const {game,unit,ledger,context}=setup(),before=structuredClone(game),ledgerBefore=structuredClone(ledger);
 const out=executeCampaignDrive(game,'blue',unit.id,unit.cellId,ledger,context);
 assert.equal(out.error,undefined);assert.equal(out.game.units.find(u=>u.id===unit.id).ap,unit.ap-out.plan.totalAp);
 assert.equal(out.game.resources.blue.materials,game.resources.blue.materials-out.plan.materials);
 assert.equal(out.ledger.actualQuarterMetres,1200);assert.equal(out.game.actions,game.actions+1);
 const start=streetCellMap.get(unit.cellId).roadNode;
 const journal={revision:'fixture',ledger:out.ledger,journeys:[out.journey]};
 assert.equal(validVehicleJournal(journal,{revision:'fixture',day:game.day,phase:game.phase,team:'blue',
  unitIds:game.units.filter(u=>u.team==='blue').map(u=>u.id),graph:context.graph,walkingEdges:routingEdges,
  cellRoadNode:new Map([[unit.cellId,start]]),connectors:context.connectors,allowTurn:context.allowTurn}),true);
 assert.deepEqual(game,before);assert.deepEqual(ledger,ledgerBefore);
});
test('unavailable actor or unaffordable plan returns original state and ledger',()=>{
 const {game,unit,ledger,context}=setup();unit.ap=0;const before=structuredClone(game);
 const out=executeCampaignDrive(game,'blue',unit.id,unit.cellId,ledger,context);
 assert.equal(out.error,'c_errorRoute');assert.equal(out.game,game);assert.equal(out.ledger,ledger);assert.deepEqual(game,before);
 assert.equal(executeCampaignDrive(game,'white',unit.id,unit.cellId,ledger,context).error,'c_errorUnit');
});
test('multi-stop drives share allowance and late activity failure rolls back the ledger',()=>{
 const {game,unit,ledger,context}=setup(),before=structuredClone(game);
 const travel={unitId:unit.id,mode:'drive',cellId:unit.cellId};
 const good=simulateDriveItinerary(game,ledger,'blue',unit.id,[{travel},{travel}],context);
 assert.equal(good.error,undefined);assert.equal(good.plans.length,2);
 assert.equal(good.plans[0].vehicleAp,1);assert.equal(good.plans[1].vehicleAp,0);
 assert.equal(good.ledger.actualQuarterMetres,2400);assert.deepEqual(game,before);
 const start=streetCellMap.get(unit.cellId).roadNode;
 assert.equal(validVehicleJournal({revision:'fixture',ledger:good.ledger,journeys:good.journeys},
  {revision:'fixture',day:game.day,phase:game.phase,team:'blue',unitIds:game.units.filter(u=>u.team==='blue').map(u=>u.id),
   graph:context.graph,walkingEdges:routingEdges,cellRoadNode:new Map([[unit.cellId,start]]),
   connectors:context.connectors,allowTurn:context.allowTurn}),true);
 const failed=simulateDriveItinerary(game,ledger,'blue',unit.id,
  [{travel},{travel,action:{type:'canvass',unitId:unit.id,nodeId:'not-a-place'}}],context);
 assert.ok(failed.error);assert.equal(failed.game,game);assert.equal(failed.ledger,ledger);assert.deepEqual(game,before);
});
test('motorcade exposure uses shared faction coverage and rejects excessive fragments atomically',()=>{
 const {game,unit,ledger,context}=setup(),before=structuredClone(game),district=allCells.get(unit.cellId).districtId;
 context.graph.metres[0]=1200;
 const exposure=newMotorcadeLedger(game.day,'blue');
 const fragment={segment:'road:1',district,sector:`${district}:0,0`,start:0,end:4800,segmentLength:4800};
 const first=executeCampaignMotorcade(game,'blue',unit.id,unit.cellId,ledger,exposure,context,()=>[fragment]);
 assert.equal(first.error,undefined);assert.equal(first.contacts,1);
 assert.equal(first.game.support[district].blue,game.support[district].blue+1);
 const second=executeCampaignMotorcade(first.game,'blue',unit.id,unit.cellId,first.ledger,first.exposure,context,()=>[fragment]);
 assert.equal(second.error,undefined);assert.equal(second.game.support[district].blue,first.game.support[district].blue);
 const bad=executeCampaignMotorcade(game,'blue',unit.id,unit.cellId,ledger,exposure,context,()=>[{...fragment,end:4801,segmentLength:4801}]);
 assert.ok(bad.error);assert.equal(bad.game,game);assert.equal(bad.ledger,ledger);assert.deepEqual(game,before);
});
test('vehicle save prototype round-trips a verified actual journey without reissuing AP',()=>{
 const {game,unit,ledger,context}=setup(),result=executeCampaignDrive(game,'blue',unit.id,unit.cellId,ledger,context);
 assert.equal(result.error,undefined);const revision='a'.repeat(64),state=initialVehicleState(game,revision,'new');
 state.teams.blue.journal={revision,ledger:result.ledger,journeys:[result.journey]};
 const cellNodes=new Map([[unit.cellId,streetCellMap.get(unit.cellId).roadNode]]);
 const ctx={revision,journalContext:(g,team)=>({revision,day:g.day,phase:g.phase,team,
  unitIds:g.units.filter(u=>u.team===team).map(u=>u.id),graph:context.graph,walkingEdges:routingEdges,
  cellRoadNode:cellNodes,connectors:context.connectors,allowTurn:context.allowTurn}),
  verifyExposure:(g,team,state)=>replayVehicleExposure(g,team,state,context.graph,[])};
 const session={game:{...result.game,vehicle:state},selected:unit.id,districtId:mapFor(game).cells.get(unit.cellId).districtId,view:'street'};
 const saved=encodeVehicleSave(session,ctx,'2026-11-11T00:00:00.000Z'),loaded=decodeVehicleSave(JSON.stringify(saved),ctx);
 assert.equal(loaded.error,null);assert.equal(loaded.session.game.units.find(u=>u.id===unit.id).ap,result.game.units.find(u=>u.id===unit.id).ap);
 assert.deepEqual(loaded.session.game.vehicle.teams.blue.journal,session.game.vehicle.teams.blue.journal);
 state.teams.blue.journal.journeys[0].carEdges=[999];assert.throws(()=>encodeVehicleSave(session,ctx,'2026-11-11T00:00:00.000Z'));
});
test('backend vehicle command keeps the ledger in game state and applies motorcade heat',()=>{
 const {game,unit,context}=setup(),revision='a'.repeat(64),district=allCells.get(unit.cellId).districtId;
 const sector=sectorKey(allCells.get(unit.cellId));context.graph.metres[0]=1200;
 game.vehicle=initialVehicleState(game,revision,'new');const before=structuredClone(game),normal=outreachQuote(game,'blue',unit.cellId,8);
 const fragment={segment:'road:1',district,sector,start:0,end:4800,segmentLength:4800};
 const runtime={revision,contextFor:()=>context,fragmentsForRoute:()=>[fragment]};
 const out=campaignVehicleCommand(game,'blue',{unitId:unit.id,mode:'motorcade',cellId:unit.cellId},runtime);
 assert.equal(out.error,undefined);assert.equal(out.game.support[district].blue,game.support[district].blue+1);
 assert.equal(out.game.vehicle.teams.blue.journal.journeys[0].mode,'motorcade');
 assert.equal(outreachQuote(out.game,'blue',unit.cellId,8).points,normal.points-2);assert.deepEqual(game,before);
 const session={game:out.game,selected:unit.id,districtId:district,view:'street'};
 assert.throws(()=>encodeSave(session));
 const start=streetCellMap.get(unit.cellId).roadNode;
 const ctx={revision,journalContext:(g,team)=>({revision,day:g.day,phase:g.phase,team,
  unitIds:g.units.filter(u=>u.team===team).map(u=>u.id),graph:context.graph,walkingEdges:routingEdges,
  cellRoadNode:new Map([[unit.cellId,start]]),connectors:context.connectors,allowTurn:context.allowTurn})};
 assert.throws(()=>encodeVehicleSave(session,ctx,'2026-11-11T00:00:00.000Z'));
 const trusted={...ctx,verifyExposure:()=>true};
 const saved=encodeVehicleSave(session,trusted,'2026-11-11T00:00:00.000Z');
 assert.equal(decodeVehicleSave(JSON.stringify(saved),trusted).error,null);
});
