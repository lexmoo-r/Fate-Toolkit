(() => {
  function create({
    skillOptionsHtml,
    skillSearchControlsHtml,
    stuntPickerHtml,
    bindStuntMacroButtons,
    bindSkillSearchControls,
    waitForDialog,
    localize = (_key, fallback, data = null) => {
      let text = String(fallback ?? _key);
      if (data) for (const [name, value] of Object.entries(data)) text = text.replaceAll(`{${name}}`, String(value ?? ""));
      return text;
    }
  } = {}) {
    const t = (key, fallback, data = null) => localize(key, fallback, data);

    async function open({ actor, selected = "" } = {}) {
      const options = skillOptionsHtml(actor, "defend", selected);
      const remembered = new Set();
      return waitForDialog({
        window: { title: t("FRR.Dialog.DefendTitle"), resizable: true, minimizable: false },
        position: { width: 460, height: "auto" },
        content: `<div class="frr-opposition-prompt">
          <label class="frr-dialog-field"><span>${t("FRR.Dialog.DefendingAgainst")}</span><select name="defendedAgainst" data-defended-against>
            <option value="attack" selected>${t("FRR.Dialog.AgainstAttack")}</option>
            <option value="create">${t("FRR.Dialog.AgainstCreate")}</option>
            <option value="overcome">${t("FRR.Dialog.AgainstOvercome")}</option>
          </select></label>
          <label class="frr-dialog-field" data-defended-create hidden><span>${t("FRR.Dialog.CreateKind")}</span><select name="defendedCreateMode"><option value="new">${t("FRR.Dialog.NewAspect")}</option><option value="existing">${t("FRR.Dialog.ExistingAspect")}</option></select></label>
          <label class="frr-dialog-field"><span>${t("FRR.Dialog.DefenseSkill")}</span>${skillSearchControlsHtml()}<select name="skillName">${options}</select></label>
          <section class="frr-stunt-picker"><div class="frr-stunt-picker-head"><strong>${t("FRR.Dialog.DefenseStunts")}</strong><span>${t("FRR.Dialog.MarkApplicableNow")}</span></div><div data-stunt-picker></div></section>
          <p class="frr-hint">${t("FRR.Dialog.DefenseHint")}</p>
        </div>`,
        buttons: [
          {
            action: "continue",
            label: t("FRR.Dialog.Continue"),
            icon: "fa-solid fa-arrow-right",
            default: true,
            callback: (event, button) => ({
              skillName: String(button.form?.elements?.skillName?.value || ""),
              defendedAgainst: String(button.form?.elements?.defendedAgainst?.value || "attack"),
              defendedCreateMode: String(button.form?.elements?.defendedCreateMode?.value || "new"),
              stuntKeys: [...button.form.querySelectorAll('input[name="stuntKeys"]:checked')].map(input => input.value)
            })
          }
        ],
        modal: true,
        rejectClose: false,
        render: (event, dialog) => {
          const root = dialog.element;
          const incoming = root.querySelector('[name="defendedAgainst"]');
          const skillSelect = root.querySelector('[name="skillName"]');
          const picker = root.querySelector('[data-stunt-picker]');
          const rememberCurrent = () => root.querySelectorAll('input[name="stuntKeys"]:checked').forEach(input => remembered.add(input.value));
          const sync = () => {
            root.querySelector('[data-defended-create]')?.toggleAttribute("hidden", incoming?.value !== "create");
            if (picker) {
              picker.innerHTML = stuntPickerHtml(actor, skillSelect?.value || "", "defend", [...remembered]);
              bindStuntMacroButtons(picker, actor);
            }
          };
          incoming?.addEventListener("change", sync);
          bindSkillSearchControls(root, actor, "defend", {
            onChange: () => { rememberCurrent(); sync(); }
          });
          sync();
        }
      });
    }
    return Object.freeze({ open });
  }
  globalThis.FateToolkitDefendChoiceUI = Object.freeze({ create });
})();
