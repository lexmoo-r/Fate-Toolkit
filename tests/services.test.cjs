const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { baseContext } = require('./harness.cjs');

const root = path.join(__dirname, '..');
const context = baseContext();
vm.createContext(context);
for (const rel of [
  'scripts/window-runtime.js',
  'scripts/private-storage.js',
  'scripts/roll-presentation.js',
  'scripts/outcome-sounds.js',
  'scripts/fate-rules.js',
  'scripts/action-state.js',
  'scripts/result-rules.js',
  'scripts/sound-settings-ui.js',
  'scripts/roll-request-ui.js',
  'scripts/opposition-public.js',
  'scripts/request-state.js',
  'scripts/request-builder.js',
  'scripts/request-result-validation.js',
  'scripts/request-result-compute.js',
  'scripts/boost-claim-plan.js','scripts/boost-claim-commit.js',
  'scripts/opposition-revision.js',
  'scripts/result-action-plan.js',
  'scripts/result-action-commit.js',
  'scripts/roll-revision.js',
  'scripts/opposition-refresh-compute.js',
  'scripts/action-opposition.js',
  'scripts/action-opposition-ui.js',
  'scripts/player-opposition-ui.js',
  'scripts/defend-choice-ui.js',
  'scripts/player-opposition-roll.js',
  'scripts/runtime-contracts.js'
]) {
  vm.runInContext(fs.readFileSync(path.join(root, rel), 'utf8'), context, { filename: rel });
}

assert.equal(context.FateToolkitRuntimeContracts.assertReady(), true);
assert.deepEqual(Array.from(context.FateToolkitRuntimeContracts.inspect()), []);

const rows = new Map();
for (let i = 0; i < 60; i++) rows.set(String(i), { id:String(i), createdAt:i });
const stored = context.FateToolkitPrivateStorage.requestRowsForStorage(rows);
assert.equal(stored.length, 50);
assert.equal(stored[0].id, '10');
assert.equal(stored.at(-1).id, '59');

let leakedGmFlagWrites = 0;
context.game.user.isGM = true;
context.game.user.setFlag = async () => { leakedGmFlagWrites += 1; };
const gmStateRows = new Map([['r1', {id:'r1', createdAt:1, oppositionByUser:{u1:{hidden:true, actorUuid:'Actor.secret'}}}]]);
const gmPrivateWrites = [];
const requestState = context.FateToolkitRequestState.create({
  moduleId:'fate-aspect-widget',
  pendingRequests:new Map(),
  gmRequests:gmStateRows,
  storageKey:key => `test:${key}`,
  requestRowsForStorage:context.FateToolkitPrivateStorage.requestRowsForStorage,
  readPrivateClientRows:() => [],
  writePrivateClientRows:(key, rows) => gmPrivateWrites.push([key, rows]),
  refreshWorkflowCenter:() => {}
});
requestState.saveGmRequests();
assert.equal(leakedGmFlagWrites, 0, 'GM-private request state must never use User.setFlag');
assert.equal(gmPrivateWrites.length, 1);
assert.equal(gmPrivateWrites[0][0], 'gmRollRequests');
assert.equal(gmPrivateWrites[0][1][0].oppositionByUser.u1.actorUuid, 'Actor.secret');
context.game.user.isGM = false;

const playerPrivateWrites = [];
const playerPending = new Map([['p1',{id:'p1',createdAt:1}]]);
const playerState = context.FateToolkitRequestState.create({
  moduleId:'fate-aspect-widget', pendingRequests:playerPending, gmRequests:new Map(),
  storageKey:key => `test-player:${key}`,
  requestRowsForStorage:context.FateToolkitPrivateStorage.requestRowsForStorage,
  readPrivateClientRows:() => [],
  writePrivateClientRows:(key, rows) => playerPrivateWrites.push([key, rows]),
  refreshWorkflowCenter:() => {}
});
playerState.savePlayerPending();
assert.equal(leakedGmFlagWrites, 0, 'player pending requests must never use User.setFlag');
assert.equal(playerPrivateWrites[0][0], 'playerRollRequests');
assert.equal(playerPrivateWrites[0][1][0].id, 'p1');

const result = context.FateToolkitResultRules;
assert.equal(result.outcomeFor('attack', 0).key, 'tie');
assert.equal(result.outcomeFor('attack', 3).key, 'style');
assert.equal(result.createdAspectOpportunity({ resolved:true, actionType:'create', createMode:'new', sceneId:'s1', outcome:'style' }).freeInvokes, 2);
assert.equal(result.contextualResultOpportunity({ resolved:true, actionType:'overcome', outcome:'success', actionTarget:{type:'marker',name:'Fog',markerId:'m1'}, sceneId:'s1' }).kind, 'remove-marker');

const rules = context.FateToolkitRules;
const actor = { system:{ skills:{ fight:{name:'Fight',rank:3}, lore:{name:'Lore',rank:2} }, stunts:{} } };
assert.equal(rules.findSkill(actor, 'Fight').rank, 3);
assert.equal(rules.coreAllowsAction('Fight','attack'), true);
assert.equal(rules.coreAllowsAction('Lore','attack'), false);


const oppositionPublic = context.FateToolkitOppositionPublic.create({
  esc: value => String(value ?? ''), stuntSummaryText: () => 'hidden-stunts', ladderText: () => 'Great', signed: value => `${Number(value) >= 0 ? '+' : ''}${Number(value)}`
});
const projectedHidden = oppositionPublic.toPublic({mode:'opponent', hidden:true, total:9, actorName:'Secret', actorUuid:'Actor.secret', skillName:'Will', stunts:[{name:'Spy'}], messageId:'m1', math:{total:9}});
assert.deepEqual(JSON.parse(JSON.stringify(projectedHidden)), {mode:'opponent', hidden:true, kind:'hidden'});
assert.equal(oppositionPublic.publicText(projectedHidden), 'Оппозиция соперника скрыта мастером');

// The guard must fail closed if a required API disappears.
const saved = context.FateToolkitResultRules;
context.FateToolkitResultRules = null;
assert.throws(() => context.FateToolkitRuntimeContracts.assertReady(), /FateToolkitResultRules/);
context.FateToolkitResultRules = saved;

console.log('services.test.cjs OK');
