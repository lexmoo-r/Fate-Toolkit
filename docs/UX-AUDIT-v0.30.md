# Fate Toolkit v0.30 — UX audit

Audit target: common play loops, with attention to repeated information and unnecessary modal dialogs.

## Player attacks an NPC

Before v0.30, repeating the same action still reopened the skill chooser even though the remembered skill was already printed on the action button. Create Advantage also always opened a second mode dialog.

v0.30 behavior:
- first use keeps the full skill/stunt chooser;
- later uses reuse the visible remembered skill on a normal click;
- if that skill has applicable stunts, only the stunt chooser remains;
- Shift+click always restores the full skill chooser;
- Create Advantage infers `existing` for an aspect marker and `new` for any other/no target;
- Shift+click restores explicit Create Advantage mode selection;
- Defend always keeps the context dialog because the incoming action changes Fate outcome semantics.

This removes one routine modal from repeated Attack/Overcome/Create actions, and two routine modals from repeated Create Advantage without applicable stunts.

## GM declares a major milestone to the group

Eligible player-owned actors are already selected by default. v0.30 replaces the milestone type `<select>` with direct Minor / Significant / Major buttons. For the usual “major milestone to everyone” case the setup is now: open manager → Major → Start. No re-selecting the five actors and no dropdown interaction is required.

## Deliberately retained friction

The audit does not remove choices that can alter Fate semantics:
- Defend asks what it is defending against;
- applicable stunts are never silently auto-applied;
- active/passive opposition still requires the authoritative resolver;
- stress/consequence absorption remains explicit;
- Shift+click provides an escape hatch whenever the remembered defaults are not wanted.
