import {mkdtempSync, mkdirSync, cpSync, readFileSync, writeFileSync, rmSync, readdirSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {spawnSync} from 'node:child_process';
import './verify-pages-build.mjs';
import {configurePagesEntries} from './pages-entries.mjs';

const root = process.cwd();
const beta = process.argv.includes('--beta');
function git(args, cwd = root, allowMissing = false) {
  const result = spawnSync('git', args, {cwd, encoding: 'utf8', windowsHide: true});
  if (result.error) throw result.error;
  if (result.status !== 0 && !(allowMissing && result.status === 2)) throw new Error(result.stderr || `Git exited ${result.status}`);
  return {output: result.stdout.trim(), status: result.status};
}
const remote = git(['remote', 'get-url', 'origin']).output;
if (!/^https:\/\/github\.com\/vrkatbekao-creator\/(STKSSK|STKSST)(\.git)?$/.test(remote)) {
  throw new Error(`Unexpected deployment repository: ${remote}`);
}
const revision = git(['rev-parse', 'HEAD']).output;
const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
mkdirSync('.tools', {recursive: true});
const staging = mkdtempSync(join(resolve('.tools'), 'pages-publish-'));
git(['init', '--initial-branch=gh-pages'], staging);
git(['remote', 'add', 'origin', remote], staging);
const existing = git(['ls-remote', '--exit-code', '--heads', 'origin', 'gh-pages'], root, true).status === 0;
if (existing && beta) {
  git(['fetch', 'origin', 'gh-pages:refs/remotes/origin/gh-pages']);
  git(['fetch', '--depth=1', root, 'refs/remotes/origin/gh-pages'], staging);
  git(['reset', '--hard', 'FETCH_HEAD'], staging);
}
if (beta) {
  const betaDir = join(staging, '3d');
  rmSync(betaDir, {recursive: true, force: true});
  cpSync(resolve('dist'), betaDir, {recursive: true});
  writeFileSync(join(betaDir, 'RELEASE.json'), JSON.stringify({version, sourceCommit: revision, builtAt: new Date().toISOString()}, null, 2) + '\n');
  configurePagesEntries(staging);
} else {
  for (const name of readdirSync(staging)) {
    if (name !== '.git') rmSync(join(staging, name), {recursive: true, force: true});
  }
  cpSync(resolve('dist'), staging, {recursive: true});
  writeFileSync(join(staging, 'RELEASE.json'), JSON.stringify({version, edition: 'kaohsiung-3d', sourceCommit: revision, builtAt: new Date().toISOString()}, null, 2) + '\n');
}
git(['add', '-A'], staging);
git(['-c', 'user.name=vrkatbekao-creator', '-c', 'user.email=vrkatbekao-creator@users.noreply.github.com', 'commit', '-m', `Deploy Kaohsiung 3D v${version} from ${revision.slice(0, 7)}`], staging);
const deployment = git(['rev-parse', 'HEAD'], staging).output;
git(['fetch', staging, 'gh-pages']);
git(['push', 'origin', `${deployment}:refs/heads/gh-pages`]);
rmSync(staging, {recursive: true, force: true});
console.log(JSON.stringify({site: 'https://vrkatbekao-creator.github.io/STKSSK/', version, sourceCommit: revision, branch: 'gh-pages', deployment}));
