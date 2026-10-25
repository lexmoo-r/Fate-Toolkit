const assert=require('assert');
const fs=require('fs');
const vm=require('vm');
const path=require('path');
const root=path.join(__dirname,'..');
const context={console,globalThis:null};context.globalThis=context;vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root,'scripts/opposition-refresh-compute.js'),'utf8'),context,{filename:'opposition-refresh-compute.js'});
const service=context.FateToolkitOppositionRefreshCompute.create({
  clone:v=>JSON.parse(JSON.stringify(v)),
  outcomeFor:(type,diff)=>({key:diff>=1?'success':diff===0?'tie':'fail'}),
  boostOpportunityFor:(type,diff)=>diff===0?{kind:'boost'}:null,
  renderResolvedBlock:(req,opp,total)=>`block:${req.id}:${opp?.hidden?'hidden':opp?.total}:${total}`,
  appendActionAudit:(rows,row)=>[...rows,row],
  makeAuditEntry:(type,label,detail,opts)=>({type,label,detail,...opts}),
  signed:v=>`${Number(v)>=0?'+':''}${Number(v)}`
});
const request={id:'r1',actionType:'attack'};
const flags={lastResolvedRollTotal:5,actorName:'Hero',currentMath:{},rollHistory:[],auditTrail:[],damageResolution:{x:1},boostClaimed:true,createdBoostId:'b1',boostActorUuid:'Actor.x',boostName:'Old',createdAspectClaimed:true,createdSceneAspect:{id:'a'},contextResultApplied:{kind:'x'},oppositionTotal:1,difference:4};
let out=service.compute({request,opposition:{total:3,hidden:false,actorUuid:'Actor.foe',messageId:'m2'},flags,gmUserId:'gm1'});
assert.equal(out.difference,2);assert.equal(out.nextFlags.oppositionTotal,3);assert.equal(out.nextFlags.difference,2);assert.equal(out.nextFlags.oppositionActorUuid,'Actor.foe');assert.equal(out.nextFlags.boostClaimed,false);assert.equal(out.nextFlags.createdAspectClaimed,false);assert.equal(out.nextFlags.contextResultApplied,null);assert.equal(Object.prototype.hasOwnProperty.call(out.nextFlags,'damageResolution'),false);
out=service.compute({request,opposition:{total:4,hidden:true,actorUuid:'Actor.secret',messageId:'secret'},flags,gmUserId:'gm1'});
assert.equal(out.nextFlags.oppositionHidden,true);assert.equal(out.nextFlags.oppositionActorUuid,null);assert.equal(out.nextFlags.oppositionMessageId,null);assert.equal(Object.prototype.hasOwnProperty.call(out.nextFlags,'oppositionTotal'),false);assert.equal(Object.prototype.hasOwnProperty.call(out.nextFlags,'difference'),false);assert.ok(!JSON.stringify(out.nextFlags).includes('Actor.secret'));assert.ok(!JSON.stringify(out.nextFlags).includes('secret'));assert.match(out.nextFlags.auditTrail.at(-1).detail,/скрыта мастером/);
console.log('opposition-refresh-compute.test.cjs OK');
