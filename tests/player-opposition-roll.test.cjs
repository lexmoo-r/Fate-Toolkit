const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const root = path.join(__dirname,'..');
const context={console,globalThis:null}; context.globalThis=context; vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root,'scripts/player-opposition-roll.js'),'utf8'),context,{filename:'player-opposition-roll.js'});

const actor={id:'a1',uuid:'Actor.a1',name:'Defender',skills:[{name:'Fight',rank:3}]};
const remembered=[]; const posted=[];
const service=context.FateToolkitPlayerOppositionRoll.create({
  findSkill:(target,name)=>target?.skills?.find(s=>s.name===name)||null,
  rememberSkill:async (target,action,name)=>remembered.push([target.id,action,name]),
  validateStuntSelection:(target,keys)=>keys.map(key=>({key,name:`Stunt ${key}`,bonus:1,linkedSkill:'Fight'})),
  stuntBonusTotal:stunts=>stunts.reduce((n,s)=>n+s.bonus,0),
  snapshotRollMath:(roll,data)=>({...data,diceValues:[1,0,0,1],diceTotal:2,diceSignature:'[1,0,0,1]',modifierSources:[],extraBonus:0,total:roll.total,revisionType:'initial',revisionLabel:'Первый бросок'}),
  rollFormula:async formula=>({total:6,formula}),
  postOppositionRoll:async args=>{posted.push(args);return{id:'m1'};},
  currentUserId:()=> 'u2'
});

(async()=>{
  const bad=await service.resolve({proposal:{},targetActor:actor,oppositionAction:'defend',result:{skillName:'Missing'}});
  assert.equal(bad.ok,false);
  assert.match(bad.message,/недоступен/i);

  const ok=await service.resolve({proposal:{id:'p1'},targetActor:actor,oppositionAction:'defend',result:{skillName:'Fight',stuntKeys:['s1']}});
  assert.equal(ok.ok,true);
  assert.equal(ok.opposition.total,6);
  assert.equal(ok.opposition.actorUuid,'Actor.a1');
  assert.equal(ok.opposition.skillName,'Fight');
  assert.equal(ok.opposition.stuntBonus,1);
  assert.equal(ok.opposition.messageId,'m1');
  assert.equal(ok.opposition.oppositionUserId,'u2');
  assert.equal(ok.opposition.hidden,false);
  assert.deepEqual(remembered,[['a1','defend','Fight']]);
  assert.equal(posted.length,1);
  assert.equal(posted[0].oppositionMath.total,6);
  console.log('player-opposition-roll.test.cjs OK');
})().catch(e=>{console.error(e);process.exit(1);});
