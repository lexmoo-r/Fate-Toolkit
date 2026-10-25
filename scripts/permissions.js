const FAW_PERMISSION_MODULE_ID = "fate-aspect-widget";

function fawPermissionPrimaryGM() {
  return game.users?.activeGM ?? null;
}

function fawPermissionIsPrimaryGM(user = game.user) {
  if (!user?.isGM) return false;
  const primary = fawPermissionPrimaryGM();
  return !primary || primary.id === user.id;
}

function fawPermissionCanControlActor(user, actor) {
  if (!user || !actor) return false;
  if (user.isGM) return true;
  try { return Boolean(actor.testUserPermission?.(user, "OWNER")); } catch (_) { return false; }
}

function fawPermissionMessageAuthorId(message) {
  const author = message?.author;
  if (author?.id) return String(author.id);
  if (message?.user?.id) return String(message.user.id);
  if (typeof message?.user === "string") return String(message.user);
  if (message?.userId) return String(message.userId);
  return null;
}

function fawPermissionRequestTargetsUser(request, userId) {
  if (!request || !userId) return false;
  return Array.isArray(request.targets) && request.targets.some(row => String(row?.userId || "") === String(userId));
}

function fawPermissionResultBelongsToUser(message, userId) {
  if (!message || !userId) return false;
  const flags = message.flags?.[FAW_PERMISSION_MODULE_ID] ?? {};
  const expected = flags.actionOppositionFor ? flags.oppositionUserId : flags.targetUserId;
  if (expected && String(expected) !== String(userId)) return false;
  const authorId = fawPermissionMessageAuthorId(message);
  if (authorId && String(authorId) !== String(userId)) return false;
  return true;
}

function fawPermissionAssertPrimaryGM() {
  if (!fawPermissionIsPrimaryGM()) throw new Error("Операцию может выполнять только основной активный мастер.");
}

globalThis.FateToolkitPermissions = Object.freeze({
  primaryActiveGM: fawPermissionPrimaryGM,
  isPrimaryGM: fawPermissionIsPrimaryGM,
  canControlActor: fawPermissionCanControlActor,
  messageAuthorId: fawPermissionMessageAuthorId,
  requestTargetsUser: fawPermissionRequestTargetsUser,
  resultBelongsToUser: fawPermissionResultBelongsToUser,
  assertPrimaryGM: fawPermissionAssertPrimaryGM
});
