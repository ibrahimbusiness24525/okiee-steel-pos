import { useState, useEffect, useRef } from "react";
import { useTheme } from "../context/ThemeContext";
import { useLang } from "../context/LangContext";
import { useResponsive, Icon, ICONS, Modal, FInput, SaveBtn, StatCard, Table } from "../components/shared";
import { api, API, authHeaders } from "../utils/api";
import { formatPKR } from "../utils/helpers";

// ── Okiiee Logo SVG ──────────────────────────────────────────────────────────
function OkiieeLogoMark({ size = 32, animated = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg"
      style={animated ? { animation:"okSpin 18s linear infinite", transformOrigin:"center" } : {}}>
      {/* Gear outer teeth */}
      {[0,30,60,90,120,150,180,210,240,270,300,330].map((deg, i) => (
        <rect key={i} x="44" y="2" width="12" height="16" rx="3"
          fill="#7c6ef7"
          transform={`rotate(${deg} 50 50)`}
          style={animated ? { animation:`okPulse 3s ease-in-out ${i * 0.25}s infinite alternate` } : {}}
        />
      ))}
      {/* Gear body arc — left open like the logo */}
      <path d="M 50 18 A 32 32 0 1 1 18 50" stroke="#7c6ef7" strokeWidth="12" fill="none" strokeLinecap="round"/>
      {/* Inner circle cutout */}
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

// ── Animated counter ──────────────────────────────────────────────────────────
function CountUp({ target, duration = 1200 }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!target) return;
    let start = null;
    const step = (ts) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      setVal(Math.floor(p * target));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target]);
  return <span>{val}</span>;
}

// ── Floating particle background ─────────────────────────────────────────────
function ParticleField() {
  const particles = Array.from({ length: 18 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: 2 + Math.random() * 3,
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
          background:"rgba(124,110,247,0.35)",
          animation:`okFloat ${p.dur}s ${p.delay}s ease-in-out infinite alternate`,
        }}/>
      ))}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
