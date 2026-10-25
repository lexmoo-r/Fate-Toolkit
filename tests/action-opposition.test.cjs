const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const root = path.join(__dirname, '..');
const context = { console, globalThis: null, game: { user: { id: 'gm1' } } };
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'scripts/action-opposition.js'), 'utf8'), context, { filename: 'action-opposition.js' });

const original = { id:'a1', uuid:'Actor.a1', name:'Hero', system:{ skills:{ Will:{ name:'Will', rank:2 } } } };
const foe = { id:'b1', uuid:'Actor.b1', name:'Foe', system:{ skills:{ Fight:{ name:'Fight', rank:3 } } } };
const posted = [];
const service = context.FateToolkitActionOpposition.create({
  resolveProposalTargetActor: async proposal => proposal.target?.actorId === original.id ? original : null,
  gmOppositionTargetOptions: () => [{ ref:'actor:b1', name:'Foe', actor:foe }],
  proposalTargetForOpponentRef: ref => ref === 'actor:b1' ? { type:'actor', actorId:'b1', name:'Foe' } : null,
  actorSkills: actor => Object.values(actor?.system?.skills || {}),
  findSkill: (actor, name) => Object.values(actor?.system?.skills || {}).find(s => s.name === name) || null,
  validateStuntSelection: (actor, keys) => keys.map(key => ({ key, name:`Stunt ${key}`, bonus:1, linkedSkill:'Fight' })),
  oppositionActionType: () => 'defend',
  stuntBonusTotal: stunts => stunts.reduce((sum, stunt) => sum + stunt.bonus, 0),
  snapshotRollMath: (roll, data) => ({ ...data, diceValues:[1,0,-1,1], diceTotal:1, diceSignature:'[1,0,-1,1]', modifierSources:[], extraBonus:0, total:roll.total, revisionType:'initial', revisionLabel:'Первый бросок' }),
  rollFormula: async formula => ({ total:7, formula }),
  postOppositionRoll: async args => { posted.push(args); return { id:'msg1' }; }
});

(async () => {
  const prep = await service.prepare({ target:{ type:'actor', actorId:'a1', name:'Hero' } });
  assert.equal(prep.initialTargetRef, 'actor:a1');
  assert.equal(prep.initialMode, 'roll');
  assert.equal(prep.candidateRows[0].actor, original, 'resolved original target should be restored as fallback candidate');

  const none = await service.resolve({}, { mode:'none' }, prep);
  assert.deepEqual(JSON.parse(JSON.stringify(none.opposition)), { total:null, hidden:false, mode:'none', label:'Без оппозиции' });

  const fixed = await service.resolve({ target:{ name:'Wall' } }, { mode:'fixed', difficulty:4, hidden:true }, prep);
  assert.equal(fixed.opposition.total, 4);
  assert.equal(fixed.opposition.hidden, true);
  assert.equal(fixed.opposition.label, 'Wall');

  const rank = await service.resolve({}, { mode:'rank', targetRef:'actor:b1', skillName:'Fight', stuntKeys:['x'], hidden:false }, prep);
  assert.equal(rank.ok, true);
  assert.equal(rank.opposition.total, 4);
  assert.equal(rank.opposition.kind, 'rank');
  assert.equal(rank.opposition.messageId, null);
  assert.equal(rank.assignedTarget.actorId, 'b1');
  assert.equal(posted.length, 0, 'rank opposition must not create a roll message');

  const roll = await service.resolve({}, { mode:'roll', targetRef:'actor:b1', skillName:'Fight', stuntKeys:['x'], hidden:true }, prep);
  assert.equal(roll.ok, true);
  assert.equal(roll.opposition.total, 7);
  assert.equal(roll.opposition.kind, 'roll');
  assert.equal(roll.opposition.messageId, 'msg1');
  assert.equal(roll.opposition.hidden, true);
  assert.equal(posted.length, 1);
  assert.equal(posted[0].hidden, true);

  const badActor = await service.resolve({}, { mode:'roll', targetRef:'missing', skillName:'Fight' }, prep);
  assert.equal(badActor.ok, false);
  assert.match(badActor.message, /выберите цель/i);

  const badSkill = await service.resolve({}, { mode:'roll', targetRef:'actor:b1', skillName:'Missing' }, prep);
  assert.equal(badSkill.ok, false);
  assert.match(badSkill.message, /выберите навык/i);

  console.log('action-opposition.test.cjs OK');
})().catch(error => { console.error(error); process.exit(1); });
