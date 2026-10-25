const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {baseContext}=require('./harness.cjs');
(async()=>{
 const original={
   physical:{name:'Атлетика',rank:2,description:'Сохранить описание',attack:'special',pc:true},
   extra:{name:'Дар',rank:4,extra_id:'item-1'}
 };
 const actor={name:'Персонаж',isOwner:true,system:{skills:original},updates:[],async update(patch){this.updates.push(patch)}};
 const user={id:'gm',isGM:true};
 const context=baseContext({game:{user,settings:{get:()=>''}},context:{ui:{notifications:{info:()=>{},error:()=>{}}}}});
 context.foundry.utils.deepClone=structuredClone;
 context.foundry.utils.randomID=()=>String(Math.random()).slice(2);
 const row=(key,fields)=>({dataset:{traitKey:key},querySelector(selector){const match=selector.match(/name="([^"]+)"/);return match?{value:fields[match[1]]}:null;}});
 context.foundry.applications.api.DialogV2.wait=async config=>config.buttons[1].callback(null,{form:{querySelectorAll:()=>[
   row('physical',{name:'Атлетика',rank:'3'}),
   row('extra',{name:'Дар',rank:'0'})
 ]}});
 vm.createContext(context);
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../scripts/character-editors.js'),'utf8'),context);
 await context.FateToolkitEditors.editActor(actor,'skills');
 assert.equal(actor.updates.length,1);
 assert.equal(actor.updates[0]['system.skills.physical'].rank,3);
 assert.equal(actor.updates[0]['system.skills.physical'].description,'Сохранить описание');
 assert.equal(actor.updates[0]['system.skills.physical'].attack,'special');
 assert.ok(!Object.keys(actor.updates[0]).some(key=>key.includes('extra')),'Extra-owned skill must not be modified');
 // A missing actor trait must become an explicit Foundry deletion, not a destructive replacement.
 context.foundry.applications.api.DialogV2.wait=async config=>config.buttons[1].callback(null,{form:{querySelectorAll:()=>[
   row('extra',{name:'Дар',rank:'0'})
 ]}});
 await context.FateToolkitEditors.editActor(actor,'skills');
 assert.equal(actor.updates[1]['system.skills.-=physical'],null);
 assert.ok(!Object.hasOwn(actor.updates[1],'system.skills.-=extra'));
 const sheet=fs.readFileSync(path.join(__dirname,'../templates/character-sheet.hbs'),'utf8');
 assert.doesNotMatch(sheet,/data-action="actionAttack"/,'action widget must remain standalone');
 const moduleData=JSON.parse(fs.readFileSync(path.join(__dirname,'../module.json'),'utf8'));
 assert.ok(moduleData.esmodules.indexOf('scripts/character-editors.js')<moduleData.esmodules.indexOf('scripts/character-sheet.js'));
 const builder=fs.readFileSync(path.join(__dirname,'../scripts/extra-builder-ui.js'),'utf8');
 assert.ok(builder.includes('data-pick-extra-icon'));
 assert.ok(builder.includes('openForActor'));
 const dock=fs.readFileSync(path.join(__dirname,'../scripts/unified-dock.js'),'utf8');
 assert.ok(dock.includes('data-open-npc')&&!dock.includes('Трекер NPC</button>'));
 assert.ok(dock.includes('data-world-traits')&&dock.includes('openCampaignTimeline'));
 const miles=fs.readFileSync(path.join(__dirname,'../scripts/milestones.js'),'utf8');
 assert.ok(miles.includes('beginPlaySession')&&miles.includes('endPlaySession')&&miles.includes('normaliseWorldDate'));
 console.log('character-editors.test.cjs OK');
})().catch(e=>{console.error(e);process.exitCode=1});
