(() => {
  function create({
    clone,
    outcomeFor,
    boostOpportunityFor,
    renderResolvedBlock,
    appendActionAudit,
    makeAuditEntry,
    signed
  } = {}) {
    function compute({ request = {}, opposition = null, flags = {}, gmUserId = "" } = {}) {
      const rollTotal = Number(flags.lastResolvedRollTotal);
      const difference = opposition?.total === null || opposition?.total === undefined
        ? null
        : rollTotal - Number(opposition.total);
      const ruleContext = {
        createMode: request.createMode,
        defendedAgainst: request.defendedAgainst,
        defendedCreateMode: request.defendedCreateMode
      };
      const outcome = difference === null ? null : outcomeFor(request.actionType, difference, ruleContext);
      const boostOpportunity = difference === null ? null : boostOpportunityFor(request.actionType, difference, opposition, ruleContext);
      const flavor = renderResolvedBlock(request, opposition, rollTotal, { claimed:false }, {
        actorName: flags.actorName,
        math: flags.currentMath,
        history: flags.rollHistory || []
      });

      const nextFlags = clone(flags);
      delete nextFlags.damageResolution;
      nextFlags.oppositionHidden = Boolean(opposition?.hidden);
      nextFlags.oppositionActorUuid = opposition?.hidden ? null : (opposition?.actorUuid || null);
      nextFlags.oppositionMessageId = opposition?.hidden ? null : (opposition?.messageId || null);
      nextFlags.outcome = outcome?.key ?? null;
      nextFlags.boostOpportunity = boostOpportunity;
      nextFlags.boostClaimed = false;
      nextFlags.createdBoostId = null;
      nextFlags.boostActorUuid = null;
      nextFlags.boostName = null;
      nextFlags.createdAspectClaimed = false;
      nextFlags.createdSceneAspect = null;
      nextFlags.contextResultApplied = null;
      nextFlags.auditTrail = appendActionAudit(
        nextFlags.auditTrail || [],
        makeAuditEntry(
          "opposition",
          "Оппозиция изменена",
          opposition?.hidden ? "Новая оппозиция скрыта мастером" : `Новая оппозиция: ${signed(opposition?.total)}`,
          {
            userId: gmUserId,
            fingerprint: `opposition:${request.id}:${opposition?.hidden ? "hidden" : (opposition?.messageId || opposition?.total)}:${opposition?.hidden ? "hidden" : "public"}`
          }
        )
      );
      delete nextFlags.oppositionTotal;
      delete nextFlags.difference;
      if (!opposition?.hidden && opposition?.total !== null && opposition?.total !== undefined) {
        nextFlags.oppositionTotal = Number(opposition.total);
        nextFlags.difference = difference;
      }

      return Object.freeze({ rollTotal, difference, outcome, boostOpportunity, flavor, nextFlags });
    }

    return Object.freeze({ compute });
  }

  globalThis.FateToolkitOppositionRefreshCompute = Object.freeze({ create });
})();
