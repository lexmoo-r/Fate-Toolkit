const assert = require('assert');
const { loadScript } = require('./harness.cjs');

const prefsStore = {};
const registeredSettings = [];
const registrations = [];
const hooks = {};

const loaded = loadScript('scripts/character-sheet.js', [
  'normaliseSheetPrefs',
  'sectionState',
  'normaliseCustomFields',
  'buildSheetModel',
  'preserveSheetArtworkFormData'
], {
  game: {
    settings: {
      get: (_scope, key) => key === 'characterSheetPreferences' ? prefsStore : null,
      register: (scope, key, config) => registeredSettings.push({ scope, key, config }),
      set: async () => {}
    },
    user: { id:'u1', isGM:false, active:true, targets:new Set() }
  },
  context: {
    document: undefined,
    Hooks: { once: (name, fn) => { hooks[name] = fn; }, on() {} }
  }
});
const { context } = loaded;
const { normaliseSheetPrefs, sectionState, normaliseCustomFields, buildSheetModel, preserveSheetArtworkFormData } = loaded.exports;

const normalized = normaliseSheetPrefs({
  activeTab: 'invalid',
  density: 'compact',
  artwork: 'token',
  theme: 'midnight',
  accent: '#12ABef',
  sectionOrder: ['skills', 'skills', 'nope', 'aspects'],
  hiddenSections: ['extras', 'nope'],
  wideSections: ['aspects', 'bad'],
  favorites: { skills:['Will','Will',''], aspects:['high-concept'] }
});
assert.equal(normalized.activeTab, 'play');
assert.equal(normalized.density, 'compact');
assert.equal(normaliseSheetPrefs({density:'comfortable'}).density, 'comfortable');

assert.equal(normalized.artwork, 'token');
assert.equal(normalized.theme, 'midnight');
assert.equal(normalized.accent, '#12abef');
assert.equal(normaliseSheetPrefs({theme:'bad', accent:'red'}).theme, 'foundry');
assert.equal(normaliseSheetPrefs({theme:'bad', accent:'red'}).accent, '#c49a57');
assert.deepEqual(Array.from(normalized.sectionOrder).slice(0,2), ['skills','aspects']);
assert.equal(normalized.sectionOrder.length, 9);
assert.deepEqual(Array.from(normalized.hiddenSections), ['extras']);
assert.deepEqual(Array.from(normalized.wideSections), ['aspects']);
assert.deepEqual(Array.from(normalized.favorites.skills), ['Will']);

const sections = sectionState(normalized);
assert.equal(sections.skills.order, 0);
assert.equal(sections.extras.hidden, true);
assert.equal(sections.aspects.wide, true);

const custom = normaliseCustomFields([
  { id:'a', label:'Sanity', type:'counter', value:2, max:5, width:'wide' },
  { id:'a', label:'Duplicate', type:'toggle', value:1 },
  { id:'n', label:'Age', type:'wrong', value:33 },
  null
]);
assert.equal(custom.length, 3);
assert.equal(custom[0].isCounter, true);
assert.equal(custom[0].max, 5);
assert.equal(custom[0].isWide, true);
assert.notEqual(custom[0].id, custom[1].id, 'duplicate custom ids must be regenerated');
assert.equal(custom[1].isToggle, true);
assert.equal(custom[2].type, 'text');

const items = [
  { id:'i1', uuid:'Actor.A.Item.i1', name:'Jetpack', img:'jet.png', system:{ active:true, description:{ value:'<b>Fast</b>' } } }
];
items.get = id => items.find(i => i.id === id);
const actor = {
  id:'a1', uuid:'Actor.a1', name:'Riley', img:'riley.png', isOwner:true,
  prototypeToken:{ texture:{ src:'token.png' } },
  flags:{ 'fate-aspect-widget': { characterSheetCustomFields:[{id:'cf',label:'Debt',type:'number',value:3}] } },
  getFlag(scope,key){ return this.flags?.[scope]?.[key]; },
  items,
  system:{
    aspects:{ hc:{name:'High Concept',value:'Occult detective',description:'<p>Core identity</p>',notes:'<i>Always curious</i>'} },
    skills:{ notice:{name:'Notice',rank:3}, hidden:{name:'Secret',rank:9,hidden:true} },
    stunts:{ keen:{name:'Keen Eye',linked_skill:'Notice',attack:false,defend:true,description:'<p>Sharp sight</p>'} },
    tracks:{ physical:{name:'Physical',enabled:true,box_values:[false,true],label:'escalating',description:'<p>Body stress</p>',notes:'<p>Track note</p>',recovery_type:'Fleeting',recovery_conditions:'<p>Catch breath</p>'}, mild:{name:'Mild',enabled:true,box_values:[false],harm_can_absorb:2,aspect:{when_marked:true,name:'Bruised'},when_marked:'<p>Name the consequence</p>'} },
    details:{
      fatePoints:{current:2,refresh:3,boosts:1},
      pronouns:{value:'they/them'},
      description:{value:'<p>Description</p>'}, biography:{value:'Bio'},
      notes:{GM:true,value:'GM SECRET'}
    }
  }
};
const modelPrefs = normaliseSheetPrefs({ favorites:{aspects:['hc'],skills:['notice'],stunts:['keen']} });
const playerModel = buildSheetModel(actor, modelPrefs, {isGM:false});
assert.equal(playerModel.notesVisible, false);
assert.equal(playerModel.notes, '', 'GM-only notes must not enter player sheet context');
assert.equal(playerModel.skills.length, 1, 'hidden system skills stay hidden');
assert.equal(playerModel.skills[0].favorite, true);
assert.equal(playerModel.stressTracks.length, 1);
assert.equal(playerModel.consequenceTracks.length, 1);
assert.equal(playerModel.customFields[0].label, 'Debt');
assert.equal(playerModel.favorites.length, 3);
assert.equal(playerModel.extras[0].description, '<b>Fast</b>');
assert.equal(playerModel.aspects[0].descriptionText, 'Core identity', 'native aspect description must survive the custom sheet projection');
assert.equal(playerModel.aspects[0].notesText, 'Always curious', 'native aspect notes must survive the custom sheet projection');
assert.equal(playerModel.stressTracks[0].descriptionText, 'Body stress', 'native track description must be available');
assert.equal(playerModel.stressTracks[0].notesText, 'Track note', 'native track notes must be available');
assert.equal(playerModel.stressTracks[0].recoveryConditionsText, 'Catch breath', 'native recovery conditions must be available');
assert.equal(playerModel.consequenceTracks[0].whenMarkedText, 'Name the consequence', 'native when-marked text must be available');
assert.equal(playerModel.fatePoints.boosts, 1, 'native boosts count must be carried into the custom sheet');
const gmModel = buildSheetModel(actor, modelPrefs, {isGM:true});
assert.equal(gmModel.notesVisible, true);
assert.equal(gmModel.notes, 'GM SECRET');


