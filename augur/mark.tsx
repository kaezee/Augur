// The Augur mark, inline so the module carries its own brand with no asset
// dependency (the SVG wordmark lives in the Augur repo; this is the portable
// in-app version). Eye-in-triangle drawn as one evenodd path: the eye is negative
// space so it reads on any background, the spark is a filled island inside it.

export function AugurMark({ size = 18, title }: { size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="currentColor" aria-hidden={!title} role={title ? "img" : undefined} style={{ flex: "0 0 auto" }}>
      {title && <title>{title}</title>}
      <path fillRule="evenodd" clipRule="evenodd" d="M24 4 L45 43 L3 43 Z
        M12 33 Q24 25 36 33 Q24 41 12 33 Z
        M24 28 L26 31 L29 33 L26 35 L24 38 L22 35 L19 33 L22 31 Z" />
    </svg>
  );
}

// "by Augur" — the small attribution shown at the foot of every prompt. Becomes a
// link to the repo once REPO_URL is set (deferred until the public repo exists).
export const AUGUR_REPO_URL = ""; // e.g. "https://github.com/<you>/augur"

export function AugurByline({ style }: { style?: React.CSSProperties }) {
  const inner = (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, opacity: 0.55, fontSize: 11, fontWeight: 600, letterSpacing: ".02em", ...style }}>
      by <AugurMark size={12} /> <span>Augur</span>
    </span>
  );
  return AUGUR_REPO_URL
    ? <a href={AUGUR_REPO_URL} target="_blank" rel="noreferrer noopener" style={{ textDecoration: "none", color: "inherit" }}>{inner}</a>
    : inner;
}
