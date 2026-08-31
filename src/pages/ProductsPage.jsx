import { useState } from "react";
import { useTheme } from "../context/ThemeContext";
import { useLang } from "../context/LangContext";
import { useResponsive, Icon, ICONS, Modal, FInput, SaveBtn, Table } from "../components/shared";
import { api } from "../utils/api";
import { formatPKR } from "../utils/helpers";
import { CHADER_TYPES, NET_TYPES, NET_CHORUS_GAUGES, ROUND_INCHES, SQUARE_INCHES, PIPE_GAUGES, productDisplayName } from "../utils/constants";

// ═══════════════════════════════════════════════════════════════════════════
// PRODUCTS PAGE
// ═══════════════════════════════════════════════════════════════════════════
const EMPTY_FORM = { category:"", name:"", pipeType:"", pipeSubType:"", pipeInch:"", gauge:"", length:"", weight:"", basePrice:"", percentage:"", price:"", purchasePrice:"", subType:"", stock:"", unit:"piece", width:"", barcode:"", location:"", notes:"" };
const EMPTY_HW = { name:"", barcode:"", subType:"", location:"", notes:"", purchasePrice:"", price:"" };

function ProductsPage({ products, loadProducts }) {
  const th = useTheme(); const {t,lang} = useLang(); const { isMobile } = useResponsive();
  const isUrdu = lang === "ur";
  const [showModal,setShowModal]=useState(false); const [form,setForm]=useState(EMPTY_FORM);
  const [editing,setEditing]=useState(null); const [saving,setSaving]=useState(false);
  const [catTab,setCatTab]=useState("all"); const [search,setSearch]=useState("");
  const [showHwModal,setShowHwModal]=useState(false); const [hwForm,setHwForm]=useState(EMPTY_HW); const [hwEditing,setHwEditing]=useState(null); const [hwSaving,setHwSaving]=useState(false);

  const openAdd  = () => { setForm(EMPTY_FORM); setEditing(null); setShowModal(true); };
  const openHwAdd = () => { setHwForm(EMPTY_HW); setHwEditing(null); setShowHwModal(true); };
  const openEdit = (d) => {
    if (d.category === "Hardware") {
      setHwForm({
        name: d.name || "",
        barcode: d.barcode || "",
        subType: d.subType || d.brand || "",
        location: d.location || "",
        notes: d.notes || "",
        purchasePrice: String(d.purchasePrice || ""),
        price: String(d.price || ""),
      });
      setHwEditing(d._id);
      setShowHwModal(true);
      return;
    }
    setForm({ category:d.category||"",name:d.name||"",pipeType:d.pipeType||"",pipeSubType:d.pipeSubType||"",pipeInch:d.pipeInch||"",gauge:d.gauge||"",length:d.length||"",weight:String(d.weight||""),basePrice:String(d.basePrice||""),percentage:String(d.percentage||""),subType:d.subType||"",stock:String(d.stock||""),price:String(d.price||""),purchasePrice:String(d.purchasePrice||""),unit:d.unit||"piece",width:d.width||"",barcode:d.barcode||"",location:d.location||"",notes:d.notes||"" });
    setEditing(d._id); setShowModal(true);
  };
  const saveHardware = async () => {
    if (!hwForm.name.trim()) { alert(isUrdu ? "نام ضروری ہے" : "Name is required"); return; }
    if (!hwForm.barcode.trim()) { alert(isUrdu ? "نمبر ضروری ہے" : "Number is required"); return; }
    setHwSaving(true);
    const payload = {
      name: hwForm.name.trim(),
      category: "Hardware",
      barcode: hwForm.barcode.trim(),
      subType: (hwForm.subType || "").trim(),
      location: (hwForm.location || "").trim(),
      notes: (hwForm.notes || "").trim(),
      purchasePrice: parseFloat(hwForm.purchasePrice) || 0,
      price: parseFloat(hwForm.price) || 0,
      unit: "piece",
      stock: 0,
    };
    const res = hwEditing ? await api.updateProduct(hwEditing, payload) : await api.addProduct(payload);
    if (res.success) { await loadProducts(); setShowHwModal(false); setHwEditing(null); }
    else alert(res.message);
    setHwSaving(false);
  };
  const canSave = () => {
    if(!form.category) return false;
    if(form.category==="Pipe") return !!(form.pipeType&&form.pipeInch&&form.pipeInch!=="__custom__"&&form.gauge&&form.price);
    if(form.category==="Chader") return form.subType==="Custom" ? !!(form.name&&form.name.trim()) : !!(form.subType);
    if(form.category==="Net") { if(!form.subType) return false; if(form.subType==="Chorus") return !!(form.gauge); return !!form.name; }
    if(form.category==="Hardware") return !!(form.name&&form.name.trim()&&form.barcode&&form.barcode.trim());
    if(form.category==="Custom") return !!form.name;
    return false;
  };
  const save = async() => {
    if(!canSave()) return;
    const resolvedName = form.category==="Net"&&form.subType==="Chorus"
      ? (form.name&&form.name.trim() ? form.name.trim() : `Chorus ${form.gauge}`.trim())
      : (form.name||form.subType||form.category);
    setSaving(true);
    let payload={name:resolvedName,category:form.category,stock:Number(form.stock)||0,unit:form.unit||"piece"};
    if(form.category==="Pipe") payload={...payload,price:parseFloat(form.price)||0,pipeType:form.pipeType,pipeSubType:form.pipeSubType,pipeInch:form.pipeInch,gauge:form.gauge,length:form.length,weight:Number(form.weight)||0,basePrice:Number(form.basePrice)||0,percentage:Number(form.percentage)||0,size:form.pipeInch};
    else if(form.category==="Chader") payload={...payload,subType:form.subType,purchasePrice:parseFloat(form.purchasePrice)||0};
    else if(form.category==="Net") payload={...payload,subType:form.subType,gauge:form.gauge||"",width:form.width||"",purchasePrice:parseFloat(form.purchasePrice)||0};
    else if(form.category==="Hardware") payload={...payload,subType:form.subType||"",barcode:form.barcode||"",location:form.location||"",notes:form.notes||"",purchasePrice:parseFloat(form.purchasePrice)||0,price:parseFloat(form.price)||0};
    else if(form.category==="Custom") payload={...payload,purchasePrice:parseFloat(form.purchasePrice)||0};
    const res=editing?await api.updateProduct(editing,payload):await api.addProduct(payload);
    if(res.success){await loadProducts();setShowModal(false);}else alert(res.message);
    setSaving(false);
  };
  const del = async(d) => {
    if(!window.confirm(t.deleteProductConfirm)) return;
    const res=await api.deleteProduct(d._id);
    if(res.success) await loadProducts(); else alert(res.message);
  };

  const ALL_CATS=["Pipe","Chader","Net","Hardware","Custom"];
  const catEmoji={Pipe:"🔩",Chader:"📋",Net:"🕸️",Hardware:"🔧",Custom:"✨"};

  const catDisplayName = (cat) => {
    if (!isUrdu) return cat === "Net" ? t.net : cat;
    const urduNames = { Pipe:"پائپ", Chader:"چادر", Net:"جالی", Hardware:"ہارڈ ویئر", Custom:"کسٹم" };
    return urduNames[cat] || cat;
  };

  const getProductDisplayName = (p) => {
    if (!isUrdu) return productDisplayName(p);
    if (p.category === "Pipe") {
      const typeMap   = { round:"گول", square:"چوکور" };
      const subMap    = { soft:"نرم", hard:"سخت" };
      const parts = [];
      if (p.pipeSubType) parts.push(subMap[p.pipeSubType] || p.pipeSubType);
      if (p.pipeType)    parts.push(typeMap[p.pipeType]   || p.pipeType);
      if (p.pipeInch)    parts.push(p.pipeInch);
      if (p.gauge)       parts.push(p.gauge);
      return parts.length ? parts.join(" ") : p.name;
    }
    if (p.category === "Chader") {
      if (p.subType === "Custom") return p.name || "کسٹم چادر";
      const match = (typeof CHADER_TYPES !== "undefined" ? CHADER_TYPES : []).find(ct => ct.key === p.subType);
      return match ? (match.labelUr || match.label) : (p.name || p.subType || "چادر");
    }
    if (p.category === "Net") {
      const netMap = { Chorus:"کورس", Break:"بریک", Barfii:"برفی" };
      const base   = netMap[p.subType] || p.subType || "جالی";
      return p.gauge ? `${base} ${p.gauge}` : (p.name || base);
    }
    if (p.category === "Hardware") return p.name || "ہارڈ ویئر";
    if (p.category === "Custom")   return p.name || "کسٹم";
    return p.name || p.subType || p.category;
  };

  const getTypeLabel = (p) => {
    const em = catEmoji[p.category] || "✨";
    if (!isUrdu) {
      if (p.category === "Pipe")
        return p.pipeType === "round" ? "⭕ Round" : p.pipeType === "square" ? "⬜ Square" : p.pipeType || "—";
      return `${em} ${p.category === "Net" ? t.net : p.category}`;
    }
    if (p.category === "Pipe")
      return p.pipeType === "round"  ? "⭕ گول" : p.pipeType === "square" ? "⬜ چوکور" : p.pipeType || "—";
    return `${em} ${catDisplayName(p.category)}`;
  };

  const getDetailLabel = (p) => {
    if (p.category === "Pipe") {
      if (!p.pipeSubType) return "—";
      if (!isUrdu) return p.pipeSubType.charAt(0).toUpperCase() + p.pipeSubType.slice(1);
      return p.pipeSubType === "soft" ? "نرم" : p.pipeSubType === "hard" ? "سخت" : p.pipeSubType;
    }
    if (p.category === "Hardware") return p.barcode || p.subType || p.location || "—";
    return p.gauge || "—";
  };

  const catColor={Pipe:{color:"#60a5fa",bg:"rgba(41,128,185,0.15)"},Chader:{color:"#34d399",bg:"rgba(26,188,156,0.15)"},Net:{color:"#f472b6",bg:"rgba(244,114,182,0.15)"},Hardware:{color:"#fbbf24",bg:"rgba(251,191,36,0.15)"},Custom:{color:"#a78bfa",bg:"rgba(167,139,250,0.15)"}};
  const searchLower=search.toLowerCase();
  const displayed=(catTab==="all"?products:products.filter(p=>p.category===catTab))
    .filter(p=>!search||p.name?.toLowerCase().includes(searchLower)||p.subType?.toLowerCase().includes(searchLower)||p.pipeInch?.toLowerCase().includes(searchLower)||p.gauge?.toLowerCase().includes(searchLower)||p.pipeType?.toLowerCase().includes(searchLower)||p.barcode?.toLowerCase().includes(searchLower)||p.brand?.toLowerCase().includes(searchLower)||p.subCategory?.toLowerCase().includes(searchLower));
  const tabCounts=ALL_CATS.reduce((acc,c)=>({...acc,[c]:products.filter(p=>p.category===c).length}),{});

  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={{position:"relative"}}>
        <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:th.textMuted,display:"flex",alignItems:"center"}}><Icon path={ICONS.search} size={16}/></span>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder={t.searchPlaceholder} style={{width:"100%",padding:"11px 14px 11px 38px",borderRadius:12,border:`1px solid ${th.border}`,background:th.bgCard,color:th.text,fontSize:15,outline:"none",boxSizing:"border-box"}}/>
      </div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",flex:1}}>
          <button onClick={()=>setCatTab("all")} style={{padding:isMobile?"6px 12px":"7px 14px",borderRadius:20,border:`1.5px solid ${catTab==="all"?"rgba(26,188,156,0.5)":th.border}`,background:catTab==="all"?"rgba(26,188,156,0.1)":"transparent",color:catTab==="all"?"#1abc9c":th.textMuted,cursor:"pointer",fontSize:13,fontWeight:600}}>
            {t.all} ({products.length})
          </button>
          {ALL_CATS.map(cat=>(
            <button key={cat} onClick={()=>setCatTab(cat)} style={{padding:isMobile?"6px 12px":"7px 14px",borderRadius:20,border:`1.5px solid ${catTab===cat?(catColor[cat]?.color+"80"):th.border}`,background:catTab===cat?(catColor[cat]?.bg||"transparent"):"transparent",color:catTab===cat?(catColor[cat]?.color||th.text):th.textMuted,cursor:"pointer",fontSize:13,fontWeight:600}}>
              {catEmoji[cat]} {isMobile ? "" : catDisplayName(cat)} ({tabCounts[cat]||0})
            </button>
          ))}
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",flexShrink:0}}>
          <button onClick={openHwAdd} style={{display:"flex",alignItems:"center",gap:6,padding:"9px 16px",borderRadius:12,border:"none",cursor:"pointer",background:"linear-gradient(135deg,#d97706,#f59e0b)",color:"white",fontWeight:600,fontSize:14,flexShrink:0,boxShadow:"0 3px 0 rgba(180,83,9,0.45)"}}>
            <Icon path={ICONS.plus} size={15}/>{isMobile?(isUrdu?"🔧":"🔧 HW"):(isUrdu?"ہارڈ ویئر آئٹم شامل کریں":t.addHardwareProduct)}
          </button>
          <button onClick={openAdd} style={{display:"flex",alignItems:"center",gap:6,padding:"9px 16px",borderRadius:12,border:"none",cursor:"pointer",background:"linear-gradient(135deg,#1abc9c,#2980b9)",color:"white",fontWeight:600,fontSize:14,flexShrink:0}}>
            <Icon path={ICONS.plus} size={15}/>{isMobile?"+":t.addProduct}
          </button>
        </div>
      </div>
      <Table
        cols={[t.number, t.pipeProduct, t.price, t.type, t.subType||"Sub Type"]}
        rows={displayed.map((p,i)=>{
          const cc=catColor[p.category]||catColor.Custom;
          const isPipe = p.category==="Pipe";
          const displayAmt = isPipe ? parseFloat(p.price) : (parseFloat(p.price) || parseFloat(p.purchasePrice));
          const priceNum = isNaN(displayAmt) ? NaN : displayAmt;
          return {data:p,cells:[
            <span style={{color:th.textDim,fontSize:14}}>{i+1}</span>,
            <span style={{fontWeight:600,color:th.text,fontSize:15}}>{getProductDisplayName(p)}</span>,
            <span style={{color:"#34d399",fontSize:14,fontWeight:600}}>
              {!isNaN(priceNum)&&priceNum>0?`Rs ${priceNum.toLocaleString('en-PK')}`:"—"}
              {isPipe?(priceNum>0?<span style={{color:th.textMuted,fontSize:12,fontWeight:400}}> /ft</span>:null):p.category==="Hardware"?<span style={{color:th.textMuted,fontSize:12,fontWeight:400}}> {isUrdu?"فروخت":"sale"}</span>:<span style={{color:th.textMuted,fontSize:12,fontWeight:400}}> {isUrdu?"خریداری":"purchase"}</span>}
            </span>,
            <span style={{fontSize:13,padding:"3px 10px",borderRadius:20,fontWeight:600,background:cc.bg,color:cc.color}}>
              {getTypeLabel(p)}
            </span>,
            <span style={{color:th.textMuted,fontSize:13}}>{getDetailLabel(p)}</span>,
          ]};
        })}
        onEdit={openEdit} onDelete={del}
      />
      {showModal&&(<Modal title={editing?t.editProduct:t.addProduct} onClose={()=>setShowModal(false)}>
        <div style={{display:"flex",flexDirection:"column",gap:18}}>
          {!editing?(<CategorySelector value={form.category} onChange={v=>setForm({...EMPTY_FORM,category:v,unit:"piece"})}/>):(
            <div style={{padding:"10px 14px",borderRadius:10,background:th.bgCard,border:`1px solid ${th.border}`,display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:20}}>{catEmoji[form.category]||"✨"}</span>
              <span style={{color:catColor[form.category]?.color||"#a78bfa",fontWeight:700,fontSize:16}}>
                {catDisplayName(form.category)}
              </span>
            </div>
          )}
          {form.category==="Pipe"&&<PipeForm form={form} setForm={setForm}/>}
          {form.category==="Chader"&&<ChaderForm form={form} setForm={setForm}/>}
          {form.category==="Net"&&<NetForm form={form} setForm={setForm}/>}
          {form.category==="Hardware"&&<HardwareForm form={form} setForm={setForm}/>}
          {form.category==="Custom"&&<CustomForm form={form} setForm={setForm}/>}
          {form.category&&<SaveBtn onClick={save} loading={saving} label={saving?t.saving:editing?t.updateProduct:t.saveProduct}/>}
        </div>
      </Modal>)}
      {showHwModal&&(
        <Modal title={hwEditing ? (isUrdu ? "ہارڈ ویئر ترمیم" : t.editProduct) : (isUrdu ? "ہارڈ ویئر آئٹم شامل کریں" : t.addHardwareProduct)} onClose={()=>{setShowHwModal(false);setHwEditing(null);}}>
          <HardwareSimpleForm form={hwForm} setForm={setHwForm} onSave={saveHardware} saving={hwSaving} editing={!!hwEditing}/>
        </Modal>
      )}
    </div>
  );
}

