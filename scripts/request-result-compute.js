(() => {
  function create({
    numberValue,
    outcomeFor,
    boostOpportunityFor,
    renderResolvedBlock,
    clone,
    appendActionAudit,
    makeAuditEntry,
    compactMathFormula,
    signed,
    actionLabel
  } = {}) {
    function compute({
      payload = {}, request = {}, opposition = null, previousFlags = {}, actor = {}, skill = {},
      validatedStunts = [], stunts = [], skillRank = 0, stuntBonus = 0, roll = {}, math = {}, history = [], gmUserId = ""
    } = {}) {
      const actorName = String(actor.name || previousFlags.actorName || "Персонаж");
      const rollTotal = numberValue(roll.total);
      const difference = !opposition || opposition.total === null || opposition.total === undefined
        ? null
        : rollTotal - Number(opposition.total);
      const ruleContext = {
        createMode: request.createMode,
        defendedAgainst: request.defendedAgainst,
        defendedCreateMode: request.defendedCreateMode
      };
      const outcome = difference === null ? null : outcomeFor(request.actionType, difference, ruleContext);
      const boostOpportunity = difference === null ? null : boostOpportunityFor(request.actionType, difference, opposition, ruleContext);
      const flavor = renderResolvedBlock(request, opposition, rollTotal, { claimed: false }, { actorName, math, history });

      let auditTrail = Array.isArray(previousFlags.auditTrail) ? clone(previousFlags.auditTrail) : [];
      if (math?.revisionType && math.revisionType !== "initial") {
        const revisionType = String(math.revisionType).startsWith("reroll") ? "reroll" : "roll";
        auditTrail = appendActionAudit(auditTrail, makeAuditEntry(
          revisionType,
          math.revisionLabel || "Изменение броска",
          compactMathFormula(math),
          {
            userId: payload.userId,
            fingerprint: `revision:${request.id}:${math.revisionType}:${math.diceSignature}:${math.total}:${history.length}`
          }
        ));
      }

      const publicResultDetail = difference === null
        ? "Без оппозиции"
        : opposition?.hidden
          ? `${outcome?.title || "Результат"} · оппозиция скрыта мастером`
          : `${outcome?.title || "Результат"} · ${signed(rollTotal)} против ${signed(opposition.total)} = ${signed(difference)} сдвига`;
      auditTrail = appendActionAudit(auditTrail, makeAuditEntry(
        "result",
        `${actionLabel(request.actionType)}: ${outcome?.title || "результат"}`,
        publicResultDetail,
        {
          userId: gmUserId,
          fingerprint: `result:${request.id}:${payload.rollSignature || math?.diceSignature}:${opposition?.hidden ? "hidden" : opposition?.total}:${outcome?.key || "none"}`
        }
      ));

      const flagUpdate = {
        requestId: request.id,
        targetUserId: payload.userId,
        actorUuid: actor.uuid || previousFlags.actorUuid || null,
        actorName,
        oppositionHidden: Boolean(opposition?.hidden),
        oppositionActorUuid: opposition?.hidden ? null : (opposition?.actorUuid || null),
        oppositionMessageId: opposition?.hidden ? null : (opposition?.messageId || null),
        skillName: skill.name,
        skillRank,
        stuntKeys: validatedStunts.map(stunt => stunt.key),
        stunts,
        stuntBonus,
        modifierSources: math.modifierSources || [],
        currentMath: math,
        rollHistory: history,
        auditTrail,
        actionType: request.actionType,
        createMode: request.createMode ?? null,
        defendedAgainst: request.defendedAgainst ?? null,
        defendedCreateMode: request.defendedCreateMode ?? null,
        origin: request.origin ?? previousFlags.origin ?? null,
        sceneId: request.sceneId ?? previousFlags.sceneId ?? null,
        title: request.title,
        actionTarget: request.actionTarget ?? previousFlags.actionTarget ?? null,
        resolved: true,
        lastResolvedRollTotal: Number(rollTotal),
        lastResolvedRollSignature: payload.rollSignature || `${Number(rollTotal)}`,
        outcome: outcome?.key ?? null,
        boostOpportunity,
        boostClaimed: false,
        createdBoostId: null,
        boostActorUuid: null,
        boostName: null,
        createdAspectClaimed: false,
        createdSceneAspect: null,
        contextResultApplied: null
      };
      if (!opposition?.hidden && opposition?.total !== null && opposition?.total !== undefined) {
        flagUpdate.oppositionTotal = Number(opposition.total);
        flagUpdate.difference = difference;
      }

      return Object.freeze({ actorName, rollTotal, difference, outcome, boostOpportunity, flavor, auditTrail, flagUpdate });
    }

    return Object.freeze({ compute });
  }

  globalThis.FateToolkitRequestResultCompute = Object.freeze({ create });
})();
