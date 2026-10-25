(() => {
  function create({
    getMessage,
    getUser,
    actorFromUuid,
    currentRollActorUuid,
    canUserControlActor,
    invocationLockedByDamage,
    getActorCombatState,
    locateInvokeSource,
    consumeResource,
    buildRerolledRoll,
    serializeAdjustedRoll,
    currentRollTotal,
    appendAuditFlavor,
    invokeAuditLine,
    updateMessage,
    refreshMathState = null,
    appendAudit,
    notify,
    moduleId
  } = {}) {
    for (const [name, fn] of Object.entries({ getMessage, getUser, actorFromUuid, currentRollActorUuid, canUserControlActor, invocationLockedByDamage, getActorCombatState, locateInvokeSource, consumeResource, buildRerolledRoll, serializeAdjustedRoll, currentRollTotal, appendAuditFlavor, invokeAuditLine, updateMessage, appendAudit, notify })) {
      if (typeof fn !== "function") throw new Error(`FateToolkitInvokeResolution requires ${name}`);
    }
    if (!moduleId) throw new Error("FateToolkitInvokeResolution requires moduleId");
    function fail(message) { return { ok:false, message }; }

    async function prepare(payload = {}) {
      const message = getMessage(payload.messageId);
      if (!message?.rolls?.length) return fail("Сообщение броска не найдено.");
      const flags = message.flags?.[moduleId] ?? {};
      if (!(flags.resolved || flags.actionOppositionFor)) return fail("Этот бросок ещё нельзя модифицировать.");
      if (flags.contextResultApplied) return fail("Результат уже применён к аспекту и зафиксирован.");
      if (invocationLockedByDamage(message)) return fail("Урон уже начали поглощать. Сначала отмените отмеченный стресс/последствия.");
      if (!['plus2','reroll'].includes(payload.mode)) return fail("Неизвестный режим призыва аспекта.");

      const user = getUser(payload.userId);
      const rollActor = await actorFromUuid(currentRollActorUuid(message));
      if (!user || !rollActor || !canUserControlActor(user, rollActor)) return fail("У пользователя нет права изменять этот бросок.");
      if (!user.isGM) {
        const expectedUserId = flags.actionOppositionFor ? flags.oppositionUserId : flags.targetUserId;
        if (!expectedUserId || String(expectedUserId) !== String(user.id)) return fail("Этот результат принадлежит другому участнику.");
      }
      const combatState = !flags.actionOppositionFor ? getActorCombatState(rollActor.uuid) : null;
      if (combatState?.acted) return fail("Ход уже завершён: результат зафиксирован.");

      const source = await locateInvokeSource(message, payload.sourceId, payload.userId);
      if (!source) return fail("Аспект больше недоступен или скрыт.");
      return { ok:true, payload, message, flags, user, rollActor, source, useFree:Boolean(payload.useFree) };
    }

    async function commit(checked) {
      if (!checked?.ok || !checked.message || !checked.source) return fail("Не удалось применить призыв аспекта.");
      const { payload, message, source, useFree } = checked;
      let undoResource = null;
      try {
        undoResource = await consumeResource(message, source, useFree);
        const rolls = payload.mode === "reroll"
          ? [await buildRerolledRoll(message)]
          : [serializeAdjustedRoll(message.rolls[0], currentRollTotal(message) + 2)];
        const flavor = appendAuditFlavor(message.flavor, invokeAuditLine(source, payload.mode, useFree));
        await updateMessage(message, { rolls, flavor });
        if (typeof refreshMathState === "function") await refreshMathState(message, { roll: rolls[0], flavor });
        await appendAudit(message, {
          type:payload.mode === "reroll" ? "reroll" : "invoke",
          label:payload.mode === "reroll" ? "Призыв: переброс" : "Призыв аспекта",
          detail:`«${source.name}» · ${useFree ? "бесплатный призыв" : "1 Волю"}${payload.mode === "reroll" ? " · 4dF переброшены" : " · +2"}`,
          userId:payload.userId
        });
        undoResource = null;
        notify();
        return { ok:true };
      } catch (error) {
        if (undoResource) {
          try { await undoResource(); } catch (_) {}
        }
        return fail(error?.message || "Не удалось применить призыв аспекта.");
      }
    }

    return Object.freeze({ prepare, commit });
  }

  globalThis.FateToolkitInvokeResolution = Object.freeze({ create });
})();
