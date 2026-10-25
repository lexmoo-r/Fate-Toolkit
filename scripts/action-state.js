(() => {
  const MODULE_ID = "fate-aspect-widget";
  const ACTION_DRAFT_FLAG = "persistentActionDraftV1";
  const PENDING_ACTION_FLAG = "persistentPendingActionV1";
  const ACTION_HANDOFF_FLAG = "persistentActionHandoffsV1";
  const ACTION_PREFS_SETTING = "actionSkillPreferences";
  const PRIVATE_LOCAL_USER_FLAGS = new Set([ACTION_DRAFT_FLAG, PENDING_ACTION_FLAG, "persistentOppositionQueueV1"]);

  function create(options = {}) {
    const authenticatedActionProposals = new Map();
    let authenticatedProposalPersistTimer = null;
    let actionDraftPersistTimer = null;

    function cloneUserState(value, fallback = null) {
      try { return foundry.utils.duplicate(value ?? fallback); } catch (_) { return fallback; }
    }

    function userFlag(flag, fallback = null) {
      if (PRIVATE_LOCAL_USER_FLAGS.has(flag)) {
        const local = globalThis.FateToolkitPrivateStorage.readPrivateClientValue(flag, undefined);
        if (local !== undefined) return cloneUserState(local, fallback);
        // Upgrade continuity only: read a legacy synchronized flag if schema-5
        // migration has not yet run on this client. Runtime never writes it back.
        try {
          const legacy = game.user?.getFlag?.(MODULE_ID, flag);
          if (legacy !== undefined) return cloneUserState(legacy, fallback);
        } catch (_) {}
        return cloneUserState(fallback, fallback);
      }
      try { return cloneUserState(game.user?.getFlag?.(MODULE_ID, flag), fallback); } catch (_) { return fallback; }
    }

    async function writeUserFlag(flag, value) {
      if (!game.user) return;
      if (PRIVATE_LOCAL_USER_FLAGS.has(flag)) {
        const emptyArray = Array.isArray(value) && value.length === 0;
        globalThis.FateToolkitPrivateStorage.writePrivateClientValue(flag, value === null || value === undefined || emptyArray ? null : cloneUserState(value));
        return;
      }
      try {
        if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) await game.user.unsetFlag(MODULE_ID, flag);
        else await game.user.setFlag(MODULE_ID, flag, value);
      } catch (err) {
        console.warn(`${MODULE_ID} | Unable to persist ${flag}`, err);
      }
    }

    function persistAuthenticatedActionProposals() {
      if (!game.user?.isGM) return;
      if (authenticatedProposalPersistTimer) clearTimeout(authenticatedProposalPersistTimer);
      authenticatedProposalPersistTimer = setTimeout(() => {
        authenticatedProposalPersistTimer = null;
        const rows = [...authenticatedActionProposals.values()].slice(-20).map(row => cloneUserState(row, {}));
        globalThis.FateToolkitPrivateStorage.writePrivateClientRows("authenticatedActionProposals", rows);
      }, 60);
    }

    function rememberAuthenticatedActionProposal(proposal) {
      if (!game.user?.isGM || !proposal?.id) return;
      authenticatedActionProposals.set(String(proposal.id), cloneUserState(proposal, {}));
      persistAuthenticatedActionProposals();
    }

    function trustedActionProposal(proposalId) {
      return authenticatedActionProposals.get(String(proposalId || "")) ?? null;
    }

    function forgetAuthenticatedActionProposal(proposalId) {
      if (!proposalId) return;
      if (authenticatedActionProposals.delete(String(proposalId))) persistAuthenticatedActionProposals();
    }

    function restoreAuthenticatedActionProposals() {
      authenticatedActionProposals.clear();
      const rows = globalThis.FateToolkitPrivateStorage.readPrivateClientRows("authenticatedActionProposals");
      for (const row of rows) if (row?.id) authenticatedActionProposals.set(String(row.id), row);
      return authenticatedActionProposals.size;
    }

    function actionDraftSnapshot() {
      const refs = options.getDraftRefs?.() ?? {};
      return {
        actorRef: String(refs.actorRef || ""),
        targetRef: String(refs.targetRef || ""),
        sceneId: options.currentSceneId?.() ?? canvas?.scene?.id ?? null,
        updatedAt: Date.now()
      };
    }

    function scheduleActionDraftPersist() {
      if (!game.user) return;
      if (actionDraftPersistTimer) clearTimeout(actionDraftPersistTimer);
      actionDraftPersistTimer = setTimeout(() => {
        actionDraftPersistTimer = null;
        void writeUserFlag(ACTION_DRAFT_FLAG, actionDraftSnapshot());
      }, 80);
    }

    function restoreActionDraft() {
      const row = userFlag(ACTION_DRAFT_FLAG, null);
      if (!row || typeof row !== "object") return false;
      const sceneId = options.currentSceneId?.() ?? canvas?.scene?.id ?? null;
      const sameScene = !row.sceneId || row.sceneId === sceneId;
      const next = {
        actorRef: String(row.actorRef || ""),
        targetRef: sameScene ? String(row.targetRef || "") : ""
      };
      options.setDraftRefs?.(next);
      return Boolean(next.actorRef || next.targetRef);
    }

    function pendingActionState() {
      const row = userFlag(PENDING_ACTION_FLAG, null);
      if (!row || typeof row !== "object" || !row.proposal?.id) return null;
      return row;
    }

    async function setPendingAction(proposal, status = "waiting") {
      if (!proposal?.id) return;
      await writeUserFlag(PENDING_ACTION_FLAG, {
        proposal: cloneUserState(proposal, {}),
        status,
        updatedAt: Date.now()
      });
      options.refreshWorkflowCenter?.({ allowAutoOpen: true });
    }

    async function clearPendingAction(proposalId = null) {
      const current = pendingActionState();
      if (proposalId && current?.proposal?.id && current.proposal.id !== proposalId) return;
      await writeUserFlag(PENDING_ACTION_FLAG, null);
      options.refreshWorkflowCenter?.();
    }

    async function persistActionHandoff(targetUserId, payload) {
      if (!game.user?.isGM || !targetUserId || !payload?.request?.id) return false;
      const targetUser = game.users.get(targetUserId);
      if (!targetUser) return false;
      try {
        const current = targetUser.getFlag(MODULE_ID, ACTION_HANDOFF_FLAG);
        const rows = Array.isArray(current) ? foundry.utils.duplicate(current) : [];
        const id = payload.request.id;
        const next = rows.filter(row => row?.request?.id !== id);
        next.push({ ...foundry.utils.duplicate(payload), createdAt: Date.now() });
        await targetUser.setFlag(MODULE_ID, ACTION_HANDOFF_FLAG, next.slice(-10));
        return true;
      } catch (err) {
        console.warn(`${MODULE_ID} | Unable to persist action handoff for ${targetUserId}`, err);
        return false;
      }
    }

    async function removeOwnActionHandoff(requestId) {
      if (!game.user || !requestId) return;
      try {
        const current = game.user.getFlag(MODULE_ID, ACTION_HANDOFF_FLAG);
        if (!Array.isArray(current) || !current.length) return;
        const next = current.filter(row => row?.request?.id !== requestId);
        if (next.length) await game.user.setFlag(MODULE_ID, ACTION_HANDOFF_FLAG, next);
        else await game.user.unsetFlag(MODULE_ID, ACTION_HANDOFF_FLAG);
      } catch (err) {
        console.warn(`${MODULE_ID} | Unable to clear action handoff`, err);
      }
    }

    async function restoreActionHandoffs() {
      const rows = userFlag(ACTION_HANDOFF_FLAG, []);
      if (!Array.isArray(rows) || !rows.length) return 0;
      let handled = 0;
      for (const payload of rows) {
        if (!payload?.request?.id) continue;
        try {
          await options.handleApprovedAction?.(payload);
          handled += 1;
        } catch (err) {
          console.warn(`${MODULE_ID} | Failed to restore approved action ${payload.request.id}`, err);
          break;
        }
      }
      return handled;
    }

    function actionPrefs() {
      try {
        const raw = game.settings.get(MODULE_ID, ACTION_PREFS_SETTING);
        return foundry.utils.duplicate(raw && typeof raw === "object" ? raw : {});
      } catch (_) {
        return {};
      }
    }

    function actorPrefsKey(actor) {
      return String(actor?.id || actor?.uuid || "");
    }

    function actorActionPrefs(actor) {
      const key = actorPrefsKey(actor);
      const all = actionPrefs();
      const row = key ? all[key] : null;
      const usageBySkill = {};
      if (row?.usageBySkill && typeof row.usageBySkill === "object") {
        for (const [name, count] of Object.entries(row.usageBySkill)) {
          const value = Math.max(0, Math.trunc(Number(count) || 0));
          if (name && value) usageBySkill[String(name)] = value;
        }
      }
      return {
        favorites: Array.isArray(row?.favorites) ? [...new Set(row.favorites.map(String))] : [],
        lastByAction: row?.lastByAction && typeof row.lastByAction === "object" ? { ...row.lastByAction } : {},
        recentSkills: Array.isArray(row?.recentSkills) ? [...new Set(row.recentSkills.map(String))].slice(0, 6) : [],
        usageBySkill
      };
    }

    async function setActorActionPrefs(actor, next) {
      const key = actorPrefsKey(actor);
      if (!key) return;
      const all = actionPrefs();
      all[key] = {
        favorites: Array.isArray(next?.favorites) ? [...new Set(next.favorites.map(String))] : [],
        lastByAction: next?.lastByAction && typeof next.lastByAction === "object" ? { ...next.lastByAction } : {},
        recentSkills: Array.isArray(next?.recentSkills) ? [...new Set(next.recentSkills.map(String))].slice(0, 6) : [],
        usageBySkill: next?.usageBySkill && typeof next.usageBySkill === "object" ? { ...next.usageBySkill } : {}
      };
      await game.settings.set(MODULE_ID, ACTION_PREFS_SETTING, all);
    }

    function preferredSkillName(actor, actionType) {
      const saved = String(actorActionPrefs(actor).lastByAction?.[actionType] || "");
      return options.findSkill?.(actor, saved)?.name || "";
    }

    async function rememberSkill(actor, actionType, skillName) {
      if (!actor || !actionType || !skillName) return;
      const prefs = actorActionPrefs(actor);
      const name = String(skillName);
      prefs.lastByAction[actionType] = name;
      prefs.recentSkills = [name, ...prefs.recentSkills.filter(item => item !== name)].slice(0, 6);
      prefs.usageBySkill[name] = Math.max(0, Math.trunc(Number(prefs.usageBySkill[name]) || 0)) + 1;
      await setActorActionPrefs(actor, prefs);
      options.refreshActionWidget?.();
    }

    async function toggleFavoriteSkill(actor, skillName) {
      if (!actor || !skillName) return false;
      const prefs = actorActionPrefs(actor);
      const set = new Set(prefs.favorites.map(String));
      if (set.has(skillName)) set.delete(skillName);
      else set.add(skillName);
      prefs.favorites = [...set];
      await setActorActionPrefs(actor, prefs);
      options.refreshActionWidget?.();
      return set.has(skillName);
    }

    return Object.freeze({
      ACTION_PREFS_SETTING,
      cloneUserState,
      userFlag,
      writeUserFlag,
      rememberAuthenticatedActionProposal,
      trustedActionProposal,
      forgetAuthenticatedActionProposal,
      restoreAuthenticatedActionProposals,
      actionDraftSnapshot,
      scheduleActionDraftPersist,
      restoreActionDraft,
      pendingActionState,
      setPendingAction,
      clearPendingAction,
      persistActionHandoff,
      removeOwnActionHandoff,
      restoreActionHandoffs,
      actionPrefs,
      actorActionPrefs,
      preferredSkillName,
      rememberSkill,
      toggleFavoriteSkill
    });
  }

  globalThis.FateToolkitActionState = Object.freeze({ create, ACTION_PREFS_SETTING });
})();
