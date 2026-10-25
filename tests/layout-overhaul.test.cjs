const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const moduleJson = JSON.parse(read('module.json'));
const ru = JSON.parse(read('lang/ru.json'));
const css = read('styles/layout-overhaul.css');
const widgetCss = read('styles/widget.css');
const actionTpl = read('templates/action-widget.hbs');
const sheetTpl = read('templates/character-sheet.hbs');
const milestoneManager = read('templates/milestone-manager.hbs');
const milestonePlayer = read('templates/milestone-player.hbs');
const sheetJs = read('scripts/character-sheet.js');

assert.equal(moduleJson.version, '1.50.0-preview.9.3');
assert.ok(moduleJson.styles.includes('styles/layout-overhaul.css'), 'prior window layout corrections must remain installed');
assert.ok(moduleJson.styles.indexOf('styles/layout-overhaul.css') < moduleJson.styles.indexOf('styles/compact-actions.css'), 'new compact action widget must override old large window settings');
assert.match(css, /container-type:\s*inline-size/, 'Foundry child windows need container-based responsiveness');
assert.ok((css.match(/@container/g) || []).length >= 5, 'layout layer needs several real-window breakpoints');

// Screenshot regression: Action Center controls.
assert.match(actionTpl, /faw-action-label-spacer/, 'actor and target label rows must reserve equal control height');
assert.match(css, /\.fate-action-widget \.faw-action-choice[\s\S]*min-height:\s*78px\s*!important/, 'quick actions must have a readable minimum height');
assert.match(css, /overflow-wrap:\s*anywhere/, 'long translated labels must be allowed to wrap safely');
assert.match(css, /grid-template-rows:\s*32px 38px 38px/, 'actor and target selector stacks must align vertically');

// Screenshot regression: boost fixed invoke is a compact icon/count with tooltip only.
assert.doesNotMatch(widgetCss, /одноразовое/i, 'Russian one-use copy must never be injected from CSS');
assert.doesNotMatch(css, /одноразовое/i, 'layout CSS must remain language-neutral');
assert.match(sheetTpl + read('templates/widget.hbs'), /FAW\.BoostInvokeFixed/, 'single invoke must retain an explanatory tooltip/localized label');
assert.match(css, /faw-single-invoke::after\s*\{\s*content:\s*none/, 'single invoke must not grow a pseudo-label');

// Character history must be actual rich text, not HTML inside a textarea.
for (const field of ['system.details.description.value','system.details.biography.value','system.details.notes.value']) {
  assert.ok(new RegExp(`<prose-mirror[^>]*name=[\"']${field.replaceAll('.', '\\.')}[\"']`).test(sheetTpl), `${field} must use Foundry ProseMirror`);
}
assert.doesNotMatch(sheetTpl, /<textarea[^>]+system\.details\.(?:description|biography|notes)/, 'story HTML must not be placed in raw textareas');
assert.match(sheetJs, /enrichHTML/, 'read-only rich text must be enriched before rendering');
assert.match(css, /\.fts-rich-editor[\s\S]*min-height:\s*210px/, 'rich text editor needs usable editing space');

// Character header/layout screenshot regressions.
assert.match(css, /\.fate-toolkit-character-sheet \.fts-portrait-button[\s\S]*width:\s*112px[\s\S]*height:\s*112px/, 'portrait must be large enough to identify the character');
assert.match(read('styles/character-sheet.css'), /\.fts-fate-stat[\s\S]*border-radius:\s*3px/, 'Fate resources must be stable cards, not overflowing pills');
assert.equal(ru['FAW.Sheet.Tracks'], 'Стресс и последствия');
assert.match(sheetTpl, /fts-smart-play-grid/, 'default play layout must opt into independent conceptual columns');
assert.match(sheetJs, /smartPlayLayout/, 'custom user layouts must be allowed to fall back from smart placement');

// Milestones must be language-neutral and wrapping-safe.
assert.doesNotMatch(milestoneManager + milestonePlayer, />\s*Refresh\b|placeholder="None"|>\s*None\s*</, 'milestone templates must not leak English literals');
assert.equal(ru['FMS.Refresh'], 'Восстановление');
assert.equal(ru['FMS.NoLinkedSkill'], 'Не указан');
assert.match(css, /\.fms-window \.fms-actor-pick-meta[\s\S]*flex-wrap:\s*wrap/, 'milestone actor metadata must wrap');
assert.match(css, /\.fms-window \.fms-cant-raise[\s\S]*white-space:\s*normal/, 'milestone legality copy must not be ellipsized');
assert.match(css, /\.fms-window \.fms-wizard-footer button[\s\S]*white-space:\s*normal/, 'milestone buttons must wrap translated labels');

assert.match(sheetJs, /_applySmartPlayColumns\(root\)/, 'smart Fate layout must build independent column stacks after render');
assert.match(sheetJs, /\["aspects", "tracks", "extras"\]/, 'state column grouping missing');
assert.match(sheetJs, /\["skills", "stunts"\]/, 'capabilities column grouping missing');
assert.match(css, /\.fts-smart-column\s*\{[\s\S]*display:\s*grid/, 'smart columns need their own vertical layout context');
assert.doesNotMatch(css, /fts-smart-play-grid > \[data-section="stunts"\][^\n]*grid-row/, 'stunts must not depend on a shared cross-column grid row');
assert.match(widgetCss, /\.fate-aspect-widget \.window-content\s*\{[\s\S]*display:\s*flex[\s\S]*min-height:\s*0/, 'aspect window content must constrain the scroll viewport');
assert.match(widgetCss, /\.fate-aspect-widget \.faw-scroll\s*\{[\s\S]*overflow-y:\s*auto/, 'aspect list must own vertical scrolling');
assert.match(read('scripts/main.js'), /scrollable:\s*\["\.faw-scroll"\]/, 'ApplicationV2 must register the aspect list as scrollable');

console.log('layout-overhaul.test.cjs OK');
