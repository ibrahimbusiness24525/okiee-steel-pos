import { useState, useEffect } from "react";
import { useTheme } from "../context/ThemeContext";
import { useLang } from "../context/LangContext";
import { useResponsive, Icon, ICONS, Modal, FInput, SaveBtn, StatCard, Table } from "../components/shared";
import { api } from "../utils/api";
import { formatPKR, todayStr } from "../utils/helpers";

function LoadersPage({ loaders, loadLoaders }) {
  const th = useTheme();
  const { isUrdu } = useLang();
  const { isMobile } = useResponsive();

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing]     = useState(null);
  const [saving, setSaving]       = useState(false);
  const [deleting, setDeleting]   = useState(null);
  const [form, setForm]           = useState({ name:"", phone:"", details:"", defaultFee:"" });
  // Daily view
  const [dailyDate, setDailyDate] = useState(todayStr());
  const [dailyData, setDailyData] = useState(null);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [tab, setTab]             = useState("loaders"); // "loaders" | "daily"

  const inpS = { background:th.input, border:`1px solid ${th.inputBorder}`, color:th.text, borderRadius:10, padding:"11px 14px", fontSize:14, outline:"none", width:"100%", boxSizing:"border-box", fontFamily:"'Segoe UI',sans-serif" };

  const openAdd  = () => { setEditing(null); setForm({ name:"", phone:"", details:"", defaultFee:"" }); setShowModal(true); };
  const openEdit = (l) => { setEditing(l); setForm({ name:l.name, phone:l.phone||"", details:l.details||"", defaultFee:String(l.defaultFee||"") }); setShowModal(true); };

  const save = async () => {
    if (!form.name.trim()) return alert(isUrdu ? "نام ضروری ہے" : "Name required");
    setSaving(true);
    try {
      const payload = { name:form.name.trim(), phone:form.phone.trim(), details:form.details.trim(), defaultFee:Number(form.defaultFee)||0 };
      const res = editing ? await api.updateLoader(editing._id, payload) : await api.addLoader(payload);
      if (res.success) { await loadLoaders(); setShowModal(false); }
      else alert(res.message || "Error");
    } catch(e) { alert("Server error"); }
    setSaving(false);
  };

  const remove = async (id) => {
    if (!window.confirm(isUrdu ? "یقین ہے؟" : "Delete this loader?")) return;
    setDeleting(id);
    try { const res = await api.deleteLoader(id); if (res.success) await loadLoaders(); }
    catch(e) {}
    setDeleting(null);
  };

  const loadDaily = async () => {
    setDailyLoading(true);
    try { const r = await api.getDailyLoaders(dailyDate); if (r.success) setDailyData(r); }
    catch(e) {}
    setDailyLoading(false);
  };

  useEffect(() => { if (tab === "daily") loadDaily(); }, [tab, dailyDate]);

  const grandDailyFee = (dailyData?.loaders||[]).reduce((s,l)=>s+l.totalFee,0);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      {/* Tabs */}
      <div style={{ display:"flex", gap:8 }}>
        {[["loaders", isUrdu?"Loaders":"Loaders"], ["daily", isUrdu?"روزانہ رپورٹ":"Daily Report"]].map(([key,label])=>(
          <button key={key} onClick={()=>setTab(key)}
            style={{ padding:"8px 18px", borderRadius:10, border:`1px solid ${tab===key?"#1abc9c":th.border}`, background:tab===key?"rgba(26,188,156,0.15)":"transparent", color:tab===key?"#1abc9c":th.textMuted, fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"'Segoe UI',sans-serif" }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── LOADERS TAB ── */}
      {tab==="loaders" && (
        <>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div>
              <h3 style={{ color:th.text, fontWeight:700, margin:0, fontSize:17 }}>{isUrdu?"تمام Loaders":"All Loaders"}</h3>
              <p style={{ color:th.textMuted, fontSize:12, margin:"2px 0 0" }}>{loaders.length} {isUrdu?"کل":"total"}</p>
            </div>
            <button onClick={openAdd}
              style={{ display:"flex", alignItems:"center", gap:6, padding:"10px 18px", borderRadius:12, border:"none", cursor:"pointer", background:"linear-gradient(135deg,#1abc9c,#2980b9)", color:"white", fontWeight:700, fontSize:13 }}>
              <Icon path={ICONS.plus} size={15}/> {isUrdu?"نیا Loader":"Add Loader"}
            </button>
          </div>

          {loaders.length === 0 ? (
            <div style={{ textAlign:"center", padding:40, color:th.textMuted, fontSize:14 }}>
              {isUrdu?"کوئی Loader موجود نہیں":"No loaders yet — add one above"}
            </div>
          ) : (
            <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr":"repeat(auto-fill,minmax(280px,1fr))", gap:12 }}>
              {loaders.map(l=>(
                <div key={l._id} style={{ borderRadius:14, border:`1px solid ${th.border}`, background:th.bgCard, padding:16, display:"flex", flexDirection:"column", gap:10 }}>
                  <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                      <div style={{ width:40, height:40, borderRadius:10, background:"linear-gradient(135deg,#a78bfa,#7c3aed)", display:"flex", alignItems:"center", justifyContent:"center", color:"white", fontWeight:800, fontSize:16 }}>
                        {l.name[0].toUpperCase()}
                      </div>
                      <div>
                        <div style={{ color:th.text, fontWeight:700, fontSize:14 }}>{l.name}</div>
                        {l.phone && <div style={{ color:th.textMuted, fontSize:12 }}>📞 {l.phone}</div>}
                      </div>
                    </div>
                    <div style={{ display:"flex", gap:6 }}>
                      <button onClick={()=>openEdit(l)}
                        style={{ padding:"5px 10px", borderRadius:8, border:"none", cursor:"pointer", background:"rgba(96,165,250,0.12)", color:"#60a5fa", fontSize:12, fontWeight:600 }}>
                        ✏️
                      </button>
                      <button onClick={()=>remove(l._id)} disabled={deleting===l._id}
                        style={{ padding:"5px 10px", borderRadius:8, border:"none", cursor:"pointer", background:"rgba(248,113,113,0.12)", color:"#f87171", fontSize:12, fontWeight:600 }}>
                        {deleting===l._id?"...":"🗑️"}
                      </button>
                    </div>
                  </div>
                  {l.details && <div style={{ color:th.textMuted, fontSize:12, lineHeight:1.4 }}>{l.details}</div>}
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", background:"rgba(167,139,250,0.08)", borderRadius:8, padding:"8px 12px" }}>
                    <span style={{ color:th.textMuted, fontSize:12 }}>{isUrdu?"ڈیفالٹ فیس":"Default Fee"}</span>
                    <span style={{ color:"#a78bfa", fontWeight:800, fontSize:15 }}>{formatPKR(l.defaultFee||0)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── DAILY REPORT TAB ── */}
      {tab==="daily" && (
        <>
          <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
            <input type="date" value={dailyDate} onChange={e=>setDailyDate(e.target.value)}
              style={{ ...inpS, width:"auto", cursor:"pointer" }}/>
            <button onClick={loadDaily} disabled={dailyLoading}
              style={{ padding:"10px 16px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#1abc9c,#2980b9)", color:"white", fontWeight:700, fontSize:13, cursor:"pointer" }}>
              {dailyLoading?"...":isUrdu?"تازہ کریں":"Refresh"}
            </button>
          </div>

          {dailyData && (
            <>
              {/* Summary card */}
              <div style={{ borderRadius:14, border:`1px solid rgba(26,188,156,0.3)`, background:"rgba(26,188,156,0.06)", padding:16, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div>
                  <div style={{ color:th.textMuted, fontSize:12 }}>{isUrdu?"کل Loaders فیس":"Total Loaders Fee"} — {dailyDate}</div>
                  <div style={{ color:"#1abc9c", fontWeight:900, fontSize:22 }}>{formatPKR(grandDailyFee)}</div>
                </div>
                <div style={{ color:th.textMuted, fontSize:13 }}>{(dailyData.loaders||[]).length} loaders</div>
              </div>

              {(dailyData.loaders||[]).length === 0 ? (
                <div style={{ textAlign:"center", padding:30, color:th.textMuted, fontSize:14 }}>
                  {isUrdu?"اس دن کوئی Loader نہیں":"No loader activity on this date"}
                </div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {(dailyData.loaders||[]).map((l,i)=>(
                    <div key={i} style={{ borderRadius:14, border:`1px solid ${th.border}`, background:th.bgCard, padding:16 }}>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          <div style={{ width:34, height:34, borderRadius:8, background:"linear-gradient(135deg,#a78bfa,#7c3aed)", display:"flex", alignItems:"center", justifyContent:"center", color:"white", fontWeight:800, fontSize:14 }}>
                            {l.loaderName[0].toUpperCase()}
                          </div>
                          <div style={{ color:th.text, fontWeight:700, fontSize:15 }}>{l.loaderName}</div>
                        </div>
                        <div style={{ color:"#a78bfa", fontWeight:900, fontSize:16 }}>{formatPKR(l.totalFee)}</div>
                      </div>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                        {l.invoices.map((inv,j)=>(
                          <span key={j} style={{ fontFamily:"monospace", color:"#34d399", fontSize:11, background:"rgba(52,211,153,0.1)", padding:"2px 8px", borderRadius:6 }}>{inv}</span>
                        ))}
                      </div>
                      <div style={{ marginTop:8, color:th.textMuted, fontSize:12 }}>
                        {l.invoices.length} {isUrdu?"invoice":"invoices"} &nbsp;•&nbsp; {isUrdu?"کل مال":"Total qty"}: {l.totalLoad}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <Modal title={editing ? (isUrdu?"Loader ترمیم کریں":"Edit Loader") : (isUrdu?"نیا Loader":"Add Loader")} onClose={()=>setShowModal(false)}>
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <div>
              <label style={{ color:th.textMuted, fontSize:12, fontWeight:600, display:"block", marginBottom:4 }}>{isUrdu?"نام *":"Name *"}</label>
              <input value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} placeholder={isUrdu?"Loader کا نام":"Loader name"} style={inpS}/>
            </div>
            <div>
              <label style={{ color:th.textMuted, fontSize:12, fontWeight:600, display:"block", marginBottom:4 }}>{isUrdu?"فون نمبر":"Phone"}</label>
              <input value={form.phone} onChange={e=>setForm(p=>({...p,phone:e.target.value}))} placeholder="03xx-xxxxxxx" style={inpS}/>
            </div>
            <div>
              <label style={{ color:th.textMuted, fontSize:12, fontWeight:600, display:"block", marginBottom:4 }}>{isUrdu?"تفصیل":"Details"}</label>
              <input value={form.details} onChange={e=>setForm(p=>({...p,details:e.target.value}))} placeholder={isUrdu?"مزید معلومات...":"Any details..."} style={inpS}/>
            </div>
            <div>
              <label style={{ color:th.textMuted, fontSize:12, fontWeight:600, display:"block", marginBottom:4 }}>{isUrdu?"ڈیفالٹ فیس (Rs)":"Default Fee (Rs)"}</label>
              <input type="text" inputMode="decimal" value={form.defaultFee} onChange={e=>setForm(p=>({...p,defaultFee:e.target.value}))} placeholder="500" style={inpS}/>
            </div>
            <button onClick={save} disabled={saving}
              style={{ padding:"12px", borderRadius:12, border:"none", background:"linear-gradient(135deg,#1abc9c,#2980b9)", color:"white", fontWeight:700, fontSize:14, cursor:"pointer", marginTop:4 }}>
              {saving?"...":(editing?(isUrdu?"محفوظ کریں":"Save Changes"):(isUrdu?"شامل کریں":"Add Loader"))}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}


export default LoadersPage;
