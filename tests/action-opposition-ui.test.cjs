const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const rootPath = path.join(__dirname, '..');
const context = { console, globalThis: null };
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(rootPath, 'scripts/action-opposition-ui.js'), 'utf8'), context, { filename:'action-opposition-ui.js' });

let captured = null;
const service = context.FateToolkitActionOppositionUI.create({
  esc: value => String(value ?? ''),
  signed: value => `${Number(value) >= 0 ? '+' : ''}${Number(value)}`,
  stuntSummaryText: () => 'Stunt A',
  actorSkills: actor => actor?.skills || [],
  suggestedOppositionSkill: () => ({ skill:{name:'Fight'}, reason:'Use Fight' }),
  stuntPickerHtml: () => '<div>stunts</div>',
  bindStuntMacroButtons: () => {},
  bindActionSelectSearch: () => {},
  waitForDialog: async options => { captured = options; return { action:'resolve', mode:'fixed', difficulty:2, hidden:false }; }
});

(async () => {
  const foe = { name:'Foe', skills:[{name:'Fight',rank:3}] };
  const prepared = {
    candidateRows:[{ref:'actor:b1',name:'Foe',actor:foe}],
    candidateByRef:new Map([['actor:b1',foe]]),
    oppositionAction:'defend',
    initialTargetRef:'actor:b1',
    initialMode:'roll',
    targetText:'Foe'
  };
  const result = await service.open({ actorName:'Hero', actionLabel:'Атака', skillName:'Fight', skillRank:2, stunts:[{name:'A'}] }, prepared);
  assert.equal(result.mode, 'fixed');
  assert.match(captured.content, /value="roll"/);
  assert.match(captured.content, /data-gm-opponent-target-search/);
  assert.match(captured.content, /actor:b1/);
  assert.match(captured.content, /Hero/);
  assert.equal(captured.buttons[0].default, true);

  const fakeForm = {
    elements: {
      mode:{value:'rank'}, opponentTarget:{value:'actor:b1'}, opponentSkill:{value:'Fight'}, difficulty:{value:'5'}, hideOpposition:{checked:true}
    },
    querySelectorAll: () => [{value:'s1'},{value:'s2'}]
  };
  const serialized = captured.buttons[0].callback(null, { form:fakeForm });
  assert.deepEqual(JSON.parse(JSON.stringify(serialized)), {
    action:'resolve', mode:'rank', targetRef:'actor:b1', skillName:'Fight', stuntKeys:['s1','s2'], difficulty:5, hidden:true
  });
  assert.deepEqual(JSON.parse(JSON.stringify(captured.buttons[1].callback())), {action:'reject'});

  // Render callback must be able to initialize its dynamic controls using only prepared data/callbacks.
  const listeners = [];
  const mode = { value:'roll', addEventListener:(name, fn) => listeners.push([name,fn]) };
  const target = { value:'actor:b1', addEventListener:(name, fn) => listeners.push([name,fn]) };
  const skill = { value:'Fight', innerHTML:'', disabled:false, addEventListener:(name, fn) => listeners.push([name,fn]) };
  const suggestionText = { textContent:'' };
  const suggestion = { querySelector:() => suggestionText, toggleAttribute(){} };
  const stuntSection = { toggleAttribute(){} };
  const stuntPicker = { innerHTML:'' };
  const toggler = { toggleAttribute(){} };
  const fakeRoot = {
    querySelector(selector) {
      const map = {
        '[name="mode"]':mode,
        '[name="opponentTarget"]':target,
        '[name="opponentSkill"]':skill,
        '[data-opponent-suggestion]':suggestion,
        '[data-opponent-stunt-section]':stuntSection,
        '[data-opponent-stunts]':stuntPicker,
        '[data-opponent-target]':toggler,
        '[data-opponent-skill]':toggler,
        '[data-fixed-difficulty]':toggler
      };
      return map[selector] || null;
    },
    querySelectorAll(){ return []; }
  };
  captured.render(null, { element:fakeRoot });
  assert.match(skill.innerHTML, /Fight/);
  assert.equal(suggestionText.textContent, 'Use Fight');
  assert.equal(stuntPicker.innerHTML, '<div>stunts</div>');
  assert.ok(listeners.length >= 3);

  console.log('action-opposition-ui.test.cjs OK');
})().catch(error => { console.error(error); process.exit(1); });
