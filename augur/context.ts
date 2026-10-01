import type { ErrorEntry, SubmitContext } from "./store";

// Diagnostic context attached to person-initiated submissions. It collects places,
// never words: the page path (no query string or fragment, which routinely carry
// tokens and emails), the app version, the viewport, the browser, and short lines
// from the last few uncaught errors. It never reads the DOM, form fields, or
// anything the person typed elsewhere in the app.

const EXTENSION_PREFIXES = ["chrome-extension://", "moz-extension://", "safari-extension://"];
const MAX_ERRORS = 5;
const MAX_MESSAGE = 120;

// Drop the query string and fragment from a URL or path.
export const stripUrl = (u: string): string => u.replace(/[?#].*$/, "");

// First line only, cut to 120 characters.
export const cleanMessage = (m: string): string => String(m ?? "").split(/\r?\n/, 1)[0].slice(0, MAX_MESSAGE);

let sessionId = "";
export function getSessionId(): string {
  if (sessionId) return sessionId;
  try {
    sessionId = sessionStorage.getItem("augur.sid") || "";
    if (!sessionId) { sessionId = crypto.randomUUID(); sessionStorage.setItem("augur.sid", sessionId); }
  } catch {
    if (!sessionId) sessionId = crypto.randomUUID();   // private mode: in memory only
  }
  return sessionId;
}

// Turn a raw error into a stored entry, or null if it should be dropped (browser
// extensions, or a host-listed noise source such as an analytics script).
export function normalizeError(
  raw: { name?: string; filename?: string; lineno?: number; message?: string; stack?: string },
  ignore: string[] = [],
): ErrorEntry | null {
  let source = raw.filename ?? "";
  let line = raw.lineno ?? 0;
  if (!source && raw.stack) {
    const m = /(\w[\w+.-]*:\/\/[^\s)]+?):(\d+):\d+/.exec(raw.stack);
    if (m) { source = m[1]; line = Number(m[2]); }
  }
  source = stripUrl(source);
  if ([...EXTENSION_PREFIXES, ...ignore].some((p) => p && source.startsWith(p))) return null;
  return { type: raw.name || "Error", source, line, message: cleanMessage(raw.message ?? "") };
}

const errors: ErrorEntry[] = [];
function push(e: ErrorEntry | null) {
  if (!e) return;
  errors.push(e);
  while (errors.length > MAX_ERRORS) errors.shift();
}

// Install the two window listeners. Returns an uninstall. Called only when
// config.context is true; with context off nothing is ever attached.
export function installErrorCapture(ignore: string[]): () => void {
  if (typeof window === "undefined") return () => {};
  const onError = (e: ErrorEvent) => push(normalizeError({
    name: (e.error as Error | undefined)?.name, filename: e.filename, lineno: e.lineno,
    message: e.message || (e.error as Error | undefined)?.message, stack: (e.error as Error | undefined)?.stack,
  }, ignore));
  const onRejection = (e: PromiseRejectionEvent) => {
    const r = e.reason as { name?: string; message?: string; stack?: string } | undefined;
    push(normalizeError(r && typeof r === "object"
      ? { name: r.name, message: r.message, stack: r.stack }
      : { name: "UnhandledRejection", message: String(e.reason) }, ignore));
  };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
    errors.length = 0;
  };
}

export function captureContext(source: string, appVersion?: string): SubmitContext {
  const ctx: SubmitContext = {
    route: typeof location !== "undefined" ? stripUrl(location.pathname) : "",
    viewport: typeof window !== "undefined" ? { w: window.innerWidth, h: window.innerHeight } : { w: 0, h: 0 },
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    timestamp: new Date().toISOString(),
    source,
    sessionId: getSessionId(),
    errors: [...errors],
  };
  if (appVersion) ctx.appVersion = appVersion;
  return ctx;
}
