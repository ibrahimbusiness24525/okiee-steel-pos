import { useState } from "react";
import { useTheme } from "../context/ThemeContext";
import { useLang } from "../context/LangContext";
import { useResponsive, Icon, ICONS } from "../components/shared";

// ── Shared Okiiee logo components (same as LoginPage & App.js) ───────────────
function OkiieeLogoMark({ size = 32, animated = false }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 100 100" fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={animated ? { animation: "okSpin 18s linear infinite", transformOrigin: "center" } : {}}
    >
      {[0,30,60,90,120,150,180,210,240,270,300,330].map((deg, i) => (
        <rect key={i} x="44" y="2" width="12" height="16" rx="3"
          fill="#7c6ef7"
          transform={`rotate(${deg} 50 50)`}
          style={animated ? { animation: `okPulse 3s ease-in-out ${i * 0.25}s infinite alternate` } : {}}
        />
      ))}
      <path d="M 50 18 A 32 32 0 1 1 18 50" stroke="#7c6ef7" strokeWidth="12" fill="none" strokeLinecap="round"/>
      <circle cx="50" cy="50" r="14" fill="#0d1117"/>
    </svg>
  );
}

const LOGO_CSS = `
  @keyframes okSpin  { to { transform: rotate(360deg); } }
  @keyframes okPulse { from { opacity:0.5; } to { opacity:1; } }
`;

// ═══════════════════════════════════════════════════════════════════════════
// BOTTOM NAV
// ═══════════════════════════════════════════════════════════════════════════
function BottomNav({ user, active, setActive, onLogout }) {
  const th = useTheme();
  const {t, isUrdu} = useLang();
  const adminNav = [
    {key:"dashboard",    label:t.dashboard, icon:ICONS.dashboard},
    {key:"products",     label:t.products,  icon:ICONS.product},
    {key:"purchase",     label:t.purchase,  icon:ICONS.purchase},
    {key:"sales",        label:t.sales,     icon:ICONS.sales},
    {key:"accounts",     label:t.accounts,  icon:ICONS.bank},
    {key:"staff",        label:t.staff,     icon:ICONS.staff},
    {key:"loaders",      label:"Loaders",   icon:"M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 10V11"},
    {key:"shop-profile", label:isUrdu?"دکان":"Shop Profile", icon:"M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10"},
    {key:"profile",      label:isUrdu?"پروفائل":"My Profile", icon:"M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2 M12 3a4 4 0 100 8 4 4 0 000-8z"},
  ];
  const nav = user.role === "admin" ? adminNav : [
    {key:"billing", label:t.billing, icon:ICONS.invoice},
    {key:"loaders", label:"Loaders", icon:"M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 10V11"},
  ];
  const visible = nav.slice(0, 4);
  return (
    <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:40,background:th.dark?"#0d1117":th.bgCard,borderTop:`1px solid ${th.border}`,boxShadow:th.dark?"none":"0 -2px 12px rgba(15,23,42,0.08)",display:"flex",alignItems:"stretch",paddingBottom:"env(safe-area-inset-bottom)"}}>
      {visible.map(item => (
        <button key={item.key} onClick={() => setActive(item.key)}
          style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,padding:"10px 4px",border:"none",cursor:"pointer",background:"transparent",
            color:active===item.key?"#1abc9c":th.textMuted,transition:"color 0.2s",
            borderTop:`2px solid ${active===item.key?"#1abc9c":"transparent"}`}}>
          <Icon path={item.icon} size={20}/>
          <span style={{fontSize:9,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.04em",fontFamily:"'Segoe UI',sans-serif",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:60}}>{item.label}</span>
        </button>
      ))}
      {nav.length > 4 && <MoreMenu nav={nav.slice(4)} active={active} setActive={setActive} onLogout={onLogout}/>}
      {nav.length <= 4 && (
        <button onClick={onLogout} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,padding:"10px 4px",border:"none",cursor:"pointer",background:"transparent",color:th.textDim,borderTop:"2px solid transparent"}}>
          <Icon path={ICONS.logout} size={20}/>
          <span style={{fontSize:9,fontWeight:600,textTransform:"uppercase",fontFamily:"'Segoe UI',sans-serif"}}>{t.logout}</span>
        </button>
      )}
    </div>
  );
}

