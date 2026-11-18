import test from 'node:test';
import assert from 'node:assert/strict';
import {newMotorcadeLedger,motorcadeLedgerForDay,applyMotorcadeExposure,motorcadeHeat,creditMotorcadeContacts,validMotorcadeLedger} from '../src/game/campaign-motorcade.ts';
import {initialCampaign} from '../src/game/campaign.ts';
import {outreachQuote,touchOutreach,sectorKey} from '../src/game/campaign-outreach.ts';
import {allCells} from '../src/game/campaign-map.ts';
import {initialVehicleState} from '../src/game/campaign-vehicle-state.ts';
const part=(segment,sector,start,end,length=4000)=>({segment,sector:`6300500:${sector}`,district:'6300500',start,end,segmentLength:length});
const noHeat=()=>0;
test('split and duplicate coverage cannot create more influence than a single route',()=>{
 const original=newMotorcadeLedger(1,'blue'),full=applyMotorcadeExposure(original,[part('a','0,0',0,4000)],noHeat);
 let ledger=original,awards=0;
 for(const fragment of [part('a','0,0',0,700),part('a','0,0',700,4000),part('a','0,0',0,4000)]){
  const r=applyMotorcadeExposure(ledger,[fragment],noHeat);ledger=r.ledger;awards+=r.awards['6300500']??0;
 }
 assert.equal(awards,1);assert.deepEqual(ledger,full.ledger);assert.equal(original.uniqueQuarterMetres,0);
});
test('contacts wait for distance budget; saturated streets do not consume budget',()=>{
 const result=applyMotorcadeExposure(newMotorcadeLedger(1,'blue'),[part('a','0,0',0,1200),part('b','1,0',0,2800)],
  sector=>sector.endsWith('0,0')?3:0);
 assert.equal(result.ledger.contacts['6300500:0,0'].status,'blocked');
 assert.equal(result.ledger.contacts['6300500:1,0'].status,'awarded');
 assert.equal(result.awards['6300500'],1);assert.equal(result.newlyReached,2);
});
test('new day resets exposure, retains cooled heat and invalid input cannot mutate old state',()=>{
 const first=applyMotorcadeExposure(newMotorcadeLedger(1,'blue'),[part('a','0,0',0,4000)],noHeat).ledger;
 assert.equal(motorcadeLedgerForDay(first,1),first);
 const day3=motorcadeLedgerForDay(first,3);assert.equal(day3.uniqueQuarterMetres,0);
 const again=applyMotorcadeExposure(day3,[part('a','0,0',0,4000)],noHeat);
 assert.equal(again.ledger.heat['6300500:0,0'].value,1);
 assert.throws(()=>applyMotorcadeExposure(first,[part('a','0,0',0,5000)],noHeat),RangeError);
 assert.throws(()=>applyMotorcadeExposure(first,[part('__proto__','0,0',0,500)],noHeat),RangeError);
 assert.equal(first.uniqueQuarterMetres,4000);
});
test('team-wide daily influence cannot exceed 24 even across many distinct streets',()=>{
 const fragments=Array.from({length:30},(_,i)=>part(`road${i}`,`${i},0`,0,4000));
 const result=applyMotorcadeExposure(newMotorcadeLedger(1,'blue'),fragments,noHeat);
 assert.equal(result.ledger.awarded,24);assert.equal(result.awards['6300500'],24);
 assert.equal(result.ledger.queue.length,6);
});
test('walking can price the larger heat while keeping its own heat independent',()=>{
 const game=initialCampaign(17,'blue','streets-v2'),unit=game.units.find(x=>x.id==='blue1');
 const sector=sectorKey(allCells.get(unit.cellId)),normal=outreachQuote(game,'blue',unit.cellId,8);
 const carHeat={...newMotorcadeLedger(game.day,'blue'),heat:{[sector]:{day:game.day,value:3}}};
 const heat=motorcadeHeat(carHeat,sector,game.day),priced=outreachQuote(game,'blue',unit.cellId,8,heat);
 assert.equal(priced.points,normal.points-6);
 game.vehicle=initialVehicleState(game,'a'.repeat(64),'new');game.vehicle.teams.blue.exposure=carHeat;
 assert.equal(outreachQuote(game,'blue',unit.cellId,8).points,priced.points);
 assert.equal(touchOutreach(game,'blue',unit.cellId,8,heat),priced.points);
 assert.equal(game.outreach.blue.sectors[sector].heat,1);
 const first=creditMotorcadeContacts(carHeat,unit.id,3),second=creditMotorcadeContacts(first.ledger,unit.id,6);
 assert.equal(first.xp,1);assert.equal(second.xp,1);
});
test('exposure save validation checks interval unions, budgets, queues and credited contacts',()=>{
 const exposure=applyMotorcadeExposure(newMotorcadeLedger(1,'blue'),[part('a','0,0',0,4000)],noHeat);
 const valid=creditMotorcadeContacts(exposure.ledger,'blue1',exposure.newlyReached).ledger;
 assert.equal(validMotorcadeLedger(JSON.parse(JSON.stringify(valid)),1,'blue',['blue1']),true);
 for(const bad of [{...valid,uniqueQuarterMetres:4001},{...valid,awarded:2},
  {...valid,unitContacts:{blue1:0}},{...valid,queue:['missing']},{...valid,team:'white'}]){
  assert.equal(validMotorcadeLedger(bad,1,'blue',['blue1']),false);
 }
});
