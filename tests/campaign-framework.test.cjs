const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {baseContext}=require('./harness.cjs');
(async()=>{
  const gm={id:'gm',isGM:true};
  const pc={id:'pc',type:'fate-core-official',uuid:'Actor.pc',
    system:{skills:{old:{name:'Lore',rank:3,caa:'Some original action',hidden:false},second:{name:'Shoot',rank:2}, custom:{name:'Психометрия',rank:1,extra_id:'e1'}},
      aspects:{concept:{name:'High Concept',value:'Ищейка'},legacy:{name:'Unknown Phase',value:'Старое значение'}},
      stunts:{research:{name:'Подготовка',linked_skill:'Lore'}}, tracks:{track:{linked_skills:[{linked_skill:'Shoot',rank:2}]} }}, flags:{},
    getFlag(id,key){return this.flags[id]?.[key]},
    async update(patch){this.lastPatch=patch;for(const [k,v] of Object.entries(patch)){
      if(k==='system.skills')this.system.skills=structuredClone(v);
      if(k==='system.aspects')this.system.aspects=structuredClone(v);
      if(k==='system.stunts')this.system.stunts=structuredClone(v);
      if(k==='system.tracks')this.system.tracks=structuredClone(v);
      if(k==='flags.fate-aspect-widget.campaignFrameworkBackup'){this.flags['fate-aspect-widget']??={};this.flags['fate-aspect-widget'].campaignFrameworkBackup=structuredClone(v)}
    }}
  };
  const npc={...pc,uuid:'Actor.npc',system:{skills:{f:{name:'Fight',rank:5}},aspects:{one:{name:'Враг',value:'X'},two:{name:'Заказ',value:'Y'}}},flags:{}};
  const world={system:{skills:{known:{name:'Crafts',rank:0}}},flags:{},getFlag(k,f){return this.flags[k]?.[f]},async update(patch){this.system.skills=structuredClone(patch['system.skills']);}};
  const hooks={};const users={get:id=>id==='gm'?gm:id==='player'?{id:'player',isGM:false}:null};
  const ctx=baseContext({game:{users,settings:{get:(_id,key)=>key==='wid'?'Actor.world':null},modules:{get:()=>null}},context:{Hooks:{once:(name,fn)=>hooks[name]=fn},fromUuid:async id=>({'Actor.pc':pc,'Actor.npc':npc,'Actor.world':world}[id]),FateToolkitWill:{enabled:()=>true,details:a=>({configured:true,isNpc:a.uuid===npc.uuid})},FateToolkitRPC:{register:()=>{},executeAsGM:async()=>null}}});
  ctx.foundry.utils.deepClone=structuredClone;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../scripts/campaign-framework.js'),'utf8'),ctx);
  const f=ctx.FateToolkitFramework;
  assert.equal(f.names.length,19);assert.equal(f.slots.length,5);
  assert.equal(f.skillName('Will'),'Самообладание');assert.equal(f.skillName('Знания'),'Академическое знание');
  assert.equal(f.skillName('Academics'),'Академическое знание');
  let plan=f.plan(pc);assert.equal(plan.valid,true);assert.equal(plan.skills.skills.old.rank,3);assert.equal(plan.skills.skills.old.name,'Академическое знание');
  assert.equal(plan.skills.skills.custom.extra_id,'e1');assert.equal(plan.skills.added.length,17);assert.equal(plan.aspects.added.length,4);
  assert.equal(plan.references.count,2);
  assert.equal(plan.references.stunts.research.linked_skill,'Академическое знание');
  assert.equal(plan.references.tracks.track.linked_skills[0].linked_skill,'Стрельба');
  assert.equal(plan.aspects.aspects.concept.value,'Ищейка');assert.equal(plan.aspects.aspects.legacy.value,'Старое значение');
  let result=await f.handler({operation:'apply',actorUuid:pc.uuid},{senderId:'gm'});
  assert.equal(result.ok,true);assert.equal(Object.values(pc.system.skills).filter(s=>f.names.includes(s.name)).length,19);
  assert.equal(Object.values(pc.system.aspects).filter(a=>f.slots.includes(a.name)).length,5);
  assert.equal(pc.flags['fate-aspect-widget'].campaignFrameworkBackup.skills.old.name,'Lore');
  assert.equal(pc.flags['fate-aspect-widget'].campaignFrameworkBackup.stunts.research.linked_skill,'Lore');
  assert.equal(pc.system.stunts.research.linked_skill,'Академическое знание');
  result=await f.handler({operation:'apply',actorUuid:pc.uuid},{senderId:'gm'});assert.equal(result.unchanged,true);
  await assert.rejects(()=>f.handler({operation:'apply',actorUuid:pc.uuid},{senderId:'player'}),/только ведущий/);
  let p=f.plan(npc,{asNpc:true});assert.equal(p.aspects,null);
  await f.handler({operation:'apply',actorUuid:npc.uuid},{senderId:'gm'});
  assert.equal(Object.keys(npc.system.aspects).length,2,'NPC are not forced to five aspects');
  assert.equal(npc.system.skills.f.rank,5,'NPC may exceed +4');
  result=await f.handler({operation:'world'},{senderId:'gm'});assert.equal(result.ok,true);
  assert.equal(Object.values(world.system.skills).filter(s=>f.names.includes(s.name)).length,19);
  const duplicate={system:{skills:{a:{name:'Lore'},b:{name:'Академическое знание'}}}};
  assert.equal(f.planSkills(duplicate.system.skills).valid,false,'duplicate aliases must not be silently merged');
  console.log('campaign-framework.test.cjs OK');
})().catch(e=>{console.error(e);process.exit(1)});
