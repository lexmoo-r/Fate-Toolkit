(() => {
  const MODULE_ID = "fate-aspect-widget";

  function storageKey(kind) {
    return `${MODULE_ID}:${game.world?.id ?? "world"}:${game.user?.id ?? "user"}:${kind}`;
  }

  function privateClientStorageKey(kind) {
    return `${MODULE_ID}.private.${game.world?.id ?? "world"}.${game.user?.id ?? "user"}.${String(kind)}`;
  }

  function readPrivateClientRows(kind) {
    try {
      const store = game.settings?.storage?.get?.("client");
      const raw = store?.getItem?.(privateClientStorageKey(kind));
      if (!raw) return [];
      const value = JSON.parse(raw);
      return Array.isArray(value) ? value : [];
    } catch (err) {
      console.warn(`${MODULE_ID} | Unable to restore private ${kind} cache`, err);
      return [];
    }
  }

  function writePrivateClientRows(kind, rows) {
    try {
      const store = game.settings?.storage?.get?.("client");
      if (!store?.setItem) return false;
      const key = privateClientStorageKey(kind);
      if (!Array.isArray(rows) || rows.length === 0) store.removeItem?.(key);
      else store.setItem(key, JSON.stringify(rows));
      return true;
    } catch (err) {
      console.warn(`${MODULE_ID} | Unable to persist private ${kind} cache`, err);
      return false;
    }
  }


  function readPrivateClientValue(kind, fallback = null) {
    try {
      const store = game.settings?.storage?.get?.("client");
      const raw = store?.getItem?.(privateClientStorageKey(kind));
      if (raw === null || raw === undefined || raw === "") return fallback;
      return JSON.parse(raw);
    } catch (err) {
      console.warn(`${MODULE_ID} | Unable to restore private ${kind} value`, err);
      return fallback;
    }
  }

  function writePrivateClientValue(kind, value) {
    try {
      const store = game.settings?.storage?.get?.("client");
      if (!store?.setItem) return false;
      const key = privateClientStorageKey(kind);
      if (value === null || value === undefined) store.removeItem?.(key);
      else store.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.warn(`${MODULE_ID} | Unable to persist private ${kind} value`, err);
      return false;
    }
  }

  function requestRowsForStorage(map) {
    return [...map.values()]
      .sort((a, b) => Number(a?.createdAt ?? 0) - Number(b?.createdAt ?? 0))
      .slice(-50)
      .map(row => foundry.utils.duplicate(row));
  }

  globalThis.FateToolkitPrivateStorage = Object.freeze({
    storageKey,
    privateClientStorageKey,
    readPrivateClientRows,
    writePrivateClientRows,
    readPrivateClientValue,
    writePrivateClientValue,
    requestRowsForStorage
  });
})();
