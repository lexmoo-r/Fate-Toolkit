(() => {
  function create({uiText,esc} = {}) {
  async function confirmRollBargain(actor) {
    const service=globalThis.FateToolkitWill;
    if (!service?.enabled?.()) return {accepted:false};
    const current=service.details(actor);
    if (!current.configured || current.current >= current.max) return {accepted:false};
    const result=await foundry.applications.api.DialogV2.wait({
      window:{title:uiText('FAW.Campaign.RollOptions','Параметры броска')},
      position:{width:450,height:'auto'},
      content:`<div class="frr-opposition-prompt">
        <label class="frr-check-row"><input type="checkbox" name="bargain"><span>${esc(uiText('FAW.Campaign.BargainCheckbox','Сделка с дьяволом (+1 Воля)'))}</span></label>
        <label class="frr-dialog-field" data-bargain-description hidden><span>${esc(uiText('FAW.Campaign.BargainDescription','Осложнение'))}</span>
          <input type="text" name="bargainDescription" maxlength="300" placeholder="${esc(uiText('FAW.Campaign.BargainPlaceholder','Что осложнит ситуацию?'))}"></label>
        <p class="frr-hint">${esc(uiText('FAW.Campaign.BargainNote','Сделка требует подтверждения ведущего. Осложнение наступает независимо от броска.'))}</p>
      </div>`,
      buttons:[{action:'roll',label:uiText('FRR.Roll','Бросить'),default:true,
        callback:(_event,button)=>({checked:Boolean(button.form?.elements?.bargain?.checked),
          description:String(button.form?.elements?.bargainDescription?.value||'').trim()})}],
      modal:true,rejectClose:false,
      render:(_event,dialog)=>{
        const root=dialog.element;
        const checkbox=root.querySelector('[name="bargain"]');
        const description=root.querySelector('[data-bargain-description]');
        const sync=()=>{description?.toggleAttribute('hidden',!checkbox?.checked);};
        checkbox?.addEventListener('change',sync);
        sync();
      }
    });
    if (!result) return null;
    if (!result.checked) return {accepted:false};
    if (!result.description) {
      globalThis.FateToolkitUX.warn(uiText('FAW.Campaign.BargainDescriptionRequired','Опишите осложнение сделки.'));
      return null;
    }
    try {
      const eventId=`bargain:${foundry.utils.randomID()}`;
      const outcome=await service.request('bargain',actor,{description:result.description,eventId});
      if (!outcome?.accepted) {
        globalThis.FateToolkitUX.info(uiText(outcome?.reason==='full'?'FAW.Campaign.BargainFull':'FAW.Campaign.BargainRejected',
          outcome?.reason==='full'?'Воля уже полная.':'Ведущий отклонил сделку.'));
        return {accepted:false};
      }
      return {accepted:true,description:result.description,eventId};
    } catch(error) {
      globalThis.FateToolkitUX.error(String(error?.message||error));
      return null;
    }
  }

    return Object.freeze({confirmRollBargain});
  }
  globalThis.FateToolkitBargainUI=Object.freeze({create});
})();
