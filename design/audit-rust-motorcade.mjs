import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { districts, mapFor, streetSource } from '../src/game/campaign-map.ts';
import { initialCampaign } from '../src/game/campaign.ts';
import { endVehicleCampaignPhase } from '../src/game/campaign-vehicle-phase.ts';
import { createCampaignStore } from '../src/game/campaign-store.ts';
import { campaignVehicleCommand } from '../src/game/campaign-vehicle-runtime.ts';
import { createRustCampaignWorker } from '../src/game/rust-campaign-worker.ts';
import { instantiateRustRouting, encodeRoutingMetadata } from '../src/game/rust-routing.ts';
import { loadVerifiedVehicleBackend } from '../src/game/vehicle-verified-backend.ts';
import { manifest, readPackage } from '../src/map-packages.ts';

const paths = {
  graph: 'vehicle-graph-prototype-v3.bin.gz',
  metadata: 'vehicle-graph-prototype-v1.meta.json.gz',
  connectors: 'vehicle-connectors-prototype-v1.json.gz',
};
const backend = await loadVerifiedVehicleBackend(async asset => {
  const bytes = gunzipSync(await readFile(new URL('../.tools/' + paths[asset], import.meta.url)));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}, districts);
const module = await WebAssembly.compile(await readFile(new URL(
  '../stksst-core/target/wasm32-unknown-unknown/release/stksst_core.wasm', import.meta.url)));
const query = await instantiateRustRouting(module, await readPackage(manifest.core), encodeRoutingMetadata(streetSource));
let walkingSearches = 0;
const worker = createRustCampaignWorker(module, options => { walkingSearches++; return query(options); }, async () => backend);
const run = (game, command) => worker.run(game, 'test', command);
const slots = new Map();
let writes = 0;
const storage = { getItem: key => slots.get(key) ?? null, setItem: (key, value) => { slots.set(key, value); writes++; } };
const store = createCampaignStore(storage, 'streets-v2', backend, undefined, run);
store.getState().chooseSlot(3);
store.getState().start();
const before = { ...initialCampaign(17, 'blue', 'streets-v2'), news: 'rain', surprise: null, vehicle: store.getState().game.vehicle };
store.setState({ game: before });
const destination = mapFor(before).districts.find(d => d.id === '6300200').anchor;
const cmd = { unitId: 'blue1', mode: 'motorcade', cellId: destination };
const started = performance.now();
await store.getState().vehicleDispatch(cmd);
const arrived = store.getState();
assert.equal(arrived.error, null);
assert.equal(arrived.saveError, null);
assert.equal(arrived.lastVehicleEngine, 'wasm');
assert.equal(writes, 2);
const vehicleMs = Math.round(performance.now() - started);
console.log('WASM player command committed in %d ms', vehicleMs);
const vehicle = arrived.game.vehicle.teams.blue;
const journey = vehicle.journal.journeys[0];
assert.ok(journey.boardEdges.length + journey.alightEdges.length > 0);
assert.ok(journey.weights.every(weight => weight === 5));
assert.ok(vehicle.exposure.awarded > 0);
const reference = campaignVehicleCommand(before, 'blue', cmd, backend.runtime);
assert.equal(reference.error, undefined);
assert.equal(arrived.game.units[0].ap, reference.game.units[0].ap);
assert.equal(arrived.game.resources.blue.materials, reference.game.resources.blue.materials);
assert.equal(journey.actualQuarterMetres, reference.plan.actualQuarterMetres);
assert.equal(journey.weightedQuarterMetres, reference.plan.weightedQuarterMetres);
const resumes = () => {
  const reloaded = createCampaignStore(storage, 'streets-v2', backend);
  reloaded.getState().chooseSlot(3);
  reloaded.getState().resume();
  assert.equal(reloaded.getState().saveError, null);
  assert.deepEqual(reloaded.getState().game, store.getState().game);
};
resumes();
store.getState().end();
const night = store.getState().game;
const nightStart = performance.now();
const pending = store.getState().end();
assert.equal(store.getState().campaignPending, 'night');
store.getState().end();
await pending;
const morning = store.getState();
assert.equal(morning.game.day, 2);
assert.equal(morning.game.phase, 'day');
assert.equal(morning.saveError, null);
assert.equal(morning.lastNightEngine, 'wasm');
assert.ok(walkingSearches > 0 && morning.lastNightSearches > walkingSearches);
assert.equal(writes, 4);
const nightMs = Math.round(performance.now() - nightStart);
console.log('WASM AI night committed in %d ms', nightMs);
const rivalJourneys = Object.fromEntries(['green', 'white'].map(team => [
  team, morning.game.vehicle.teams[team].journal.journeys.map(j => j.mode),
]));
assert.ok(Object.values(rivalJourneys).every(journeys => journeys.length === 1));
assert.ok(Object.values(rivalJourneys).flat().includes('motorcade'));
assert.deepEqual(endVehicleCampaignPhase(night, night.vehicle, backend.runtime.contextFor,
  { fragmentsForRoute: backend.runtime.fragmentsForRoute }).game, morning.game);
resumes();
console.log(JSON.stringify({ vehicleMs, nightMs, ap: [before.units[0].ap, arrived.game.units[0].ap],
  motorcadeContacts: vehicle.exposure.awarded, rivalJourneys, walkingSearches, vehicleSearches: morning.lastNightSearches - walkingSearches,
  writes, slots: slots.size }));