function PipeForm({ form, setForm }) {
  const th=useTheme(); const {t,lang}=useLang(); const isUrdu=lang==="ur";
  const s={background:th.input,border:`1px solid ${th.inputBorder}`,color:th.text,borderRadius:12,padding:"11px 14px",fontSize:15,outline:"none",width:"100%",boxSizing:"border-box"};
  const LabelRow=({text,required})=>(<label style={{color:th.textMuted,fontSize:12,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:5,display:"block"}}>{text}{required&&<span style={{color:"#f87171",marginLeft:3}}>*</span>}</label>);
  const buildName=(f)=>{const parts=[];if(f.pipeType==="round"){if(f.pipeSubType)parts.push(f.pipeSubType.charAt(0).toUpperCase()+f.pipeSubType.slice(1));parts.push("Round");}else if(f.pipeType==="square")parts.push("Square");if(f.pipeInch)parts.push(f.pipeInch);if(f.gauge)parts.push(f.gauge);return parts.join(" ");};
  const selectType=(type)=>setForm(p=>({...p,pipeType:type,pipeSubType:"",pipeInch:"",gauge:"",price:"",name:""}));
  const selectSub=(sub)=>setForm(p=>({...p,pipeSubType:sub,pipeInch:"",gauge:"",price:"",name:""}));
  const selectInch=(inch)=>setForm(p=>{const n=buildName({...p,pipeInch:inch});return{...p,pipeInch:inch,gauge:"",price:"",name:n};});
  const selectGauge=(g)=>setForm(p=>{const n=buildName({...p,gauge:g});return{...p,gauge:g,price:"",name:n};});
  const showSubType=form.pipeType==="round";
  const showInch=form.pipeType==="square"||(form.pipeType==="round"&&form.pipeSubType);
  const showGauge=!!form.pipeInch&&form.pipeInch!=="__custom__";
  const showPrice=!!form.gauge;
  const inchList=form.pipeType==="round"?ROUND_INCHES:SQUARE_INCHES;

  // custom inch: dropdown value helper
  const dropdownInchValue = inchList.includes(form.pipeInch) ? form.pipeInch : (form.pipeInch ? "__custom__" : "");
  const isCustomInch = !!form.pipeInch && !inchList.includes(form.pipeInch);

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{padding:"8px 14px",borderRadius:10,background:"rgba(96,165,250,0.08)",border:"1px solid rgba(96,165,250,0.2)",display:"flex",alignItems:"center",gap:8}}>
        <span style={{color:"#60a5fa",fontWeight:600,fontSize:15}}>🔩 {t.pipeDetails}</span>
      </div>
      <div>
        <LabelRow text={t.pipeType} required/>
        <select value={form.pipeType||""} onChange={e=>selectType(e.target.value)} style={s}>
          <option value="">— {t.selectType} —</option>
          <option value="round"  style={{background:th.bgModal}}>⭕ {isUrdu ? "گول پائپ"  : t.roundPipe}</option>
          <option value="square" style={{background:th.bgModal}}>⬜ {isUrdu ? "چوکور پائپ" : t.squarePipe}</option>
        </select>
      </div>
      {showSubType&&(
        <div>
          <LabelRow text={t.subType} required/>
          <select value={form.pipeSubType||""} onChange={e=>selectSub(e.target.value)} style={s}>
            <option value="">— {t.subType} —</option>
            <option value="soft" style={{background:th.bgModal}}>{isUrdu ? "نرم (Soft)" : t.soft}</option>
            <option value="hard" style={{background:th.bgModal}}>{isUrdu ? "سخت (Hard)" : t.hard}</option>
          </select>
        </div>
      )}
      {showInch&&(
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          <LabelRow text={t.inches} required/>
          <select
            value={dropdownInchValue}
            onChange={e=>{
              if(e.target.value==="__custom__") setForm(p=>({...p,pipeInch:"__custom__",gauge:"",price:"",name:""}));
              else selectInch(e.target.value);
            }}
            style={s}
          >
            <option value="">— {t.inches} —</option>
            {inchList.map(i=><option key={i} value={i} style={{background:th.bgModal}}>{i}</option>)}
            <option value="__custom__" style={{background:th.bgModal}}>{isUrdu ? "✏️ کسٹم (خود لکھیں)" : "✏️ Custom (type own)"}</option>
          </select>
          {(form.pipeInch==="__custom__"||isCustomInch)&&(
            <input
              type="text"
              value={form.pipeInch==="__custom__" ? "" : form.pipeInch}
              onChange={e=>selectInch(e.target.value)}
              placeholder={isUrdu ? 'اپنا سائز لکھیں... مثلاً 2.5"' : 'Type custom size... e.g. 2.5"'}
              style={{...s, border:"2px solid rgba(96,165,250,0.4)"}}
              onFocus={e=>e.target.style.borderColor="#60a5fa"}
              onBlur={e=>e.target.style.borderColor="rgba(96,165,250,0.4)"}
              autoFocus
            />
          )}
        </div>
      )}
      {showGauge&&(
        <div>
          <LabelRow text={t.gauge} required/>
          <select value={form.gauge||""} onChange={e=>selectGauge(e.target.value)} style={s}>
            <option value="">— {t.gauge} —</option>
            {PIPE_GAUGES.map(g=><option key={g.value} value={g.value} style={{background:th.bgModal}}>{g.label}</option>)}
          </select>
        </div>
      )}
      {showPrice&&(
        <div>
          <LabelRow text={isUrdu ? "فی فٹ قیمت (روپے)" : "Price per Feet (PKR)"} required/>
          <div style={{position:"relative"}}>
            <span style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",color:th.textMuted,fontSize:14,fontWeight:600}}>Rs</span>
            <input type="text" inputMode="decimal" value={form.price||""} onChange={e=>setForm(p=>({...p,price:e.target.value}))} placeholder="e.g. 28.5" style={{...s,paddingLeft:44,border:"2px solid rgba(26,188,156,0.4)",fontSize:17,fontWeight:700}} onFocus={e=>e.target.style.borderColor="#1abc9c"} onBlur={e=>e.target.style.borderColor="rgba(26,188,156,0.4)"}/>
          </div>
          {form.price&&parseFloat(form.price)>0&&(<p style={{color:"#34d399",fontSize:13,margin:"4px 0 0"}}>{formatPKR(parseFloat(form.price))} / {isUrdu?"فٹ":"feet"}</p>)}
        </div>
      )}
    </div>
  );
}

