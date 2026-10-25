const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { baseContext } = require('./harness.cjs');

(async () => {
  const root=path.join(__dirname,'..');
  const context=baseContext();
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root,'scripts/invoke-resource.js'),'utf8'),context,{filename:'invoke-resource.js'});

  const actor={uuid:'Actor.Roller',system:{details:{fatePoints:{current:2}}},async update(data){this.system.details.fatePoints.current=data['system.details.fatePoints.current'];}};
  let globalAspects=[{name:'High Ground',free_invokes:2}];
  const scenes=new Map();
  const boosts=[];
  const resource=context.FateToolkitInvokeResource.create({
    actorFromUuid:async uuid=>uuid===actor.uuid?actor:null,
    currentRollActorUuid:message=>message.flags['fate-aspect-widget'].actorUuid,
    intValue:v=>Number.parseInt(v,10)||0,
    numberValue:v=>Number(v)||0,
    clone:v=>v==null?v:JSON.parse(JSON.stringify(v)),
    getGameAspects:()=>globalAspects,
    setGameAspects:async value=>{globalAspects=value;},
    getScene:id=>scenes.get(id)||null,
    getViewedScene:()=>null,
    removeBoost:async (actorUuid,boostId)=>{boosts.push(['remove',actorUuid,boostId]);return true;},
    addBoost:async (actorUuid,name)=>{boosts.push(['add',actorUuid,name]);return true;},
    systemId:'fate-core-official'
  });
  const message={flags:{'fate-aspect-widget':{actorUuid:actor.uuid}}};
  const undoPaid=await resource.consume(message,{kind:'actor',paidAllowed:true,freeUses:0},false);
  assert.equal(actor.system.details.fatePoints.current,1,'paid invoke spends 1 FP');
  await undoPaid();
  assert.equal(actor.system.details.fatePoints.current,2,'paid invoke rollback restores FP');

  const undoFree=await resource.consume(message,{kind:'global',paidAllowed:true,freeUses:2,index:0},true);
  assert.equal(globalAspects[0].free_invokes,1,'free invoke decrements native free_invokes');
  await undoFree();
  assert.equal(globalAspects[0].free_invokes,2,'free invoke rollback restores native state');

  const scene={rows:[{name:'Smoke',free_invokes:1}],getFlag(){return this.rows;},async setFlag(_sys,_key,val){this.rows=val;}};
  scenes.set('s1',scene);
  const undoScene=await resource.consume(message,{kind:'scene',sceneId:'s1',index:0,freeUses:1},true);
  assert.equal(scene.rows[0].free_invokes,0);
  await undoScene();
  assert.equal(scene.rows[0].free_invokes,1);

  const undoBoost=await resource.consume(message,{kind:'boost',actorUuid:'Actor.Roller',boostId:'b1',name:'Off Balance',freeUses:1},true);
  assert.deepEqual(boosts[0],['remove','Actor.Roller','b1']);
  await undoBoost();
  assert.deepEqual(boosts[1],['add','Actor.Roller','Off Balance']);

  console.log('invokes.test.cjs OK');
})().catch(err=>{console.error(err);process.exit(1);});
