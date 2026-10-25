const assert=require('node:assert/strict');
const {loadScript}=require('./harness.cjs');
const ID='fate-aspect-widget';
const clone=x=>JSON.parse(JSON.stringify(x));
const sceneFlags={ 'fate-core-official':{situation_aspects:[]} };
const scene={getFlag:(s,k)=>sceneFlags[s]?.[k]??null,async setFlag(s,k,v){(sceneFlags[s]??={})[k]=clone(v);}};
const def={name:'Переключаемая печать',mode:'hybrid',willCost:1,cooldown:'scene',conditions:[{kind:'willAtLeast',amount:3}],tags:['магия'],effects:[
  {kind:'branch',conditions:[{kind:'hasStatus',name:'Возможность'}],then:[{kind:'status',name:'Защита',duration:'uses',uses:2,modifier:2,action:'defend'}],otherwise:[{kind:'counter',name:'Попытки',amount:1}]},
  {kind:'tag',tags:['магия'],duration:'scene'},
  {kind:'rollModifier',amount:2,action:'defend',tags:['магия']}
]};
const item={id:'ix1',name:def.name,type:'Extra',system:{active:true},flags:{[ID]:{extraDefinition:def}},
 getFlag(s,k){return this.flags[s]?.[k]??null;},async setFlag(s,k,v){(this.flags[s]??={})[k]=clone(v);}};
const items=[item];items.get=id=>items.find(i=>i.id===id);
const actor={id:'a1',uuid:'Actor.a1',type:'fate-core-official',name:'Герой',items,flags:{[ID]:{extraStatuses:[{name:'Возможность',duration:'permanent'}]}},system:{details:{fatePoints:{current:6}},skills:{athletics:{name:'Атлетика',rank:3}}},
 getFlag(s,k){return this.flags[s]?.[k]??null;},testUserPermission(u,l){return u.id==='p'&&l==='OWNER';},
 async update(data){for(const [path,v] of Object.entries(data)){const parts=path.split('.');let cur=this;for(const p of parts.slice(0,-1))cur=cur[p]??={};cur[parts.at(-1)]=clone(v);}}};