function ChaderForm({ form, setForm }) {
  const th=useTheme(); const {t,lang}=useLang(); const isUrdu=lang==="ur";
  const s={background:th.input,border:`1px solid ${th.inputBorder}`,color:th.text,borderRadius:12,padding:"11px 14px",fontSize:15,outline:"none",width:"100%",boxSizing:"border-box"};
  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div>
        <label style={{color:th.textMuted,fontSize:12,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:5,display:"block"}}>
          {isUrdu ? "چادر کی قسم" : t.chaderType} <span style={{color:"#f87171"}}>*</span>
        </label>
        <select value={form.subType} onChange={e=>setForm(p=>({...p,subType:e.target.value}))} style={s}>
          <option value="">-- {t.selectType} --</option>
          {CHADER_TYPES.map(ct=>(
            <option key={ct.key} value={ct.key} style={{background:th.bgModal}}>
              {ct.emoji} {isUrdu ? ct.labelUr : ct.label}
            </option>
          ))}
        </select>
      </div>
      {form.subType==="Custom"&&(
        <div>
          <label style={{color:th.textMuted,fontSize:12,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:5,display:"block"}}>
            {isUrdu ? "چادر کا نام لکھیں" : "Custom Chader Name"} <span style={{color:"#f87171"}}>*</span>
          </label>
          <input value={form.name||""} onChange={e=>setForm(p=>({...p,name:e.target.value}))}
            placeholder={isUrdu ? "مثلاً: 22G رنگین چادر" : "e.g. Special Coated Chader"} style={s}/>
        </div>
      )}
      <FInput
        label={isUrdu ? "خریداری قیمت (روپے) - اختیاری" : "Purchase Price (PKR) - Optional"}
        value={form.purchasePrice}
        onChange={v=>setForm(p=>({...p,purchasePrice:v}))}
        placeholder="0"
        inputMode="decimal"
      />
    </div>
  );
}

