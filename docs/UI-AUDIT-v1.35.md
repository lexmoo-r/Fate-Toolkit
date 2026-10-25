# Fate Toolkit UI audit — v1.35

This pass compares the Toolkit against mature Foundry interface patterns rather than copying any one visual style.

## Reference patterns

- **Official D&D5e sheet:** strong persistent identity/resource hierarchy, favorites, compact action affordances, and clear tab ownership.
- **Tidy 5e / Quadrone:** dense lists remain readable because actions are contextual, metadata is secondary, and rows have a stable visual grammar.
- **PF2e / Dorako-style UI:** status and attention states are visible immediately; hover/focus behaviour is standardized instead of being window-specific.
- **Responsive OSE sheets:** the same sheet remains usable as a narrow utility window and as a large second-screen surface.

## Window-by-window findings

| Window | Main issue before v1.35 | v1.35 treatment |
| --- | --- | --- |
| Aspect widget | Powerful but toolbar/list hierarchy was visually flat | Sticky grouped toolbar, clearer open sections, larger row targets, calmer administrative actions |
| Action widget | Long permanent instruction block and weak action hierarchy | Collapsible help, richer four-action tiles, last-skill pills, stronger pending-opposition state |
| Combat tracker | Dense state competed with current-turn attention | Sticky summary/footer, stronger current row, quieter completed rows, consistent badges and warnings |
| Workflow center | Correct information but cards read as generic boxes | Explicit status rails, consistent icon wells, stronger KPI/dashboard grouping |
| Milestones | Functional wizard but visually disconnected from other Toolkit windows | Shared surfaces, stronger hero, circular step markers, sticky resolution controls |
| GM roll request | Form fields lacked a clear workflow order | Step 1 recipients → step 2 action/check, selected-recipient state, sticky send controls |
| Player requests | Empty state and request cards were utilitarian | Icon-led cards, clearer metadata/action split, intentional empty state |
| Sound settings | Four rows were difficult to scan | Outcome-coded dots, grouped labels, standardized file/preview controls |
| Help | Plain list | Hero surface, numbered scannable guidance, consistent related-topic controls |
| Character sheet | Already responsive/customizable but visually separate from Toolkit | Shared rhythm, stronger card headers, subtle accent rails, clearer hover/favorites treatment |

## Interaction rules locked in by this pass

1. Primary action is visually singular; destructive and secondary actions do not compete with it.
2. Icon-only controls have an accessible name.
3. Search fields have explicit accessible labels.
4. All authored template copy is localized; templates contain no Russian-only strings.
5. Focus is always visible for keyboard users.
6. Compact mode may reduce spacing but does not collapse pointer targets below a usable size.
7. Narrow windows reflow instead of forcing horizontal scrolling.
8. High-contrast and reduced-motion preferences receive dedicated CSS behaviour.
9. UI-polish CSS loads last and is treated as a deliberate cross-window presentation layer.
