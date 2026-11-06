import test from 'node:test';
import assert from 'node:assert/strict';
import { routeLoader } from './helpers/load-route.mjs';

const proposed = '2026-11-05T10:00:00.000Z';
const approved = '2026-11-05T17:30:00.000Z';
const observed = '2026-11-06T08:00:00.000Z';
const item = { id:'content', team_id:'team', campaign_id:'campaign', proposed_publish_at:proposed, publishing_status:'approved' };
const job = { id:'job', content_id:'content', team_id:'team', campaign_id:'campaign', candidate_id:'candidate', approval_id:'approval', connection_id:'connection', scheduled_for:approved, status:'queued', remote_id:null, receipt:null, created_at:'2026-11-04T00:00:00Z' };
const snapshot = { id:'approval', content_id:'content', team_id:'team', approver_id:'leader', content_version:4, created_at:'2026-11-04T00:00:00Z', snapshot:{ candidate_id:'candidate', scheduled_for:approved, connection:{ id:'connection', provider:'facebook', page_name:'Partnership' }, media:[{ private_path:'private-file' }] } };
let calendar;
try { calendar = routeLoader({})('lib/marketing/calendar-domain.ts'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
function entry(jobs, approvals = [snapshot], content = item, alerts = []) {
  const evidence = calendar.projectCalendarEvidence(jobs, approvals, alerts);
  return calendar.calendarEntries([content], evidence)[0];
}

test('Calendar keeps the approved slot separate from the proposed hour and groups in Vietnam time', () => {
  assert.equal(typeof calendar?.calendarEntries,'function');
  const row = entry([job]);
  assert.deepEqual(row.slot,{ kind:'approved', at:approved });
  assert.equal(row.item.proposed_publish_at,proposed);
  assert.equal(row.state,'internal_queue');
  assert.equal(calendar.calendarDay(row.slot.at),'2026-11-06');
  assert.equal(row.publication.approval.pageName,'Partnership');
});

test('Calendar requires a verified binding and never substitutes observation time for publication time', () => {
  const scheduled = { ...job, status:'remote_scheduled', remote_id:'987', receipt:{ verified:true, state:'remote_scheduled', remote_id:'987', observed_at:observed, response_reference:'private-provider-reference' } };
  const content = { ...item, publishing_status:'scheduled' };
  assert.equal(entry([scheduled],[snapshot],content).state,'remote_scheduled');
  assert.equal(entry([{...scheduled,receipt:{...scheduled.receipt,remote_id:'999'}}],[snapshot],content).state,'awaiting_evidence');
  assert.equal(entry([{...scheduled,receipt:{...scheduled.receipt,verified:false}}],[snapshot],content).state,'awaiting_evidence');
  assert.equal(entry([scheduled],[],content).state,'awaiting_evidence');
  assert.equal(entry([scheduled],[{...snapshot,snapshot:{...snapshot.snapshot,scheduled_for:proposed}}],content).state,'awaiting_evidence');
  const posted = { ...scheduled, status:'published', receipt:{ ...scheduled.receipt, state:'published' } };
  const row = entry([posted],[snapshot],{...item,publishing_status:'published'});
  assert.equal(row.state,'published_verified');
  assert.equal(row.publication.observedAt,observed);
  assert.deepEqual(row.slot,{kind:'approved',at:approved});
  assert.doesNotMatch(JSON.stringify(row),/private-file|private-provider-reference/);
});

test('Calendar does not promote old cancellations, ambiguous outcomes, resolved alerts or cross-team joins', () => {
  const closed = { ...job, status:'cancelled' };
  const draft = { ...item, publishing_status:'changes_requested' };
  const alert = {id:'alert',job_id:'job',content_id:'content',team_id:'team',campaign_id:'campaign',status:'acknowledged',severity:'critical',message:'private incident detail'};
  const row = entry([closed],[snapshot],draft,[alert,{...alert,id:'closed',status:'resolved'},{...alert,id:'other',team_id:'other'}]);
  assert.equal(row.state,'changes_requested');
  assert.deepEqual(row.slot,{kind:'proposed',at:proposed});
  assert.equal(row.alerts.length,1);
  assert.doesNotMatch(JSON.stringify(row),/private incident detail/);
  assert.equal(entry([{...job,status:'unknown'}]).state,'unknown');
  assert.equal(entry([{...job,status:'cancel_pending',receipt:{verified:true,state:'remote_scheduled'}}]).state,'cancel_pending');
  assert.equal(entry([{...job,team_id:'other'}]).publication,null);
});
