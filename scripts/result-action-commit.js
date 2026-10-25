(() => {
  function create({
    adjustAspectFreeInvokes,
    removeAspectSource,
    removeAspectMarker,
    addSceneAspect,
    updateMessage,
    appendAudit,
    recordConflictEvent
  } = {}) {
    for (const [name, fn] of Object.entries({ adjustAspectFreeInvokes, removeAspectSource, removeAspectMarker, addSceneAspect, updateMessage, appendAudit, recordConflictEvent })) {
      if (typeof fn !== "function") throw new Error(`FateToolkitResultActionCommit requires ${name}`);
    }

    async function contextual({ payload, checked } = {}) {
      if (!payload || !checked?.message || !checked?.opportunity) {
        return { ok: false, message: "Нельзя применить действие из этого результата." };
      }
      const { message, opportunity } = checked;
      let result = null;

      if (opportunity.kind === "add-invokes") {
        result = await adjustAspectFreeInvokes(opportunity.source, opportunity.amount, opportunity.name);
        if (!result) return { ok: false, message: "Не удалось добавить бесплатное призывание аспекту." };
      } else if (opportunity.kind === "remove-source") {
        result = await removeAspectSource(opportunity.source, opportunity.name);
        if (!result) return { ok: false, message: "Не удалось удалить преодолённый аспект." };
        if (opportunity.markerId) {
          await removeAspectMarker(opportunity.markerId, opportunity.sceneId, { confirm: false });
        }
      } else if (opportunity.kind === "remove-marker") {
        const removed = await removeAspectMarker(opportunity.markerId, opportunity.sceneId, { confirm: false });
        if (!removed) return { ok: false, message: "Не удалось удалить маркер преодолённого аспекта." };
        result = { kind: "marker", name: opportunity.name };
      } else {
        return { ok: false, message: "Неизвестное действие результата." };
      }

      const applied = {
        kind: opportunity.kind,
        name: opportunity.name,
        amount: opportunity.amount || 0,
        result,
        at: Date.now(),
        userId: payload.userId
      };
      await updateMessage(message, { contextResultApplied: applied });
      await appendAudit(message, {
        type: "aspect",
        label: opportunity.kind === "add-invokes" ? "Бесплатные призывания добавлены" : "Аспект преодолён",
        detail: opportunity.kind === "add-invokes"
          ? `«${opportunity.name}» · +${opportunity.amount}`
          : `«${opportunity.name}» удалён`,
        userId: payload.userId,
        fingerprint: `context-result:${message.id}:${opportunity.kind}:${opportunity.name}:${opportunity.amount}`
      });
      return { ok: true, applied, result };
    }

    async function createdAspect({ payload, checked } = {}) {
      if (!payload || !checked?.message || !checked?.flags || !checked?.opportunity || !checked?.actor || !checked?.name) {
        return { ok: false, message: "Нельзя создать аспект из этого результата." };
      }
      const { message, flags, opportunity, actor, name } = checked;
      const created = await addSceneAspect(flags.sceneId, name, opportunity.freeInvokes, { sourceMessageId: message.id });
      if (!created) return { ok: false, message: "Не удалось создать аспект сцены." };

      await updateMessage(message, {
        createdAspectClaimed: true,
        createdSceneAspect: created
      });
      await appendAudit(message, {
        type: "aspect",
        label: "Аспект создан",
        detail: `«${created.name}» · бесплатных призываний: ${created.freeInvokes}`,
        userId: payload.userId,
        fingerprint: `created-aspect:${message.id}:${created.id}`
      });
      try {
        await recordConflictEvent({
          type: "aspect",
          actorUuid: actor.uuid,
          actorName: actor.name,
          text: `${actor.name}: создан аспект «${created.name}» · ${created.freeInvokes} бесплатн. призыв.`,
          messageId: message.id
        });
      } catch (_) {}
      return { ok: true, created };
    }

    return Object.freeze({ contextual, createdAspect });
  }

  globalThis.FateToolkitResultActionCommit = Object.freeze({ create });
})();
