// src/pages/Auth/ResetPassword.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import axios from "../../api/axios";
import "../../styles/auth-yeti.css";

export default function ResetPassword() {
  const location = useLocation();

  const [step, setStep] = useState("request"); // "request" -> "reset"
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [devToken, setDevToken] = useState("");      // token banner
  const [rawResp, setRawResp] = useState(null);      // show raw server response

  // fun face stuff (unchanged)
  const [eye, setEye] = useState({ x: 0, y: 0 });
  const emailRef = useRef(null);
  const EYE_RANGE = useMemo(() => ({ x: 6, y: 4 }), []);

  // URL token → jump to reset
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const t = params.get("token");
    if (t && t.trim()) {
      setToken(t.trim());
      setDevToken(t.trim());
      setStep("reset");
    }
  }, [location.search]);

  useEffect(() => {
    function onMove(e) {
      if (!emailRef.current) return;
      const ae = document.activeElement;
      if (!ae || !emailRef.current.contains(ae)) return;
      const r = emailRef.current.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = Math.max(-1, Math.min(1, (e.clientX - cx) / (r.width / 2)));
      const dy = Math.max(-1, Math.min(1, (e.clientY - cy) / (r.height / 2)));
      setEye({ x: dx * EYE_RANGE.x, y: dy * EYE_RANGE.y });
    }
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [EYE_RANGE.x, EYE_RANGE.y]);

  useEffect(() => {
    const n = Math.min(12, email.length);
    setEye((prev) => ({ x: (n / 12) * EYE_RANGE.x, y: prev.y }));
  }, [email, EYE_RANGE.x]);

  // Pull a token from any likely field name
  function extractToken(obj) {
    if (!obj || typeof obj !== "object") return "";
    return (
      obj.token ??
      obj.reset_token ??
      obj.code ??
      obj.dev_token ??
      (obj.data && (obj.data.token ?? obj.data.reset_token ?? obj.data.code)) ??
      ""
    );
  }

  // Submit handler
  const onSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setErr("");
    setLoading(true);
    try {
      if (step === "request") {
        const isEmail = /^\S+@\S+\.\S+$/.test(email);
        if (!isEmail) {
          setErr("Please enter a valid email.");
          setLoading(false);
          return;
        }

        const { data } = await axios.post(
          "/auth/request-reset",
          { email },
          { withCredentials: true }
        );

        setRawResp(data);          // <-- show exactly what the server returned
        setSent(true);

        const t = extractToken(data);
        if (t && String(t).trim()) {
          const tok = String(t).trim();
          setDevToken(tok);
          setToken(tok);
        }
        setStep("reset");
      } else {
        if (!token || !token.trim()) {
          setErr("Missing reset code. Paste the code from the email link.");
          setLoading(false);
          return;
        }
        if (!password || password.length < 8) {
          setErr("Password must be at least 8 characters.");
          setLoading(false);
          return;
        }

        await axios.post(
          "/auth/reset",
          { token: token.trim(), password },
          { withCredentials: true }
        );

        // Hard reload so Navbar re-hydrates session cookie
        window.location.replace("/account");
      }
    } catch (error) {
      const st = error?.response?.status;
      const apiMsg =
        error?.response?.data?.message || error?.response?.data?.error;
      let msg = apiMsg || "Request failed.";
      if (st === 400 && step === "reset") msg = "Invalid or expired reset code.";
      setErr(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="y-auth">
      <section className="y-card" role="region" aria-labelledby="resetTitle">
        <header className="y-head">
          <KidFace eyeX={eye.x} eyeY={eye.y} closed={false} />
          <h1 id="resetTitle" className="y-title">
            {step === "request" ? "Reset password" : "Set a new password"}
          </h1>
          {step === "request" ? (
            <p className="y-sub">We’ll email you a reset link</p>
          ) : (
            <p className="y-sub">Paste the code and set a new password</p>
          )}
        </header>

        {err ? (
          <div className="y-alert" role="alert">
            {err}
          </div>
        ) : null}

        {sent && step === "reset" ? (
          <div
            className="y-alert"
            role="status"
            style={{ color: "#166534", background: "#f0fdf4", borderColor: "#bbf7d0" }}
          >
            If an account exists for <strong>{email}</strong>, we sent a reset link.
          </div>
        ) : null}

        {/* DEV TOKEN BANNER */}
        {step === "reset" && (devToken || token) && (
          <div
            className="y-alert"
            role="status"
            style={{
              color: "#166534",
              background: "#f0fdf4",
              borderColor: "#bbf7d0",
              marginBottom: "8px",
            }}
          >
            Dev code:&nbsp;
            <code className="font-mono">{devToken || token}</code>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(devToken || token)}
              className="y-link"
              style={{ marginLeft: 8 }}
            >
              Copy
            </button>
          </div>
        )}

        {/* RAW RESPONSE VIEW (helps confirm what server sent in dev) */}
        {step === "reset" && rawResp && (
          <div
            className="y-alert"
            role="status"
            style={{
              background: "#f8fafc",
              borderColor: "#cbd5e1",
              color: "#0f172a",
              marginBottom: "8px",
              wordBreak: "break-word",
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Server response (dev):</div>
            <code style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
              {JSON.stringify(rawResp)}
            </code>
          </div>
        )}

        <form className="y-form" onSubmit={onSubmit} noValidate>
          {step === "request" ? (
            <>
              <div className="y-field" ref={emailRef}>
                <label htmlFor="email" className="y-label">Email</label>
                <input
                  id="email"
                  type="email"
                  className="y-input"
                  placeholder="email@company.com"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  inputMode="email"
                />
              </div>
              <button className="y-btn" type="submit" disabled={loading} aria-busy={loading ? "true" : "false"}>
                {loading ? "Sending…" : "Send reset link"}
              </button>
            </>
          ) : (
            <>
              {!new URLSearchParams(location.search).get("token") && (
                <div className="y-field">
                  <label htmlFor="token" className="y-label">Reset code</label>
                  <input
                    id="token"
                    className="y-input"
                    placeholder="Paste reset code"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    required
                  />
                </div>
              )}

              <div className="y-field">
                <label htmlFor="newpw" className="y-label">New password</label>
                <input
                  id="newpw"
                  type={showPwd ? "text" : "password"}
                  className="y-input"
                  placeholder="At least 8 characters"
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
                <button type="button" className="y-show-toggle" onClick={() => setShowPwd((v) => !v)}>
                  {showPwd ? "Hide password" : "Show password"}
                </button>
              </div>

              <button className="y-btn" type="submit" disabled={loading} aria-busy={loading ? "true" : "false"}>
                {loading ? "Saving…" : "Set new password"}
              </button>
            </>
          )}
        </form>

        <div className="y-row">
          <Link to="/login" className="y-link">Back to sign in</Link>
        </div>
      </section>
    </main>
  );
}

function KidFace({ eyeX = 0, eyeY = 0, closed = false }) {
  const style = { ["--eye-x"]: `${eyeX}px`, ["--eye-y"]: `${eyeY}px` };
  return (
    <div className={`y-kid ${closed ? "is-closed" : ""}`} style={style} aria-hidden="true">
      <svg className="kid-svg" viewBox="0 0 200 200" width="160" height="160" role="img" aria-label="Kid avatar">
        <circle cx="100" cy="100" r="84" fill="#E6F0FA" stroke="#9DBFEA" strokeWidth="2" />
        <circle cx="100" cy="98" r="42" fill="#FFFFFF" stroke="#121826" strokeWidth="2" />
        <path d="M72 92 L84 76 L92 88 L100 72 L108 88 L116 76 L128 92" fill="#FFFFFF" stroke="#121826" strokeWidth="2" strokeLinejoin="round" />
        <circle cx="62" cy="98" r="7" fill="#EAF2FC" stroke="#121826" strokeWidth="2" />
        <circle cx="138" cy="98" r="7" fill="#EAF2FC" stroke="#121826" strokeWidth="2" />
        <g className="eye-open">
          <ellipse cx="85" cy="104" rx="9" ry="7" fill="#fff" stroke="#121826" strokeWidth="2" />
          <circle className="pupil" cx="85" cy="104" r="3.2" fill="#121826" />
          <ellipse cx="115" cy="104" rx="9" ry="7" fill="#fff" stroke="#121826" strokeWidth="2" />
          <circle className="pupil" cx="115" cy="104" r="3.2" fill="#121826" />
        </g>
        <g className="eye-closed">
          <path d="M76 104 Q85 100 94 104" fill="none" stroke="#121826" strokeWidth="2" strokeLinecap="round" />
          <path d="M106 104 Q115 100 124 104" fill="none" stroke="#121826" strokeWidth="2" strokeLinecap="round" />
        </g>
        <path d="M88 120 Q100 126 112 120" fill="none" stroke="#121826" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </div>
  );
}
