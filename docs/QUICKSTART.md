# Fate Toolkit — quick start

This file mirrors the in-app contextual help for maintainers. Players should normally use the `?` button in the relevant Toolkit window.

1. Select an actor and optional target in **Fate Action**.
2. Choose Attack, Overcome, Create Advantage, or Defend. Repeated actions reuse the visible remembered skill; Shift-click configures from scratch.
3. Resolve opposition and the roll. Use explicit invokes/rerolls; applicable stunts are never silently selected.
4. Resolve stress/consequences if an attack hits. The conflict cannot advance past unresolved damage.
5. Use **Action Center** for pending decisions, especially in GM Focus mode.
6. Use **Aspects** for game/scene/character aspects, boosts, consequences, free invokes, pins, filters, and drag/drop.
7. Use **Milestones** to announce and track group advancement.

## 1.0.1 release diagnostics

- `socketlib >= 1.1.3` is a required dependency for authenticated state-changing RPC.
- After upgrading, a GM can run the non-destructive live check with:
  `await game.modules.get("fate-aspect-widget").api.runIntegrationSmoke()`
- For a brief real ChatMessage/whisper round-trip, use `{ documents: true }`; the temporary message is deleted in `finally`.
- Hidden opposition details are intentionally absent from public result/request flags. GM-private workflow state is kept in a browser-local cache rather than User flags.
- The GM-private cache survives reload/reconnect in the same browser, but is intentionally not synchronized across browsers or devices.
