(() => {
  function create({
    addBoost,
    unnamedBoostName,
    resolvedFlavor,
    replaceBoostBlock,
    boostActionMarkup,
    updateMessage,
    appendAudit,
    actorFromUuid,
    recordConflictEvent,
    moduleId
  } = {}) {
    for (const [name, fn] of Object.entries({ addBoost, unnamedBoostName, resolvedFlavor, replaceBoostBlock, boostActionMarkup, updateMessage, appendAudit, actorFromUuid, recordConflictEvent })) {
      if (typeof fn !== "function") throw new Error(`FateToolkitBoostClaimCommit requires ${name}`);
    }
    if (!moduleId) throw new Error("FateToolkitBoostClaimCommit requires moduleId");

    async function commit({ payload, checked, request = null, opposition = null } = {}) {
      if (!payload || !checked?.message || !checked?.opportunity || !checked?.actorUuid) {
        return { ok: false, message: "Нельзя создать усиление из этого результата." };
      }
      const { message, flags, opportunity, actorUuid } = checked;
      const requestedName = String(payload.name || "").trim();
      const created = await addBoost(actorUuid, requestedName || unnamedBoostName());
      if (!created) return { ok: false, message: "Не удалось добавить усиление персонажу." };

      const flavor = request
        ? resolvedFlavor(request, opposition, flags.lastResolvedRollTotal, { claimed: true, name: created.name }, {
            actorName: flags.actorName,
            math: flags.currentMath,
            history: flags.rollHistory || []
          })
        : replaceBoostBlock(message.flavor, boostActionMarkup(opportunity, { claimed: true, name: created.name }));

      await updateMessage(message, {
        flavor,
        [`flags.${moduleId}.boostClaimed`]: true,
        [`flags.${moduleId}.createdBoostId`]: created.id,
        [`flags.${moduleId}.boostActorUuid`]: created.actorUuid || actorUuid,
        [`flags.${moduleId}.boostName`]: created.name
      });

      await appendAudit(message, {
        type: "boost",
        label: "Усиление создано",
        detail: `«${created.name}»${opportunity.tradeShift ? " · обмен за −1 сдвиг" : ""}`,
        userId: payload.userId,
        fingerprint: `boost:${message.id}:${created.id}`
      });

      try {
        const recipientActor = await actorFromUuid(actorUuid);
        await recordConflictEvent({
          type: "boost",
          actorUuid,
          actorName: recipientActor?.name || "",
          text: `${recipientActor?.name || "Персонаж"}: получено усиление «${created.name}»${opportunity.tradeShift ? " · −1 сдвиг атаки" : ""}`,
          messageId: message.id
        });
      } catch (_) {}

      return { ok: true, created, actorUuid };
    }

    return Object.freeze({ commit });
  }

  globalThis.FateToolkitBoostClaimCommit = Object.freeze({ create });
})();
