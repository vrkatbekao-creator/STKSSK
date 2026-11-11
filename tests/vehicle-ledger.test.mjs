import test from 'node:test';
import assert from 'node:assert/strict';
import {newVehicleLedger, vehicleLedgerForDay, applyVehicleCharge, validVehicleLedger} from '../src/game/vehicle-ledger.ts';

const initial = () => ({ap: 14, materials: 8, fatigue: 0, health: 100});
const charge = (unitId, mode, metres, weighted = metres) => ({unitId, mode, actualQuarterMetres: metres * 4, weightedQuarterMetres: weighted * 4});

test('separate unit/mode AP allowances share one faction vehicle supply allowance', () => {
  const ledger = newVehicleLedger(1, 'blue');
  const a = applyVehicleCharge(ledger, initial(), charge('blue1', 'drive', 8000));
  assert.equal(a.ok, true); assert.deepEqual(a.cost, {ap: 2, supplies: 1, fatigue: 0, health: 0});
  const b = applyVehicleCharge(a.ledger, a.resources, charge('blue1', 'motorcade', 12000));
  assert.equal(b.ok, true); assert.deepEqual(b.cost, {ap: 6, supplies: 0, fatigue: 2, health: 2});
  const c = applyVehicleCharge(b.ledger, initial(), charge('blue2', 'drive', 1));
  assert.equal(c.ok, true); assert.equal(c.cost.supplies, 1); assert.equal(c.cost.ap, 1);
  assert.deepEqual(ledger, newVehicleLedger(1, 'blue'));
});

test('split journeys preserve balances and day/phase reads cannot reset allowance', () => {
  const day = newVehicleLedger(2, 'white');
  const one = applyVehicleCharge(day, initial(), charge('white1', 'motorcade', 6500));
  let ledger = day, resources = initial();
  for (const metres of [3000, 1000, 2500]) {
    const out = applyVehicleCharge(ledger, resources, charge('white1', 'motorcade', metres));
    assert.equal(out.ok, true); ledger = out.ledger; resources = out.resources;
    assert.equal(vehicleLedgerForDay(ledger, 2), ledger);
  }
  assert.deepEqual({ledger, resources}, {ledger: one.ledger, resources: one.resources});
  const restored = JSON.parse(JSON.stringify(ledger));
  const next = applyVehicleCharge(restored, resources, charge('white1', 'motorcade', 100));
  const uninterrupted = applyVehicleCharge(ledger, resources, charge('white1', 'motorcade', 100));
  assert.deepEqual(next, uninterrupted);
  assert.deepEqual(vehicleLedgerForDay(ledger, 3), newVehicleLedger(3, 'white'));
  assert.throws(() => vehicleLedgerForDay(ledger, 1), RangeError);
});

test('failed or malformed charges do not modify the input ledger or resources', () => {
  const ledger = newVehicleLedger(1, 'green'), resources = initial();
  assert.deepEqual(applyVehicleCharge(ledger, {...resources, ap: 0}, charge('green1', 'drive', 100)), {ok: false, reason: 'ap'});
  assert.deepEqual(applyVehicleCharge(ledger, {...resources, materials: 0}, charge('green1', 'drive', 100)), {ok: false, reason: 'materials'});
  for (const bad of [charge('blue1', 'drive', 100), charge('green1', 'drive', 0), charge('green1', 'drive', 100, 99)]) {
    assert.deepEqual(applyVehicleCharge(ledger, resources, bad), {ok: false, reason: 'invalid'});
  }
  assert.deepEqual(ledger, newVehicleLedger(1, 'green')); assert.deepEqual(resources, initial());
});

test('prepaid distance permits zero AP, while weather uses weighted distance and strain is bounded', () => {
  const a = applyVehicleCharge(newVehicleLedger(1, 'blue'), initial(), charge('blue1', 'drive', 1000));
  const b = applyVehicleCharge(a.ledger, {...a.resources, ap: 0}, charge('blue1', 'drive', 2000));
  assert.equal(b.ok, true); assert.equal(b.cost.ap, 0); assert.equal(b.cost.supplies, 0);
  const c = applyVehicleCharge(newVehicleLedger(1, 'blue'), {...initial(), fatigue: 10, health: 1},
    charge('blue1', 'motorcade', 2000, 2500));
  assert.equal(c.ok, true); assert.equal(c.cost.ap, 2); assert.equal(c.cost.supplies, 1);
  assert.equal(c.resources.fatigue, 10); assert.equal(c.resources.health, 0);
});

test('ledger validation rejects forged days, factions, members and impossible totals', () => {
  const start=newVehicleLedger(3,'blue'), members=['blue1','blue2','blue3'];
  assert.equal(validVehicleLedger(start,3,'blue',members),true);
  const result=applyVehicleCharge(start,initial(),charge('blue1','drive',100));
  const copy=JSON.parse(JSON.stringify(result.ledger));
  assert.equal(validVehicleLedger(copy,3,'blue',members),true);
  for(const bad of [{...copy,day:4},{...copy,team:'white'}, {...copy,actualQuarterMetres:401},
    {...copy,units:{blue7:{drive:400,motorcade:0}}}, {...copy,units:{blue1:{drive:-1,motorcade:0}}},
    {...copy,units:{blue1:{drive:400,motorcade:0,extra:1}}}, {...copy,extra:1}]) {
    assert.equal(validVehicleLedger(bad,3,'blue',members),false);
  }
});
