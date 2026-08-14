import type { StatusResponse } from "@/lib/protocol";

/**
 * Popup: on/off, ingest counts, parse health.
 *
 * The parse-failure count is here on purpose. When Facebook changes a payload
 * shape, this is the first place a human sees it — before the alarm, before a
 * user files a complaint about missing badges.
 */

const seen = document.querySelector<HTMLElement>("#seen")!;
const queued = document.querySelector<HTMLElement>("#queued")!;
const failures = document.querySelector<HTMLElement>("#failures")!;
const errorLine = document.querySelector<HTMLElement>("#error")!;
const optionsLink = document.querySelector<HTMLAnchorElement>("#options")!;

optionsLink.addEventListener("click", (event) => {
  event.preventDefault();
  void browser.runtime.openOptionsPage();
});

void (async () => {
  try {
    const status = (await browser.runtime.sendMessage({
      kind: "get-status",
    })) as StatusResponse;

    seen.textContent = String(status.seenThisSession);
    queued.textContent = String(status.queuedForIngest);
    failures.textContent = String(status.parseFailuresThisSession);

    // A queue that keeps growing with no badges has several possible causes and
    // they look identical from here. Say which one it is.
    if (status.lastError) {
      errorLine.textContent = status.lastError;
      errorLine.hidden = false;
    }
  } catch {
    seen.textContent = queued.textContent = failures.textContent = "—";
  }
})();
