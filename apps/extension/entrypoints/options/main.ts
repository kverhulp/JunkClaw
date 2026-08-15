// Bundled, not fetched — same reasoning as the side panel.
import "@fontsource/archivo/latin-400.css";
import "@fontsource/archivo/latin-600.css";
import "@fontsource/archivo/latin-800.css";

import { SavedCriteriaSchema } from "@junkclaw/schema";
import { apiBaseUrl, apiToken, criteria, readCriteria } from "@/lib/settings";

/**
 * Options page: the criteria form, and the connection settings.
 *
 * The form is the source of truth and works entirely on its own. The
 * `criteria-interpreter` agent (M1) is a fast path into this same shape — free
 * text in, these fields filled — never a replacement for editing them.
 */

const el = <T extends HTMLElement>(id: string) => document.querySelector<T>(`#${id}`)!;

const budgetMax = el<HTMLInputElement>("budgetMax");
const maxMileage = el<HTMLInputElement>("maxMileage");
const yearMin = el<HTMLInputElement>("yearMin");
const radiusKm = el<HTMLInputElement>("radiusKm");
const originCity = el<HTMLInputElement>("originCity");
const muteNonQualifying = el<HTMLInputElement>("muteNonQualifying");
const savedFlag = el<HTMLElement>("saved");
const form = el<HTMLFormElement>("criteria");

const baseUrlInput = el<HTMLInputElement>("apiBaseUrl");
const tokenInput = el<HTMLInputElement>("apiToken");
const saveConnection = el<HTMLButtonElement>("saveConnection");

void (async () => {
  const current = await readCriteria();
  budgetMax.value = String(Math.round(current.budgetMaxCents / 100));
  maxMileage.value = current.maxMileageKm === null ? "" : String(current.maxMileageKm);
  yearMin.value = current.yearMin === null ? "" : String(current.yearMin);
  radiusKm.value = String(current.radiusKm);
  originCity.value = current.originCity;
  muteNonQualifying.checked = current.muteNonQualifying;

  baseUrlInput.value = await apiBaseUrl.getValue();
  tokenInput.value = await apiToken.getValue();
})();

form.addEventListener("submit", (event) => {
  event.preventDefault();
  void (async () => {
    const next = {
      ...(await readCriteria()),
      budgetMaxCents: Number(budgetMax.value || 0) * 100,
      maxMileageKm: maxMileage.value === "" ? null : Number(maxMileage.value),
      yearMin: yearMin.value === "" ? null : Number(yearMin.value),
      radiusKm: Number(radiusKm.value || 100),
      originCity: originCity.value.trim() || "Charlottetown",
      muteNonQualifying: muteNonQualifying.checked,
    };

    // Validate against the same contract the server uses — a shape that would be
    // rejected server-side should not be storable locally either.
    const parsed = SavedCriteriaSchema.safeParse(next);
    if (!parsed.success) {
      savedFlag.textContent = parsed.error.issues[0]?.message ?? "Invalid";
      savedFlag.hidden = false;
      return;
    }

    await criteria.setValue(parsed.data);
    savedFlag.textContent = "Saved";
    savedFlag.hidden = false;
    setTimeout(() => (savedFlag.hidden = true), 1_500);
  })();
});

saveConnection.addEventListener("click", () => {
  void (async () => {
    await apiBaseUrl.setValue(baseUrlInput.value.trim());
    await apiToken.setValue(tokenInput.value.trim());
  })();
});
