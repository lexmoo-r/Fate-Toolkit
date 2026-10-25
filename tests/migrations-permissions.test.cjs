const assert = require('assert');
const fs=require('fs'),vm=require('vm'),path=require('path');
const users=[{id:'gm2',active:true,isGM:true},{id:'gm1',active:true,isGM:true},{id:'u1',active:true,isGM:false}];
let pcode=fs.readFileSync(path.join(__dirname,'../scripts/permissions.js'),'utf8');
const pctx={console,globalThis:null,game:{user:users[2],users:{contents:users,activeGM:users[0]}}};pctx.globalThis=pctx;vm.createContext(pctx);vm.runInContext(pcode,pctx);
const p=pctx.FateToolkitPermissions;
assert.equal(p.primaryActiveGM().id,'gm2','primary GM must come from Foundry activeGM, not id sorting');
const actor={testUserPermission:(u,l)=>u.id==='u1'&&l==='OWNER'};
assert.equal(p.canControlActor(users[2],actor),true);
assert.equal(p.resultBelongsToUser({author:{id:'u1'},flags:{'fate-aspect-widget':{targetUserId:'u1'}}},'u1'),true);
assert.equal(p.resultBelongsToUser({author:{id:'gm1'},flags:{'fate-aspect-widget':{targetUserId:'u1'}}},'u1'),false);

let dcode=fs.readFileSync(path.join(__dirname,'../scripts/data-migrations.js'),'utf8');
dcode+='\n;globalThis.__m={fawDataNormalizeAudit,fawDataNormalizeQueueRows,fawDataNormalizeActionDraft,fawDataSanitizePublicOpposition,fawDataSanitizeRequest};';
const dctx={console,globalThis:null,Hooks:{once(){}},game:{},foundry:{utils:{randomID:()=> 'id',duplicate:x=>JSON.parse(JSON.stringify(x))}}};dctx.globalThis=dctx;vm.createContext(dctx);vm.runInContext(dcode,dctx);
const audit=dctx.__m.fawDataNormalizeAudit([{type:'result',label:'R',detail:'public',gmDetail:'secret'}]);
assert.ok(!('gmDetail' in audit[0]));
const queue=dctx.__m.fawDataNormalizeQueueRows([{proposal:{id:'x'}},{proposal:{id:'x'}},{proposal:{id:'y'}}],{limit:10,idPath:['proposal','id']});
assert.equal(queue.length,2,'restored queue deduplicates proposal ids');
assert.equal(dctx.__m.fawDataNormalizeActionDraft('garbage'),undefined);

const leakedOpposition={mode:'opponent',hidden:true,total:8,actorName:'Secret NPC',actorUuid:'Actor.secret',skillName:'Will',skillRank:5,stunts:[{name:'Secret'}],messageId:'hidden-msg',math:{total:8},history:[{total:8}]};
const publicOpposition=JSON.parse(JSON.stringify(dctx.__m.fawDataSanitizePublicOpposition(leakedOpposition)));
assert.deepEqual(publicOpposition,{mode:'opponent',hidden:true,kind:'hidden'},'migration sanitizer must reduce hidden opposition to the strict public DTO');
const publicRequest=JSON.parse(JSON.stringify(dctx.__m.fawDataSanitizeRequest({id:'r1',opposition:leakedOpposition})));
assert.deepEqual(publicRequest.opposition,{mode:'opponent',hidden:true,kind:'hidden'},'persisted requests must scrub legacy hidden metadata');

