(() => {
  function create({
    actorFromUuid,
    currentRollActorUuid,
    intValue,
    numberValue,
    clone,
    getGameAspects,
    setGameAspects,
    getScene,
    getViewedScene,
    removeBoost,
    addBoost,
    systemId
  } = {}) {
    for (const [name, fn] of Object.entries({ actorFromUuid, currentRollActorUuid, intValue, numberValue, clone, getGameAspects, setGameAspects, getScene, getViewedScene, removeBoost, addBoost })) {
      if (typeof fn !== "function") throw new Error(`FateToolkitInvokeResource requires ${name}`);
    }
    if (!systemId) throw new Error("FateToolkitInvokeResource requires systemId");

    async function consume(message, source, useFree) {
      const rollActor = await actorFromUuid(currentRollActorUuid(message));
      if (!rollActor) throw new Error("Не найден персонаж броска.");

      if (!useFree) {
        if (!source.paidAllowed) throw new Error("Это усиление можно использовать только как бесплатный призыв.");
        const campaignWill = globalThis.FateToolkitWill;
        if (campaignWill?.enabled?.()) {
          const before = campaignWill.details(rollActor).current;
          if (before <= 0) throw new Error('Недостаточно Воли для платного призыва.');
          await campaignWill.request('change', rollActor, { delta: -1 });
          return async () => {
            // Roll application failed after paying: refund through the same authoritative service.
            await campaignWill.request('change', rollActor, { delta: +1 });
          };
        }
        const before = intValue(rollActor.system?.details?.fatePoints?.current);
        if (before <= 0) throw new Error("Нет Воли для платного призыва.");
        await rollActor.update({ "system.details.fatePoints.current": before - 1 });
        return async () => {
          const current = intValue(rollActor.system?.details?.fatePoints?.current);
          if (current === before - 1) await rollActor.update({ "system.details.fatePoints.current": before });
        };
      }

      if (numberValue(source.freeUses) <= 0) throw new Error("У этого аспекта больше нет бесплатных призываний.");
      if (source.kind === "boost") {
        const removed = await removeBoost(source.actorUuid, source.boostId);
        if (!removed) throw new Error("Усиление уже использовано или больше недоступно.");
        return async () => { await addBoost(source.actorUuid, source.name); };
      }

      if (source.kind === "global") {
        const before = clone(getGameAspects());
        const list = clone(before);
        const row = list?.[source.index];
        if (!row || intValue(row.free_invokes) <= 0) throw new Error("Бесплатное призывание уже потрачено.");
        row.free_invokes = intValue(row.free_invokes) - 1;
        await setGameAspects(list);
        return async () => setGameAspects(before);
      }

      if (source.kind === "scene") {
        const scene = getScene(source.sceneId) ?? getViewedScene();
        if (!scene) throw new Error("Сцена больше недоступна.");
        const before = clone(scene.getFlag(systemId, "situation_aspects"));
        const list = clone(before);
        const row = list?.[source.index];
        if (!row || intValue(row.free_invokes) <= 0) throw new Error("Бесплатное призывание уже потрачено.");
        row.free_invokes = intValue(row.free_invokes) - 1;
        await scene.setFlag(systemId, "situation_aspects", list);
        return async () => scene.setFlag(systemId, "situation_aspects", before);
      }

      throw new Error("Для этого аспекта нет бесплатного призывания.");
    }

    return Object.freeze({ consume });
  }

  globalThis.FateToolkitInvokeResource = Object.freeze({ create });
})();
