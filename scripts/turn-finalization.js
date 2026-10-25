(() => {
  function create({
    canUserOwnActor,
    pendingDamageForActor,
    nextUnacted,
    setCurrent,
    getMessage,
    appendAudit,
    recordConflictEvent,
    unknownLabel,
    eventText,
    systemId,
    moduleId
  } = {}) {
    for (const [name, fn] of Object.entries({ canUserOwnActor, pendingDamageForActor, nextUnacted, setCurrent, getMessage, appendAudit, recordConflictEvent, unknownLabel, eventText })) {
      if (typeof fn !== "function") throw new Error(`FateToolkitTurnFinalization requires ${name}`);
    }
    if (!systemId || !moduleId) throw new Error("FateToolkitTurnFinalization requires systemId and moduleId");

    function fail(message, code = "invalid") { return { ok:false, message, code }; }

    async function prepare({ combat, combatantId, user, messageId = null, allowPendingDamage = false } = {}) {
      if (!combat || !combatantId || !user) return fail("Ход больше недоступен.");
      const combatant = combat.combatants?.get?.(combatantId) ?? null;
      if (!combatant?.actor) return fail("Участник конфликта больше недоступен.");
      if (!user.isGM) {
        if (combat.combatant?.id !== combatant.id) return fail("Сейчас не ход этого персонажа.", "not-current");
        if (!canUserOwnActor(user, combatant.actor)) return fail("Нет права завершить ход этого персонажа.", "forbidden");
      }
      const pending = pendingDamageForActor(combatant.actor.uuid, combat) ?? null;
      if (pending && !allowPendingDamage && !user.isGM) return fail("Сначала нужно закрыть непоглощённый удар.", "pending-damage");
      const message = messageId ? getMessage(messageId) : null;
      if (messageId) {
        if (!message) return fail("Карточка результата больше недоступна.", "invalid-message");
        const flags = message.flags?.[moduleId] ?? {};
        if (flags.resolved !== true || String(flags.actorUuid || "") !== String(combatant.actor.uuid || "")) {
          return fail("Карточка результата не относится к текущему ходу.", "invalid-message");
        }
        if (!user.isGM && String(flags.targetUserId || "") !== String(user.id)) {
          return fail("Карточка результата принадлежит другому участнику.", "invalid-message");
        }
      }
      const next = nextUnacted(combat, combatant.id);
      return { ok:true, combat, combatant, user, messageId, message, pending, next };
    }

    async function commit(checked) {
      if (!checked?.ok || !checked.combat || !checked.combatant || !checked.user) return fail("Нельзя завершить ход.");
      const { combat, combatant, user, message, messageId, next } = checked;
      await combatant.setFlag(systemId, "hasActed", true);

      if (message) {
        await message.update({ [`flags.${moduleId}.turnFinalized`]: true });
        await appendAudit(message, {
          type:"turn",
          label:"Ход завершён",
          detail:combatant.name ?? combatant.actor?.name ?? unknownLabel(),
          userId:user.id
        });
      }

      try {
        const name = combatant.name ?? combatant.actor?.name ?? unknownLabel();
        await recordConflictEvent({
          type:"turn",
          actorUuid:combatant.actor?.uuid ?? null,
          actorName:name,
          text:eventText(name),
          messageId
        }, combat);
      } catch (_) {}

      if (next) await setCurrent(combat, next.id, { notify:true });
      else await combat.update({ turn:null });
      return { ok:true, nextId:next?.id ?? null };
    }

    return Object.freeze({ prepare, commit });
  }

  globalThis.FateToolkitTurnFinalization = Object.freeze({ create });
})();
