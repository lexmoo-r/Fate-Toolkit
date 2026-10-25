# Runtime UI Audit — v1.38

This release adds a read-only Foundry-side auditor so static CSS quality is no longer treated as proof of runtime quality.

## Checks

- horizontal overflow at the window root;
- descendants escaping rendered window bounds;
- interactive targets below 28×28 px;
- interactive controls without an accessible name;
- calculated text/background contrast for visible authored text;
- viewport and device-pixel-ratio metadata for reproducible reports.

## Narrow-window hardening

The request and sound forms no longer enforce 540–560 px content widths. Combat and milestone roots can collapse to the available window width. A dedicated 420 px pass simplifies combat rows, stacks milestone choices and forces request actions into a single-column layout. Compact density keeps controls at 30 px rather than shrinking them to 24–26 px.

The auditor intentionally does not resize Foundry windows, modify documents, persist flags or send socket traffic. It measures exactly the UI state that the user wants to validate.