(async () => {
  const flags={
    persistentGmRollRequests:[{id:'gmreq',createdAt:1,oppositionByUser:{u1:{hidden:true,actorUuid:'Actor.secret',skillName:'Will'}}}],
    persistentAuthenticatedActionProposalsV1:[{id:'proposal1',actorUuid:'Actor.hero',target:{actorUuid:'Actor.secret'}}],
    persistentRollRequests:[{id:'player-r1',createdAt:2,opposition:leakedOpposition}],
    persistentActionDraftV1:{actorRef:'Actor.hero',targetRef:'Actor.target',sceneId:'s1',updatedAt:3},
    persistentPendingActionV1:{proposal:{id:'p1',actorUuid:'Actor.hero'},status:'waiting',updatedAt:4},
    persistentOppositionQueueV1:[{proposal:{id:'q1',actorUuid:'Actor.hero'},createdAt:5}],
    milestoneDraftsV2:{'m1:a1':{sessionId:'m1',actorId:'a1',draft:{minor:{type:'none'}},currentStep:'review',updatedAt:6}},
    persistentActionHandoffsV1:[{request:{id:'h1',opposition:leakedOpposition},createdAt:7}]
  };
  const gmUser={
    id:'gm2',isGM:true,active:true,
    getFlag(_scope,key){ return flags[key]; },
    async unsetFlag(_scope,key){ delete flags[key]; },
    async setFlag(_scope,key,value){ flags[key]=value; }
  };
  const local=new Map();
  const storage={
    getItem:key => local.has(key) ? local.get(key) : null,
    setItem:(key,value) => local.set(key,String(value)),
    removeItem:key => local.delete(key)
  };
  let mcode=fs.readFileSync(path.join(__dirname,'../scripts/data-migrations.js'),'utf8');
  mcode+='\n;globalThis.__migrate={fawRepairUser,fawDataReport,fawDataPrivateClientKey};';
  const mctx={console,globalThis:null,Hooks:{once(){}},game:{user:gmUser,world:{id:'w1'},settings:{storage:new Map([['client',storage]])}},foundry:{utils:{randomID:()=> 'id',duplicate:x=>JSON.parse(JSON.stringify(x))}}};
  mctx.globalThis=mctx; vm.createContext(mctx); vm.runInContext(mcode,mctx);
  const report=mctx.__migrate.fawDataReport(4,5);
  await mctx.__migrate.fawRepairUser(gmUser,report);

  for (const key of [
    'persistentGmRollRequests','persistentAuthenticatedActionProposalsV1','persistentRollRequests',
    'persistentActionDraftV1','persistentPendingActionV1','persistentOppositionQueueV1','milestoneDraftsV2'
  ]) assert.equal(flags[key],undefined,`${key} must be removed from synchronized User flags`);

  const gmCache=JSON.parse(local.get(mctx.__migrate.fawDataPrivateClientKey('gmRollRequests','gm2')));
  assert.equal(gmCache[0].oppositionByUser.u1.actorUuid,'Actor.secret','private migration must preserve GM-only opposition detail locally');
  const proposalCache=JSON.parse(local.get(mctx.__migrate.fawDataPrivateClientKey('authenticatedActionProposals','gm2')));
  assert.equal(proposalCache[0].target.actorUuid,'Actor.secret');
  const playerCache=JSON.parse(local.get(mctx.__migrate.fawDataPrivateClientKey('playerRollRequests','gm2')));
  assert.deepEqual(playerCache[0].opposition,{mode:'opponent',hidden:true,kind:'hidden'});
  const draft=JSON.parse(local.get(mctx.__migrate.fawDataPrivateClientKey('persistentActionDraftV1','gm2')));
  assert.equal(draft.actorRef,'Actor.hero');
  const pending=JSON.parse(local.get(mctx.__migrate.fawDataPrivateClientKey('persistentPendingActionV1','gm2')));
  assert.equal(pending.proposal.id,'p1');
  const oppositionQueue=JSON.parse(local.get(mctx.__migrate.fawDataPrivateClientKey('persistentOppositionQueueV1','gm2')));
  assert.equal(oppositionQueue[0].proposal.id,'q1');
  const milestoneDrafts=JSON.parse(local.get(mctx.__migrate.fawDataPrivateClientKey('milestoneDraftsV2','gm2')));
  assert.equal(milestoneDrafts['m1:a1'].actorId,'a1');

  assert.equal(flags.persistentActionHandoffsV1.length,1,'durable handoff remains synchronized');
  assert.deepEqual(flags.persistentActionHandoffsV1[0].request.opposition,{mode:'opponent',hidden:true,kind:'hidden'},'durable handoff must be sanitized');
  assert.ok(report.removed >= 7);
  console.log('migrations-permissions.test.cjs OK');
})().catch(error => { console.error(error); process.exit(1); });
