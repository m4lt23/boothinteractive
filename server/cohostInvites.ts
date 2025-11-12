import crypto from "crypto";

type Invite = { sessionId: string; expiresAt: number; used: boolean; createdBy: string };
const INVITE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const invites = new Map<string, Invite>();

export function createInvite(sessionId: string, createdBy: string) {
  const code = crypto.randomUUID();
  invites.set(code, { sessionId, createdBy, used: false, expiresAt: Date.now() + INVITE_TTL_MS });
  return code;
}

export function redeemInvite(code: string) {
  const inv = invites.get(code);
  if (!inv) return null;
  if (inv.used || Date.now() > inv.expiresAt) return null;
  inv.used = true;
  return inv;
}