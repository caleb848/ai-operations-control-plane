import type { DataClassification, FindingKind, SensitivityFinding } from "../types";
import { maxClassification } from "./classification";

/**
 * Deterministic sensitivity scanner. It runs before routing, costs nothing,
 * and never calls a model. Each finding names the minimum classification it
 * implies; the effective classification is the maximum across findings and
 * the user's declared label.
 */

interface Detector {
  kind: FindingKind;
  label: string;
  impliesAtLeast: DataClassification;
  find: (text: string) => number;
}

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// North American formats: (416) 555-0142, 416-555-0142, +1 416 555 0142
const PHONE = /(?:\+?1[\s.-]?)?\(?\b[2-9]\d{2}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g;
const CARD_CANDIDATE = /\b\d(?:[ -]?\d){12,18}\b/g;
// Canadian SIN (3-3-3) and US SSN (3-2-4), plus unseparated 9-digit IDs next to an ID keyword.
const SIN = /\b\d{3}[ -]\d{3}[ -]\d{3}\b/g;
const SSN = /\b\d{3}-\d{2}-\d{4}\b/g;
export const KEYED_GOV_ID = /\b(?:SSN|SIN|social (?:security|insurance)(?: number| no\.?)?)\s*[:#]?\s*\d{9}\b/gi;

export const SECRET_PATTERNS: { label: string; re: RegExp }[] = [
  { label: "Anthropic API key", re: /\bsk-ant-[A-Za-z0-9_-]{16,}/g },
  { label: "OpenAI-style API key", re: /\bsk-(?!ant-)(?:proj-)?[A-Za-z0-9_-]{20,}/g },
  { label: "AWS access key", re: /\bAKIA[0-9A-Z]{16}\b/g },
  { label: "GitHub token", re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g },
  { label: "Google API key", re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { label: "Slack token", re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g },
  { label: "Private key block", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { label: "Bearer token", re: /\bBearer\s+[A-Za-z0-9._~+/-]{20,}=*/g },
  { label: "JSON Web Token", re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  {
    label: "Credential assignment",
    re: /\b(?:[A-Za-z0-9]+[_-])?(?:password|passwd|pwd|secret|api[_-]?key|access[_-]?key|auth[_-]?token|token)\s*[:=]\s*["']?[^\s"']{8,}/gi,
  },
];

function count(re: RegExp, text: string): number {
  return text.match(re)?.length ?? 0;
}

function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return digits.length >= 13 && sum % 10 === 0;
}

function countCards(text: string): number {
  const matches = text.match(CARD_CANDIDATE) ?? [];
  return matches.filter((m) => luhnValid(m.replace(/\D/g, ""))).length;
}

function keywordCount(text: string, words: RegExp[]): number {
  return words.reduce((n, re) => n + count(re, text), 0);
}

// Lower-case "restricted" is ordinary prose ("restricted parking"); only explicit
// markings escalate.
const RESTRICTED_MARKERS = [
  /\bRESTRICTED\b/g,
  /\bclassification:\s*restricted\b/gi,
  /\battorney[- ]client privilege/gi,
  /\bprivileged (?:and|&) confidential\b/gi,
];
const CONFIDENTIAL_MARKERS = [/\bconfidential\b/gi, /\bunder nda\b/gi, /\bdo not (?:distribute|forward|share)\b/gi, /\bclient[- ]sensitive\b/gi];
const INTERNAL_MARKERS = [/\binternal(?: use)? only\b/gi, /\bnot for (?:external|public) (?:use|distribution)\b/gi, /\binternal draft\b/gi];

const DETECTORS: Detector[] = [
  {
    kind: "secret",
    label: "Credential or API key",
    impliesAtLeast: "restricted",
    find: (t) => SECRET_PATTERNS.reduce((n, p) => n + count(p.re, t), 0),
  },
  {
    kind: "government_id",
    label: "Government ID number (SIN/SSN)",
    impliesAtLeast: "restricted",
    find: (t) => count(SIN, t) + count(SSN, t) + count(KEYED_GOV_ID, t),
  },
  { kind: "payment_card", label: "Payment card number", impliesAtLeast: "restricted", find: countCards },
  {
    kind: "health",
    label: "Health information",
    impliesAtLeast: "restricted",
    find: (t) => keywordCount(t, [/\bdiagnos(?:is|ed)\b/gi, /\bmedical (?:leave|record|condition)\b/gi, /\bprescription\b/gi]),
  },
  {
    kind: "marker",
    label: "Restricted marking",
    impliesAtLeast: "restricted",
    find: (t) => keywordCount(t, RESTRICTED_MARKERS),
  },
  {
    kind: "marker",
    label: "Confidential marking",
    impliesAtLeast: "confidential",
    find: (t) => keywordCount(t, CONFIDENTIAL_MARKERS),
  },
  {
    kind: "compensation",
    label: "Compensation or salary data",
    impliesAtLeast: "confidential",
    find: (t) => keywordCount(t, [/\bsalar(?:y|ies)\b/gi, /\bcompensation band\b/gi, /\bbonus pool\b/gi]),
  },
  { kind: "email", label: "Email address", impliesAtLeast: "internal", find: (t) => count(EMAIL, t) },
  { kind: "phone", label: "Phone number", impliesAtLeast: "internal", find: (t) => count(PHONE, t) },
  {
    kind: "client_identifier",
    label: "Client account details",
    impliesAtLeast: "internal",
    find: (t) => keywordCount(t, [/\bclient(?: account)?:\s/gi, /\baccount (?:no\.|number|#)/gi, /\bcontract value\b/gi, /\bretainer\b/gi]),
  },
  {
    kind: "strategy",
    label: "Internal strategy terms",
    impliesAtLeast: "internal",
    find: (t) => keywordCount(t, [/\bpricing strategy\b/gi, /\broadmap\b/gi, /\bnegotiation\b/gi, /\bmargin(?:s)?\b/gi, /\bunreleased\b/gi]),
  },
  {
    kind: "marker",
    label: "Internal-only marking",
    impliesAtLeast: "internal",
    find: (t) => keywordCount(t, INTERNAL_MARKERS),
  },
];

export interface SensitivityScan {
  findings: SensitivityFinding[];
  detected: DataClassification;
  hasSecrets: boolean;
}

export function scanSensitivity(text: string): SensitivityScan {
  const findings: SensitivityFinding[] = [];
  for (const d of DETECTORS) {
    const n = d.find(text);
    if (n > 0) findings.push({ kind: d.kind, label: d.label, count: n, impliesAtLeast: d.impliesAtLeast });
  }

  // Personal contact details next to client account details read as client
  // records, not just a stray address. Escalate that combination.
  const hasContact = findings.some((f) => f.kind === "email" || f.kind === "phone");
  const hasClient = findings.some((f) => f.kind === "client_identifier");
  if (hasContact && hasClient) {
    findings.push({
      kind: "client_identifier",
      label: "Client contact details",
      count: 1,
      impliesAtLeast: "confidential",
    });
  }

  const detected = findings.reduce<DataClassification>(
    (acc, f) => maxClassification(acc, f.impliesAtLeast),
    "public",
  );
  return { findings, detected, hasSecrets: findings.some((f) => f.kind === "secret") };
}
