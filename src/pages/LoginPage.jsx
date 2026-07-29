import { useState, useEffect } from "react";
import { useLang } from "../context/LangContext";
import { Icon, ICONS } from "../components/shared";
import { api } from "../utils/api";

// ── Same logo components as SuperAdminPage ───────────────────────────────────
function OkiieeLogoMark({ size = 32, animated = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg"
      style={animated ? { animation:"okSpin 18s linear infinite", transformOrigin:"center" } : {}}>
      {[0,30,60,90,120,150,180,210,240,270,300,330].map((deg, i) => (
        <rect key={i} x="44" y="2" width="12" height="16" rx="3"
          fill="#7c6ef7"
          transform={`rotate(${deg} 50 50)`}
          style={animated ? { animation:`okPulse 3s ease-in-out ${i * 0.25}s infinite alternate` } : {}}
        />
      ))}
      <path d="M 50 18 A 32 32 0 1 1 18 50" stroke="#7c6ef7" strokeWidth="12" fill="none" strokeLinecap="round"/>
      <circle cx="50" cy="50" r="14" fill="#0d1117"/>
    </svg>
  );
}

function OkiieeWordmark({ size = 18 }) {
  return (
    <span style={{
      fontFamily:"'Inter','Segoe UI',sans-serif",
      fontWeight:800,
      fontSize:size,
      letterSpacing:"-0.02em",
      color:"white",
    }}>
      Oki<span style={{ color:"#7c6ef7" }}>iee</span>
    </span>
  );
}

// ── Floating particles (same as SuperAdminPage) ──────────────────────────────
function ParticleField() {
  const particles = Array.from({ length: 22 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: 1.5 + Math.random() * 3,
    delay: Math.random() * 6,
    dur: 6 + Math.random() * 6,
  }));
  return (
    <div style={{ position:"fixed", inset:0, pointerEvents:"none", overflow:"hidden", zIndex:0 }}>
      {particles.map(p => (
        <div key={p.id} style={{
          position:"absolute",
          left:`${p.x}%`, top:`${p.y}%`,
          width:p.size, height:p.size,
          borderRadius:"50%",
          background:"rgba(124,110,247,0.3)",
          animation:`okFloat ${p.dur}s ${p.delay}s ease-in-out infinite alternate`,
        }}/>
      ))}
    </div>
  );
}

// ── Animated grid lines in background ───────────────────────────────────────
function GridOverlay() {
  return (
    <div style={{
      position:"fixed", inset:0, pointerEvents:"none", zIndex:0,
      backgroundImage:"linear-gradient(rgba(124,110,247,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(124,110,247,0.04) 1px,transparent 1px)",
      backgroundSize:"60px 60px",
    }}/>
  );
}

// ── Corner glow accents ──────────────────────────────────────────────────────
function GlowAccents() {
  return (
    <>
      <div style={{ position:"fixed", top:-120, left:-120, width:400, height:400, borderRadius:"50%", background:"radial-gradient(circle,rgba(124,110,247,0.12) 0%,transparent 70%)", pointerEvents:"none", zIndex:0 }}/>
      <div style={{ position:"fixed", bottom:-120, right:-120, width:400, height:400, borderRadius:"50%", background:"radial-gradient(circle,rgba(26,188,156,0.09) 0%,transparent 70%)", pointerEvents:"none", zIndex:0 }}/>
    </>
  );
}

