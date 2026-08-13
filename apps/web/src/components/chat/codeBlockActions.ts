import { languageLabel } from "./codeLanguages.js";

/** Prefers the async Clipboard API; falls back to the legacy execCommand
 *  trick for non-secure-context deployments (Clipboard API requires HTTPS
 *  or localhost, and this app is meant to be self-hostable over plain
 *  HTTP too). */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy fallback below
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    ta.style.pointerEvents = "none";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Wraps every rendered fenced code block in a header (language label + copy
 * button) via direct DOM APIs, run as a post-render pass - NOT part of the
 * DOMPurify-sanitized HTML string. Message text is attacker-controlled;
 * this structure and its click handlers are not, so keeping it outside
 * dangerouslySetInnerHTML entirely means it never needs a tag/attribute
 * allowlist. Safe to call on every render: the container's innerHTML is
 * fully replaced by React on each `html` change, so there's nothing to
 * de-duplicate against.
 */
export function enhanceCodeBlocks(container: HTMLElement): void {
  const codeEls = container.querySelectorAll<HTMLElement>("pre > code[class*='language-']");
  codeEls.forEach((codeEl) => {
    const pre = codeEl.parentElement;
    if (!pre || !(pre instanceof HTMLElement) || !pre.parentNode) return;
    // Idempotency guard: this runs on every render (see ExpandableProse.tsx
    // for why a `[html]`-only dependency isn't reliable here), so a block
    // already wrapped by a previous pass must be a no-op, not re-wrapped.
    if (pre.parentElement?.classList.contains("code-block-wrapper")) return;

    const langId = codeEl.className.match(/language-([\w+#.-]+)/)?.[1] ?? "plaintext";
    const label = languageLabel(langId);

    const wrapper = document.createElement("div");
    wrapper.className = "code-block-wrapper";
    pre.parentNode.replaceChild(wrapper, pre);
    wrapper.appendChild(pre);

    const header = document.createElement("div");
    header.className = "code-block-header";

    const labelEl = document.createElement("span");
    labelEl.textContent = label;
    header.appendChild(labelEl);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "code-copy-btn";
    button.textContent = "Copy";
    button.setAttribute("aria-label", `Copy ${label} code`);
    button.addEventListener("click", () => {
      void copyText(codeEl.textContent ?? "").then((ok) => {
        button.textContent = ok ? "Copied!" : "Copy failed";
        window.setTimeout(() => {
          button.textContent = "Copy";
        }, 1500);
      });
    });
    header.appendChild(button);

    wrapper.insertBefore(header, pre);
  });
}
