const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const moduleJson = JSON.parse(fs.readFileSync(path.join(root, 'module.json'), 'utf8'));
assert.equal(moduleJson.version, '1.50.0-preview.9.4');
assert.deepEqual(moduleJson.compatibility, { minimum:'13.351', verified:'13.351', maximum:'13.351' });
const sys = moduleJson.relationships.systems.find(row => row.id === 'fate-core-official');
assert.ok(sys, 'Fate Core Official relationship missing');
assert.deepEqual(sys.compatibility, { minimum:'4.7.13.6', verified:'4.7.13.6', maximum:'4.7.13.6' });
const socketlib = moduleJson.relationships.requires?.find(row => row.id === 'socketlib');
assert.ok(socketlib, 'socketlib hard dependency missing');
assert.equal(socketlib.compatibility?.minimum, '1.1.3');
for (const rel of [...moduleJson.esmodules, ...moduleJson.styles, ...moduleJson.languages.map(row => row.path)]) {
  assert.ok(fs.existsSync(path.join(root, rel)), `manifest references missing file: ${rel}`);
}
for (const rel of moduleJson.esmodules) {
  const source = fs.readFileSync(path.join(root, rel), 'utf8');
  assert.ok(!source.includes('gmDetail'), `public runtime source still contains forbidden hidden audit field: ${rel}`);
}

const mainSource = fs.readFileSync(path.join(root, 'scripts/main.js'), 'utf8');
const rollSource = fs.readFileSync(path.join(root, 'scripts/roll-request.js'), 'utf8');

