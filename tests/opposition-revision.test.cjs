const assert=require('assert');
const fs=require('fs');
const vm=require('vm');
const path=require('path');
const root=path.join(__dirname,'..');
const context={console,globalThis:null};context.globalThis=context;vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root,'scripts/opposition-revision.js'),'utf8'),context,{filename:'opposition-revision.js'});

const originalOpp={mode:'opponent',kind:'roll',messageId:'m1',actorUuid:'Actor.foe',total:4,history:[]};
const request={id:'r1',actionType:'attack',targets:[{userId:'u1'}],oppositionByUser:{u1:originalOpp}};
const user={id:'u2'}; const actor={id:'a2',uuid:'Actor.foe',name:'Foe',skills:[{name:'Fight',rank:3}]};
const message={id:'m1',rolls:[{total:6}],flavor:'',flags:{'fate-aspect-widget':{actionOppositionFor:'r1',oppositionInitiatorUserId:'u1',oppositionUserId:'u2',oppositionActorUuid:'Actor.foe',oppositionSkillName:'Fight',stuntKeys:[],oppositionHistory:[]}}};
const state={request,user,actor,message,authorId:'u2',controls:true};
function make(){return context.FateToolkitOppositionRevision.create({
  getRequest:id=>id==='r1'?state.request:null,
  getUser:id=>id==='u2'?state.user:null,
  getMessage:id=>id==='m1'?state.message:null,
  waitForMessage:async()=>state.message,
  messageAuthorId:()=>state.authorId,
  actorFromUuid:async uuid=>uuid==='Actor.foe'?state.actor:null,
  canUserControlActor:()=>state.controls,
  findSkill:(a,n)=>a?.skills?.find(s=>s.name===n)||null,
  oppositionActionType:()=> 'defend',
  validateStuntSelection:()=>[],
  stuntBonusTotal:()=>0,
  snapshotRollMath:(roll,data)=>({...data,total:roll.total,diceSignature:'new'}),
  appendMathHistory:(h,m)=>[...h,m],
  numberValue:(v,f=0)=>Number.isFinite(Number(v))?Number(v):f,
  moduleId:'fate-aspect-widget'
});}
(async()=>{
  let out=await make().rebuild({requestId:'missing',messageId:'m1'}); assert.equal(out.ok,false); assert.equal(out.pending,true);
  state.authorId='evil'; out=await make().rebuild({requestId:'r1',messageId:'m1',initiatorUserId:'u1'}); assert.equal(out.ok,false); state.authorId='u2';
  state.controls=false; out=await make().rebuild({requestId:'r1',messageId:'m1',initiatorUserId:'u1'}); assert.equal(out.ok,false); state.controls=true;
  out=await make().rebuild({requestId:'r1',messageId:'m1',initiatorUserId:'u1',oppositionUserId:'u2'}); assert.equal(out.ok,true); assert.equal(out.userId,'u1'); assert.equal(out.opposition.total,6); assert.equal(out.opposition.actorName,'Foe'); assert.equal(out.opposition.skillName,'Fight'); assert.notEqual(out.opposition,originalOpp); assert.equal(originalOpp.total,4,'stored opposition must remain untouched until controller commits rebuild'); assert.equal(out.opposition.history.length,1);
  console.log('opposition-revision.test.cjs OK');
})().catch(e=>{console.error(e);process.exit(1);});
