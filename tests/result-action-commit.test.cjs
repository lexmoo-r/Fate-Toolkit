const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { baseContext } = require('./harness.cjs');

const root = path.join(__dirname, '..');
const context = baseContext();
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'scripts/result-action-commit.js'), 'utf8'), context, { filename:'result-action-commit.js' });

const calls = [];
const updates = [];
const audits = [];
const events = [];
const service = context.FateToolkitResultActionCommit.create({
  adjustAspectFreeInvokes: async (...args) => { calls.push(['adjust', ...args]); return {kind:'scene', after:2}; },
  removeAspectSource: async (...args) => { calls.push(['removeSource', ...args]); return {kind:'scene'}; },
  removeAspectMarker: async (...args) => { calls.push(['removeMarker', ...args]); return true; },
  addSceneAspect: async (...args) => { calls.push(['addSceneAspect', ...args]); return {id:'a1', sceneId:'s1', name:args[1], freeInvokes:args[2]}; },
  updateMessage: async (message, patch) => updates.push([message.id, patch]),
  appendAudit: async (message, row) => audits.push([message.id, row]),
  recordConflictEvent: async row => events.push(row)
});

(async () => {
  const message = {id:'m1'};
  let result = await service.contextual({
    payload:{userId:'u1'},
    checked:{message, opportunity:{kind:'add-invokes', source:{kind:'scene', sceneId:'s1', index:0}, amount:2, name:'Fog'}}
  });
  assert.equal(result.ok, true);
  assert.equal(calls[0][0], 'adjust');
  assert.equal(updates.at(-1)[1].contextResultApplied.kind, 'add-invokes');
  assert.match(audits.at(-1)[1].detail, /\+2/);

  calls.length = 0;
  result = await service.contextual({
    payload:{userId:'u1'},
    checked:{message, opportunity:{kind:'remove-source', source:{kind:'scene', sceneId:'s1', index:0}, markerId:'mk1', sceneId:'s1', amount:0, name:'Fog'}}
  });
  assert.equal(result.ok, true);
  assert.deepEqual(calls.map(row => row[0]), ['removeSource','removeMarker']);

  calls.length = 0;
  result = await service.contextual({
    payload:{userId:'u1'},
    checked:{message, opportunity:{kind:'remove-marker', markerId:'mk2', sceneId:'s1', amount:0, name:'Smoke'}}
  });
  assert.equal(result.ok, true);
  assert.equal(calls[0][0], 'removeMarker');
  assert.equal(result.result.kind, 'marker');

  calls.length = 0;
  result = await service.createdAspect({
    payload:{userId:'u1'},
    checked:{message, flags:{sceneId:'s1'}, opportunity:{freeInvokes:2}, actor:{uuid:'Actor.a1', name:'Alice'}, name:'Pinned Down'}
  });
  assert.equal(result.ok, true);
  assert.equal(calls[0][0], 'addSceneAspect');
  assert.equal(calls[0][1], 's1');
  assert.equal(calls[0][2], 'Pinned Down');
  assert.equal(calls[0][3], 2);
  assert.equal(updates.at(-1)[1].createdAspectClaimed, true);
  assert.equal(updates.at(-1)[1].createdSceneAspect.id, 'a1');
  assert.equal(events.at(-1).actorUuid, 'Actor.a1');

  const failed = await service.contextual({ payload:{userId:'u1'}, checked:{message, opportunity:{kind:'unknown'}} });
  assert.equal(failed.ok, false);

  console.log('result-action-commit.test.cjs OK');
})().catch(err => { console.error(err); process.exit(1); });
