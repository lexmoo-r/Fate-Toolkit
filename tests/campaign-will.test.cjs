const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { baseContext } = require('./harness.cjs');

(async () => {
  let scene = 0;
  let campaignMode = true;
  const registrations = new Map();
  const g = { id:'gm', isGM:true };
  const p = { id:'player', isGM:false };
  const other = { id:'other', isGM:false };
  let currentUser = g;
  const messages = [];
  const rolls = [];
  const actors = new Map();
  function actor(id) {
    const a = { id, uuid:`Actor.${id}`, type:'fate-core-official', name:id,
      system:{details:{fatePoints:{current:2,refresh:3,boosts:0}}}, flags:{},
      testUserPermission(user, level){return level==='OWNER' && user?.id === p.id;},
      getFlag(module,key){return this.flags?.[module]?.[key];},
      async update(data){
        for (const [key,value] of Object.entries(data)) {
          if(key==='system.details.fatePoints.current') this.system.details.fatePoints.current=value;
          else if(key==='flags.fate-aspect-widget.will'){
            this.flags['fate-aspect-widget']??={};this.flags['fate-aspect-widget'].will=value;
          } else throw new Error('Unexpected actor update: '+key);
        }
      }
    };
    actors.set(a.uuid,a); return a;
  }
  const pc=actor('pc'); const npc=actor('npc');
  const hooks=new Map();
  const ctx=baseContext({ game: {
    user:g,
    users:{get:id=>[g,p,other].find(x=>x.id===id),activeGM:g},
    settings:{register(_ns,key,cfg){registrations.set(key,cfg)},get(_ns,key){if(key==='campaign2012Mode') return campaignMode;if(key==='campaignSceneSerial')return scene;return null},async set(_ns,key,val){if(key==='campaignSceneSerial')scene=val;else throw new Error(key)}}
  }, context:{
    Hooks:{once:(name,fn)=>{hooks.set(name,fn)}},
    fromUuid: async uuid=>actors.get(uuid),
    Roll:class { constructor(formula){ assert.equal(formula,'4dF + 4'); } async roll(){this.total=rolls.shift();return this;} async toMessage(data){messages.push(data)} },
    ChatMessage:{getSpeaker:({actor})=>({alias:actor.name}),create:async row=>{messages.push(row)}}
  }});
  let randomCounter=0; ctx.foundry.utils.randomID=()=>`event-${++randomCounter}`;
  const handlers=new Map();
  ctx.FateToolkitRPC={register:(key,handler)=>handlers.set(key,handler),executeAsGM:(key,payload)=>handlers.get(key)(payload,{senderId:currentUser.id})};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../scripts/campaign-will.js'),'utf8'),ctx);
  hooks.get('init')();
  // Newly created campaign characters must already display Will 6/9 without
  // forcing the GM to discover hidden setup actions in the sheet.
  const fresh=actor('new-character');
  const startup=await ctx.FateToolkitWill.autoConfigureNewActor(fresh);
  assert.equal(startup,true);
  assert.equal(ctx.FateToolkitWill.details(fresh).configured,true);
  assert.equal(ctx.FateToolkitWill.details(fresh).current,6);
  assert.equal(ctx.FateToolkitWill.details(fresh).max,9);
  assert.equal(fresh.system.details.fatePoints.refresh,3,'native refresh remains unchanged');
  assert.equal(await ctx.FateToolkitWill.autoConfigureNewActor(fresh),false,'initialisation must be idempotent');
  assert.equal(ctx.FateToolkitWill.details(pc).configured,false,'preexisting actors are not silently migrated');
  assert.ok(registrations.has('campaign2012Mode'));
  assert.equal(registrations.get('campaign2012Mode').default,false);
  const will=ctx.FateToolkitWill;
  const call=async (operation,a,extra={})=>will.request(operation,a,extra);
  await call('configure',pc,{type:'pc',eventId:'setup-pc'});
  assert.equal(will.details(pc).current,6);
  assert.equal(will.details(pc).max,9);
  assert.equal(pc.system.details.fatePoints.refresh,3,'original native stunt refresh preserved');
  await call('configure',npc,{type:'npc',tier:'rank',eventId:'setup-npc'});
  assert.equal(will.details(npc).current,3);
  assert.equal(will.details(npc).max,3);
  assert.equal((await call('change',pc,{delta:-2,eventId:'t1'})).after,4);
  assert.equal((await call('change',pc,{delta:-2,eventId:'t1'})).duplicate,true);
  assert.equal(will.details(pc).current,4);
  await call('change',pc,{delta:12,eventId:'t2'});
  assert.equal(will.details(pc).current,9,'max 9 cannot be exceeded');
  await assert.rejects(()=>call('change',pc,{delta:-12}),/Недостаточно Воли/);
  currentUser=other;
  await assert.rejects(()=>call('change',pc,{delta:1}),/Нет прав/);
  currentUser=p;
  await assert.rejects(()=>call('configure',pc,{type:'npc'}),/только мастеру/);
  await assert.rejects(()=>call('beginScene'),/только мастер/);
  currentUser=g;
  const first=await call('beginScene'); assert.equal(first.scene,1);
  await call('change',npc,{delta:-2});assert.equal(will.details(npc).current,1);
  await call('enterScene',npc,{eventId:'npc-enter'}); assert.equal(will.details(npc).current,3);
  await call('change',npc,{delta:-1});
  const noExtra=await call('enterScene',npc,{eventId:'npc-enter-again'});assert.equal(noExtra.unchanged,true);
  assert.equal(will.details(npc).current,2,'cannot reset twice in same narrative scene');
  await call('beginScene');await call('enterScene',npc);assert.equal(will.details(npc).current,3);
  await call('change',pc,{delta:-3});assert.equal(will.details(pc).current,6);
  rolls.push(4); const recovered=await call('vice',pc,{eventId:'vice1'});
  assert.equal(recovered.restored,3);assert.equal(recovered.excessive,true);
  assert.equal(will.details(pc).current,9);
  assert.equal(will.details(pc).complication.pending,true);
  assert.equal(messages.length,1);
  await assert.rejects(()=>call('vice',pc),/предыдущее осложнение/);
  await call('resolveComplication',pc,{description:'Семейный конфликт'});
  assert.equal(will.details(pc).complication.pending,false);
  await call('change',pc,{delta:-4});
  await assert.rejects(()=>call('vice',pc),/В этой сцене/);
  await call('beginScene');rolls.push(2);
  const equal=await call('vice',pc);assert.equal(equal.excessive,false);assert.equal(equal.restored,2);
  const atStart=will.details(pc).current;
  currentUser=p;
  const paid=await call('special',pc,{purpose:'flashback',amount:2,description:'Вернулся за уликой',eventId:'flashback-test'});
  assert.equal(paid.after,atStart-2);
  assert.equal((await call('special',pc,{purpose:'flashback',amount:2,description:'Дубликат',eventId:'flashback-test'})).duplicate,true);
  assert.equal(will.details(pc).current,atStart-2);
  await assert.rejects(()=>call('special',pc,{purpose:'resistance',amount:200}),/Некорректная цена/);
  await assert.rejects(()=>call('compel',pc,{description:'Слабость'}),/только ведущий/);
  currentUser=g;
  const granted=await call('compel',pc,{description:'Слабость осложнила действие',eventId:'compel-test'});
  assert.equal(granted.delta,1);
  assert.equal(will.details(pc).current,atStart-1);
  assert.ok(messages.some(message=>String(message.content||'').includes('Флэшбек')));
  assert.ok(messages.some(message=>String(message.content||'').includes('Принято осложнение')));
  await call('change',npc,{delta:-1});
  const beforeAuto=will.details(npc).current;
  const firstAuto=await will.restoreCombatNpcs({combatants:{contents:[{actor:npc}]}},scene);
  assert.equal(firstAuto.restored,1,'NPC enters this scene for the first time');
  assert.equal(will.details(npc).current,3);
  await call('change',npc,{delta:-1});
  const sameAuto=await will.restoreCombatNpcs({combatants:{contents:[{actor:npc}]}},scene);
  assert.equal(sameAuto.restored,0);
  assert.equal(will.details(npc).current,2,'NPC cannot refill twice in a scene');
  await call('beginScene');
  const auto=await will.restoreCombatNpcs({combatants:{contents:[{actor:npc}]}},scene);
  assert.equal(auto.restored,1);
  assert.equal(will.details(npc).current,3);
  await call('change',npc,{delta:-1});
  const repeatAuto=await will.restoreCombatNpcs({combatants:{contents:[{actor:npc}]}},scene);
  assert.equal(repeatAuto.restored,0);
  assert.equal(will.details(npc).current,2);
  // Repeated changes of mode/tier are allowed without opening a new actor.
  const originalNpcScene=will.details(npc).lastScene;
  await call('configure',npc,{type:'npc',tier:'legendary',eventId:'npc-legendary'});
  assert.equal(will.details(npc).max,12);
  assert.equal(will.details(npc).lastScene,originalNpcScene,'tier edits do not grant another scene refresh');
  const pcWillBefore=will.details(pc).current;
  await call('configure',pc,{type:'npc',tier:'rank',eventId:'pc-to-npc'});
  assert.equal(will.details(pc).type,'npc');
  assert.equal(will.details(pc).current,Math.min(pcWillBefore,3));
  await call('configure',pc,{type:'pc',eventId:'npc-to-pc'});
  assert.equal(will.details(pc).type,'pc');
  assert.equal(will.details(pc).max,9);
  assert.equal(will.details(pc).current,Math.min(pcWillBefore,3),'mode switch must not grant free Will');
  ctx.canvas={tokens:{placeables:[{actor:npc},{actor:pc}]}};
  await call('change',npc,{delta:-1});
  const npcRefill=await call('restoreNpcs');
  assert.equal(npcRefill.restoredNpcs,1,'manual scene refill changes NPCs only');
  assert.equal(will.details(npc).current,12);
  const pcUnaffected=will.details(pc).current;
  await call('restoreNpcs');
  assert.equal(will.details(pc).current,pcUnaffected,'manual NPC refill must not change PC Will');
  campaignMode=false;
  const afterDisabled=actor('created-in-base-mode');
  assert.equal(await will.autoConfigureNewActor(afterDisabled),false,'classic Fate actor must not be configured');
  assert.equal(will.details(afterDisabled).configured,false);
  await assert.rejects(()=>call('change',pc,{delta:1}),/отключены/);
  console.log('campaign-will.test.cjs OK');
})().catch(error=>{console.error(error);process.exit(1)});
