const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { loadScript } = require('./harness.cjs');
const root = path.join(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

// A remembered skill is a visible default, never a hidden quick-action shortcut.
const actor = { id:'a1', uuid:'Actor.a1', system:{ skills:{ shoot:{name:'Shoot',rank:3}, notice:{name:'Notice',rank:2} }, stunts:{} } };
const prefs = { a1:{ favorites:[], lastByAction:{attack:'Shoot'}, recentSkills:['Shoot'], usageBySkill:{Shoot:2} } };
const { exports:r } = loadScript('scripts/roll-request.js', ['actionPreparationPlan'], {
  game:{ settings:{ get:(_m,key)=>key==='actionSkillPreferences'?prefs:null, register(){}, set:async()=>{} } }
});
const plan = r.actionPreparationPlan(actor, 'attack', {type:'token'});
assert.equal(plan.rememberedSkillName, 'Shoot');
assert.equal(plan.needsSkillDialog, true);
assert.ok(!read('scripts/roll-request.js').includes('event.shiftKey'), 'action selection must not depend on hidden Shift gestures');
assert.ok(!read('scripts/help.js').includes('Shift+клик'), 'Russian help must describe the visible chooser, not Shift shortcuts');

// Rerolls must derive the static modifier from the actual current roll.
const { exports:chat } = loadScript('scripts/chat-actions.js', ['rerollFormulaBase'], { context:{ Roll:class{} } });
assert.equal(chat.rerollFormulaBase({ rolls:[{ total:7, dice:[{results:[{result:1},{result:0},{result:-1},{result:1}]}] }], flags:{'fate-aspect-widget':{ currentMath:{total:999,diceTotal:0} }} }), 6);

// Toolkit UI localization must not query Fate Core Official's dictionary.
for (const file of fs.readdirSync(path.join(root,'scripts')).filter(f=>f.endsWith('.js'))) {
  assert.ok(!read(`scripts/${file}`).includes('game.i18n.localize("fate-core-official.'), `${file}: system localization dependency remains`);
  assert.ok(!read(`scripts/${file}`).includes("game.i18n.localize('fate-core-official."), `${file}: system localization dependency remains`);
}
const vm = require('vm');
const i18nContext = { globalThis:null }; i18nContext.globalThis=i18nContext; vm.createContext(i18nContext); vm.runInContext(read('scripts/module-i18n.js'), i18nContext);
assert.equal(i18nContext.FateToolkitI18n.skill('Shoot'), 'Стрельба');
assert.equal(i18nContext.FateToolkitI18n.term('High Concept'), 'Высокая концепция');
assert.equal(i18nContext.FateToolkitI18n.rank('Great'), 'Отлично');
const ru = JSON.parse(read('lang/ru.json'));
for (const key of ['FCT.FatePointsShort','FAW.Action.Preselected']) assert.ok(ru[key], `missing Russian UI key ${key}`);

// Tracker menus are in-flow disclosure panels, never clipped absolute popovers.
const tracker = read('templates/combat-tracker.hbs');
assert.ok(tracker.includes('fct-inline-menu'));
assert.ok(!tracker.includes('faw-context-menu-popover'));
assert.match(read('styles/layout-overhaul.css'), /\.faw-combat-tracker \.fct-inline-menu[\s\S]*position:\s*static\s*!important/);
assert.match(read('styles/layout-overhaul.css'), /\[class\*=["']-badge["']\][\s\S]*border-radius:\s*2px\s*!important/, 'legacy pill badges need a final rectangular override');

console.log('v146-regression.test.cjs OK');
