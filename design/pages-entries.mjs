import assert from 'node:assert/strict';
import {copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

const base='/STKSST/';
const betaUrl=`${base}3d/`;
const legacyUrl=`${base}legacy/`;
const editionNav=/<nav id="edition-switch"[\s\S]*?<\/nav>/;

function setEditionLink(page,href,label){
 const html=readFileSync(page,'utf8').replace(editionNav,'');
 assert.match(html,/<body(?:\s[^>]*)?>/i,'Expected a body for the edition link');
 const link=`<nav id="edition-switch" aria-label="版本選擇 / Game editions" style="display:flex;justify-content:center;padding:.5rem;background:#101d32"><a href="${href}" style="color:#ffdf75;padding:.4rem .75rem;font:600 14px system-ui;text-decoration:underline">${label}</a></nav>`;
 writeFileSync(page,html.replace(/<body(?:\s[^>]*)?>/i,body=>body+link));
}

export function configurePagesEntries(staging){
 const entry=join(staging,'index.html');
 const legacy=join(staging,'legacy');
 const legacyEntry=join(legacy,'index.html');
 const legacyRelease=join(legacy,'RELEASE.json');
 if(!existsSync(legacyEntry)){
  const previous=JSON.parse(readFileSync(join(staging,'RELEASE.json'),'utf8'));
  assert.equal(previous.version,'0.17.0','Expected the existing 2D prototype at the root');
  assert.ok(readFileSync(entry,'utf8').includes(`${base}assets/`),'Expected the original 2D assets at the root');
  mkdirSync(legacy,{recursive:true});
  copyFileSync(entry,legacyEntry);
  copyFileSync(join(staging,'RELEASE.json'),legacyRelease);
 }

 assert.equal(JSON.parse(readFileSync(legacyRelease,'utf8')).version,'0.17.0');
 setEditionLink(legacyEntry,base,'返回 3D 試玩 / Back to 3D preview');
 setEditionLink(join(staging,'3d','index.html'),legacyUrl,'切換到 2D Legacy / Switch to 2D Legacy');
 copyFileSync(join(staging,'3d','RELEASE.json'),join(staging,'RELEASE.json'));
 writeFileSync(entry,`<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>選舉騎士團 高雄篇 港都掃街 | Election Knights: Kaohsiung</title>
<link rel="canonical" href="https://vrkatbekao-creator.github.io${betaUrl}">
<script>location.replace('${betaUrl}' + location.search + location.hash);</script>
</head>
<body>
<h1>選舉騎士團 高雄篇：港都百里掃街</h1>
<p><a href="${betaUrl}">開啟 3D 試玩 / Play the 3D preview</a></p>
<p><a href="${legacyUrl}">開啟 2D Legacy / Play 2D Legacy</a></p>
</body>
</html>
`);
}
