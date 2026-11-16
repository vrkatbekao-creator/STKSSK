import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import test from 'node:test';
import {runInNewContext} from 'node:vm';
import {configurePagesEntries} from '../design/pages-entries.mjs';

test('the primary entry forwards to 3D and subsequent releases preserve 2D Legacy',t=>{
 const temp=resolve(tmpdir());
 const staging=mkdtempSync(join(temp,'stksst-pages-'));
 t.after(()=>{
  assert.ok(resolve(staging).startsWith(temp+sep+'stksst-pages-'));
  rmSync(staging,{recursive:true,force:true});
 });
 const write=(path,content)=>writeFileSync(join(staging,path),content);
 const read=path=>readFileSync(join(staging,path),'utf8');
 const oldBuild='<html><body><nav id="edition-switch">Old link</nav><script src="/STKSST/assets/legacy.js"></script></body></html>';
 const oldRelease='{"version":"0.17.0","sourceCommit":"original"}';
 const betaBuild='<html><body><script src="/STKSST/3d/assets/beta.js"></script></body></html>';
 const betaRelease='{"version":"0.18.0-beta.5","sourceCommit":"updated"}';
 mkdirSync(join(staging,'3d'));
 mkdirSync(join(staging,'assets'));
 write('index.html',oldBuild);
 write('assets/legacy.js','existing Legacy asset');
 write('RELEASE.json',oldRelease);
 write('3d/index.html',betaBuild);
 write('3d/RELEASE.json',betaRelease);

 configurePagesEntries(staging);
 const legacy=read('legacy/index.html');
 assert.match(legacy,/src="\/STKSST\/assets\/legacy\.js"/);
 assert.match(legacy,/href="\/STKSST\/"[^>]*>返回 3D 試玩/);
 assert.match(read('3d/index.html'),/href="\/STKSST\/legacy\/"[^>]*>切換到 2D Legacy/);
 assert.equal(read('legacy/RELEASE.json'),oldRelease);
 assert.equal(read('RELEASE.json'),betaRelease);
 let destination;
 const script=read('index.html').match(/<script>(.*?)<\/script>/)[1];
 runInNewContext(script,{location:{search:'?example=1',hash:'#bookmark',replace:value=>{destination=value;}}});
 assert.equal(destination,'/STKSST/3d/?example=1#bookmark');

 configurePagesEntries(staging);
 assert.equal(read('legacy/index.html'),legacy);
 assert.equal(read('legacy/RELEASE.json'),oldRelease);
 assert.equal(read('assets/legacy.js'),'existing Legacy asset');
 assert.equal(read('3d/index.html').match(/id="edition-switch"/g).length,1);
});
