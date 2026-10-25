const assert=require('assert');
const fs=require('fs');
const vm=require('vm');
const path=require('path');
const root=path.join(__dirname,'..');
const context={console,globalThis:null};context.globalThis=context;vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root,'scripts/roll-revision.js'),'utf8'),context,{filename:'roll-revision.js'});
const service=context.FateToolkitRollRevision.create({
  parseAnnotations:flavor=>({events:String(flavor).includes('reroll')?[{type:'reroll'}]:[]}),
  rollSignature:roll=>String(roll.signature||roll.total),
  snapshotRollMath:(roll,data)=>({...data,total:Number(roll.total),modifierSources:[],diceSignature:String(roll.signature||roll.total)}),
  appendMathHistory:(h,m)=>[...h,m],
  numberValue:v=>Number(v)||0
});
const baseMsg={rolls:[{total:5,signature:'sig2'}],flavor:''};
let flags={lastResolvedRollSignature:'sig2',lastResolvedRollTotal:5,skillName:'Fight',skillRank:3,stunts:[],stuntBonus:0,rollHistory:[]};
let out=service.player(baseMsg,{rolls:[]},flags);assert.equal(out.ok,false,'same signature should be ignored');
out=service.player({...baseMsg,flavor:'reroll'},{flavor:'reroll'},flags);assert.equal(out.ok,true,'explicit reroll must bypass same-signature suppression');assert.equal(out.total,5);assert.equal(out.history.length,1);
out=service.player(baseMsg,{foo:1},{...flags,lastResolvedRollSignature:'other'});assert.equal(out.ok,false,'irrelevant hook update should be ignored');
flags={lastOppositionRollSignature:'sig2',oppositionSkillName:'Will',oppositionSkillRank:2,stunts:[],stuntBonus:0,oppositionHistory:[]};
out=service.opposition(baseMsg,{rolls:[]},flags);assert.equal(out.ok,false);
out=service.opposition({...baseMsg,rolls:[{total:6,signature:'sig3'}]},{rolls:[]},flags);assert.equal(out.ok,true);assert.equal(out.total,6);assert.equal(out.history.length,1);
console.log('roll-revision.test.cjs OK');
