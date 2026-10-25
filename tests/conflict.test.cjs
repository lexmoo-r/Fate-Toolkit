const assert = require('assert');
const { loadScript } = require('./harness.cjs');
(async () => {
  function row(id,{acted=false,defeated=false,actorId=id}={}){return {id,defeated,tokenId:null,actor:{id:actorId,uuid:`Actor.${actorId}`,system:{tracks:{}}},getFlag:()=>acted};}
  const a=row('a',{acted:true}), b=row('b'), cRow=row('c',{defeated:true});
  const map=new Map([['a',a],['b',b],['c',cRow]]);
  const combat={
    round:1,turn:1,turns:[a,b,cRow],
    combatants:{contents:[a,b,cRow],get:id=>map.get(id)},
    getFlag:()=>['a','b','c'],
    async updateEmbeddedDocuments(type,updates){ for(const u of updates){ const row=map.get(u._id); row.getFlag=()=>false; } },
    async update(data){ if('round' in data)this.round=data.round;if('turn' in data)this.turn=data.turn; }
  };
  const { exports: c } = loadScript('scripts/combat-tracker.js', ['getQueue','nextUnacted','combatContainsActor','activeConsequences','boxedTracks','advanceExchange'], {user:{id:'gm',isGM:true,active:true},game:{user:{id:'gm',isGM:true,active:true}}});
  assert.deepEqual(Array.from(c.getQueue(combat)),['a','b','c']);
  assert.equal(c.nextUnacted(combat,'a').id,'b');
  assert.equal(c.combatContainsActor(b.actor,combat),true);
  const actor={system:{tracks:{physical:{name:'Physical',enabled:true,label:'escalating',box_values:[true,false],harm_can_absorb:1},moderate:{name:'Moderate consequence',enabled:true,box_values:[true],harm_can_absorb:4,aspect:{when_marked:true,name:'Broken arm'}}}}};
  assert.equal(c.activeConsequences(actor)[0].name,'Broken arm');
  assert.equal(c.boxedTracks(actor).length,2);
  await c.advanceExchange(combat);
  assert.equal(combat.round,2,'new exchange increments round');
  assert.equal(combat.turn,0,'new exchange returns to first non-defeated participant');
  assert.equal(a.getFlag('fate-core-official','hasActed'),false,'exchange resets acted state');
  console.log('conflict.test.cjs OK');
})().catch(err=>{console.error(err);process.exit(1);});
