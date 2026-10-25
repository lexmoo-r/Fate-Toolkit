const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'scripts/character-sheet.js'), 'utf8');
const sheet = fs.readFileSync(path.join(root, 'templates/character-sheet.hbs'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles/character-sheet.css'), 'utf8');
const ru = JSON.parse(fs.readFileSync(path.join(root, 'lang/ru.json'), 'utf8'));
const en = JSON.parse(fs.readFileSync(path.join(root, 'lang/en.json'), 'utf8'));

for (const action of [
  'editSkills','manageAspects','manageTracks','addStunt','editStunt','deleteStunt','rollStunt',
  'runStuntMacro','openStuntMacro','toggleStuntBox','openStuntDatabase','addStuntToDatabase',
  'uploadAllStunts','rollSkill','rollTrack','addExtra','deleteExtra','syncTokenName','saveFramework','applyFramework'
]) {
  assert.match(js, new RegExp(`${action}: this\\._`), `action ${action} must be registered`);
  assert.match(sheet, new RegExp(`data-action="${action}"`), `sheet must expose ${action}`);
}

const ownEditors = fs.readFileSync(path.join(root, 'scripts/character-editors.js'), 'utf8');
for (const kind of ['skills','aspects','stunts','tracks']) {
  assert.ok(js.includes(`FateToolkitEditors?.editActor?.(this.document,'${kind}')`), `own ${kind} editor must be invoked`);
  assert.ok(ownEditors.includes(`system.${'${kind}'}`) || ownEditors.includes(`system.${kind}`), `own ${kind} editor must persist to native source data`);
}
for (const nativeClass of ['StuntDB','FateCharacterDefaults']) {
  assert.ok(js.includes(`resolveFateGlobal("${nativeClass}")`), `existing ${nativeClass} integration must remain available`);
}
assert.match(js, /Hooks\.call\("dropActorSheetData"/, 'custom sheet must preserve Fate Core Official cross-sheet drop behavior');
assert.match(sheet, /data-fco-drag-type="skill"/, 'skills must be draggable with native payloads');
assert.match(sheet, /data-fco-drag-type="aspect"/, 'aspects must be draggable with native payloads');
assert.match(sheet, /data-fco-drag-type="stunt"/, 'stunts must be draggable with native payloads');
assert.match(sheet, /data-fco-drag-type="track"/, 'tracks must be draggable with native payloads');
assert.match(sheet, /system\.tracks\.\{\{this\.key\}\}\.notes/, 'track notes must remain editable like the native sheet');
assert.match(sheet, /system\.aspects\.\{\{this\.key\}\}\.notes/, 'aspect notes must remain editable like the native sheet');
assert.match(sheet, /system\.override\.active/, 'GM override controls must remain available');
assert.match(css, /\.faw-native-editor/, 'native parity editors must receive Toolkit sizing and localization styling');
assert.equal(ru['FAW.Sheet.EditStunt'], 'Редактировать трюк');
assert.equal(en['FAW.Sheet.EditStunt'], 'Редактировать трюк', 'Toolkit fallback must stay Russian independent of system language');

assert.match(js, /system\.tracks.*system\.stunts/s, 'Extra dragging must preserve actor-side track and stunt state before transfer');
assert.match(js, /item\.update\(\{ type: "Extra", "system\.tracks": trackUpdates, "system\.stunts": stuntUpdates \}/, 'embedded Extra drag must sync current actor state back to the Extra');
assert.match(js, /Semantic relabeling by stable field\/action selectors/, 'native editor Russianization must not depend only on the system language');
assert.match(js, /#save_entity_track.*Сохранить трек/s, 'track editor controls must receive semantic Russian labels');
console.log('v148-parity.test.cjs OK');
