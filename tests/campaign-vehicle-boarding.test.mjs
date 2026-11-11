import test from 'node:test';
import assert from 'node:assert/strict';
import {initialCampaign} from '../src/game/campaign.ts';
import {campaignBoardingRoutes} from '../src/game/campaign-vehicle-boarding.ts';
import {streetCellMap,routingOutgoing,routingEdges} from '../src/game/campaign-map.ts';

test('real walking graph exposes exact anchor connectors and rejects occupied endpoints',()=>{
 const g=initialCampaign(17,'blue','streets-v2'),u=g.units.find(x=>x.id==='blue1');
 const node=streetCellMap.get(u.cellId).roadNode,connectors=new Map([[node,[123]]]);
 for(const direction of ['toVehicle','fromVehicle']){
  const result=campaignBoardingRoutes(g,u,u.cellId,connectors,direction);
  assert.ok(result.some(x=>x.vehicleNode===123&&x.metres===0&&x.edgeIds.length===0));
 }
 const occupied=g.units.find(x=>x.id==='blue2');
 assert.deepEqual(campaignBoardingRoutes(g,u,occupied.cellId,connectors,'fromVehicle'),[]);
 assert.deepEqual(campaignBoardingRoutes(g,u,occupied.cellId,connectors,'toVehicle'),[]);
 u.bracedUntil=g.day;
 assert.deepEqual(campaignBoardingRoutes(g,u,u.cellId,connectors,'toVehicle'),[]);
});

test('real walking edges honor occupancy and produce ordered traversable paths',()=>{
 const g=initialCampaign(29,'blue','streets-v2'),u=g.units.find(x=>x.id==='blue1');
 const start=streetCellMap.get(u.cellId).roadNode,occupied=new Set(g.units.filter(x=>x.id!==u.id).map(x=>x.cellId));
 const edge=routingOutgoing[start].map(i=>routingEdges[i]).find(e=>e.metres<500&&!e.cellIds.some(c=>occupied.has(c)));
 assert.ok(edge);
 const options=campaignBoardingRoutes(g,u,u.cellId,new Map([[edge.to,[321]]]),'toVehicle');
 assert.ok(options.some(o=>o.vehicleNode===321&&o.edgeIds.length>0&&o.metres<=600));
 for(const option of options)for(let i=1;i<option.edgeIds.length;i++)assert.equal(routingEdges[option.edgeIds[i-1]].to,routingEdges[option.edgeIds[i]].from);
});
