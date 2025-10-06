// src/pages/Auth/Login.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import axios from "../../api/axios";
import "../../styles/auth-yeti.css";

export default function Login() {
  const location = useLocation();
  const redirectTo =
    new URLSearchParams(location.search).get("next") ||
    location.state?.from ||
    "/account";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // Eye tracking (minimal, no hands)
  const [eye, setEye] = useState({ x: 0, y: 0 });
  const emailRef = useRef(null);
  const pwdRef = useRef(null);
  const [pwdFocused, setPwdFocused] = useState(false);
  const EYE_RANGE = useMemo(() => ({ x: 6, y: 4 }), []);

  useEffect(() => {
    function onMove(e) {
      const ae = document.activeElement;
      const target =
        (pwdRef.current && ae && pwdRef.current.contains(ae)) ? pwdRef.current :
        (emailRef.current && ae && emailRef.current.contains(ae)) ? emailRef.current :
        null;
      if (!target) return;
      const r = target.getBoundingClientRect();
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

  const onSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setErr("");
    setLoading(true);
    try {
      await axios.post(
        "/auth/login",
        { email, password },
        { withCredentials: true }
      );
      // force reload to pick up httpOnly cookie
      window.location.replace(redirectTo || "/account");
    } catch (error) {
      const st = error?.response?.status;
      const apiMsg = error?.response?.data?.message || error?.response?.data?.error;
      let msg = apiMsg || "Couldn’t sign in. Please try again.";
      switch (st) {
        case 400: msg = "Please enter both email and password."; break;
        case 401: msg = "Wrong email or password."; break;
        case 404: msg = "Account not found. Use “Forgot password” to bootstrap."; break;
        case 423: msg = "Password not set. Use “Forgot password” to create one."; break;
        case 429: msg = "Too many attempts. Try again shortly."; break;
        case 500: msg = "Server error. Please try again."; break;
        default: msg = apiMsg || msg;
      }
      setErr(msg);
    } finally {
      setLoading(false);
    }
  };

  const closed = pwdFocused; // close eyes when password input is focused

  return (
    <main className="y-auth">
      <section className="y-card" role="region" aria-labelledby="loginTitle">
        <header className="y-head">
          <KidFace eyeX={eye.x} eyeY={eye.y} closed={closed} />
          <h1 id="loginTitle" className="y-title">Sign in</h1>
          <p className="y-sub">Welcome back to MojiStore</p>
        </header>

        {err ? <div className="y-alert" role="alert">{err}</div> : null}

        <form className="y-form" onSubmit={onSubmit} noValidate>
          <div className="y-field" ref={emailRef}>
            <label htmlFor="email" className="y-label">Email</label>
            <input
              id="email"
              type="email"
              className="y-input"
              placeholder="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              inputMode="email"
            />
          </div>

          <div className="y-field" ref={pwdRef}>
            <label htmlFor="password" className="y-label">Password</label>
            <input
              id="password"
              type={showPwd ? "text" : "password"}
              className="y-input"
              placeholder="Password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              onFocus={() => setPwdFocused(true)}
              onBlur={() => setPwdFocused(false)}
            />
            <button
              type="button"
              className="y-show-toggle"
              aria-pressed={showPwd ? "true" : "false"}
              onClick={() => setShowPwd((v) => !v)}
            >
              {showPwd ? "Hide password" : "Show password"}
            </button>
          </div>

          <button
            className="y-btn"
            type="submit"
            disabled={loading}
            aria-busy={loading ? "true" : "false"}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="y-row">
          <Link to="/reset" className="y-link">Forgot password?</Link>
          <span className="y-sep" />
          <Link to="/register" className="y-link">Create account</Link>
        </div>
      </section>
    </main>
  );
}

/* Minimal kid face (no arms). Eyes close when `closed` is true */
function KidFace({ eyeX = 0, eyeY = 0, closed = false }) {
  const style = { ["--eye-x"]: `${eyeX}px`, ["--eye-y"]: `${eyeY}px` };
  return (
    <div className={`y-kid ${closed ? "is-closed" : ""}`} style={style} aria-hidden="true">
      <svg className="kid-svg" viewBox="0 0 200 200" width="160" height="160" role="img" aria-label="Kid avatar">
        {/* tighter background disc */}
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
          <path d="M76 104 Q85 100 94 104" fill="none" stroke="#121826" strokeWidth="2" strokeLinecap="round"/>
          <path d="M106 104 Q115 100 124 104" fill="none" stroke="#121826" strokeWidth="2" strokeLinecap="round"/>
        </g>
        <path d="M88 120 Q100 126 112 120" fill="none" stroke="#121826" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </div>
  );
}
