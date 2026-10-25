const assert=require('assert');
const fs=require('fs');
const vm=require('vm');
const path=require('path');
const root=path.join(__dirname,'..');
const context={console,globalThis:null};context.globalThis=context;vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root,'scripts/request-result-validation.js'),'utf8'),context,{filename:'request-result-validation.js'});

const request={id:'r1',actionType:'attack',targets:[{userId:'u1'}],oppositionByUser:{u1:{total:2}}};
const user={id:'u1'};
const actor={id:'a1',uuid:'Actor.a1',name:'Hero',skills:[{name:'Fight',rank:3}]};
const roll={total:5};
const message={id:'m1',flags:{'fate-aspect-widget':{requestId:'r1',targetUserId:'u1',actorUuid:'Actor.a1',skillName:'Fight',stuntKeys:[]}},rolls:[roll],flavor:''};
const state={request,user,message,actor,belongs:true,controls:true,extraBonus:0};
function make(){return context.FateToolkitRequestResultValidation.create({
  getRequest:id=>id==='r1'?state.request:null,
  getUser:id=>id==='u1'?state.user:null,
  requestTargetsUser:(req,id)=>req.targets.some(r=>r.userId===id),
  waitForMessage:async id=>id==='m1'?state.message:null,
  resultBelongsToUser:()=>state.belongs,
  actorFromUuid:async uuid=>uuid==='Actor.a1'?state.actor:null,
  canUserControlActor:()=>state.controls,
  findSkill:(a,n)=>a?.skills?.find(s=>s.name===n)||null,
  validateStuntSelection:()=>[],
  stuntBonusTotal:()=>0,
  numberValue:v=>Number(v)||0,
  snapshotRollMath:(r,d)=>({...d,total:r.total,extraBonus:state.extraBonus,diceSignature:'sig',modifierSources:[]}),
  sameMathSnapshot:()=>false,
  appendMathHistory:(h,m)=>[...h,m],
  compactHistory:h=>h,
  moduleId:'fate-aspect-widget'
});}

(async()=>{
  let out=await make().validate({requestId:'missing',userId:'u1',messageId:'m1'}); assert.equal(out.ok,false); assert.match(out.message,/не найден/);
  state.request={...request,targets:[{userId:'u2'}]}; out=await make().validate({requestId:'r1',userId:'u1',messageId:'m1'}); assert.equal(out.ok,false); assert.match(out.message,/не назначен/); state.request=request;
  state.belongs=false; out=await make().validate({requestId:'r1',userId:'u1',messageId:'m1'}); assert.equal(out.ok,false); assert.match(out.message,/автор ChatMessage/); state.belongs=true;
  state.controls=false; out=await make().validate({requestId:'r1',userId:'u1',messageId:'m1'}); assert.equal(out.ok,false); assert.match(out.message,/прав владельца/); state.controls=true;
  state.actor={...actor,skills:[]}; out=await make().validate({requestId:'r1',userId:'u1',messageId:'m1'}); assert.equal(out.ok,false); assert.match(out.message,/нет навыка/); state.actor=actor;
  state.extraBonus=2; out=await make().validate({requestId:'r1',userId:'u1',messageId:'m1'}); assert.equal(out.ok,false); assert.match(out.message,/формула первого броска/); state.extraBonus=0;
  context.FateToolkitExtras={rollBonus:(actor,action,skill)=>action==='attack'&&skill==='Fight'?2:0};
  state.extraBonus=2;
  out=await make().validate({requestId:'r1',userId:'u1',messageId:'m1'});
  assert.equal(out.ok,true,'GM must accept the authentic passive Extra modifier');
  context.FateToolkitExtras={rollBonus:()=>1};
  out=await make().validate({requestId:'r1',userId:'u1',messageId:'m1'});
  assert.equal(out.ok,false,'GM must reject forged/unmatched extra modifiers');
  context.FateToolkitExtras=null;
  state.extraBonus=0;
  out=await make().validate({requestId:'r1',userId:'u1',messageId:'m1'}); assert.equal(out.ok,true); assert.equal(out.request.id,'r1'); assert.equal(out.actor.uuid,'Actor.a1'); assert.equal(out.skill.name,'Fight'); assert.equal(out.math.total,5); assert.equal(out.history.length,1);
  console.log('request-result-validation.test.cjs OK');
})().catch(e=>{console.error(e);process.exit(1);});
