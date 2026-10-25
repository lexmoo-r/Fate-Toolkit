const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const {baseContext}=require('./harness.cjs');
(async()=>{
 const user={id:'p1'};
 const actor={uuid:'Actor.a1',name:'Игрок',system:{tracks:{
   mild:{name:'Лёгкое',enabled:true,harm_can_absorb:2,box_values:[false],aspect:{when_marked:true,name:''}},
   severe:{name:'Тяжёлое',enabled:true,harm_can_absorb:4,box_values:[false],aspect:{when_marked:true,name:''}}
 }},async update(patch){
   for(const [p,val] of Object.entries(patch)) {
     const names=p.split('.');let root=this;for(let i=0;i<names.length-1;i++)root=root[names[i]];
     root[names.at(-1)]=val;
   }
 }};
 const message={id:'message1',flags:{'fate-aspect-widget':{}}};
 let current=5,counter=0,failUpdate=false;
 const changed=[];
 const ctx=baseContext({context:{FateToolkitWill:{enabled:()=>true}}});vm.createContext(ctx);
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../scripts/damage-resolution.js'),'utf8'),ctx);
 const service=ctx.FateToolkitDamageResolution.create({
   getMessage:id=>id==='message1'?message:null,getUser:id=>id==='p1'?user:null,
   actorFromUuid:async()=>actor,canUserControlActor:()=>true,
   damageSpec:()=>({actorUuid:actor.uuid,actorName:actor.name,total:8}),
   normalizedDamageState:()=>{const selections=message.flags['fate-aspect-widget'].damageResolution?.selections||[];
     const absorbed=selections.reduce((v,s)=>v+s.capacity,0);
     return {actorUuid:actor.uuid,total:8,remaining:8-absorbed,status:absorbed>=8?'resolved':'pending',selections};},
   trackHasAspect:t=>Boolean(t.aspect?.when_marked),trackMarked:t=>Boolean(t.box_values.some(Boolean)),
   stressCapacity:()=>2,arraysEqual:(a,b)=>JSON.stringify(a)===JSON.stringify(b),randomId:()=>`sel${++counter}`,
   findCombatantForActor:async()=>({combat:null,combatant:null}),getCombat:()=>null,getCurrentCombat:()=>null,
   updateDamageState:async(_m,s)=>{if(failUpdate)throw new Error('chat update failed');message.flags['fate-aspect-widget'].damageResolution=s;},
   appendAudit:async()=>{},recordConflictEvent:async()=>{},notify:()=>{},
   willDetails:()=>({configured:true,current,rawCurrent:current,max:9}),
   willChange:async(_actor,delta,eventId,userId,expected)=>{
     assert.equal(expected,current,'optimistic concurrency balance');
     assert.equal(userId,'p1');current+=delta;changed.push([delta,eventId]);
     return {ok:true,after:current};
   }
 });
 let selection=await service.prepareApply({messageId:'message1',userId:'p1',kind:'will',amount:3});
 assert.equal(selection.ok,true);assert.equal(selection.selection.capacity,3);assert.equal(selection.nextState.remaining,5);
 await service.commitApply(selection);assert.equal(current,2);assert.equal(message.flags['fate-aspect-widget'].damageResolution.remaining,5);
 selection=await service.prepareApply({messageId:'message1',userId:'p1',kind:'consequence',trackKey:'severe',name:'Перелом'});
 assert.equal(selection.ok,true);await service.commitApply(selection);assert.equal(selection.nextState.remaining,1);
 selection=await service.prepareApply({messageId:'message1',userId:'p1',kind:'will',amount:1});
 await service.commitApply(selection);assert.equal(current,1);assert.equal(message.flags['fate-aspect-widget'].damageResolution.status,'resolved');
 assert.equal(changed.filter(([amount])=>amount<0).length,2);
 // Failed publication must not leave a paid cost without damage state.
 message.flags['fate-aspect-widget'].damageResolution=null; current=3;failUpdate=true;
 selection=await service.prepareApply({messageId:'message1',userId:'p1',kind:'will',amount:2});
 await assert.rejects(()=>service.commitApply(selection),/chat update failed/);
 assert.equal(current,3,'resource returned if chat update fails');
 const denied=await service.prepareApply({messageId:'message1',userId:'p1',kind:'stress',trackKey:'mild',boxIndex:0});
 assert.equal(denied.ok,false);
 console.log('campaign-will-harm.test.cjs OK');
})().catch(e=>{console.error(e);process.exit(1)});
