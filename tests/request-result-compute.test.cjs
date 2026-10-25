const assert=require('assert');
const fs=require('fs');
const vm=require('vm');
const path=require('path');
const root=path.join(__dirname,'..');
const context={console,globalThis:null};context.globalThis=context;vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root,'scripts/request-result-compute.js'),'utf8'),context,{filename:'request-result-compute.js'});

const service=context.FateToolkitRequestResultCompute.create({
  numberValue:v=>Number(v)||0,
  outcomeFor:(type,diff)=>({key:diff>=3?'style':diff>=1?'success':diff===0?'tie':'fail',title:diff>=1?'Успех':diff===0?'Ничья':'Провал'}),
  boostOpportunityFor:(type,diff)=>diff===0?{kind:'boost'}:null,
  renderResolvedBlock:(req,opp,total)=>`block:${req.id}:${opp?.hidden?'hidden':opp?.total}:${total}`,
  clone:v=>JSON.parse(JSON.stringify(v)),
  appendActionAudit:(rows,row)=>[...rows,row],
  makeAuditEntry:(type,label,detail,opts)=>({type,label,detail,...opts}),
  compactMathFormula:math=>`=${math.total}`,
  signed:v=>`${Number(v)>=0?'+':''}${Number(v)}`,
  actionLabel:()=> 'Атака'
});
function base(opposition){return service.compute({
  payload:{userId:'u1',rollSignature:'sig'},
  request:{id:'r1',actionType:'attack',title:'Test',createMode:null,sceneId:'s1'},
  opposition,
  previousFlags:{auditTrail:[]},
  actor:{uuid:'Actor.a1',name:'Hero'},
  skill:{name:'Fight'},
  validatedStunts:[{key:'s1'}],stunts:[{key:'s1',name:'S',bonus:1}],skillRank:3,stuntBonus:1,
  roll:{total:5},math:{total:5,revisionType:'initial',diceSignature:'sig',modifierSources:[]},history:[{total:5}],gmUserId:'gm1'
});}

const visible=base({total:2,hidden:false,actorUuid:'Actor.foe',messageId:'m2'});
assert.equal(visible.difference,3);
assert.equal(visible.outcome.key,'style');
assert.equal(visible.flagUpdate.oppositionTotal,2);
assert.equal(visible.flagUpdate.difference,3);
assert.equal(visible.flagUpdate.oppositionActorUuid,'Actor.foe');
assert.equal(visible.flagUpdate.oppositionMessageId,'m2');

const hidden=base({total:4,hidden:true,actorUuid:'Actor.secret',messageId:'secretMsg'});
assert.equal(hidden.difference,1);
assert.equal(hidden.flagUpdate.oppositionHidden,true);
assert.equal(hidden.flagUpdate.oppositionActorUuid,null);
assert.equal(hidden.flagUpdate.oppositionMessageId,null);
assert.equal(Object.prototype.hasOwnProperty.call(hidden.flagUpdate,'oppositionTotal'),false);
assert.equal(Object.prototype.hasOwnProperty.call(hidden.flagUpdate,'difference'),false);
assert.ok(!JSON.stringify(hidden.flagUpdate).includes('Actor.secret'));
assert.ok(!JSON.stringify(hidden.flagUpdate).includes('secretMsg'));
assert.match(hidden.auditTrail.at(-1).detail,/скрыта мастером/);

const none=base(null);
assert.equal(none.difference,null);
assert.equal(none.flagUpdate.outcome,null);
assert.equal(none.auditTrail.at(-1).detail,'Без оппозиции');
console.log('request-result-compute.test.cjs OK');
