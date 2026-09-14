import assert from 'node:assert/strict';
const base=process.env.CLM_TEST_URL||'http://127.0.0.1:3100';
const routes=['/','/api/auth/profile','/api/dashboard/session','/api/dashboard/shell','/api/dashboard/state','/api/performance/scores','/api/work-items','/api/admin/users','/api/honors','/api/documents','/api/mentor/trainees','/api/mentor/daily-tasks'];
for(const path of routes){const r=await fetch(base+path,{method:path==='/api/dashboard/session'?'POST':'GET'});assert.equal(r.status,path==='/'?200:401,path);console.log(path,r.status);}
for(const method of ['POST','PATCH','DELETE']){const r=await fetch(base+'/api/admin/users/staff',{method});assert.equal(r.status,method==='POST'?405:401,method);}
console.log('HTTP authentication boundaries passed');
