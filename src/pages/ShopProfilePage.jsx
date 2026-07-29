import { useState, useRef } from "react";
import { useTheme } from "../context/ThemeContext";
import { useLang } from "../context/LangContext";
import { useResponsive, Icon, ICONS, Modal, FInput, SaveBtn } from "../components/shared";
import { api } from "../utils/api";
import { formatPKR, loadShopProfile, saveShopProfile, defaultShopProfile, SHOP_PROFILE_KEY } from "../utils/helpers";

function ShopProfilePage() {
  const th = useTheme();
  const { isUrdu } = useLang();
  const [profile, setProfile] = useState(() => loadShopProfile());
  const [saved, setSaved]     = useState(false);
  const [urduLoading, setUrduLoading] = useState({});

  const inpS = {
    background:"rgba(255,255,255,0.06)", border:`1px solid ${th.border}`,
    color:th.text, borderRadius:12, padding:"11px 14px", fontSize:14,
    outline:"none", width:"100%", boxSizing:"border-box", fontFamily:"'Segoe UI',sans-serif"
  };

  // Auto-generate Urdu script via backend transliteration
  const generateUrdu = async (englishText, field) => {
    if (!englishText.trim()) return;
    setUrduLoading(p => ({...p, [field]: true}));
    try {
      const data = await api.translateUrdu(englishText);
      const urduText = data.urdu || "";
      if (urduText) {
        if (field.startsWith("owner_")) {
          const idx = parseInt(field.split("_")[1]);
          setProfile(p => {
            const owners = [...p.owners];
            owners[idx] = {...owners[idx], nameUr: urduText};
            return {...p, owners};
          });
        } else {
          setProfile(p => ({...p, [field]: urduText}));
        }
      } else {
        console.warn("Urdu translation returned empty result:", data);
      }
    } catch(e) {
      console.error("Urdu translation failed:", e);
    }
    setUrduLoading(p => ({...p, [field]: false}));
  };

  const handleLogo = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setProfile(p => ({...p, logoBase64: ev.target.result}));
    reader.readAsDataURL(file);
  };

  const setOwner = (idx, field, val) => {
    setProfile(p => {
      const owners = [...p.owners];
      owners[idx] = {...owners[idx], [field]: val};
      return {...p, owners};
    });
  };

  const handleSave = () => {
    saveShopProfile(profile);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div style={{maxWidth:600, margin:"0 auto", display:"flex", flexDirection:"column", gap:20}}>

      {/* Logo & Shop Name Card */}
      <div style={{borderRadius:20, border:`1px solid ${th.border}`, background:th.bgCard, overflow:"hidden"}}>
        <div style={{padding:"16px 24px", borderBottom:`1px solid ${th.border}`, background:"linear-gradient(135deg,rgba(26,188,156,0.1),rgba(41,128,185,0.06))"}}>
          <div style={{color:th.text, fontWeight:700, fontSize:16}}>🏪 {isUrdu?"دکان کی معلومات":"Shop Information"}</div>
          <div style={{color:th.textMuted, fontSize:12, marginTop:2}}>{isUrdu?"یہ معلومات invoice پر ظاہر ہوگی":"This info appears on every invoice"}</div>
        </div>
        <div style={{padding:"24px", display:"flex", flexDirection:"column", gap:18}}>

          {/* Logo Upload */}
          <div>
            <label style={{color:th.textMuted, fontSize:11, textTransform:"uppercase", letterSpacing:"0.08em", display:"block", marginBottom:8}}>
              {isUrdu?"دکان کا لوگو":"Shop Logo"}
            </label>
            <div style={{display:"flex", alignItems:"center", gap:16}}>
              <div style={{width:80, height:80, borderRadius:16, border:`2px dashed ${th.border}`, background:th.bg, display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden", flexShrink:0}}>
                {profile.logoBase64
                  ? <img src={profile.logoBase64} alt="logo" style={{width:"100%",height:"100%",objectFit:"contain"}}/>
                  : <span style={{fontSize:28}}>🏪</span>
                }
              </div>
              <div style={{flex:1}}>
                <label style={{display:"inline-block", padding:"9px 18px", borderRadius:10, border:`1px solid ${th.border}`, background:th.bgCard, color:th.text, fontSize:13, fontWeight:600, cursor:"pointer"}}>
                  📷 {isUrdu?"لوگو منتخب کریں":"Choose Logo"}
                  <input type="file" accept="image/*" onChange={handleLogo} style={{display:"none"}}/>
                </label>
                {profile.logoBase64 && (
                  <button onClick={()=>setProfile(p=>({...p,logoBase64:""}))}
                    style={{marginLeft:10, padding:"9px 14px", borderRadius:10, border:"1px solid rgba(239,68,68,0.3)", background:"rgba(239,68,68,0.08)", color:"#f87171", fontSize:13, cursor:"pointer"}}>
                    ✕ {isUrdu?"ہٹائیں":"Remove"}
                  </button>
                )}
                <div style={{color:th.textMuted, fontSize:11, marginTop:6}}>{isUrdu?"PNG یا JPG، بہترین سائز 200×100px":"PNG or JPG, best size 200×100px"}</div>
              </div>
            </div>
          </div>

          {/* Shop Name English */}
          <div>
            <label style={{color:th.textMuted, fontSize:11, textTransform:"uppercase", letterSpacing:"0.08em", display:"block", marginBottom:6}}>
              {isUrdu?"دکان کا نام (انگریزی)":"Shop Name (English)"} *
            </label>
            <input type="text" value={profile.shopName}
              onChange={e=>setProfile(p=>({...p,shopName:e.target.value}))}
              placeholder="e.g. AL KHAIR TRADER" style={inpS}
              onFocus={e=>e.target.style.borderColor="#1abc9c"}
              onBlur={e=>e.target.style.borderColor=th.border}
            />
          </div>

          {/* Shop Name Urdu */}
          <div>
            <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6}}>
              <label style={{color:th.textMuted, fontSize:11, textTransform:"uppercase", letterSpacing:"0.08em"}}>
                {isUrdu?"دکان کا نام (اردو)":"Shop Name (Urdu)"}
              </label>
              <button type="button" disabled={urduLoading.shopNameUr||!profile.shopName} onClick={()=>generateUrdu(profile.shopName,"shopNameUr")}
                style={{fontSize:11, padding:"3px 10px", borderRadius:8, border:"1px solid rgba(26,188,156,0.4)", background:"rgba(26,188,156,0.08)", color:"#1abc9c", cursor:(urduLoading.shopNameUr||!profile.shopName)?"not-allowed":"pointer", opacity:(urduLoading.shopNameUr||!profile.shopName)?0.5:1}}>
                {urduLoading.shopNameUr?"...":"✨ Auto Urdu"}
              </button>
            </div>
            <input type="text" value={profile.shopNameUr}
              onChange={e=>setProfile(p=>({...p,shopNameUr:e.target.value}))}
              placeholder={isUrdu?"انگریزی نام لکھ کر Auto Urdu دبائیں":"Type English name then click Auto Urdu"} dir="rtl" style={{...inpS, fontFamily:"'Noto Nastaliq Urdu',sans-serif"}}
              onFocus={e=>e.target.style.borderColor="#1abc9c"}
              onBlur={e=>e.target.style.borderColor=th.border}
            />
          </div>
        </div>
      </div>

      {/* Owners Card */}
      <div style={{borderRadius:20, border:`1px solid ${th.border}`, background:th.bgCard, overflow:"hidden"}}>
        <div style={{padding:"16px 24px", borderBottom:`1px solid ${th.border}`, background:"linear-gradient(135deg,rgba(41,128,185,0.1),rgba(26,188,156,0.06))"}}>
          <div style={{display:"flex", alignItems:"center", justifyContent:"space-between"}}>
            <div>
              <div style={{color:th.text, fontWeight:700, fontSize:16}}>👥 {isUrdu?"مالکان کی معلومات":"Owners / Contacts"}</div>
              <div style={{color:th.textMuted, fontSize:12, marginTop:2}}>{isUrdu?"کم از کم 1، زیادہ سے زیادہ 3 — فون نمبر invoice پر ظاہر ہوں گے":"Min 1, Max 3 — phone numbers appear on invoice"}</div>
            </div>
            {profile.owners.length < 3 && (
              <button type="button" onClick={()=>setProfile(p=>({...p, owners:[...p.owners,{name:"",nameUr:"",phone:""}]}))}
                style={{padding:"7px 14px", borderRadius:10, border:"1px solid rgba(26,188,156,0.4)", background:"rgba(26,188,156,0.08)", color:"#1abc9c", fontSize:13, fontWeight:600, cursor:"pointer", whiteSpace:"nowrap"}}>
                + {isUrdu?"مزید شامل کریں":"Add Person"}
              </button>
            )}
          </div>
        </div>
        <div style={{padding:"24px", display:"flex", flexDirection:"column", gap:18}}>
          {profile.owners.map((owner, idx) => (
            <div key={idx} style={{borderRadius:14, border:`1px solid ${th.border}`, padding:"16px", background:th.bg}}>
              <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12}}>
                <div style={{color:th.textMuted, fontSize:12, fontWeight:700}}>
                  {isUrdu?`شخص ${idx+1}`:`Person ${idx+1}`} {idx===0&&<span style={{color:"#f39c12",fontSize:11}}>({isUrdu?"ضروری":"Required"})</span>}
                </div>
                {idx > 0 && (
                  <button type="button" onClick={()=>setProfile(p=>({...p, owners:p.owners.filter((_,i)=>i!==idx)}))}
                    style={{padding:"3px 10px", borderRadius:8, border:"1px solid rgba(239,68,68,0.3)", background:"rgba(239,68,68,0.08)", color:"#f87171", fontSize:12, cursor:"pointer"}}>
                    ✕ {isUrdu?"ہٹائیں":"Remove"}
                  </button>
                )}
              </div>
              <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12}}>
                <div>
                  <label style={{color:th.textMuted, fontSize:10, textTransform:"uppercase", letterSpacing:"0.08em", display:"block", marginBottom:5}}>
                    {isUrdu?"نام (انگریزی)":"Name (English)"}
                  </label>
                  <input type="text" value={owner.name||""}
                    onChange={e=>setOwner(idx,"name",e.target.value)}
                    placeholder={`Owner ${idx+1}`} style={inpS}
                    onFocus={e=>e.target.style.borderColor="#1abc9c"}
                    onBlur={e=>e.target.style.borderColor=th.border}
                  />
                </div>
                <div>
                  <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:5}}>
                    <label style={{color:th.textMuted, fontSize:10, textTransform:"uppercase", letterSpacing:"0.08em"}}>
                      {isUrdu?"نام (اردو)":"Name (Urdu)"}
                    </label>
                    <button type="button" disabled={urduLoading[`owner_${idx}`]||!owner.name} onClick={()=>generateUrdu(owner.name||"",`owner_${idx}`)}
                      style={{fontSize:10, padding:"2px 8px", borderRadius:7, border:"1px solid rgba(26,188,156,0.4)", background:"rgba(26,188,156,0.08)", color:"#1abc9c", cursor:(urduLoading[`owner_${idx}`]||!owner.name)?"not-allowed":"pointer", opacity:(urduLoading[`owner_${idx}`]||!owner.name)?0.5:1}}>
                      {urduLoading[`owner_${idx}`]?"...":"✨ Auto"}
                    </button>
                  </div>
                  <input type="text" value={owner.nameUr||""}
                    onChange={e=>setOwner(idx,"nameUr",e.target.value)}
                    placeholder={isUrdu?"انگریزی نام لکھ کر Auto دبائیں":"Type name then click Auto"} dir="rtl" style={{...inpS, fontFamily:"'Noto Nastaliq Urdu',sans-serif"}}
                    onFocus={e=>e.target.style.borderColor="#1abc9c"}
                    onBlur={e=>e.target.style.borderColor=th.border}
                  />
                </div>
                <div style={{gridColumn:"1/-1"}}>
                  <label style={{color:th.textMuted, fontSize:10, textTransform:"uppercase", letterSpacing:"0.08em", display:"block", marginBottom:5}}>
                    📞 {isUrdu?"فون نمبر":"Phone Number"}
                  </label>
                  <input type="tel" value={owner.phone||""}
                    onChange={e=>setOwner(idx,"phone",e.target.value)}
                    placeholder="03xx-xxxxxxx" style={inpS}
                    onFocus={e=>e.target.style.borderColor="#1abc9c"}
                    onBlur={e=>e.target.style.borderColor=th.border}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Address Card */}
      <div style={{borderRadius:20, border:`1px solid ${th.border}`, background:th.bgCard, overflow:"hidden"}}>
        <div style={{padding:"16px 24px", borderBottom:`1px solid ${th.border}`, background:"linear-gradient(135deg,rgba(26,188,156,0.08),rgba(41,128,185,0.05))"}}>
          <div style={{color:th.text, fontWeight:700, fontSize:16}}>📍 {isUrdu?"دکان کا پتہ":"Shop Address"}</div>
        </div>
        <div style={{padding:"24px", display:"flex", flexDirection:"column", gap:14}}>
          <div>
            <label style={{color:th.textMuted, fontSize:11, textTransform:"uppercase", letterSpacing:"0.08em", display:"block", marginBottom:6}}>
              {isUrdu?"پتہ (انگریزی)":"Address (English)"} *
            </label>
            <input type="text" value={profile.address}
              onChange={e=>setProfile(p=>({...p,address:e.target.value}))}
              placeholder="e.g. Nandla Chowk, Near Narkotax Office, Multan" style={inpS}
              onFocus={e=>e.target.style.borderColor="#1abc9c"}
              onBlur={e=>e.target.style.borderColor=th.border}
            />
          </div>
          <div>
            <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6}}>
              <label style={{color:th.textMuted, fontSize:11, textTransform:"uppercase", letterSpacing:"0.08em"}}>
                {isUrdu?"پتہ (اردو)":"Address (Urdu)"}
              </label>
              <button type="button" disabled={urduLoading.addressUr||!profile.address} onClick={()=>generateUrdu(profile.address,"addressUr")}
                style={{fontSize:11, padding:"3px 10px", borderRadius:8, border:"1px solid rgba(26,188,156,0.4)", background:"rgba(26,188,156,0.08)", color:"#1abc9c", cursor:(urduLoading.addressUr||!profile.address)?"not-allowed":"pointer", opacity:(urduLoading.addressUr||!profile.address)?0.5:1}}>
                {urduLoading.addressUr?"...":"✨ Auto Urdu"}
              </button>
            </div>
            <input type="text" value={profile.addressUr}
              onChange={e=>setProfile(p=>({...p,addressUr:e.target.value}))}
              placeholder={isUrdu?"انگریزی پتہ لکھ کر Auto Urdu دبائیں":"Type English address then click Auto Urdu"} dir="rtl" style={{...inpS, fontFamily:"'Noto Nastaliq Urdu',sans-serif"}}
              onFocus={e=>e.target.style.borderColor="#1abc9c"}
              onBlur={e=>e.target.style.borderColor=th.border}
            />
          </div>
        </div>
      </div>

      {/* Invoice Preview */}
      <div style={{borderRadius:20, border:`1px solid rgba(26,188,156,0.25)`, background:"rgba(26,188,156,0.04)", padding:"20px 24px"}}>
        <div style={{color:"#1abc9c", fontWeight:700, fontSize:14, marginBottom:14}}>👁 {isUrdu?"Invoice Preview":"Invoice Preview"}</div>
        <div style={{background:"#fff", borderRadius:12, padding:"14px 18px", fontFamily:"'Courier New',monospace", fontSize:13, color:"#000", textAlign:"center"}}>
          {profile.logoBase64 && <div style={{marginBottom:6}}><img src={profile.logoBase64} alt="logo" style={{maxWidth:70,maxHeight:50,objectFit:"contain"}}/></div>}
          <div style={{fontWeight:900, fontSize:16}}>{profile.shopName||"SHOP NAME"}</div>
          {profile.owners.filter(o=>o.name||o.phone).map((o,i)=>(
            <div key={i} style={{fontSize:12, marginTop:3}}>{o.name||o.nameUr}: {o.phone}</div>
          ))}
          <div style={{fontSize:11, marginTop:4}}>{profile.address||"Shop Address"}</div>
        </div>
      </div>

      {saved && (
        <div style={{padding:"12px 16px", borderRadius:12, background:"rgba(26,188,156,0.12)", border:"1px solid rgba(26,188,156,0.3)", color:"#1abc9c", fontWeight:600, fontSize:14, textAlign:"center"}}>
          ✅ {isUrdu?"پروفائل محفوظ ہو گئی! Invoice پر ظاہر ہوگی۔":"Profile saved! Will appear on invoices."}
        </div>
      )}

      <button onClick={handleSave}
        style={{padding:"14px", borderRadius:14, border:"none", cursor:"pointer",
          background:"linear-gradient(135deg,#1abc9c,#2980b9)",
          color:"white", fontWeight:700, fontSize:15, boxShadow:"0 4px 15px rgba(26,188,156,0.3)"}}>
        💾 {isUrdu?"پروفائل محفوظ کریں":"Save Shop Profile"}
      </button>
    </div>
  );
}


export default ShopProfilePage;