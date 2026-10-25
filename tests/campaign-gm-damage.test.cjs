const assert=require('node:assert/strict');
const {loadScript}=require('./harness.cjs');
const ru=require('../lang/ru.json');
(async()=>{
  const gm={id:'gm',name:'GM',isGM:true,active:true};const player={id:'p',name:'P',isGM:false};
  let will=3;const errors=[],audits=[];
  const track={name:'Mild',aspect:{name:'Ожог',when_marked:true},box_values:[true]};
  const actor={uuid:'Actor.hero',name:'Hero',type:'fate-core-official',system:{tracks:{mild:track}},
    async update(patch){for(const [key,val] of Object.entries(patch)){
      if(key==='system.tracks.mild.box_values')track.box_values=val;
      else if(key==='system.tracks.mild.aspect.name')track.aspect.name=val;
      else throw new Error(key);
    }}};
  const selectionWill={id:'sw',kind:'will',label:'Воля',capacity:2,beforeWill:5,afterWill:3};
  const selectionConsequence={id:'sc',kind:'consequence',trackKey:'mild',label:'Малое последствие',name:'Ожог',capacity:2,
    beforeBoxes:[false],afterBoxes:[true],beforeAspectName:'',afterAspectName:'Ожог'};
  const flags={'fate-aspect-widget':{
    resolved:true,difference:5,actionType:'attack',actorUuid:'Actor.attacker',
    actionTarget:{actorUuid:actor.uuid,actorName:'Hero'},
    damageResolution:{actorUuid:actor.uuid,actorName:'Hero',total:5,remaining:1,status:'pending',takenOut:null,
      selections:[selectionWill,selectionConsequence]}
  }};
  const message={id:'m1',flags,async update(patch){for(const [key,value]of Object.entries(patch)){
      if(key!=='flags.fate-aspect-widget.damageResolution') throw new Error(key);
      flags['fate-aspect-widget'].damageResolution=value;
    }}};
  const api={appendMessageAudit:async(_m,row)=>audits.push(row),refresh:()=>{}};
  const ctxOverrides={game:{user:gm,i18n:{localize:key=>ru[key]||key},users:{activeGM:gm,get:id=>id==='gm'?gm:player},messages:{get:id=>id==='m1'?message:null},
    modules:{get:()=>({api})},settings:{get:()=>[]},socket:{emit(){}}},context:{
      fromUuid:async()=>actor,FateToolkitWill:{enabled:()=>true,details:()=>({configured:true,rawCurrent:will,max:9}),
        handler:async(payload)=>{assert.equal(payload.operation,'change');assert.equal(payload.expectedCurrent,will);will+=payload.delta;return {ok:true};}},
      FateToolkitUX:{error:m=>errors.push(m),warn:m=>errors.push(m),confirm:async()=>true}
    }};
  const {exports:fx}=loadScript('scripts/chat-actions.js', ['normalizedDamageState','ignoreRemainingOnGm','cancelAllDamageOnGm'],ctxOverrides);
  await fx.ignoreRemainingOnGm({messageId:'m1',userId:player.id});
  assert.equal(flags['fate-aspect-widget'].damageResolution.status,'pending','players cannot skip GM-only harm');
  assert.equal(errors.length,1);
  errors.length=0;
  await fx.ignoreRemainingOnGm({messageId:'m1',userId:'gm'});
  let state=flags['fate-aspect-widget'].damageResolution;
  assert.equal(state.status,'ignored');assert.equal(state.ignored.mode,'remaining');
  assert.equal(state.selections.length,2);assert.equal(will,3);
  assert.equal(fx.normalizedDamageState(message,{actorUuid:actor.uuid,actorName:'Hero',total:5}).remaining,0);
  await fx.cancelAllDamageOnGm({messageId:'m1',userId:'gm'});
  state=flags['fate-aspect-widget'].damageResolution;
  assert.equal(state.status,'ignored');assert.equal(state.ignored.mode,'all');
  assert.equal(state.selections.length,0);assert.equal(will,5);
  assert.deepEqual(Array.from(track.box_values),[false]);assert.equal(track.aspect.name,'');
  await fx.cancelAllDamageOnGm({messageId:'m1',userId:'gm'});
  assert.equal(will,5,'duplicate cancel cannot refund twice');
  assert.equal(errors.length,0,`unexpected errors: ${errors}`);
  assert.ok(audits.some(x=>String(x.label).includes('Пропустить')));
  assert.ok(audits.some(x=>String(x.label).includes('Отменить')));
  console.log('campaign-gm-damage.test.cjs OK');
})().catch(e=>{console.error(e);process.exit(1)});
