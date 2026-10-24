import { KEYED_GOV_ID, SECRET_PATTERNS } from "./sensitivity";

/**
 * Redaction for anything that leaves the execution path: traces, logs,
 * stored previews. Secrets are always removed. PII masking is on by default
 * for stored previews and off for the output a human reviewer must read.
 */

const EMAIL = /([A-Z0-9._%+-])[A-Z0-9._%+-]*@([A-Z0-9.-]+\.[A-Z]{2,})/gi;
const PHONE = /(?:\+?1[\s.-]?)?\(?\b[2-9]\d{2}\)?[\s.-]\d{3}[\s.-](\d{4})\b/g;
const GOV_ID = /\b\d{3}[ -]\d{3}[ -]\d{3}\b|\b\d{3}-\d{2}-\d{4}\b/g;
const CARD = /\b\d(?:[ -]?\d){12,18}\b/g;

function luhn(digits: string): boolean {
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (dbl && (d *= 2) > 9) d -= 9;
    sum += d;
    dbl = !dbl;
  }
  return digits.length >= 13 && sum % 10 === 0;
}

export function redactSecrets(text: string): string {
  let out = text;
  for (const { label, re } of SECRET_PATTERNS) {
    out = out.replace(new RegExp(re.source, re.flags), `[REDACTED ${label.toUpperCase()}]`);
  }
  return out;
}

export function redactPII(text: string): string {
  return text
    .replace(CARD, (m) => (luhn(m.replace(/\D/g, "")) ? "[REDACTED CARD]" : m))
    .replace(new RegExp(KEYED_GOV_ID.source, KEYED_GOV_ID.flags), "[REDACTED ID]")
    .replace(EMAIL, (_m, first: string, domain: string) => `${first}•••@${domain}`)
    .replace(PHONE, (_m, last4: string) => `•••-•••-${last4}`)
    .replace(GOV_ID, "[REDACTED ID]");
}

export function redact(text: string, opts: { pii?: boolean } = {}): string {
  const noSecrets = redactSecrets(text);
  return opts.pii === false ? noSecrets : redactPII(noSecrets);
}

/** Masks a credential for display, e.g. "sk-ant-…9f2c". Never returns the full value. */
export function maskKey(key: string | undefined): string | null {
  if (!key) return null;
  if (key.length < 12) return "••••";
  return `${key.slice(0, 7)}…${key.slice(-4)}`;
}

export function preview(text: string, max = 240): string {
  const clean = redact(text).replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}