function NetForm({ form, setForm }) {
  const th=useTheme(); const {t,lang}=useLang(); const isUrdu=lang==="ur";
  const s={background:th.input,border:`1px solid ${th.inputBorder}`,color:th.text,borderRadius:12,padding:"11px 14px",fontSize:15,outline:"none",width:"100%",boxSizing:"border-box"};
  const netUrduNames = { Chorus:"کورس", Break:"بریک", Barfii:"برفی" };
  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div>
        <label style={{color:th.textMuted,fontSize:12,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:5,display:"block"}}>
          {isUrdu ? "جالی کی قسم" : `${t.net} ${t.productType}`} <span style={{color:"#f87171"}}>*</span>
        </label>
        <select value={form.subType} onChange={e=>setForm(p=>({...p,subType:e.target.value,gauge:"",name:"",width:""}))} style={s}>
          <option value="">-- {t.selectType} --</option>
          {NET_TYPES.map(nt=>(
            <option key={nt.key} value={nt.key} style={{background:th.bgModal}}>
              {nt.emoji} {isUrdu ? (netUrduNames[nt.key] || (nt.labelUr || nt.label)) : nt.label}
            </option>
          ))}
        </select>
      </div>
      {form.subType&&(
        <div>
          <label style={{color:th.textMuted,fontSize:12,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:5,display:"block"}}>
            {isUrdu ? "چوڑائی (فٹ)" : "Width (ft)"}
          </label>
          <select value={form.width} onChange={e=>setForm(p=>({...p,width:e.target.value}))} style={s}>
            <option value="">-- {isUrdu ? "چوڑائی منتخب کریں" : "Select Width"} --</option>
            {Array.from({length:10},(_,i)=>i+1).map(w=>(
              <option key={w} value={w} style={{background:th.bgModal}}>{w}ft</option>
            ))}
          </select>
        </div>
      )}
      {form.subType==="Chorus"&&(
        <div>
          <label style={{color:th.textMuted,fontSize:12,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:5,display:"block"}}>
            {t.gauge} <span style={{color:"#f87171"}}>*</span>
          </label>
          <select value={form.gauge} onChange={e=>setForm(p=>({...p,gauge:e.target.value}))} style={s}>
            <option value="">-- {t.gauge} --</option>
            {NET_CHORUS_GAUGES.map(g=><option key={g} value={g} style={{background:th.bgModal}}>{g}</option>)}
          </select>
        </div>
      )}
      {(form.subType==="Break"||form.subType==="Barfii")&&(
        <FInput
          label={isUrdu ? "پروڈکٹ کا نام" : t.productNameLabel}
          value={form.name}
          onChange={v=>setForm(p=>({...p,name:v}))}
          placeholder={form.subType==="Break" ? (isUrdu?"بریک جالی":"Break Net") : (isUrdu?"برفی جالی":"Barfii Net")}
          required
        />
      )}
      {form.subType==="Chorus"&&(
        <FInput
          label={isUrdu ? "پروڈکٹ کا نام (اختیاری)" : `${t.productNameLabel} (Optional)`}
          value={form.name}
          onChange={v=>setForm(p=>({...p,name:v}))}
          placeholder={form.gauge ? `Chorus ${form.gauge}` : (isUrdu?"مثلاً: Chorus 12g":"e.g. Chorus 12g")}
        />
      )}
      <FInput
        label={isUrdu ? "خریداری قیمت (روپے) - اختیاری" : "Purchase Price (PKR) - Optional"}
        value={form.purchasePrice}
        onChange={v=>setForm(p=>({...p,purchasePrice:v}))}
        placeholder="0"
        inputMode="decimal"
      />
    </div>
  );
}

