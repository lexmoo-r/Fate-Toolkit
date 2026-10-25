const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const moduleJson = JSON.parse(read('module.json'));
assert.ok(moduleJson.styles.includes('styles/layout-overhaul.css'), 'layout overhaul stylesheet must be registered');
assert.ok(moduleJson.styles.includes('styles/layout-overhaul.css'), 'layout overhaul stylesheet must remain installed');
assert.equal(moduleJson.styles.at(-1), 'styles/unified-dock.css', 'new unified dock must load last');
assert.ok(moduleJson.styles.indexOf('styles/component-audit.css') < moduleJson.styles.indexOf('styles/layout-overhaul.css'), 'component audit must load before final layout corrections');

const sheet = read('templates/character-sheet.hbs');
assert.match(sheet, /class="fts-tab-set" role="tablist"/, 'sheet tab group must use tablist semantics');
assert.ok((sheet.match(/role="tab"/g) || []).length >= 2, 'Play and Story must be semantic tabs');
assert.ok((sheet.match(/role="tabpanel"/g) || []).length >= 2, 'sheet tab content must use tabpanel semantics');
assert.match(sheet, /role="tab"[^>]*aria-selected=/, 'sheet tabs must expose selected state');
assert.match(sheet, /data-action="openActionWidget"/, 'Action Center action must remain available');
const tabSet = sheet.match(/<div class="fts-tab-set"[\s\S]*?<\/div>/)?.[0] || '';
assert.ok(!tabSet.includes('openActionWidget'), 'Action Center must not masquerade as a sheet tab');
assert.match(sheet, /class="fts-portrait profile-img fco_popviewable"[^>]*data-edit="img"[^>]*data-action="editImage"/, 'portrait must use Foundry/Fate Core Official image-edit markup');
assert.match(sheet, /class="fts-portrait profile-img fco_popviewable"[^>]*alt="{{actor.name}}"/, 'portrait needs accessible alternate text');
assert.match(sheet, /data-action="toggleFavorite"[^>]*aria-pressed=/, 'favorites must expose pressed state');
assert.match(sheet, /data-action="toggleTrackBox"[^>]*aria-pressed=/, 'track boxes must expose pressed state');
assert.match(sheet, /data-action="toggleExtra"[^>]*aria-pressed=/, 'Extra toggle must expose pressed state');
assert.match(sheet, /data-action="toggleSectionWide"[^>]*aria-pressed=/, 'layout width toggle must expose pressed state');
assert.match(sheet, /data-action="setTheme"[^>]*aria-pressed=/, 'theme choices must expose selected state');
assert.match(sheet, /data-density="comfortable"/, 'sheet must offer the comfortable density profile');
assert.match(sheet, /data-sheet-search="skills"[^>]*aria-controls="fts-list-skills"/, 'search must identify the filtered list');
assert.match(sheet, /data-sheet-search-status="skills"[^>]*aria-live="polite"/, 'search result status must be a live region');
assert.ok((sheet.match(/fts-empty-state/g) || []).length >= 6, 'core sheet sections must use structured empty states');
assert.match(sheet, /class="is-danger" data-action="deleteCustomField"/, 'destructive custom-field action must be visibly dangerous');

const widget = read('templates/widget.hbs');
assert.match(widget, /data-action="toggle-aspect-favorite"[^>]*aria-pressed=/, 'aspect favorite toggle must expose state');
assert.match(widget, /data-action="toggle-game-hidden"[^>]*aria-pressed=/, 'aspect visibility toggle must expose state');
assert.ok((widget.match(/faw-empty-state/g) || []).length >= 4, 'aspect widget empty rows must use the shared empty-state component');

const workflow = read('templates/workflow-center.hbs');
assert.match(workflow, /data-fwc-action="toggle-gm-focus"[^>]*aria-pressed=/, 'GM focus toggle must expose state');
assert.match(workflow, /fwc-inline-empty/, 'workflow quiet states need a structured empty component');

const milestoneManager = read('templates/milestone-manager.hbs');
assert.ok((milestoneManager.match(/data-fms-type=[^>]*aria-pressed=/g) || []).length >= 3, 'milestone type selector must be a toggle group');
const milestonePlayer = read('templates/milestone-player.hbs');
assert.match(milestonePlayer, /data-fms-goto-step[^>]*aria-current=/, 'wizard progress must expose the current step');

const main = read('scripts/main.js');
assert.match(main, /setAttribute\("aria-pressed", visible \? "true" : "false"\)/, 'section filters must update aria-pressed with their state');
const sheetJs = read('scripts/character-sheet.js');
assert.match(sheetJs, /\["standard", "compact", "comfortable"\]/, 'character-sheet preference normalizer must accept comfortable density');
assert.match(sheetJs, /data-sheet-search-status/, 'sheet search binding must update result feedback');
assert.match(sheetJs, /classList\.toggle\("is-filter-empty"/, 'sheet search must expose the no-results state');

const css = read('styles/component-audit.css');
assert.match(css, /--faw-component-target:\s*32px/, 'desktop icon target must be standardized to 32px');
assert.match(css, /--faw-component-target-compact:\s*30px/, 'compact icon target must remain usable');
assert.match(css, /--faw-component-meta-size:\s*max\(\.72rem, 11px\)/, 'metadata readability floor missing');
assert.match(css, /@media \(hover: none\), \(pointer: coarse\)/, 'coarse-pointer target adaptation missing');
assert.match(css, /--faw-component-target:\s*40px/, 'touch target must reach 40px');
assert.match(css, /\.fts-empty-state/, 'shared sheet empty state missing');
assert.match(css, /\[aria-pressed="true"\]/, 'stateful control styling must follow semantic state');

const audit = read('docs/UI-COMPONENT-AUDIT-v1.41.md');
for (const reference of ['D&D5e', 'Tidy 5e', 'PF2e', 'Fate Core Official']) {
  assert.ok(audit.includes(reference), `component audit must document ${reference} comparison`);
}
assert.ok(audit.includes('Fate Points'), 'component audit must document the Fate-specific meter decision');

console.log('ui-components.test.cjs OK');
