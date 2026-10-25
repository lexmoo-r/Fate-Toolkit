/* Campaign 2012 rules: separate narrative Will from Fate Core Official refresh.
 * Opt-in and non-destructive: the original system fields and sheets remain available.
 */
(() => {
  const ID = 'fate-aspect-widget';
  const TIERS = Object.freeze({ rank: 3, ordinary: 6, powerful: 9, legendary: 12 });
  const queues = new Map();
  const integer = value => Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : 0;
  const cap = (value, max) => Math.max(0, Math.min(max, integer(value)));
  const enabled = () => {
    try { return Boolean(game.settings.get(ID, 'campaign2012Mode')); } catch (_) { return false; }
  };
  const serial = () => {
    try { return Math.max(0, integer(game.settings.get(ID, 'campaignSceneSerial'))); } catch (_) { return 0; }
  };
  function details(actor) {
    const flag = actor?.getFlag?.(ID, 'will') ?? actor?.flags?.[ID]?.will ?? {};
    const configured = flag?.configured === true;
    const type = flag?.type === 'npc' ? 'npc' : 'pc';
    const tier = Object.hasOwn(TIERS, flag?.tier) ? flag.tier : 'ordinary';
    const max = type === 'npc' ? TIERS[tier] : 9;
    const current = integer(actor?.system?.details?.fatePoints?.current);
    return {
      configured, type, tier, max,
      current: configured ? cap(current, max) : current,
      rawCurrent: current,
      lastScene: Math.max(0, integer(flag.lastScene)),
      lastViceScene: Math.max(0, integer(flag.lastViceScene)),
      complication: flag.complication ?? null,
      recent: Array.isArray(flag.recent) ? flag.recent : [],
      isNpc: type === 'npc', isPc: type === 'pc',
      boxes: Array.from({ length: max }, (_, index) => ({ filled: index < cap(current, max) })),
      flag
    };
  }
  async function lookup(uuid) {
    if (!uuid || typeof uuid !== 'string' || uuid.length > 300) throw new Error('Некорректный идентификатор персонажа.');
    const actor = await fromUuid(uuid);
    if (!actor || actor.type !== 'fate-core-official') throw new Error('Персонаж Fate Core не найден.');
    return actor;
  }
  function mayControl(user, actor) {
    return Boolean(user?.isGM || actor?.testUserPermission?.(user, 'OWNER'));
  }
  function lock(key, task) {
    const prior = queues.get(key) ?? Promise.resolve();
    const next = prior.catch(() => {}).then(task);
    queues.set(key, next);
    void next.finally(() => { if (queues.get(key) === next) queues.delete(key); }).catch(() => {});
    return next;
  }
  async function persist(actor, flag, current) {
    const updates = { [`flags.${ID}.will`]: flag };
    if (current !== undefined) updates['system.details.fatePoints.current'] = current;
    await actor.update(updates);
  }
  function eventKey(value) { return typeof value === 'string' && value.length <= 100 ? value : ''; }
  function mark(flag, id) {
    const recent = (Array.isArray(flag.recent) ? flag.recent : []).filter(x => typeof x === 'string');
    return { ...flag, recent: [...recent.filter(x => x !== id), id].slice(-60) };
  }
  async function restoreCombatNpcs(combat, scene) {
    if (!combat || !scene) return { restored:0 };
    const rows=combat.combatants?.contents ?? (typeof combat.combatants?.values==='function' ? [...combat.combatants.values()] : []);
    let restored=0;
    for (const row of rows) {
      const actor=row.actor;
      if (!actor || actor.type!=='fate-core-official') continue;
      if (!details(actor).configured || !details(actor).isNpc) continue;
      await lock(actor.uuid,async()=>{
        const state=details(actor);
        if (state.lastScene===scene) return;
        await persist(actor,mark({...state.flag,lastScene:scene},`scene:${scene}`),state.max);
        restored++;
      });
    }
    return {restored};
  }
  async function handler(payload = {}, { senderId } = {}) {
    if (!enabled()) throw new Error('Правила кампании 2012 отключены в настройках модуля.');
    const user = game.users?.get?.(String(senderId || ''));
    if (!user) throw new Error('Неизвестный отправитель.');
    const operation = String(payload.operation || '');
    if (operation === 'restoreNpcs') {
      if (!user.isGM) throw new Error('Восстанавливать Волю NPC может только ведущий.');
      return lock('world:scene', async () => {
        // A GM action rather than an obligation to declare each narrative scene.
        // Only NPCs participating in the current canvas scene are affected.
        const selected = new Map();
        for (const token of (canvas?.tokens?.placeables || [])) {
          if (token.actor?.uuid && details(token.actor).configured && details(token.actor).isNpc)
            selected.set(token.actor.uuid, token.actor);
        }
        if (!selected.size) return {ok:true, restoredNpcs:0, scene:serial(), noNpcs:true};
        const next = serial() + 1;
        await game.settings.set(ID, 'campaignSceneSerial', next);
        let restoredNpcs = 0;
        for (const actor of selected.values()) {
          await lock(actor.uuid, async () => {
            const state=details(actor);
            if (state.type !== 'npc' || !state.configured) return;
            await persist(actor, mark({...state.flag,lastScene:next},`npc-restore:${next}`), state.max);
            restoredNpcs += 1;
          });
        }
        return {ok:true, restoredNpcs, scene:next};
      });
    }
    if (operation === 'beginScene') {
      if (!user.isGM) throw new Error('Новую сцену может начать только мастер.');
      return lock('world:scene', async () => {
        const next = serial() + 1;
        await game.settings.set(ID, 'campaignSceneSerial', next);
        const auto=await restoreCombatNpcs(game.combats?.active, next);
        return { ok: true, scene: next, restoredNpcs:auto.restored };
      });
    }
    const actor = await lookup(payload.actorUuid);
    if (!mayControl(user, actor)) throw new Error('Нет прав на управление этим персонажем.');
    if (['configure', 'enterScene', 'resolveComplication'].includes(operation) && !user.isGM) {
      throw new Error('Это действие доступно только мастеру.');
    }
    return lock(actor.uuid, async () => {
      const state = details(actor);
      const id = eventKey(payload.eventId);
      if (id && state.recent.includes(id)) return { ok: true, duplicate: true, ...details(actor) };
      if (operation === 'configure') {
        const type = payload.type === 'npc' ? 'npc' : payload.type === 'pc' ? 'pc' : null;
        if (!type) throw new Error('Неизвестный тип персонажа.');
        const tier = Object.hasOwn(TIERS, payload.tier) ? payload.tier : 'ordinary';
        const max = type === 'pc' ? 9 : TIERS[tier];
        // A tier adjustment must not reset scene/vice history or revive an unresolved complication.
        const changedType = state.configured && type !== state.type;
        const will = mark({ ...state.flag, configured: true, type, tier,
          lastScene: changedType ? 0 : state.lastScene,
          lastViceScene: changedType ? 0 : state.lastViceScene,
          complication: changedType ? null : state.complication
        }, id);
        const current = state.configured ? cap(state.rawCurrent, max) : type === 'pc' ? 6 : max;
        await persist(actor, will, current);
        return { ok: true, ...details(actor) };
      }
      if (!state.configured) throw new Error('Сначала настройте шкалу Воли персонажа.');
      if (operation === 'bargain') {
        const description=String(payload.description||'').trim().slice(0,300);
        if (!description) throw new Error('Укажите осложнение сделки с дьяволом.');
        if (!id) throw new Error('Для сделки требуется идентификатор броска.');
        if (state.current >= state.max) return {ok:true,accepted:false,reason:'full'};
        if (!game.user?.isGM) throw new Error('Сделку подтверждает только ведущий.');
        // The GM sees the actual authenticated player / character and accepts
        // a narrative complication before the dice are rolled.
        const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
        const approved=await foundry.applications.api.DialogV2.confirm({
          window:{title:game.i18n.localize('FAW.Campaign.BargainTitle')},
          content:`<div class="faw-toolkit-dialog"><p><b>${escape(actor.name)}</b> · ${escape(user.name||'')}</p><p>${escape(description)}</p><p>${escape(game.i18n.localize('FAW.Campaign.BargainConfirmHint'))}</p></div>`,
          rejectClose:false
        });
        if (!approved) return {ok:true,accepted:false,reason:'rejected'};
        const after=cap(state.current+1,state.max);
        await persist(actor,mark(state.flag,id),after);
        try {
          await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),
            content:`${escape(actor.name)}: ${escape(game.i18n.localize('FAW.Campaign.BargainTitle'))} · ${escape(description)} · +${after-state.current} ${escape(game.i18n.localize('FAW.Campaign.Will'))} (${after}/${state.max}).`});
        } catch(error) { console.warn(`${ID} | Bargain record was not published`,error); }
        return {ok:true,accepted:true,before:state.current,after,delta:after-state.current,description};
      }
      if (operation === 'special' || operation === 'compel') {
        if (operation === 'compel' && !user.isGM) throw new Error('Начислить Волю за осложнение может только ведущий.');
        const purpose = operation === 'compel' ? 'compel' : String(payload.purpose || 'other');
        if (!['flashback','resistance','other','compel'].includes(purpose)) throw new Error('Неизвестный вид действия за Волю.');
        const amount = operation === 'compel' ? 1 : Number(payload.amount);
        if (!Number.isInteger(amount) || amount < 1 || amount > state.max) throw new Error('Некорректная цена действия.');
        if (operation !== 'compel' && state.current < amount) throw new Error('Недостаточно Воли.');
        const before = state.current;
        const after = cap(before + (operation === 'compel' ? amount : -amount), state.max);
        const detail = String(payload.description || '').trim().slice(0, 300);
        await persist(actor, mark(state.flag, id), after);
        const names = {flashback:'Флэшбек',resistance:'Сопротивление последствиям',other:'Особое действие',compel:'Принято осложнение по аспекту'};
        const description = detail ? ` · ${detail.replace(/[<>]/g,'')}` : '';
        try {
          await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}), content:
            `${actor.name.replace(/[<>]/g,'')}: ${names[purpose]}${description} · ${operation === 'compel' ? `+${after-before}` : `−${amount}`} Воли (${after}/${state.max}).`
          });
        } catch(error) { console.warn(`${ID} | Special Will event not published`,error); }
        return {ok:true, purpose, before, after, delta:after-before};
      }
      if (operation === 'change') {
        // Damage absorption and undo use an optimistic balance guard to avoid overwriting
        // a spend or restoration made by another window after the hit was prepared.
        if (payload.expectedCurrent !== undefined && (!Number.isInteger(Number(payload.expectedCurrent)) || state.rawCurrent !== Number(payload.expectedCurrent))) {
          throw new Error('Воля изменилась: обновите состояние персонажа и повторите действие.');
        }
        const delta = integer(payload.delta);
        if (!Number.isInteger(Number(payload.delta)) || Math.abs(delta) > 12) throw new Error('Недопустимое изменение Воли.');
        if (delta < 0 && state.rawCurrent < -delta) throw new Error('Недостаточно Воли.');
        const after = cap(state.rawCurrent + delta, state.max);
        await persist(actor, mark(state.flag, id), after);
        return { ok: true, before: state.current, after, delta: after - state.current };
      }
      if (operation === 'enterScene') {
        if (state.type !== 'npc') throw new Error('Автовосстановление сцены существует только для NPC.');
        const currentScene = serial();
        if (!currentScene) throw new Error('Мастер должен сначала начать повествовательную сцену.');
        if (state.lastScene === currentScene) return { ok: true, unchanged: true, ...state };
        await persist(actor, mark({ ...state.flag, lastScene: currentScene }, id), state.max);
        return { ok: true, scene: currentScene, after: state.max };
      }
      if (operation === 'vice') {
        if (state.type !== 'pc') throw new Error('Сцена пристрастия доступна игровым персонажам.');
        if (state.complication?.pending) throw new Error('Сначала разрешите предыдущее осложнение.');
        if (state.current >= state.max) throw new Error('Воля уже полная.');
        const currentScene = serial();
        if (!currentScene) throw new Error('Мастер должен открыть отдельную сцену восстановления.');
        if (state.lastViceScene === currentScene) throw new Error('В этой сцене восстановление уже проводилось.');
        // The die result is evaluated on the authoritative GM client, never submitted by a player.
        const roll = await (new Roll('4dF + 4')).roll();
        const rolled = cap(roll.total, 8);
        const missing = state.max - state.current;
        const excessive = rolled > missing;
        const after = Math.min(state.max, state.current + rolled);
        const complication = excessive ? { pending: true, scene: currentScene, rolled, missing, description: '' } : null;
        await persist(actor, mark({ ...state.flag, lastViceScene: currentScene, complication }, id), after);
        try {
          await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${actor.name} — восстановление Воли через пристрастие: +${after - state.current}${excessive ? ' · чрезмерное увлечение!' : ''}` });
        } catch (err) { console.warn(`${ID} | Roll chat publication failed`, err); }
        return { ok: true, rolled, restored: after - state.current, after, excessive, scene: currentScene };
      }
      if (operation === 'resolveComplication') {
        if (!state.complication?.pending) throw new Error('Нет неразрешённого чрезмерного увлечения.');
        const description = String(payload.description ?? '').trim().slice(0, 1500);
        if (!description) throw new Error('Введите описание осложнения.');
        const complication = { ...state.complication, pending: false, description };
        await persist(actor, mark({ ...state.flag, complication }, id));
        return { ok: true, complication };
      }
      throw new Error('Неизвестное действие Воли.');
    });
  }
  // Only genuinely new Fate actors are initialised automatically. Existing actors
  // are left untouched when the campaign setting is enabled mid-world.
  async function autoConfigureNewActor(actor) {
    if (!enabled() || !game.user?.isGM || actor?.type !== 'fate-core-official' || !actor?.uuid) return false;
    const activeGM = game.users?.activeGM;
    if (activeGM && activeGM.id !== game.user.id) return false;
    return lock(actor.uuid, async () => {
      if (details(actor).configured) return false;
      const flag = { ...(actor.getFlag?.(ID, 'will') ?? {}), configured: true, type: 'pc', tier: 'ordinary', lastScene: 0, lastViceScene: 0 };
      await persist(actor, flag, 6);
      return true;
    });
  }
  const request = (operation, actorOrUuid, extra = {}) => {
    const actorUuid = typeof actorOrUuid === 'string' ? actorOrUuid : actorOrUuid?.uuid;
    const eventId = extra.eventId || globalThis.foundry?.utils?.randomID?.() || `${Date.now()}-${Math.random()}`;
    return globalThis.FateToolkitRPC.executeAsGM('campaignWill', { ...extra, operation, actorUuid, eventId });
  };
  globalThis.FateToolkitWill = Object.freeze({ enabled, serial, details, tiers: TIERS, request, handler, cap, restoreCombatNpcs, autoConfigureNewActor });
  Hooks.once('init', () => {
    game.settings.register(ID, 'campaign2012Mode', { name: 'Кампания 2012: Воля и новые правила', hint: 'Включить экспериментальный режим правил. Старые персонажи не преобразуются автоматически.', scope: 'world', config: true, type: Boolean, default: false });
    game.settings.register(ID, 'campaignSceneSerial', { name: 'Номер повествовательной сцены', scope: 'world', config: false, type: Number, default: 0 });
  });
  globalThis.FateToolkitRPC?.register('campaignWill', handler);
  Hooks.on?.('createActor', actor => {
    void autoConfigureNewActor(actor).catch(error =>
      console.warn(`${ID} | Unable to initialise Will for new actor`, error));
  });
  Hooks.on?.('createCombatant', combatant => {
    if (!enabled() || !game.user?.isGM) return;
    const combat=combatant?.parent ?? combatant?.combat;
    if (!combat || combat.id!==game.combats?.active?.id) return;
    void restoreCombatNpcs(combat,serial()).catch(error=>console.warn(`${ID} | NPC scene reset failed`,error));
  });
  Hooks.on?.('updateCombat', combat => {
    if (!enabled() || !game.user?.isGM || combat.id!==game.combats?.active?.id) return;
    void restoreCombatNpcs(combat,serial()).catch(error=>console.warn(`${ID} | NPC scene reset failed`,error));
  });
  Hooks.once('ready', () => {
    const mod = game.modules?.get(ID);
    if (!mod) return;
    mod.api = { ...(mod.api ?? {}), campaignWill: globalThis.FateToolkitWill };
  });
})();
