import { useState } from "react";
import { useTheme } from "../context/ThemeContext";
import { useLang } from "../context/LangContext";
import { useResponsive, Icon, ICONS, Modal, FInput, SaveBtn } from "../components/shared";
import { api } from "../utils/api";

function StaffPage({ staff, loadStaff }) {
  const th=useTheme(); const{t,lang}=useLang(); const{isMobile}=useResponsive();
  const isUrdu = lang === "ur";
  const[showModal,setShowModal]=useState(false);
  const[form,setForm]=useState({name:"",email:"",password:""});
  const[editing,setEditing]=useState(null);
  const[saving,setSaving]=useState(false);
  const[invited,setInvited]=useState(null);
  const[showPass,setShowPass]=useState(false);
  const[error,setError]=useState("");

  const f=(k)=>(v)=>setForm(p=>({...p,[k]:v}));

  const openAdd=()=>{
    setForm({name:"",email:"",password:""});
    setEditing(null);setShowPass(false);setError("");setShowModal(true);
  };
  const openEdit=(d)=>{
    setForm({name:d.name,email:d.email,password:""});
    setEditing(d._id);setShowPass(false);setError("");setShowModal(true);
  };

  const save=async()=>{
    setError("");
    if(!form.name.trim()){setError(isUrdu?"نام ضروری ہے":"Name is required");return;}
    if(!form.email.trim()){setError(isUrdu?"ای میل ضروری ہے":"Email is required");return;}
    if(!editing&&!form.password.trim()){setError(isUrdu?"پاس ورڈ ضروری ہے":"Password is required");return;}

    setSaving(true);
    // ✅ email trim + lowercase — login match ke liye zaroori
    const payload={
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      password: form.password.trim(),
    };
    const res=editing
      ? await api.updateStaff(editing, payload)
      : await api.addStaff(payload);

    if(res.success){
      await loadStaff();
      if(!editing) setInvited(res.staff);
      setShowModal(false);
    } else {
      setError(res.message||(isUrdu?"کچھ غلط ہوا":"Something went wrong"));
    }
    setSaving(false);
  };

  const del=async(d)=>{
    if(!window.confirm(t.deleteStaffConfirm))return;
    const res=await api.deleteStaff(d._id);
    if(res.success) await loadStaff(); else alert(res.message);
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>

      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <p style={{color:th.textMuted,fontSize:13,margin:0}}>{staff.length} {t.staffMembers}</p>
        <button onClick={openAdd} style={{display:"flex",alignItems:"center",gap:6,padding:"9px 14px",borderRadius:12,border:"none",cursor:"pointer",background:"linear-gradient(135deg,#1abc9c,#2980b9)",color:"white",fontWeight:600,fontSize:13}}>
          <Icon path={ICONS.plus} size={14}/>{isMobile?"+":t.addStaff}
        </button>
      </div>

      {/* Success banner */}
      {invited&&(
        <div style={{borderRadius:14,padding:14,border:"1px solid rgba(26,188,156,0.3)",display:"flex",alignItems:"flex-start",gap:10,background:"rgba(26,188,156,0.08)"}}>
          <span style={{color:"#34d399"}}><Icon path={ICONS.mail} size={18}/></span>
          <div style={{flex:1}}>
            <p style={{color:"#34d399",fontWeight:600,fontSize:13,margin:"0 0 3px"}}>{t.staffCreated}</p>
            <p style={{color:th.textMuted,fontSize:12,margin:0}}>
              <strong>{invited.name}</strong> · <span style={{color:"#60a5fa"}}>{invited.email}</span>
            </p>
          </div>
          <button onClick={()=>setInvited(null)} style={{background:"none",border:"none",cursor:"pointer",color:th.textDim,padding:4}}>
            <Icon path={ICONS.close} size={16}/>
          </button>
        </div>
      )}

      {/* Cards */}
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"repeat(auto-fill,minmax(240px,1fr))",gap:14}}>

        {/* Admin card */}
        <div style={{borderRadius:16,padding:18,border:"1px solid rgba(243,156,18,0.2)",background:th.bgCard}}>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
            <div style={{width:44,height:44,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontWeight:900,fontSize:16,background:"linear-gradient(135deg,#f39c12,#e67e22)"}}>A</div>
            <div>
              <p style={{color:th.text,fontWeight:700,margin:0,fontSize:14}}>Steel Admin</p>
              <p style={{color:"#fbbf24",fontSize:12,margin:0}}>steelpos@gmail.com</p>
            </div>
          </div>
          <span style={{display:"inline-block",padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,background:"rgba(243,156,18,0.2)",color:"#fbbf24"}}>👑 {t.administrator}</span>
        </div>

        {/* Staff cards */}
        {staff.map(s=>(
          <div key={s._id} style={{borderRadius:16,padding:18,border:`1px solid ${th.border}`,background:th.bgCard}}>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
              <div style={{width:44,height:44,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontWeight:900,fontSize:16,background:"linear-gradient(135deg,#3498db,#2980b9)"}}>
                {s.name?.[0]?.toUpperCase()}
              </div>
              <div style={{flex:1,overflow:"hidden"}}>
                <p style={{color:th.text,fontWeight:700,margin:0,fontSize:14,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.name}</p>
                <p style={{color:th.textMuted,fontSize:12,margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.email}</p>
              </div>
            </div>
            <span style={{display:"inline-block",padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,marginBottom:10,background:"rgba(52,152,219,0.2)",color:"#60a5fa"}}>👤 {t.staffRole}</span>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>openEdit(s)} style={{flex:1,padding:"7px",borderRadius:10,fontSize:12,color:"#93c5fd",border:"1px solid rgba(59,130,246,0.3)",background:"transparent",cursor:"pointer"}}>{t.edit}</button>
              <button onClick={()=>del(s)} style={{flex:1,padding:"7px",borderRadius:10,fontSize:12,color:"#fca5a5",border:"1px solid rgba(239,68,68,0.3)",background:"transparent",cursor:"pointer"}}>{t.delete}</button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      {showModal&&(
        <Modal title={editing?t.editStaff:t.addStaff} onClose={()=>setShowModal(false)}>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <FInput label={t.fullName} value={form.name} onChange={f("name")} required/>
            <FInput label={t.emailAddress} type="email" value={form.email} onChange={f("email")} required/>

            {/* Password with eye toggle */}
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              <label style={{fontSize:12,color:th.textMuted,textTransform:"uppercase",letterSpacing:"0.08em"}}>
                {t.password}{!editing&&<span style={{color:"#f87171",marginLeft:3}}>*</span>}
              </label>
              <div style={{position:"relative"}}>
                <input
                  type={showPass?"text":"password"}
                  value={form.password}
                  onChange={e=>f("password")(e.target.value)}
                  placeholder={editing
                    ?(isUrdu?"خالی چھوڑیں تو پرانا رہے گا":"Leave empty to keep current")
                    :(isUrdu?"نیا پاس ورڈ بنائیں":"Create password")}
                  style={{
                    width:"100%",padding:"10px 44px 10px 12px",borderRadius:10,
                    border:`1px solid ${th.inputBorder||th.border}`,
                    background:th.input||th.bgCard,
                    color:th.text,fontSize:13,boxSizing:"border-box",outline:"none"
                  }}
                />
                <button
                  type="button"
                  onClick={()=>setShowPass(p=>!p)}
                  style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:th.textMuted,padding:4,display:"flex",alignItems:"center"}}
                >
                  <Icon path={ICONS.eye} size={16}/>
                </button>
              </div>
              {editing&&(
                <p style={{fontSize:11,color:th.textDim,margin:0}}>
                  ⚠ {isUrdu?"خالی چھوڑیں تو پرانا password رہے گا":"Leave empty to keep existing password"}
                </p>
              )}
            </div>

            {/* Error box */}
            {error&&(
              <div style={{padding:"10px 12px",borderRadius:10,background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.25)",color:"#f87171",fontSize:13}}>
                ⚠ {error}
              </div>
            )}

            <SaveBtn label={saving?t.saving:editing?t.updateStaff:t.createStaff} onClick={save} loading={saving}/>
          </div>
        </Modal>
      )}
    </div>
  );
} 


export default StaffPage;
