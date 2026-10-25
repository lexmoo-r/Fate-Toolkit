const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const { baseContext }=require('./harness.cjs');
const root=path.join(__dirname,'..');
const actor={uuid:'Actor.a1',name:'Герой',system:{tracks:{
  stress:{name:'Stress',enabled:true,harm_can_absorb:2,box_values:[false,false],aspect:{}},
  mild:{name:'Mild',enabled:true,harm_can_absorb:2,box_values:[false],aspect:{when_marked:true,name:''}},
  moderate:{name:'Moderate',enabled:true,harm_can_absorb:4,box_values:[false],aspect:{when_marked:true,name:''}}
}}};
const user={id:'player',isGM:false};
const ctx=baseContext({game:{user},context:{FateToolkitWill:{enabled:()=>true}}});
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root,'scripts/damage-resolution.js'),'utf8'),ctx);
const records=[];
const service=ctx.FateToolkitDamageResolution.create({
 getMessage:()=>({id:'m1'}),getUser:()=>user,actorFromUuid:async()=>actor,
 canUserControlActor:()=>true,damageSpec:()=>({actorUuid:'Actor.a1',total:6}),
 normalizedDamageState:(_msg,spec)=>({actorUuid:spec.actorUuid,total:spec.total,remaining:6,status:'pending',selections:[]}),
 trackHasAspect:track=>Boolean(track.aspect?.when_marked),trackMarked:()=>false,
 stressCapacity:()=>2,arraysEqual:(a,b)=>JSON.stringify(a)===JSON.stringify(b),randomId:()=> 'sel',
 findCombatantForActor:async()=>({combat:null,combatant:null}),getCombat:()=>null,getCurrentCombat:()=>null,
 updateDamageState:async()=>{},appendAudit:async()=>{},recordConflictEvent:async()=>{},notify:()=>{}
});
(async()=>{
 const blocked=await service.prepareApply({messageId:'m1',userId:'player',kind:'stress',trackKey:'stress',boxIndex:0});
 assert.equal(blocked.ok,false);assert.match(blocked.message,/стресс отменён/);
 const allowed=await service.prepareApply({messageId:'m1',userId:'player',kind:'consequence',trackKey:'moderate',name:'Перелом'});
 assert.equal(allowed.ok,true);assert.equal(allowed.selection.capacity,4);
 // Existing legacy code permits more than one consequence in a single hit;
 // the new campaign mode leaves this path intact.
 console.log('campaign-harm.test.cjs OK');
})().catch(e=>{console.error(e);process.exit(1)});
