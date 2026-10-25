const FAW_UI_DIAG_MODULE_ID = "fate-aspect-widget";
const FAW_UI_DIAG_ROOT_SELECTOR = [
  ".fate-aspect-widget",
  ".fate-action-widget",
  ".faw-combat-tracker",
  ".fwc-window",
  ".fms-window",
  ".frr-request-app",
  ".frr-player-requests-app",
  ".frr-sound-settings-app",
  ".faw-help-window",
  ".fate-toolkit-character-sheet",
  ".faw-toolkit-dialog"
].join(",");

function fawUiParseColor(value) {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text || text === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  const match = text.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
  if (!match) return null;
  const alphaText = match[4];
  let a = alphaText == null ? 1 : (alphaText.endsWith("%") ? Number.parseFloat(alphaText) / 100 : Number.parseFloat(alphaText));
  if (!Number.isFinite(a)) a = 1;
  return {
    r: Math.max(0, Math.min(255, Number.parseFloat(match[1]))),
    g: Math.max(0, Math.min(255, Number.parseFloat(match[2]))),
    b: Math.max(0, Math.min(255, Number.parseFloat(match[3]))),
    a: Math.max(0, Math.min(1, a))
  };
}

function fawUiComposite(fg, bg) {
  if (!fg) return bg;
  if (!bg) bg = { r: 255, g: 255, b: 255, a: 1 };
  const a = fg.a + bg.a * (1 - fg.a);
  if (a <= 0) return { r: 255, g: 255, b: 255, a: 1 };
  return {
    r: (fg.r * fg.a + bg.r * bg.a * (1 - fg.a)) / a,
    g: (fg.g * fg.a + bg.g * bg.a * (1 - fg.a)) / a,
    b: (fg.b * fg.a + bg.b * bg.a * (1 - fg.a)) / a,
    a
  };
}

function fawUiLuminance(color) {
  const linear = channel => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(color.r) + 0.7152 * linear(color.g) + 0.0722 * linear(color.b);
}

function fawUiContrastRatio(a, b) {
  const la = fawUiLuminance(a);
  const lb = fawUiLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

function fawUiVisible(element) {
  if (!element?.isConnected) return false;
  const style = getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || Number.parseFloat(style.opacity || "1") <= 0.01) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0.5 && rect.height > 0.5;
}

function fawUiAccessibleName(element) {
  const explicit = element.getAttribute?.("aria-label")?.trim();
  if (explicit) return explicit;
  const labelledBy = element.getAttribute?.("aria-labelledby")?.trim();
  if (labelledBy) {
    const text = labelledBy.split(/\s+/).map(id => document.getElementById(id)?.textContent?.trim() || "").filter(Boolean).join(" ");
    if (text) return text;
  }
  if (element.id) {
    try {
      const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
      const text = label?.textContent?.trim();
      if (text) return text;
    } catch (_) {}
  }
  const wrappingLabel = element.closest?.("label");
  if (wrappingLabel) {
    const text = wrappingLabel.textContent?.trim();
    if (text) return text;
  }
  const title = element.getAttribute?.("title")?.trim();
  if (title) return title;
  const alt = element.getAttribute?.("alt")?.trim();
  if (alt) return alt;
  const text = element.textContent?.replace(/\s+/g, " ")?.trim();
  if (text) return text;
  return "";
}

