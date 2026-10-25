(() => {
  const MODULE_ID = "fate-aspect-widget";
  const SOCKET = `module.${MODULE_ID}`;
  const SOUND_KEYS = ["failure", "tie", "success", "style"];
  const SOUND_SETTING_KEYS = Object.freeze({
    failure: "soundFailure",
    tie: "soundTie",
    success: "soundSuccess",
    style: "soundStyle"
  });

  function registerSettings() {
    game.settings.register(MODULE_ID, "soundsEnabled", { scope: "world", config: false, type: Boolean, default: true });
    for (const key of SOUND_KEYS) {
      game.settings.register(MODULE_ID, SOUND_SETTING_KEYS[key], { scope: "world", config: false, type: String, default: "" });
    }
    game.settings.register(MODULE_ID, "soundVolume", { scope: "world", config: false, type: Number, default: 0.8 });
    game.settings.register(MODULE_ID, "soundAudience", { scope: "world", config: false, type: String, default: "all" });
  }

  function getSetting(key, fallback = null) {
    try {
      const value = game.settings.get(MODULE_ID, key);
      return value ?? fallback;
    } catch (_) {
      return fallback;
    }
  }

  function pathForOutcome(outcomeKey) {
    const settingKey = SOUND_SETTING_KEYS[outcomeKey];
    if (!settingKey) return "";
    return String(getSetting(settingKey, "") || "").trim();
  }

  function localAudioHelper() {
    return foundry?.audio?.AudioHelper ?? globalThis.AudioHelper ?? null;
  }

  function playLocal(src, volume = 0.8) {
    if (!src) return;
    const helper = localAudioHelper();
    const level = Math.max(0, Math.min(1, Number(volume) || 0));
    try {
      if (helper?.play) {
        helper.play({ src, volume: level, autoplay: true, loop: false, channel: "interface" }, false);
        return;
      }
      if (game.audio?.play) game.audio.play(src, { volume: level });
    } catch (err) {
      console.warn(`${MODULE_ID} | Failed to play outcome sound`, src, err);
    }
  }

  function recipients(rollerUserId) {
    const audience = String(getSetting("soundAudience", "all") || "all");
    const activeUsers = Array.from(game.users ?? []).filter(user => user.active);
    const active = activeUsers.map(user => user.id);
    if (audience === "roller") return active.includes(rollerUserId) ? [rollerUserId] : [];
    if (audience === "roller-gm") {
      const ids = new Set();
      if (active.includes(rollerUserId)) ids.add(rollerUserId);
      for (const user of activeUsers) if (user.isGM) ids.add(user.id);
      return [...ids];
    }
    if (audience === "gm") return activeUsers.filter(user => user.isGM).map(user => user.id);
    return active;
  }

  function dispatch(outcomeKey, rollerUserId) {
    if (!game.user.isGM || !getSetting("soundsEnabled", true)) return;
    const src = pathForOutcome(outcomeKey);
    if (!src) return;
    const volume = Math.max(0, Math.min(1, Number(getSetting("soundVolume", 0.8)) || 0));
    const targetUserIds = recipients(rollerUserId);
    if (!targetUserIds.length) return;

    if (targetUserIds.includes(game.user.id)) playLocal(src, volume);
    const remote = targetUserIds.filter(id => id !== game.user.id);
    if (remote.length) {
      game.socket.emit(SOCKET, { type: "playSound", targetUserIds: remote, src, volume });
    }
  }

  globalThis.FateToolkitOutcomeSounds = Object.freeze({
    registerSettings,
    getSetting,
    pathForOutcome,
    playLocal,
    recipients,
    dispatch
  });
})();