// Legacy/native sheet compatibility: old note shapes must remain visible.
const legacyActor = {
  ...actor,
  system: {
    ...actor.system,
    stunts: { legacy:{name:'Old Stunt', description:'', notes:'<p>Kept stunt note</p>'} },
    details: {
      ...actor.system.details,
      notes: '<p>Legacy actor note</p>'
    }
  }
};
const legacyModel = buildSheetModel(legacyActor, normaliseSheetPrefs({}), {isGM:true});
assert.equal(legacyModel.notes, '<p>Legacy actor note</p>', 'direct legacy actor notes must survive the new sheet');
assert.equal(legacyModel.stunts[0].notesText, 'Kept stunt note', 'legacy stunt notes must not be masked by an empty description');
assert.equal(legacyModel.stunts[0].descriptionText, '', 'empty stunt description must stay empty instead of stealing notes');

const sourceFallbackActor = {
  ...actor,
  system: { ...actor.system, details:{ ...actor.system.details, notes:{GM:false,value:''} } },
  _source: { system:{ details:{ notes:{GM:false,value:'<p>Source note</p>'} } } }
};
const sourceFallbackModel = buildSheetModel(sourceFallbackActor, normaliseSheetPrefs({}), {isGM:true});
assert.equal(sourceFallbackModel.notes, '<p>Source note</p>', 'source legacy notes must be used when prepared value is empty');

// Artwork must survive ordinary auto-submit even if ApplicationV2 supplies blank image fields.
const blankArtworkForm = { object:{ img:'', 'prototypeToken.texture.src':'' } };
preserveSheetArtworkFormData(actor, blankArtworkForm);
assert.equal(blankArtworkForm.object.img, 'riley.png', 'blank form img must not erase the actor portrait');
assert.equal(blankArtworkForm.object['prototypeToken.texture.src'], 'token.png', 'blank form token art must not erase prototype token artwork');
const explicitArtworkForm = { object:{ img:'new-portrait.png', prototypeToken:{texture:{src:'new-token.png'}} } };
preserveSheetArtworkFormData(actor, explicitArtworkForm);
assert.equal(explicitArtworkForm.object.img, 'new-portrait.png', 'explicit portrait changes must be preserved');
assert.equal(explicitArtworkForm.object.prototypeToken.texture.src, 'new-token.png', 'explicit token artwork changes must be preserved');


// Init registration is selectable, not forced as the default system sheet.
context.foundry.applications.apps.DocumentSheetConfig.registerSheet = (documentClass, scope, sheetClass, options) => registrations.push({documentClass, scope, sheetClass, options});
assert.ok(hooks.init, 'character sheet init hook must be registered');
hooks.init();
assert.equal(registeredSettings.length, 1);
assert.equal(registeredSettings[0].scope, 'fate-aspect-widget');
assert.equal(registeredSettings[0].key, 'characterSheetPreferences');
assert.equal(registeredSettings[0].config.scope, 'user', 'layout preferences must be per-user');
assert.equal(registrations.length, 1);
assert.equal(registrations[0].scope, 'fate-aspect-widget');
assert.deepEqual(Array.from(registrations[0].options.types), ['fate-core-official']);
assert.equal(registrations[0].options.makeDefault, false, 'new sheet must remain opt-in on first release');
assert.equal(registrations[0].options.canBeDefault, true);

console.log('character-sheet.test.cjs OK');
