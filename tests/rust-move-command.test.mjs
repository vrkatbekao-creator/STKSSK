import assert from 'node:assert/strict';
import test from 'node:test';
import { campaignCommand, initialCampaign, movement, routeFromMovement } from '../src/game/campaign.ts';
import { allCells } from '../src/game/campaign-map.ts';
import { createCampaignStore } from '../src/game/campaign-store.ts';
import { encodeSave, saveKey } from '../src/game/campaign-save.ts';

function fixture(planner, runWasm) {
  const game = { ...initialCampaign(17, 'blue', 'streets-v2'), news: 'clear' };
  const unit = game.units.find((unit) => unit.id === 'blue1');
  const walk = movement(game, unit, 2);
  const target = [...walk.costs].find(([, ap]) => ap === 2)[0];
  const expected = routeFromMovement(unit, target, walk);
  const bytes = JSON.stringify(encodeSave({ game, selected: unit.id,
    districtId: allCells.get(unit.cellId).districtId, view: 'street' }));
  const data = new Map([[saveKey(3), bytes]]);
  const writes = [];
  const store = createCampaignStore({ getItem: key => data.get(key) ?? null,
    setItem: (key, value) => { writes.push(key); data.set(key, value); } }, 'streets-v2', undefined, planner, runWasm);
  store.getState().chooseSlot(3);
  store.getState().resume();
  return { store, writes, cmd: { type: 'move', unitId: unit.id, cellId: target }, edges: Uint32Array.from(expected.edgeIds) };
}

test('the asynchronous walking command matches the existing command and saves exactly once', async () => {
  const f = fixture(async () => f.edges);
  const expected = campaignCommand(f.store.getState().game, f.cmd);
  await f.store.getState().dispatch(f.cmd);
  assert.equal(f.store.getState().lastMoveEngine, 'wasm');
  assert.deepEqual(f.store.getState().game, expected.game);
  assert.deepEqual(f.writes, [saveKey(3)]);
  f.store.getState().resume();
  assert.deepEqual(f.store.getState().game, expected.game);
});

test('invalid edges and replies arriving after the phase changes cannot commit', async () => {
  let reply;
  const f = fixture(() => new Promise(resolve => { reply = resolve; }));
  const before = f.store.getState().game;
  const invalid = f.store.getState().dispatch(f.cmd);
  reply(Uint32Array.of(0xffffffff));
  await invalid;
  assert.equal(f.store.getState().error, 'c_errorRoute');
  assert.equal(f.store.getState().game, before);
  assert.deepEqual(f.writes, []);
  const pending = f.store.getState().dispatch(f.cmd);
  f.store.getState().end();
  const night = f.store.getState().game;
  assert.equal(night.phase, 'night');
  reply(f.edges);
  await pending;
  assert.equal(f.store.getState().game, night);
  assert.deepEqual(f.writes, [saveKey(3)]);
});

test('worker failure falls back to the existing move command', async () => {
  const f = fixture(async () => { throw new Error('Worker unavailable'); });
  await f.store.getState().dispatch(f.cmd);
  assert.equal(f.store.getState().lastMoveEngine, 'typescript');
  assert.deepEqual(f.writes, [saveKey(3)]);
});

test('night settlement waits for a pending move and discards a reply after leaving the game', async () => {
  let replyMove, replyNight;
  const f = fixture(() => new Promise(resolve => { replyMove = resolve; }),
    () => new Promise(resolve => { replyNight = resolve; }));
  f.store.getState().end();
  const walking = f.store.getState().dispatch(f.cmd);
  assert.equal(f.store.getState().end(), undefined);
  assert.equal(replyNight, undefined);
  replyMove(f.edges);
  await walking;
  const night = f.store.getState().game;
  const pending = f.store.getState().end();
  assert.equal(f.store.getState().campaignPending, 'night');
  assert.equal(f.store.getState().end(), undefined);
  f.store.getState().menu();
  replyNight({ game: { ...night, day: 2 }, searches: 10 });
  await pending;
  assert.equal(f.store.getState().started, false);
  assert.equal(f.store.getState().campaignPending, null);
  assert.deepEqual(f.writes, [saveKey(3), saveKey(3), saveKey(3)]);
  f.store.getState().resume();
  assert.deepEqual(f.store.getState().game, night);
});
