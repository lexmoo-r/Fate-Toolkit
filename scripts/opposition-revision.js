(() => {
  function create({
    getRequest,
    getUser,
    getMessage,
    waitForMessage,
    messageAuthorId,
    actorFromUuid,
    canUserControlActor,
    findSkill,
    oppositionActionType,
    validateStuntSelection,
    stuntBonusTotal,
    snapshotRollMath,
    appendMathHistory,
    numberValue,
    moduleId
  } = {}) {
    async function rebuild(payload = {}) {
      const request = getRequest(payload.requestId);
      if (!request) return { ok:false, pending:true };

      const userId = payload.initiatorUserId || request.targets?.[0]?.userId;
      if (!userId || !request.targets?.some(row => String(row?.userId || "") === String(userId))) return { ok:false };
      const opposition = request.oppositionByUser?.[userId];
      if (!opposition || opposition.mode !== "opponent" || opposition.kind !== "roll") return { ok:false };
      if (opposition.messageId && String(opposition.messageId) !== String(payload.messageId)) return { ok:false };

      const message = getMessage(payload.messageId) ?? await waitForMessage(payload.messageId);
      if (!message?.rolls?.length) return { ok:false };
      const flags = message.flags?.[moduleId] ?? {};
      if (String(flags.actionOppositionFor || "") !== String(request.id)) return { ok:false };
      if (flags.oppositionInitiatorUserId && String(flags.oppositionInitiatorUserId) !== String(userId)) return { ok:false };

      const oppositionUserId = String(flags.oppositionUserId || "");
      if (!oppositionUserId || (payload.oppositionUserId && String(payload.oppositionUserId) !== oppositionUserId)) return { ok:false };
      const opposingUser = getUser(oppositionUserId);
      const authorId = messageAuthorId(message);
      if (authorId && String(authorId) !== oppositionUserId) return { ok:false };

      const opposingActor = await actorFromUuid(flags.oppositionActorUuid);
      if (!opposingUser || !opposingActor || !canUserControlActor(opposingUser, opposingActor)) return { ok:false };
      if (opposition.actorUuid && String(opposition.actorUuid) !== String(opposingActor.uuid || "")) return { ok:false };

      const skill = findSkill(opposingActor, flags.oppositionSkillName);
      if (!skill) return { ok:false };
      const actionType = oppositionActionType({
        actionType: request.actionType,
        defendedAgainst: request.defendedAgainst,
        defendedCreateMode: request.defendedCreateMode
      });
      const validatedStunts = validateStuntSelection(opposingActor, flags.stuntKeys || [], skill.name, actionType);
      const stuntBonus = stuntBonusTotal(validatedStunts);
      const roll = message.rolls[0];
      const math = snapshotRollMath(roll, {
        skillName: skill.name,
        skillRank: skill.rank,
        stunts: validatedStunts,
        stuntBonus,
        previousSnapshot: flags.oppositionMath || opposition.math || null,
        previousSources: flags.oppositionMath?.modifierSources || opposition.math?.modifierSources || [],
        flavor: message.flavor
      });
      const history = appendMathHistory(flags.oppositionHistory || opposition.history || [], math);
      const rebuilt = {
        ...opposition,
        total: numberValue(roll.total, opposition.total),
        math,
        history,
        messageId: message.id,
        oppositionUserId,
        actorId: opposingActor.id,
        actorUuid: opposingActor.uuid,
        actorName: opposingActor.name,
        skillName: skill.name,
        skillRank: skill.rank,
        stuntKeys: validatedStunts.map(stunt => stunt.key),
        stunts: validatedStunts.map(stunt => ({ key: stunt.key, name: stunt.name, bonus: stunt.bonus, linkedSkill: stunt.linkedSkill })),
        stuntBonus
      };

      return { ok:true, request, userId, message, opposition:rebuilt };
    }

    return Object.freeze({ rebuild });
  }

  globalThis.FateToolkitOppositionRevision = Object.freeze({ create });
})();
