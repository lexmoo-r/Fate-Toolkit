(() => {
  function create({
    moduleId,
    getGmContext,
    getPlayerContext,
    debounceUi,
    bindActionSelectSearch,
    openSoundSettings,
    cancelGmRequest,
    sendGmRequest,
    actorFromRef,
    suggestedOppositionSkill,
    actorSkills,
    signed,
    oppositionActionType,
    stuntPickerHtml,
    bindStuntMacroButtons,
    ladderText,
    rollRequest,
    declineRequest,
    localize = (_key, fallback, data = null) => {
      let text = String(fallback ?? _key);
      if (data) for (const [name, value] of Object.entries(data)) text = text.replaceAll(`{${name}}`, String(value ?? ""));
      return text;
    }
  } = {}) {
    const { FawSafeWindow, deferOrRenderApp, restoreApp } = globalThis.FateToolkitWindowRuntime;
    const t = (key, fallback, data = null) => localize(key, fallback, data);
    let gmApp = null;
    let playerApp = null;

    class RollRequestApp extends FawSafeWindow {
      static FAW_GEOMETRY = { defaultWidth: 650, defaultHeight: 700, maxWidth: 920 };
      static DEFAULT_OPTIONS = {
        id: "frr-request-app",
        tag: "form",
        classes: ["frr-request-app"],
        window: {
          title: t("FRR.ControlTitle"),
          icon: "fa-solid fa-dice",
          resizable: true,
          minimizable: false
        },
        position: {
          width: 650,
          height: "auto"
        }
      };

      static PARTS = {
        main: {
          template: `modules/${moduleId}/templates/request-dialog.hbs`
        }
      };

      async _prepareContext() {
        return getGmContext();
      }

      _onRender(context, options) {
        super._onRender(context, options);
        const el = this.element;

        const targetSearch = el.querySelector('[data-request-target-search]');
        const updateTargetSearch = () => {
          if (!targetSearch?.isConnected) return;
          const query = String(targetSearch.value || "").trim().toLocaleLowerCase(game.i18n?.lang || "ru");
          const rows = Array.from(el.querySelectorAll('[data-request-target-row]'));
          let visible = 0;
          for (const row of rows) {
            row.hidden = Boolean(query && !String(row.dataset.search || "").toLocaleLowerCase(game.i18n?.lang || "ru").includes(query));
            if (!row.hidden) visible += 1;
          }
          const status = el.querySelector('[data-request-target-status]');
          if (status) status.textContent = query ? `${visible}/${rows.length}` : "";
        };
        targetSearch?.addEventListener("input", debounceUi(updateTargetSearch));
        targetSearch?.addEventListener("search", updateTargetSearch);
        updateTargetSearch();
        bindActionSelectSearch(el, '[data-request-skill-search]', 'skillName', { keepEmpty: true });
        bindActionSelectSearch(el, '[data-request-opponent-search]', 'opponentActor');

        el.querySelector('[data-action="select-all"]')?.addEventListener("click", () => {
          el.querySelectorAll('input[name="targets"]:not(:disabled)').forEach(i => i.checked = true);
        });
        el.querySelector('[data-action="select-none"]')?.addEventListener("click", () => {
          el.querySelectorAll('input[name="targets"]').forEach(i => i.checked = false);
        });

        const mode = el.querySelector('[name="oppositionMode"]');
        mode?.addEventListener("change", () => this._syncOppositionPanels());

        const actionType = el.querySelector('[name="actionType"]');
        actionType?.addEventListener("change", () => {
          this._syncActionPanels();
          this._populateOpponentSkills();
        });

        el.querySelector('[name="skillName"]')?.addEventListener("change", () => this._populateOpponentSkills());

        const opponentActor = el.querySelector('[name="opponentActor"]');
        opponentActor?.addEventListener("change", () => this._populateOpponentSkills());
        el.querySelector('[name="opponentSkill"]')?.addEventListener("change", () => this._populateOpponentStunts());
        el.querySelector('[data-request-opponent-skill-search]')?.addEventListener("input", debounceUi(() => this._populateOpponentSkills()));

        const difficulty = el.querySelector('[name="difficulty"]');
        difficulty?.addEventListener("input", () => this._updateDifficultyPreview());

        el.querySelector('[data-action="sound-settings"]')?.addEventListener("click", () => openSoundSettings());
        el.querySelector('[data-action="send"]')?.addEventListener("click", async () => {
          if (await sendGmRequest(el)) this.render({ force: true });
        });
        el.querySelectorAll('[data-action="cancel-request"]').forEach(button => {
          button.addEventListener("click", () => cancelGmRequest(button.dataset.requestId));
        });

        this._syncOppositionPanels();
        this._syncActionPanels();
        this._populateOpponentSkills();
        this._updateDifficultyPreview();
      }

      _syncActionPanels() {
        const action = this.element.querySelector('[name="actionType"]')?.value ?? "generic";
        this.element.querySelector('[data-panel="create-mode"]')?.toggleAttribute("hidden", action !== "create");
      }

      _syncOppositionPanels() {
        const mode = this.element.querySelector('[name="oppositionMode"]')?.value ?? "fixed";
        this.element.querySelector('[data-panel="fixed"]')?.toggleAttribute("hidden", mode !== "fixed");
        this.element.querySelector('[data-panel="opponent"]')?.toggleAttribute("hidden", mode !== "opponent");
      }

      _populateOpponentSkills() {
        const actorRef = this.element.querySelector('[name="opponentActor"]')?.value;
        const select = this.element.querySelector('[name="opponentSkill"]');
        if (!select) return;
        const previous = String(select.value || "");
        select.replaceChildren();
        const actor = actorFromRef(actorRef);
        const actionType = this.element.querySelector('[name="actionType"]')?.value ?? "generic";
        const sourceSkill = this.element.querySelector('[name="skillName"]')?.value ?? "";
        const suggestion = sourceSkill ? suggestedOppositionSkill({ actionType, skillName: sourceSkill }, actor) : { skill: null, reason: "" };
        const query = String(this.element.querySelector('[data-request-opponent-skill-search]')?.value || "").trim().toLocaleLowerCase(game.i18n?.lang || "ru");
        const allSkills = actorSkills(actor);
        const skills = allSkills.filter(skill => !query || String(skill.name).toLocaleLowerCase(game.i18n?.lang || "ru").includes(query));
        const searchStatus = this.element.querySelector('[data-opponent-skill-search-status]');
        if (searchStatus) searchStatus.textContent = query ? `${skills.length}/${allSkills.length}` : "";
        for (const skill of skills) {
          const option = document.createElement("option");
          option.value = skill.name;
          option.textContent = `${skill.name} (${signed(skill.rank)})`;
          if (previous === skill.name || (!previous && suggestion.skill?.name === skill.name)) option.selected = true;
          select.append(option);
        }
        if (previous && [...select.options].some(option => option.value === previous)) select.value = previous;
        else if (suggestion.skill?.name && [...select.options].some(option => option.value === suggestion.skill.name)) select.value = suggestion.skill.name;
        const hint = this.element.querySelector('[data-role="opponent-skill-hint"]');
        if (hint) hint.textContent = suggestion.reason || t("FRR.OpponentSkillHint");
        this._populateOpponentStunts();
      }

      _populateOpponentStunts() {
        const box = this.element.querySelector('[data-role="opponent-stunts"]');
        if (!box) return;
        const actor = actorFromRef(this.element.querySelector('[name="opponentActor"]')?.value);
        const skillName = this.element.querySelector('[name="opponentSkill"]')?.value || "";
        const actionType = this.element.querySelector('[name="actionType"]')?.value || "generic";
        const oppositionAction = oppositionActionType({ actionType });
        box.innerHTML = `<section class="frr-stunt-picker"><div class="frr-stunt-picker-head"><strong>${t("FRR.Dialog.OppositionStunts")}</strong><span>${t("FRR.Dialog.MarkApplicable")}</span></div>${stuntPickerHtml(actor, skillName, oppositionAction, [])}</section>`;
        bindStuntMacroButtons(box, actor);
      }

      _updateDifficultyPreview() {
        const input = this.element.querySelector('[name="difficulty"]');
        const out = this.element.querySelector('[data-role="difficulty-preview"]');
        if (!input || !out) return;
        const value = Number(input.value) || 0;
        const rung = ladderText(value);
        out.textContent = rung ? `${signed(value)} — ${rung}` : signed(value);
      }
    }

    class PlayerRollRequestsApp extends FawSafeWindow {
      static FAW_GEOMETRY = { defaultWidth: 390, defaultHeight: 430, maxWidth: 700 };
      static DEFAULT_OPTIONS = {
        id: "frr-player-requests-app",
        tag: "section",
        classes: ["frr-player-requests-app"],
        window: {
          title: t("FRR.PlayerWindowTitle"),
          icon: "fa-solid fa-dice",
          resizable: true,
          minimizable: false
        },
        position: {
          width: 390,
          height: 430
        }
      };

      static PARTS = {
        main: {
          template: `modules/${moduleId}/templates/player-requests.hbs`,
          scrollable: [".frr-player-request-list"]
        }
      };

      async _prepareContext() {
        return getPlayerContext();
      }

      _onRender(context, options) {
        super._onRender(context, options);
        const el = this.element;
        globalThis.FateToolkitUX?.bindContextMenus?.(el);
        el.querySelectorAll('[data-action="roll-request"]').forEach(button => {
          button.addEventListener("click", () => rollRequest(button.dataset.requestId));
        });
        el.querySelectorAll('[data-action="decline-request"]').forEach(button => {
          button.addEventListener("click", () => declineRequest(button.dataset.requestId));
        });
      }
    }

    async function openGm() {
      if (!game.user.isGM) return;
      if (gmApp?.rendered) {
        await restoreApp(gmApp);
        return;
      }
      gmApp = new RollRequestApp();
      await gmApp.render({ force: true });
    }

    async function openPlayer({ force = true } = {}) {
      if (game.user.isGM) return;
      if (playerApp?.rendered) {
        await restoreApp(playerApp, { rerender: true });
        return;
      }
      playerApp = new PlayerRollRequestsApp();
      await playerApp.render({ force });
    }

    function refreshGm() {
      if (gmApp?.rendered) deferOrRenderApp(gmApp);
    }

    function refreshPlayer() {
      if (playerApp?.rendered) deferOrRenderApp(playerApp);
    }

    function renderPlayerTray({ open = false, hasRequests = false } = {}) {
      if (game.user.isGM) return;
      if (!hasRequests) {
        refreshPlayer();
        return;
      }
      if (playerApp?.rendered) refreshPlayer();
      else if (open) void openPlayer();
    }

    return Object.freeze({ openGm, openPlayer, refreshGm, refreshPlayer, renderPlayerTray });
  }

  globalThis.FateToolkitRollRequestUI = Object.freeze({ create });
})();
