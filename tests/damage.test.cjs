const assert = require('assert');
const { loadScript } = require('./harness.cjs');
(async () => {
  const { exports: d } = loadScript('scripts/chat-actions.js', [
    'trackHasAspect','trackMarked','consequenceName','damageSpec','stressCapacity','damageSelectionsAbsorbed','normalizedDamageState','damageResolutionStarted','restoreDamageSelection'
  ]);
  assert.equal(d.stressCapacity({label:'escalating',harm_can_absorb:1},0),1);
  assert.equal(d.stressCapacity({label:'escalating',harm_can_absorb:1},2),3);
  assert.equal(d.stressCapacity({label:'flat',harm_can_absorb:2},0),2);
  const consequence={name:'Moderate',harm_can_absorb:4,box_values:[true],aspect:{when_marked:true,name:'Broken arm'}};
  assert.equal(d.trackHasAspect(consequence),true);
  assert.equal(d.trackMarked(consequence),true);
  assert.equal(d.consequenceName(consequence),'Broken arm');
  const msg={flags:{'fate-aspect-widget':{resolved:true,difference:4,actionType:'attack',actionTarget:{actorUuid:'Target',actorName:'Target'},boostClaimed:true,boostOpportunity:{tradeShift:true}}}};
  const spec=d.damageSpec(msg); assert.equal(spec.total,3,'success-with-style trade reduces hit by one');
  const state=d.normalizedDamageState({flags:{'fate-aspect-widget':{damageResolution:{selections:[{kind:'stress',capacity:2},{kind:'consequence',capacity:2}]}}}}, {actorUuid:'T',actorName:'T',total:4});
  assert.equal(state.remaining,0); assert.equal(state.status,'resolved');
  assert.equal(d.damageSelectionsAbsorbed(state),4);
  assert.equal(d.damageResolutionStarted({flags:{'fate-aspect-widget':{damageResolution:{status:'pending',selections:[{capacity:1}]}}}}),true);

  const track={box_values:[true,false],aspect:{name:''}};
  const actor={system:{tracks:{physical:track}},async update(data){ if(data['system.tracks.physical.box_values']) track.box_values=data['system.tracks.physical.box_values']; if('system.tracks.physical.aspect.name' in data) track.aspect.name=data['system.tracks.physical.aspect.name']; }};
  const selection={trackKey:'physical',label:'Physical',beforeBoxes:[false,false],afterBoxes:[true,false],beforeAspectName:'',afterAspectName:''};
  assert.equal(await d.restoreDamageSelection(actor,selection),true,'exact module change can be cancelled');
  assert.deepEqual(track.box_values,[false,false]);
  track.box_values=[true,true];
  assert.equal(await d.restoreDamageSelection(actor,selection,{quiet:true}),false,'manual later edit is never overwritten by cancellation');
  console.log('damage.test.cjs OK');
})().catch(err=>{console.error(err);process.exit(1);});
