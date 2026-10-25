(() => {
  function create({
    getMessage,
    getUser,
    actorFromUuid,
    canUserControlActor,
    getActorCombatState,
    damageResolutionStarted,
    privateOppositionActorUuid,
    moduleId
  } = {}) {
    function fail(message = "", level = "warn", silent = false) {
      return { ok: false, message, level, silent };
    }

    async function prepare(payload = {}) {
      const message = getMessage(payload.messageId);
      if (!message) return fail("", "warn", true);

      const flags = message.flags?.[moduleId] ?? {};
      const opportunity = flags.boostOpportunity;
      if (!flags.resolved || !opportunity || flags.boostClaimed) return fail("", "warn", true);

      const requestingUser = getUser(payload.userId);
      const rollActor = await actorFromUuid(flags.actorUuid);
      if (!requestingUser || !rollActor || !canUserControlActor(requestingUser, rollActor)) return fail("", "warn", true);
      if (!requestingUser.isGM) {
        if (String(flags.targetUserId || "") !== String(requestingUser.id)) return fail("", "warn", true);
        if (opportunity.recipient !== "roller") return fail("", "warn", true);
      }

      const initiatingCombatState = getActorCombatState(flags.actorUuid);
      if (initiatingCombatState?.acted) {
        return fail("Ход уже завершён: результат зафиксирован.");
      }
      if (opportunity.tradeShift && damageResolutionStarted(message)) {
        return fail("Урон уже начали поглощать: сначала отмените отмеченный стресс/последствия, если хотите обменять 1 сдвиг на усиление.");
      }

      const actorUuid = opportunity.recipient === "opponent"
        ? privateOppositionActorUuid(message, flags)
        : flags.actorUuid;
      if (!actorUuid) return fail("Не удалось определить персонажа, которому принадлежит усиление.");

      return { ok: true, message, flags, opportunity, requestingUser, rollActor, actorUuid };
    }

    return Object.freeze({ prepare });
  }

  globalThis.FateToolkitBoostClaimPlan = Object.freeze({ create });
})();
