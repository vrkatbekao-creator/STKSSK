import test from 'node:test';
import assert from 'node:assert/strict';
import {parseVehicleGraph} from '../src/game/vehicle-graph-format.ts';

function fixture() {
  const buffer = new ArrayBuffer(96), view = new DataView(buffer);
  view.setUint32(0, 0x33504756, true); view.setUint32(4, 2, true); view.setUint32(8, 1, true);
  new BigUint64Array(buffer, 16, 2).set([10n, 20n]);
  new Float64Array(buffer, 32, 2).set([121.001, 121]);
  new Float64Array(buffer, 48, 2).set([25, 25]);
  new Uint32Array(buffer, 64, 3).set([0, 0, 1]);
  new Uint32Array(buffer, 76, 1).set([0]);
  new BigUint64Array(buffer, 80, 1).set([8n]);
  new Float64Array(buffer, 88, 1).set([100]);
  return buffer;
}

test('aligned columns preserve IDs, direction and distances without copying', () => {
  const buffer = fixture(), graph = parseVehicleGraph(buffer);
  assert.equal(graph.ids.buffer, buffer);
  assert.deepEqual([...graph.ids], [10n, 20n]);
  assert.deepEqual([...graph.offsets], [0, 0, 1]);
  assert.deepEqual([...graph.targets], [0]); assert.deepEqual([...graph.ways], [8n]);
  assert.equal(graph.metres[0], 100);
});

test('rejects corrupted lengths, offsets, coordinates and edges', () => {
  assert.throws(() => parseVehicleGraph(fixture().slice(0, 95)));
  const mutate = (offset, method, value) => {const b = fixture(); new DataView(b)[method](offset, value, true); return b;};
  assert.throws(() => parseVehicleGraph(mutate(0, 'setUint32', 0)));
  assert.throws(() => parseVehicleGraph(mutate(68, 'setUint32', 2)));
  assert.throws(() => parseVehicleGraph(mutate(76, 'setUint32', 2)));
  assert.throws(() => parseVehicleGraph(mutate(32, 'setFloat64', NaN)));
  assert.throws(() => parseVehicleGraph(mutate(88, 'setFloat64', 0)));
  assert.throws(() => parseVehicleGraph(mutate(4, 'setUint32', 2_000_001)));
});

test('handles padding before 64-bit edge columns', () => {
  const b = new ArrayBuffer(72), v = new DataView(b);
  v.setUint32(0, 0x33504756, true); v.setUint32(4, 1, true); v.setUint32(8, 1, true);
  new BigUint64Array(b, 16, 1)[0] = 42n;
  new Float64Array(b, 24, 1)[0] = 121;
  new Float64Array(b, 32, 1)[0] = 25;
  new Uint32Array(b, 40, 2).set([0, 1]);
  new Uint32Array(b, 48, 1)[0] = 0;
  new BigUint64Array(b, 56, 1)[0] = 99n;
  new Float64Array(b, 64, 1)[0] = 10;
  const graph = parseVehicleGraph(b);
  assert.equal(graph.ways[0], 99n); assert.equal(graph.metres[0], 10);
});
