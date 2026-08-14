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
  } catch {
    seen.textContent = queued.textContent = failures.textContent = "—";
  }
})();
