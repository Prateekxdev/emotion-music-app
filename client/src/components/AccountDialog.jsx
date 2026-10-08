import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";

export default function AccountDialog({ onClose, onAuthenticated, initialMode = "login", resetToken = "" }) {
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [actionUrl, setActionUrl] = useState("");
  const [token, setToken] = useState(resetToken);
  const dialogRef = useRef(null);

  useEffect(() => {
    const previous = document.activeElement;
    dialogRef.current?.querySelector("input")?.focus();
    function handleKey(event) {
      if (event.key === "Escape") dialogRef.current?.querySelector(".account-close")?.click();
      if (event.key === "Tab") {
        const controls = [...(dialogRef.current?.querySelectorAll("button:not(:disabled),input:not(:disabled),a[href]") || [])];
        if (!controls.length) return;
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => { window.removeEventListener("keydown", handleKey); previous?.focus?.(); };
  }, []);

  async function submit(event) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage(""); setActionUrl("");
    try {
      const options = { method: "POST", headers: { "Content-Type": "application/json" } };
      if (mode === "register") {
        const result = await api("/api/auth/register", { ...options, body: JSON.stringify({ email, password }) });
        setMessage(result.message || "Check your email for a verification link.");
        setActionUrl(result.verificationUrl || "");
      } else if (mode === "forgot") {
        const result = await api("/api/auth/password/request", { ...options, body: JSON.stringify({ email }) });
        setMessage(result.message || "If a verified account exists, a reset link will be sent.");
        setActionUrl(result.resetUrl || "");
      } else if (mode === "reset") {
        await api("/api/auth/password/reset", { ...options, body: JSON.stringify({ token, password }) });
        setMode("login"); setPassword(""); setToken(""); setMessage("Password updated. Sign in with your new password.");
      } else {
        const result = await api("/api/auth/login", { ...options, body: JSON.stringify({ email, password }) });
        onAuthenticated(result);
        onClose();
      }
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  const title = mode === "register" ? "Create your account" : mode === "forgot" ? "Reset your password" : mode === "reset" ? "Choose a new password" : "Welcome back";
  const action = mode === "register" ? "Create account" : mode === "forgot" ? "Send reset link" : mode === "reset" ? "Update password" : "Sign in";

  return <div className="account-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="account-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="account-title">
      <button className="account-close" type="button" onClick={onClose} aria-label="Close sign in">×</button>
      <span className="step-tag">YOUR PRIVATE LISTENING SPACE</span>
      <h2 id="account-title">{title}</h2>
      <p>{mode === "forgot" || mode === "reset" ? "We’ll help you get back to your private listening space." : "Your library, playlists, feedback, and mood mixes stay with your account."}</p>
      <form onSubmit={submit}>
        {(mode === "login" || mode === "register" || mode === "forgot") && <label className="field"><span>EMAIL</span><input type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)}/></label>}
        {(mode === "login" || mode === "register" || mode === "reset") && <label className="field"><span>{mode === "reset" ? "NEW PASSWORD (10 CHARACTERS MINIMUM)" : `PASSWORD ${mode === "register" ? "(10 CHARACTERS MINIMUM)" : ""}`}</span><input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "register" || mode === "reset" ? 10 : 1} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)}/></label>}
        {error && <div className="error-banner" role="alert">{error}</div>}
        {message && <div className="account-success" role="status">{message}{actionUrl && <a href={actionUrl}>{mode === "register" ? "Verify email" : "Open password reset"}</a>}</div>}
        <button className="find-songs-button" disabled={busy}>{busy ? "Working…" : action}</button>
      </form>
      {mode === "login" && <button className="account-switch" onClick={() => { setMode("forgot"); setError(""); setMessage(""); }}>Forgot password?</button>}
      {(mode === "login" || mode === "register") && <button className="account-switch" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); setMessage(""); }}>{mode === "login" ? "New here? Create an account" : "Already have an account? Sign in"}</button>}
      {(mode === "forgot" || mode === "reset") && <button className="account-switch" onClick={() => { setMode("login"); setError(""); setMessage(""); }}>Back to sign in</button>}
    </section>
  </div>;
}
