import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=name=>JSON.parse(readFileSync(new URL(`../src/locales/${name}.json`,import.meta.url),'utf8'));
const canonical=read('en');
const params=text=>(text.match(/\{\{\w+\}\}/g)??[]).sort();

for(const language of ['zh-TW','ja','fr','nl','zh-CN']){
 test(`${language} has all translations and preserves interpolation parameters`,()=>{
  const messages=read(language);
  assert.deepEqual(Object.keys(messages).sort(),Object.keys(canonical).sort());
  for(const key of Object.keys(canonical)){
   assert.ok(messages[key]?.trim(),key);
   assert.doesNotMatch(messages[key],/[▁�]/,key);
   assert.deepEqual(params(messages[key]),params(canonical[key]),key);
  }
 });
}

test('browser language variants select an available language',async()=>{
 const {supportedLanguage}=await import('../src/languages.ts');
 for(const [input,expected] of Object.entries({'fr-BE':'fr','nl-BE':'nl','ja-JP':'ja','zh-Hans-SG':'zh-CN','zh-HK':'zh-TW','en-GB':'en'})){
  assert.equal(supportedLanguage(input),expected);
 }
 assert.equal(supportedLanguage('de-DE'),undefined);
});
