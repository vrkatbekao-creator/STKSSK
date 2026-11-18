import test from 'node:test';
import assert from 'node:assert/strict';
import { initialCampaign, campaignCommand, endCampaignPhase, actionCost, movement, routeFromMovement } from '../src/game/campaign.ts';
import { mapFor, streetCellMap, routingOutgoing, routingEdges } from '../src/game/campaign-map.ts';
import { outreachPolicy, outreachQuote } from '../src/game/campaign-outreach.ts';
import { roadAPPolicy } from '../src/game/road-movement.ts';
import { encodeSave, decodeSave, validSession } from '../src/game/campaign-save.ts';
import { initialVehicleState } from '../src/game/campaign-vehicle-state.ts';
import { newVehicleLedger } from '../src/game/vehicle-ledger.ts';
import { executeCampaignVehicle } from '../src/game/campaign-vehicle-drive.ts';

const act = (g, cmd, team = g.playerTeam) => {
  const out = campaignCommand(g, cmd, team);
  assert.equal(out.error, undefined, `${cmd.type} failed: ${out.error}`);
  return out.game;
};

test('Kaohsiung AP baseline, +4 night surge, HQ tokens and rest/staff savings work together', () => {
  let g = initialCampaign(12, 'white', 'streets-v2');
  g.news = 'clear';
  g.surprise = { id: 'heatwave', districtId: mapFor(g).districts[0].id, responses: { blue: null, green: null, white: null } };
  const leader = g.units.find(u => u.id === 'white1');
  assert.equal(leader.role, 'scout');
  assert.equal(leader.ap, 19);
  assert.deepEqual(g.hqTokens, { blue: 2, green: 2, white: 2 });

  // HQ tokens waive AP for prepare (0 AP) and respond (0 AP)
  assert.equal(actionCost(g, { type: 'prepare', unitId: leader.id }, 'white').ap, 0);
  g = act(g, { type: 'prepare', unitId: leader.id, topic: 'transport' }, 'white');
  assert.equal(g.units.find(u => u.id === 'white1').ap, 19);
  assert.equal(g.hqTokens.white, 1);

  assert.equal(actionCost(g, { type: 'respond', unitId: leader.id, choice: 'adapt' }, 'white').ap, 0);
  g = act(g, { type: 'respond', unitId: leader.id, choice: 'adapt' }, 'white');
  assert.equal(g.units.find(u => u.id === 'white1').ap, 19);
  assert.equal(g.hqTokens.white, 0);

  // When HQ tokens run out, fallback AP cost applies (2 AP for prepare)
  g.prepared.white = null;
  assert.equal(actionCost(g, { type: 'prepare', unitId: leader.id }, 'white').ap, 2);

  // Rest costs 1 AP (and grants +5 bonus health at home anchor)
  const w2 = g.units.find(u => u.id === 'white2');
  w2.career.health = 50;
  g = act(g, { type: 'rest', unitId: w2.id }, 'white');
  assert.equal(g.units.find(u => u.id === w2.id).ap, 14);
  assert.equal(g.units.find(u => u.id === w2.id).career.health, 68);

  // Entering night grants +4 Night Surge AP to all available units
  const beforeNight = g.units.find(u => u.id === leader.id).ap;
  const night = endCampaignPhase(g);
  assert.equal(night.phase, 'night');
  assert.equal(night.units.find(u => u.id === leader.id).ap, beforeNight + 4);
});

test('daily walking mileage pool shares 1800m/AP across consecutive street moves and saves cleanly', () => {
  let g = initialCampaign(5, 'blue', 'streets-v2');
  g.news = 'clear';
  g.surprise = null;
  assert.equal(roadAPPolicy.metresPerAP, 1800);
  assert.equal(outreachPolicy.sectorMetres, 1500);

  let u = g.units.find(x => x.id === 'blue1');
  const walk1 = movement(g, u, 1);
  const hop1 = [...walk1.costs]
    .map(([id, ap]) => ({ id, ap, route: routeFromMovement(u, id, walk1) }))
    .find(x => x.ap === 1 && x.route.effort > 100 && x.route.effort < 600);
  assert.ok(hop1);
  const startAp = u.ap;
  g = act(g, { type: 'move', unitId: u.id, cellId: hop1.id });
  u = g.units.find(x => x.id === 'blue1');
  assert.equal(u.ap, startAp - 1);
  assert.equal(u.walkCredit, 1800);
  assert.ok(u.walkedEffort < 600);

  // Second short hop inside remaining 1800m pool costs 0 AP!
  const walk2 = movement(g, u, 0);
  const hop2 = [...walk2.costs].find(([id, ap]) => id !== u.cellId && ap === 0);
  assert.ok(hop2, 'Unit should still move within prepaid 1800m pool even at 0 extra AP');
  g = act(g, { type: 'move', unitId: u.id, cellId: hop2[0] });
  assert.equal(g.units.find(x => x.id === 'blue1').ap, startAp - 1);

  const session = { game: g, selected: u.id, districtId: mapFor(g).cells.get(u.cellId).districtId, view: 'street' };
  assert.ok(validSession(session));
  const decoded = decodeSave(JSON.stringify(encodeSave(session)));
  assert.equal(decoded.error, null);
  assert.deepEqual(decoded.save.session.game, g);
});

