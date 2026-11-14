import { routingWorkerHandler } from './rust-routing.ts';
import type { RoutingWorkerRequest } from './rust-routing.ts';

const handle = routingWorkerHandler((message, transfer = []) => self.postMessage(message, { transfer }));
self.addEventListener('message', (event: MessageEvent<RoutingWorkerRequest>) => void handle(event.data));
