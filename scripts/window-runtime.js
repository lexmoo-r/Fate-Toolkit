(() => {
  const FawHandlebarsApplication = foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2);

  class FawSafeWindow extends FawHandlebarsApplication {
    // Foundry VTT 13 owns window minimization/maximization.
    // Do not call setPosition, render, or rewrite styles during those transitions.
  }

  function deferOrRenderApp(app, { force = true } = {}) {
    if (!app?.rendered) return;
    void app.render({ force });
  }

  async function restoreApp(app, { rerender = false } = {}) {
    if (!app?.rendered) return;
    if (rerender) await app.render({ force: true });
    app.bringToFront?.();
  }

  globalThis.FateToolkitWindowRuntime = Object.freeze({ FawHandlebarsApplication, FawSafeWindow, deferOrRenderApp, restoreApp });
})();
