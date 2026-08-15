"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button, Input } from "../ui/primitives";
import { useSession } from "../../lib/session";

/**
 * Sign in and sign up.
 *
 * One component for both because the difference is a name field and the copy —
 * two nearly-identical forms drift apart, and then one of them quietly stops
 * showing errors.
 *
 * The notice at the bottom is not boilerplate: this does not authenticate
 * anyone yet, and a screen that looks like a login while doing nothing is the
 * kind of thing that gets shipped by accident.
 */
export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const { signIn, signUp } = useSession();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const isSignUp = mode === "sign-up";

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const result = isSignUp
      ? await signUp(name, email, password)
      : await signIn(email, password);

    setPending(false);

    if (!result.ok) {
      setError(result.error ?? "Something went wrong.");
      return;
    }

    router.push("/dashboard");
  }

  return (
    <main className="mx-auto max-w-[420px] px-6 py-20">
      <h1 className="text-[32px]">{isSignUp ? "Create an account" : "Sign in"}</h1>
      <p className="mt-2 text-[15px] text-text-secondary">
        {isSignUp
          ? "Your shortlist, saved criteria, and price alerts stay with your account."
          : "Welcome back."}
      </p>

      <hr className="my-6 h-0.5 border-0 bg-divider" />

      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {isSignUp ? (
          <Input
            label="Name"
            name="name"
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        ) : null}

        <Input
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />

        <Input
          label="Password"
          name="password"
          type="password"
          autoComplete={isSignUp ? "new-password" : "current-password"}
          hint={isSignUp ? "At least 8 characters." : undefined}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />

        {/* Announced, not just coloured: an error a screen reader misses is an
            error the user cannot act on. */}
        {error ? (
          <p role="alert" className="m-0 border-2 border-accent px-3 py-2 text-[13px] text-accent-700">
            {error}
          </p>
        ) : null}

        <Button variant="primary" type="submit" disabled={pending} className="mt-2">
          {pending ? "Working…" : isSignUp ? "Create account" : "Sign in"}
        </Button>
      </form>

      <p className="mt-6 text-[14px] text-text-secondary">
        {isSignUp ? "Already have an account? " : "No account yet? "}
        <Link
          href={isSignUp ? "/sign-in" : "/sign-up"}
          className="text-accent-700 underline underline-offset-4"
        >
          {isSignUp ? "Sign in" : "Create one"}
        </Link>
      </p>

      <p className="mt-8 border-t-2 border-divider pt-4 text-[12px] text-text-muted">
        Not wired to real authentication yet. This stores an email in your browser so the signed-in
        screens can be seen — it verifies nothing and protects nothing.
      </p>
    </main>
  );
}
