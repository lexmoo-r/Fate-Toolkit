const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const editor=read('scripts/character-editors.js'),css=read('styles/character-editors.css');
const tpl=read('templates/character-sheet.hbs'),dock=read('scripts/unified-dock.js');
assert.match(editor,/fte-field-label/, 'Field captions are isolated from native label CSS');
assert.match(editor,/fte-skill-row/, 'Skills use compact rows');
assert.match(editor,/data-trait-search/, 'Search is present');
assert.match(css,/\.fte-skills[^}]*max-height:/, 'Skill list must have a scrollable height');
assert.match(css,/\.fte-skills[^}]*max-height:/);
assert.match(css,/\.fte-pyramid-shell\{[^}]*flex:none!important/,'ladder can be collapsed without resizing the list');
assert.match(css,/overflow-y:(auto|scroll)!important/, 'Scrollable editor rows');
assert.doesNotMatch(tpl,/data-action="setupCampaignWorldSkills"/, 'World mechanics may not live on actor sheet');
assert.match(dock,/data-world-traits/);
assert.match(dock,/data-actor-profile/);
assert.doesNotMatch(tpl.slice(tpl.indexOf('<header class="fts-header">'),tpl.indexOf('</header>')),/fts-native-refresh/, 'native stunt reserve must not compete with Will in campaign header');
for(const lang of ['en','ru']){const l=JSON.parse(read('lang/'+lang+'.json'));assert.equal(l['FAW.Campaign.StuntRefresh'],'Резерв трюков');assert.equal(l['FAW.Campaign.PcLabel'],'Игровой');}
console.log('ui-editor-layout.test.cjs OK');