function HardwareSimpleForm({ form, setForm, onSave, saving, editing }) {
  const {t,lang}=useLang(); const isUrdu=lang==="ur";
  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <FInput
        label={isUrdu ? "نام" : "Name"}
        value={form.name}
        onChange={v=>setForm(p=>({...p,name:v}))}
        placeholder={isUrdu ? "مثلاً: 3/4 انچ نٹ" : "e.g. 3/4 inch Nut"}
        required
      />
      <FInput
        label={isUrdu ? "نمبر" : "Number"}
        value={form.barcode}
        onChange={v=>setForm(p=>({...p,barcode:v}))}
        placeholder={isUrdu ? "بارکوڈ / نمبر" : "Barcode / number"}
        required
      />
      <FInput
        label={isUrdu ? "قسم" : "Type"}
        value={form.subType}
        onChange={v=>setForm(p=>({...p,subType:v}))}
        placeholder={isUrdu ? "مثلاً نٹ / بولٹ" : "e.g. Nut / Bolt"}
      />
      <FInput
        label={isUrdu ? "پتہ" : "Address"}
        value={form.location}
        onChange={v=>setForm(p=>({...p,location:v}))}
        placeholder={isUrdu ? "ریک / گودام" : "Rack / godown"}
      />
      <FInput
        label={isUrdu ? "نوٹ" : "Note"}
        value={form.notes}
        onChange={v=>setForm(p=>({...p,notes:v}))}
        placeholder="..."
      />
      <FInput
        label={isUrdu ? "خریداری قیمت (روپے) - اختیاری" : "Purchase Price (PKR) - Optional"}
        value={form.purchasePrice}
        onChange={v=>setForm(p=>({...p,purchasePrice:v}))}
        placeholder="0"
        inputMode="decimal"
      />
      <FInput
        label={isUrdu ? "فروخت قیمت (روپے) - اختیاری" : "Sale Price (PKR) - Optional"}
        value={form.price}
        onChange={v=>setForm(p=>({...p,price:v}))}
        placeholder="0"
        inputMode="decimal"
      />
      {onSave && <SaveBtn onClick={onSave} loading={saving} label={saving ? t.saving : editing ? t.updateProduct : t.saveProduct}/>}
    </div>
  );
}

