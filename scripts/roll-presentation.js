(() => {
  const MODULE_ID = "fate-aspect-widget";
  const SYSTEM_ID = "fate-core-official";
  const BLOCK_END = "<!--frr:end-->";

  function plainText(value) {
    return String(value ?? '')
      .replace(/<br\s*\/?\s*>/gi, ' · ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '\"')
      .replace(/&#0?39;/gi, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }


  function stuntBonusTotal(stunts) {
    return (stunts || []).reduce((sum, stunt) => sum + (Number(stunt?.bonus) || 0), 0);
  }


  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function t(key, fallback, data = {}) {
    try {
      const hasData = data && Object.keys(data).length > 0;
      const value = hasData ? game.i18n?.format?.(key, data) : game.i18n?.localize?.(key);
      if (value && value !== key) return String(value);
    } catch (_) {}
    let value = String(fallback ?? key);
    for (const [name, replacement] of Object.entries(data ?? {})) value = value.replaceAll(`{${name}}`, String(replacement));
    return value;
  }

  function debounceUi(fn, delay = 75) {
    let timer = null;
    return (...args) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        fn(...args);
      }, delay);
    };
  }

  function signed(n) {
    const v = Number(n) || 0;
    return v >= 0 ? `+${v}` : `${v}`;
  }


  function numberValue(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function fateDieGlyph(value) {
    const n = Number(value);
    if (n === 1) return "+";
    if (n === -1) return "−";
    if (n === 0) return "0";
    return signed(n);
  }

  function rollDiceValues(roll) {
    const values = [];
    for (const die of roll?.dice ?? []) {
      const results = Array.isArray(die?.results)
        ? die.results.map(result => Number(result?.result))
        : Array.from(die?.values ?? []).map(Number);
      for (const value of results) if (Number.isFinite(value)) values.push(value);
    }
    return values;
  }

  function diceSignatureFromValues(values) {
    return JSON.stringify((values ?? []).map(Number));
  }

  function flavorAnnotationLines(flavor) {
    const source = String(flavor ?? "");
    const blockEnd = source.lastIndexOf(BLOCK_END);
    const suffix = blockEnd >= 0 ? source.slice(blockEnd + BLOCK_END.length) : source;
    return suffix
      .split(/<br\s*\/?\s*>/i)
      .map(plainText)
      .map(line => line.trim())
      .filter(Boolean);
  }

  function trailingParentheticalAfter(line, marker) {
    const source = String(line ?? "");
    const markerIndex = marker ? source.indexOf(marker) : -1;
    const tail = markerIndex >= 0 ? source.slice(markerIndex + String(marker).length) : source;
    const open = tail.indexOf("(");
    const close = tail.lastIndexOf(")");
    if (open < 0 || close <= open) return "";
    return tail.slice(open + 1, close).trim();
  }

  // Parser-only compatibility alias. UI localization belongs to this module;
  // Fate Core Official has no Russian locale, so never use its i18n for display.
  function localizedSystemLabel(key, fallback = "") {
    return globalThis.FateToolkitI18n?.aliases?.(key)?.[0] || fallback;
  }

  function parseFateSystemAnnotations(flavor) {
    const lines = flavorAnnotationLines(flavor);
    const numeric = [];
    const events = [];
    const labels = {
      paidInvoke: localizedSystemLabel("PaidInvoke", "Paid Invoke"),
      freeInvokes: localizedSystemLabel("FreeInvokes", "Free Invokes"),
      freeReroll: localizedSystemLabel("FreeInvokeReroll", "Free Invoke Reroll"),
      paidReroll: localizedSystemLabel("PaidInvokeReroll", "Paid Invoke Reroll"),
      plusOne: localizedSystemLabel("PlusOne", "+1")
    };

    for (const line of lines) {
      if (!line) continue;

      // Fate Toolkit v0.13+ writes its own hidden audit annotations so paid invokes
      // and rerolls retain the actual aspect name instead of the system's generic label.
      const fawPaidInvoke = line.match(/^FAW_INVOKE_PAID\s+([+-]?\d+)\s+\((.*)\)$/i);
      if (fawPaidInvoke) {
        numeric.push({ type: "paid-invoke", amount: Number(fawPaidInvoke[1]) || 0, label: t("FRR.Chat.AuditInvoke", "Призыв: {name}", { name: fawPaidInvoke[2].trim() }) });
        continue;
      }
      const fawFreeInvoke = line.match(/^FAW_INVOKE_FREE\s+([+-]?\d+)\s+\((.*)\)$/i);
      if (fawFreeInvoke) {
        numeric.push({ type: "free-invoke", amount: Number(fawFreeInvoke[1]) || 0, label: t("FRR.Chat.AuditFreeInvoke", "Бесплатный призыв: {name}", { name: fawFreeInvoke[2].trim() }) });
        continue;
      }
      const fawPaidReroll = line.match(/^FAW_REROLL_PAID\s+\((.*)\)$/i);
      if (fawPaidReroll) {
        events.push({ type: "reroll-paid", label: t("FRR.Chat.AuditPaidReroll", "Реролл за Волю: {name}", { name: fawPaidReroll[1].trim() }) });
        continue;
      }
      const fawFreeReroll = line.match(/^FAW_REROLL_FREE\s+\((.*)\)$/i);
      if (fawFreeReroll) {
        events.push({ type: "reroll-free", label: t("FRR.Chat.AuditFreeReroll", "Бесплатный реролл: {name}", { name: fawFreeReroll[1].trim() }) });
        continue;
      }

      if (labels.paidReroll && line.includes(labels.paidReroll)) {
        events.push({ type: "reroll-paid", label: t("FRR.Chat.AuditPaidRerollUnknown", "Реролл за Волю (аспект не записан системой)") });
        continue;
      }
      if (labels.freeReroll && line.includes(labels.freeReroll)) {
        // Fate Core Official records the selected free-invoke aspect/boost in parentheses
        // after the reroll annotation. Keep that source visible when the system provides it.
        const source = trailingParentheticalAfter(line, labels.freeReroll);
        events.push({
          type: "reroll-free",
          label: source ? t("FRR.Chat.AuditFreeReroll", "Бесплатный реролл: {name}", { name: source }) : t("FRR.Chat.FreeReroll", "Бесплатный реролл")
        });
        continue;
      }

      const paidModifier = line.match(/^Paid Modifier:\s*([+-]?\d+)\s*(?:\((.*)\))?$/i);
      if (paidModifier) {
        numeric.push({
          type: "paid-manual",
          amount: Number(paidModifier[1]) || 0,
          label: paidModifier[2]?.trim() ? t("FRR.Chat.PaidModifierNamed", "Платный модификатор: {name}", { name: paidModifier[2].trim() }) : t("FRR.Chat.PaidModifier", "Платный модификатор")
        });
        continue;
      }
      const manual = line.match(/^Modifier:\s*([+-]?\d+)\s*(?:\((.*)\))?$/i);
      if (manual) {
        numeric.push({
          type: "manual",
          amount: Number(manual[1]) || 0,
          label: manual[2]?.trim() ? t("FRR.Chat.ModifierNamed", "Модификатор: {name}", { name: manual[2].trim() }) : t("FRR.Chat.Modifier", "Модификатор")
        });
        continue;
      }

      if (labels.freeInvokes && line.includes(labels.freeInvokes)) {
        const amountMatch = line.match(/([+-]\d+)/);
        const amount = amountMatch ? Number(amountMatch[1]) : 0;
        const aspectNames = trailingParentheticalAfter(line, labels.freeInvokes);
        if (amount) numeric.push({
          type: "free-invoke",
          amount,
          label: aspectNames ? t("FRR.Chat.FreeInvokesNamed", "Бесплатные призывы: {name}", { name: aspectNames }) : t("FRR.Chat.FreeInvokesAspects", "Бесплатные призывы аспектов")
        });
        continue;
      }

      if (labels.plusOne && line === labels.plusOne) {
        numeric.push({ type: "plus-one", amount: 1, label: t("FRR.Chat.FreePlusOne", "Свободный +1 (обычно командная работа)") });
        continue;
      }

      // PaidInvoke is intentionally checked after PaidInvokeReroll: the localized strings
      // can share words and the reroll must not be mistaken for an extra +2.
      if (labels.paidInvoke && line === labels.paidInvoke) {
        numeric.push({ type: "paid-invoke", amount: 2, label: t("FRR.Chat.PaidInvokeUnknown", "Платный призыв аспекта (название не записано системой)") });
        continue;
      }
    }

    return { numeric, events, lines };
  }

  function modifierSum(sources) {
    return (sources ?? []).reduce((sum, source) => sum + numberValue(source?.amount), 0);
  }

  function normalizedModifierSources({ previousSources = [], parsedSources = [], inferredBonus = 0 } = {}) {
    const target = numberValue(inferredBonus);
    const previous = (previousSources ?? []).map(source => ({ ...source, amount: numberValue(source.amount) }));
    const parsed = (parsedSources ?? []).map(source => ({ ...source, amount: numberValue(source.amount) }));

    // Fate Core Official sometimes rewrites flavor with the full accumulated annotation history,
    // and sometimes appends only the newest annotation. Prefer whichever set exactly explains
    // the current numerical total.
    if (modifierSum(parsed) === target) return parsed;
    if (modifierSum(previous) === target && !parsed.length) return previous;
    if (modifierSum([...previous, ...parsed]) === target) return [...previous, ...parsed];

    const base = previous.length ? previous : parsed;
    const known = modifierSum(base);
    const delta = target - known;
    if (!delta) return base;
    return [...base, { type: "untracked", amount: delta, label: t("FRR.Chat.ExternalModifier", "Внешний/ручной модификатор (источник не записан)") }];
  }

  function snapshotRollMath(roll, {
    skillName = "",
    skillRank = 0,
    stunts = [],
    stuntBonus = null,
    previousSnapshot = null,
    previousSources = [],
    flavor = ""
  } = {}) {
    const diceValues = rollDiceValues(roll);
    const diceTotal = diceValues.reduce((sum, value) => sum + value, 0);
    const rank = numberValue(skillRank);
    const stuntRows = (stunts ?? []).map(stunt => ({
      key: stunt?.key ?? null,
      name: String(stunt?.name ?? t("FRR.Chat.Stunt", "Трюк")),
      bonus: numberValue(stunt?.bonus),
      linkedSkill: stunt?.linkedSkill ?? stunt?.linked_skill ?? null
    }));
    const stuntTotal = stuntBonus === null ? stuntBonusTotal(stuntRows) : numberValue(stuntBonus);
    const total = numberValue(roll?.total);
    const inferredBonus = total - diceTotal - rank - stuntTotal;
    const annotations = parseFateSystemAnnotations(flavor);
    const modifierSources = normalizedModifierSources({
      previousSources,
      parsedSources: annotations.numeric,
      inferredBonus
    });
    const diceSignature = diceSignatureFromValues(diceValues);
    const previousDiceSignature = previousSnapshot?.diceSignature || diceSignatureFromValues(previousSnapshot?.diceValues ?? []);
    const event = annotations.events.at(-1) ?? null;
    const rerolled = Boolean(previousSnapshot && (previousDiceSignature !== diceSignature || annotations.events.some(entry => String(entry?.type || "").startsWith("reroll"))));
    const revisionType = !previousSnapshot
      ? "initial"
      : rerolled
        ? (event?.type || "reroll")
        : total !== numberValue(previousSnapshot.total)
          ? "modifier"
          : "update";

    return {
      skillName: String(skillName || previousSnapshot?.skillName || ""),
      skillRank: rank,
      diceValues,
      diceTotal,
      diceSignature,
      stunts: stuntRows,
      stuntBonus: stuntTotal,
      modifierSources,
      extraBonus: modifierSum(modifierSources),
      total,
      revisionType,
      revisionLabel: event?.label || (revisionType === "initial" ? t("FRR.Chat.InitialRoll", "Первый бросок") : revisionType === "modifier" ? t("FRR.Chat.ResultChanged", "Результат изменён") : revisionType === "reroll" ? t("FRR.Chat.Reroll", "Реролл") : t("FRR.Chat.Update", "Обновление")),
      revisionEvent: event ? { ...event } : null
    };
  }

  function compactHistory(history, max = 8) {
    const rows = Array.isArray(history) ? history.filter(Boolean) : [];
    return rows.slice(Math.max(0, rows.length - max));
  }

  function sameMathSnapshot(a, b) {
    if (!a || !b) return false;
    if (a.diceSignature !== b.diceSignature) return false;
    if (numberValue(a.total) !== numberValue(b.total)) return false;
    if (String(a.revisionType || "") !== String(b.revisionType || "")) return false;
    if (String(a.revisionLabel || "") !== String(b.revisionLabel || "")) return false;
    return JSON.stringify(a.modifierSources || []) === JSON.stringify(b.modifierSources || []);
  }

  function appendMathHistory(history, snapshot) {
    const rows = Array.isArray(history) ? [...history] : [];
    if (!snapshot) return compactHistory(rows);
    const last = rows.at(-1);
    const isExplicitReroll = String(snapshot?.revisionType || "").startsWith("reroll");
    if (!isExplicitReroll && last && last.diceSignature === snapshot.diceSignature && numberValue(last.total) === numberValue(snapshot.total)) {
      rows[rows.length - 1] = snapshot;
    } else {
      rows.push(snapshot);
    }
    return compactHistory(rows);
  }


  const ACTION_AUDIT_LIMIT = 60;

  function auditUserName(userId) {
    return game.users.get(userId)?.name || t("FRR.Chat.System", "Система");
  }

  function makeAuditEntry(type, label, detail = "", { userId = game.user?.id ?? null, timestamp = Date.now(), fingerprint = "" } = {}) {
    const safeType = String(type || "event");
    const safeLabel = String(label || t("FRR.Chat.Event", "Событие"));
    const safeDetail = String(detail || "");
    return {
      id: foundry.utils.randomID(),
      type: safeType,
      label: safeLabel,
      detail: safeDetail,
      userId: userId || null,
      userName: userId ? auditUserName(userId) : t("FRR.Chat.System", "Система"),
      timestamp: Number(timestamp) || Date.now(),
      fingerprint: String(fingerprint || `${safeType}:${safeLabel}:${safeDetail}:${Number(timestamp) || Date.now()}`)
    };
  }

  function appendActionAudit(existing, entry) {
    const rows = Array.isArray(existing) ? existing.filter(Boolean).map(row => foundry.utils.duplicate(row)) : [];
    if (!entry) return rows.slice(-ACTION_AUDIT_LIMIT);
    const fp = String(entry.fingerprint || "");
    if (fp && rows.some(row => String(row?.fingerprint || "") === fp)) return rows.slice(-ACTION_AUDIT_LIMIT);
    rows.push(entry);
    return rows.slice(-ACTION_AUDIT_LIMIT);
  }

  function auditIcon(type) {
    return ({
      roll: "fa-solid fa-dice",
      stunt: "fa-solid fa-wand-magic-sparkles",
      result: "fa-solid fa-scale-balanced",
      invoke: "fa-solid fa-sparkles",
      reroll: "fa-solid fa-rotate",
      boost: "fa-solid fa-bolt",
      aspect: "fa-solid fa-tag",
      stress: "fa-solid fa-shield-halved",
      consequence: "fa-solid fa-bandage",
      damage: "fa-solid fa-heart-crack",
      takenout: "fa-solid fa-skull",
      turn: "fa-solid fa-check",
      opposition: "fa-solid fa-shield"
    })[type] || "fa-solid fa-circle";
  }

  function auditTime(timestamp) {
    try {
      return new Intl.DateTimeFormat(game.i18n.lang || undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(Number(timestamp) || Date.now()));
    } catch (_) {
      return "";
    }
  }

  async function appendMessageAudit(messageOrId, event = {}) {
    const message = typeof messageOrId === "string" ? game.messages.get(messageOrId) : messageOrId;
    if (!message) return false;
    const flags = message.flags?.[MODULE_ID] ?? {};
    const entry = makeAuditEntry(event.type, event.label, event.detail, {
      userId: event.userId ?? game.user?.id ?? null,
      timestamp: event.timestamp ?? Date.now(),
      fingerprint: event.fingerprint ?? ""
    });
    const next = appendActionAudit(flags.auditTrail || [], entry);
    flags.auditTrail = next;
    await message.update({ [`flags.${MODULE_ID}.auditTrail`]: next });
    return true;
  }

  function chatHistoryDefaultOpen() {
    try {
      return Boolean(game.settings.get(MODULE_ID, "chatHistoryDefaultOpen"));
    } catch (_) {
      return false;
    }
  }

  function injectActionAudit(message, html) {
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root) return;
    root.querySelectorAll(".frr-action-audit").forEach(node => node.remove());
    const card = root.querySelector(".frr-chat-result");
    if (!card) return;
    const flags = message.flags?.[MODULE_ID] ?? {};
    const rows = Array.isArray(flags.auditTrail) ? flags.auditTrail.filter(Boolean) : [];
    if (!rows.length) return;
    const details = document.createElement("details");
    details.className = "frr-action-audit";
    details.open = chatHistoryDefaultOpen();
    details.innerHTML = `<summary><i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i><span>${esc(t("FRR.Chat.ActionHistory", "История действия"))}</span><b>${rows.length}</b></summary><div class="frr-action-audit-list">${rows.map(row => {
      const detail = row.detail ? `<span>${esc(row.detail)}</span>` : "";
      const meta = game.user.isGM ? `<small>${esc(row.userName || auditUserName(row.userId))}${row.timestamp ? ` · ${esc(auditTime(row.timestamp))}` : ""}</small>` : "";
      return `<div class="frr-action-audit-row"><i class="${auditIcon(row.type)}" aria-hidden="true"></i><div><strong>${esc(row.label || t("FRR.Chat.Event", "Событие"))}</strong>${detail}${meta}</div></div>`;
    }).join("")}</div>`;
    card.append(details);
  }

  function mathRowsHtml(math, { historyMode = false } = {}) {
    if (!math) return `<div class="frr-math-row"><span>${esc(t("FRR.Chat.Math", "Математика"))}</span><strong>${esc(t("FRR.Chat.Unavailable", "недоступна"))}</strong></div>`;
    const rows = [];
    const dice = (math.diceValues ?? []).map(fateDieGlyph).join(" ") || "—";
    rows.push(`<div class="frr-math-row"><span>${esc(t("FRR.Chat.Dice", "Кубики (4dF)"))}</span><strong>[${esc(dice)}] = ${signed(math.diceTotal)}</strong></div>`);
    rows.push(`<div class="frr-math-row"><span>${math.skillName ? t("FRR.Chat.SkillColon", "Навык: {name}", { name: esc(math.skillName) }) : t("FRR.Chat.Skill", "Навык")}</span><strong>${signed(math.skillRank)}</strong></div>`);
    for (const stunt of math.stunts ?? []) {
      rows.push(`<div class="frr-math-row frr-math-sub"><span>${esc(t("FRR.Chat.Stunt", "Трюк"))}: ${esc(stunt.name)}</span><strong>${signed(stunt.bonus)}</strong></div>`);
    }
    for (const source of math.modifierSources ?? []) {
      rows.push(`<div class="frr-math-row frr-math-sub"><span>${esc(source.label || t("FRR.Chat.Modifier", "Модификатор"))}</span><strong>${signed(source.amount)}</strong></div>`);
    }
    rows.push(`<div class="frr-math-row frr-math-total${historyMode ? " is-history" : ""}"><span>${esc(t("FRR.Chat.Total", "Итого"))}</span><strong>${signed(math.total)}</strong></div>`);
    return rows.join("");
  }

  function compactMathFormula(math) {
    if (!math) return t("FRR.Chat.MathUnavailable", "Математика недоступна");
    const parts = [];
    const dice = (math.diceValues ?? []).map(fateDieGlyph).join(" ") || "—";
    parts.push(`4dF [${dice}] = ${signed(math.diceTotal)}`);
    parts.push(`${math.skillName ? t("FRR.Chat.SkillNamed", "Навык {name}", { name: math.skillName }) : t("FRR.Chat.Skill", "Навык")} ${signed(math.skillRank)}`);
    for (const stunt of math.stunts ?? []) parts.push(`${t("FRR.Chat.Stunt", "Трюк")} ${stunt.name} ${signed(stunt.bonus)}`);
    for (const source of math.modifierSources ?? []) parts.push(`${source.label || t("FRR.Chat.Modifier", "Модификатор")} ${signed(source.amount)}`);
    return `${parts.join(" · ")} · ${t("FRR.Chat.Total", "Итого")} ${signed(math.total)}`;
  }

  function historyHtml(history, actorName = "") {
    const rows = compactHistory(history);
    if (rows.length <= 1) return "";
    const actorSuffix = actorName ? ` — ${esc(actorName)}` : "";
    return `<details class="frr-roll-history"${chatHistoryDefaultOpen() ? " open" : ""}><summary>${esc(t("FRR.Chat.RollHistory", "История броска"))}${actorSuffix} (${rows.length})</summary><div class="frr-roll-history-list">${rows.map((entry, index) => {
      const label = index === 0 ? t("FRR.Chat.InitialRoll", "Первый бросок") : (entry.revisionLabel || t("FRR.Chat.Version", "Версия {number}", { number: index + 1 }));
      return `<div class="frr-history-row ${index === rows.length - 1 ? "is-current" : ""}">
        <div class="frr-history-heading"><strong>#${index + 1} · ${esc(label)}</strong><b>${signed(entry.total)}</b></div>
        <div class="frr-history-math">${mathRowsHtml(entry, { historyMode: true })}</div>
      </div>`;
    }).join("")}</div></details>`;
  }

  function revisionBadgeHtml(history) {
    const rows = compactHistory(history);
    if (rows.length <= 1) return "";
    const current = rows.at(-1);
    const label = current?.revisionLabel || (String(current?.revisionType || "").startsWith("reroll") ? t("FRR.Chat.Reroll", "Реролл") : t("FRR.Chat.ResultChanged", "Результат изменён"));
    return `<div class="frr-revision-badge"><i class="fa-solid fa-rotate" aria-hidden="true"></i> ${esc(label)}</div>`;
  }

  function previousResultHtml(history) {
    const rows = compactHistory(history);
    if (rows.length <= 1) return "";
    const current = rows.at(-1);
    const previous = rows.at(-2);
    const label = String(current?.revisionType || "").startsWith("reroll") ? t("FRR.Chat.BeforeReroll", "До реролла") : t("FRR.Chat.BeforeChange", "До изменения");
    return `<div class="frr-previous-result"><span>${label}</span><strong>${signed(previous?.total)}</strong></div>`;
  }

  function oppositionStandaloneFlavor({ actorName = t("FRR.Chat.Opposition", "Оппозиция"), againstName = t("FRR.Chat.ActionObject", "действия"), actionLabel: incomingAction = t("FRR.Chat.Action", "Действие"), math = null, history = [] } = {}) {
    return `<div class="frr-chat-result frr-opposition-audit"><div class="frr-resolution-matchup">${esc(t("FRR.Chat.Versus", "{a} против {b}", { a: actorName, b: againstName }))}</div><div class="frr-resolution-action">${esc(t("FRR.Chat.ActiveOpposition", "Активная оппозиция"))} · ${esc(incomingAction)}</div>${revisionBadgeHtml(history)}<section class="frr-math-side"><h4>${esc(actorName)}</h4>${mathRowsHtml(math)}${previousResultHtml(history)}</section>${historyHtml(history, actorName)}</div>`;
  }

  globalThis.FateToolkitRollPresentation = Object.freeze({
    esc,
    debounceUi,
    signed,
    numberValue,
    fateDieGlyph,
    rollDiceValues,
    diceSignatureFromValues,
    flavorAnnotationLines,
    trailingParentheticalAfter,
    localizedSystemLabel,
    parseFateSystemAnnotations,
    modifierSum,
    normalizedModifierSources,
    snapshotRollMath,
    compactHistory,
    sameMathSnapshot,
    appendMathHistory,
    auditUserName,
    makeAuditEntry,
    appendActionAudit,
    auditIcon,
    auditTime,
    appendMessageAudit,
    chatHistoryDefaultOpen,
    injectActionAudit,
    mathRowsHtml,
    compactMathFormula,
    historyHtml,
    revisionBadgeHtml,
    previousResultHtml,
    oppositionStandaloneFlavor,
    plainText,
    stuntBonusTotal
  });
})();
