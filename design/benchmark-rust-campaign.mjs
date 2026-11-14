import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';

if (isMainThread) {
  const typescript = await run('typescript');
  const rust = await run('rust');
  assert.deepEqual(rust.moves, typescript.moves);
  assert.deepEqual(rust.nights, typescript.nights);
  console.log(JSON.stringify({ moves: rust.moves.length, nights: rust.nights.length,
    typescript: typescript.metrics, rust: rust.metrics }, null, 2));
} else {
  parentPort.postMessage(await exercise(workerData));
}

function run(mode) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL(import.meta.url), { workerData: mode });
    worker.once('message', resolve);
    worker.once('error', reject);
    worker.once('exit', (code) => {
      if (code !== 0) reject(new Error(`${mode} exited with code ${code}`));
    });
  });
}

async function exercise(mode) {
  const initStarted = performance.now();
  const adapter = mode === 'rust' ? await import('./rust-routing-campaign-adapter.ts') : null;
  if (adapter) {
    const wasm = await readFile(new URL('../stksst-core/target/wasm32-unknown-unknown/release/stksst_core.wasm', import.meta.url));
    await adapter.init(await WebAssembly.compile(wasm));
  }
  // Substitute only the campaign's search import in this isolated test worker.
  const hooks = adapter && registerHooks({
    resolve(specifier, context, next) {
      if (specifier === './road-movement.ts' && context.parentURL?.endsWith('/src/game/campaign.ts')) {
        return { url: new URL('./rust-routing-campaign-adapter.ts', import.meta.url).href, shortCircuit: true };
      }
      return next(specifier, context);
    },
  });
  const { initialCampaign, campaignCommand, endCampaignPhase, movement, routeFromMovement } =
    await import('../src/game/campaign.ts');
  hooks?.deregister();
  const { allCells } = await import('../src/game/campaign-map.ts');
  const { encodeSave, decodeSave, saveKey } = await import('../src/game/campaign-save.ts');
  const { createCampaignStore } = await import('../src/game/campaign-store.ts');
  const initializationMs = performance.now() - initStarted;
  const moves = [];
  const nights = [];
  const nightMs = [];
  const timestamp = '2026-11-14T12:00:00Z';
  const session = (game) => {
    const selected = game.units.find((unit) => unit.team === game.playerTeam);
    return { game, selected: selected.id, districtId: allCells.get(selected.cellId).districtId, view: 'street' };
  };

  let game = initialCampaign(17, 'blue', 'streets-v2');
  const actorId = 'blue1';
  for (const news of ['clear', 'rain']) {
    game = { ...game, news };
    const unit = game.units.find((candidate) => candidate.id === actorId);
    const walk = movement(game, unit, 2);
    const target = [...walk.costs].find(([, ap]) => ap === 2)?.[0];
    assert.ok(target, `expected 2 AP target in ${news}`);
    const quote = routeFromMovement(unit, target, walk);
    const outcome = campaignCommand(game, { type: 'move', unitId: actorId, cellId: target });
    assert.equal(outcome.error, undefined);
    game = outcome.game;
    assert.equal(game.units.find((candidate) => candidate.id === actorId).ap, unit.ap - quote.cost);
    assert.deepEqual(game.trail.blue.walks.at(-1).edgeIds, quote.edgeIds);
    const raw = JSON.stringify(encodeSave(session(game), timestamp));
    const storage = new Map([[saveKey(3), raw]]);
    const store = createCampaignStore({ getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) }, 'streets-v2');
    store.getState().chooseSlot(3);
    store.getState().resume();
    assert.equal(store.getState().started, true);
    assert.deepEqual(store.getState().game, game);
    assert.equal(storage.get(saveKey(3)), raw);
    moves.push(raw);
  }
  for (let i = 0; i < 3; i++) {
    game = endCampaignPhase(game);
    assert.equal(game.phase, 'night');
    const start = performance.now();
    game = endCampaignPhase(game);
    nightMs.push(+(performance.now() - start).toFixed(2));
    const raw = JSON.stringify(encodeSave(session(game), timestamp));
    const decoded = decodeSave(raw);
    assert.equal(decoded.error, null);
    assert.deepEqual(decoded.save.session.game, game);
    nights.push(raw);
    game = decoded.save.session.game;
  }
  if (adapter) assert.ok(adapter.metrics.calls > 2, 'AI did not use the Rust adapter');
  return { moves, nights, metrics: { initializationMs: +initializationMs.toFixed(2), nightMs,
    searchCalls: adapter?.metrics.calls, searchMs: adapter && +adapter.metrics.milliseconds.toFixed(2) } };
}
