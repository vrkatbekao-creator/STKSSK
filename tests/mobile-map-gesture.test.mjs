import assert from 'node:assert/strict';
import test from 'node:test';
import {createMapTapGesture} from '../src/mobile-map-gesture.ts';

const start={x:10,y:10};

test('a map tap is available once and only after release',()=>{
 const gesture=createMapTapGesture();
 gesture.start(1,start);
 assert.equal(gesture.consume(),false);
 gesture.move(1,{x:13,y:12});
 gesture.end(1,true);
 assert.equal(gesture.consume(),true);
 assert.equal(gesture.consume(),false);
});

test('drag, pinch and release off the map cannot select a destination',()=>{
 const gesture=createMapTapGesture();
 gesture.start(1,start);
 gesture.move(1,{x:50,y:10});
 gesture.move(1,start);
 gesture.end(1,true);
 assert.equal(gesture.consume(),false);
 gesture.start(1,start);
 gesture.start(2,{x:25,y:25});
 gesture.end(2,true);
 gesture.end(1,true);
 assert.equal(gesture.consume(),false);
 gesture.start(1,start);
 gesture.end(1,false);
 assert.equal(gesture.consume(),false);
 gesture.start(1,start);
 gesture.end(1,true);
 assert.equal(gesture.consume(),true);
});