assert.match(mainSource, /register\(MODULE_ID,\s*["']uiDensityProfile["'][\s\S]*?scope:\s*["']user["']/, 'toolkit density profile must be user-scoped');
assert.match(mainSource, /register\(MODULE_ID,\s*["']uiTextScale["'][\s\S]*?scope:\s*["']user["']/, 'toolkit text scale must be user-scoped');
assert.match(mainSource, /register\(MODULE_ID,\s*["']aspectFavorites["'][\s\S]*?scope:\s*["']user["']/, 'aspect favorites must use Foundry v13 user scope');
assert.match(rollSource, /register\(MODULE_ID,\s*ACTION_PREFS_SETTING[\s\S]*?scope:\s*["']user["']/, 'action skill preferences must use Foundry v13 user scope');
const authoritativeRawSocketPatterns = [];
for (const file of fs.readdirSync(path.join(root, 'scripts')).filter(name => name.endsWith('.js'))) {
  const source = fs.readFileSync(path.join(root, 'scripts', file), 'utf8');
  const rawEmits = [...source.matchAll(/game\.socket\.emit\(SOCKET,\s*\{([\s\S]{0,220}?)}\s*\)/g)];
  for (const match of rawEmits) authoritativeRawSocketPatterns.push({file, body:match[1]});
}
assert.equal(authoritativeRawSocketPatterns.length, 2, 'only non-authoritative raw module socket emits may remain');
assert.ok(authoritativeRawSocketPatterns.some(row => row.file === 'outcome-sounds.js' && /playSound/.test(row.body)), 'sound playback raw socket missing');
assert.ok(authoritativeRawSocketPatterns.some(row => row.file === 'combat-tracker.js' && /fawFlowNotice/.test(row.body)), 'flow notification raw socket missing');

assert.ok(!rollSource.includes('setFlag?.(MODULE_ID, GM_REQUESTS_FLAG'), 'GM-private requests must never return to User.flags');
assert.ok(!rollSource.includes('writeUserFlag(AUTH_ACTION_PROPOSALS_FLAG'), 'authenticated action proposals must remain browser-private');
assert.ok(!rollSource.includes('persistentGmRollRequests'), 'legacy GM request User flag must not be referenced by roll runtime');
assert.ok(!rollSource.includes('persistentAuthenticatedActionProposalsV1'), 'legacy proposal User flag must not be referenced by roll runtime');
const migrations = fs.readFileSync(path.join(root, 'scripts/data-migrations.js'), 'utf8');
const schema = Number(migrations.match(/FAW_CURRENT_DATA_SCHEMA\s*=\s*(\d+)/)?.[1]);
assert.ok(schema >= 5, '1.30 must retain the player-private storage migration schema');

const actionStateSource = fs.readFileSync(path.join(root, 'scripts/action-state.js'), 'utf8');
const requestStateSource = fs.readFileSync(path.join(root, 'scripts/request-state.js'), 'utf8');
const milestoneSource = fs.readFileSync(path.join(root, 'scripts/milestones.js'), 'utf8');
assert.ok(!requestStateSource.includes('scheduleUserFlagPersist'), 'player request persistence must not return to synchronized User flags');
assert.ok(!/setFlag\([^\n]*PLAYER_REQUESTS_FLAG/.test(requestStateSource), 'player request queue must not be written to User flags');
assert.ok(!/setFlag\([^\n]*DRAFTS_FLAG/.test(milestoneSource), 'milestone drafts must remain browser-private');
for (const key of ['persistentActionDraftV1','persistentPendingActionV1','persistentOppositionQueueV1']) {
  assert.ok(actionStateSource.includes(key), `private action state key missing: ${key}`);
}
assert.match(rollSource, /request:\s*publicRequest/, 'durable handoff must store the sanitized public request');
assert.match(rollSource, /opposition:\s*makePublicOpposition\(opposition\)/, 'durable handoff public request must project opposition through the privacy boundary');



const uiDiagnosticSource = fs.readFileSync(path.join(root, 'scripts/ui-runtime-diagnostic.js'), 'utf8');
assert.ok(moduleJson.esmodules.includes('scripts/ui-runtime-diagnostic.js'), 'runtime UI diagnostic missing from manifest');
assert.match(uiDiagnosticSource, /module\.api\.runUiDiagnostic/, 'runtime UI diagnostic API missing');
assert.ok(!uiDiagnosticSource.includes('game.socket.emit'), 'runtime UI diagnostic must remain local/read-only');

const multiClientIndex = moduleJson.esmodules.indexOf('scripts/multi-client-diagnostic.js');
const smokeIndex = moduleJson.esmodules.indexOf('scripts/smoke.js');
assert.ok(multiClientIndex >= 0 && smokeIndex >= 0 && multiClientIndex < smokeIndex, 'multi-client diagnostic must load before smoke API');
const multiClientSource = fs.readFileSync(path.join(root, 'scripts/multi-client-diagnostic.js'), 'utf8');
assert.match(multiClientSource, /executeForUsers\(CLIENT_PROBE_CHANNEL/, 'multi-client diagnostic must probe real remote users through authenticated RPC');
assert.match(multiClientSource, /executeAsGM\(GM_ECHO_CHANNEL/, 'client probe must perform authenticated player-to-GM round-trip');
assert.ok(!multiClientSource.includes('game.socket.emit'), 'multi-client diagnostic must not bypass authenticated RPC');
assert.match(multiClientSource, /runMultiClientDiagnostic/, 'multi-client diagnostic module API missing');


const characterSheetSource = fs.readFileSync(path.join(root, 'scripts/character-sheet.js'), 'utf8');
assert.ok(moduleJson.esmodules.includes('scripts/character-sheet.js'), 'custom character sheet module missing from manifest');
assert.ok(moduleJson.styles.includes('styles/character-sheet.css'), 'custom character sheet stylesheet missing from manifest');
assert.ok(moduleJson.styles.includes('styles/ui-polish.css'), 'cross-window UI polish missing');
assert.ok(moduleJson.styles.includes('styles/layout-overhaul.css'), 'layout overhaul stylesheet must be registered');
assert.ok(moduleJson.styles.includes('styles/layout-overhaul.css'), 'layout overhaul stylesheet must load');
assert.ok(moduleJson.styles.indexOf('styles/component-audit.css') < moduleJson.styles.indexOf('styles/layout-overhaul.css'), 'component audit must load before the final layout correction layer');
assert.match(characterSheetSource, /scope:\s*["']user["']/, 'character sheet layout preferences must use user scope');
assert.match(characterSheetSource, /DocumentSheetConfig\.registerSheet\([\s\S]*?makeDefault:\s*false/, 'custom character sheet must be opt-in for its first release');
assert.match(characterSheetSource, /types:\s*\[["']fate-core-official["']\]/, 'custom sheet must only register for Fate Core Official actors');
assert.ok(!characterSheetSource.includes('setFlag(FATE_SHEET_MODULE_ID, FATE_SHEET_PREFS_KEY'), 'personal sheet layout must not be stored on Actor flags');
const sheetTemplate = fs.readFileSync(path.join(root, 'templates/character-sheet.hbs'), 'utf8');
assert.doesNotMatch(sheetTemplate, /data-action=["']actionAttack["']/, 'duplicate actions must be removed from sheet');
assert.doesNotMatch(sheetTemplate, /data-action=["']actionCreate["']/, 'duplicate actions must be removed from sheet');
assert.match(sheetTemplate, /data-sheet-search=["']skills["']/, 'custom sheet skill search missing');
assert.match(sheetTemplate, /data-action=["']toggleFavorite["']/, 'custom sheet favorites missing');
assert.match(sheetTemplate, /draggable=["']true["'] data-layout-section=/, 'personal layout drag-and-drop affordance missing');
assert.match(sheetTemplate, /data-action=["']editCustomField["']/, 'custom field definition editor missing');
assert.match(characterSheetSource, /_bindLayoutDrag\(/, 'personal layout drag-and-drop handler missing');
assert.match(characterSheetSource, /promptCustomFieldDefinition\(/, 'custom field definition dialog missing');
assert.match(sheetTemplate, /data-action=["']setTheme["']/, 'per-user visual theme controls missing');
assert.match(sheetTemplate, /data-sheet-accent/, 'per-user accent picker missing');
assert.match(characterSheetSource, /prefs\.accent = value/, 'accent preference persistence missing');


const localizationSources = [characterSheetSource, sheetTemplate].join('\n');
const sheetLocalizationKeys = [...new Set(localizationSources.match(/FAW\.Sheet\.[A-Za-z0-9_]+/g) || [])];
for (const langPath of ['lang/ru.json','lang/en.json']) {
  const dictionary = JSON.parse(fs.readFileSync(path.join(root, langPath), 'utf8'));
  for (const key of sheetLocalizationKeys) assert.ok(Object.prototype.hasOwnProperty.call(dictionary, key), `${langPath}: missing ${key}`);
}

const templates = fs.readdirSync(path.join(root,'templates')).filter(f => f.endsWith('.hbs'));
for (const file of templates) {
  const source=fs.readFileSync(path.join(root,'templates',file),'utf8');
  const opens=(source.match(/{{#(?:if|each|unless|with)\b/g)||[]).length;
  const closes=(source.match(/{{\/(?:if|each|unless|with)}}/g)||[]).length;
  assert.equal(opens, closes, `${file}: unbalanced Handlebars block count`);
}
console.log('release.test.cjs OK');
