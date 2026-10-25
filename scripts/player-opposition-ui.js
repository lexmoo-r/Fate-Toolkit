(() => {
  function create({
    esc,
    signed,
    stuntSummaryText,
    actionProposalSummary,
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

    async function open({ proposal = {}, targetActor = null, oppositionAction = "defend", oppositionSelected = "", suggestion = {} } = {}) {
      const options = skillOptionsHtml(targetActor, oppositionAction, oppositionSelected);
      const remembered = new Set();
      const stuntNames = proposal.stunts?.length ? stuntSummaryText(proposal.stunts) : "";
      const useText = stuntNames
        ? t("FRR.Dialog.UsesSkillWithStunts", null, {
            name: proposal.initiatorName,
            skill: proposal.skillName,
            rank: signed(proposal.skillRank),
            stunts: stuntNames
          })
        : t("FRR.Dialog.UsesSkill", null, {
            name: proposal.initiatorName,
            skill: proposal.skillName,
            rank: signed(proposal.skillRank)
          });
      const actorSkillLabel = t("FRR.Dialog.SkillForActor", null, { name: targetActor?.name || "" });

      return waitForDialog({
        window: { title: t("FRR.Dialog.PlayerOppositionTitle"), resizable: true, minimizable: false },
        position: { width: 480, height: "auto" },
        content: `<div class="frr-opposition-prompt"><div class="frr-action-summary"><strong>${esc(actionProposalSummary(proposal))}</strong></div><p class="frr-dialog-lead">${esc(useText)}</p><label class="frr-dialog-field"><span>${esc(actorSkillLabel)}</span>${skillSearchControlsHtml()}<select name="opponentSkill" autofocus>${options}</select></label><section class="frr-stunt-picker"><div class="frr-stunt-picker-head"><strong>${esc(t("FRR.Dialog.OppositionStunts"))}</strong><span>${esc(t("FRR.Dialog.MarkApplicableNow"))}</span></div><div data-opponent-stunts></div></section>${suggestion.reason ? `<p class="frr-rule-suggestion"><i class="fa-solid fa-lightbulb" aria-hidden="true"></i> ${esc(suggestion.reason)}</p>` : ""}<p class="frr-hint">${esc(t("FRR.Dialog.PlayerOppositionHint"))}</p></div>`,
        buttons: [
          {
            action: "roll",
            label: t("FRR.Dialog.RollOpposition"),
            icon: "fa-solid fa-dice",
            default: true,
            callback: (event, button) => ({
              action: "roll",
              skillName: String(button.form?.elements?.opponentSkill?.value || ""),
              stuntKeys: [...button.form.querySelectorAll('input[name="stuntKeys"]:checked')].map(input => input.value)
            })
          },
          {
            action: "decline",
            label: t("FRR.Dialog.Decline"),
            icon: "fa-solid fa-xmark",
            callback: () => ({ action: "decline" })
          }
        ],
        modal: false,
        rejectClose: false,
        render: (event, dialog) => {
          const root = dialog.element;
          const skillSelect = root.querySelector('[name="opponentSkill"]');
          const picker = root.querySelector('[data-opponent-stunts]');
          const rememberCurrent = () => root.querySelectorAll('input[name="stuntKeys"]:checked').forEach(input => remembered.add(input.value));
          const sync = () => {
            if (!picker) return;
            picker.innerHTML = stuntPickerHtml(targetActor, skillSelect?.value || "", oppositionAction, [...remembered]);
            bindStuntMacroButtons(picker, targetActor);
          };
          bindSkillSearchControls(root, targetActor, oppositionAction, {
            selectName: "opponentSkill",
            onChange: () => { rememberCurrent(); sync(); }
          });
          sync();
        }
      });
    }

    return Object.freeze({ open });
  }

  globalThis.FateToolkitPlayerOppositionUI = Object.freeze({ create });
})();
