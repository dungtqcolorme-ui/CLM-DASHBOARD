import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {routeLoader} from './helpers/load-route.mjs';
let thumbnail={};try{thumbnail=routeLoader({})('lib/marketing/calendar-thumbnail.ts');}catch(error){if(error.code!=='ENOENT')throw error;}

test('Calendar thumbnail is a small WebP with original aspect, no metadata and no source mutation',async()=>{
  assert.equal(typeof thumbnail.createCalendarThumbnail,'function');
  const original=await sharp({create:{width:320,height:240,channels:4,background:'#136943'}}).withExif({IFD0:{Artist:'PRIVATE_TEST_AUTHOR'}}).png().toBuffer();
  const unchanged=Buffer.from(original);
  const bytes=await thumbnail.createCalendarThumbnail(original);
  const meta=await sharp(bytes).metadata();
  assert.equal(meta.format,'webp');assert.equal(meta.width,120);assert.equal(meta.height,90);
  assert.equal(meta.exif,undefined);assert.equal(meta.icc,undefined);assert.ok(bytes.length<=65536);
  assert.deepEqual(original,unchanged);
  const small=await sharp({create:{width:20,height:20,channels:3,background:'#ffffff'}}).jpeg().toBuffer();
  const smallMeta=await sharp(await thumbnail.createCalendarThumbnail(small)).metadata();
  assert.equal(smallMeta.width,20);assert.equal(smallMeta.height,20);
});
test('Calendar thumbnail rejects malformed rasters and releases capacity after failure or busy rejection',async()=>{
  assert.equal(typeof thumbnail.createCalendarThumbnail,'function');
  await assert.rejects(thumbnail.createCalendarThumbnail(Buffer.from('not an image')),error=>error.code==='thumbnail_unavailable'&&!/libvips|node_modules/.test(error.message));
  const image=await sharp({create:{width:320,height:240,channels:3,background:'#136943'}}).png().toBuffer();
  const first=thumbnail.createCalendarThumbnail(image);
  await assert.rejects(thumbnail.createCalendarThumbnail(image),error=>error.status===429);
  assert.ok((await first).length>0);
  assert.ok((await thumbnail.createCalendarThumbnail(image)).length>0);
});
