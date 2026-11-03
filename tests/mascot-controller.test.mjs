import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import vm from 'node:vm';

function setup(options = {}) {
  const path = new URL('../public/creative-os/mascot-controller.js', import.meta.url);
  assert.ok(existsSync(path), 'The mascot controller must exist independently of the UI');
  const scope = {setTimeout, clearTimeout};
  vm.runInNewContext(readFileSync(path, 'utf8'), scope);
  let now = 1000, sequence = 0;
  const timers = new Map();
  const controller = new scope.CLMMascot.MascotController({
    now: () => now,
    schedule: fn => {const id = ++sequence; timers.set(id, fn); return id;},
    cancel: id => timers.delete(id),
    ...options,
  });
  return {controller, timers, advance: value => {now += value;}, finish: () => {
    const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(fn => fn());
  }};
}

test('critical feedback preempts success; loading/delight cannot override an active error', () => {
  const {controller, timers, advance, finish} = setup();
  assert.equal(controller.dispatch('ACTION_SUCCESS'), true);
  assert.equal(controller.state, 'SUCCESS');
  assert.equal(controller.dispatch('ERROR'), true);
  assert.equal(controller.state, 'OOPS');
  assert.equal(controller.dispatch('DATA_LOADING'), false);
  assert.equal(controller.dispatch('DEAL_SIGNED'), false);
  assert.equal(timers.size, 1);
  advance(1000); finish();
  assert.equal(controller.state, 'IDLE');
});

test('repeated events debounce and a replacement cancels the previous reaction', () => {
  const {controller, timers, advance} = setup();
  controller.dispatch('ACTION_SUCCESS');
  assert.equal(controller.dispatch('ACTION_SUCCESS'), false);
  advance(500);
  controller.dispatch('ACTION_SUCCESS');
  assert.equal(timers.size, 1);
});

test('focus suppresses reactions and look tracking; presence restores safely', () => {
  const {controller, timers} = setup();
  controller.dispatch('ACTION_SUCCESS');
  controller.setPresence(0);
  assert.equal(controller.state, 'FOCUS_MODE');
  assert.equal(controller.dispatch('ERROR'), false);
  controller.lookAt(999, -999);
  assert.equal(controller.look.x, 0);
  assert.equal(timers.size, 0);
  controller.setPresence(1);
  assert.equal(controller.state, 'IDLE');
  controller.lookAt(999, -999);
  assert.equal(controller.look.x, 3);
  assert.equal(controller.look.y, -3);
});

test('reduced motion retains state feedback but removes pointer movement', () => {
  const {controller} = setup({reducedMotion: true});
  controller.lookAt(2, 1);
  assert.equal(controller.look.x, 0);
  assert.equal(controller.dispatch('DATA_LOADING'), true);
  assert.equal(controller.state, 'THINKING');
  controller.setState('invalid-state');
  assert.equal(controller.state, 'THINKING');
});

test('destroy cancels timers/listeners and makes the controller inert', () => {
  const {controller, timers} = setup();
  let updates = 0;
  const unsubscribe = controller.subscribe(() => {updates++;});
  controller.celebrate();
  unsubscribe();
  const before = updates;
  controller.destroy();
  assert.equal(timers.size, 0);
  assert.equal(controller.dispatch('ERROR'), false);
  controller.lookAt(2, 2);
  assert.equal(updates, before);
});
