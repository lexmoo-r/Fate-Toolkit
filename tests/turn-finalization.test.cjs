const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { baseContext } = require('./harness.cjs');

const root = path.join(__dirname, '..');
const context = baseContext();
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'scripts/turn-finalization.js'), 'utf8'), context, { filename:'turn-finalization.js' });

(async () => {
  const actor = {uuid:'Actor.a1', name:'Alice'};
  const nextActor = {uuid:'Actor.a2', name:'Bob'};
  const flags = new Map();
  const current = {id:'c1', actor, name:'Alice', defeated:false, async setFlag(scope,key,value){ flags.set(`${scope}.${key}`, value); }};
  const next = {id:'c2', actor:nextActor, name:'Bob', defeated:false};
  const combatants = new Map([[current.id,current],[next.id,next]]);
  const combat = {id:'combat1', combatant:current, combatants:{get:id=>combatants.get(id)}, updates:[], async update(patch){this.updates.push(patch);} };
  const user = {id:'u1',isGM:false};
  const gm = {id:'gm',isGM:true};
  const message = {
    id:'m1',
    flags:{'fate-aspect-widget':{resolved:true,actorUuid:'Actor.a1',targetUserId:'u1'}},
    updates:[],
    async update(patch){this.updates.push(patch);}
  };
  const calls = {current:[],audit:[],events:[]};
  let pending = null;
  const service = context.FateToolkitTurnFinalization.create({
    canUserOwnActor:(u,a)=>u.id==='u1' && a===actor,
    pendingDamageForActor:()=>pending,
    nextUnacted:()=>next,
    setCurrent:async (...args)=>calls.current.push(args),
    getMessage:id=>id==='m1'?message:null,
    appendAudit:async (_m,row)=>calls.audit.push(row),
    recordConflictEvent:async (row,c)=>calls.events.push([row,c]),
    unknownLabel:()=> 'Unknown',
    eventText:name=>`${name} finished`,
    systemId:'fate-core-official',
    moduleId:'fate-aspect-widget'
  });

  let checked = await service.prepare({combat,combatantId:'c1',user,messageId:'m1'});
  assert.equal(checked.ok,true);
  let committed = await service.commit(checked);
  assert.equal(committed.ok,true);
  assert.equal(flags.get('fate-core-official.hasActed'),true);
  assert.equal(message.updates[0]['flags.fate-aspect-widget.turnFinalized'],true);
  assert.equal(calls.audit[0].userId,'u1');
  assert.equal(calls.current[0][1],'c2');

  const spoofedActorMessage = {id:'bad-actor',flags:{'fate-aspect-widget':{resolved:true,actorUuid:'Actor.other',targetUserId:'u1'}}};
  const spoofedUserMessage = {id:'bad-user',flags:{'fate-aspect-widget':{resolved:true,actorUuid:'Actor.a1',targetUserId:'u2'}}};
  const missingUserMessage = {id:'missing-user',flags:{'fate-aspect-widget':{resolved:true,actorUuid:'Actor.a1'}}};
  const hardenedService = context.FateToolkitTurnFinalization.create({
    canUserOwnActor:(u,a)=>u.id==='u1' && a===actor,
    pendingDamageForActor:()=>null, nextUnacted:()=>next, setCurrent:async()=>{},
    getMessage:id=>({m1:message,'bad-actor':spoofedActorMessage,'bad-user':spoofedUserMessage,'missing-user':missingUserMessage}[id] ?? null),
    appendAudit:async()=>{}, recordConflictEvent:async()=>{}, unknownLabel:()=> 'Unknown', eventText:n=>n,
    systemId:'fate-core-official', moduleId:'fate-aspect-widget'
  });
  let spoofed = await hardenedService.prepare({combat,combatantId:'c1',user,messageId:'bad-actor'});
  assert.equal(spoofed.ok,false);
  assert.equal(spoofed.code,'invalid-message');
  spoofed = await hardenedService.prepare({combat,combatantId:'c1',user,messageId:'bad-user'});
  assert.equal(spoofed.ok,false);
  assert.equal(spoofed.code,'invalid-message');
  spoofed = await hardenedService.prepare({combat,combatantId:'c1',user,messageId:'missing-user'});
  assert.equal(spoofed.ok,false);
  assert.equal(spoofed.code,'invalid-message');

  const wrong = await service.prepare({combat:{...combat,combatant:next},combatantId:'c1',user});
  assert.equal(wrong.ok,false);
  assert.equal(wrong.code,'not-current');

  pending = {messageId:'hit1'};
  const blocked = await service.prepare({combat,combatantId:'c1',user});
  assert.equal(blocked.ok,false);
  assert.equal(blocked.code,'pending-damage');
  const gmOverride = await service.prepare({combat,combatantId:'c1',user:gm,allowPendingDamage:false});
  assert.equal(gmOverride.ok,true);

  const noNextCalls = [];
  const noNextService = context.FateToolkitTurnFinalization.create({
    canUserOwnActor:()=>true, pendingDamageForActor:()=>null, nextUnacted:()=>null,
    setCurrent:async()=>{}, getMessage:()=>null, appendAudit:async()=>{}, recordConflictEvent:async()=>{},
    unknownLabel:()=> 'Unknown', eventText:n=>n, systemId:'fate-core-official', moduleId:'fate-aspect-widget'
  });
  const lone = {id:'solo',actor,defeated:false,async setFlag(){}};
  const loneCombat = {combatant:lone,combatants:{get:id=>id==='solo'?lone:null},async update(p){noNextCalls.push(p);}};
  checked = await noNextService.prepare({combat:loneCombat,combatantId:'solo',user:gm});
  committed = await noNextService.commit(checked);
  assert.equal(committed.ok,true);
  assert.deepEqual(noNextCalls[0],{turn:null});

  console.log('turn-finalization.test.cjs OK');
})().catch(err=>{console.error(err);process.exit(1);});
