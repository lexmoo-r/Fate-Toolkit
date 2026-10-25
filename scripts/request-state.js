(() => {
  const PLAYER_REQUESTS_FLAG = "persistentRollRequests";

  function create({
    moduleId,
    pendingRequests,
    gmRequests,
    storageKey,
    requestRowsForStorage,
    readPrivateClientRows,
    writePrivateClientRows,
    refreshWorkflowCenter
  } = {}) {
    function savePlayerPending() {
      const rows = requestRowsForStorage(pendingRequests);
      try {
        sessionStorage.setItem(storageKey("pending"), JSON.stringify(rows));
      } catch (err) {
        console.warn(`${moduleId} | Unable to persist player requests`, err);
      }
      writePrivateClientRows("playerRollRequests", rows);
      refreshWorkflowCenter?.();
    }

    function loadPlayerPending() {
      pendingRequests.clear();
      try {
        const raw = sessionStorage.getItem(storageKey("pending"));
        if (raw) for (const request of JSON.parse(raw)) if (request?.id) pendingRequests.set(request.id, request);
      } catch (err) {
        console.warn(`${moduleId} | Unable to restore player requests from session`, err);
      }
      const privateRows = readPrivateClientRows("playerRollRequests");
      for (const request of privateRows) {
        if (request?.id) pendingRequests.set(request.id, foundry.utils.duplicate(request));
      }
      // Upgrade continuity only: the schema-5 migration removes this synchronized
      // flag. Read it once if no browser-private copy exists, but never write it.
      if (!privateRows.length) {
        try {
          const legacy = game.user?.getFlag?.(moduleId, PLAYER_REQUESTS_FLAG);
          if (Array.isArray(legacy)) for (const request of legacy) {
            if (request?.id) pendingRequests.set(request.id, foundry.utils.duplicate(request));
          }
        } catch (_) {}
      }
    }

    function saveGmRequests() {
      if (!game.user?.isGM) return;
      const rows = requestRowsForStorage(gmRequests);
      try {
        sessionStorage.setItem(storageKey("gm"), JSON.stringify(rows));
      } catch (err) {
        console.warn(`${moduleId} | Unable to persist GM requests`, err);
      }
      // Hidden opposition details are secrets. Keep them browser-local and never
      // persist them to world User documents.
      writePrivateClientRows("gmRollRequests", rows);
      refreshWorkflowCenter?.();
    }

    function loadGmRequests() {
      if (!game.user?.isGM) return;
      gmRequests.clear();
      try {
        const raw = sessionStorage.getItem(storageKey("gm"));
        if (raw) for (const request of JSON.parse(raw)) if (request?.id) gmRequests.set(request.id, request);
      } catch (err) {
        console.warn(`${moduleId} | Unable to restore GM requests from session`, err);
      }
      for (const request of readPrivateClientRows("gmRollRequests")) {
        if (request?.id) gmRequests.set(request.id, foundry.utils.duplicate(request));
      }
    }

    return Object.freeze({ savePlayerPending, loadPlayerPending, saveGmRequests, loadGmRequests });
  }

  globalThis.FateToolkitRequestState = Object.freeze({ PLAYER_REQUESTS_FLAG, create });
})();
