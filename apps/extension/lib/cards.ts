/**
 * Matching a listing in the payload to its card in the grid.
 *
 * Verified against the live Charlottetown vehicles grid on 2026-08-14: all 24
 * payload ids appeared in the DOM as `/marketplace/item/{id}` hrefs, and the
 * anchor carrying that href *is* the card (241x329 — image, price, and title).
 *
 * The match is on the URL, not on a class name. Facebook's class names are
 * obfuscated and rotate; a listing's own permalink does not, because their
 * routing depends on it. That distinction is what keeps this off the weekly
 * firefighting treadmill.
 */

const ITEM_HREF = /\/marketplace\/item\/(\d+)/;

export interface MatchedCard {
  externalId: string;
  card: HTMLElement;
}

/** Pulls the listing id out of a Marketplace permalink. */
export function externalIdFromHref(href: string | null): string | null {
  if (!href) return null;
  return ITEM_HREF.exec(href)?.[1] ?? null;
}

/**
 * Finds every listing card currently in the DOM.
 *
 * The grid virtualises, so this is called repeatedly as the user scrolls and
 * must stay cheap and idempotent. Duplicate hrefs are collapsed: Marketplace
 * sometimes renders the same listing twice across a re-render boundary, and
 * badging both would double-count nothing but would look broken.
 */
export function findCards(root: ParentNode = document): MatchedCard[] {
  const seen = new Set<string>();
  const out: MatchedCard[] = [];

  for (const anchor of root.querySelectorAll<HTMLAnchorElement>(
    'a[href*="/marketplace/item/"]',
  )) {
    const externalId = externalIdFromHref(anchor.getAttribute("href"));
    if (!externalId || seen.has(externalId)) continue;
    seen.add(externalId);
    out.push({ externalId, card: anchor });
  }

  return out;
}
