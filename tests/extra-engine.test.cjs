const assert = require('assert');
const { loadScript }=require('./harness.cjs');
const ID='fate-aspect-widget';
const clone=x=>JSON.parse(JSON.stringify(x));
const sceneFlags={ 'fate-core-official':{situation_aspects:[{name:'Прикрытие',free_invokes:1}]} };
const scene={
  getFlag:(scope,key)=>sceneFlags[scope]?.[key]??null,
  async setFlag(scope,key,value){(sceneFlags[scope]??={})[key]=clone(value);}
};
const flagStore={};
const config={name:'Защитная печать',mode:'active',willCost:2,effects:[
  {kind:'sceneAspect',name:'Печать на стене',freeInvokes:2},
  {kind:'status',name:'Охраняется печатью',duration:'scene'},
  {kind:'counter',name:'Использовано',amount:1}
]};
const item={id:'extra1',name:config.name,type:'Extra',system:{active:true},flags:{[ID]:{extraDefinition:config}},
  getFlag(scope,key){return this.flags[scope]?.[key]??null;},
  async setFlag(scope,key,val){(this.flags[scope]??={})[key]=clone(val);}
};
const items=[item];items.get=id=>items.find(x=>x.id===id);
const actor={id:'a1',uuid:'Actor.a1',type:'fate-core-official',name:'Герой',items,system:{details:{fatePoints:{current:7}}},flags:{},
  getFlag(scope,key){return this.flags[scope]?.[key]??null;},
  testUserPermission(user,level){return user.id==='u1'&&level==='OWNER';},
  async update(payload){for(const [path,value] of Object.entries(payload)){
    const parts=path.split('.');let cur=this;
    for(const part of parts.slice(0,-1))cur=cur[part]??=( {} );
    cur[parts.at(-1)]=clone(value);
  }}
};
const hooks={};
const {exports:{E},context}=loadScript('scripts/extra-engine.js',['FateToolkitExtras'],{
  game:{
    user:{id:'gm',isGM:true},
    users:{get:id=>({id,isGM:id==='gm'})},
    scenes:{viewed:scene},
    settings:{get:(id,key)=>key==='campaignSceneSerial'?3:undefined},
    modules:{get:()=>({api:{}})}
  },
  context:{
    fromUuid:async uuid=>uuid===actor.uuid?actor:null,
    Hooks:{once(name,fn){hooks[name]=fn;}},
    FateToolkitRPC:{register(){},executeAsGM(){}},
    FateToolkitWill:{enabled:()=>true,details:a=>({configured:true,current:a.system.details.fatePoints.current,max:9})},
    ChatMessage:{getSpeaker:()=>({}),create:async()=>({})}
  }
});
const api=context.FateToolkitExtras;
assert.ok(api);
assert.equal(api.normalizeDefinition({name:'Тест',mode:'passive',effects:[{kind:'rollModifier',amount:2,action:'defend'}]}).effects[0].amount,2);
assert.throws(()=>api.normalizeDefinition({name:'',mode:'active'}),/название/);
assert.throws(()=>api.normalizeDefinition({name:'Ошибка',mode:'passive',effects:[{kind:'will',amount:1}]}),/пассивного/);
assert.throws(()=>api.normalizeDefinition({name:'Ошибка',effects:[{kind:'unknown'}]}),/Неизвестный эффект/);
assert.throws(()=>api.importDefinitions('{bad'),/JSON/);
const exported=api.exportDefinitions([config,{name:'Боевые рефлексы',mode:'passive',effects:[{kind:'rollModifier',action:'defend',amount:1}]}]);
assert.equal(api.importDefinitions(exported).length,2);
assert.equal(api.importDefinitions(exported)[1].mode,'passive');
assert.ok(!exported.includes('extraRuntime'),'runtime state must not leak into definitions');

(async()=>{
  const first=await api.useHandler({actorUuid:actor.uuid,itemId:item.id,eventId:'e1'},{senderId:'u1'});
  assert.equal(first.ok,true);
  assert.equal(actor.system.details.fatePoints.current,5,'cost is deducted only once');
  assert.equal(sceneFlags['fate-core-official'].situation_aspects.length,2);
  assert.equal(sceneFlags['fate-core-official'].situation_aspects[1].free_invokes,2);
  assert.equal(api.statuses(actor)[0].name,'Охраняется печатью');
  assert.equal(api.runtime(item).uses,1);
  assert.equal(api.runtime(item).counters['Использовано'],1);
  const again=await api.useHandler({actorUuid:actor.uuid,itemId:item.id,eventId:'e1'},{senderId:'u1'});
  assert.equal(again.duplicate,true);
  assert.equal(actor.system.details.fatePoints.current,5);
  assert.equal(sceneFlags['fate-core-official'].situation_aspects.length,2);
  await assert.rejects(()=>api.useHandler({actorUuid:actor.uuid,itemId:item.id,eventId:'e2'},{senderId:'stranger'}),/Нет прав/);
  await assert.rejects(()=>api.useHandler({actorUuid:actor.uuid,itemId:'missing',eventId:'e2'},{senderId:'gm'}),/недоступно/);

  const passive={id:'extra2',type:'Extra',name:'Рефлексы',system:{active:true},flags:{[ID]:{extraDefinition:{name:'Рефлексы',mode:'passive',effects:[{kind:'rollModifier',amount:2,action:'defend',skill:'Атлетика'},{kind:'status',name:'Чутьё',duration:'permanent'}]}}},
    getFlag(scope,key){return this.flags[scope]?.[key];}};
  items.push(passive);
  assert.equal(api.rollBonus(actor,'defend','Атлетика'),2);
  assert.equal(api.rollBonus(actor,'attack','Атлетика'),0);
  assert.equal(api.rollBonus(actor,'defend','Драка'),0);
  assert.ok(api.statuses(actor).some(s=>s.name==='Чутьё'&&s.passive));
  await assert.rejects(()=>api.useHandler({actorUuid:actor.uuid,itemId:passive.id,eventId:'e2'},{senderId:'gm'}),/не активируется/);
  console.log('extra-engine.test.cjs OK');
})().catch(err=>{console.error(err);process.exit(1);});
