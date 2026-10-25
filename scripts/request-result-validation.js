(() => {
  function create({
    getRequest,
    getUser,
    requestTargetsUser,
    waitForMessage,
    resultBelongsToUser,
    actorFromUuid,
    canUserControlActor,
    findSkill,
    validateStuntSelection,
    stuntBonusTotal,
    numberValue,
    snapshotRollMath,
    sameMathSnapshot,
    appendMathHistory,
    compactHistory,
    moduleId
  } = {}) {
    function fail(message, level = "warn") {
      return { ok: false, level, message };
    }

    async function validate(payload = {}) {
      const request = getRequest(payload.requestId);
      if (!request) return fail(`Запрос ${payload.requestId} не найден у мастера; результат оставлен без сравнения.`);

      const user = getUser(payload.userId);
      if (!user || !requestTargetsUser(request, user.id)) {
        return fail("Отклонён результат от пользователя, которому этот запрос не назначен.");
      }

      const opposition = request.oppositionByUser?.[user.id];
      const message = await waitForMessage(payload.messageId);
      if (!message) return fail("Не удалось найти сообщение броска для разрешения запроса.", "error");

      const previousFlags = message.flags?.[moduleId] ?? {};
      if (previousFlags.requestId && String(previousFlags.requestId) !== String(request.id)) {
        return fail("Отклонён результат: ChatMessage относится к другому запросу.");
      }
      if (previousFlags.targetUserId && String(previousFlags.targetUserId) !== String(user.id)) {
        return fail("Отклонён результат: ChatMessage принадлежит другому пользователю.");
      }
      if (!resultBelongsToUser(message, user.id)) {
        return fail("Отклонён результат: автор ChatMessage не совпадает с назначенным игроком.");
      }

      const actor = await actorFromUuid(payload.actorUuid || previousFlags.actorUuid);
      if (!actor || !canUserControlActor(user, actor)) {
        return fail("Отклонён результат: у пользователя нет прав владельца на персонажа броска.");
      }
      if (previousFlags.actorUuid && actor.uuid && String(previousFlags.actorUuid) !== String(actor.uuid)) {
        return fail("Отклонён результат: персонаж броска не совпадает с ChatMessage.");
      }

      const skillName = String(payload.skillName || previousFlags.skillName || "");
      const skill = findSkill(actor, skillName);
      if (!skill) return fail(`Отклонён результат: у ${actor.name} нет навыка «${skillName}».`);
      const stuntKeys = Array.isArray(payload.stuntKeys) ? payload.stuntKeys : (previousFlags.stuntKeys || []);
      const validatedStunts = validateStuntSelection(actor, stuntKeys, skill.name, request.actionType);
      const stunts = validatedStunts.map(stunt => ({ key: stunt.key, name: stunt.name, bonus: stunt.bonus, linkedSkill: stunt.linkedSkill }));
      const skillRank = numberValue(skill.rank);
      const stuntBonus = stuntBonusTotal(validatedStunts);
      const roll = message.rolls?.[0] ?? null;
      if (!roll) return fail("Отклонён результат: в ChatMessage нет броска.");

      const math = snapshotRollMath(roll, {
        skillName: skill.name,
        skillRank,
        stunts,
        stuntBonus,
        previousSnapshot: previousFlags.currentMath || null,
        previousSources: previousFlags.modifierSources || [],
        flavor: message.flavor
      });
      // Passive extra bonuses are computed independently on the authoritative
      // Actor by the GM; a client may not supply or forge a bonus amount.
      const passiveExtraBonus=globalThis.FateToolkitExtras?.rollBonus?.(actor,request.actionType,skill.name) || 0;
      if (!previousFlags.resolved && Math.abs(numberValue(math.extraBonus) - passiveExtraBonus) > 0.0001) {
        return fail("Отклонён результат: формула первого броска не соответствует навыку, трюкам и действующим дополнениям.");
      }

      let history = Array.isArray(previousFlags.rollHistory) ? previousFlags.rollHistory : [];
      if (!sameMathSnapshot(history.at?.(-1), math)) history = appendMathHistory(history, math);
      else history = compactHistory(history);

      return {
        ok: true,
        request,
        user,
        opposition,
        message,
        previousFlags,
        actor,
        skill,
        validatedStunts,
        stunts,
        skillRank,
        stuntBonus,
        roll,
        math,
        history
      };
    }

    return Object.freeze({ validate });
  }

  globalThis.FateToolkitRequestResultValidation = Object.freeze({ create });
})();
