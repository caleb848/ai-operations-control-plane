/** Logomark: one request, two lanes (local and cloud). */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect x="0.5" y="0.5" width="23" height="23" rx="6" fill="var(--surface-3)" stroke="var(--line-strong)" />
      <path d="M6 12 C 10 12, 11 7, 16 7" stroke="var(--local)" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M6 12 C 10 12, 11 17, 16 17" stroke="var(--cloud)" strokeWidth="2" fill="none" strokeLinecap="round" />
      <circle cx="6" cy="12" r="2.2" fill="var(--fg)" />
      <circle cx="17.5" cy="7" r="1.8" fill="var(--local)" />
      <circle cx="17.5" cy="17" r="1.8" fill="var(--cloud)" />
    </svg>
  );
}
