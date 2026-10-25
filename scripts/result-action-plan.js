(() => {
  function create({
    getMessage,
    getUser,
    actorFromUuid,
    userMayControlActor,
    contextualResultOpportunity,
    createdAspectOpportunity,
    moduleId
  } = {}) {
    function fail(message = "", level = "warn", silent = true) {
      return { ok:false, message, level, silent };
    }

    async function authorize(payload = {}, opportunityFor) {
      const message = getMessage(payload.messageId);
      if (!message) return fail();
      const flags = message.flags?.[moduleId] ?? {};
      const opportunity = opportunityFor(flags);
      if (!opportunity) return fail();
      const user = getUser(payload.userId);
      const actor = await actorFromUuid(flags.actorUuid);
      if (!user || !actor || !userMayControlActor(user, actor)) return fail();
      if (!user.isGM && String(flags.targetUserId || "") !== String(user.id)) return fail();
      return { ok:true, message, flags, opportunity, user, actor };
    }

    async function contextual(payload = {}) {
      return authorize(payload, contextualResultOpportunity);
    }

    async function createdAspect(payload = {}) {
      const checked = await authorize(payload, createdAspectOpportunity);
      if (!checked.ok) return checked;
      const name = String(payload.name || "").trim();
      if (!name) return fail();
      return { ...checked, name };
    }

    return Object.freeze({ contextual, createdAspect });
  }

  globalThis.FateToolkitResultActionPlan = Object.freeze({ create });
})();