function MoreMenu({ nav, active, setActive, onLogout }) {
  const th = useTheme();
  const {t} = useLang();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,padding:"10px 4px",border:"none",cursor:"pointer",background:"transparent",color:"#6b7280",borderTop:"2px solid transparent"}}>
        <Icon path={ICONS.menu} size={20}/>
        <span style={{fontSize:9,fontWeight:600,textTransform:"uppercase",fontFamily:"'Segoe UI',sans-serif"}}>More</span>
      </button>
      {open && (
        <div style={{position:"fixed",inset:0,zIndex:60}} onClick={() => setOpen(false)}>
          <div style={{position:"absolute",bottom:70,right:12,borderRadius:16,border:`1px solid ${th.border}`,background:th.bgModal,boxShadow:"0 -8px 32px rgba(0,0,0,0.4)",minWidth:180,overflow:"hidden"}} onClick={e => e.stopPropagation()}>
            {nav.map(item => (
              <button key={item.key} onClick={() => { setActive(item.key); setOpen(false); }}
                style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:"14px 18px",border:"none",cursor:"pointer",background:active===item.key?"rgba(26,188,156,0.1)":"transparent",color:active===item.key?"#1abc9c":th.text,fontSize:14,fontFamily:"'Segoe UI',sans-serif",textAlign:"left"}}>
                <Icon path={item.icon} size={18}/>{item.label}
              </button>
            ))}
            <div style={{borderTop:`1px solid ${th.border}`}}/>
            <button onClick={() => { onLogout(); setOpen(false); }} style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:"14px 18px",border:"none",cursor:"pointer",background:"transparent",color:"#f87171",fontSize:14,fontFamily:"'Segoe UI',sans-serif",textAlign:"left"}}>
              <Icon path={ICONS.logout} size={18}/>{t.logout}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SIDEBAR
