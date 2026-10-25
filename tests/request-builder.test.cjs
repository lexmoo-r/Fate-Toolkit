const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { baseContext } = require('./harness.cjs');

(async () => {
  const context = baseContext();
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'scripts/request-builder.js'), 'utf8'), context);

  const users = new Map([
    ['u1', { id:'u1', name:'Alice', character:{ skills:{ Fight:{name:'Fight',rank:2} } } }],
    ['u2', { id:'u2', name:'Bob', character:{ skills:{ Lore:{name:'Lore',rank:1} } } }]
  ]);
  const opponent = { id:'npc1', uuid:'Actor.npc1', name:'Guard', skills:{ Will:{name:'Will',rank:3} } };
  const findSkill = (actor, name) => actor?.skills?.[name] || null;
  const builder = context.FateToolkitRequestBuilder.create({
    resolveUser: id => users.get(id),
    actorFromRef: ref => ref === 'npc1' ? opponent : null,
    findSkill,
    validateStuntSelection: (_actor, keys) => keys.map(key => ({key, name:key, bonus:key === 'Iron' ? 2 : 0, linkedSkill:'Will'})),
    oppositionActionType: () => 'defend',
    stuntBonusTotal: stunts => stunts.reduce((sum, stunt) => sum + Number(stunt.bonus || 0), 0),
    snapshotRollMath: (roll, data) => ({...data, total:roll.total, diceValues:[1,0,-1,1], revisionType:'initial'}),
    rollFormula: async () => ({ total:7 })
  });

  let result = await builder.build({targetIds:[]});
  assert.equal(result.ok, false);
  assert.equal(result.level, 'warn');

  result = await builder.build({
    id:'r-fixed', targetIds:['u1'], title:'Check', actionType:'overcome', skillName:'Fight',
    oppositionMode:'fixed', difficulty:4, hideOpposition:true, createdAt:10, createdBy:'gm1'
  });
  assert.equal(result.ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(result.request.oppositionByUser.u1)), {total:4,hidden:true,mode:'fixed',label:'Сложность'});

  result = await builder.build({
    id:'r-none', targetIds:['u1'], actionType:'create', createMode:'new', oppositionMode:'none', createdAt:11, createdBy:'gm1'
  });
  assert.equal(result.ok, true);
  assert.equal(result.request.createMode, 'new');
  assert.equal(result.request.oppositionByUser.u1.mode, 'none');

  result = await builder.build({
    id:'r-opponent', targetIds:['u1'], actionType:'attack', skillName:'Fight', oppositionMode:'opponent',
    opponentActorRef:'npc1', opponentSkill:'Will', opponentKind:'roll', hideOpponentResult:true,
    stuntKeys:['Iron'], createdAt:12, createdBy:'gm1'
  });
  assert.equal(result.ok, true);
  assert.equal(result.request.oppositionByUser.u1.total, 7);
  assert.equal(result.request.oppositionByUser.u1.actorUuid, 'Actor.npc1');
  assert.equal(result.request.oppositionByUser.u1.hidden, true);
  assert.equal(result.request.oppositionByUser.u1.stuntBonus, 2);

  result = await builder.build({targetIds:['u2'], skillName:'Fight', oppositionMode:'none'});
  assert.equal(result.ok, false);
  assert.match(result.message, /Bob/);

  console.log('request-builder.test.cjs OK');
})().catch(err => { console.error(err); process.exit(1); });
