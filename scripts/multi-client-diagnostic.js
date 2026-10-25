(() => {
  const MODULE_ID = "fate-aspect-widget";
  const CLIENT_PROBE_CHANNEL = "diagnostic:client-probe";
  const GM_ECHO_CHANNEL = "diagnostic:gm-echo";
  const SESSION_TTL_MS = 300000;
  const PRIVATE_USER_FLAGS = Object.freeze([
    "persistentGmRollRequests",
    "persistentAuthenticatedActionProposalsV1",
    "persistentRollRequests",
    "persistentActionDraftV1",
    "persistentPendingActionV1",
    "persistentOppositionQueueV1",
    "milestoneDraftsV2"
  ]);
  const SAFE_HIDDEN_OPPOSITION_KEYS = new Set(["mode", "hidden", "kind"]);
  const sessions = new Map();

  function now() { return Date.now(); }

  function row(name, ok, detail = "") {
    return { name: String(name), ok: Boolean(ok), detail: String(detail ?? "") };
  }

  function push(checks, name, ok, detail = "") {
    const result = row(name, ok, detail);
    checks.push(result);
    return result;
  }

  function activePlayers() {
    const users = game.users?.contents ?? [];
    return users.filter(user => user?.active && !user?.isGM);
  }

  function activePrimaryGM() {
    return game.users?.activeGM ?? null;
  }

  function getMessage(messageId) {
    return messageId ? (game.messages?.get?.(String(messageId)) ?? null) : null;
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
  }

  async function waitForMessage(messageId, timeoutMs = 3000, intervalMs = 75) {
    const deadline = now() + Math.max(0, Number(timeoutMs) || 0);
    let message = getMessage(messageId);
    while (!message && now() < deadline) {
      await sleep(intervalMs);
      message = getMessage(messageId);
    }
    return message;
  }

  function getModuleFlag(document, key) {
    if (!document) return undefined;
    try {
      if (typeof document.getFlag === "function") return document.getFlag(MODULE_ID, key);
    } catch (_) {}
    return document.flags?.[MODULE_ID]?.[key];
  }

  function hiddenDtoInspection(dto) {
    const value = dto && typeof dto === "object" ? dto : null;
    const keys = value ? Object.keys(value).sort() : [];
    const forbidden = keys.filter(key => !SAFE_HIDDEN_OPPOSITION_KEYS.has(key));
    const safe = Boolean(
      value
      && value.hidden === true
      && value.kind === "hidden"
      && forbidden.length === 0
    );
    return { safe, keys, forbidden };
  }

  function exposedPrivateUserFlags() {
    const exposed = [];
    for (const user of game.users?.contents ?? []) {
      for (const flag of PRIVATE_USER_FLAGS) {
        let value;
        try { value = user?.getFlag?.(MODULE_ID, flag); } catch (_) { value = undefined; }
        if (value !== undefined) exposed.push(`${user?.id || "unknown"}:${flag}`);
      }
    }
    return exposed;
  }

  function requirePrimaryGM() {
    const gm = activePrimaryGM();
    if (!game.user?.isGM || !gm || String(gm.id) !== String(game.user.id)) {
      throw new Error("Multi-client diagnostic must be started by Foundry's active primary GM.");
    }
    return gm;
  }

  function sessionFor(sessionId) {
    const session = sessions.get(String(sessionId || ""));
    if (!session) return null;
    if (Number(session.expiresAt || 0) <= now()) {
      sessions.delete(session.id);
      return null;
    }
    return session;
  }

  async function gmEcho(payload = {}, meta = {}) {
    const rpc = globalThis.FateToolkitRPC;
    if (!game.user?.isGM || String(activePrimaryGM()?.id || "") !== String(game.user?.id || "")) {
      throw new Error("Diagnostic GM echo was executed outside the active primary GM client.");
    }
    const session = sessionFor(payload.sessionId);
    if (!session) throw new Error("Diagnostic session is missing or expired.");
    const senderId = String(meta.senderId || "");
    if (!session.playerIds.has(senderId)) throw new Error("Diagnostic echo received from an unexpected user.");
    if (payload.claimedUserId !== undefined && String(payload.claimedUserId) !== senderId) {
      throw new Error("Diagnostic echo sender mismatch.");
    }
    if (!rpc?.ready) throw new Error("Fate Toolkit RPC is not ready.");
    return { ok: true, sessionId: session.id, senderId, receivedAt: now() };
  }

  async function clientProbe(payload = {}, meta = {}) {
    const rpc = globalThis.FateToolkitRPC;
    if (!rpc?.ready) throw new Error("Fate Toolkit RPC is not ready on the probed client.");
    const expectedGmId = String(activePrimaryGM()?.id || "");
    rpc.assertGM(meta.senderId);
    rpc.assertSender(meta.senderId, expectedGmId);

    const sessionId = String(payload.sessionId || "");
    const currentUserId = String(game.user?.id || "");
    const ownTarget = (payload.targetedMessages || []).find(entry => String(entry?.userId || "") === currentUserId);
    const publicMessage = await waitForMessage(payload.publicMessageId);
    if (ownTarget?.messageId) await waitForMessage(ownTarget.messageId);
    // Let Foundry finish propagating the same document batch before asserting absence
    // of messages that must not be visible to this client.
    await sleep(150);
    const privateMessage = getMessage(payload.gmOnlyMessageId);
    const publicDiagnostic = getModuleFlag(publicMessage, "integrationMultiClient");
    const dtoInspection = hiddenDtoInspection(publicDiagnostic?.publicOpposition);

    const targetedVisibility = (payload.targetedMessages || []).map(entry => {
      const targetUserId = String(entry?.userId || "");
      const messageId = String(entry?.messageId || "");
      return {
        targetUserId,
        messageId,
        present: Boolean(getMessage(messageId)),
        shouldBePresent: targetUserId === currentUserId
      };
    });

    let echo;
    try {
      echo = await rpc.executeAsGM(GM_ECHO_CHANNEL, { sessionId, claimedUserId: currentUserId });
    } catch (error) {
      echo = { ok: false, error: String(error?.message || error) };
    }

    const moduleVersion = String(game.modules?.get?.(MODULE_ID)?.version ?? "");
    const foundryVersion = String(game.version ?? game.release?.version ?? "");
    const systemVersion = String(game.system?.version ?? "");
    return {
      userId: currentUserId,
      isGM: Boolean(game.user?.isGM),
      rpcReady: Boolean(rpc.ready),
      moduleVersion,
      foundryVersion,
      systemId: String(game.system?.id || ""),
      systemVersion,
      publicMessage: {
        present: Boolean(publicMessage),
        sessionMatches: String(publicDiagnostic?.sessionId || "") === sessionId,
        dtoSafe: dtoInspection.safe,
        dtoKeys: dtoInspection.keys,
        forbiddenDtoKeys: dtoInspection.forbidden
      },
      gmOnlyPresent: Boolean(privateMessage),
      targetedVisibility,
      exposedPrivateUserFlags: exposedPrivateUserFlags(),
      echo
    };
  }

  async function createDiagnosticMessages(sessionId, players) {
    const created = [];
    const oppositionPublic = globalThis.FateToolkitOppositionPublic?.create?.({});
    if (!oppositionPublic?.toPublic) throw new Error("Opposition privacy boundary is unavailable.");
    const publicOpposition = oppositionPublic.toPublic({
      mode: "opponent",
      hidden: true,
      total: 99,
      actorName: "DIAGNOSTIC_SECRET_ACTOR",
      actorUuid: "Actor.DIAGNOSTIC_SECRET",
      skillName: "DIAGNOSTIC_SECRET_SKILL",
      skillRank: 99,
      stunts: [{ name: "DIAGNOSTIC_SECRET_STUNT", bonus: 99 }],
      stuntBonus: 99,
      math: { total: 99 },
      history: [{ secret: true }],
      messageId: "DIAGNOSTIC_SECRET_MESSAGE"
    });
    const localInspection = hiddenDtoInspection(publicOpposition);
    if (!localInspection.safe) throw new Error(`Hidden opposition projection is unsafe: ${localInspection.forbidden.join(", ")}`);

    try {
      const publicMessage = await ChatMessage.create({
        content: `<p>Fate Toolkit multi-client diagnostic ${sessionId}</p>`,
        flags: {
          [MODULE_ID]: {
            integrationMultiClient: { sessionId, kind: "public", publicOpposition }
          }
        }
      });
      if (publicMessage) created.push(publicMessage);

      const gmOnlyMessage = await ChatMessage.create({
        content: `<p>Fate Toolkit private diagnostic ${sessionId}</p>`,
        whisper: [String(game.user.id)],
        flags: {
          [MODULE_ID]: {
            integrationMultiClientPrivate: { sessionId, kind: "gm-only", private: true }
          }
        }
      });
      if (gmOnlyMessage) created.push(gmOnlyMessage);

      const targetedMessages = [];
      for (const player of players) {
        const message = await ChatMessage.create({
          content: `<p>Fate Toolkit targeted diagnostic ${sessionId}</p>`,
          whisper: [String(player.id)],
          flags: {
            [MODULE_ID]: {
              integrationMultiClientTarget: { sessionId, kind: "targeted", targetUserId: String(player.id) }
            }
          }
        });
        if (message) created.push(message);
        targetedMessages.push({ userId: String(player.id), messageId: String(message?.id || ""), message });
      }

      return { publicMessage, gmOnlyMessage, targetedMessages, publicOpposition };
    } catch (error) {
      for (const message of created.reverse()) {
        try { await message.delete?.(); } catch (_) {}
      }
      throw error;
    }
  }

  async function cleanupMessages(messages, checks) {
    const documents = [messages?.publicMessage, messages?.gmOnlyMessage, ...(messages?.targetedMessages || []).map(row => row.message)].filter(Boolean);
    let failed = 0;
    for (const message of documents) {
      try { await message.delete?.(); }
      catch (error) {
        failed += 1;
        push(checks, `cleanup: ${message?.id || "message"}`, false, String(error?.message || error));
      }
    }
    if (!failed) push(checks, "cleanup", true, `${documents.length} temporary messages deleted`);
  }

  function evaluateProbe(checks, player, probeResult, expected) {
    const name = String(player?.name || player?.id || "player");
    if (!probeResult?.ok) {
      push(checks, `${name}: RPC probe`, false, probeResult?.error || "no response");
      return;
    }
    const probe = probeResult.value || {};
    push(checks, `${name}: authenticated identity`, String(probe.userId || "") === String(player.id), `reported=${probe.userId || "none"}`);
    push(checks, `${name}: player client`, probe.isGM === false, `isGM=${Boolean(probe.isGM)}`);
    push(checks, `${name}: RPC ready`, probe.rpcReady === true, `rpc=${Boolean(probe.rpcReady)}`);
    push(checks, `${name}: version parity`, probe.moduleVersion === expected.moduleVersion && probe.foundryVersion === expected.foundryVersion && probe.systemId === expected.systemId && probe.systemVersion === expected.systemVersion, `${probe.moduleVersion} / ${probe.foundryVersion} / ${probe.systemId} ${probe.systemVersion}`);
    push(checks, `${name}: public diagnostic visible`, probe.publicMessage?.present === true && probe.publicMessage?.sessionMatches === true, `present=${Boolean(probe.publicMessage?.present)}`);
    push(checks, `${name}: hidden opposition sanitized`, probe.publicMessage?.dtoSafe === true && (probe.publicMessage?.forbiddenDtoKeys || []).length === 0, `keys=${(probe.publicMessage?.dtoKeys || []).join(",")}`);
    push(checks, `${name}: GM-only message hidden`, probe.gmOnlyPresent === false, `present=${Boolean(probe.gmOnlyPresent)}`);
    const wrongVisibility = (probe.targetedVisibility || []).filter(item => Boolean(item.present) !== Boolean(item.shouldBePresent));
    push(checks, `${name}: targeted whisper isolation`, wrongVisibility.length === 0, wrongVisibility.length ? JSON.stringify(wrongVisibility) : "own only");
    push(checks, `${name}: private User flags absent`, (probe.exposedPrivateUserFlags || []).length === 0, (probe.exposedPrivateUserFlags || []).join(",") || "none");
    push(checks, `${name}: authenticated round-trip`, probe.echo?.ok === true && String(probe.echo?.senderId || "") === String(player.id), probe.echo?.error || `sender=${probe.echo?.senderId || "none"}`);
  }

  function notifyReport(report, notify) {
    if (!notify || !globalThis.FateToolkitUX) return;
    const text = report.ok
      ? `Fate Toolkit: multi-client diagnostic пройден (${report.participants} игроков, ${report.checks.length} проверок).`
      : `Fate Toolkit: multi-client diagnostic не пройден (${report.failed} ошибок). Смотрите консоль.`;
    if (report.ok) globalThis.FateToolkitUX.info(text);
    else globalThis.FateToolkitUX.error(text);
  }

  async function run({ notify = true, cleanup = true, requirePlayers = true } = {}) {
    const checks = [];
    let session = null;
    let messages = null;
    let probes = [];
    let participantCount = 0;
    const startedAt = now();

    try {
      const gm = requirePrimaryGM();
      const rpc = globalThis.FateToolkitRPC;
      if (!rpc?.ready) throw new Error("Fate Toolkit authenticated RPC is not ready.");
      const players = activePlayers();
      participantCount = players.length;
      push(checks, "active primary GM", true, `${gm.name || gm.id} (${gm.id})`);
      push(checks, "active player clients", !requirePlayers || players.length > 0, `${players.length}`);
      if (requirePlayers && players.length === 0) throw new Error("No active non-GM players are connected.");

      const sessionId = `${foundry.utils.randomID()}-${startedAt}`;
      session = {
        id: sessionId,
        createdAt: startedAt,
        expiresAt: startedAt + SESSION_TTL_MS,
        playerIds: new Set(players.map(user => String(user.id)))
      };
      sessions.set(sessionId, session);

      messages = await createDiagnosticMessages(sessionId, players);
      push(checks, "diagnostic documents created", Boolean(messages.publicMessage?.id && messages.gmOnlyMessage?.id), `public=${messages.publicMessage?.id || "none"} private=${messages.gmOnlyMessage?.id || "none"}`);
      push(checks, "GM-only message visible to GM", Boolean(getMessage(messages.gmOnlyMessage?.id)), String(messages.gmOnlyMessage?.id || ""));
      push(checks, "local hidden opposition projection", hiddenDtoInspection(messages.publicOpposition).safe, Object.keys(messages.publicOpposition || {}).join(","));
      push(checks, "legacy private User flags absent on GM", exposedPrivateUserFlags().length === 0, exposedPrivateUserFlags().join(",") || "none");

      const payload = {
        sessionId,
        publicMessageId: String(messages.publicMessage?.id || ""),
        gmOnlyMessageId: String(messages.gmOnlyMessage?.id || ""),
        targetedMessages: messages.targetedMessages.map(entry => ({ userId: entry.userId, messageId: entry.messageId }))
      };
      probes = await rpc.executeForUsers(CLIENT_PROBE_CHANNEL, players.map(user => String(user.id)), payload);
      const expected = {
        moduleVersion: String(game.modules?.get?.(MODULE_ID)?.version ?? ""),
        foundryVersion: String(game.version ?? game.release?.version ?? ""),
        systemId: String(game.system?.id || ""),
        systemVersion: String(game.system?.version ?? "")
      };
      for (const player of players) {
        const result = probes.find(entry => String(entry.userId) === String(player.id));
        evaluateProbe(checks, player, result, expected);
      }
    } catch (error) {
      push(checks, "diagnostic execution", false, String(error?.message || error));
    } finally {
      if (session) sessions.delete(session.id);
      if (cleanup && messages) await cleanupMessages(messages, checks);
    }

    const failed = checks.filter(item => !item.ok);
    const report = {
      ok: failed.length === 0,
      moduleVersion: String(game.modules?.get?.(MODULE_ID)?.version ?? ""),
      foundryVersion: String(game.version ?? game.release?.version ?? ""),
      systemVersion: String(game.system?.version ?? ""),
      participants: participantCount,
      checks,
      failed: failed.length,
      probes,
      startedAt,
      finishedAt: now()
    };

    console.groupCollapsed(`${MODULE_ID} | multi-client diagnostic: ${report.ok ? "PASS" : "FAIL"}`);
    console.table(checks);
    console.groupEnd();
    notifyReport(report, notify);
    return report;
  }

  const rpc = globalThis.FateToolkitRPC;
  rpc?.register?.(CLIENT_PROBE_CHANNEL, clientProbe);
  rpc?.register?.(GM_ECHO_CHANNEL, gmEcho);

  globalThis.FateToolkitMultiClientDiagnostic = Object.freeze({ run });

  Hooks.once("ready", () => {
    const module = game.modules?.get?.(MODULE_ID);
    if (!module) return;
    module.api ??= {};
    module.api.runMultiClientDiagnostic = options => run(options);
  });
})();
