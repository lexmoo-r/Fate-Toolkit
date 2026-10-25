(() => {
  function create({
    findSkill,
    rememberSkill,
    validateStuntSelection,
    stuntBonusTotal,
    snapshotRollMath,
    rollFormula,
    postOppositionRoll,
    currentUserId
  } = {}) {
    function fail(message, level = "error") {
      return { ok: false, level, message };
    }

    async function resolve({ proposal = {}, targetActor = null, oppositionAction = "defend", result = {} } = {}) {
      const skill = findSkill(targetActor, result.skillName);
      if (!skill) return fail("Выбранный навык оппозиции больше недоступен.");

      await rememberSkill(targetActor, oppositionAction, skill.name);
      const stunts = validateStuntSelection(targetActor, Array.from(result.stuntKeys || []), skill.name, oppositionAction);
      const stuntBonus = stuntBonusTotal(stunts);
      const passiveExtraBonus=globalThis.FateToolkitExtras?.rollBonus?.(targetActor,oppositionAction,skill.name) || 0;
      const roll = await rollFormula(`4dF + ${skill.rank} + ${stuntBonus} + ${passiveExtraBonus}`);
      const oppositionMath = snapshotRollMath(roll, {
        skillName: skill.name,
        skillRank: skill.rank,
        stunts,
        stuntBonus,
        flavor: ""
      });
      const oppositionMessage = await postOppositionRoll?.({
        roll,
        proposal,
        targetActor,
        skill,
        stunts,
        stuntBonus,
        oppositionMath
      });
      const stuntsPublic = stunts.map(stunt => ({ key: stunt.key, name: stunt.name, bonus: stunt.bonus, linkedSkill: stunt.linkedSkill }));

      return {
        ok: true,
        opposition: {
          total: Number(roll.total),
          hidden: false,
          mode: "opponent",
          kind: "roll",
          actorId: targetActor.id,
          actorUuid: targetActor.uuid,
          actorName: targetActor.name,
          skillName: skill.name,
          skillRank: skill.rank,
          stuntKeys: stunts.map(stunt => stunt.key),
          stunts: stuntsPublic,
          stuntBonus,
          math: oppositionMath,
          history: [oppositionMath],
          messageId: oppositionMessage?.id || null,
          oppositionUserId: String(currentUserId?.() || ""),
          label: targetActor.name
        }
      };
    }

    return Object.freeze({ resolve });
  }

  globalThis.FateToolkitPlayerOppositionRoll = Object.freeze({ create });
})();
