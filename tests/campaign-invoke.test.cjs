const assert = require('node:assert/strict');
const { loadScript } = require('./harness.cjs');
(async () => {
  let will=4;
  let invokeCalls=[];
  const actor={uuid:'Actor.a',system:{details:{fatePoints:{current:4}}}};
  const mod=loadScript('scripts/invoke-resource.js',[],{
    context: { FateToolkitWill: {
      enabled:()=>true,
      details:()=>({current:will,max:9,configured:true}),
      request: async (op,a,options)=>{assert.equal(op,'change');assert.equal(a,actor);invokeCalls.push(options.delta);will+=options.delta;}
    } }
  });
  const resource=mod.context.FateToolkitInvokeResource.create({
    actorFromUuid:async()=>actor,currentRollActorUuid:()=>actor.uuid,
    intValue:v=>parseInt(v,10)||0,numberValue:Number,
    clone:value=>JSON.parse(JSON.stringify(value)),getGameAspects:()=>[],setGameAspects:async()=>{},
    getScene:()=>null,getViewedScene:()=>null,removeBoost:async()=>true,addBoost:async()=>{},systemId:'fate-core-official'
  });
  const undo=await resource.consume({},{paidAllowed:true},false);
  assert.equal(will,3);assert.deepEqual(invokeCalls,[-1]);
  await undo();assert.equal(will,4);assert.deepEqual(invokeCalls,[-1,1]);
  assert.equal(actor.system.details.fatePoints.current,4,'no unauthorized direct native mutation');
  console.log('campaign-invoke.test.cjs OK');
})().catch(e=>{console.error(e);process.exit(1)});
