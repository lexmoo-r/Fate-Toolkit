# Fate Toolkit UI component audit — v1.41

This pass audits components rather than windows. The goal is not to imitate another system's skin, but to reuse mature interaction patterns where they fit Fate.

## Working references

- Foundry D&D5e 6.x character sheet: semantic stateful controls, keyboard-actionable artwork, strong header/resource hierarchy, ApplicationV2 parts and partial rendering.
- Tidy 5e Quadrone: one clear primary action per dense row, compact secondary metadata, favorites as a first-class working set, contextual secondary actions.
- PF2e character sheet: layered navigation, selective presentation of meaningful state, scrollable working regions, dense status presentation without exposing every edit control at once.
- Fate Core Official: Fate-native concepts and data shape: aspects, skills, stunts, tracks, extras, per-user presentation preferences.

## Component decisions

| Component | Decision in Fate Toolkit |
| --- | --- |
| Tabs | Real `tablist` / `tab` / `tabpanel`; Action Center remains a separate action, not a fake third tab. |
| Portrait | Real button with accessible name; uses Foundry's native image edit action. |
| Fate Points | Kept as a number/resource, not a progress meter: Fate Points may exceed Refresh, so a conventional meter would be semantically false. |
| Toggle buttons | `aria-pressed` on favorites, visibility, layout width/visibility, density/theme, extras, stress/consequence boxes, milestone type and GM focus. |
| Dense rows | One visually dominant action/content surface; secondary controls stay contextual but have a full hit target. |
| Icon controls | Minimum 32px desktop target (30px compact); 38–40px on coarse pointers. |
| Metadata | May be visually quieter, but not microscopic: shared minimum around 11px/.72rem. |
| Search | Connected to the filtered list with `aria-controls`; live `visible/total` feedback; native clear behavior retained. |
| Empty state | Icon + clear message + optional explanation instead of bare leftover text. |
| Destructive action | Danger treatment is visible before hover, not only after pointer discovery. |
| Stress / consequence boxes | Exposed as stateful toggle buttons with clear pressed state and enlarged target. |
| Responsive layout | Tab action remains distinct from sheet tabs; metadata truncates before it pushes actions off-screen. |
| Drag layout | Mouse drag remains, with Move Up/Down controls as the keyboard alternative. |

## Deliberate non-copies

- D&D-style HP/resource meters are not used for Fate Points because Refresh is not a hard maximum.
- PF2e's many sheet tabs are not reproduced: Fate's working set is smaller, so Play / Story plus the separate Action Center is faster.
- Tidy's compact rows are used as a hierarchy model, not as a reason to hide Fate aspects or consequence text needed during play.
- Fate Core Official's legacy small icon controls are retained conceptually but receive larger targets and explicit accessible state.

## Regression contract

`tests/ui-components.test.cjs` freezes the component rules above: semantic tabs, toggle state, accessible icon controls, component target scale, search feedback, empty states, danger actions, touch targets, and the component audit stylesheet loading last.
