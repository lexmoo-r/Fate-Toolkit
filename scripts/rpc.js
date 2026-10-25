const FAW_RPC_MODULE_ID = "fate-aspect-widget";

const fawRpcHandlers = new Map();
const fawRpcRegistered = new Set();
let fawRpcSocket = null;
let fawRpcReady = false;

function fawRpcHandlerName(channel) {
  return `faw:${String(channel)}`;
}

function fawRpcPrimaryGM() {
  return game.users?.activeGM ?? null;
}

function fawRpcRegisterRemote(channel) {
  if (!fawRpcSocket || fawRpcRegistered.has(channel)) return;
  const handlerName = fawRpcHandlerName(channel);
  fawRpcSocket.register(handlerName, async function(payload = {}) {
    const senderId = String(this?.socketdata?.userId || "");
    const handler = fawRpcHandlers.get(channel);
    if (!handler) throw new Error(`Fate Toolkit RPC handler is not registered: ${channel}`);
    return handler(payload, { senderId, remote: true });
  });
  fawRpcRegistered.add(channel);
}

function fawRpcRegister(channel, handler) {
  if (!channel || typeof handler !== "function") throw new Error("Fate Toolkit RPC requires a channel and handler.");
  fawRpcHandlers.set(String(channel), handler);
  fawRpcRegisterRemote(String(channel));
}

async function fawRpcExecuteLocal(channel, payload = {}) {
  const handler = fawRpcHandlers.get(String(channel));
  if (!handler) throw new Error(`Fate Toolkit RPC handler is not registered: ${channel}`);
  return handler(payload, { senderId: String(game.user?.id || ""), remote: false });
}

async function fawRpcExecuteAsGM(channel, payload = {}) {
  const gm = fawRpcPrimaryGM();
  if (!gm) throw new Error("Нет активного мастера.");
  if (gm.id === game.user?.id) return fawRpcExecuteLocal(channel, payload);
  if (!fawRpcSocket) throw new Error("socketlib не готов: защищённая операция недоступна.");
  return fawRpcSocket.executeAsGM(fawRpcHandlerName(channel), payload);
}

async function fawRpcExecuteAsUser(channel, userId, payload = {}) {
  const id = String(userId || "");
  if (!id) throw new Error("Не указан получатель RPC.");
  if (id === game.user?.id) return fawRpcExecuteLocal(channel, payload);
  if (!fawRpcSocket) throw new Error("socketlib не готов: защищённая операция недоступна.");
  return fawRpcSocket.executeAsUser(fawRpcHandlerName(channel), id, payload);
}

async function fawRpcExecuteForUsers(channel, userIds, payload = {}) {
  const ids = [...new Set((userIds || []).map(id => String(id || "")).filter(Boolean))];
  const results = [];
  for (const id of ids) {
    try {
      results.push({ userId: id, ok: true, value: await fawRpcExecuteAsUser(channel, id, payload) });
    } catch (error) {
      results.push({ userId: id, ok: false, error: String(error?.message || error) });
    }
  }
  return results;
}

function fawRpcSenderIsGM(senderId) {
  return Boolean(game.users?.get?.(String(senderId || ""))?.isGM);
}

function fawRpcAssertSender(senderId, expectedUserId) {
  if (!senderId || String(senderId) !== String(expectedUserId || "")) {
    throw new Error("Отклонён RPC-запрос с несовпадающим отправителем.");
  }
}

function fawRpcAssertGM(senderId) {
  if (!fawRpcSenderIsGM(senderId)) throw new Error("Отклонён RPC-запрос не от мастера.");
}

function fawRpcInstall() {
  if (fawRpcReady) return;
  if (!globalThis.socketlib?.registerModule) {
    console.error(`${FAW_RPC_MODULE_ID} | socketlib is required for authenticated RPC.`);
    return;
  }
  fawRpcSocket = globalThis.socketlib.registerModule(FAW_RPC_MODULE_ID);
  fawRpcReady = true;
  for (const channel of fawRpcHandlers.keys()) fawRpcRegisterRemote(channel);
}

globalThis.FateToolkitRPC = Object.freeze({
  register: fawRpcRegister,
  executeLocal: fawRpcExecuteLocal,
  executeAsGM: fawRpcExecuteAsGM,
  executeAsUser: fawRpcExecuteAsUser,
  executeForUsers: fawRpcExecuteForUsers,
  assertSender: fawRpcAssertSender,
  assertGM: fawRpcAssertGM,
  senderIsGM: fawRpcSenderIsGM,
  primaryActiveGM: fawRpcPrimaryGM,
  get ready() { return fawRpcReady; }
});

Hooks.once("socketlib.ready", fawRpcInstall);
Hooks.once("ready", () => {
  if (!fawRpcReady) fawRpcInstall();
});
