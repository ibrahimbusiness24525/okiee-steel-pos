import { useState } from "react";
import { useTheme } from "../context/ThemeContext";
import { useLang } from "../context/LangContext";
import { useResponsive, Icon, ICONS, Modal, FInput, SaveBtn } from "../components/shared";
import { api } from "../utils/api";

function AdminProfilePage({ user }) {
  const th = useTheme();
  const { isUrdu } = useLang();
  const [form, setForm]   = useState({ email: user.email||"", password:"", confirmPassword:"" });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg]     = useState(null); // {type:"success"|"error", text:""}
  const [showPass, setShowPass]    = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const inpS = {
    background:"rgba(255,255,255,0.06)", border:`1px solid ${th.border}`,
    color:th.text, borderRadius:12, padding:"11px 14px", fontSize:14,
    outline:"none", width:"100%", boxSizing:"border-box", fontFamily:"'Segoe UI',sans-serif"
  };

  const save = async () => {
    setMsg(null);
    const emailVal = form.email.trim().toLowerCase();
    if (!emailVal) { setMsg({type:"error", text: isUrdu?"ای میل ضروری ہے":"Email is required"}); return; }
    if (form.password && form.password !== form.confirmPassword) {
      setMsg({type:"error", text: isUrdu?"پاس ورڈ میل نہیں کھاتے":"Passwords do not match"}); return;
    }
    setSaving(true);
    try {
      const payload = { email: emailVal };
      if (form.password.trim()) payload.password = form.password.trim();
      const res = await api.updateCredentials(payload);
      if (res.success) {
        setMsg({type:"success", text: isUrdu?"کامیابی سے محفوظ ہو گیا ✓":"Saved successfully ✓"});
        setForm(p => ({...p, password:"", confirmPassword:""}));
      } else {
        setMsg({type:"error", text: res.message || (isUrdu?"خرابی آ گئی":"Error saving")});
      }
    } catch(e) {
      setMsg({type:"error", text: isUrdu?"سرور سے رابطہ نہ ہو سکا":"Could not connect to server"});
    }
    setSaving(false);
  };

  return (
    <div dir="ltr" style={{maxWidth:500, margin:"0 auto"}}>
      <div style={{borderRadius:20, border:`1px solid ${th.border}`, background:th.bgCard, overflow:"hidden"}}>
        <div style={{padding:"20px 24px", borderBottom:`1px solid ${th.border}`, background:"linear-gradient(135deg,rgba(41,128,185,0.12),rgba(26,188,156,0.08))"}}>
          <div style={{display:"flex", alignItems:"center", gap:14}}>
            <div style={{width:52, height:52, borderRadius:"50%", background:"linear-gradient(135deg,#2980b9,#1abc9c)", display:"flex", alignItems:"center", justifyContent:"center", color:"white", fontWeight:900, fontSize:22, flexShrink:0}}>
              {(user.name||user.email||"A")[0].toUpperCase()}
            </div>
            <div>
              <div style={{color:th.text, fontWeight:700, fontSize:17}}>{user.name||"Admin"}</div>
              <div style={{color:"#1abc9c", fontSize:13, marginTop:2}}>👤 {isUrdu?"منتظم":"Administrator"}</div>
            </div>
          </div>
        </div>
        <div style={{padding:"24px", display:"flex", flexDirection:"column", gap:18}}>
          <div>
            <label style={{color:th.textMuted, fontSize:11, textTransform:"uppercase", letterSpacing:"0.08em", display:"block", marginBottom:6}}>
              {isUrdu?"ای میل ایڈریس":"Email Address"} *
            </label>
            <input type="email" value={form.email}
              onChange={e=>setForm(p=>({...p,email:e.target.value}))}
              style={inpS}
              onFocus={e=>e.target.style.borderColor="#2980b9"}
              onBlur={e=>e.target.style.borderColor=th.border}
            />
          </div>
          <div style={{borderTop:`1px solid ${th.border}`, paddingTop:18}}>
            <div style={{color:th.textMuted, fontSize:12, marginBottom:14, display:"flex", alignItems:"center", gap:6}}>
              🔒 {isUrdu?"پاس ورڈ تبدیل کریں (خالی چھوڑیں تو نہیں بدلے گا)":"Change Password (leave blank to keep current)"}
            </div>
            <div style={{display:"flex", flexDirection:"column", gap:14}}>
              <div>
                <label style={{color:th.textMuted, fontSize:11, textTransform:"uppercase", letterSpacing:"0.08em", display:"block", marginBottom:6}}>
                  {isUrdu?"نیا پاس ورڈ":"New Password"}
                </label>
                <div style={{position:"relative"}}>
                  <input type={showPass?"text":"password"} value={form.password}
                    onChange={e=>setForm(p=>({...p,password:e.target.value}))}
                    placeholder={isUrdu?"خالی چھوڑیں تو پرانا رہے گا":"Leave blank to keep current"}
                    style={{...inpS, paddingRight:44}}
                    onFocus={e=>e.target.style.borderColor="#2980b9"}
                    onBlur={e=>e.target.style.borderColor=th.border}
                  />
                  <button type="button" onClick={()=>setShowPass(p=>!p)}
                    style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:th.textMuted}}>
                    <Icon path={ICONS.eye} size={16}/>
                  </button>
                </div>
              </div>
              <div>
                <label style={{color:th.textMuted, fontSize:11, textTransform:"uppercase", letterSpacing:"0.08em", display:"block", marginBottom:6}}>
                  {isUrdu?"پاس ورڈ دوبارہ لکھیں":"Confirm New Password"}
                </label>
                <div style={{position:"relative"}}>
                  <input type={showConfirm?"text":"password"} value={form.confirmPassword}
                    onChange={e=>setForm(p=>({...p,confirmPassword:e.target.value}))}
                    placeholder={isUrdu?"دوبارہ لکھیں":"Re-enter new password"}
                    style={{...inpS, paddingRight:44}}
                    onFocus={e=>e.target.style.borderColor="#2980b9"}
                    onBlur={e=>e.target.style.borderColor=th.border}
                  />
                  <button type="button" onClick={()=>setShowConfirm(p=>!p)}
                    style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:th.textMuted}}>
                    <Icon path={ICONS.eye} size={16}/>
                  </button>
                </div>
              </div>
            </div>
          </div>
          {msg && (
            <div style={{padding:"11px 14px", borderRadius:12, fontSize:13, fontWeight:600,
              background: msg.type==="success"?"rgba(26,188,156,0.12)":"rgba(239,68,68,0.1)",
              border: `1px solid ${msg.type==="success"?"rgba(26,188,156,0.3)":"rgba(239,68,68,0.25)"}`,
              color: msg.type==="success"?"#1abc9c":"#f87171"}}>
              {msg.text}
            </div>
          )}
          <button onClick={save} disabled={saving}
            style={{padding:"13px", borderRadius:12, border:"none", cursor:saving?"not-allowed":"pointer",
              background:saving?"rgba(41,128,185,0.4)":"linear-gradient(135deg,#2980b9,#1abc9c)",
              color:"white", fontWeight:700, fontSize:15, marginTop:4}}>
            {saving ? (isUrdu?"محفوظ ہو رہا ہے...":"Saving...") : (isUrdu?"تبدیلیاں محفوظ کریں":"Save Changes")}
          </button>
        </div>
      </div>
    </div>
  );
}


export default AdminProfilePage;
