import test from 'node:test';
import assert from 'node:assert/strict';
import {routeLoader} from './helpers/load-route.mjs';
let queueModule={};try{queueModule=routeLoader({})('lib/marketing/calendar-thumbnail-queue.ts');}catch(error){if(error.code!=='ENOENT')throw error;}
test('Calendar thumbnail queue serializes work, skips an unmounted request and continues after failures',async()=>{
  assert.equal(typeof queueModule.createCalendarThumbnailQueue,'function');
  const queue=queueModule.createCalendarThumbnailQueue();const events=[];
  let finish;const held=new Promise(resolve=>finish=resolve);
  const first=queue.run(new AbortController().signal,async()=>{events.push('first');await held;return 1;});
  const cancelled=new AbortController();
  const aborted=queue.run(cancelled.signal,async()=>{events.push('aborted');});
  const rejected=assert.rejects(aborted,error=>error.name==='AbortError');
  cancelled.abort();
  const last=queue.run(new AbortController().signal,async()=>{events.push('last');return 3;});
  await Promise.resolve();assert.deepEqual(events,['first']);finish();
  assert.equal(await first,1);await rejected;assert.equal(await last,3);assert.deepEqual(events,['first','last']);
  await assert.rejects(queue.run(new AbortController().signal,async()=>{throw Error('transient');}),/transient/);
  assert.equal(await queue.run(new AbortController().signal,async()=>4),4);
});
