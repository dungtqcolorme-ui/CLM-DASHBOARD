import assert from 'node:assert/strict';
import test from 'node:test';
import {routeLoader,databaseFixture} from './helpers/load-route.mjs';
function setup(){const db=databaseFixture();let cookieMap={};const load=routeLoader({'@/lib/supabaseAdmin':{getSupabaseAdmin:()=>db.admin},'@supabase/supabase-js':{createClient:()=>db.admin},'next/headers':{cookies:async()=>({get:name=>cookieMap[name]?{value:cookieMap[name]}:undefined})}});return {db,load,cookies:value=>{cookieMap=value;}};}
function request(actor,method='DELETE',body,role){return new Request('http://localhost/api/admin/users/staff',{method,headers:{Authorization:`Bearer ${actor}`,'Content-Type':'application/json',...(role?{'x-clm-active-role':role}:{})},body:body?JSON.stringify(body):undefined});}
const context=id=>({params:Promise.resolve({id})});
test('Admin/Manager deactivate without deleting profile, tasks or roles and can reactivate',async()=>{
 for(const actor of ['admin','leader']){const {db,load}=setup();const route=load('app/api/admin/users/[id]/route.ts');assert.equal((await route.DELETE(request(actor),context('staff'))).status,200);assert.equal(db.profiles.find(p=>p.id==='staff').status,'locked');assert.equal(db.roles.filter(r=>r.user_id==='staff').length,1);assert.equal(db.authChanges.at(-1).ban_duration,'876000h');const identity=load('lib/serverAuth.ts');await assert.rejects(identity.getRequestIdentity(request('staff')),/khóa/);assert.equal((await route.PATCH(request(actor,'PATCH',{status:'active'}),context('staff'))).status,200);assert.equal(db.authChanges.at(-1).ban_duration,'none');assert.equal(db.profiles.find(p=>p.id==='staff').status,'active');}
});
test('ordinary and Viewer direct delete/update API requests are forbidden',async()=>{
 const {db,load}=setup();const route=load('app/api/admin/users/[id]/route.ts');for(const role of ['staff','viewer']){assert.equal((await route.DELETE(request(role),context('leader'))).status,403);assert.equal((await route.PATCH(request(role,'PATCH',{status:'locked'}),context('leader'))).status,403);}assert.equal(db.authChanges.length,0);
});
test('manager cannot deactivate administrators, self or nonexistent users',async()=>{
 const {load}=setup();const route=load('app/api/admin/users/[id]/route.ts');assert.equal((await route.DELETE(request('leader'),context('admin'))).status,403);assert.equal((await route.DELETE(request('admin'),context('admin'))).status,409);assert.equal((await route.DELETE(request('admin'),context('missing'))).status,404);
});
test('active workspace role is enforced even on a multi-role administrator',async()=>{
 const {db,load}=setup();db.roles.push({user_id:'admin',role:'PR Representative'});const route=load('app/api/admin/users/[id]/route.ts');assert.equal((await route.DELETE(request('admin','DELETE',null,'PR Representative'),context('staff'))).status,403);
});
test('existing shell cookies cannot keep a deactivated user authorized',async()=>{
 process.env.NEXT_PUBLIC_SUPABASE_URL='http://localhost:9999';process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='test-key';const {db,load,cookies}=setup();cookies({'clm-dashboard-access':'staff','clm-dashboard-role':'PR Representative','clm-dashboard-profile':'stale-profile'});const auth=load('lib/dashboardSession.ts');assert.equal((await auth.getDashboardSessionIdentity()).profile.id,'staff');db.profiles.find(p=>p.id==='staff').status='locked';await assert.rejects(auth.getDashboardSessionIdentity(),/khóa/);
});
test('all four roles record one load, repeat requests deduplicate, reload records another visit',async()=>{
 process.env.NEXT_PUBLIC_SUPABASE_URL='http://localhost:9999';process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='test-key';const {db,load}=setup();const route=load('app/api/dashboard/session/route.ts');
 for(const actor of ['admin','leader','staff','viewer']){const req=loadId=>new Request('http://localhost/api/dashboard/session',{method:'POST',headers:{Authorization:`Bearer ${actor}`,'x-clm-app-load':loadId}});const [a,b]=await Promise.all([route.POST(req('load-1')),route.POST(req('load-1'))]);assert.equal(a.status,200);assert.equal(b.status,200);assert.equal((await a.json()).lastSeenAt,(await b.json()).lastSeenAt);assert.equal((await route.POST(req('load-2'))).status,200);}assert.equal(db.writes,8);
});

test('new account remains unvisited until its first authenticated load; edits and disable preserve activity/history',async()=>{
 process.env.NEXT_PUBLIC_SUPABASE_URL='http://localhost:9999';process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='test-key';
 const {db,load}=setup();const accounts=load('app/api/admin/users/route.ts');
 const body={email:'new@example.test',password:'test-only-password',fullName:'Nhân sự mới',roles:['PR Representative'],status:'active'};
 const response=await accounts.POST(request('admin','POST',body));assert.equal(response.status,201);
 const {user}=await response.json();assert.equal(user.lastSeenAt,null);
 assert.equal((await accounts.POST(request('admin','POST',body))).status,409,'duplicate email does not create a second profile');
 assert.equal(db.profiles.filter(p=>p.email===body.email).length,1);
 const session=load('app/api/dashboard/session/route.ts');
 assert.equal((await session.POST(new Request('http://localhost/api/dashboard/session',{method:'POST',headers:{Authorization:`Bearer ${user.id}`,'x-clm-app-load':'first-visit'}}))).status,200);
 const profile=db.profiles.find(p=>p.id===user.id),seen=profile.last_seen_at;assert.ok(seen);
 db.tables.tasks.push({id:'history-task',owner_id:user.id,status:'Hoàn thành'});db.tables.work_history.push({item_id:'history-task',actor_id:user.id,action:'Hoàn thành'});
 const history=structuredClone({tasks:db.tables.tasks,history:db.tables.work_history});
 const route=load('app/api/admin/users/[id]/route.ts');assert.equal((await route.PATCH(request('admin','PATCH',{fullName:'Tên đã sửa'}),context(user.id))).status,200);assert.equal(profile.last_seen_at,seen);
 assert.equal((await route.DELETE(request('admin'),context(user.id))).status,200);assert.equal(profile.last_seen_at,seen);
 assert.deepEqual({tasks:db.tables.tasks,history:db.tables.work_history},history);
 assert.equal((await session.POST(request(user.id,'POST'))).status,403);
});

test('account creation respects management permissions and inactive users are banned immediately',async()=>{
 const {db,load}=setup();const route=load('app/api/admin/users/route.ts');
 const body={email:'pending@example.test',password:'test-only-password',fullName:'Tài khoản chờ duyệt',roles:['Viewer'],status:'pending'};
 for(const actor of ['staff','viewer'])assert.equal((await route.POST(request(actor,'POST',body))).status,403);
 assert.equal((await route.POST(request('leader','POST',{...body,roles:['Admin']}))).status,403);
 assert.equal((await route.POST(request('leader','POST',body))).status,201);
 assert.equal(db.authChanges.at(-1).ban_duration,'876000h');
});
