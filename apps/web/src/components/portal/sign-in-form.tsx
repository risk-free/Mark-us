"use client";

import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

import { apiClient } from "@/lib/portal-api";

/**
 * Magic-link request form (P2.6).
 *
 * The response UI is deliberately neutral: whatever the API answers (202 for
 * known and unknown addresses alike), the visitor sees the same "check your
 * inbox" state. The only divergence is a transport failure, which says so
 * without confirming anything about the address.
 */
export function SignInForm() {
  const t = useTranslations("portal.signIn");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setFailed(false);
    try {
      const result = await apiClient("/auth/magic-link", {
        method: "POST",
        body: { email: email.trim() },
      });
      // 202 (known or not) and even 400 (bad shape) show the same neutral
      // state; only an unreachable API is a visible failure.
      if (result.ok || result.status === 400) {
        setSent(true);
      } else if (result.status === 429) {
        setSent(true);
      } else {
        setFailed(true);
      }
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    return (
      <div role="status">
        <h2>{t("sentTitle")}</h2>
        <p>{t("sentBody")}</p>
      </div>
    );
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)}>
      <label htmlFor="portal-email">{t("emailLabel")}</label>
      <input
        id="portal-email"
        name="email"
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <button type="submit" disabled={pending}>
        {t("submit")}
      </button>
      {failed ? <p role="alert">{t("unavailable")}</p> : null}
    </form>
  );
}
