"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * The listings a user has pulled out of the catalogue to act on.
 *
 * Backed by localStorage rather than component state because it spans routes —
 * added in the catalogue drawer, read on the dashboard, opened from the
 * negotiate page. A `useState` in any one of those would lose it on navigation.
 *
 * TODO(integration): this is per-device. It becomes a table keyed on the user
 * once auth lands, and this module is the only place that has to change.
 */

const KEY = "autoscout:shortlist";

/**
 * localStorage fires `storage` only in *other* tabs, so same-tab listeners need
 * their own signal — without this, adding in the drawer would not update the
 * header count until a reload.
 */
const CHANGED = "autoscout:shortlist-changed";

function read(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    // A corrupt or unavailable store is not worth failing a page render over.
    return [];
  }
}

function write(ids: string[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    // Private browsing, quota, disabled storage. The in-memory state still
    // updates, so the current session behaves correctly.
  }
  window.dispatchEvent(new Event(CHANGED));
}

export function useShortlist() {
  // Starts empty and fills after mount: reading localStorage during render
  // would make the server and client markup disagree.
  const [ids, setIds] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setIds(read());
    setReady(true);

    const sync = () => setIds(read());
    window.addEventListener(CHANGED, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGED, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const add = useCallback((id: string) => {
    const next = read();
    if (!next.includes(id)) next.push(id);
    write(next);
  }, []);

  const remove = useCallback((id: string) => {
    write(read().filter((existing) => existing !== id));
  }, []);

  const toggle = useCallback((id: string) => {
    const current = read();
    write(current.includes(id) ? current.filter((e) => e !== id) : [...current, id]);
  }, []);

  const has = useCallback((id: string) => ids.includes(id), [ids]);

  return { ids, ready, add, remove, toggle, has };
}
