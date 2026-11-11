import test from 'node:test';
import assert from 'node:assert/strict';
import {incrementalAllowance, quoteVehicleCost} from '../src/game/vehicle-cost.ts';

test('splitting travel never changes cumulative AP or vehicle supplies', () => {
  let weighted = 0, team = 0, ap = 0, supplies = 0, fatigue = 0;
  for (const metres of [150, 775, 2300, 4000, 12775]) {
    const added = metres * 4;
    const quote = quoteVehicleCost({mode: 'motorcade', previousWeightedQuarterMetres: weighted,
      addedWeightedQuarterMetres: added, previousTeamQuarterMetres: team, addedTeamQuarterMetres: added});
    weighted += added; team += added; ap += quote.ap; supplies += quote.supplies; fatigue += quote.fatigue;
  }
  const once = quoteVehicleCost({mode: 'motorcade', previousWeightedQuarterMetres: 0,
    addedWeightedQuarterMetres: weighted, previousTeamQuarterMetres: 0, addedTeamQuarterMetres: team});
  assert.deepEqual({ap, supplies, fatigue, health: fatigue}, once);
});

test('prepaid travel can add zero AP and respects exact quarter-metre boundaries', () => {
  assert.equal(incrementalAllowance(1, 15999, 16000), 0);
  assert.equal(incrementalAllowance(16000, 1, 16000), 1);
  assert.equal(incrementalAllowance(9007199254740987, 1, 3), 1);
  assert.deepEqual(quoteVehicleCost({mode: 'drive', previousWeightedQuarterMetres: 0,
    addedWeightedQuarterMetres: 32000, previousTeamQuarterMetres: 0, addedTeamQuarterMetres: 32000}),
    {ap: 2, supplies: 1, fatigue: 0, health: 0});
});

test('rejects invalid or unsafe ledger values', () => {
  for (const previous of [-1, NaN, 1.1, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => incrementalAllowance(previous, 1, 10), RangeError);
  }
  assert.throws(() => incrementalAllowance(0, 1, 0), RangeError);
});
