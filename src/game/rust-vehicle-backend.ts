import { districts } from './campaign-map.ts';
import { loadVerifiedVehicleBackend } from './vehicle-verified-backend.ts';

const assets = {
  graph: 'vehicle-graph-prototype-v3.bin.gz',
  metadata: 'vehicle-graph-prototype-v1.meta.json.gz',
  connectors: 'vehicle-connectors-prototype-v1.json.gz',
};

/** The experimental browser mode uses the same SHA-verified packages as the Node audit. */
export function readRustVehicleBackend(base: string) {
  return loadVerifiedVehicleBackend(async asset => {
    const response = await fetch(base + assets[asset], { signal: AbortSignal.timeout(30_000) });
    if (!response.ok || !response.body) throw new Error('Vehicle package unavailable');
    if (response.headers.get('Content-Encoding') === 'gzip') return response.arrayBuffer();
    return new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  }, districts);
}
