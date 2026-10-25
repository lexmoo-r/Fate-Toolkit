(() => {
  function create({
    esc,
    signed,
    stuntSummaryText,
    actorSkills,
    suggestedOppositionSkill,
    stuntPickerHtml,
    bindStuntMacroButtons,
    bindActionSelectSearch,
    waitForDialog,
    localize = (_key, fallback, data = null) => {
      let text = String(fallback ?? _key);
      if (data) for (const [name, value] of Object.entries(data)) text = text.replaceAll(`{${name}}`, String(value ?? ""));
      return text;
    }
  } = {}) {
    const t = (key, fallback, data = null) => localize(key, fallback, data);

    async function open(proposal = {}, prepared = {}) {
      const {
        candidateRows = [],
        candidateByRef = new Map(),
        oppositionAction,
        initialTargetRef = "",
        initialMode = "fixed",
        targetText = null
      } = prepared;
      const resolvedTargetText = targetText || t("FRR.Dialog.NoTarget");
      const targetOptions = [
        `<option value="" ${initialTargetRef ? "" : "selected"}>— ${esc(t("FRR.Dialog.NoTarget"))} —</option>`,
        ...candidateRows.map(row => `<option value="${esc(row.ref)}" ${row.ref === initialTargetRef ? "selected" : ""}>${esc(row.name)}</option>`)
      ].join("");
      const stuntSuffix = proposal.stunts?.length
        ? ` · ${esc(t("FRR.Dialog.StuntsWord"))} ${esc(stuntSummaryText(proposal.stunts))}`
        : "";

      const content = `<div class="frr-opposition-prompt">
        <div class="frr-action-summary"><strong>${esc(proposal.actorName)}</strong> · ${esc(proposal.actionLabel)} · <strong>${esc(proposal.skillName)}</strong> ${signed(proposal.skillRank)}${stuntSuffix}</div>
        <p class="frr-dialog-lead">${esc(t("FRR.Dialog.OriginalTarget"))}: <strong>${esc(resolvedTargetText)}</strong></p>
        <label class="frr-dialog-field"><span>${esc(t("FRR.Dialog.Opposition"))}</span><select name="mode" data-action-mode>
          <option value="roll" ${initialMode === "roll" ? "selected" : ""}>${esc(t("FRR.Dialog.ActiveTargetRoll"))}</option>
          <option value="rank">${esc(t("FRR.Dialog.PassiveTargetRank"))}</option>
          <option value="fixed" ${initialMode === "fixed" ? "selected" : ""}>${esc(t("FRR.Dialog.FixedDifficulty"))}</option>
          <option value="none">${esc(t("FRR.Dialog.NoOpposition"))}</option>
        </select></label>
        <label class="frr-dialog-field" data-opponent-target><span>${esc(t("FRR.Dialog.TargetSource"))}</span><div class="frr-dialog-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input type="search" data-gm-opponent-target-search placeholder="${esc(t("FRR.Dialog.SearchTarget"))}" aria-label="${esc(t("FRR.Dialog.SearchTarget"))}" autocomplete="off"></div><select name="opponentTarget">${targetOptions}</select></label>
        <label class="frr-dialog-field" data-opponent-skill><span>${esc(t("FRR.Dialog.TargetSkill"))}</span><select name="opponentSkill"></select></label>
        <section class="frr-stunt-picker" data-opponent-stunt-section><div class="frr-stunt-picker-head"><strong>${esc(t("FRR.Dialog.TargetStunts"))}</strong><span>${esc(t("FRR.Dialog.MarkApplicable"))}</span></div><div data-opponent-stunts></div></section>
        <p class="frr-rule-suggestion" data-opponent-suggestion hidden><i class="fa-solid fa-lightbulb" aria-hidden="true"></i> <span></span></p>
        <label class="frr-dialog-field" data-fixed-difficulty ${initialMode === "fixed" ? "" : "hidden"}><span>${esc(t("FRR.Dialog.Difficulty"))}</span><input type="number" name="difficulty" value="2" min="-10" max="20" step="1"></label>
        <label class="frr-check-row"><input type="checkbox" name="hideOpposition"><span>${esc(t("FRR.Dialog.HideOpposition"))}</span></label>
        <p class="frr-hint">${esc(t("FRR.Dialog.ResolveHint"))}</p>
      </div>`;

      return waitForDialog({
        window: { title: t("FRR.Dialog.ResolveActionTitle"), resizable: true, minimizable: false },
        position: { width: 520, height: "auto" },
        content,
        buttons: [
          {
            action: "resolve",
            label: t("FRR.Dialog.Resolve"),
            icon: "fa-solid fa-check",
            default: true,
            callback: (event, button) => {
              const form = button.form;
              return {
                action: "resolve",
                mode: String(form?.elements?.mode?.value || "fixed"),
                targetRef: String(form?.elements?.opponentTarget?.value || ""),
                skillName: String(form?.elements?.opponentSkill?.value || ""),
                stuntKeys: [...form.querySelectorAll('input[name="stuntKeys"]:checked')].map(input => input.value),
                difficulty: Number(form?.elements?.difficulty?.value || 0),
                hidden: Boolean(form?.elements?.hideOpposition?.checked)
              };
            }
          },
          {
            action: "reject",
            label: t("FRR.Dialog.Reject"),
            icon: "fa-solid fa-xmark",
            callback: () => ({ action: "reject" })
          }
        ],
        modal: false,
        rejectClose: false,
        render: (event, dialog) => {
          const root = dialog.element;
          const mode = root.querySelector('[name="mode"]');
          const targetSelect = root.querySelector('[name="opponentTarget"]');
          bindActionSelectSearch(root, '[data-gm-opponent-target-search]', 'opponentTarget', { keepEmpty: true });
          const skillSelect = root.querySelector('[name="opponentSkill"]');
          const suggestionBox = root.querySelector('[data-opponent-suggestion]');
          const suggestionText = suggestionBox?.querySelector("span");
          const stuntSection = root.querySelector('[data-opponent-stunt-section]');
          const stuntPicker = root.querySelector('[data-opponent-stunts]');
          const rememberedStunts = new Set();

          const syncStunts = actor => {
            if (!stuntPicker) return;
            root.querySelectorAll('input[name="stuntKeys"]:checked').forEach(input => rememberedStunts.add(input.value));
            stuntPicker.innerHTML = stuntPickerHtml(actor, skillSelect?.value || "", oppositionAction, [...rememberedStunts]);
            bindStuntMacroButtons(stuntPicker, actor);
          };

          const syncSkills = () => {
            const actor = candidateByRef.get(String(targetSelect?.value || "")) ?? null;
            const skills = actorSkills(actor);
            const suggestion = suggestedOppositionSkill(proposal, actor);
            if (skillSelect) {
              skillSelect.innerHTML = skills.map(skill => `<option value="${esc(skill.name)}" ${suggestion.skill?.name === skill.name ? "selected" : ""}>${esc(skill.name)} (${signed(skill.rank)})</option>`).join("");
              skillSelect.disabled = !skills.length;
            }
            syncStunts(actor);
            if (suggestionBox) suggestionBox.toggleAttribute("hidden", !suggestion.reason);
            if (suggestionText) suggestionText.textContent = suggestion.reason || "";
          };

          const syncMode = () => {
            const value = mode?.value || "fixed";
            const actorMode = value === "roll" || value === "rank";
            root.querySelector('[data-opponent-target]')?.toggleAttribute("hidden", !actorMode);
            root.querySelector('[data-opponent-skill]')?.toggleAttribute("hidden", !actorMode);
            stuntSection?.toggleAttribute("hidden", !actorMode);
            suggestionBox?.toggleAttribute("hidden", !actorMode || !suggestionText?.textContent);
            root.querySelector('[data-fixed-difficulty]')?.toggleAttribute("hidden", value !== "fixed");
          };

          skillSelect?.addEventListener("change", () => syncStunts(candidateByRef.get(String(targetSelect?.value || "")) ?? null));
          targetSelect?.addEventListener("change", () => {
            rememberedStunts.clear();
            syncSkills();
            syncMode();
          });
          mode?.addEventListener("change", syncMode);
          syncSkills();
          syncMode();
        }
      });
    }

    return Object.freeze({ open });
  }

  globalThis.FateToolkitActionOppositionUI = Object.freeze({ create });
})();
