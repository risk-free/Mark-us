/**
 * Server-side portal session guard (P2.6, deny by default).
 *
 * Every authenticated portal page calls `requireContact` before rendering:
 * no cookie or an invalid/expired one (API 401) goes to sign-in, and so does a
 * *staff* session — the portal renders for CONTACT principals only, so a staff
 * cookie must never see client data (the API would 403 anyway; the redirect
 * keeps the failure quiet). No staff-login surface exists in apps/web yet, so
 * staff sessions land on the portal sign-in page for now.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { apiServerGet, type ActorContext } from "./portal-api";

/** Raw Cookie header rebuilt from the incoming request jar. */
export async function portalCookieHeader(): Promise<string> {
  const jar = await cookies();
  return jar.getAll().map((entry) => `${entry.name}=${entry.value}`).join("; ");
}

export async function requireContact(locale: string): Promise<ActorContext> {
  const cookieHeader = await portalCookieHeader();
  const signIn = `/${locale}/portal/sign-in`;
  if (cookieHeader === "") redirect(signIn);

  const me = await apiServerGet<ActorContext>("/auth/me", cookieHeader);
  if (!me.ok || me.data.contactId === null) redirect(signIn);
  return me.data;
}
