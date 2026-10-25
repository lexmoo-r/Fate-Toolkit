(() => {
  function create({
    parseAnnotations,
    rollSignature,
    snapshotRollMath,
    appendMathHistory,
    numberValue
  } = {}) {
    function touched(change = {}) {
      return Object.prototype.hasOwnProperty.call(change, "rolls")
        || Object.prototype.hasOwnProperty.call(change, "content")
        || Object.prototype.hasOwnProperty.call(change, "flavor");
    }

    function explicitReroll(flavor = "") {
      const annotations = parseAnnotations(flavor);
      return Boolean(annotations?.events?.some(event => String(event?.type || "").startsWith("reroll")));
    }

    function player(message, change, flags = {}) {
      if (!touched(change) || !message?.rolls?.length) return { ok:false };
      const roll = message.rolls[0];
      const total = Number(roll.total);
      if (Number.isNaN(total)) return { ok:false };
      const signature = rollSignature(roll);
      const explicit = explicitReroll(message.flavor);
      if (!explicit && flags.lastResolvedRollSignature && signature === flags.lastResolvedRollSignature) return { ok:false };
      if (!explicit && !flags.lastResolvedRollSignature && total === flags.lastResolvedRollTotal) return { ok:false };
      const math = snapshotRollMath(roll, {
        skillName: flags.skillName,
        skillRank: flags.skillRank,
        stunts: flags.stunts || [],
        stuntBonus: flags.stuntBonus,
        previousSnapshot: flags.currentMath || null,
        previousSources: flags.modifierSources || [],
        flavor: message.flavor
      });
      const history = appendMathHistory(flags.rollHistory || [], math);
      return { ok:true, roll, total, signature, explicit, math, history };
    }

    function opposition(message, change, flags = {}) {
      if (!touched(change) || !message?.rolls?.length) return { ok:false };
      const roll = message.rolls[0];
      const signature = rollSignature(roll);
      const explicit = explicitReroll(message.flavor);
      if (!explicit && flags.lastOppositionRollSignature && signature === flags.lastOppositionRollSignature) return { ok:false };
      const math = snapshotRollMath(roll, {
        skillName: flags.oppositionSkillName,
        skillRank: flags.oppositionSkillRank,
        stunts: flags.stunts || [],
        stuntBonus: flags.stuntBonus,
        previousSnapshot: flags.oppositionMath || null,
        previousSources: flags.oppositionMath?.modifierSources || [],
        flavor: message.flavor
      });
      const history = appendMathHistory(flags.oppositionHistory || [], math);
      return { ok:true, roll, total:numberValue(roll.total), signature, explicit, math, history };
    }

    return Object.freeze({ touched, player, opposition });
  }

  globalThis.FateToolkitRollRevision = Object.freeze({ create });
})();
