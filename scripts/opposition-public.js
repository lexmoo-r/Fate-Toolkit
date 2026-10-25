(() => {
  function create({ esc, stuntSummaryText, ladderText, signed } = {}) {
    function toPublic(opposition) {
      if (!opposition || opposition.mode === "none") return { mode: "none", hidden: false };
      if (opposition.hidden) {
        // Fail closed: identity, UUIDs, skills, stunts, message ids, math and history
        // are deliberately omitted from the player-visible projection.
        return { mode: opposition.mode, hidden: true, kind: "hidden" };
      }
      return {
        mode: opposition.mode,
        hidden: false,
        total: opposition.total,
        actorName: opposition.actorName,
        actorUuid: opposition.actorUuid,
        skillName: opposition.skillName,
        skillRank: opposition.skillRank,
        stunts: opposition.stunts || [],
        stuntBonus: Number(opposition.stuntBonus) || 0,
        kind: opposition.kind,
        math: opposition.math || null,
        history: opposition.history || [],
        messageId: opposition.messageId || null
      };
    }

    function publicText(opposition) {
      if (!opposition || opposition.mode === "none") return "Без заданной оппозиции";
      if (opposition.hidden) {
        return opposition.mode === "opponent" ? "Оппозиция соперника скрыта мастером" : "Сложность скрыта мастером";
      }
      const stuntText = opposition.stunts?.length ? ` · трюки: ${esc(stuntSummaryText(opposition.stunts))}` : "";
      const rung = ladderText(opposition.total);
      if (opposition.mode === "opponent") {
        return `Соперник: ${esc(opposition.actorName)} · ${esc(opposition.skillName)}${stuntText} · ${signed(opposition.total)}${rung ? ` (${esc(rung)})` : ""}`;
      }
      return `Сложность: ${signed(opposition.total)}${rung ? ` (${esc(rung)})` : ""}`;
    }

    return Object.freeze({ toPublic, publicText });
  }

  globalThis.FateToolkitOppositionPublic = Object.freeze({ create });
})();
