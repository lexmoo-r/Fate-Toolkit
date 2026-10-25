(() => {
  function create({
    resolveProposalTargetActor,
    gmOppositionTargetOptions,
    proposalTargetForOpponentRef,
    actorSkills,
    findSkill,
    validateStuntSelection,
    oppositionActionType,
    stuntBonusTotal,
    snapshotRollMath,
    rollFormula,
    postOppositionRoll
  } = {}) {
    async function prepare(proposal = {}) {
      const originalTargetActor = await resolveProposalTargetActor(proposal);
      const candidateRows = Array.from(gmOppositionTargetOptions(proposal) || []);
      const candidateByRef = new Map(candidateRows.map(row => [String(row.ref), row.actor]));
      const oppositionAction = oppositionActionType(proposal);

      let initialTargetRef = "";
      if (proposal?.target?.type === "token" && proposal.target.tokenId) initialTargetRef = `token:${proposal.target.tokenId}`;
      else if (proposal?.target?.type === "actor" && proposal.target.actorId) initialTargetRef = `actor:${proposal.target.actorId}`;

      // Preserve a target which resolves to an actor even when its exact token ref is not
      // currently available (for example, a token on another viewed scene).
      if (originalTargetActor && !candidateByRef.has(initialTargetRef)) {
        const fallbackRef = `actor:${originalTargetActor.id}`;
        if (!candidateByRef.has(fallbackRef)) {
          const row = { ref: fallbackRef, name: originalTargetActor.name, actor: originalTargetActor };
          candidateRows.unshift(row);
          candidateByRef.set(fallbackRef, originalTargetActor);
        }
        initialTargetRef = fallbackRef;
      }

      const hasOriginalActor = Boolean(originalTargetActor && actorSkills(originalTargetActor).length);
      const targetText = proposal.target?.type === "marker"
        ? `${proposal.target.name}${proposal.target.meta ? ` · ${proposal.target.meta}` : ""}`
        : (proposal.target?.name || "без выбранной цели");

      return Object.freeze({
        originalTargetActor,
        candidateRows,
        candidateByRef,
        oppositionAction,
        initialTargetRef,
        hasOriginalActor,
        initialMode: hasOriginalActor ? "roll" : "fixed",
        targetText
      });
    }

    function fail(message, level = "error") {
      return { ok: false, level, message };
    }

    async function resolve(proposal = {}, result = {}, prepared = null) {
      if (!prepared?.candidateByRef) return fail("Не удалось подготовить оппозицию.");
      const mode = String(result.mode || "fixed");

      if (mode === "none") {
        return { ok: true, opposition: { total: null, hidden: false, mode: "none", label: "Без оппозиции" }, assignedTarget: null };
      }

      if (mode === "fixed") {
        const difficulty = Number(result.difficulty);
        return {
          ok: true,
          opposition: {
            total: Number.isFinite(difficulty) ? difficulty : 0,
            hidden: Boolean(result.hidden),
            mode: "fixed",
            label: proposal.target?.name || "Сложность"
          },
          assignedTarget: null
        };
      }

      if (mode !== "roll" && mode !== "rank") return fail("Неизвестный режим оппозиции.");

      const chosenActor = prepared.candidateByRef.get(String(result.targetRef || "")) ?? null;
      const chosenTarget = proposalTargetForOpponentRef(String(result.targetRef || ""), proposal);
      if (!chosenActor || !chosenTarget) return fail("Для активной оппозиции выберите цель.");

      const skill = findSkill(chosenActor, result.skillName);
      if (!skill) return fail("Выберите навык цели для оппозиции.");

      const stunts = validateStuntSelection(
        chosenActor,
        Array.from(result.stuntKeys || []),
        skill.name,
        prepared.oppositionAction
      );
      const stuntBonus = stuntBonusTotal(stunts);
      const stuntsPublic = stunts.map(stunt => ({ key: stunt.key, name: stunt.name, bonus: stunt.bonus, linkedSkill: stunt.linkedSkill }));

      const passiveExtraBonus=globalThis.FateToolkitExtras?.rollBonus?.(chosenActor,prepared.oppositionAction,skill.name) || 0;
      let total = Number(skill.rank) + Number(stuntBonus) + passiveExtraBonus;
      let oppositionMath = {
        skillName: skill.name,
        skillRank: skill.rank,
        diceValues: [],
        diceTotal: 0,
        diceSignature: "[]",
        stunts: stuntsPublic,
        stuntBonus,
        modifierSources: [],
        extraBonus: passiveExtraBonus,
        total,
        revisionType: "initial",
        revisionLabel: mode === "rank" ? "Пассивно по навыку" : "Первый бросок"
      };
      let messageId = null;

      if (mode === "roll") {
        const roll = await rollFormula(`4dF + ${skill.rank} + ${stuntBonus} + ${passiveExtraBonus}`);
        oppositionMath = snapshotRollMath(roll, {
          skillName: skill.name,
          skillRank: skill.rank,
          stunts,
          stuntBonus,
          flavor: ""
        });
        const message = await postOppositionRoll?.({
          roll,
          proposal,
          chosenActor,
          skill,
          stunts,
          stuntBonus,
          oppositionMath,
          hidden: Boolean(result.hidden)
        });
        total = Number(roll.total);
        messageId = message?.id || null;
      }

      return {
        ok: true,
        assignedTarget: proposal.target ? null : chosenTarget,
        opposition: {
          total,
          hidden: Boolean(result.hidden),
          mode: "opponent",
          kind: mode,
          actorId: chosenActor.id,
          actorUuid: chosenActor.uuid,
          actorName: chosenActor.name,
          skillName: skill.name,
          skillRank: skill.rank,
          stuntKeys: stunts.map(stunt => stunt.key),
          stunts: stuntsPublic,
          stuntBonus,
          math: oppositionMath,
          history: [oppositionMath],
          messageId,
          oppositionUserId: globalThis.game?.user?.id || null,
          label: chosenActor.name
        }
      };
    }

    return Object.freeze({ prepare, resolve });
  }

  globalThis.FateToolkitActionOpposition = Object.freeze({ create });
})();
