(() => {
  const { numberValue } = globalThis.FateToolkitRollPresentation;

  function actionLabel(action) {
    return ({
      overcome: "Преодоление",
      create: "Создание преимущества",
      attack: "Атака",
      defend: "Защита",
      generic: "Проверка"
    })[action] ?? "Проверка";
  }

  function outcomeFor(action, difference, options = {}) {
    const diff = numberValue(difference);
    const defendedAgainst = options.defendedAgainst || "attack";
    const defendedCreateMode = options.defendedCreateMode || "new";

    // "Defend against overcome" is not a defend action in Fate Core. It is ordinary
    // active opposition. Resolve the incoming overcome result without granting the
    // defender the extra boost normally attached to a defend success with style.
    if (action === "defend" && defendedAgainst === "overcome") {
      const incomingDiff = -diff;
      if (incomingDiff < 0) return { key: "success", title: "Оппозиция успешна", detail: "Преодоление не проходит; действующий персонаж может отказаться от цели или добиться её только серьёзной ценой." };
      if (incomingDiff === 0) return { key: "tie", title: "Ничья", detail: "Преодоление проходит с малой ценой." };
      if (incomingDiff >= 3) return { key: "failure", title: "Преодоление со стилем", detail: "Противник достигает цели и получает усиление." };
      return { key: "failure", title: "Преодоление успешно", detail: "Противник достигает цели без дополнительной цены." };
    }

    if (diff < 0) {
      if (action === "defend") {
        const incomingDiff = -diff;
        if (defendedAgainst === "attack") {
          return {
            key: "failure",
            title: "Защита провалена",
            detail: incomingDiff >= 3
              ? `Входящая атака попадает на ${incomingDiff} сдвига и имеет успех со стилем.`
              : `Входящая атака попадает на ${incomingDiff} сдвига.`
          };
        }
        if (defendedAgainst === "create") {
          if (defendedCreateMode === "existing") {
            return {
              key: "failure",
              title: "Защита провалена",
              detail: incomingDiff >= 3
                ? "Противник получает два бесплатных призывания существующего аспекта."
                : "Противник получает одно бесплатное призывание существующего аспекта."
            };
          }
          return {
            key: "failure",
            title: "Защита провалена",
            detail: incomingDiff >= 3
              ? "Противник создаёт аспект с двумя бесплатными призываниями."
              : "Противник создаёт аспект с одним бесплатным призыванием."
          };
        }
      }
      if (action === "create") {
        return {
          key: "failure",
          title: "Провал",
          detail: options.createMode === "existing"
            ? "Свободное призывание существующего аспекта получает кто-то другой, кому результат идёт на пользу."
            : "Новый аспект либо не создаётся, либо создаётся, но его бесплатное призывание получает кто-то другой, кому результат идёт на пользу."
        };
      }
      if (action === "overcome") {
        return { key: "failure", title: "Провал", detail: "Цель не достигнута; вместо провала можно согласиться на успех с серьёзной ценой." };
      }
      if (action === "attack") return { key: "failure", title: "Провал", detail: "Атака не причиняет вреда." };
      return { key: "failure", title: "Провал", detail: "Оппозиция оказалась сильнее." };
    }

    if (diff === 0) {
      let detail;
      if (action === "defend") {
        if (defendedAgainst === "attack") detail = "Ничья: входящая атака не наносит вреда, но атакующий получает усиление.";
        else if (defendedAgainst === "create" && defendedCreateMode === "existing") detail = "Ничья: противник получает одно бесплатное призывание существующего аспекта.";
        else if (defendedAgainst === "create") detail = "Ничья: противник получает усиление вместо нового аспекта.";
        else detail = "Результат равен оппозиции.";
      } else {
        detail = ({
          overcome: "Цель достигнута с малой ценой.",
          create: options.createMode === "existing" ? "Добавьте одно бесплатное призывание существующему аспекту." : "Получено усиление вместо нового аспекта.",
          attack: "Вреда нет; атакующий получает усиление.",
          generic: "Результат равен оппозиции."
        })[action] ?? "Результат равен оппозиции.";
      }
      return { key: "tie", title: "Ничья", detail };
    }

    if (diff >= 3) {
      const detail = ({
        create: options.createMode === "existing" ? "Добавьте два бесплатных призывания существующему аспекту." : "Создаётся аспект с двумя бесплатными призываниями.",
        attack: `Попадание на ${diff} сдвига; можно уменьшить удар на 1 сдвиг и получить усиление.`,
        overcome: "Цель достигнута, и вы получаете усиление.",
        defend: "Действие противника предотвращено, и защищающийся получает усиление.",
        generic: "Успех со стилем."
      })[action] ?? "Успех со стилем.";
      return { key: "style", title: "Успех со стилем", detail };
    }

    const detail = action === "attack"
      ? `Попадание на ${diff} сдвига.`
      : action === "create"
        ? (options.createMode === "existing" ? "Добавьте одно бесплатное призывание существующему аспекту." : "Создаётся аспект с одним бесплатным призыванием.")
        : action === "defend"
          ? "Действие противника предотвращено."
          : action === "overcome"
            ? "Цель достигнута без дополнительной цены."
            : "Успех.";
    return { key: "success", title: "Успех", detail };
  }

  function boostOpportunityFor(action, difference, opposition, options = {}) {
    if (!Number.isFinite(Number(difference))) return null;
    const diff = Number(difference);

    if (action === "create" && diff === 0 && options.createMode !== "existing") {
      return { recipient: "roller", reason: "create-tie", tradeShift: false };
    }
    if (action === "attack" && diff === 0) {
      return { recipient: "roller", reason: "attack-tie", tradeShift: false };
    }
    if (action === "overcome" && diff >= 3) {
      return { recipient: "roller", reason: "overcome-style", tradeShift: false };
    }
    if (action === "defend" && diff >= 3 && (options.defendedAgainst || "attack") !== "overcome") {
      return { recipient: "roller", reason: "defend-style", tradeShift: false };
    }
    if (action === "attack" && diff >= 3) {
      return { recipient: "roller", reason: "attack-style-trade", tradeShift: true };
    }

    if (action === "defend" && opposition?.actorUuid) {
      const incoming = options.defendedAgainst || "attack";
      const incomingCreate = options.defendedCreateMode || "new";
      if (diff === 0 && (incoming === "attack" || (incoming === "create" && incomingCreate !== "existing"))) {
        return { recipient: "opponent", reason: "defend-tie", tradeShift: false };
      }
      if (diff <= -3 && incoming === "overcome") {
        return { recipient: "opponent", reason: "opponent-overcome-style", tradeShift: false };
      }
      if (diff <= -3 && incoming === "attack") {
        return { recipient: "opponent", reason: "opponent-attack-style-trade", tradeShift: true };
      }
    }

    if ((action === "attack" || action === "create") && diff <= -3 && opposition?.actorUuid) {
      return { recipient: "opponent", reason: "opponent-defend-style", tradeShift: false };
    }

    return null;
  }

  function contextualResultOpportunity(flags) {
    if (!flags?.resolved || flags.contextResultApplied) return null;
    const target = flags.actionTarget;
    if (target?.type !== "marker") return null;
    const source = target.source && typeof target.source === "object" ? target.source : null;
    const outcome = String(flags.outcome || "");

    if (flags.actionType === "create" && flags.createMode === "existing" && ["tie", "success", "style"].includes(outcome)) {
      if (!source || !["game", "scene"].includes(source.kind)) return null;
      const amount = outcome === "style" ? 2 : 1;
      return {
        kind: "add-invokes",
        amount,
        name: String(target.name || target.text || "Аспект"),
        source,
        markerId: target.markerId || null,
        sceneId: target.sceneId || flags.sceneId || null,
        label: amount === 1 ? "Добавить бесплатное призывание" : `Добавить ${amount} бесплатных призывания`
      };
    }

    if (flags.actionType === "overcome" && ["tie", "success", "style"].includes(outcome)) {
      if (source && !["game", "scene"].includes(source.kind)) return null;
      return {
        kind: source ? "remove-source" : "remove-marker",
        amount: 0,
        name: String(target.name || target.text || "Аспект"),
        source,
        markerId: target.markerId || null,
        sceneId: target.sceneId || flags.sceneId || null,
        label: "Преодолеть аспект"
      };
    }
    return null;
  }

  function createdAspectOpportunity(flags) {
    if (!flags?.resolved || flags.actionType !== "create" || flags.createMode === "existing") return null;
    if (!flags.sceneId || flags.createdAspectClaimed) return null;
    if (flags.outcome === "style") return { freeInvokes: 2 };
    if (flags.outcome === "success") return { freeInvokes: 1 };
    return null;
  }

  globalThis.FateToolkitResultRules = Object.freeze({
    actionLabel, outcomeFor, boostOpportunityFor, contextualResultOpportunity, createdAspectOpportunity
  });
})();
