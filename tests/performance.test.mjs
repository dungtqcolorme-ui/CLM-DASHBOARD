import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseCsvGrid,parseScoreGrid,scoreNumber} from '../lib/performance.mjs';

const html=readFileSync(new URL('../dashboard/clm-dashboard-private-34.html',import.meta.url),'utf8');
// Execute actual dashboard function bodies in isolation; no production data is seeded.
function fn(name){const start=html.lastIndexOf(`function ${name}(`);assert.ok(start>=0,name);const brace=html.indexOf('{',start);for(let end=brace+1;end<html.length;end++){if(html[end]!=='}')continue;const source=html.slice(start,end+1);try{new vm.Script(`(${source})`);return source;}catch{}}throw new Error(name);}
function context(names, values={}){const ctx=vm.createContext(values);for(const name of names)vm.runInContext(fn(name),ctx);return ctx;}

test('score parser preserves zero, negatives, decimal comma and missing cells',()=>{
  assert.equal(scoreNumber('0'),0);assert.equal(scoreNumber('-12,5'),-12.5);assert.equal(scoreNumber(''),null);assert.equal(scoreNumber('#REF!'),null);
  const result=parseScoreGrid([['K141'],['','Tuần 1'],['','','Q. Dũng','','','0','20'],['','','','Hiệu suất','0'],['','','','Năng lực','-10,5']]);
  assert.equal(result[0].weeks[0].people[0].ten,'Qu. Dũng');
  assert.equal(result[0].weeks[0].people[0].diemLamViec,0);
  assert.equal(result[0].weeks[0].people[0].nangLuc,-10.5);
  assert.equal(result[0].weeks[0].people[0].kyLuat,null);
});
test('CSV handles quotes, commas, newlines and CRLF',()=>{
  assert.deepEqual(parseCsvGrid('"a,b","c""d"\r\n"multi\nline",2\r\n'),[['a,b','c"d'],['multi\nline','2']]);
});
test('score parser accepts combined course/week/person row and takes last criteria score',()=>{
  const row=['K140','Tuần 1','A','','','12.5','8'];
  const criteria=['','','','Hiệu suất','5','','','Tiêu chí','999','2','3','4','5','7'];
  const person=parseScoreGrid([row,criteria])[0].weeks[0].people[0];assert.equal(person.diemLamViec,12.5);assert.equal(person.tieuChi[0].diem,7);
});
test('task directory includes Leader, excludes Viewer/locked, uses UUID without email',()=>{
  const ctx=context(['taskStaff'],{DB:{accounts:[]},session:{},clmTaskDirectory:[{id:'leader',ten:'LÊ THÀNH ĐẠT',status:'active',appRoles:['PR Leader']},{id:'staff',ten:'Trainee',status:'active',appRoles:['PR Representative']},{id:'locked',status:'locked',appRoles:['PR Representative']},{id:'viewer',status:'active',appRoles:['Viewer']}]});
  assert.deepEqual(Array.from(ctx.taskStaff(),x=>x.id),['leader','staff']);
});
test('failed score load does not trigger a render/request retry loop; explicit retry recovers',async()=>{
  let calls=0;const scoreState={};const ctx=context(['loadScoreSheet'],{scoreState,clmRpc:async()=>{calls++;if(calls===1)throw new Error('API unavailable');return {courses:[]};}});
  assert.equal(await ctx.loadScoreSheet(),null);assert.equal(scoreState.attempted,true);assert.equal(scoreState.loading,false);assert.equal(scoreState.error,'API unavailable');
  assert.deepEqual(await ctx.loadScoreSheet(true),[]);assert.equal(scoreState.loaded,true);assert.equal(scoreState.error,'');assert.equal(calls,2);
});
test('parallel score loads share one request',async()=>{
  let calls=0,resolve;const response=new Promise(r=>{resolve=r});const ctx=context(['loadScoreSheet'],{scoreState:{},clmRpc:()=>{calls++;return response;}});
  const a=ctx.loadScoreSheet(),b=ctx.loadScoreSheet(true);assert.equal(calls,1);resolve({courses:[]});await Promise.all([a,b]);
});
test('weekly aggregates respect selected course and keep missing weeks blank',()=>{
  const ctx=context(['performanceWeeklyCourses'],{performanceStaff:()=>[{id:'a',ten:'A'}],scoreNameKey:x=>x,scoreCanonicalPerson:x=>x,scoreNumber,normalizeCourse:x=>x,scoreCourseBase:x=>x,cleanText:x=>String(x??''),courseCmp:(a,b)=>a.localeCompare(b),OFFICIAL_STAFF_LABELS:{},scoreState:{data:[{ten:'K141',weeks:[{ten:'Tuần 2',people:[{ten:'A',diemLamViec:23.5,soGio:10,hieuSuat:0,nangLuc:-3,kyLuat:null}]}]},{ten:'K140',weeks:[{ten:'Tuần 1',people:[{ten:'A',diemLamViec:100}]}]}]}});
  const rows=ctx.performanceWeeklyCourses(['K141'],'a');assert.equal(rows.length,1);assert.equal(rows[0].totalWork,23.5);assert.equal(rows[0].weeks[0].recorded,false);assert.equal(rows[0].efficiency,0);assert.equal(rows[0].discipline,null);
});
test('comparison keeps explicit selections and allows removing every person',()=>{
 const state={staffIds:[]};const ctx=context(['approvedSelectedStaff'],{performanceState:()=>state});const rows=[{s:{id:'a'}},{s:{id:'b'}}];assert.equal(ctx.approvedSelectedStaff(rows).length,0);state.staffIds=['a'];assert.equal(ctx.approvedSelectedStaff(rows).length,1);state.staffIds=[];assert.equal(ctx.approvedSelectedStaff(rows).length,0);
});
test('live UUID tasks contribute to the same historical score person and update on completion',()=>{
 const db={tasks:[{nguoi:'uuid-a',status:'Mới tạo'}],meetings:[]};const staff={id:'legacy-a',ten:'A',taskIds:['legacy-a','uuid-a']};
 const ctx=context(['approvedPerformanceRows'],{DB:db,normalizeCourse:x=>x,roleEvents:()=>[],canonicalB2Contracts:()=>[],approvedScoreRows:()=>new Map(),approvedCourseList:()=>['K141'],performanceStaff:()=>[staff],scoreNameKey:x=>x,OFFICIAL_STAFF_LABELS:{},normalizedTaskStatus:t=>t.status,taskIsCoord:()=>false});
 assert.equal(ctx.approvedPerformanceRows(['K141'])[0].taskTotal,1);assert.equal(ctx.approvedPerformanceRows(['K141'])[0].taskDone,0);db.tasks[0].status='Hoàn thành';assert.equal(ctx.approvedPerformanceRows(['K141'])[0].taskDone,1);assert.equal(ctx.approvedPerformanceRows(['K141'])[0].taskCompletion,100);
});
