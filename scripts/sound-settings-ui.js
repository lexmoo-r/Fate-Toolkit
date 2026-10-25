(() => {
  const MODULE_ID = "fate-aspect-widget";
  const { FawSafeWindow, restoreApp } = globalThis.FateToolkitWindowRuntime;
  const { getSetting, playLocal } = globalThis.FateToolkitOutcomeSounds;
  let soundSettingsApp = null;
  const t = (key, fallback) => {
    const value = globalThis.game?.i18n?.localize?.(key);
    return value && value !== key ? String(value) : String(fallback ?? key);
  };

  class RollSoundSettingsApp extends FawSafeWindow {
    static FAW_GEOMETRY = { defaultWidth: 620, defaultHeight: 520, maxWidth: 900 };
    static DEFAULT_OPTIONS = {
      id: "frr-sound-settings-app",
      tag: "form",
      classes: ["frr-sound-settings-app"],
      window: {
        title: t("FRR.SoundWindowTitle"),
        icon: "fa-solid fa-volume-high",
        resizable: true,
        minimizable: false
      },
      position: { width: 620, height: "auto" }
    };

    static PARTS = {
      main: { template: `modules/${MODULE_ID}/templates/sound-settings.hbs` }
    };

    async _prepareContext() {
      const audience = String(getSetting("soundAudience", "all") || "all");
      return {
        enabled: Boolean(getSetting("soundsEnabled", true)),
        failure: getSetting("soundFailure", ""),
        tie: getSetting("soundTie", ""),
        success: getSetting("soundSuccess", ""),
        style: getSetting("soundStyle", ""),
        volume: Number(getSetting("soundVolume", 0.8)),
        audience,
        audienceAll: audience === "all",
        audienceRollerGm: audience === "roller-gm",
        audienceRoller: audience === "roller",
        audienceGm: audience === "gm"
      };
    }

    _onRender(context, options) {
      super._onRender(context, options);
      const el = this.element;

      el.querySelectorAll('[data-action="browse-sound"]').forEach(button => {
        button.addEventListener("click", () => {
          const targetName = button.dataset.target;
          const input = el.querySelector(`[name="${targetName}"]`);
          if (!input) return;
          button.dataset.type = "audio";
          button.dataset.target = targetName;
          const picker = foundry.applications.apps.FilePicker.fromButton(button);
          picker.render({ force: true });
        });
      });

      el.querySelectorAll('[data-action="preview-sound"]').forEach(button => {
        button.addEventListener("click", () => {
          const targetName = button.dataset.target;
          const input = el.querySelector(`[name="${targetName}"]`);
          const volume = Number(el.querySelector('[name="soundVolume"]')?.value ?? 0.8);
          if (!input?.value) return globalThis.FateToolkitUX.warn(t("FRR.SoundChooseFirst"));
          playLocal(input.value, volume);
        });
      });

      el.querySelector('[data-action="save-sounds"]')?.addEventListener("click", () => this._save());
      el.querySelector('[data-action="close-sounds"]')?.addEventListener("click", () => this.close());
    }

    async _save() {
      if (!game.user.isGM) return;
      const fd = new FormData(this.element);
      const volume = Math.max(0, Math.min(1, Number(fd.get("soundVolume")) || 0));
      await Promise.all([
        game.settings.set(MODULE_ID, "soundsEnabled", fd.has("soundsEnabled")),
        game.settings.set(MODULE_ID, "soundFailure", String(fd.get("soundFailure") || "").trim()),
        game.settings.set(MODULE_ID, "soundTie", String(fd.get("soundTie") || "").trim()),
        game.settings.set(MODULE_ID, "soundSuccess", String(fd.get("soundSuccess") || "").trim()),
        game.settings.set(MODULE_ID, "soundStyle", String(fd.get("soundStyle") || "").trim()),
        game.settings.set(MODULE_ID, "soundVolume", volume),
        game.settings.set(MODULE_ID, "soundAudience", String(fd.get("soundAudience") || "all"))
      ]);
      globalThis.FateToolkitUX.info(t("FRR.SoundSaved"));
      await this.render({ force: true });
    }
  }

  async function open() {
    if (!game.user.isGM) return;
    if (soundSettingsApp?.rendered) {
      await restoreApp(soundSettingsApp);
      return;
    }
    soundSettingsApp = new RollSoundSettingsApp();
    await soundSettingsApp.render({ force: true });
  }

  globalThis.FateToolkitSoundSettingsUI = Object.freeze({ open });
})();