function fawUiEffectiveBackground(element) {
  const layers = [];
  let node = element;
  while (node && node.nodeType === 1) {
    const color = fawUiParseColor(getComputedStyle(node).backgroundColor);
    if (color && color.a > 0) layers.push(color);
    node = node.parentElement;
  }
  let result = fawUiParseColor(getComputedStyle(document.documentElement).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
  if (result.a < 1) result = fawUiComposite(result, { r: 255, g: 255, b: 255, a: 1 });
  for (let index = layers.length - 1; index >= 0; index -= 1) result = fawUiComposite(layers[index], result);
  return result;
}

function fawUiEffectiveForeground(element, background) {
  const color = fawUiParseColor(getComputedStyle(element).color);
  return color ? fawUiComposite(color, background) : null;
}

function fawUiCssPath(element, root) {
  if (!element || element === root) return root?.classList?.[0] ? `.${root.classList[0]}` : root?.tagName?.toLowerCase() || "root";
  const parts = [];
  let node = element;
  while (node && node !== root && parts.length < 4) {
    let part = node.tagName?.toLowerCase?.() || "node";
    if (node.id) part += `#${node.id}`;
    else if (node.classList?.length) part += `.${[...node.classList].slice(0, 2).join(".")}`;
    parts.unshift(part);
    node = node.parentElement;
  }
  return parts.join(" > ");
}

function fawUiIssue(root, element, type, severity, detail, extra = {}) {
  return {
    root: root?.classList?.[0] || root?.tagName?.toLowerCase?.() || "unknown",
    type,
    severity,
    element: fawUiCssPath(element, root),
    detail,
    ...extra,
    _element: element
  };
}

function fawUiTextCandidate(element) {
  if (!fawUiVisible(element)) return false;
  if (element.matches("input,select,textarea,img,svg,i")) return false;
  const text = [...element.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join(" ").replace(/\s+/g, " ").trim();
  return text.length > 0 && text.length <= 160;
}

function fawUiAnalyzeRoot(root, { contrast = true, target = true, overflow = true, names = true } = {}) {
  const issues = [];
  const rootRect = root.getBoundingClientRect();
  if (overflow && root.clientWidth > 0 && root.scrollWidth > root.clientWidth + 3) {
    issues.push(fawUiIssue(root, root, "horizontal-overflow", "error", `${root.scrollWidth}px content in ${root.clientWidth}px viewport`, { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth }));
  }

  if (overflow) {
    for (const element of root.querySelectorAll("*")) {
      if (!fawUiVisible(element)) continue;
      const style = getComputedStyle(element);
      if (style.position === "fixed") continue;
      const rect = element.getBoundingClientRect();
      const exceeds = rect.right > rootRect.right + 4 || rect.left < rootRect.left - 4;
      if (!exceeds) continue;
      if (style.position === "absolute" && (element.closest("details[open]") || element.closest(".faw-context-menu"))) continue;
      issues.push(fawUiIssue(root, element, "escaped-bounds", "warning", `element bounds ${Math.round(rect.left)}..${Math.round(rect.right)} exceed ${Math.round(rootRect.left)}..${Math.round(rootRect.right)}`));
    }
  }

  const interactive = root.querySelectorAll('button,[role="button"],[role="tab"],summary,a[href],[tabindex]:not([tabindex="-1"]),input:not([type="hidden"]),select,textarea');
  for (const element of interactive) {
    if (!fawUiVisible(element) || element.closest(".window-header")) continue;
    const disabled = element.matches(":disabled");
    if (names && !fawUiAccessibleName(element)) {
      issues.push(fawUiIssue(root, element, "accessible-name", "error", "interactive control has no accessible name"));
    }
    if (element.getAttribute?.("role") === "tab") {
      const selected = element.getAttribute("aria-selected");
      if (!/^(true|false)$/.test(String(selected || ""))) {
        issues.push(fawUiIssue(root, element, "tab-state", "error", "tab is missing a boolean aria-selected state"));
      }
      if (!element.getAttribute("aria-controls")) {
        issues.push(fawUiIssue(root, element, "tab-controls", "warning", "tab does not identify its controlled panel"));
      }
    }
    if (element.hasAttribute?.("aria-pressed") && !/^(true|false|mixed)$/.test(String(element.getAttribute("aria-pressed") || ""))) {
      issues.push(fawUiIssue(root, element, "toggle-state", "error", "aria-pressed must be true, false, or mixed"));
    }
    if (target && !disabled) {
      const rect = element.getBoundingClientRect();
      const inlineTextLink = element.tagName === "A" && getComputedStyle(element).display === "inline";
      const textField = element.matches?.('input:not([type="checkbox"]):not([type="radio"]),select,textarea');
      const minHeight = textField ? 28 : 28;
      if (!inlineTextLink && (rect.width < 28 || rect.height < minHeight)) {
        issues.push(fawUiIssue(root, element, "small-target", "warning", `${Math.round(rect.width)}×${Math.round(rect.height)}px`, { width: rect.width, height: rect.height }));
      }
    }
  }

  if (contrast) {
    for (const element of root.querySelectorAll("button,label,summary,h1,h2,h3,h4,strong,small,p,span")) {
      if (!fawUiTextCandidate(element)) continue;
      const style = getComputedStyle(element);
      if (Number.parseFloat(style.opacity || "1") < 0.5) continue;
      const background = fawUiEffectiveBackground(element);
      const foreground = fawUiEffectiveForeground(element, background);
      if (!foreground) continue;
      const ratio = fawUiContrastRatio(foreground, background);
      const size = Number.parseFloat(style.fontSize || "16");
      if (size < 11) {
        issues.push(fawUiIssue(root, element, "small-text", "warning", `${size.toFixed(1)}px text is below the toolkit metadata floor`, { fontSize: size }));
      }
      const bold = Number.parseInt(style.fontWeight || "400", 10) >= 700;
      const large = size >= 24 || (bold && size >= 18.66);
      const minimum = large ? 3 : 4.5;
      if (ratio + 0.05 < minimum) {
        issues.push(fawUiIssue(root, element, "contrast", "warning", `${ratio.toFixed(2)}:1 (needs ${minimum}:1)`, { ratio, minimum }));
      }
    }
  }

  return issues;
}

function fawUiComponentKind(element) {
  const role = element?.getAttribute?.("role");
  if (role === "tab") return "tab";
  if (element?.hasAttribute?.("aria-pressed")) return "toggle";
  if (element?.matches?.('input[type="search"]')) return "search";
  if (element?.matches?.('input,select,textarea')) return "field";
  if (element?.matches?.('summary')) return "disclosure";
  if (element?.matches?.('a[href]')) return "link";
  if (element?.matches?.('button,[role="button"]')) return "button";
  return "interactive";
}

function fawUiClearDiagnosticHighlights() {
  for (const element of document.querySelectorAll(".faw-ui-audit-highlight")) {
    element.classList.remove("faw-ui-audit-highlight");
    element.removeAttribute("data-faw-ui-audit");
  }
}

async function fawRunUiDiagnostic({ highlight = false, notify = true, contrast = true, target = true, overflow = true, names = true } = {}) {
  fawUiClearDiagnosticHighlights();
  const roots = [...document.querySelectorAll(FAW_UI_DIAG_ROOT_SELECTOR)].filter(fawUiVisible);
  const issues = roots.flatMap(root => fawUiAnalyzeRoot(root, { contrast, target, overflow, names }));
  const publicIssues = issues.map(({ _element, ...issue }) => issue);
  if (highlight) {
    for (const issue of issues) {
      if (!issue._element) continue;
      issue._element.classList.add("faw-ui-audit-highlight");
      issue._element.dataset.fawUiAudit = issue.type;
    }
  }
  const counts = publicIssues.reduce((acc, issue) => {
    acc[issue.severity] = (acc[issue.severity] || 0) + 1;
    return acc;
  }, {});
  const components = {};
  for (const root of roots) {
    for (const element of root.querySelectorAll('button,[role="button"],[role="tab"],summary,a[href],input:not([type="hidden"]),select,textarea')) {
      if (!fawUiVisible(element) || element.closest(".window-header")) continue;
      const kind = fawUiComponentKind(element);
      components[kind] = (components[kind] || 0) + 1;
    }
  }
  const report = {
    ok: !publicIssues.some(issue => issue.severity === "error"),
    roots: roots.length,
    issues: publicIssues,
    counts,
    components,
    viewport: { width: window.innerWidth, height: window.innerHeight, devicePixelRatio: window.devicePixelRatio || 1 },
    timestamp: Date.now()
  };

  console.groupCollapsed(`${FAW_UI_DIAG_MODULE_ID} | UI diagnostic: ${report.ok ? "PASS" : "FAIL"} (${publicIssues.length} findings)`);
  if (publicIssues.length) console.table(publicIssues);
  else console.info("No UI findings in currently rendered Fate Toolkit surfaces.");
  console.groupEnd();

  if (notify && globalThis.FateToolkitUX) {
    const key = report.ok ? "FAW.UiDiagnostic.Pass" : "FAW.UiDiagnostic.Fail";
    const fallback = report.ok
      ? `Fate Toolkit: UI diagnostic completed (${publicIssues.length} findings).`
      : `Fate Toolkit: UI diagnostic found ${counts.error || 0} errors and ${counts.warning || 0} warnings.`;
    let text = fallback;
    try {
      const localized = game.i18n?.format?.(key, { issues: publicIssues.length, errors: counts.error || 0, warnings: counts.warning || 0 });
      if (localized && localized !== key) text = localized;
    } catch (_) {}
    if (report.ok) globalThis.FateToolkitUX.info(text);
    else globalThis.FateToolkitUX.error(text);
  }
  return report;
}

globalThis.FateToolkitUiDiagnostic = Object.freeze({
  run: fawRunUiDiagnostic,
  clearHighlights: fawUiClearDiagnosticHighlights,
  analyzeRoot: fawUiAnalyzeRoot,
  contrastRatio: fawUiContrastRatio,
  parseColor: fawUiParseColor
});

Hooks.once("ready", () => {
  if (game.system?.id !== "fate-core-official") return;
  const module = game.modules.get(FAW_UI_DIAG_MODULE_ID);
  module.api ??= {};
  module.api.runUiDiagnostic = options => fawRunUiDiagnostic(options);
  module.api.clearUiDiagnosticHighlights = () => fawUiClearDiagnosticHighlights();
});
