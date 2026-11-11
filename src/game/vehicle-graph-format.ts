/** Aligned VGP3 prototype parser. Not wired into game loading or saves. */
export type VehicleGraphColumns = {
  ids: BigUint64Array; longitudes: Float64Array; latitudes: Float64Array;
  offsets: Uint32Array; targets: Uint32Array; ways: BigUint64Array; metres: Float64Array;
};
const MAX_NODES = 2_000_000, MAX_EDGES = 5_000_000;
const align8 = (value: number) => Math.ceil(value / 8) * 8;

/** Caller must verify the trusted revision and SHA before parsing. */
export function parseVehicleGraph(buffer: ArrayBuffer): VehicleGraphColumns {
  if (buffer.byteLength < 16) throw new Error('Truncated vehicle graph');
  const endianProbe = new Uint8Array(new Uint16Array([1]).buffer);
  if (endianProbe[0] !== 1 || typeof BigUint64Array === 'undefined') throw new Error('Unsupported vehicle graph platform');
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x33504756 || view.getUint32(12, true) !== 0) throw new Error('Invalid vehicle graph header');
  const n = view.getUint32(4, true), m = view.getUint32(8, true);
  if (n > MAX_NODES || m > MAX_EDGES) throw new Error('Vehicle graph too large');
  const idAt = 16, lonAt = idAt + 8*n, latAt = lonAt + 8*n, offAt = latAt + 8*n;
  const targetAt = offAt + 4*(n+1), wayAt = align8(targetAt + 4*m), metresAt = wayAt + 8*m;
  if (buffer.byteLength !== metresAt + 8*m) throw new Error('Invalid vehicle graph size');
  const ids = new BigUint64Array(buffer, idAt, n), longitudes = new Float64Array(buffer, lonAt, n);
  const latitudes = new Float64Array(buffer, latAt, n), offsets = new Uint32Array(buffer, offAt, n+1);
  const targets = new Uint32Array(buffer, targetAt, m), ways = new BigUint64Array(buffer, wayAt, m);
  const metres = new Float64Array(buffer, metresAt, m);
  if (offsets[0] !== 0 || offsets[n] !== m) throw new Error('Invalid vehicle graph offsets');
  for (let i = 0; i < n; i++) {
    if (offsets[i] > offsets[i+1] || offsets[i+1] > m || (i > 0 && ids[i] <= ids[i-1]) ||
        !Number.isFinite(longitudes[i]) || Math.abs(longitudes[i]) > 180 ||
        !Number.isFinite(latitudes[i]) || Math.abs(latitudes[i]) > 90) throw new Error('Invalid vehicle graph node');
  }
  for (let i = 0; i < m; i++) {
    if (targets[i] >= n || !Number.isFinite(metres[i]) || metres[i] <= 0) throw new Error('Invalid vehicle graph edge');
  }
  return {ids, longitudes, latitudes, offsets, targets, ways, metres};
}