function HardwareForm({ form, setForm }) {
  return <HardwareSimpleForm form={form} setForm={setForm}/>;
}

function CustomForm({ form, setForm }) {
  const {t,lang}=useLang(); const isUrdu=lang==="ur";
  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <FInput
        label={isUrdu ? "پروڈکٹ کا نام" : t.productNameLabel}
        value={form.name}
        onChange={v=>setForm(p=>({...p,name:v}))}
        placeholder={isUrdu ? "کوئی بھی نام..." : "Koi bhi naam..."}
        required
      />
      <FInput
        label={isUrdu ? "خریداری قیمت (روپے) - اختیاری" : "Purchase Price (PKR) - Optional"}
        value={form.purchasePrice}
        onChange={v=>setForm(p=>({...p,purchasePrice:v}))}
        placeholder="0"
        inputMode="decimal"
      />
    </div>
  );
}

function CategorySelector({ value, onChange }) {
  const th=useTheme(); const {t,lang}=useLang(); const isUrdu=lang==="ur";
  const cats=[
    {key:"Pipe",    label:t.pipe,     labelUr:"🔩 پائپ"},
    {key:"Chader",  label:t.chader,   labelUr:"📋 چادر"},
    {key:"Net",     label:t.net,      labelUr:"🕸️ جالی"},
    {key:"Hardware",label:t.hardware, labelUr:"🔧 ہارڈ ویئر"},
    {key:"Custom",  label:t.custom,   labelUr:"✨ کسٹم"},
  ];
  const s={background:th.input,border:`1px solid ${th.inputBorder}`,color:th.text,borderRadius:12,padding:"11px 14px",fontSize:15,outline:"none",width:"100%",boxSizing:"border-box"};
  return (
    <div>
      <label style={{color:th.textMuted,fontSize:12,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:5,display:"block"}}>
        {isUrdu ? "قسم منتخب کریں" : t.category} <span style={{color:"#f87171"}}>*</span>
      </label>
      <select value={value} onChange={e=>onChange(e.target.value)} style={s}>
        <option value="">-- {isUrdu ? "قسم منتخب کریں" : t.selectType} --</option>
        {cats.map(c=>(
          <option key={c.key} value={c.key} style={{background:th.bgModal}}>
            {isUrdu ? c.labelUr : c.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export default ProductsPage;