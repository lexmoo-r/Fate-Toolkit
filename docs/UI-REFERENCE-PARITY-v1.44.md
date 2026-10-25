# Fate Toolkit UI reference parity — v1.44

This pass is an element-by-element verification against mature Foundry interfaces. It does not copy their visual skins; it copies interaction patterns where they are demonstrably better, then keeps Fate-specific semantics where those patterns would be misleading.

## Concrete working references

### PF2e

Reference: `foundryvtt/pf2e`, `static/templates/actors/character/sheet.hbs` (reviewed at commit `d0e8e223f1c12ae39b4067db721aa02c73e6e967`).

Observed pattern: the sheet navigation is exposed as a real `tablist`; each destination is a `tab` with `aria-selected`, rather than a row of links that only looks like tabs.

Applied here:
- Play / Story are a `tablist` + `tab` + `tabpanel` set.
- Only the active tab is in the normal tab order (`tabindex=0`); inactive tabs use `-1`.
- Arrow Left / Arrow Right / Home / End move between tabs and activate the destination.
- Action Center remains a separate action and is not falsely presented as a third sheet tab.

### D&D5e

References: `foundryvtt/dnd5e`, `templates/actors/character-header.hbs` and `templates/apps/transform-presets.hbs` (reviewed at commit `14037023a87372688bbb59be99f55fcd3a83318d`).

Observed patterns:
- stateful buttons expose their state with `aria-pressed`;
- icon actions have explicit accessible names;
- related choice controls are grouped instead of being visually related only;
- decorative icons do not become the control's accessible name.

Applied here:
- favorites, visibility, density, theme, focus, stress/consequence boxes and layout toggles use `aria-pressed`;
- icon-only controls keep `aria-label` and every decorative Font Awesome `<i>` is `aria-hidden="true"`;
- filter bars use `role="toolbar"`; action/choice clusters use `role="group"` with a name;
- every Handlebars button is an explicit `type="button"`, avoiding accidental form submission.

### Tidy 5e / Quadrone

Reference: `kgar/foundry-vtt-tidy-5e-sheets`, `src/sheets/quadrone/actor/character-parts/favorites/FavoriteItemGeneric.svelte` (reviewed at commit `7261a2d2daa9ce1cab66abdd89f00e7531d5b616`).

Observed pattern: a dense row has one obvious primary content/action surface; uses, modifier, quantity/range and similar state stay compact and secondary; additional operations are contextual rather than competing with the main action.

Applied here:
- aspect, skill, stunt, extra and chat invoke rows preserve one dominant content/action surface;
- free invokes, Fate Point cost, rank, status and other numeric context are badges/metadata rather than equal-weight buttons;
- destructive and secondary controls remain visually subordinate but keep full hit targets;
- metadata truncates before it can displace row actions.

### Fate Core Official

The installed target system remains the source of truth for Fate concepts and data shape. The Toolkit intentionally does **not** copy HP-like meters or D&D/PF resource assumptions onto Fate Points: Refresh is not a hard maximum. Stress and consequences stay discrete Fate-native tracks, not generic health bars.

## Exhaustive component result

| Component class | Reference pattern | Fate Toolkit result |
| --- | --- | --- |
| Sheet tabs | PF2e semantic navigation | Semantic tabs + roving focus + Arrow/Home/End keyboard navigation |
| Toggle buttons | D&D5e state buttons | `aria-pressed` plus persistent selected styling |
| Icon-only actions | D&D5e named icon controls | Explicit `aria-label`; decorative icon hidden from AT |
| Toolbars | D&D5e grouped controls | Filter/select-all tool rows use `role=toolbar` and a name |
| Choice clusters | D&D5e grouped state controls | Density/theme/action clusters use `role=group` |
| Dense rows | Tidy Quadrone hierarchy | One primary surface, compact metadata, secondary contextual actions |
| Search | mature live filtering pattern | Search owns/relates to its results and reports visible/total where filtering occurs |
| Empty state | mature sheet pattern | Structured icon + message (+ explanation where useful), never an unexplained blank list |
| Dangerous action | mature action hierarchy | Danger is visible before hover; confirmation remains where state loss is material |
| Touch targets | Foundry desktop + touch adaptation | 32px desktop baseline, 30px compact, 38–40px coarse-pointer targets |
| Stress/consequence boxes | stateful discrete pips | Real toggle buttons with strong selected state; no fake progress bar |
| Fate Points | Fate semantics | Number/resource, deliberately **not** a progress meter |
| Favorites | Tidy working-set pattern | Favorites are first-class shortcuts without mutating world ordering |
| Search result count | filter feedback pattern | Character sheet, request target/skill/opponent, stunt and action skill searches expose live visible/total feedback |

## Automated regression contract

`tests/reference-parity.test.cjs` prevents this pass from becoming documentation-only. It checks the actual production templates/scripts for:

- explicit button types;
- decorative-icon hiding and absence of `aria-hidden` on form inputs;
- tab roving focus and keyboard navigation code;
- semantic toolbar/group roles on the audited control clusters;
- live search status hooks in both Handlebars and JS-generated dialogs;
- package/module version agreement.

`tests/ui-components.test.cjs`, `tests/dialog-ui.test.cjs`, `tests/input-modality.test.cjs`, `tests/responsive-hardening.test.cjs` and the runtime UI diagnostic continue to cover the surrounding UI contract.

## What this audit can and cannot prove

The static and integration suites can prove markup/state/interaction contracts and catch regressions. Pixel-level behavior still depends on the actual Foundry client, browser zoom, installed themes and third-party CSS. The built-in `runUiDiagnostic({ highlight: true })` remains the final live check for overflow, hit-target size, accessible names and calculated contrast in a rendered world.
