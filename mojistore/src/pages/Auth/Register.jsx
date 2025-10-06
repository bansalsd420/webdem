// src/pages/Auth/Register.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import axios from "../../api/axios";
import "../../styles/auth-yeti.css";

export default function Register() {
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo =
    new URLSearchParams(location.search).get("next") ||
    location.state?.from ||
    "/account";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [eye, setEye] = useState({ x: 0, y: 0 });
  const nameRef = useRef(null);
  const emailRef = useRef(null);
  const pwdRef = useRef(null);
  const pwd2Ref = useRef(null);
  const [pwdFocused, setPwdFocused] = useState(false);
  const EYE_RANGE = useMemo(() => ({ x: 6, y: 4 }), []);

  useEffect(() => {
    function onMove(e) {
      const ae = document.activeElement;
      const target =
        (pwd2Ref.current && ae && pwd2Ref.current.contains(ae)) ? pwd2Ref.current :
        (pwdRef.current && ae && pwdRef.current.contains(ae)) ? pwdRef.current :
        (emailRef.current && ae && emailRef.current.contains(ae)) ? emailRef.current :
        (nameRef.current && ae && nameRef.current.contains(ae)) ? nameRef.current :
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

    if (!name.trim()) return setErr("Please enter your name.");
    if (pwd.length < 6) return setErr("Password must be at least 6 characters.");
    if (pwd !== pwd2) return setErr("Passwords do not match.");

    setLoading(true);
    try {
      await axios.post(
        "/auth/register",
        { name, email, password: pwd },
        { withCredentials: true }
      );
      navigate(redirectTo, { replace: true });
    } catch (error) {
      const st = error?.response?.status;
      const apiMsg = error?.response?.data?.message || error?.response?.data?.error;
      let msg = apiMsg || "Registration failed.";
      if (st === 409) msg = "An account with this email already exists.";
      if (st === 400) msg = "Please fill all fields correctly.";
      setErr(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="y-auth">
      <section className="y-card" role="region" aria-labelledby="regTitle">
        <header className="y-head">
          <KidFace eyeX={eye.x} eyeY={eye.y} closed={pwdFocused} />
          <h1 id="regTitle" className="y-title">Create account</h1>
          <p className="y-sub">Join MojiStore wholesale</p>
        </header>

        {err ? <div className="y-alert" role="alert">{err}</div> : null}

        <form className="y-form" onSubmit={onSubmit} noValidate>
          <div className="y-field" ref={nameRef}>
            <label htmlFor="name" className="y-label">Name</label>
            <input id="name" className="y-input" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
          </div>

          <div className="y-field" ref={emailRef}>
            <label htmlFor="email" className="y-label">Email</label>
            <input id="email" type="email" className="y-input" placeholder="email@company.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required inputMode="email" />
          </div>

          <div className="y-field" ref={pwdRef}>
            <label htmlFor="password" className="y-label">Password</label>
            <input id="password" type={showPwd ? "text" : "password"} className="y-input" placeholder="••••••••"
                   value={pwd} onChange={(e) => setPwd(e.target.value)} minLength={6}
                   onFocus={() => setPwdFocused(true)} onBlur={() => setPwdFocused(false)}
                   autoComplete="new-password" required />
            <button type="button" className="y-show-toggle" onClick={() => setShowPwd(v => !v)}>
              {showPwd ? "Hide password" : "Show password"}
            </button>
          </div>

          <div className="y-field" ref={pwd2Ref}>
            <label htmlFor="password2" className="y-label">Confirm password</label>
            <input id="password2" type={showPwd ? "text" : "password"} className="y-input" placeholder="••••••••"
                   value={pwd2} onChange={(e) => setPwd2(e.target.value)} minLength={6}
                   onFocus={() => setPwdFocused(true)} onBlur={() => setPwdFocused(false)}
                   autoComplete="new-password" required />
          </div>

          <button className="y-btn" type="submit" disabled={loading} aria-busy={loading ? "true" : "false"}>
            {loading ? "Creating…" : "Create account"}
          </button>
        </form>

        <div className="y-row">
          <span>Have an account?</span>
          <Link to="/login" className="y-link">Sign in</Link>
        </div>
      </section>
    </main>
  );
}

/* same minimal avatar as Login (tighter disc) */
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
          <path d="M76 104 Q85 100 94 104" fill="none" stroke="#121826" strokeWidth="2" strokeLinecap="round"/>
          <path d="M106 104 Q115 100 124 104" fill="none" stroke="#121826" strokeWidth="2" strokeLinecap="round"/>
        </g>
        <path d="M88 120 Q100 126 112 120" fill="none" stroke="#121826" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </div>
  );
}
