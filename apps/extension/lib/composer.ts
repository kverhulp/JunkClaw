/**
 * Fills the Messenger composer with a draft the user has already approved.
 *
 * This is the feature the extension architecture exists to make possible: Facebook
 * OAuth gives us `public_profile` and `email` and nothing else, and the Messenger
 * API serves Pages replying to customers — not people DMing sellers. No server can
 * message a seller on the user's behalf. A content script in the user's own
 * session can populate the box in front of them.
 *
 * It fills. It never sends. The user reads the draft in their own Messenger UI and
 * presses send themselves — which is also what keeps this an assistive tool rather
 * than automation.
 */

export class ComposerNotFoundError extends Error {
  constructor() {
    super("Messenger composer not found on this page");
    this.name = "ComposerNotFoundError";
  }
}

/**
 * TODO(M2): implement against the live composer.
 *
 * The mechanics that will matter, recorded now so they aren't rediscovered:
 * the composer is a contenteditable Lexical/Draft surface, so setting
 * `textContent` does nothing React notices — the text has to arrive through
 * events the editor is listening for (`beforeinput` / `input` with
 * `insertText`, or a paste event), and the send button stays disabled until it
 * sees them.
 *
 * Finding the element must not depend on a CSS class. Prefer role and
 * aria-label, which are stable because assistive tech depends on them:
 *   document.querySelector('[role="textbox"][contenteditable="true"]')
 */
export function fillComposer(_body: string): void {
  throw new Error("fillComposer: not implemented — M2");
}

/** True when a composer is present, so the panel can show the button as enabled. */
export function composerPresent(): boolean {
  return document.querySelector('[role="textbox"][contenteditable="true"]') !== null;
}
