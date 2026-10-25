const assert=require('assert');
const fs=require('fs');
const vm=require('vm');
const path=require('path');
const root=path.join(__dirname,'..');
const context={console,globalThis:null};context.globalThis=context;vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root,'scripts/boost-claim-plan.js'),'utf8'),context,{filename:'boost-claim-plan.js'});
const message={id:'m1',flags:{'fate-aspect-widget':{resolved:true,targetUserId:'u1',actorUuid:'Actor.hero',boostOpportunity:{recipient:'roller',tradeShift:false},boostClaimed:false}}};
const hero={uuid:'Actor.hero'}; const user={id:'u1',isGM:false};
const state={message,user,hero,controls:true,acted:false,damage:false,privateUuid:'Actor.foe'};
function make(){return context.FateToolkitBoostClaimPlan.create({
  getMessage:id=>id==='m1'?state.message:null,
  getUser:id=>id===state.user.id?state.user:null,
  actorFromUuid:async uuid=>uuid==='Actor.hero'?state.hero:null,
  canUserControlActor:()=>state.controls,
  getActorCombatState:()=>({acted:state.acted}),
  damageResolutionStarted:()=>state.damage,
  privateOppositionActorUuid:()=>state.privateUuid,
  moduleId:'fate-aspect-widget'
});}
(async()=>{
  let out=await make().prepare({messageId:'missing',userId:'u1'});assert.equal(out.ok,false);assert.equal(out.silent,true);
  out=await make().prepare({messageId:'m1',userId:'u1'});assert.equal(out.ok,true);assert.equal(out.actorUuid,'Actor.hero');
  state.message.flags['fate-aspect-widget'].boostOpportunity={recipient:'opponent',tradeShift:false};out=await make().prepare({messageId:'m1',userId:'u1'});assert.equal(out.ok,false);assert.equal(out.silent,true,'non-GM player cannot create opponent recipient boost');
  state.user={id:'gm1',isGM:true};out=await make().prepare({messageId:'m1',userId:'gm1'});assert.equal(out.ok,true);assert.equal(out.actorUuid,'Actor.foe');
  state.acted=true;out=await make().prepare({messageId:'m1',userId:'gm1'});assert.equal(out.ok,false);assert.match(out.message,/Ход уже завершён/);state.acted=false;
  state.message.flags['fate-aspect-widget'].boostOpportunity={recipient:'opponent',tradeShift:true};state.damage=true;out=await make().prepare({messageId:'m1',userId:'gm1'});assert.equal(out.ok,false);assert.match(out.message,/Урон уже начали/);state.damage=false;
  state.privateUuid=null;out=await make().prepare({messageId:'m1',userId:'gm1'});assert.equal(out.ok,false);assert.match(out.message,/Не удалось определить/);
  console.log('boost-claim-plan.test.cjs OK');
})().catch(e=>{console.error(e);process.exit(1);});
