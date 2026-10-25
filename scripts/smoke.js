const FAW_SMOKE_MODULE_ID = "fate-aspect-widget";
const FAW_SMOKE_SYSTEM_ID = "fate-core-official";
const FAW_SMOKE_CORE = "13.351";
const FAW_SMOKE_SYSTEM = "4.7.13.6";

function fawSmokeRow(name, ok, detail = "") {
  return { name: String(name), ok: Boolean(ok), detail: String(detail ?? "") };
}

function fawSmokeVersion() {
  return String(game.version ?? game.release?.version ?? game.release?.display ?? "");
}

function fawSmokeSettingScope(key) {
  return game.settings?.settings?.get?.(`${FAW_SMOKE_MODULE_ID}.${key}`)?.scope ?? null;
}

function fawSmokePush(checks, name, ok, detail = "") {
  const row = fawSmokeRow(name, ok, detail);
  checks.push(row);
  return row;
}

async function fawSmokeDocumentChecks(checks) {
  if (!game.user?.isGM) {
    fawSmokePush(checks, "documents: GM", false, "Document smoke requires an active GM user.");
    return;
  }
  const nonce = foundry.utils.randomID();
  let message = null;
  try {
    message = await ChatMessage.create({
      content: `<p>Fate Toolkit integration smoke ${nonce}</p>`,
      whisper: [game.user.id],
      flags: { [FAW_SMOKE_MODULE_ID]: { integrationSmoke: nonce } }
    });
    fawSmokePush(checks, "documents: create ChatMessage", Boolean(message?.id), message?.id || "not created");
    fawSmokePush(checks, "documents: flag round-trip", message?.getFlag?.(FAW_SMOKE_MODULE_ID, "integrationSmoke") === nonce, "private smoke flag");
    const whisper = Array.isArray(message?.whisper) ? message.whisper.map(String) : [];
    fawSmokePush(checks, "documents: whisper visibility", whisper.includes(String(game.user.id)), whisper.join(","));
  } catch (error) {
    fawSmokePush(checks, "documents: ChatMessage round-trip", false, String(error?.message || error));
  } finally {
    if (message?.delete) {
      try {
        await message.delete();
        fawSmokePush(checks, "documents: cleanup", true, "temporary ChatMessage deleted");
      } catch (error) {
        fawSmokePush(checks, "documents: cleanup", false, String(error?.message || error));
      }
    }
  }
}

async function fawRunIntegrationSmoke({ documents = false, notify = true } = {}) {
  const checks = [];
  const coreVersion = fawSmokeVersion();
  const systemVersion = String(game.system?.version ?? "");
  const socketlibModule = game.modules?.get?.("socketlib");
  const rpc = globalThis.FateToolkitRPC;
  const permissions = globalThis.FateToolkitPermissions;

  fawSmokePush(checks, "Foundry", coreVersion === FAW_SMOKE_CORE, coreVersion || "unknown");
  fawSmokePush(checks, "Fate Core Official", game.system?.id === FAW_SMOKE_SYSTEM_ID && systemVersion === FAW_SMOKE_SYSTEM, `${game.system?.id || "unknown"} ${systemVersion}`.trim());
  fawSmokePush(checks, "socketlib", Boolean(socketlibModule?.active && rpc?.ready), `module=${Boolean(socketlibModule?.active)} rpc=${Boolean(rpc?.ready)}`);
  fawSmokePush(checks, "aspectFavorites scope", fawSmokeSettingScope("aspectFavorites") === "user", String(fawSmokeSettingScope("aspectFavorites")));
  fawSmokePush(checks, "actionSkillPreferences scope", fawSmokeSettingScope("actionSkillPreferences") === "user", String(fawSmokeSettingScope("actionSkillPreferences")));
  if (game.user?.isGM) {
    const legacySecretFlags = ["persistentGmRollRequests", "persistentAuthenticatedActionProposalsV1"];
    for (const flag of legacySecretFlags) {
      let value;
      try { value = game.user.getFlag?.(FAW_SMOKE_MODULE_ID, flag); } catch (_) { value = undefined; }
      fawSmokePush(checks, `legacy private flag removed: ${flag}`, value === undefined, value === undefined ? "removed" : "still present");
    }
  }

  const foundryPrimary = game.users?.activeGM ?? null;
  const toolkitPrimary = permissions?.primaryActiveGM?.() ?? null;
  fawSmokePush(
    checks,
    "active GM authority",
    String(foundryPrimary?.id || "") === String(toolkitPrimary?.id || ""),
    `Foundry=${foundryPrimary?.id || "none"} Toolkit=${toolkitPrimary?.id || "none"}`
  );

  if (documents) await fawSmokeDocumentChecks(checks);

  const failed = checks.filter(row => !row.ok);
  const report = {
    ok: failed.length === 0,
    moduleVersion: String(game.modules?.get?.(FAW_SMOKE_MODULE_ID)?.version ?? ""),
    foundryVersion: coreVersion,
    systemVersion,
    documents: Boolean(documents),
    checks,
    failed: failed.length,
    timestamp: Date.now()
  };

  console.groupCollapsed(`${FAW_SMOKE_MODULE_ID} | integration smoke: ${report.ok ? "PASS" : "FAIL"}`);
  console.table(checks);
  console.groupEnd();
  if (notify && globalThis.FateToolkitUX) {
    const text = report.ok
      ? `Fate Toolkit: smoke-test пройден (${checks.length}/${checks.length}).`
      : `Fate Toolkit: smoke-test не пройден (${failed.length} ошибок из ${checks.length}). Смотрите консоль.`;
    if (report.ok) globalThis.FateToolkitUX.info(text);
    else globalThis.FateToolkitUX.error(text);
  }
  return report;
}

globalThis.FateToolkitSmoke = Object.freeze({ run: fawRunIntegrationSmoke });

Hooks.once("ready", () => {
  if (game.system?.id !== FAW_SMOKE_SYSTEM_ID) return;
  const module = game.modules.get(FAW_SMOKE_MODULE_ID);
  module.api ??= {};
  module.api.runIntegrationSmoke = options => fawRunIntegrationSmoke(options);
});
