/** Logomark: one request entering a junction and leaving on a chosen route, lit in the brand gradient. */
export function Logo({ size = 24 }: { size?: number }) {
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center rounded-[30%] shadow-[0_8px_24px_-8px_color-mix(in_srgb,var(--brand)_90%,transparent),inset_0_1px_0_rgba(255,255,255,0.3)]"
      style={{ width: size, height: size, background: "var(--brand-gradient)" }}
      aria-hidden
    >
      <svg width={size * 0.72} height={size * 0.72} viewBox="0 0 24 24" fill="none">
        <path d="M3.5 12 H9.5" stroke="#fff" strokeOpacity="0.75" strokeWidth="2" strokeLinecap="round" />
        <path d="M9.5 12 C 13 12, 13.5 6.5, 18.5 6.5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M9.5 12 C 13 12, 13.5 17.5, 18.5 17.5" stroke="#fff" strokeOpacity="0.45" strokeWidth="2" strokeLinecap="round" />
        <circle cx="3.6" cy="12" r="2" fill="#fff" />
        <circle cx="19" cy="6.5" r="2.3" fill="#fff" />
      </svg>
    </span>
  );
}
