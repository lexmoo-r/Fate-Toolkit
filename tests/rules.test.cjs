const assert = require('assert');
const { loadScript } = require('./harness.cjs');
const { exports: r } = loadScript('scripts/roll-request.js', [
  'outcomeFor','boostOpportunityFor','oppositionActionType','coreAllowsAction',
  'contextualResultOpportunity','createdAspectOpportunity','appendMathHistory','makePublicOpposition','publicOppositionText','privateOppositionActorUuidForResult'
]);

const expected = {
  overcome: ['failure','tie','success','style'],
  create: ['failure','tie','success','style'],
  attack: ['failure','tie','success','style'],
  defend: ['failure','tie','success','style']
};
const diffs = [-2, 0, 1, 3];
for (const [action, keys] of Object.entries(expected)) {
  diffs.forEach((diff, i) => assert.equal(r.outcomeFor(action, diff, { defendedAgainst: 'attack', createMode: 'new' }).key, keys[i], `${action} @ ${diff}`));
}
assert.equal(r.oppositionActionType({ actionType: 'attack' }), 'defend');
assert.equal(r.oppositionActionType({ actionType: 'create' }), 'defend');
assert.equal(r.oppositionActionType({ actionType: 'defend', defendedAgainst: 'attack' }), 'attack');
assert.equal(r.coreAllowsAction('Fight', 'attack'), true);
assert.equal(r.coreAllowsAction('Lore', 'attack'), false);

assert.deepEqual(JSON.parse(JSON.stringify(r.boostOpportunityFor('attack', 0, { actorUuid:'A' }, {}))), { recipient:'roller', reason:'attack-tie', tradeShift:false });
assert.equal(r.boostOpportunityFor('attack', 3, { actorUuid:'A' }, {}).tradeShift, true);
assert.equal(r.boostOpportunityFor('overcome', 3, null, {}).recipient, 'roller');
assert.equal(r.boostOpportunityFor('defend', 0, { actorUuid:'A' }, { defendedAgainst:'attack' }).recipient, 'opponent');

const existing = r.contextualResultOpportunity({ resolved:true, actionType:'create', createMode:'existing', outcome:'style', actionTarget:{type:'marker',name:'Pinned',source:{kind:'scene'}} });
assert.equal(existing.kind, 'add-invokes');
assert.equal(existing.amount, 2);
assert.equal(r.createdAspectOpportunity({ resolved:true, actionType:'create', createMode:'new', sceneId:'S', outcome:'success' }).freeInvokes, 1);
assert.equal(r.createdAspectOpportunity({ resolved:true, actionType:'create', createMode:'new', sceneId:'S', outcome:'style' }).freeInvokes, 2);

const sameDiceInitial = { diceSignature:'1,0,-1,1', total:3, revisionType:'initial', revisionLabel:'Первый бросок', modifierSources:[] };
const sameDiceReroll = { ...sameDiceInitial, revisionType:'reroll', revisionLabel:'Реролл' };
const history = r.appendMathHistory([sameDiceInitial], sameDiceReroll);
assert.equal(history.length, 2, 'explicit reroll with identical dice must remain a separate revision');

const hidden = JSON.parse(JSON.stringify(r.makePublicOpposition({ total:7, hidden:true, mode:'opponent', kind:'roll', actorUuid:'A', actorName:'Secret', skillName:'Will', skillRank:4, math:{total:7}, history:[{total:7}] })));
assert.deepEqual(hidden, { mode:'opponent', hidden:true, kind:'hidden' }, 'hidden opposition must use a strict public DTO');
for (const field of ['total','actorName','actorUuid','skillName','skillRank','stunts','stuntBonus','math','history','messageId']) {
  assert.ok(!(field in hidden), `hidden opposition must not expose ${field}`);
}
const hiddenText = r.publicOppositionText(hidden);
assert.equal(hiddenText, 'Оппозиция соперника скрыта мастером');
assert.ok(!/undefined|Secret|Will|Actor\./.test(hiddenText), 'hidden opposition presentation must not reference redacted fields');

const gmUser = { id:'gm1', isGM:true, active:true, getFlag:()=>null, setFlag:async()=>{}, unsetFlag:async()=>{} };
const { exports: privacy } = loadScript('scripts/roll-request.js', ['privateOppositionActorUuidForResult','gmRequests'], { users:[gmUser], user:gmUser });
privacy.gmRequests.set('hidden-request', { oppositionByUser:{ u1:{ actorUuid:'Actor.secret-opponent' } } });
const hiddenMessage = { flags:{ 'fate-aspect-widget':{ requestId:'hidden-request', targetUserId:'u1', oppositionHidden:true } } };
assert.equal(privacy.privateOppositionActorUuidForResult(hiddenMessage), 'Actor.secret-opponent', 'GM may recover hidden opponent only from private GM request state');
assert.equal(r.privateOppositionActorUuidForResult(hiddenMessage), null, 'players must never recover hidden opponent identity from private helper');

console.log('rules.test.cjs OK');
