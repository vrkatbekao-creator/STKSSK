import test from 'node:test';
import assert from 'node:assert/strict';
import {vehicleTurnPolicy} from '../src/game/vehicle-turn-policy.ts';
const relation=(restriction,type='n')=>({tags:{restriction},members:[
 {type:'w',role:'from',ref:10},{type,role:'via',ref:11},{type:'w',role:'to',ref:12}]});
test('node restrictions, exceptions, and malformed relations are handled conservatively',()=>{
 const no=vehicleTurnPolicy([relation('no_left_turn')],new Map());
 assert.equal(no(10n,11n,12n),false);assert.equal(no(10n,11n,13n),true);assert.equal(no(10n,15n,12n),true);
 const only=vehicleTurnPolicy([relation('only_straight_on')],new Map());
 assert.equal(only(10n,11n,12n),true);assert.equal(only(10n,11n,13n),false);
 const exempt=relation('no_left_turn');exempt.tags.except='bus;motorcar';
 assert.equal(vehicleTurnPolicy([exempt],new Map())(10n,11n,12n),true);
 const bad={tags:{restriction:'no_left_turn'},members:[{type:'w',role:'to',ref:10}]};
 assert.equal(vehicleTurnPolicy([bad],new Map())(10n,11n,12n),false);
});
test('via-way restrictions remain conservative only at relevant known junctions',()=>{
 const only=vehicleTurnPolicy([relation('only_straight_on','w')],new Map([[11n,new Set([100n,101n])]]));
 assert.equal(only(10n,99n,10n),true);assert.equal(only(10n,100n,11n),false);
 assert.equal(only(10n,100n,13n),false);
});
