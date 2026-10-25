/* Campaign 2012: voluntary concessions pay out AFTER the conflict.
 * Uses the existing Combat document and the campaign Will RPC; the historical
 * stress system is unaffected when campaign2012Mode is disabled.
 */
(() => {
  const ID = 'fate-aspect-widget';
  const FLAG = 'campaignConcessions';
  const locks = new Map();
  const clone = value => foundry.utils.duplicate(value);
  function enabled() { return Boolean(globalThis.FateToolkitWill?.enabled?.()); }
  function getLedger(combat) {
    const value = combat?.getFlag?.(ID, FLAG) ?? combat?.flags?.[ID]?.[FLAG];
    return value && typeof value === 'object' && !Array.isArray(value) ? clone(value) : {};
  }
  function isConceded(combat, combatantId) { return Boolean(getLedger(combat)[combatantId]); }
  function lock(combatId, fn) {
    const previous = locks.get(combatId) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(fn);
    locks.set(combatId, next);
    void next.finally(() => { if (locks.get(combatId) === next) locks.delete(combatId); }).catch(() => {});
    return next;
  }
  function rowFor(combat, id) { return combat?.combatants?.get?.(id) ?? null; }
  function canControl(user, actor) { return Boolean(user?.isGM || actor?.testUserPermission?.(user, 'OWNER')); }
  function journal(combat) { const rows = combat?.getFlag?.(ID,'conflictJournal'); return Array.isArray(rows) ? rows : []; }
  function consequencesFromMessages(combat, actorUuid) {
    // A discarded consequence doesn't count. Read CURRENT selections, not audit
    // lines; otherwise a user could Undo then still receive +1 Will.
    const relevant = journal(combat).filter(row => row.type === 'consequence' && row.actorUuid === actorUuid && row.messageId);
    const unique = [...new Set(relevant.map(row => row.messageId))];
    let count = 0;
    for (const id of unique) {
      const state = game.messages?.get?.(id)?.flags?.[ID]?.damageResolution;
      if (state?.actorUuid !== actorUuid || !Array.isArray(state.selections)) continue;
      count += state.selections.filter(s => s.kind === 'consequence').length;
    }
    return count;
  }
  function payoutAmount(count) { return 1 + Math.max(0, Math.floor(Number(count) || 0)); }
  async function concede(combat, combatantId, terms, user) {
    if (!enabled()) throw new Error('Уступка по новым правилам доступна только в режиме кампании 2012.');
    if (!combat || !combatantId) throw new Error('Активный конфликт не найден.');
    const text = String(terms ?? '').trim().slice(0, 1000);
    if (!text) throw new Error('Опишите согласованные обстоятельства поражения.');
    return lock(combat.id, async () => {
      const row = rowFor(combat, combatantId);
      if (!row?.actor || !canControl(user, row.actor)) throw new Error('Нет права уступить за этого персонажа.');
      const ledger = getLedger(combat);
      if (ledger[combatantId]) return { ok:true, duplicate:true, entry:ledger[combatantId] };
      if (row.defeated) throw new Error('Персонаж уже выбыл из конфликта.');
      const pending = game.modules?.get?.(ID)?.api?.pendingDamageForActor?.(row.actor.uuid, combat);
      if (pending) throw new Error('Текущий удар уже разрешается. Уступать нужно до разрешения действия противника.');
      const will = globalThis.FateToolkitWill?.details?.(row.actor);
      if (!will?.configured) throw new Error('Сначала настройте шкалу Воли этого персонажа.');
      // Record before marking the combatant defeated. A duplicate request can
      // then be identified even if the client retries after losing connection.
      const entry = {
        combatantId, actorUuid: row.actor.uuid, actorName: row.actor.name,
        terms: text, concededBy: user.id, createdAt: Date.now(), paid:false
      };
      ledger[combatantId] = entry;
      await combat.setFlag(ID, FLAG, ledger);
      try { await row.update({ defeated:true }); }
      catch (error) {
        delete ledger[combatantId];
        await combat.setFlag(ID, FLAG, ledger);
        throw error;
      }
      try { await game.modules.get(ID)?.api?.recordConflictEvent?.({
        type:'concession', actorUuid:row.actor.uuid, actorName:row.actor.name,
        text:`${row.actor.name} уступает. Условия: ${text}. Награда — после завершения конфликта.`
      }, combat); } catch (_) {}
      return { ok:true, entry };
    });
  }
  async function finalize(combat) {
    if (!enabled()) return { ok:true, skipped:true };
    if (!game.user?.isGM) throw new Error('Завершить конфликт может только ведущий.');
    if (!combat) throw new Error('Конфликт не найден.');
    return lock(combat.id, async () => {
      const ledger = getLedger(combat);
      const paid = [];
      for (const [combatantId, entry] of Object.entries(ledger)) {
        if (!entry || entry.paid) continue;
        const actor = await fromUuid(entry.actorUuid);
        if (!actor || actor.type !== 'fate-core-official') throw new Error(`Не удалось выдать Волю ${entry.actorName}: персонаж не найден.`);
        const consequences = consequencesFromMessages(combat, entry.actorUuid);
        const amount = payoutAmount(consequences);
        // Will service deduplicates by eventId, so retrying after a failed
        // Combat flag update doesn't pay the award twice.
        const receipt = await globalThis.FateToolkitWill.handler({
          operation:'change', actorUuid:entry.actorUuid, delta:amount,
          eventId:`concession:${combat.id}:${combatantId}`
        }, { senderId:game.user.id });
        if (!receipt?.ok) throw new Error(`Не удалось зачислить Волю ${entry.actorName}.`);
        ledger[combatantId] = { ...entry, paid:true, paidAt:Date.now(), consequences, amount };
        await combat.setFlag(ID, FLAG, ledger);
        paid.push({ actorName:entry.actorName, amount, consequences });
      }
      for (const row of paid) {
        try { await ChatMessage.create({ content:`${row.actorName}: +${row.amount} Воли за уступку (+1 и ${row.consequences} последствий).` }); }
        catch (error) { console.warn(`${ID} | Could not publish concession`, error); }
      }
      return { ok:true, paid };
    });
  }
  async function requestConcede(combat, combatantId, terms) {
    if (!combat?.id) throw new Error('Нет активного конфликта.');
    return globalThis.FateToolkitRPC.executeAsGM('campaignConcession', {
      operation:'concede', combatId:combat.id, combatantId, terms
    });
  }
  async function handler(payload, { senderId } = {}) {
    if (!enabled()) throw new Error('Режим кампании выключен.');
    const user = game.users?.get?.(String(senderId ?? ''));
    if (!user) throw new Error('Неизвестный участник.');
    const combat = game.combats?.get?.(String(payload?.combatId ?? ''));
    if (!combat) throw new Error('Конфликт не найден.');
    if (payload?.operation === 'concede') return concede(combat, String(payload.combatantId ?? ''), payload.terms, user);
    throw new Error('Неизвестная операция уступки.');
  }
  globalThis.FateToolkitConcession = Object.freeze({ enabled, isConceded, payoutAmount, consequencesFromMessages, concede, finalize, requestConcede, handler });
  globalThis.FateToolkitRPC?.register?.('campaignConcession', handler);
  // Prevent a direct delete from silently forfeiting earned but unpaid Will.
  Hooks.on('preDeleteCombat', combat => {
    if (!enabled() || !game.user?.isGM) return;
    if (Object.values(getLedger(combat)).some(entry => entry && !entry.paid)) {
      ui.notifications.warn('В конфликте есть неоплаченные уступки. Завершите его через трекер Fate Toolkit.');
      return false;
    }
  });
})();