test('motorcade arrival gives 1 AP drop-off combo and curbside boarding under 300m is free once pool is active', () => {
  let g = initialCampaign(17, 'green', 'streets-v2');
  g.news = 'clear';
  g.surprise = null;
  const u = g.units.find(x => x.id === 'green1');
  const start = streetCellMap.get(u.cellId).roadNode;
  const occupied = new Set(g.units.filter(x => x.id !== u.id).map(x => x.cellId));
  const edge = routingOutgoing[start].map(i => routingEdges[i]).find(e => e.metres > 20 && e.metres < 299 && !e.cellIds.some(c => occupied.has(c)))
    ?? routingEdges.find(e => e.from === start && e.metres > 0 && e.metres < 299)
    ?? routingEdges.find(e => e.metres > 20 && e.metres < 280);
  assert.ok(edge);
  const startNode = edge.from;
  if (startNode !== start) u.cellId = mapFor(g).cells.get(mapFor(g).cells.get(u.cellId).id)?.id ?? u.cellId;
  const fromCell = [...streetCellMap.values()].find(c => c.roadNode === startNode);
  u.cellId = fromCell.id;
  const graph = {
    ids: BigUint64Array.from([1n, 2n]),
    longitudes: new Float64Array(2),
    latitudes: new Float64Array(2),
    offsets: Uint32Array.from([0, 1, 1]),
    targets: Uint32Array.from([1]),
    ways: BigUint64Array.from([10n]),
    metres: Float64Array.from([300]),
  };
  const context = { graph, connectors: new Map([[startNode, [0]], [edge.to, [1]]]), allowTurn: () => true, edgeWeightQuarters: () => 4 };
  const ledger = newVehicleLedger(g.day, 'green');
  // Open daily walking pool first
  u.walkedEffort = 150;
  u.walkCredit = 1800;
  const out = executeCampaignVehicle(g, 'green', u.id, u.cellId, ledger, context, 'motorcade');
  assert.equal(out.error, undefined);
  assert.equal(out.plan.walkingAp, 0, 'Curbside boarding & alighting under 300m cost 0 AP once walk pool active');
  assert.equal(out.game.units.find(x => x.id === u.id).motorcadeComboCell, u.cellId);
  assert.equal(actionCost(out.game, { type: 'streetCanvass', unitId: u.id }, 'green').ap, 1);

  const canvassed = act(out.game, { type: 'streetCanvass', unitId: u.id }, 'green');
  assert.equal(canvassed.units.find(x => x.id === u.id).ap, out.game.units.find(x => x.id === u.id).ap - 1);
  assert.equal(canvassed.units.find(x => x.id === u.id).motorcadeComboCell, undefined);
});

test('Lai Shui-long skill grants 0 AP next field visit and 8km free drive credit', () => {
  let g = initialCampaign(8, 'green', 'streets-v2');
  g.news = 'clear';
  g.surprise = null;
  const u = g.units.find(x => x.id === 'green1');
  assert.equal(g.commanders.green, 'jiang');
  const beforeAp = u.ap;
  g = act(g, { type: 'skill', unitId: u.id }, 'green');
  assert.equal(g.units.find(x => x.id === u.id).ap, beforeAp - 2);
  assert.equal(g.units.find(x => x.id === u.id).freeVisitDay, g.day);
  assert.equal(g.freeVehicleQuarterMetres.green, 32000);
  assert.equal(actionCost(g, { type: 'streetCanvass', unitId: u.id }, 'green').ap, 0);
  g = act(g, { type: 'streetCanvass', unitId: u.id }, 'green');
  assert.equal(g.units.find(x => x.id === u.id).ap, beforeAp - 2);
  assert.equal(g.units.find(x => x.id === u.id).freeVisitDay, undefined);
});
