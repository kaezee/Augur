import { useState } from "react";
import type { HostConfig } from "./config";
import type { AugurStore } from "./store";
import { AugurAdminSection } from "./admin";
import { AugurMark } from "./mark";

// Standalone admin page for portable hosts that just want the whole thing — brand
// bar + the full admin section + optional change-password. Kronicler mounts
// AugurAdminSection directly inside its own admin shell instead. Portable: --k-*
// tokens with fallbacks.

const page: React.CSSProperties = { minHeight: "100vh", background: "var(--k-bg-sunken, #F7F6F1)", color: "var(--k-text-primary, #1F1C15)", font: "500 14px/1.5 var(--k-font-sans, ui-sans-serif, system-ui, sans-serif)" };
const bar: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "14px 24px", borderBottom: "1px solid var(--k-border, #E7E2D3)", background: "var(--k-bg-raised, #fff)", position: "sticky", top: 0, zIndex: 10 };
const shell: React.CSSProperties = { maxWidth: 960, margin: "0 auto", padding: "28px 24px 64px" };
const card: React.CSSProperties = { background: "var(--k-bg-raised, #fff)", border: "1px solid var(--k-border, #E7E2D3)", borderRadius: "var(--k-radius-container, 10px)", padding: 18, marginTop: 20 };
const muted: React.CSSProperties = { color: "var(--k-text-tertiary, #98917E)", fontSize: 12.5 };
const input: React.CSSProperties = { font: "inherit", padding: "7px 10px", minHeight: 44, boxSizing: "border-box", borderRadius: "var(--k-radius-control, 6px)", border: "1px solid var(--k-border, #E7E2D3)", background: "var(--k-bg-surface, #fff)", color: "inherit" };
const btn: React.CSSProperties = { font: "inherit", fontWeight: 600, cursor: "pointer", padding: "8px 14px", minHeight: 44, minWidth: 44, borderRadius: "var(--k-radius-control, 6px)", border: "1px solid var(--k-border-strong, #D3CCB9)", background: "var(--k-bg-surface, #fff)", color: "var(--k-text-secondary, #5C5647)" };
const primary: React.CSSProperties = { ...btn, border: "1px solid transparent", background: "var(--k-action-fill, #394293)", color: "var(--k-on-action-fill, #fff)" };

export function AugurConsole({ store, hostConfig, email, onSignOut, onChangePassword, selfUserId }: {
  store: AugurStore;
  hostConfig: HostConfig;
  email: string;
  onSignOut: () => void;
  onChangePassword?: (newPassword: string) => Promise<void>;
  selfUserId?: string;
}) {
  return (
    <div style={page}>
      <div style={bar}>
        <strong style={{ fontSize: 15, display: "inline-flex", alignItems: "center", gap: 8 }}><AugurMark size={18} /> Augur <span style={{ ...muted, fontWeight: 500 }}>· admin</span></strong>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={muted}>{email}</span>
          <button style={btn} onClick={onSignOut}>Sign out</button>
        </div>
      </div>
      <div style={shell}>
        <AugurAdminSection store={store} hostConfig={hostConfig} selfUserId={selfUserId} />
        {onChangePassword && <ChangePassword onChangePassword={onChangePassword} />}
      </div>
    </div>
  );
}

function ChangePassword({ onChangePassword }: { onChangePassword: (pw: string) => Promise<void> }) {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const submit = async () => {
    if (pw.length < 6) return;
    setBusy(true); setMsg(null);
    try { await onChangePassword(pw); setPw(""); setMsg("Password updated."); }
    catch (e) { setMsg(String((e as Error)?.message ?? e)); }
    finally { setBusy(false); }
  };
  return (
    <div style={card}>
      <h2 style={{ margin: "0 0 4px", fontSize: 16 }}>Admin password</h2>
      <p style={{ ...muted, margin: "0 0 12px" }}>Change the password for this admin login. At least 6 characters.</p>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="New password" autoComplete="new-password" style={{ ...input, width: 240 }} />
        <button style={primary} onClick={submit} disabled={busy || pw.length < 6}>{busy ? "Updating…" : "Update password"}</button>
        {msg && <span style={muted}>{msg}</span>}
      </div>
    </div>
  );
}
