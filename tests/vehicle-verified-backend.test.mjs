import test from 'node:test';
import assert from 'node:assert/strict';
import {loadVerifiedVehicleBackend} from '../src/game/vehicle-verified-backend.ts';

test('backend refuses missing and modified packages before initializing a runtime',async()=>{
 await assert.rejects(loadVerifiedVehicleBackend(async()=>new ArrayBuffer(0),[]),/Invalid vehicle package size/);
 await assert.rejects(loadVerifiedVehicleBackend(async()=>Uint8Array.of(1,2,3).buffer,[]),/checksum mismatch/);
});
