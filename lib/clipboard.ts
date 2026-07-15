// Safari (and to a lesser extent other browsers) revokes a click's "user
// activation" flag the instant a real `await` (a network call, most
// commonly) sits between the click and navigator.clipboard.writeText(),
// silently rejecting the write with a permissions error -- not a broken
// API, a lost user gesture. Callers should finish any async work (like
// creating a share token) *before* calling this, not inside it, and this
// still falls back to the older execCommand path for browsers where the
// async Clipboard API is unavailable or throws for other reasons.
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return copyViaExecCommand(text);
  }
}

function copyViaExecCommand(text: string): boolean {
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const succeeded = document.execCommand("copy");
    document.body.removeChild(textarea);
    return succeeded;
  } catch {
    return false;
  }
}
