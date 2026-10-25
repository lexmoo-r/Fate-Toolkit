(() => {
  const REQUIRED = Object.freeze({
    FateToolkitWindowRuntime: ["FawSafeWindow", "deferOrRenderApp", "restoreApp"],
    FateToolkitPrivateStorage: ["storageKey", "readPrivateClientRows", "writePrivateClientRows", "readPrivateClientValue", "writePrivateClientValue", "requestRowsForStorage"],
    FateToolkitRollPresentation: ["snapshotRollMath", "appendMathHistory", "appendMessageAudit", "injectActionAudit"],
    FateToolkitOutcomeSounds: ["registerSettings", "getSetting", "playLocal", "dispatch"],
    FateToolkitSoundSettingsUI: ["open"],
    FateToolkitRollRequestUI: ["create"],
    FateToolkitOppositionPublic: ["create"],
    FateToolkitRequestState: ["create", "PLAYER_REQUESTS_FLAG"],
    FateToolkitRequestBuilder: ["create"],
    FateToolkitRequestResultValidation: ["create"],
    FateToolkitRequestResultCompute: ["create"],
    FateToolkitBoostClaimPlan: ["create"],
    FateToolkitBoostClaimCommit: ["create"],
    FateToolkitOppositionRevision: ["create"],
    FateToolkitResultActionPlan: ["create"],
    FateToolkitResultActionCommit: ["create"],
    FateToolkitRollRevision: ["create"],
    FateToolkitOppositionRefreshCompute: ["create"],
    FateToolkitActionOpposition: ["create"],
    FateToolkitActionOppositionUI: ["create"],
    FateToolkitPlayerOppositionUI: ["create"],
    FateToolkitDefendChoiceUI: ["create"],
    FateToolkitPlayerOppositionRoll: ["create"],
    FateToolkitRules: ["actorSkills", "actorStunts", "coreAllowsAction", "suggestedOppositionSkill"],
    FateToolkitActionState: ["create", "ACTION_PREFS_SETTING"],
    FateToolkitResultRules: ["outcomeFor", "boostOpportunityFor", "contextualResultOpportunity", "createdAspectOpportunity"]
  });

  function inspect() {
    const missing = [];
    for (const [serviceName, methods] of Object.entries(REQUIRED)) {
      const service = globalThis[serviceName];
      if (!service) {
        missing.push(serviceName);
        continue;
      }
      for (const method of methods) {
        if (!(method in service)) missing.push(`${serviceName}.${method}`);
      }
    }
    return missing;
  }

  function assertReady() {
    const missing = inspect();
    if (!missing.length) return true;
    throw new Error(`Fate Toolkit service contract is incomplete: ${missing.join(", ")}`);
  }

  globalThis.FateToolkitRuntimeContracts = Object.freeze({ REQUIRED, inspect, assertReady });
})();