function SuperAdminPage({ onLogout }) {
  const th = useTheme();
  const { isMobile } = useResponsive();
  const [admins, setAdmins] = useState([]);
  const [stats, setStats] = useState({ adminCount:0, staffCount:0, totalUsers:0 });
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name:"", email:"", password:"", businessName:"" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [hoveredAdmin, setHoveredAdmin] = useState(null);

  const load = async () => {
    try {
      const [ar, sr] = await Promise.all([api.saGetAdmins(), api.saGetStats()]);
      if (ar.success) setAdmins(ar.admins);
      if (sr.success) setStats(sr.stats);
    } catch(e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openAdd = () => { setForm({ name:"", email:"", password:"", businessName:"" }); setEditing(null); setError(""); setShowPass(false); setShowModal(true); };
  const openEdit = (a) => { setForm({ name:a.name, email:a.email, password:"", businessName:a.businessName||"" }); setEditing(a._id); setError(""); setShowPass(false); setShowModal(true); };

  const save = async () => {
    setError("");
    if (!form.name.trim()) { setError("Name is required"); return; }
    if (!form.email.trim()) { setError("Email is required"); return; }
    if (!editing && !form.password.trim()) { setError("Password is required"); return; }
    setSaving(true);
    const payload = { name:form.name.trim(), email:form.email.trim().toLowerCase(), businessName:form.businessName.trim() };
    if (form.password.trim()) payload.password = form.password.trim();
    if (!editing) payload.password = form.password.trim();
    const res = editing ? await api.saUpdateAdmin(editing, payload) : await api.saAddAdmin(payload);
    if (res.success) { await load(); setShowModal(false); }
    else setError(res.message || "Error saving");
    setSaving(false);
  };

  const del = async (a) => {
    if (!window.confirm(`Remove admin "${a.name}" from SteelPOS?`)) return;
    const res = await api.saDeleteAdmin(a._id);
    if (res.success) await load(); else alert(res.message);
  };

  const inp = {
    background:"rgba(124,110,247,0.06)",
    border:"1px solid rgba(124,110,247,0.2)",
    color:"#e5e7eb",
    borderRadius:12,
    padding:"11px 14px",
    fontSize:14,
    outline:"none",
    width:"100%",
    boxSizing:"border-box",
    transition:"border-color 0.2s",
  };

  // ── Loading screen ──────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#0d1117" }}>
      <style>{CSS}</style>
      <ParticleField/>
      <div style={{ textAlign:"center", position:"relative", zIndex:1 }}>
        <div style={{ display:"flex", justifyContent:"center", marginBottom:20 }}>
          <OkiieeLogoMark size={64} animated/>
        </div>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:10, marginBottom:8 }}>
          <OkiieeWordmark size={26}/>
          <span style={{ color:"#4b5563", fontSize:13, fontWeight:500 }}>× SteelPOS</span>
        </div>
        <div style={{ display:"flex", gap:6, justifyContent:"center", marginTop:16 }}>
          {[0,1,2].map(i=>(
            <div key={i} style={{ width:6, height:6, borderRadius:"50%", background:"#7c6ef7", animation:`okDot 1.2s ${i*0.2}s ease-in-out infinite` }}/>
          ))}
        </div>
      </div>
    </div>
  );

  // ── Main UI ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight:"100vh", background:"#0d1117", display:"flex", flexDirection:"column", position:"relative" }}>
      <style>{CSS}</style>
      <ParticleField/>

      {/* ── Header ── */}
      <header style={{ position:"sticky", top:0, zIndex:40, background:"rgba(13,17,23,0.92)", backdropFilter:"blur(16px)", borderBottom:"1px solid rgba(124,110,247,0.12)", padding:"0 24px", height:64, display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <div style={{ animation:"okSpin 20s linear infinite", transformOrigin:"center" }}>
            <OkiieeLogoMark size={36}/>
          </div>
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <OkiieeWordmark size={17}/>
              <span style={{ color:"rgba(255,255,255,0.15)", fontSize:13 }}>|</span>
              <span style={{ color:"white", fontWeight:800, fontSize:14, letterSpacing:"0.12em", fontFamily:"monospace" }}>STEEL<span style={{color:"#1abc9c"}}>POS</span></span>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:1 }}>
              <span style={{ width:6, height:6, borderRadius:"50%", background:"#f39c12", display:"inline-block", animation:"okPulse 2s ease-in-out infinite alternate" }}/>
              <span style={{ color:"#f39c12", fontSize:10, fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase" }}>Super Admin Panel</span>
            </div>
          </div>
        </div>
        <button onClick={onLogout}
          style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 18px", borderRadius:10, border:"1px solid rgba(239,68,68,0.3)", background:"rgba(239,68,68,0.07)", color:"#f87171", cursor:"pointer", fontSize:13, fontWeight:600, transition:"all 0.2s" }}
          onMouseEnter={e=>{ e.currentTarget.style.background="rgba(239,68,68,0.15)"; e.currentTarget.style.borderColor="rgba(239,68,68,0.5)"; }}
          onMouseLeave={e=>{ e.currentTarget.style.background="rgba(239,68,68,0.07)"; e.currentTarget.style.borderColor="rgba(239,68,68,0.3)"; }}
        >
          <Icon path={ICONS.logout} size={16}/> Logout
        </button>
      </header>

      {/* ── Content ── */}
      <div style={{ flex:1, padding:isMobile?"16px":"32px", maxWidth:920, margin:"0 auto", width:"100%", boxSizing:"border-box", position:"relative", zIndex:1 }}>

        {/* Hero banner */}
        <div style={{ marginBottom:28, padding:"24px 28px", borderRadius:20, background:"linear-gradient(135deg,rgba(124,110,247,0.12),rgba(243,156,18,0.07))", border:"1px solid rgba(124,110,247,0.2)", position:"relative", overflow:"hidden", animation:"okFadeUp 0.5s ease both" }}>
          {/* decorative glow */}
          <div style={{ position:"absolute", top:-40, right:-40, width:180, height:180, borderRadius:"50%", background:"radial-gradient(circle,rgba(124,110,247,0.15) 0%,transparent 70%)", pointerEvents:"none" }}/>
          <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:8 }}>
            <OkiieeLogoMark size={40} animated/>
            <div>
              <div style={{ color:"white", fontWeight:800, fontSize:isMobile?18:22 }}>
                Super Admin Dashboard
              </div>
              <div style={{ color:"#9ca3af", fontSize:13, marginTop:2 }}>
                Powered by <OkiieeWordmark size={13}/> — Manage all SteelPOS business accounts
              </div>
            </div>
          </div>
        </div>

        {/* Stat cards */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:14, marginBottom:28 }}>
          {[
            { label:"Total Admins",  value:stats.adminCount, color:"#f39c12", icon:"👑", delay:"0.1s" },
            { label:"Total Staff",   value:stats.staffCount, color:"#7c6ef7", icon:"👤", delay:"0.2s" },
            { label:"Total Users",   value:stats.totalUsers, color:"#1abc9c", icon:"👥", delay:"0.3s" },
          ].map((s,i)=>(
            <div key={i} style={{ borderRadius:18, padding:"20px 22px", border:`1px solid ${s.color}25`, background:`${s.color}08`, display:"flex", alignItems:"center", gap:14, animation:`okFadeUp 0.5s ${s.delay} ease both`, transition:"transform 0.2s, box-shadow 0.2s", cursor:"default" }}
              onMouseEnter={e=>{ e.currentTarget.style.transform="translateY(-3px)"; e.currentTarget.style.boxShadow=`0 12px 32px ${s.color}20`; }}
              onMouseLeave={e=>{ e.currentTarget.style.transform="none"; e.currentTarget.style.boxShadow="none"; }}
            >
              <div style={{ fontSize:32 }}>{s.icon}</div>
              <div>
                <div style={{ color:"#9ca3af", fontSize:11, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:2 }}>{s.label}</div>
                <div style={{ color:s.color, fontWeight:900, fontSize:28, lineHeight:1 }}><CountUp target={s.value}/></div>
              </div>
            </div>
          ))}
        </div>

        {/* Section header */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16, animation:"okFadeUp 0.5s 0.35s ease both" }}>
          <div>
            <h2 style={{ color:"white", fontWeight:800, fontSize:19, margin:0 }}>Admin Accounts</h2>
            <p style={{ color:"#6b7280", fontSize:13, margin:"3px 0 0" }}>{admins.length} admin{admins.length !== 1 ? "s" : ""} registered</p>
          </div>
          <button onClick={openAdd}
            style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 22px", borderRadius:12, border:"none", cursor:"pointer", background:"linear-gradient(135deg,#7c6ef7,#5b4fcf)", color:"white", fontWeight:700, fontSize:14, boxShadow:"0 4px 20px rgba(124,110,247,0.35)", transition:"all 0.2s" }}
            onMouseEnter={e=>{ e.currentTarget.style.transform="translateY(-2px)"; e.currentTarget.style.boxShadow="0 8px 28px rgba(124,110,247,0.45)"; }}
            onMouseLeave={e=>{ e.currentTarget.style.transform="none"; e.currentTarget.style.boxShadow="0 4px 20px rgba(124,110,247,0.35)"; }}
          >
            <Icon path={ICONS.plus} size={16}/> New Admin
          </button>
        </div>

        {/* Admin list */}
        {admins.length === 0 ? (
          <div style={{ textAlign:"center", padding:"70px 24px", borderRadius:20, border:"2px dashed rgba(124,110,247,0.15)", background:"rgba(124,110,247,0.03)", animation:"okFadeUp 0.5s 0.4s ease both" }}>
            <OkiieeLogoMark size={52} animated/>
            <p style={{ color:"#6b7280", fontSize:15, fontWeight:600, marginTop:16 }}>No admins yet</p>
            <p style={{ color:"#4b5563", fontSize:13, margin:"4px 0 20px" }}>Create your first admin to get started</p>
            <button onClick={openAdd} style={{ padding:"11px 28px", borderRadius:12, border:"none", cursor:"pointer", background:"linear-gradient(135deg,#7c6ef7,#5b4fcf)", color:"white", fontWeight:700, fontSize:14 }}>
              + Create Admin
            </button>
          </div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            {admins.map((a, idx) => (
              <div key={a._id}
                style={{ borderRadius:18, padding:"18px 22px", border:`1px solid ${hoveredAdmin===a._id?"rgba(124,110,247,0.35)":"rgba(124,110,247,0.1)"}`, background:hoveredAdmin===a._id?"rgba(124,110,247,0.07)":"rgba(124,110,247,0.03)", display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, flexWrap:"wrap", transition:"all 0.22s", animation:`okFadeUp 0.4s ${0.05*idx}s ease both`, cursor:"default" }}
                onMouseEnter={()=>setHoveredAdmin(a._id)}
                onMouseLeave={()=>setHoveredAdmin(null)}
              >
                <div style={{ display:"flex", alignItems:"center", gap:14 }}>
                  {/* Avatar with animated ring on hover */}
                  <div style={{ position:"relative" }}>
                    <div style={{ width:50, height:50, borderRadius:"50%", background:"linear-gradient(135deg,#7c6ef7,#5b4fcf)", display:"flex", alignItems:"center", justifyContent:"center", color:"white", fontWeight:900, fontSize:20, flexShrink:0, boxShadow:hoveredAdmin===a._id?"0 0 0 3px rgba(124,110,247,0.4)":"none", transition:"box-shadow 0.22s" }}>
                      {(a.name||"A")[0].toUpperCase()}
                    </div>
                    <div style={{ position:"absolute", bottom:0, right:0, width:14, height:14, borderRadius:"50%", background:"#1abc9c", border:"2px solid #0d1117" }}/>
                  </div>
                  <div>
                    <div style={{ color:"white", fontWeight:700, fontSize:15 }}>{a.name}</div>
                    <div style={{ color:"#7c6ef7", fontSize:13, marginTop:2 }}>{a.email}</div>
                    {a.businessName && <div style={{ color:"#9ca3af", fontSize:12, marginTop:2 }}>🏢 {a.businessName}</div>}
                    <div style={{ color:"#4b5563", fontSize:11, marginTop:3 }}>Joined {new Date(a.createdAt).toLocaleDateString("en-PK", { year:"numeric", month:"short", day:"numeric" })}</div>
                  </div>
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  <button onClick={()=>openEdit(a)}
                    style={{ padding:"8px 16px", borderRadius:10, border:"1px solid rgba(124,110,247,0.3)", background:"rgba(124,110,247,0.08)", color:"#a78bfa", cursor:"pointer", fontSize:13, fontWeight:600, transition:"all 0.18s" }}
                    onMouseEnter={e=>{ e.currentTarget.style.background="rgba(124,110,247,0.18)"; }}
                    onMouseLeave={e=>{ e.currentTarget.style.background="rgba(124,110,247,0.08)"; }}
                  >✏️ Edit</button>
                  <button onClick={()=>del(a)}
                    style={{ padding:"8px 16px", borderRadius:10, border:"1px solid rgba(239,68,68,0.3)", background:"rgba(239,68,68,0.07)", color:"#f87171", cursor:"pointer", fontSize:13, fontWeight:600, transition:"all 0.18s" }}
                    onMouseEnter={e=>{ e.currentTarget.style.background="rgba(239,68,68,0.16)"; }}
                    onMouseLeave={e=>{ e.currentTarget.style.background="rgba(239,68,68,0.07)"; }}
                  >🗑️ Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Modal ── */}
        {showModal && (
          <div style={{ position:"fixed", inset:0, zIndex:50, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
            <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.75)", backdropFilter:"blur(8px)" }} onClick={()=>setShowModal(false)}/>
            <div style={{ position:"relative", width:"100%", maxWidth:430, borderRadius:22, border:"1px solid rgba(124,110,247,0.25)", background:"#13161f", boxShadow:"0 30px 70px rgba(0,0,0,0.6)", overflow:"hidden", animation:"okModalIn 0.28s cubic-bezier(0.34,1.56,0.64,1) both" }}>

              {/* Modal header */}
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"18px 24px", borderBottom:"1px solid rgba(124,110,247,0.1)", background:"linear-gradient(135deg,rgba(124,110,247,0.1),rgba(91,79,207,0.06))" }}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ width:38, height:38, borderRadius:12, background:"linear-gradient(135deg,#7c6ef7,#5b4fcf)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <OkiieeLogoMark size={22}/>
                  </div>
                  <div>
                    <h3 style={{ color:"white", fontWeight:800, fontSize:16, margin:0 }}>{editing ? "Edit Admin" : "New Admin"}</h3>
                    <div style={{ color:"#6b7280", fontSize:11, marginTop:1 }}>SteelPOS · Okiiee</div>
                  </div>
                </div>
                <button onClick={()=>setShowModal(false)} style={{ background:"rgba(255,255,255,0.06)", border:"none", cursor:"pointer", color:"#9ca3af", padding:8, borderRadius:8, display:"flex", alignItems:"center", transition:"background 0.15s" }}
                  onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.12)"}
                  onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.06)"}
                >
                  <Icon path={ICONS.close} size={18}/>
                </button>
              </div>

              {/* Modal body */}
              <div style={{ padding:"22px 24px", display:"flex", flexDirection:"column", gap:16 }}>

                <div>
                  <label style={{ color:"#9ca3af", fontSize:11, textTransform:"uppercase", letterSpacing:"0.08em", display:"block", marginBottom:6 }}>Admin Name *</label>
                  <input type="text" value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))}
                    placeholder="e.g. Imran Khan" style={inp}
                    onFocus={e=>e.target.style.borderColor="#7c6ef7"}
                    onBlur={e=>e.target.style.borderColor="rgba(124,110,247,0.2)"}/>
                </div>

                <div>
                  <label style={{ color:"#9ca3af", fontSize:11, textTransform:"uppercase", letterSpacing:"0.08em", display:"block", marginBottom:6 }}>Email Address *</label>
                  <input type="email" value={form.email} onChange={e=>setForm(p=>({...p,email:e.target.value}))}
                    placeholder="admin@example.com" style={inp}
                    onFocus={e=>e.target.style.borderColor="#7c6ef7"}
                    onBlur={e=>e.target.style.borderColor="rgba(124,110,247,0.2)"}/>
                </div>

                <div>
                  <label style={{ color:"#9ca3af", fontSize:11, textTransform:"uppercase", letterSpacing:"0.08em", display:"block", marginBottom:6 }}>
                    Password {!editing && "*"}
                    {editing && <span style={{ color:"#4b5563", textTransform:"none", fontSize:10, marginLeft:4 }}>(leave empty to keep current)</span>}
                  </label>
                  <div style={{ position:"relative" }}>
                    <input type={showPass?"text":"password"} value={form.password} onChange={e=>setForm(p=>({...p,password:e.target.value}))}
                      placeholder={editing?"Leave empty to keep current":"Create a strong password"}
                      style={{...inp, paddingRight:44}}
                      onFocus={e=>e.target.style.borderColor="#7c6ef7"}
                      onBlur={e=>e.target.style.borderColor="rgba(124,110,247,0.2)"}/>
                    <button type="button" onClick={()=>setShowPass(p=>!p)}
                      style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", color:"#6b7280" }}>
                      <Icon path={ICONS.eye} size={16}/>
                    </button>
                  </div>
                </div>

                {error && (
                  <div style={{ padding:"10px 14px", borderRadius:10, background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.25)", color:"#f87171", fontSize:13, display:"flex", alignItems:"center", gap:8 }}>
                    ⚠ {error}
                  </div>
                )}

                <button onClick={save} disabled={saving}
                  style={{ padding:"13px", borderRadius:12, border:"none", cursor:saving?"not-allowed":"pointer", background:saving?"rgba(124,110,247,0.4)":"linear-gradient(135deg,#7c6ef7,#5b4fcf)", color:"white", fontWeight:700, fontSize:15, marginTop:4, transition:"all 0.2s", boxShadow:saving?"none":"0 4px 18px rgba(124,110,247,0.35)" }}
                  onMouseEnter={e=>{ if(!saving){ e.currentTarget.style.transform="translateY(-1px)"; e.currentTarget.style.boxShadow="0 6px 24px rgba(124,110,247,0.45)"; } }}
                  onMouseLeave={e=>{ e.currentTarget.style.transform="none"; e.currentTarget.style.boxShadow=saving?"none":"0 4px 18px rgba(124,110,247,0.35)"; }}
                >
                  {saving ? "Saving…" : (editing ? "Update Admin" : "Create Admin")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer style={{ position:"relative", zIndex:1, borderTop:"1px solid rgba(255,255,255,0.04)", padding:"14px 24px", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
        <OkiieeLogoMark size={16}/>
        <span style={{ color:"#374151", fontSize:12 }}>Built by</span>
        <OkiieeWordmark size={12}/>
        <span style={{ color:"#374151", fontSize:12 }}>· SteelPOS v1.0</span>
      </footer>
    </div>
  );
}

// ── Keyframe CSS ──────────────────────────────────────────────────────────────
const CSS = `
@keyframes okSpin   { to { transform: rotate(360deg); } }
@keyframes okPulse  { from { opacity:0.5; } to { opacity:1; } }
@keyframes okFloat  { from { transform:translateY(0px); } to { transform:translateY(-18px); } }
@keyframes okDot    { 0%,80%,100%{transform:scale(0.6);opacity:0.4} 40%{transform:scale(1.1);opacity:1} }
@keyframes okFadeUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
@keyframes okModalIn{ from{opacity:0;transform:scale(0.92) translateY(10px)} to{opacity:1;transform:scale(1) translateY(0)} }
`;

export default SuperAdminPage;