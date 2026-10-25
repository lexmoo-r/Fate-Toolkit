const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { loadScript } = require('./harness.cjs');

const prefs = {
  a1: {
    favorites: [],
    lastByAction: { attack: 'Shoot', create: 'Notice' },
    recentSkills: ['Shoot', 'Notice'],
    usageBySkill: { Shoot: 4, Notice: 2 }
  }
};
const actor = {
  id: 'a1', uuid: 'Actor.a1',
  system: { skills: { shoot: { name: 'Shoot', rank: 3 }, notice: { name: 'Notice', rank: 2 } }, stunts: {} }
};
const { exports: r } = loadScript('scripts/roll-request.js', ['actionPreparationPlan'], {
  game: { settings: { get: (module, key) => key === 'actionSkillPreferences' ? prefs : null, register() {}, set: async () => {} } }
});

let plan = r.actionPreparationPlan(actor, 'attack', { type: 'token' });
assert.equal(plan.rememberedSkillName, 'Shoot');
assert.equal(plan.needsSkillDialog, true, 'remembered skill is only a preselection; the chooser must always remain available');

plan = r.actionPreparationPlan(actor, 'create', { type: 'marker' });
assert.equal(plan.rememberedSkillName, 'Notice');
assert.equal(plan.createMode, 'existing', 'aspect marker implies existing-aspect Create Advantage');
assert.equal(plan.needsCreateModeDialog, false);

plan = r.actionPreparationPlan(actor, 'create', { type: 'token' });
assert.equal(plan.createMode, 'new', 'non-marker target defaults to a new aspect');

plan = r.actionPreparationPlan(actor, 'create', { type: 'marker' }, { forceConfigure: true });
assert.equal(plan.rememberedSkillName, 'Notice', 'even explicit mode configuration keeps the previous skill as an editable preselection');
assert.equal(plan.needsSkillDialog, true);
assert.equal(plan.createMode, null);
assert.equal(plan.needsCreateModeDialog, true, 'explicit full configuration must keep Create mode choice');

plan = r.actionPreparationPlan(actor, 'defend', null);
assert.equal(plan.needsSkillDialog, true, 'Defend still asks for incoming-action context');

const milestoneTemplate = fs.readFileSync(path.join(__dirname, '..', 'templates', 'milestone-manager.hbs'), 'utf8');
for (const type of ['minor','significant','major']) assert.ok(milestoneTemplate.includes(`data-fms-type="${type}"`), `milestone ${type} must be a direct button`);
console.log('ux.test.cjs OK');
