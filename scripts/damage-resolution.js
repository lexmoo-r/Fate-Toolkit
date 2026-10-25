(() => {
  function create({
    getMessage,
    getUser,
    actorFromUuid,
    canUserControlActor,
    damageSpec,
    normalizedDamageState,
    trackHasAspect,
    trackMarked,
    stressCapacity,
    arraysEqual,
    randomId,
    findCombatantForActor,
    getCombat,
    getCurrentCombat,
    updateDamageState,
    appendAudit,
    recordConflictEvent,
    notify,
    willDetails = null,
    willChange = null
  } = {}) {
    for (const [name, fn] of Object.entries({ getMessage, getUser, actorFromUuid, canUserControlActor, damageSpec, normalizedDamageState, trackHasAspect, trackMarked, stressCapacity, arraysEqual, randomId, findCombatantForActor, getCombat, getCurrentCombat, updateDamageState, appendAudit, recordConflictEvent, notify })) {
      if (typeof fn !== "function") throw new Error(`FateToolkitDamageResolution requires ${name}`);
    }

    function fail(message) { return { ok:false, message }; }

    async function authorize(payload = {}, deniedMessage = "Нет права изменять состояние этого персонажа.") {
      const message = getMessage(payload.messageId);
      if (!message) return fail("Результат удара больше недоступен.");
      const spec = damageSpec(message);
      if (!spec || spec.total <= 0) return fail("У этого результата нет непоглощённого удара.");
      const actor = await actorFromUuid(spec.actorUuid);
      const user = getUser(payload.userId);
      if (!actor || !user || !canUserControlActor(user, actor)) return fail(deniedMessage);
      const state = normalizedDamageState(message, spec);
      return { ok:true, payload, message, spec, actor, user, state };
    }

    async function prepareApply(payload = {}) {
      const base = await authorize(payload, "Нет права отмечать стресс этого персонажа.");
      if (!base.ok) return base;
      const { message, spec, actor, user, state } = base;
      if (state.status === "resolved") return fail("Удар уже полностью поглощён.");
      if (state.status === "taken-out") return fail("Персонаж уже выведен из конфликта.");
      if (state.status === "ignored") return fail("Удар отменён ведущим.");
      const isWill = payload.kind === 'will';
      if (isWill && !globalThis.FateToolkitWill?.enabled?.()) return fail('Поглощение Волей доступно только в режиме кампании.');
      const track = isWill ? null : actor.system?.tracks?.[payload.trackKey];
      if (!isWill && (!track || track.enabled === false)) return fail("Выбранный трек больше недоступен.");

      const beforeBoxes = Array.isArray(track?.box_values) ? [...track.box_values] : [];
      const beforeAspectName = String(track?.aspect?.name ?? "");
      const afterBoxes = [...beforeBoxes];
      let afterAspectName = beforeAspectName;
      let capacity = 0;
      const rawLabel = String(track?.name || (isWill ? 'Воля' : 'Трек'));
      const label = globalThis.FateToolkitI18n?.term?.(rawLabel) || rawLabel;
      let name = "";

      if (isWill) {
        if (typeof willDetails !== 'function' || typeof willChange !== 'function') return fail('Обработчик Воли недоступен.');
        const will = willDetails(actor);
        if (!will?.configured) return fail('Сначала настройте Волю персонажа.');
        const amount = Number(payload.amount);
        if (!Number.isInteger(amount) || amount < 1 || amount > 12) return fail('Некорректное количество Воли.');
        if (amount > state.remaining) return fail('Нельзя поглотить больше оставшихся сдвигов.');
        if (amount > will.current) return fail('Недостаточно Воли для поглощения удара.');
        capacity = amount;
      } else if (payload.kind === "stress") {
        if (globalThis.FateToolkitWill?.enabled?.()) return fail("В режиме кампании стресс отменён: используйте последствия или выбывание.");
        if (trackHasAspect(track)) return fail("Этот трек является последствием, а не стрессом.");
        if (state.selections.some(row => row.kind === "stress")) return fail("В одном ударе можно отметить только одну ячейку стресса.");
        const index = Number(payload.boxIndex);
        if (!Number.isInteger(index) || index < 0 || index >= afterBoxes.length || afterBoxes[index]) return fail("Эта ячейка стресса уже занята.");
        capacity = stressCapacity(track, index);
        if (capacity <= 0) return fail("Эта ячейка не поглощает вред.");
        afterBoxes[index] = true;
      } else if (payload.kind === "consequence") {
        if (!trackHasAspect(track)) return fail("Этот трек не является последствием.");
        if (trackMarked(track)) return fail("Это последствие уже занято.");
        capacity = Math.max(0, Number(track.harm_can_absorb) || 0);
        if (!capacity) return fail("У последствия не задана величина поглощения.");
        if (track.aspect?.when_marked) {
          name = String(payload.name || "").trim();
          if (!name) return fail("Введите название последствия.");
          afterAspectName = name;
        } else if (track.aspect?.as_name) {
          name = String(track.name || "Последствие");
        }
        if (afterBoxes.length) {
          const index = afterBoxes.findIndex(value => !value);
          if (index < 0) return fail("Все ячейки этого последствия уже заняты.");
          afterBoxes[index] = true;
        }
      } else {
        return fail("Неизвестный способ поглощения вреда.");
      }

      const actorUpdate = {};
      if (!arraysEqual(beforeBoxes, afterBoxes)) actorUpdate[`system.tracks.${payload.trackKey}.box_values`] = afterBoxes;
      if (afterAspectName !== beforeAspectName) actorUpdate[`system.tracks.${payload.trackKey}.aspect.name`] = afterAspectName;
      if (!isWill && !Object.keys(actorUpdate).length) return fail("Нечего изменять.");

      const selection = {
        id: randomId(), kind: payload.kind, trackKey: payload.trackKey, boxIndex: payload.boxIndex,
        label, name, capacity, beforeBoxes, afterBoxes, beforeAspectName, afterAspectName,
        ...(isWill ? { beforeWill: willDetails(actor).rawCurrent, afterWill: willDetails(actor).rawCurrent - capacity } : {})
      };
      const nextState = { ...state, selections: [...state.selections, selection] };
      const absorbed = nextState.selections.reduce((sum, row) => sum + Math.max(0, Number(row?.capacity) || 0), 0);
      nextState.remaining = Math.max(0, spec.total - absorbed);
      nextState.status = nextState.remaining <= 0 ? "resolved" : "pending";
      return { ok:true, payload, message, spec, actor, user, actorUpdate, selection, nextState };
    }

    async function commitApply(checked) {
      if (!checked?.ok || !checked.actor || !checked.message) return fail("Нельзя применить стресс/последствие.");
      const { payload, message, actor, actorUpdate, selection, nextState } = checked;
      const willEventId = `damage-will:${message.id}:${selection.id}`;
      if (payload.kind === 'will') {
        await willChange(actor, -selection.capacity, willEventId, payload.userId, selection.beforeWill);
      } else {
        await actor.update(actorUpdate);
      }
      try {
        await updateDamageState(message, nextState);
      } catch (error) {
        // Avoid losing Will if a chat-message update fails after the debit.
        if (payload.kind === 'will') {
          try { await willChange(actor, selection.capacity, `${willEventId}:rollback`, payload.userId, selection.afterWill); }
          catch (rollbackError) { console.error('Fate Toolkit: Will absorption rollback failed', rollbackError); }
        }
        throw error;
      }
      const kindText = payload.kind === "stress"
        ? `${actor.name}: ${selection.label} · ячейка ${Number(payload.boxIndex) + 1} поглощает ${selection.capacity}`
        : `${actor.name}: ${selection.label}${selection.name ? ` «${selection.name}»` : ""} поглощает ${selection.capacity}`;
      try {
        await appendAudit(message, {
          type: payload.kind === "stress" ? "stress" : payload.kind === 'will' ? 'will' : "consequence",
          label: payload.kind === "stress" ? "Стресс" : payload.kind === 'will' ? 'Воля' : "Последствие",
          detail: `${kindText}${nextState.status === "resolved" ? " · удар поглощён" : ` · осталось ${nextState.remaining}`}`,
          userId: payload.userId
        });
        await recordConflictEvent({
          type: payload.kind === "consequence" ? "consequence" : "damage",
          actorUuid: actor.uuid, actorName: actor.name,
          text: `${kindText}${nextState.status === "resolved" ? " · удар поглощён полностью" : ` · осталось ${nextState.remaining}`}`,
          messageId: message.id
        });
      } catch (_) {}
      notify();
      return { ok:true, selection, state:nextState };
    }

    async function prepareTakeOut(payload = {}) {
      const base = await authorize(payload, "Нет права вывести этого персонажа из конфликта.");
      if (!base.ok) return base;
      const { message, actor, state } = base;
      if (state.status === "resolved") return fail("Удар уже полностью поглощён.");
      if (state.status === "taken-out") return { ...base, noop:true };
      if (state.status === "ignored") return fail("Удар отменён ведущим.");
      const { combat, combatant } = await findCombatantForActor(actor);
      const beforeDefeated = Boolean(combatant?.defeated);
      const nextState = {
        ...state,
        status: "taken-out",
        takenOut: { combatId: combat?.id ?? null, combatantId: combatant?.id ?? null, beforeDefeated }
      };
      return { ...base, combat, combatant, beforeDefeated, nextState };
    }

    async function commitTakeOut(checked) {
      if (!checked?.ok) return fail("Нельзя отметить выбывание.");
      if (checked.noop) return { ok:true, noop:true, state:checked.state };
      const { payload, message, actor, combat, combatant, beforeDefeated, nextState } = checked;
      if (combatant && !beforeDefeated) await combatant.update({ defeated:true });
      await updateDamageState(message, nextState);
      try {
        await appendAudit(message, { type:"takenout", label:"Персонаж выбывает", detail:`${actor.name} · непоглощено ${nextState.remaining}`, userId:payload.userId });
        await recordConflictEvent({
          type:"takenout", actorUuid:actor.uuid, actorName:actor.name,
          text:`${actor.name}: ${nextState.remaining} сдвига остаются непоглощёнными · персонаж выбывает`,
          messageId:message.id
        }, combat);
      } catch (_) {}
      notify();
      return { ok:true, state:nextState };
    }

    async function prepareUndoTakeOut(payload = {}) {
      const base = await authorize(payload);
      if (!base.ok) return base;
      const { state } = base;
      if (state.status !== "taken-out") return { ...base, noop:true };
      const meta = state.takenOut ?? {};
      const combat = meta.combatId ? getCombat(meta.combatId) : getCurrentCombat();
      const combatant = meta.combatantId ? combat?.combatants?.get?.(meta.combatantId) ?? null : null;
      const nextState = { ...state, status: state.remaining <= 0 ? "resolved" : "pending", takenOut:null };
      return { ...base, meta, combat, combatant, nextState };
    }

    async function commitUndoTakeOut(checked) {
      if (!checked?.ok) return fail("Нельзя отменить выбывание.");
      if (checked.noop) return { ok:true, noop:true, state:checked.state };
      const { payload, message, actor, meta, combat, combatant, nextState } = checked;
      if (combatant && combatant.defeated && !meta.beforeDefeated) await combatant.update({ defeated:false });
      await updateDamageState(message, nextState);
      try {
        await appendAudit(message, { type:"damage", label:"Выбывание отменено", detail:`${actor.name} · осталось ${nextState.remaining}`, userId:payload.userId });
        await recordConflictEvent({
          type:"damage", actorUuid:actor.uuid, actorName:actor.name,
          text:`${actor.name}: выбывание отменено · осталось ${nextState.remaining} сдвига`, messageId:message.id
        }, combat);
      } catch (_) {}
      notify();
      return { ok:true, state:nextState };
    }

    return Object.freeze({ prepareApply, commitApply, prepareTakeOut, commitTakeOut, prepareUndoTakeOut, commitUndoTakeOut });
  }

  globalThis.FateToolkitDamageResolution = Object.freeze({ create });
})();
