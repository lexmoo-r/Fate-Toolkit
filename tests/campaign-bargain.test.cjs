const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const {baseContext}=require('./harness.cjs');
(async()=>{
 const gm={id:'gm',name:'GM',isGM:true};
 const player={id:'p',name:'Player',isGM:false};
 let current=2, accepted=true, confirms=0;
 const logs=[],rpcHandlers=new Map(),events=[];
 const actor={uuid:'Actor.hero',name:'Hero',type:'fate-core-official',system:{details:{fatePoints:{current:2,refresh:3}}},flags:{},
   testUserPermission:u=>u===player,
   getFlag(k,v){return this.flags?.[k]?.[v];},
   async update(data){for(const [key,val] of Object.entries(data)){
     if(key==='system.details.fatePoints.current')this.system.details.fatePoints.current=val;
     else if(key==='flags.fate-aspect-widget.will'){this.flags['fate-aspect-widget']??={};this.flags['fate-aspect-widget'].will=val;}
     else throw new Error(key);
   }}};
 const hooks=new Map();
 const ctx=baseContext({game:{user:gm,users:{get:id=>[gm,player].find(u=>u.id===id)},settings:{register(){},get(_m,key){return key==='campaign2012Mode'?true:1},set:async()=>{}}},context:{
   Hooks:{once:(name,fn)=>hooks.set(name,fn)},fromUuid:async()=>actor,
   ChatMessage:{getSpeaker:()=>({alias:'Hero'}),create:async msg=>logs.push(msg)},
   Roll:class{}
 }});
 ctx.game.i18n={localize:key=>key};
 ctx.foundry.applications.api.DialogV2.confirm=async arg=>{confirms++;events.push(arg.content);return accepted;};
 ctx.FateToolkitRPC={register:(key,fn)=>rpcHandlers.set(key,fn),executeAsGM:(key,payload)=>rpcHandlers.get(key)(payload,{senderId:player.id})};
 vm.createContext(ctx);
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../scripts/campaign-will.js'),'utf8'),ctx);
 hooks.get('init')();
 await ctx.FateToolkitWill.handler({operation:'configure',actorUuid:actor.uuid,type:'pc',eventId:'configure'},{senderId:gm.id});
 assert.equal(ctx.FateToolkitWill.details(actor).current,6);
 const data={operation:'bargain',actorUuid:actor.uuid,description:'Охрана замечает <героя>',eventId:'roll1'};
 let result=await ctx.FateToolkitWill.handler(data,{senderId:player.id});
 assert.equal(result.accepted,true); assert.equal(result.after,7);
 assert.equal(confirms,1);
 assert.ok(events[0].includes('&lt;героя&gt;'),'untrusted description is escaped');
 assert.ok(logs[0].content.includes('&lt;героя&gt;'));
 result=await ctx.FateToolkitWill.handler(data,{senderId:player.id});
 assert.equal(result.duplicate,true);assert.equal(confirms,1);
 accepted=false;
 result=await ctx.FateToolkitWill.handler({...data,eventId:'roll2'},{senderId:player.id});
 assert.equal(result.accepted,false);assert.equal(result.reason,'rejected');
 assert.equal(ctx.FateToolkitWill.details(actor).current,7);
 accepted=true;
 await assert.rejects(()=>ctx.FateToolkitWill.handler({...data,eventId:'roll3',description:''},{senderId:player.id}),/Укажите осложнение/);
 await ctx.FateToolkitWill.handler({operation:'change',actorUuid:actor.uuid,delta:2},{senderId:gm.id});
 result=await ctx.FateToolkitWill.handler({...data,eventId:'roll4'},{senderId:player.id});
 assert.equal(result.accepted,false);assert.equal(result.reason,'full');assert.equal(confirms,2);
 const ui=baseContext({context:{FateToolkitWill:{enabled:()=>false}}});vm.createContext(ui);
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../scripts/campaign-bargain-ui.js'),'utf8'),ui);
 const helper=ui.FateToolkitBargainUI.create({uiText:(key,def)=>def,esc:s=>s});
 assert.equal((await helper.confirmRollBargain(actor)).accepted,false);
 console.log('campaign-bargain.test.cjs OK');
})().catch(e=>{console.error(e);process.exit(1)});
