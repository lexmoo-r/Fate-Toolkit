const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const root = path.join(__dirname,'..');
const context={console,globalThis:null}; context.globalThis=context; vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root,'scripts/player-opposition-ui.js'),'utf8'),context,{filename:'player-opposition-ui.js'});
let captured=null;
const service=context.FateToolkitPlayerOppositionUI.create({
  esc:v=>String(v??''), signed:v=>`${Number(v)>=0?'+':''}${Number(v)}`, stuntSummaryText:()=> 'Stunt A',
  actionProposalSummary:()=> 'Hero: Атака → Foe',
  skillOptionsHtml:()=> '<option value="Fight" selected>Fight (+3)</option>',
  skillSearchControlsHtml:()=> '<div>search</div>', stuntPickerHtml:()=> '<div>stunts</div>',
  bindStuntMacroButtons:()=>{}, bindSkillSearchControls:(root,actor,action,opts)=>{ opts.onChange?.(); },
  waitForDialog:async options=>{captured=options; return {action:'roll',skillName:'Fight',stuntKeys:[]};}
});
(async()=>{
  const actor={name:'Foe'};
  const result=await service.open({proposal:{initiatorName:'Alice',skillName:'Shoot',skillRank:2,stunts:[{name:'A'}]},targetActor:actor,oppositionAction:'defend',oppositionSelected:'Fight',suggestion:{reason:'Use Fight'}});
  assert.equal(result.action,'roll');
  assert.match(captured.content,/Hero: Атака → Foe/);
  assert.match(captured.content,/Use Fight/);
  const form={elements:{opponentSkill:{value:'Fight'}},querySelectorAll:()=>[{value:'s1'}]};
  assert.deepEqual(JSON.parse(JSON.stringify(captured.buttons[0].callback(null,{form}))),{action:'roll',skillName:'Fight',stuntKeys:['s1']});
  assert.deepEqual(JSON.parse(JSON.stringify(captured.buttons[1].callback())),{action:'decline'});
  const skill={value:'Fight'}; const picker={innerHTML:''};
  const fakeRoot={querySelector:s=>s==='[name="opponentSkill"]'?skill:s==='[data-opponent-stunts]'?picker:null,querySelectorAll:()=>[]};
  captured.render(null,{element:fakeRoot});
  assert.equal(picker.innerHTML,'<div>stunts</div>');
  console.log('player-opposition-ui.test.cjs OK');
})().catch(e=>{console.error(e);process.exit(1);});
