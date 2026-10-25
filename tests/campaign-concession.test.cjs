const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { baseContext } = require('./harness.cjs');

(async () => {
  const gm = { id:'gm', isGM:true };
  const player = { id:'p1', isGM:false };
  const actor = { uuid:'Actor.test', type:'fate-core-official', name:'Герой', testUserPermission:user=>user.id==='p1' };
  const row = { id:'combatant1', actor, defeated:false, async update(patch) { this.defeated=patch.defeated; } };
  const flags = {};
  const combat = {
    id:'fight-1',
    flags:{ 'fate-aspect-widget':flags },
    combatants:{ get:id=>id===row.id?row:null },
    getFlag:(namespace,name)=>flags[name],
    async setFlag(namespace,name,value){ flags[name]=structuredClone(value); }
  };
  const messages=new Map([['m1', { flags:{'fate-aspect-widget':{damageResolution:{actorUuid:actor.uuid,selections:[{kind:'consequence',capacity:2},{kind:'consequence',capacity:4}]}}}}]]);
  flags.conflictJournal=[{type:'consequence',actorUuid:actor.uuid,messageId:'m1'},{type:'consequence',actorUuid:actor.uuid,messageId:'m1'}];
  let eventCount=0, willTotal=0, willCalls=0, hook=null;
  const receipts=new Set();
  const context=baseContext({
    user:gm,
    game:{
      user:gm,
      users:{get:id=>id==='gm'?gm:id==='p1'?player:null},
      combats:{get:id=>id===combat.id?combat:null},
      messages:{get:id=>messages.get(id)},
      modules:{get:()=>({api:{pendingDamageForActor:()=>null,recordConflictEvent:async ()=>{eventCount++;}}})}
    },
    context:{
      fromUuid:async uuid=>uuid===actor.uuid?actor:null,
      Hooks:{on:(name,handler)=>{if(name==='preDeleteCombat')hook=handler;}},
      FateToolkitWill:{ enabled:()=>true, details:()=>({configured:true}),handler:async(payload)=>{willCalls++;if(!receipts.has(payload.eventId)){willTotal+=payload.delta;receipts.add(payload.eventId);}return {ok:true};}},
      FateToolkitRPC:{register:()=>{},executeAsGM:async()=>({ok:true})}
    }
  });
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../scripts/campaign-concession.js'),'utf8'),context);
  const api=context.FateToolkitConcession;
  assert.equal(api.payoutAmount(2),3);
  assert.equal(api.consequencesFromMessages(combat,actor.uuid),2);
  const conceded=await api.concede(combat,row.id,'Отступает, сохранив зеркало',player);
  assert.equal(conceded.ok,true);
  assert.equal(row.defeated,true);
  assert.equal(api.isConceded(combat,row.id),true);
  assert.equal(eventCount,1);
  assert.equal((await api.concede(combat,row.id,'Дублирование',player)).duplicate,true);
  assert.equal(eventCount,1);
  // After undo, the journal still contains two consequence entries, but the
  // current ChatMessage has only one; only the surviving selection is paid.
  messages.get('m1').flags['fate-aspect-widget'].damageResolution.selections.pop();
  assert.equal(api.consequencesFromMessages(combat,actor.uuid),1);
  assert.equal(hook(combat),false,'native deletion must not forfeit unpaid concessions');
  const paid=await api.finalize(combat);
  assert.equal(paid.paid.length,1);
  assert.equal(paid.paid[0].amount,2);
  assert.equal(willTotal,2);
  assert.equal(flags.campaignConcessions[row.id].paid,true);
  assert.equal(hook(combat),undefined,'deletion is allowed after settlement');
  const again=await api.finalize(combat);
  assert.equal(again.paid.length,0);
  assert.equal(willTotal,2);
  assert.equal(willCalls,1);
  console.log('campaign-concession.test.cjs OK');
})().catch(error=>{console.error(error);process.exit(1);});
