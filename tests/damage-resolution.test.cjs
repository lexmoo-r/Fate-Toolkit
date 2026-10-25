const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { baseContext } = require('./harness.cjs');

const root = path.join(__dirname, '..');
const context = baseContext();
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'scripts/damage-resolution.js'), 'utf8'), context, { filename:'damage-resolution.js' });

function makeService({ actor, user = {id:'u1'}, state = null, spec = null } = {}) {
  const message = { id:'m1' };
  const calls = { audit:[], event:[], states:[], notify:0, combatant:[] };
  const combatant = {id:'c1', defeated:false, async update(patch){ this.defeated = Boolean(patch.defeated); calls.combatant.push(patch); }};
  const combat = {id:'combat1', combatants:{get:id => id === 'c1' ? combatant : null}};
  const service = context.FateToolkitDamageResolution.create({
    getMessage: id => id === 'm1' ? message : null,
    getUser: id => id === 'u1' ? user : null,
    actorFromUuid: async uuid => uuid === 'Actor.a1' ? actor : null,
    canUserControlActor: (u,a) => u === user && a === actor,
    damageSpec: () => spec || { actorUuid:'Actor.a1', actorName:'Alice', total:3 },
    normalizedDamageState: () => state || { actorUuid:'Actor.a1', actorName:'Alice', total:3, remaining:3, status:'pending', selections:[], takenOut:null },
    trackHasAspect: track => Boolean(track.aspect?.when_marked || track.aspect?.as_name),
    trackMarked: track => Boolean(track.box_values?.some(Boolean) || track.aspect?.name),
    stressCapacity: (track,index) => String(track.label||'').toLowerCase() === 'escalating' ? index + 1 : Number(track.harm_can_absorb)||0,
    arraysEqual: (a,b) => JSON.stringify(a||[]) === JSON.stringify(b||[]),
    randomId: () => 'sel1',
    findCombatantForActor: async () => ({combat, combatant}),
    getCombat: id => id === 'combat1' ? combat : null,
    getCurrentCombat: () => combat,
    updateDamageState: async (_m, next) => calls.states.push(next),
    appendAudit: async (_m,row) => calls.audit.push(row),
    recordConflictEvent: async row => calls.event.push(row),
    notify: () => { calls.notify += 1; }
  });
  return { service, message, calls };
}

(async () => {
  const stressActor = {
    uuid:'Actor.a1', name:'Alice',
    system:{tracks:{physical:{name:'Physical', enabled:true, harm_can_absorb:2, box_values:[false,false], aspect:{}}}},
    updates:[], async update(patch){ this.updates.push(patch); }
  };
  let { service, calls } = makeService({ actor:stressActor });
  let checked = await service.prepareApply({messageId:'m1',userId:'u1',kind:'stress',trackKey:'physical',boxIndex:0});
  assert.equal(checked.ok, true);
  assert.equal(checked.selection.capacity, 2);
  assert.deepEqual(Array.from(checked.actorUpdate['system.tracks.physical.box_values']), [true,false]);
  let committed = await service.commitApply(checked);
  assert.equal(committed.ok, true);
  assert.equal(stressActor.updates.length, 1);
  assert.equal(calls.states[0].remaining, 1);
  assert.equal(calls.audit[0].type, 'stress');
  assert.equal(calls.event[0].type, 'damage');
  assert.equal(calls.notify, 1);

  const consequenceActor = {
    uuid:'Actor.a1', name:'Alice',
    system:{tracks:{mild:{name:'Mild', enabled:true, harm_can_absorb:2, box_values:[false], aspect:{when_marked:true,name:''}}}},
    updates:[], async update(patch){ this.updates.push(patch); }
  };
  ({ service, calls } = makeService({ actor:consequenceActor, spec:{actorUuid:'Actor.a1',actorName:'Alice',total:2} }));
  checked = await service.prepareApply({messageId:'m1',userId:'u1',kind:'consequence',trackKey:'mild',name:'Broken nose'});
  assert.equal(checked.ok, true);
  assert.equal(checked.selection.name, 'Broken nose');
  assert.equal(checked.actorUpdate['system.tracks.mild.aspect.name'], 'Broken nose');
  committed = await service.commitApply(checked);
  assert.equal(committed.ok, true);
  assert.equal(calls.states[0].status, 'resolved');
  assert.equal(calls.audit[0].type, 'consequence');

  const occupiedState = {actorUuid:'Actor.a1',actorName:'Alice',total:3,remaining:1,status:'pending',selections:[{kind:'stress',capacity:2}],takenOut:null};
  ({ service } = makeService({ actor:stressActor, state:occupiedState }));
  checked = await service.prepareApply({messageId:'m1',userId:'u1',kind:'stress',trackKey:'physical',boxIndex:1});
  assert.equal(checked.ok, false);
  assert.match(checked.message, /только одну ячейку стресса/i);

  ({ service } = makeService({ actor:consequenceActor }));
  checked = await service.prepareApply({messageId:'m1',userId:'u1',kind:'consequence',trackKey:'mild',name:''});
  assert.equal(checked.ok, false);
  assert.match(checked.message, /название последствия/i);

  ({ service, calls } = makeService({ actor:stressActor, state:{actorUuid:'Actor.a1',actorName:'Alice',total:3,remaining:2,status:'pending',selections:[],takenOut:null} }));
  checked = await service.prepareTakeOut({messageId:'m1',userId:'u1'});
  assert.equal(checked.ok, true);
  assert.equal(checked.nextState.status, 'taken-out');
  committed = await service.commitTakeOut(checked);
  assert.equal(committed.ok, true);
  assert.equal(calls.combatant.at(-1).defeated, true);
  assert.equal(calls.states.at(-1).status, 'taken-out');
  assert.equal(calls.audit.at(-1).type, 'takenout');

  ({ service, calls } = makeService({ actor:stressActor, state:{actorUuid:'Actor.a1',actorName:'Alice',total:3,remaining:2,status:'taken-out',selections:[],takenOut:{combatId:'combat1',combatantId:'c1',beforeDefeated:false}} }));
  checked = await service.prepareUndoTakeOut({messageId:'m1',userId:'u1'});
  assert.equal(checked.ok, true);
  checked.combatant.defeated = true;
  committed = await service.commitUndoTakeOut(checked);
  assert.equal(committed.ok, true);
  assert.equal(calls.combatant.at(-1).defeated, false);
  assert.equal(calls.states.at(-1).status, 'pending');
  assert.equal(calls.audit.at(-1).label, 'Выбывание отменено');

  console.log('damage-resolution.test.cjs OK');
})().catch(err => { console.error(err); process.exit(1); });
