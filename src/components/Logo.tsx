export function LogoMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <circle cx="16" cy="16" r="14" fill="#0b1220" stroke="#38bdf8" strokeWidth="1.5" />
      <path d="M5 20c6-9 14-13 22-11" stroke="#38bdf8" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M8 23.5c5-5 11-7.5 17-8" stroke="#38bdf8" strokeWidth="1.2" strokeLinecap="round" opacity="0.45" />
      <path d="M27 9l-4.4 1.1 1.5 1.6L27 9z" fill="#fff" />
      <circle cx="11.5" cy="16.5" r="1.6" fill="#ff7a45" />
    </svg>
  );
}

export function Logo({ size = 24 }: { size?: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
      <LogoMark size={size} />
      <span style={{ fontWeight: 700, fontSize: size * 0.72, letterSpacing: "-0.03em", lineHeight: 1 }}>
        aviata
      </span>
    </span>
  );
}
