const assert=require('assert');
const fs=require('fs');
const vm=require('vm');
const path=require('path');
const root=path.join(__dirname,'..');
const context={console,globalThis:null};context.globalThis=context;vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root,'scripts/result-action-plan.js'),'utf8'),context,{filename:'result-action-plan.js'});
const actor={uuid:'Actor.a1'}; const user={id:'u1',isGM:false};
const message={id:'m1',flags:{'fate-aspect-widget':{actorUuid:'Actor.a1',targetUserId:'u1',kind:'ok'}}};
const state={message,user,actor,controls:true};
function make(){return context.FateToolkitResultActionPlan.create({
  getMessage:id=>id==='m1'?state.message:null,
  getUser:id=>id===state.user.id?state.user:null,
  actorFromUuid:async uuid=>uuid==='Actor.a1'?state.actor:null,
  userMayControlActor:()=>state.controls,
  contextualResultOpportunity:flags=>flags.kind==='ok'?{kind:'add-invokes',name:'Fog',amount:1}:null,
  createdAspectOpportunity:flags=>flags.kind==='ok'?{freeInvokes:2}:null,
  moduleId:'fate-aspect-widget'
});}
(async()=>{
  let out=await make().contextual({messageId:'missing',userId:'u1'});assert.equal(out.ok,false);assert.equal(out.silent,true);
  out=await make().contextual({messageId:'m1',userId:'u1'});assert.equal(out.ok,true);assert.equal(out.opportunity.name,'Fog');
  state.controls=false;out=await make().contextual({messageId:'m1',userId:'u1'});assert.equal(out.ok,false);state.controls=true;
  state.message.flags['fate-aspect-widget'].targetUserId='u2';out=await make().contextual({messageId:'m1',userId:'u1'});assert.equal(out.ok,false);state.message.flags['fate-aspect-widget'].targetUserId='u1';
  out=await make().createdAspect({messageId:'m1',userId:'u1',name:'   '});assert.equal(out.ok,false);
  out=await make().createdAspect({messageId:'m1',userId:'u1',name:'  High Ground  '});assert.equal(out.ok,true);assert.equal(out.name,'High Ground');assert.equal(out.opportunity.freeInvokes,2);
  state.user={id:'gm1',isGM:true};out=await make().contextual({messageId:'m1',userId:'gm1'});assert.equal(out.ok,true,'GM may apply valid result action regardless of target user');
  console.log('result-action-plan.test.cjs OK');
})().catch(e=>{console.error(e);process.exit(1);});
