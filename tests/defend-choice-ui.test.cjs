const assert=require('assert');
const fs=require('fs');
const vm=require('vm');
const path=require('path');
const root=path.join(__dirname,'..');
const context={console,globalThis:null};context.globalThis=context;vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root,'scripts/defend-choice-ui.js'),'utf8'),context,{filename:'defend-choice-ui.js'});
let captured=null;
const service=context.FateToolkitDefendChoiceUI.create({
  skillOptionsHtml:()=>'<option value="Will" selected>Will (+2)</option>',
  skillSearchControlsHtml:()=>'<div>search</div>',
  stuntPickerHtml:()=>'<div>stunts</div>',
  bindStuntMacroButtons:()=>{},
  bindSkillSearchControls:(root,actor,action,opts)=>{opts.onChange?.();},
  waitForDialog:async options=>{captured=options;return{skillName:'Will',defendedAgainst:'attack',defendedCreateMode:'new',stuntKeys:[]};}
});
(async()=>{
  const actor={name:'Hero'};
  const result=await service.open({actor,selected:'Will'});
  assert.equal(result.skillName,'Will');
  assert.match(captured.content,/name="defendedAgainst"/);
  assert.match(captured.content,/value="existing"/);
  assert.equal(captured.modal,true);
  const form={elements:{skillName:{value:'Will'},defendedAgainst:{value:'create'},defendedCreateMode:{value:'existing'}},querySelectorAll:()=>[{value:'s1'}]};
  assert.deepEqual(JSON.parse(JSON.stringify(captured.buttons[0].callback(null,{form}))),{skillName:'Will',defendedAgainst:'create',defendedCreateMode:'existing',stuntKeys:['s1']});
  const incoming={value:'create',addEventListener(){}}; const skill={value:'Will'}; const picker={innerHTML:''}; let hiddenState=null;
  const toggle={toggleAttribute:(name,val)=>{if(name==='hidden')hiddenState=val;}};
  const fakeRoot={querySelector:s=>s==='[name="defendedAgainst"]'?incoming:s==='[name="skillName"]'?skill:s==='[data-stunt-picker]'?picker:s==='[data-defended-create]'?toggle:null,querySelectorAll:()=>[]};
  captured.render(null,{element:fakeRoot});
  assert.equal(hiddenState,false);
  assert.equal(picker.innerHTML,'<div>stunts</div>');
  console.log('defend-choice-ui.test.cjs OK');
})().catch(e=>{console.error(e);process.exit(1);});
