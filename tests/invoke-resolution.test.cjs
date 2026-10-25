const assert=require('assert');
const fs=require('fs');
const vm=require('vm');
const path=require('path');
const {baseContext}=require('./harness.cjs');
const root=path.join(__dirname,'..');
const context=baseContext();
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root,'scripts/invoke-resolution.js'),'utf8'),context,{filename:'invoke-resolution.js'});

(async()=>{
  const actor={uuid:'Actor.a1'};
  const user={id:'u1',isGM:false};
  const source={id:'src1',name:'High Ground',paidAllowed:true,freeUses:1};
  const message={id:'m1',flavor:'old',rolls:[{total:3}],flags:{'fate-aspect-widget':{resolved:true,actorUuid:'Actor.a1',targetUserId:'u1'}}};
  const calls={consume:0,undo:0,updates:[],audit:[],notify:0,refresh:[]};
  let updateFails=false;
  const service=context.FateToolkitInvokeResolution.create({
    getMessage:id=>id==='m1'?message:null,
    getUser:id=>id==='u1'?user:null,
    actorFromUuid:async uuid=>uuid==='Actor.a1'?actor:null,
    currentRollActorUuid:()=> 'Actor.a1',
    canUserControlActor:(u,a)=>u===user&&a===actor,
    invocationLockedByDamage:()=>false,
    getActorCombatState:()=>({acted:false}),
    locateInvokeSource:async()=>source,
    consumeResource:async()=>{calls.consume++;return async()=>{calls.undo++;};},
    buildRerolledRoll:async()=>({total:1,rerolled:true}),
    serializeAdjustedRoll:(roll,total)=>({...roll,total}),
    currentRollTotal:m=>m.rolls[0].total,
    appendAuditFlavor:(flavor,line)=>`${flavor}|${line}`,
    invokeAuditLine:(_s,mode)=>mode,
    updateMessage:async(_m,patch)=>{if(updateFails)throw new Error('write failed');calls.updates.push(patch);},
    refreshMathState:async(_m,state)=>calls.refresh.push(state),
    appendAudit:async(_m,row)=>calls.audit.push(row),
    notify:()=>{calls.notify++;},
    moduleId:'fate-aspect-widget'
  });
  let checked=await service.prepare({messageId:'m1',sourceId:'src1',userId:'u1',mode:'plus2',useFree:false});
  assert.equal(checked.ok,true);
  let result=await service.commit(checked);
  assert.equal(result.ok,true);
  assert.equal(calls.updates[0].rolls[0].total,5);
  assert.equal(calls.audit[0].type,'invoke');
  assert.equal(calls.refresh[0].roll.total,5,'math refresh must receive the exact post-invoke roll, not stale message flags');
  assert.equal(calls.notify,1);

  checked=await service.prepare({messageId:'m1',sourceId:'src1',userId:'u1',mode:'reroll',useFree:true});
  result=await service.commit(checked);
  assert.equal(result.ok,true);
  assert.equal(calls.updates[1].rolls[0].rerolled,true);
  assert.equal(calls.refresh[1].roll.rerolled,true,'reroll math refresh must receive the rerolled roll directly');

  const badMode=await service.prepare({messageId:'m1',sourceId:'src1',userId:'u1',mode:'hack'});
  assert.equal(badMode.ok,false);

  updateFails=true;
  checked=await service.prepare({messageId:'m1',sourceId:'src1',userId:'u1',mode:'plus2',useFree:false});
  result=await service.commit(checked);
  assert.equal(result.ok,false);
  assert.equal(calls.undo,1,'resource mutation must rollback if message update fails');

  console.log('invoke-resolution.test.cjs OK');
})().catch(err=>{console.error(err);process.exit(1);});