const {context}=loadScript('scripts/extra-engine.js',['FateToolkitExtras'],{game:{user:{id:'gm',isGM:true},users:{get:id=>({id,isGM:id==='gm'})},settings:{get:(scope,key)=>key==='campaignSceneSerial'?8:undefined},scenes:{viewed:scene},modules:{get:()=>({api:{}})}},context:{fromUuid:async uuid=>uuid===actor.uuid?actor:null,Hooks:{once(){},on(){}},FateToolkitRPC:{register(){},executeAsGM(){}},FateToolkitWill:{enabled:()=>true,details:()=>({configured:true,current:actor.system.details.fatePoints.current,max:9})},ChatMessage:{getSpeaker:()=>({}),create:async()=>{}},foundry:{utils:{randomID:()=>`id_${Math.floor(Math.random()*10000)}`}}}});
const E=context.FateToolkitExtras;
assert.equal(E.normalizeDefinition(def).schemaVersion,2);
assert.equal(E.normalizeEffect({kind:'removeSceneAspect',name:'Туман'}).kind,'removeSceneAspect');
assert.equal(E.normalizeEffect({kind:'removeStatus',name:'Туман'}).kind,'removeStatus');
assert.throws(()=>E.normalizeDefinition({...def,conditions:[{kind:'code'}]}),/Неизвестное условие/);
assert.throws(()=>E.normalizeEffect({kind:'branch',conditions:[],then:[{kind:'branch',then:[{kind:'branch',then:[{kind:'branch',then:[{kind:'rollModifier',amount:1}]}]}]}]}),/вложенность/);
assert.equal(E.importDefinitions(E.exportDefinitions(def))[0].effects[0].kind,'branch');
assert.equal(E.testConditions([{kind:'skillAtLeast',name:'Атлетика',amount:3}],{actor}),true);
assert.equal(E.rollBonus(actor,'defend','Атлетика'),0,'tag-gated bonus unavailable before magic tag');
(async()=>{
 const r=await E.useHandler({actorUuid:actor.uuid,itemId:item.id,eventId:'evt1'},{senderId:'p'});
 assert.equal(r.ok,true);
 assert.equal(actor.system.details.fatePoints.current,5);
 assert.equal(E.rollBonus(actor,'defend','Атлетика'),4,'passive +2 and active limited +2 after tag');
 assert.equal(E.rollBonus(actor,'attack','Атлетика'),0);
 assert.equal(E.statuses(actor).filter(x=>x.name==='Защита').length,1);
 await assert.rejects(()=>E.useHandler({actorUuid:actor.uuid,itemId:item.id,eventId:'evt2'},{senderId:'p'}),/сцене/);
 await E.consumeRoll(actor,'defend','Атлетика','roll1');
 assert.equal(E.rollBonus(actor,'defend','Атлетика'),4);
 await E.consumeRoll(actor,'defend','Атлетика','roll1');
 assert.equal(E.rollBonus(actor,'defend','Атлетика'),4,'duplicate roll cannot consume another charge');
 await E.consumeRoll(actor,'defend','Атлетика','roll2');
 assert.equal(E.rollBonus(actor,'defend','Атлетика'),2,'limited bonus expires, static passive remains');
 const before=actor.system.details.fatePoints.current;
 await E.useHandler({actorUuid:actor.uuid,itemId:item.id,eventId:'evt1'},{senderId:'p'});
 assert.equal(actor.system.details.fatePoints.current,before,'duplicate activation must not charge');
 const consequenceItem={id:'ix2',type:'Extra',name:'Ожог',system:{active:true},flags:{[ID]:{extraDefinition:{name:'Ожог',mode:'active',effects:[{kind:'consequence',name:'Обожжённые руки',track:'mild'}]}}},getFlag(scope,key){return this.flags[scope]?.[key]??null;},async setFlag(scope,key,value){(this.flags[scope]??={})[key]=clone(value);}};
 actor.items.push(consequenceItem);
 actor.system.tracks={mild:{name:'Лёгкое последствие',enabled:true,aspect:{when_marked:true,name:''},box_values:[]}};
 const applied=await E.useHandler({actorUuid:actor.uuid,itemId:'ix2',eventId:'con1'},{senderId:'gm'});
 assert.equal(applied.ok,true);
 assert.equal(actor.system.tracks.mild.aspect.name,'Обожжённые руки');
 await assert.rejects(()=>E.useHandler({actorUuid:actor.uuid,itemId:'ix2',eventId:'con2'},{senderId:'gm'}),/занято/);
 const afterRoll={id:'ix3',type:'Extra',name:'Дыхание',system:{active:true},flags:{[ID]:{extraDefinition:{name:'Дыхание',mode:'hybrid',willCost:2,effects:[{kind:'will',amount:1,trigger:'afterRoll'}]}}},getFlag(scope,key){return this.flags[scope]?.[key]??null;},async setFlag(scope,key,value){(this.flags[scope]??={})[key]=clone(value);}};
 actor.items.push(afterRoll);
 const prior=actor.system.details.fatePoints.current;
 await E.useHandler({actorUuid:actor.uuid,itemId:'ix3',eventId:'after1',trigger:'afterRoll'},{senderId:'gm'});
 assert.equal(actor.system.details.fatePoints.current,prior+1,'post-roll trigger must not charge activation cost');
 await E.useHandler({actorUuid:actor.uuid,itemId:'ix3',eventId:'after1',trigger:'afterRoll'},{senderId:'gm'});
 assert.equal(actor.system.details.fatePoints.current,prior+1,'post-roll duplicate must not grant Will twice');
 console.log('extra-advanced.test.cjs OK');
})().catch(error=>{console.error(error);process.exit(1);});
