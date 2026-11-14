import {mkdtempSync, mkdirSync, cpSync, readFileSync, writeFileSync, rmSync} from 'node:fs';
import assert from 'node:assert/strict';
import {resolve, join} from 'node:path';
import {spawnSync} from 'node:child_process';
import './verify-pages-build.mjs';

const root = process.cwd();
const beta = process.argv.includes('--beta');
function git(args, cwd=root, allowMissing=false) {
  const result=spawnSync('git',args,{cwd,encoding:'utf8',windowsHide:true});
  if(result.error)throw result.error;
  if(result.status!==0&&!(allowMissing&&result.status===2))throw new Error(result.stderr||`Git exited ${result.status}`);
  return {output:result.stdout.trim(),status:result.status};
}
const remote=git(['remote','get-url','origin']).output;
if(remote!=='https://github.com/vrkatbekao-creator/STKSST.git')throw new Error('Unexpected deployment repository');
const revision=git(['rev-parse','HEAD']).output;
const version=JSON.parse(readFileSync('package.json','utf8')).version;
mkdirSync('.tools',{recursive:true});
const staging=mkdtempSync(join(resolve('.tools'),'pages-publish-'));
git(['init','--initial-branch=gh-pages'],staging);
git(['remote','add','origin',remote],staging);
const existing=git(['ls-remote','--exit-code','--heads','origin','gh-pages'],root,true).status===0;
if(existing){
  git(['fetch','origin','gh-pages:refs/remotes/origin/gh-pages']);
  git(['fetch','--depth=1',root,'refs/remotes/origin/gh-pages'],staging);
  git(['reset',beta?'--hard':'--mixed','FETCH_HEAD'],staging);
}
assert.ok(!beta||existing,'Publish the original Pages site before adding the 3D entry');
const betaDir=join(staging,'3d');
assert.equal(resolve(betaDir),join(resolve(staging),'3d'));
if(beta)rmSync(betaDir,{recursive:true,force:true});
const hasBeta=beta||existing&&git(['ls-tree','--name-only','FETCH_HEAD','3d'],staging).output==='3d';
if(!beta&&hasBeta)git(['checkout','FETCH_HEAD','--','3d'],staging);
const destination=beta?betaDir:staging;
cpSync(resolve('dist'),destination,{recursive:true});
writeFileSync(join(destination,'RELEASE.json'),JSON.stringify({version,sourceCommit:revision,builtAt:new Date().toISOString()},null,2)+'\n');

function addEditionLink(directory,href,label){
  const page=join(directory,'index.html');
  const html=readFileSync(page,'utf8');
  if(html.includes('id="edition-switch"'))return;
  assert.match(html,/<body(?:\s[^>]*)?>/i,'Expected a body for the edition link');
  const link=`<nav id="edition-switch" aria-label="版本選擇 / Game editions" style="display:flex;justify-content:center;padding:.5rem;background:#101d32"><a href="${href}" style="color:#ffdf75;padding:.4rem .75rem;font:600 14px system-ui;text-decoration:underline">${label}</a></nav>`;
  writeFileSync(page,html.replace(/<body(?:\s[^>]*)?>/i,body=>body+link));
}
if(hasBeta){
  addEditionLink(staging,'/STKSST/3d/','試玩 3D Beta / Play 3D Beta');
  if(beta)addEditionLink(betaDir,'/STKSST/','返回 2D 公開原型 / Return to 2D prototype');
}
git(['add','-A'],staging);
git(['-c','user.name=vrkatbekao-creator','-c','user.email=vrkatbekao-creator@users.noreply.github.com','commit','-m',`Deploy ${beta?'3D Beta ':''}v${version} from ${revision.slice(0,7)}`],staging);
const deployment=git(['rev-parse','HEAD'],staging).output;
// Push through the source repository so repository-scoped credential settings apply.
git(['fetch',staging,'gh-pages']);
git(['push','origin',`${deployment}:refs/heads/gh-pages`]);
console.log(JSON.stringify({site:`https://vrkatbekao-creator.github.io/STKSST/${beta?'3d/':''}`,version,sourceCommit:revision,branch:'gh-pages',deployment}));
