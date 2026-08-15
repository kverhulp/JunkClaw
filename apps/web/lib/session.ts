"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * The seam better-auth lands on.
 *
 * `better-auth` is already a dependency and `lib/auth.ts` guards the API routes
 * with extension bearer tokens, but there is no session provider, no auth route
 * handler, and no user table wired to a browser session yet. That is backend
 * work.
 *
 * So this is a **stub**, and it is honest about it: it stores an email in
 * localStorage and nothing more. It authenticates nobody, protects nothing, and
 * verifies no password. It exists so the sign-in and sign-up screens are real
 * screens with real states, and so the swap is mechanical —
 *
 *   TODO(integration): replace the body of these functions with better-auth's
 *   client (`signIn.email`, `signUp.email`, `useSession`). The shape returned
 *   here matches theirs closely enough that the components should not change.
 *
 * Nothing in the app treats this as proof of identity: no route is gated on it,
 * because a gate a user can lift with devtools is worse than no gate — it
 * suggests a protection that isn't there.
 */

const KEY = "autoscout:session";
const CHANGED = "autoscout:session-changed";

export interface SessionUser {
  email: string;
  name: string;
}

function read(): SessionUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { email, name } = parsed as Partial<SessionUser>;
    return typeof email === "string" && typeof name === "string" ? { email, name } : null;
  } catch {
    return null;
  }
}

function write(user: SessionUser | null): void {
  try {
    if (user) window.localStorage.setItem(KEY, JSON.stringify(user));
    else window.localStorage.removeItem(KEY);
  } catch {
    // Private browsing or disabled storage. In-memory state still updates.
  }
  // `storage` only fires in other tabs, so same-tab listeners need their own.
  window.dispatchEvent(new Event(CHANGED));
}

export interface AuthResult {
  ok: boolean;
  error?: string;
}

/** Deliberately permissive: this is shape validation, not identity checking. */
function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function useSession() {
  // Starts null and fills after mount: reading localStorage during render would
  // make the server and client markup disagree.
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setUser(read());
    setReady(true);

    const sync = () => setUser(read());
    window.addEventListener(CHANGED, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGED, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    if (!validEmail(email)) return { ok: false, error: "Enter a valid email address." };
    if (password.length === 0) return { ok: false, error: "Enter your password." };

    // TODO(integration): better-auth signIn.email({ email, password }).
    write({ email, name: email.split("@")[0] ?? "there" });
    return { ok: true };
  }, []);

  const signUp = useCallback(
    async (name: string, email: string, password: string): Promise<AuthResult> => {
      if (name.trim().length === 0) return { ok: false, error: "Enter your name." };
      if (!validEmail(email)) return { ok: false, error: "Enter a valid email address." };
      if (password.length < 8) {
        return { ok: false, error: "Use at least 8 characters for your password." };
      }

      // TODO(integration): better-auth signUp.email({ name, email, password }).
      write({ email, name: name.trim() });
      return { ok: true };
    },
    [],
  );

  const signOut = useCallback(() => write(null), []);

  return { user, ready, signedIn: user !== null, signIn, signUp, signOut };
}
