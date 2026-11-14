const params=typeof window==='undefined'?null:new URLSearchParams(window.location.search);
const testMode=import.meta.env?.DEV?params?.get('routing'):null;

export const alphaMode=!!params&&(import.meta.env.DEV||import.meta.env.MODE==='beta'||import.meta.env.MODE==='alpha')&&params.get('view')!=='2d'&&!testMode;
export const wasmEnabled=testMode==='wasm'||testMode==='wasm-vehicle';
export const vehicleBase=alphaMode||testMode==='wasm-vehicle'
 ?new URL(`${import.meta.env.BASE_URL}${alphaMode?'alpha-data/':'.tools/'}`,window.location.href).href
 :undefined;
