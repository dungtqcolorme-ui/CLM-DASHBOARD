import test from 'node:test';
import assert from 'node:assert/strict';
import {routeLoader} from './helpers/load-route.mjs';
const id='11111111-1111-4111-8111-111111111111';
const base={id,team_id:id,campaign_id:id,creator_id:id,assignee_id:null,title:'Lịch đề xuất',caption:'Giữ nguyên caption.',content_line:'Sharing',production_status:'designing',publishing_status:'draft',production_due_at:'2026-11-08T05:00:00.000Z',review_due_at:'2026-11-09T05:00:00.000Z',proposed_publish_at:'2026-11-09T17:30:00.000Z',version:3};
let schedule={};try{schedule=routeLoader({})('lib/marketing/calendar-schedule.ts');}catch(error){if(error.code!=='ENOENT')throw error;}
test('Calendar move eligibility excludes Viewer, mismatched scope, locked Campaigns and reviewed publications',()=>{
  assert.equal(typeof schedule.canMoveCalendarContent,'function');
  const campaign={id,team_id:id,status:'active'};
  assert.equal(schedule.canMoveCalendarContent(base,campaign,true),true);
  assert.equal(schedule.canMoveCalendarContent({...base,publishing_status:'changes_requested'},{...campaign,status:'draft'},true),true);
  for(const [item,cam,write] of [[base,campaign,false],[base,undefined,true],[base,{...campaign,team_id:'other'},true],[base,{...campaign,id:'other'},true],...['pending_activation','paused','emergency_hold','completed','archived'].map(status=>[base,{...campaign,status},true]),...['in_review','approved','scheduled','published','cancelled','failed'].map(publishing_status=>[{...base,publishing_status},campaign,true])])assert.equal(schedule.canMoveCalendarContent(item,cam,write),false);
});
test('Calendar drag preserves Vietnam local time across UTC midnight and rejects impossible dates',()=>{
  assert.equal(typeof schedule.calendarDropTime,'function');
  assert.equal(schedule.calendarDropTime(base.proposed_publish_at,'2026-11-12'),'2026-11-12T00:30');
  assert.equal(schedule.calendarDropTime(null,'2026-11-12'),'2026-11-12T09:00');
  for(const day of ['2026-02-30','2026-13-02','not-a-day'])assert.throws(()=>schedule.calendarDropTime(base.proposed_publish_at,day));
});
test('Calendar save changes only the proposal through a versioned content command',()=>{
  assert.equal(typeof schedule.calendarScheduleCommand,'function');
  assert.deepEqual(schedule.calendarScheduleCommand(base,'2026-11-12T00:30'),{
    action:'update_content',id,expected_version:3,title:'Lịch đề xuất',caption:'Giữ nguyên caption.',content_line:'Sharing',assignee_id:null,production_status:'designing',production_due_at:'2026-11-08T05:00:00.000Z',review_due_at:'2026-11-09T05:00:00.000Z',proposed_publish_at:'2026-11-11T17:30:00.000Z',
  });
  assert.throws(()=>schedule.calendarScheduleCommand(base,''));
  assert.throws(()=>schedule.calendarScheduleCommand(base,'2026-02-30T08:00'));
  for(const publishing_status of ['in_review','approved','scheduled','published'])assert.throws(()=>schedule.calendarScheduleCommand({...base,publishing_status},'2026-11-12T00:30'));
});
