import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../',import.meta.url);
const cwd = fileURLToPath(root);
const args=['--offline','--release','--target','wasm32-unknown-unknown','--manifest-path','stksst-core/Cargo.toml'];
execFileSync('cargo',['build',...args],{cwd,stdio:'inherit'});
const destination='public/alpha-data';
mkdirSync(new URL(destination+'/',root),{recursive:true});
for(const file of ['vehicle-graph-prototype-v3.bin.gz','vehicle-graph-prototype-v1.meta.json.gz','vehicle-connectors-prototype-v1.json.gz']){
 copyFileSync(new URL('.tools/'+file,root),new URL(destination+'/'+file,root));
}
copyFileSync(new URL('stksst-core/target/wasm32-unknown-unknown/release/stksst_core.wasm',root),new URL(destination+'/stksst_core.wasm',root));
execFileSync('python',['design/package-alpha-terrain.py'],{cwd,stdio:'inherit'});