// ═══════════════════════════════════════════════════════════════════════════
function Sidebar({ user, active, setActive, onLogout }) {
  const th = useTheme();
  const {t, isUrdu} = useLang();
  const adminNav = [
    {key:"dashboard",    label:t.dashboard, icon:ICONS.dashboard},
    {key:"products",     label:t.products,  icon:ICONS.product},
    {key:"purchase",     label:t.purchase,  icon:ICONS.purchase},
    {key:"sales",        label:t.sales,     icon:ICONS.sales},
    {key:"accounts",     label:t.accounts,  icon:ICONS.bank},
    {key:"staff",        label:t.staff,     icon:ICONS.staff},
    {key:"loaders",      label:"Loaders",   icon:"M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 10V11"},
    {key:"shop-profile", label:isUrdu?"دکان پروفائل":"Shop Profile", icon:"M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10"},
    {key:"profile",      label:isUrdu?"میری پروفائل":"My Profile",   icon:"M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2 M12 3a4 4 0 100 8 4 4 0 000-8z"},
  ];
  const nav = user.role === "admin" ? adminNav : [
    {key:"billing", label:t.billing, icon:ICONS.invoice},
    {key:"loaders", label:"Loaders", icon:"M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 10V11"},
  ];

  return (
    <aside dir="ltr" style={{width:220,minWidth:220,height:"100vh",background:th.sidebar,borderRight:`1px solid ${th.border}`,display:"flex",flexDirection:"column",flexShrink:0}}>
      <style>{LOGO_CSS}</style>

      {/* ── Brand Header (same layout as LoginPage brand row) ── */}
      <div style={{padding:"18px 16px",borderBottom:`1px solid ${th.border}`}}>
        {/* Logo icon box */}
        <div style={{display:"flex",justifyContent:"center",marginBottom:12}}>
          <div style={{
            width:52, height:52, borderRadius:16,
            display:"flex", alignItems:"center", justifyContent:"center",
            background:"linear-gradient(135deg,rgba(124,110,247,0.18),rgba(91,79,207,0.1))",
            border:"1px solid rgba(124,110,247,0.3)",
            boxShadow:"0 0 24px rgba(124,110,247,0.18)",
            animation:"okFloat 4s ease-in-out infinite alternate",
          }}>
            <OkiieeLogoMark size={32} animated/>
          </div>
        </div>

        {/* Brand name row */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginBottom:3}}>
          <span style={{fontFamily:"'Inter','Segoe UI',sans-serif",fontWeight:800,fontSize:14,letterSpacing:"-0.02em",color:"white"}}>
            Oki<span style={{color:"#7c6ef7"}}>iee</span>
          </span>
          <span style={{color:"rgba(255,255,255,0.15)",fontSize:13}}>×</span>
          <span style={{color:"white",fontWeight:900,fontSize:13,letterSpacing:"0.18em",fontFamily:"monospace"}}>
            STEEL<span style={{color:"#1abc9c"}}>POS</span>
          </span>
        </div>

        {/* Subtitle */}
        <div style={{textAlign:"center",color:"#4b5563",fontSize:9,letterSpacing:"0.06em",marginBottom:10}}>
          {t.appSub || "Management System"}
        </div>

        {/* Status pill */}
        <div style={{display:"flex",justifyContent:"center"}}>
          <div style={{
            display:"inline-flex", alignItems:"center", gap:5,
            padding:"3px 10px", borderRadius:20,
            background:"rgba(26,188,156,0.08)",
            border:"1px solid rgba(26,188,156,0.2)",
          }}>
            <span style={{width:5,height:5,borderRadius:"50%",background:"#1abc9c",display:"inline-block",animation:"okPulse 2s ease-in-out infinite alternate"}}/>
            <span style={{color:"#1abc9c",fontSize:9,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase"}}>System Online</span>
          </div>
        </div>
      </div>

      {/* ── User info ── */}
      <div style={{padding:"12px 16px",borderBottom:`1px solid ${th.border}`}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:32,height:32,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontWeight:700,fontSize:13,background:"linear-gradient(135deg,#e74c3c,#c0392b)",flexShrink:0}}>
            {user.name?.[0] || user.email?.[0]?.toUpperCase()}
          </div>
          <div style={{overflow:"hidden",flex:1}}>
            <div style={{color:"white",fontSize:13,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user.name || user.email}</div>
            <div style={{fontSize:11,color:user.role==="admin"?"#1abc9c":"#3498db",fontFamily:"'Segoe UI',sans-serif"}}>{user.role==="admin"?t.administrator:t.staffRole}</div>
          </div>
        </div>
      </div>

      {/* ── Nav links ── */}
      <nav style={{flex:1,padding:"12px 8px",overflowY:"auto"}}>
        {nav.map(item => (
          <button key={item.key} onClick={() => setActive(item.key)}
            style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:10,border:"none",cursor:"pointer",marginBottom:3,fontSize:13,fontWeight:500,transition:"all 0.2s",
              background:active===item.key?"linear-gradient(135deg,rgba(41,128,185,0.3),rgba(26,188,156,0.2))":"transparent",
              borderLeft:active===item.key?"3px solid #1abc9c":"3px solid transparent",
              color:active===item.key?"#ffffff":"#9ca3af",
              fontFamily:"'Segoe UI',system-ui,sans-serif",textAlign:"left"}}
            onMouseEnter={e=>{if(active!==item.key){e.currentTarget.style.background="rgba(255,255,255,0.06)";e.currentTarget.style.color="#e5e7eb"}}}
            onMouseLeave={e=>{if(active!==item.key){e.currentTarget.style.background="transparent";e.currentTarget.style.color="#9ca3af"}}}>
            <Icon path={item.icon} size={16}/><span>{item.label}</span>
          </button>
        ))}
      </nav>

      {/* ── Logout ── */}
      <div style={{padding:"10px 8px",borderTop:`1px solid ${th.border}`}}>
        <button onClick={onLogout}
          style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:10,border:"none",cursor:"pointer",background:"transparent",color:th.textDim,fontSize:13,fontWeight:500,fontFamily:"'Segoe UI',sans-serif",textAlign:"left"}}
          onMouseEnter={e=>{e.currentTarget.style.background="rgba(239,68,68,0.1)";e.currentTarget.style.color="#f87171"}}
          onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color=th.textDim}}>
          <Icon path={ICONS.logout} size={16}/>{t.logout}
        </button>
      </div>
    </aside>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TOPBAR
