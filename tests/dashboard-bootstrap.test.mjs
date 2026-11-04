import test from 'node:test';import assert from 'node:assert/strict';
const {createDashboardBootstrap}=await import('../lib/dashboardBootstrap.mjs').catch(error=>{if(error.code==='ERR_MODULE_NOT_FOUND')return {};throw error;});
test('bootstrap provides one attempt-scoped loader',()=>assert.equal(typeof createDashboardBootstrap,'function'));
test('matching readers share one required-data request', {skip:!createDashboardBootstrap},async()=>{
 let calls=0;const payload={events:[{ma:'qa'}]},b=createDashboardBootstrap(async()=>{calls++;return payload;});
 const first=b.begin('qa:Admin:1');assert.equal(b.begin('qa:Admin:1'),first);assert.equal(b.read('qa:Admin:1'),first);assert.equal(await b.read('qa:Admin:1'),payload);assert.equal(calls,1);
});
test('logout and role changes abort old work and never share a response', {skip:!createDashboardBootstrap},async()=>{
 const signals=[];const b=createDashboardBootstrap(async signal=>{signals.push(signal);return {events:[]};});
 await b.begin('user-a:Admin:1');await b.begin('user-b:Viewer:2');assert.equal(signals[0].aborted,true);
 await assert.rejects(b.read('user-a:Admin:1'),{name:'AbortError'});b.clear();assert.equal(signals[1].aborted,true);await assert.rejects(b.read('user-b:Viewer:2'),{name:'AbortError'});
});
test('real loading errors propagate and an explicit new attempt retries', {skip:!createDashboardBootstrap},async()=>{
 let calls=0;const b=createDashboardBootstrap(async()=>{if(++calls===1)throw new Error('Không có quyền tải dữ liệu');return {events:[]};});
 await assert.rejects(b.begin('qa:1'),/Không có quyền tải dữ liệu/);await assert.rejects(b.read('qa:1'),/Không có quyền tải dữ liệu/);assert.deepEqual(await b.begin('qa:2'),{events:[]});assert.equal(calls,2);
});
const bootstrapModule=await import('../lib/dashboardBootstrap.mjs');
test('bootstrap keeps caller cancellation active through response body reading',async()=>{
 assert.equal(typeof bootstrapModule.loadBootstrapState,'function');
 const caller=new AbortController();let fetchSignal;
 const fetcher=async(_url,options)=>{fetchSignal=options.signal;return new Response(new ReadableStream({start(controller){fetchSignal.addEventListener('abort',()=>controller.error(fetchSignal.reason),{once:true});}}),{headers:{'Content-Type':'application/json'}});};
 const promise=bootstrapModule.loadBootstrapState(caller.signal,{fetcher});await Promise.resolve();caller.abort();await assert.rejects(promise,{name:'AbortError'});assert.equal(fetchSignal.aborted,true);
});
test('bootstrap deadline includes a stalled body rather than only headers',async()=>{
 assert.equal(typeof bootstrapModule.loadBootstrapState,'function');
 const fetcher=async(_url,{signal})=>new Response(new ReadableStream({start(controller){signal.addEventListener('abort',()=>controller.error(signal.reason),{once:true});}}));
 await assert.rejects(bootstrapModule.loadBootstrapState(new AbortController().signal,{fetcher,timeoutMs:20}),/Tải dữ liệu quá thời gian/);
});
test('transport retains JSON text so data is parsed in the consuming iframe realm',async()=>{
 const wire=JSON.stringify({events:[{ma:'qa',value:0}],roles:['Viewer']});
 assert.equal(await bootstrapModule.loadBootstrapState(new AbortController().signal,{fetcher:async()=>new Response(wire)}),wire);
});
