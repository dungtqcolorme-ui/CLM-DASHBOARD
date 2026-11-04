import test from 'node:test';import assert from 'node:assert/strict';import {routeLoader} from './helpers/load-route.mjs';
let inspect;try{inspect=routeLoader({})('lib/marketing/creative-image.ts').inspectCreativeImage;}catch(e){if(e.code!=='ENOENT')throw e;}
const png=(w,h)=>{const b=Buffer.alloc(45);Buffer.from([137,80,78,71,13,10,26,10]).copy(b);b.writeUInt32BE(13,8);b.write('IHDR',12);b.writeUInt32BE(w,16);b.writeUInt32BE(h,20);b[24]=8;b[25]=2;b.writeUInt32BE(0,33);b.write('IEND',37);return b;};
test('Image sniff reads PNG dimensions, digest and actual byte size instead of trusting supplied MIME',()=>{
 assert.equal(typeof inspect,'function');const b=png(1080,1350);const meta=inspect(b,'image/png');assert.equal(meta.width,1080);assert.equal(meta.height,1350);assert.equal(meta.byte_size,b.length);assert.match(meta.reported_sha256,/^[a-f0-9]{64}$/);assert.throws(()=>inspect(b,'image/jpeg'));
});
test('Image sniff rejects executable formats, truncated headers, huge dimensions and oversized payloads',()=>{
 assert.equal(typeof inspect,'function');for(const b of [Buffer.from('<svg onload=alert(1)>'),Buffer.alloc(10),png(12001,100),png(12000,12000),png(1,1),Buffer.alloc(8388609)])assert.throws(()=>inspect(b,'image/png'));
});
test('JPEG parser requires a bounded SOF and complete image envelope',()=>{
 assert.equal(typeof inspect,'function');const b=Buffer.from([255,216,255,192,0,17,8,4,56,4,56,3,1,17,0,2,17,0,3,17,0,255,217]);assert.equal(inspect(b,'image/jpeg').width,1080);assert.throws(()=>inspect(b.subarray(0,b.length-2),'image/jpeg'));
});