// ═══════════════════════════════════════════════════════════════════════════
function Topbar({ active, user, isMobile }) {
  const th = useTheme();
  const {t, toggle: toggleLang, lang, isUrdu} = useLang();
  const titles = {
    dashboard:t.dashboard, inventory:t.inventory,
    purchase:t.purchaseManagement, sales:t.salesManagement,
    products:t.products, staff:t.staffManagement,
    billing:t.billing, accounts:t.accountsManagement,
    profile:isUrdu?"میری پروفائل":"My Profile & Settings",
    "shop-profile":isUrdu?"دکان پروفائل":"Shop Profile",
    loaders:"Loaders",
  };

  return (
    <header dir={isUrdu?"rtl":"ltr"} style={{height:56,display:"flex",alignItems:"center",padding:`0 ${isMobile?14:24}px`,borderBottom:`1px solid ${th.border}`,background:th.header,backdropFilter:"blur(10px)",boxShadow:th.dark?"none":"0 1px 0 rgba(15,23,42,0.08), 0 2px 8px rgba(15,23,42,0.04)",flexShrink:0,gap:10}}>

      {/* Mobile: show compact brand logo */}
      {isMobile && (
        <div style={{display:"flex",alignItems:"center",gap:7,marginRight:4,flexShrink:0}}>
          <OkiieeLogoMark size={22} animated/>
          <span style={{fontFamily:"'Inter','Segoe UI',sans-serif",fontWeight:800,fontSize:12,letterSpacing:"-0.02em",color:"white"}}>
            Oki<span style={{color:"#7c6ef7"}}>iee</span>
          </span>
          <span style={{color:"rgba(255,255,255,0.15)",fontSize:11}}>×</span>
          <span style={{color:"white",fontWeight:900,fontSize:11,letterSpacing:"0.16em",fontFamily:"monospace"}}>
            STEEL<span style={{color:"#1abc9c"}}>POS</span>
          </span>
        </div>
      )}

      {/* Page title */}
      <div style={{flex:1,minWidth:0}}>
        <h1 style={{color:th.text,fontWeight:800,fontSize:isMobile?15:19,margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{titles[active]}</h1>
        {!isMobile && <p style={{color:th.textDim,fontSize:11,margin:0}}>{new Date().toLocaleDateString("en-PK",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}</p>}
      </div>

      {/* Lang toggle */}
      <button onClick={toggleLang} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 12px",borderRadius:10,border:`1px solid ${th.border}`,cursor:"pointer",background:th.bgCard,color:th.text,fontSize:12,fontWeight:700,fontFamily:"'Segoe UI',sans-serif",flexShrink:0}}>
        {lang==="ur" ? "EN" : "اردو"}
      </button>

      {/* Theme toggle */}
      <button onClick={th.toggle} style={{width:36,height:36,borderRadius:10,border:`1px solid ${th.border}`,cursor:"pointer",background:th.bgCard,color:th.textMuted,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
        <Icon path={th.dark?ICONS.sun:ICONS.moon} size={16}/>
      </button>

      {/* User avatar */}
      <div style={{width:30,height:30,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontSize:11,fontWeight:700,background:"linear-gradient(135deg,#e74c3c,#c0392b)",flexShrink:0}}>
        {user.name?.[0]||"U"}
      </div>
    </header>
  );
}

export { BottomNav, MoreMenu, Sidebar, Topbar };