// ── Main Login Component ─────────────────────────────────────────────────────
function LoginPage({ onLogin }) {
  const { t } = useLang();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // trigger fade-in after mount
    const t = setTimeout(() => setMounted(true), 60);
    return () => clearTimeout(t);
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const cleanEmail    = email.trim().toLowerCase();
      const cleanPassword = password.trim();
      if (!cleanEmail || !cleanPassword) {
        setError(t.wrongCredentials || "Email aur password chahiye");
        setLoading(false);
        return;
      }
      const data = await api.login(cleanEmail, cleanPassword);
      if (data.token) {
        localStorage.setItem("steelpos_token", data.token);
        onLogin({ _id: data._id, name: data.name, email: data.email, role: data.role });
      } else {
        setError(data.message || t.wrongCredentials);
      }
    } catch (err) {
      setError("Server error: " + (err.message || t.serverError));
    }
    setLoading(false);
  };

  const inp = {
    width:"100%",
    padding:"12px 16px",
    borderRadius:12,
    boxSizing:"border-box",
    background:"rgba(124,110,247,0.06)",
    border:"1px solid rgba(124,110,247,0.2)",
    color:"#e5e7eb",
    fontSize:14,
    outline:"none",
    transition:"border-color 0.2s, box-shadow 0.2s",
    fontFamily:"'Inter','Segoe UI',sans-serif",
  };

  return (
    <div style={{
      minHeight:"100vh",
      display:"flex",
      alignItems:"center",
      justifyContent:"center",
      background:"#0d1117",
      position:"relative",
      overflow:"hidden",
      padding:16,
      fontFamily:"'Inter','Segoe UI',sans-serif",
    }}>
      <style>{CSS}</style>
      <ParticleField/>
      <GridOverlay/>
      <GlowAccents/>

      {/* ── Card ── */}
      <div style={{
        position:"relative",
        zIndex:10,
        width:"100%",
        maxWidth:420,
        opacity: mounted ? 1 : 0,
        transform: mounted ? "translateY(0)" : "translateY(20px)",
        transition:"opacity 0.5s ease, transform 0.5s ease",
      }}>

        {/* ── Brand header ── */}
        <div style={{ textAlign:"center", marginBottom:28 }}>
          {/* Animated logo */}
          <div style={{
            display:"inline-flex",
            alignItems:"center",
            justifyContent:"center",
            width:76,
            height:76,
            borderRadius:22,
            background:"linear-gradient(135deg,rgba(124,110,247,0.15),rgba(91,79,207,0.1))",
            border:"1px solid rgba(124,110,247,0.3)",
            marginBottom:16,
            boxShadow:"0 0 40px rgba(124,110,247,0.2)",
            animation:"okFloat 4s ease-in-out infinite alternate",
          }}>
            <OkiieeLogoMark size={44} animated/>
          </div>

          {/* Brand name row */}
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:10, marginBottom:4 }}>
            <OkiieeWordmark size={20}/>
            <span style={{ color:"rgba(255,255,255,0.15)", fontSize:16 }}>×</span>
            <span style={{
              color:"white",
              fontWeight:900,
              fontSize:18,
              letterSpacing:"0.18em",
              fontFamily:"monospace",
            }}>
              STEEL<span style={{ color:"#1abc9c" }}>POS</span>
            </span>
          </div>

          {/* Subtitle */}
          <div style={{ color:"#4b5563", fontSize:12, letterSpacing:"0.06em" }}>
            {t.appSub || "Management System"}
          </div>

          {/* Status pill */}
          <div style={{
            display:"inline-flex",
            alignItems:"center",
            gap:6,
            marginTop:10,
            padding:"4px 12px",
            borderRadius:20,
            background:"rgba(26,188,156,0.08)",
            border:"1px solid rgba(26,188,156,0.2)",
          }}>
            <span style={{ width:6, height:6, borderRadius:"50%", background:"#1abc9c", display:"inline-block", animation:"okPulse 2s ease-in-out infinite alternate" }}/>
            <span style={{ color:"#1abc9c", fontSize:10, fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase" }}>
              System Online
            </span>
          </div>
        </div>

        {/* ── Form card ── */}
        <div style={{
          borderRadius:22,
          padding:"28px 26px",
          border:"1px solid rgba(124,110,247,0.18)",
          background:"rgba(13,17,23,0.85)",
          backdropFilter:"blur(24px)",
          boxShadow:"0 30px 70px rgba(0,0,0,0.55), 0 0 0 1px rgba(124,110,247,0.05) inset",
        }}>

          {/* Card header */}
          <div style={{ marginBottom:22, paddingBottom:18, borderBottom:"1px solid rgba(124,110,247,0.1)" }}>
            <h2 style={{ color:"#e5e7eb", fontSize:17, fontWeight:700, margin:"0 0 4px" }}>
              {t.welcomeBack || "Welcome Back"}
            </h2>
            <p style={{ color:"#4b5563", fontSize:13, margin:0 }}>
              Sign in to continue to your dashboard
            </p>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              marginBottom:18,
              padding:"10px 14px",
              borderRadius:10,
              background:"rgba(239,68,68,0.08)",
              border:"1px solid rgba(239,68,68,0.25)",
              color:"#f87171",
              fontSize:13,
              display:"flex",
              alignItems:"center",
              gap:8,
              animation:"okFadeUp 0.25s ease both",
            }}>
              ⚠ {error}
            </div>
          )}

          <form onSubmit={handleLogin} style={{ display:"flex", flexDirection:"column", gap:16 }}>

            {/* Email */}
            <div>
              <label style={{ color:"#9ca3af", fontSize:10, textTransform:"uppercase", letterSpacing:"0.1em", display:"block", marginBottom:6 }}>
                {t.email || "Email"}
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="your@email.com"
                autoComplete="email"
                style={inp}
                onFocus={e => { e.target.style.borderColor="#7c6ef7"; e.target.style.boxShadow="0 0 0 3px rgba(124,110,247,0.12)"; }}
                onBlur={e => { e.target.style.borderColor="rgba(124,110,247,0.2)"; e.target.style.boxShadow="none"; }}
              />
            </div>

            {/* Password */}
            <div>
              <label style={{ color:"#9ca3af", fontSize:10, textTransform:"uppercase", letterSpacing:"0.1em", display:"block", marginBottom:6 }}>
                {t.password || "Password"}
              </label>
              <div style={{ position:"relative" }}>
                <input
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  autoComplete="current-password"
                  style={{ ...inp, paddingRight:44 }}
                  onFocus={e => { e.target.style.borderColor="#7c6ef7"; e.target.style.boxShadow="0 0 0 3px rgba(124,110,247,0.12)"; }}
                  onBlur={e => { e.target.style.borderColor="rgba(124,110,247,0.2)"; e.target.style.boxShadow="none"; }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", color:"#6b7280", padding:0, display:"flex", alignItems:"center" }}
                >
                  <Icon path={showPass ? ICONS.eye_off : ICONS.eye} size={17}/>
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width:"100%",
                padding:"13px",
                borderRadius:12,
                border:"none",
                cursor: loading ? "not-allowed" : "pointer",
                marginTop:4,
                background: loading
                  ? "rgba(124,110,247,0.4)"
                  : "linear-gradient(135deg,#7c6ef7,#5b4fcf)",
                color:"#fff",
                fontWeight:700,
                fontSize:14,
                letterSpacing:"0.04em",
                transition:"all 0.2s",
                boxShadow: loading ? "none" : "0 4px 20px rgba(124,110,247,0.35)",
                display:"flex",
                alignItems:"center",
                justifyContent:"center",
                gap:8,
              }}
              onMouseEnter={e => { if (!loading) { e.currentTarget.style.transform="translateY(-1px)"; e.currentTarget.style.boxShadow="0 8px 28px rgba(124,110,247,0.45)"; } }}
              onMouseLeave={e => { e.currentTarget.style.transform="none"; e.currentTarget.style.boxShadow=loading?"none":"0 4px 20px rgba(124,110,247,0.35)"; }}
            >
              {loading ? (
                <>
                  <span style={{ width:14, height:14, border:"2px solid rgba(255,255,255,0.3)", borderTopColor:"white", borderRadius:"50%", display:"inline-block", animation:"okSpin 0.7s linear infinite" }}/>
                  {t.authenticating || "Authenticating..."}
                </>
              ) : (
                t.login || "Sign In"
              )}
            </button>
          </form>
        </div>

        {/* ── Footer ── */}
        <div style={{ textAlign:"center", marginTop:20, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
          <OkiieeLogoMark size={14}/>
          <span style={{ color:"#374151", fontSize:12 }}>Built by</span>
          <OkiieeWordmark size={12}/>
          <span style={{ color:"#374151", fontSize:12 }}>· SteelPOS v1.0</span>
        </div>
      </div>
    </div>
  );
}

const CSS = `
  @keyframes okSpin   { to { transform: rotate(360deg); } }
  @keyframes okPulse  { from { opacity:0.5; } to { opacity:1; } }
  @keyframes okFloat  { from { transform:translateY(0px); } to { transform:translateY(-14px); } }
  @keyframes okFadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
`;

export default LoginPage;