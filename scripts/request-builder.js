(() => {
  function create({
    resolveUser,
    actorFromRef,
    findSkill,
    validateStuntSelection,
    oppositionActionType,
    stuntBonusTotal,
    snapshotRollMath,
    rollFormula
  } = {}) {
    function fail(message, level = "error") {
      return { ok: false, level, message };
    }

    async function build(input = {}) {
      const targetIds = Array.from(input.targetIds || []).map(String).filter(Boolean);
      if (!targetIds.length) return fail("Выберите хотя бы одного игрока.", "warn");

      const title = String(input.title || "Проверка").trim() || "Проверка";
      const description = String(input.description || "").trim();
      const actionType = String(input.actionType || "generic");
      const createMode = actionType === "create" ? String(input.createMode || "new") : null;
      const skillName = String(input.skillName || "");
      if (skillName) {
        const missing = targetIds
          .map(userId => resolveUser(userId))
          .filter(user => !findSkill(user?.character, skillName))
          .map(user => user?.name ?? "неизвестный игрок");
        if (missing.length) return fail(`Навык «${skillName}» отсутствует у: ${missing.join(", ")}.`);
      }

      const oppositionMode = String(input.oppositionMode || "fixed");
      const request = {
        id: String(input.id || ""),
        title,
        description,
        actionType,
        createMode,
        skillName,
        oppositionMode,
        sceneId: input.sceneId ?? null,
        createdAt: Number(input.createdAt) || Date.now(),
        createdBy: String(input.createdBy || ""),
        targets: targetIds.map(userId => ({ userId, status: "pending" })),
        oppositionByUser: {}
      };

      if (oppositionMode === "fixed") {
        const difficulty = Number(input.difficulty);
        if (!Number.isFinite(difficulty)) return fail("Некорректная сложность.");
        for (const userId of targetIds) {
          request.oppositionByUser[userId] = {
            total: difficulty,
            hidden: Boolean(input.hideOpposition),
            mode: "fixed",
            label: "Сложность"
          };
        }
      } else if (oppositionMode === "opponent") {
        const opponent = actorFromRef(String(input.opponentActorRef || ""));
        const skill = findSkill(opponent, String(input.opponentSkill || ""));
        if (!opponent || !skill) return fail("Не удалось определить соперника или его навык.");

        const opponentKind = String(input.opponentKind || "roll");
        const opponentStunts = validateStuntSelection(
          opponent,
          Array.from(input.stuntKeys || []),
          skill.name,
          oppositionActionType({ actionType })
        );
        const opponentStuntBonus = stuntBonusTotal(opponentStunts);
        let oppositionMath = {
          skillName: skill.name,
          skillRank: skill.rank,
          diceValues: [],
          diceTotal: 0,
          diceSignature: "[]",
          stunts: opponentStunts.map(stunt => ({ key: stunt.key, name: stunt.name, bonus: stunt.bonus, linkedSkill: stunt.linkedSkill })),
          stuntBonus: opponentStuntBonus,
          modifierSources: [],
          extraBonus: 0,
          total: skill.rank + opponentStuntBonus,
          revisionType: "initial",
          revisionLabel: opponentKind === "roll" ? "Первый бросок" : "Пассивно по навыку"
        };
        let total = skill.rank + opponentStuntBonus;
        if (opponentKind === "roll") {
          const roll = await rollFormula(`4dF + ${skill.rank} + ${opponentStuntBonus}`);
          total = roll.total;
          oppositionMath = snapshotRollMath(roll, {
            skillName: skill.name,
            skillRank: skill.rank,
            stunts: opponentStunts,
            stuntBonus: opponentStuntBonus,
            flavor: ""
          });
        }
        for (const userId of targetIds) {
          request.oppositionByUser[userId] = {
            total,
            hidden: Boolean(input.hideOpponentResult),
            mode: "opponent",
            kind: opponentKind,
            actorId: opponent.id,
            actorUuid: opponent.uuid,
            actorName: opponent.name,
            skillName: skill.name,
            skillRank: skill.rank,
            stuntKeys: opponentStunts.map(stunt => stunt.key),
            stunts: opponentStunts.map(stunt => ({ key: stunt.key, name: stunt.name, bonus: stunt.bonus, linkedSkill: stunt.linkedSkill })),
            stuntBonus: opponentStuntBonus,
            math: oppositionMath,
            history: [oppositionMath],
            label: opponent.name
          };
        }
      } else if (oppositionMode === "none") {
        for (const userId of targetIds) {
          request.oppositionByUser[userId] = { total: null, hidden: false, mode: "none", label: "Без оппозиции" };
        }
      } else {
        return fail("Неизвестный режим оппозиции.");
      }

      return { ok: true, request };
    }

    return Object.freeze({ build });
  }

  globalThis.FateToolkitRequestBuilder = Object.freeze({ create });
})();
