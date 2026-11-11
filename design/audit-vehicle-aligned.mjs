// Local Node measurement only, not a browser or end-user hardware benchmark.
import {readFileSync, writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {parseVehicleGraph} from '../src/game/vehicle-graph-format.ts';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('artifacts/vehicle-package-aligned.json', root), 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const start = performance.now(), compressed = readFileSync(new URL('.tools/vehicle-graph-prototype-v3.bin.gz', root));
const readEnd = performance.now();
if (hash(compressed) !== manifest.gzipSha256) throw Error('Compressed hash mismatch');
const raw = gunzipSync(compressed), decompressed = performance.now();
if (hash(raw) !== manifest.binarySha256) throw Error('Content hash mismatch');
// Buffer's backing allocation may contain unrelated bytes; select the exact byte range.
const exact = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
const beforeValidation = performance.now(), graph = parseVehicleGraph(exact), validated = performance.now();
if (graph.ids.length !== manifest.nodes || graph.targets.length !== manifest.directedEdges) throw Error('Count mismatch');
const memory = process.memoryUsage();
const result = {status: 'local Node prototype audit; browser and hardware tests pending', revision: manifest.revision,
  nodes: graph.ids.length, directedEdges: graph.targets.length, compressedBytes: compressed.byteLength,
  uncompressedBytes: exact.byteLength, readMs: Math.round(readEnd-start),
  decompressAndCompressedHashMs: Math.round(decompressed-readEnd), validationMs: Math.round(validated-beforeValidation),
  rssBytes: memory.rss, arrayBuffersBytes: memory.arrayBuffers,
  limitations: ['Local filesystem and Node, not a browser or network measurement.',
    'RSS includes the process and duplicate buffers; it is not incremental game memory.',
    'Turn semantics, route planning and gameplay are not validated by this parser.']};
writeFileSync(new URL('artifacts/vehicle-aligned-node-audit.json', root), JSON.stringify(result, null, 2)+'\n');
console.log(JSON.stringify(result));
