import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { availableParallelism, cpus } from 'node:os';
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';
import { manifest, readJsonPackage, readPackage } from '../src/map-packages.ts';
import { encodeRoutingMetadata, routingWorkerHandler } from '../src/game/rust-routing.ts';

if (isMainThread) {
  assert.equal(availableParallelism(), 1, 'Run this test with process affinity restricted to one logical CPU');
  const solo = await measure(false);
  const contended = await measure(true);
  assert.deepEqual(contended.counts, solo.counts);
  console.log(JSON.stringify({ cpu: cpus()[0]?.model, logicalCpus: availableParallelism(), solo, contended }, null, 2));
} else if (workerData === 'load') {
  // Keep one runnable worker on the same logical CPU throughout the measured run.
  parentPort.postMessage('ready');
  let accumulator = 17;
  const churn = () => {
    const until = performance.now() + 8;
    while (performance.now() < until) accumulator = Math.imul(accumulator, 31) + 1 | 0;
    setImmediate(churn);
  };
  churn();
} else {
  parentPort.on('message', routingWorkerHandler((reply, transfer) => parentPort.postMessage(reply, transfer)));
}

async function measure(contended) {
  console.error(contended ? 'Single CPU with a competing worker' : 'Single CPU without a competing worker');
  const rssBefore = process.memoryUsage().rss;
  const competitor = contended ? new Worker(new URL(import.meta.url), { workerData: 'load' }) : null;
  const worker = new Worker(new URL(import.meta.url), { workerData: 'routing' });
  let id = 0;
  let rssSampleMax = rssBefore;
  const sampleRss = () => { rssSampleMax = Math.max(rssSampleMax, process.memoryUsage().rss); };
  const timer = setInterval(sampleRss, 25);
  const request = (payload, transfer = []) => new Promise((resolve, reject) => {
    const requestId = ++id;
    const finish = (complete) => {
      clearTimeout(timeout);
      worker.off('error', onError);
      worker.off('message', onReply);
      complete();
    };
    const onError = (error) => finish(() => reject(error));
    const onReply = (reply) => {
      if (reply.id !== requestId) return;
      finish(() => reply.error ? reject(new Error(reply.error)) : resolve(reply.result));
    };
    const timeout = setTimeout(() => onError(new Error('Routing worker timed out')), 20_000);
    worker.once('error', onError);
    worker.on('message', onReply);
    worker.postMessage({ id: requestId, ...payload }, transfer);
  });
  try {
    if (competitor) await new Promise((resolve, reject) => {
      competitor.once('message', resolve);
      competitor.once('error', reject);
    });
    const started = performance.now();
    const [graph, meta, wasm] = await Promise.all([
      readPackage(manifest.core),
      readJsonPackage(manifest.meta),
      readFile(new URL('../stksst-core/target/wasm32-unknown-unknown/release/stksst_core.wasm', import.meta.url)),
    ]);
    const module = await WebAssembly.compile(wasm);
    const metadata = encodeRoutingMetadata(meta);
    await request({ kind: 'init', module, graph, metadata }, [graph, metadata]);
    const initializationMs = rounded(performance.now() - started);
    const anchorNodes = new Map(meta.anchors);
    const anchorCells = Object.values(meta.districtAnchors);
    const start = anchorNodes.get(meta.districtAnchors['6300500']);
    const target = anchorNodes.get(meta.districtAnchors['6300200']);
    assert.ok(Number.isInteger(start) && Number.isInteger(target));
    const blockedCells = anchorCells.filter((cell) => ![start, target].includes(anchorNodes.get(cell))).slice(0, 4);
    const cases = {
      reachable: { start, budget: 14, blockedCells },
      rainyTree: { start, budget: 14, rain: true, tree: true, blockedCells },
      crossDistrict: { start, target, budget: 14, algorithm: 'dijkstra', blockedCells },
    };
    const timings = {};
    const counts = {};
    for (const [name, query] of Object.entries(cases)) {
      const warmup = await request({ kind: 'query', query });
      assert.ok(warmup && warmup.values.length > 0);
      const { values, ap, effort } = warmup;
      counts[name] = { bytes: values.byteLength, ap, effort, first: values[0], last: values.at(-1) };
      const samples = [];
      for (let i = 0; i < 30; i++) {
        const begin = performance.now();
        const result = await request({ kind: 'query', query });
        samples.push(performance.now() - begin);
        assert.equal(result.ap, ap);
        assert.equal(result.effort, effort);
        assert.deepEqual(result.values, values);
        sampleRss();
      }
      samples.sort((a, b) => a - b);
      timings[name] = { medianMs: rounded(samples[14]), p95Ms: rounded(samples[28]), maxMs: rounded(samples[29]) };
      console.error(`${name}: 30 matching replies`);
    }
    return { initializationMs, rssBeforeMiB: rounded(rssBefore / 1048576),
      sampledPeakRssMiB: rounded(rssSampleMax / 1048576), timings, counts };
  } finally {
    clearInterval(timer);
    await Promise.all([worker.terminate(), competitor?.terminate()]);
  }
}

function rounded(value) { return +value.toFixed(2); }
