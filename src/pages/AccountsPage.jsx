import { useState, useEffect } from "react";
import { useTheme } from "../context/ThemeContext";
import { useLang } from "../context/LangContext";
import { useResponsive, Icon, ICONS, Modal, FInput, SaveBtn, StatCard } from "../components/shared";
import { api } from "../utils/api";
import { formatPKR } from "../utils/helpers";
import { PAKISTAN_BANKS } from "../utils/constants";

function AccountsPage() {
  const th = useTheme();
  const {t, isUrdu} = useLang();
  const { isMobile } = useResponsive();
  const [accounts, setAccounts] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({type:"bank",name:"",bankName:"",accountNumber:"",openingBalance:"",notes:""});
  const [customBank, setCustomBank] = useState("");
  const [saving, setSaving] = useState(false);
  const f = (k)=>(v)=>setForm(p=>({...p,[k]:v}));

  const loadAccounts = async () => {
    try { const r = await api.getAccounts(); if (r.success) setAccounts(r.accounts); }
    catch(e) { console.error(e); }
    finally { setLoadingData(false); }
  };
  useEffect(() => { loadAccounts(); }, []);

  const bankAccounts    = accounts.filter(a=>a.type==="bank");
  const cashAccounts    = accounts.filter(a=>a.type==="cash");
  const walletAccounts  = accounts.filter(a=>a.type==="wallet");
  const totalBankBal    = bankAccounts.reduce((s,a)=>s+(Number(a.openingBalance)||0),0);
  const totalCashBal    = cashAccounts.reduce((s,a)=>s+(Number(a.openingBalance)||0),0);
  const totalWalletBal  = walletAccounts.reduce((s,a)=>s+(Number(a.openingBalance)||0),0);
  const totalAll        = totalBankBal + totalCashBal + totalWalletBal;

  const getAccId = (acc) => acc.id || acc._id;

  const openAdd = () => { setForm({type:"bank",name:"",bankName:"",accountNumber:"",openingBalance:"",notes:""}); setCustomBank(""); setEditing(null); setShowModal(true); };
  const openEdit = (acc) => {
    setForm({type:acc.type,name:acc.name||"",bankName:acc.bankName||"",accountNumber:acc.accountNumber||"",openingBalance:String(acc.openingBalance||""),notes:acc.notes||""});
    const knownBanks = [...PAKISTAN_BANKS, ...PAKISTAN_WALLETS].slice(0,-1);
    const isCustom = acc.bankName && !knownBanks.includes(acc.bankName);
    setCustomBank(isCustom ? acc.bankName : ""); setEditing(getAccId(acc)); setShowModal(true);
  };
  const handleSave = async () => {
    setSaving(true);
    const finalBankName = form.bankName === "Other / Custom" ? customBank : form.bankName;
    const accountName =
      form.type === "bank"   ? (form.name || finalBankName || t.bankAccount) :
      form.type === "wallet" ? (form.name || finalBankName || "Wallet") :
                               (form.name || t.cashAccount);
    const payload = {
      type: form.type,
      name: accountName,
      bankName: (form.type==="bank"||form.type==="wallet") ? finalBankName : "",
      accountNumber: form.accountNumber,
      openingBalance: Number(form.openingBalance)||0,
      notes: form.notes
    };
    const res = editing ? await api.updateAccount(editing, payload) : await api.addAccount(payload);
    if (res.success) { await loadAccounts(); setShowModal(false); } else alert(res.message || "Error saving account");
    setSaving(false);
  };
  const handleDelete = async (acc) => {
    if (!window.confirm(t.deleteAccountConfirm || "Delete karna chahte hain?")) return;
    const res = await api.deleteAccount(getAccId(acc));
    if (res.success) await loadAccounts(); else alert(res.message);
  };

  const isBank   = form.type === "bank";
  const isWallet = form.type === "wallet";
  const canSave  = form.type && ((isBank||isWallet) ? (form.bankName || form.name) : form.name);
  const inpS = {background:th.input,border:`1px solid ${th.inputBorder}`,color:th.text,borderRadius:12,padding:"10px 14px",fontSize:14,outline:"none",width:"100%",boxSizing:"border-box"};

  // ─── Wallet brands config ──────────────────────────────────────────────────
  const WALLET_BRANDS = {
    "EasyPaisa":  { color:"#6ac259", icon:"📱" },
    "JazzCash":   { color:"#e5001e", icon:"📲" },
    "SadaPay":    { color:"#7c3aed", icon:"💳" },
    "NayaPay":    { color:"#f59e0b", icon:"🟡" },
    "UPaisa":     { color:"#0ea5e9", icon:"💙" },
    "Other / Custom": { color:"#94a3b8", icon:"👜" },
  };
  const PAKISTAN_WALLETS = Object.keys(WALLET_BRANDS);

  const getWalletStyle = (bankName) => WALLET_BRANDS[bankName] || WALLET_BRANDS["Other / Custom"];

  // ─── Account Card ──────────────────────────────────────────────────────────
  const AccountCard = ({acc}) => {
    const isB = acc.type==="bank";
    const isW = acc.type==="wallet";
    const ws  = isW ? getWalletStyle(acc.bankName) : null;
    const color = isB ? "#60a5fa" : isW ? ws.color : "#34d399";
    const bg    = isB ? "rgba(96,165,250,0.08)" : isW ? `${ws.color}14` : "rgba(52,211,153,0.08)";
    const bdr   = isB ? "rgba(96,165,250,0.2)"  : isW ? `${ws.color}44` : "rgba(52,211,153,0.2)";
    const badge = isB ? "🏦 Bank" : isW ? `${ws.icon} ${acc.bankName||"Wallet"}` : "💵 Cash";

    return (
      <div style={{borderRadius:16,padding:isMobile?14:20,border:`1px solid ${bdr}`,background:bg,display:"flex",flexDirection:"column",gap:12}}>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:40,height:40,borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",background:`${color}22`,fontSize:isW?20:16,flexShrink:0}}>
              {isW ? ws.icon : isB ? <Icon path={ICONS.bank} size={20} color={color}/> : <Icon path={ICONS.wallet} size={20} color={color}/>}
            </div>
            <div>
              <div style={{color:th.text,fontWeight:700,fontSize:14}}>{acc.name}</div>
              {(isB||isW) && acc.bankName && <div style={{color:th.textMuted,fontSize:12,marginTop:2}}>{acc.bankName}</div>}
              {acc.accountNumber && <div style={{color:th.textDim,fontSize:11,fontFamily:"monospace",marginTop:1}}>{acc.accountNumber}</div>}
            </div>
          </div>
          <span style={{fontSize:10,padding:"3px 10px",borderRadius:20,fontWeight:700,background:`${color}22`,color,whiteSpace:"nowrap",marginLeft:8}}>{badge}</span>
        </div>
        <div style={{borderTop:`1px solid ${bdr}`,paddingTop:12}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <span style={{color:th.textMuted,fontSize:12}}>{t.openingBalance||"Opening Balance"}</span>
            <span style={{color,fontWeight:900,fontSize:16}}>{formatPKR(acc.openingBalance)}</span>
          </div>
          {acc.notes && <div style={{marginTop:8,padding:"6px 10px",borderRadius:8,background:`${color}11`,color:th.textMuted,fontSize:11}}>📝 {acc.notes}</div>}
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>openEdit(acc)} style={{flex:1,padding:"7px",borderRadius:10,fontSize:12,color:"#93c5fd",border:"1px solid rgba(59,130,246,0.3)",background:"transparent",cursor:"pointer",fontFamily:"'Segoe UI',sans-serif"}}>✏️ {t.edit||"Edit"}</button>
          <button onClick={()=>handleDelete(acc)} style={{flex:1,padding:"7px",borderRadius:10,fontSize:12,color:"#fca5a5",border:"1px solid rgba(239,68,68,0.3)",background:"transparent",cursor:"pointer",fontFamily:"'Segoe UI',sans-serif"}}>🗑️ {t.delete||"Delete"}</button>
        </div>
      </div>
    );
  };

  if (loadingData) return <div style={{textAlign:"center",padding:"60px",color:th.textDim,fontSize:14}}>⏳ {isUrdu ? "لوڈ ہو رہا ہے..." : "Loading accounts..."}</div>;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:20}}>
      {/* ── Stats ── */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:12}}>
        <StatCard label={isUrdu?"بینک":"Banks"}        value={bankAccounts.length}   icon={ICONS.bank}   color="#60a5fa" sub={formatPKR(totalBankBal)}/>
        <StatCard label={isUrdu?"نقد":"Cash"}          value={cashAccounts.length}   icon={ICONS.wallet} color="#34d399" sub={formatPKR(totalCashBal)}/>
        <StatCard label={isUrdu?"والٹ":"Wallets"}      value={walletAccounts.length} icon={ICONS.coins}  color="#a78bfa" sub={formatPKR(totalWalletBal)}/>
        <StatCard label={isUrdu?"کل بیلنس":"Total"}    value={formatPKR(totalAll)}   icon={ICONS.coins}  color="#fbbf24" sub={`${accounts.length} accounts`}/>
      </div>

      {/* ── Header ── */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <p style={{color:th.textMuted,fontSize:13,margin:0}}>{accounts.length} {isUrdu?"اکاؤنٹس":"accounts"}</p>
        <button onClick={openAdd} style={{display:"flex",alignItems:"center",gap:8,padding:"9px 16px",borderRadius:12,border:"none",cursor:"pointer",background:"linear-gradient(135deg,#1abc9c,#2980b9)",color:"white",fontWeight:600,fontSize:13}}>
          <Icon path={ICONS.plus} size={14}/>{isMobile?"+":t.addAccount||"Add Account"}
        </button>
      </div>

      {/* ── Bank Accounts ── */}
      {bankAccounts.length>0 && (
        <div>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
            <span style={{fontSize:16}}>🏦</span>
            <h3 style={{color:th.text,fontWeight:700,margin:0,fontSize:14}}>{isUrdu?"بینک اکاؤنٹس":"Bank Accounts"}</h3>
            <span style={{fontSize:11,padding:"2px 10px",borderRadius:20,background:"rgba(96,165,250,0.15)",color:"#60a5fa",fontWeight:600}}>{bankAccounts.length}</span>
            <span style={{marginLeft:"auto",color:"#60a5fa",fontWeight:700,fontSize:13}}>{formatPKR(totalBankBal)}</span>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:14}}>
            {bankAccounts.map(acc=><AccountCard key={getAccId(acc)} acc={acc}/>)}
          </div>
        </div>
      )}

      {/* ── Wallet Accounts ── */}
      {walletAccounts.length>0 && (
        <div>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
            <span style={{fontSize:16}}>📱</span>
            <h3 style={{color:th.text,fontWeight:700,margin:0,fontSize:14}}>{isUrdu?"موبائل والٹ":"Mobile Wallets"}</h3>
            <span style={{fontSize:11,padding:"2px 10px",borderRadius:20,background:"rgba(167,139,250,0.15)",color:"#a78bfa",fontWeight:600}}>{walletAccounts.length}</span>
            <span style={{marginLeft:"auto",color:"#a78bfa",fontWeight:700,fontSize:13}}>{formatPKR(totalWalletBal)}</span>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:14}}>
            {walletAccounts.map(acc=><AccountCard key={getAccId(acc)} acc={acc}/>)}
          </div>
        </div>
      )}

      {/* ── Cash Accounts ── */}
      {cashAccounts.length>0 && (
        <div>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
            <span style={{fontSize:16}}>💵</span>
            <h3 style={{color:th.text,fontWeight:700,margin:0,fontSize:14}}>{isUrdu?"نقد اکاؤنٹس":"Cash Accounts"}</h3>
            <span style={{fontSize:11,padding:"2px 10px",borderRadius:20,background:"rgba(52,211,153,0.15)",color:"#34d399",fontWeight:600}}>{cashAccounts.length}</span>
            <span style={{marginLeft:"auto",color:"#34d399",fontWeight:700,fontSize:13}}>{formatPKR(totalCashBal)}</span>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:14}}>
            {cashAccounts.map(acc=><AccountCard key={getAccId(acc)} acc={acc}/>)}
          </div>
        </div>
      )}

      {/* ── Empty State ── */}
      {accounts.length===0 && (
        <div style={{textAlign:"center",padding:"48px 24px",borderRadius:16,border:`2px dashed ${th.border}`,background:th.bgCard}}>
          <div style={{fontSize:40,marginBottom:10}}>🏦</div>
          <p style={{color:th.textMuted,fontSize:14,fontWeight:600,margin:"0 0 6px"}}>{t.noAccountsYet||"Koi account nahi"}</p>
          <button onClick={openAdd} style={{display:"inline-flex",alignItems:"center",gap:8,padding:"10px 20px",borderRadius:12,border:"none",cursor:"pointer",background:"linear-gradient(135deg,#1abc9c,#2980b9)",color:"white",fontWeight:600,fontSize:14}}>
            <Icon path={ICONS.plus} size={16}/>{t.addAccount||"Add Account"}
          </button>
        </div>
      )}

      {/* ── Modal ── */}
      {showModal && (
        <Modal title={editing ? (t.editAccount||"Edit Account") : (t.addAccount||"Add Account")} onClose={()=>setShowModal(false)}>
          <div style={{display:"flex",flexDirection:"column",gap:16}}>

            {/* Account Type — 3 options */}
            <div>
              <label style={{color:th.textMuted,fontSize:11,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8,display:"block"}}>{t.accountType||"Account Type"} <span style={{color:"#f87171"}}>*</span></label>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                {[
                  {val:"bank",   icon:ICONS.bank,   label:isUrdu?"🏦 بینک":"🏦 Bank",   color:"#60a5fa"},
                  {val:"wallet", icon:ICONS.coins,  label:isUrdu?"📱 والٹ":"📱 Wallet", color:"#a78bfa"},
                  {val:"cash",   icon:ICONS.wallet, label:isUrdu?"💵 نقد":"💵 Cash",   color:"#34d399"},
                ].map(({val,icon,label,color})=>(
                  <button key={val} onClick={()=>f("type")(val)} style={{padding:"12px 6px",borderRadius:12,border:`2px solid ${form.type===val?color:th.border}`,background:form.type===val?`${color}18`:"transparent",color:form.type===val?color:th.textMuted,cursor:"pointer",fontWeight:700,fontSize:12,display:"flex",flexDirection:"column",alignItems:"center",gap:5}}>
                    <Icon path={icon} size={20}/><span>{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Bank selector */}
            {isBank && (
              <>
                <div>
                  <label style={{color:th.textMuted,fontSize:11,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:5,display:"block"}}>{t.bankName||"Bank Name"} <span style={{color:"#f87171"}}>*</span></label>
                  <select value={form.bankName} onChange={e=>{f("bankName")(e.target.value);if(e.target.value!=="Other / Custom")setCustomBank("");}} style={inpS} onFocus={e=>e.target.style.borderColor="#1abc9c"} onBlur={e=>e.target.style.borderColor=th.inputBorder}>
                    <option value="">-- {t.selectBank||"Bank Select Karein"} --</option>
                    {PAKISTAN_BANKS.map(b=><option key={b} value={b} style={{background:th.bgModal}}>{b}</option>)}
                  </select>
                </div>
                {form.bankName==="Other / Custom" && (
                  <div>
                    <label style={{color:th.textMuted,fontSize:11,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:5,display:"block"}}>{isUrdu?"کسٹم بینک":"Custom Bank"} <span style={{color:"#f87171"}}>*</span></label>
                    <input value={customBank} onChange={e=>setCustomBank(e.target.value)} placeholder="Bank name..." style={inpS} onFocus={e=>e.target.style.borderColor="#1abc9c"} onBlur={e=>e.target.style.borderColor=th.inputBorder}/>
                  </div>
                )}
                <FInput label={t.accountNumber||"Account Number"} value={form.accountNumber} onChange={f("accountNumber")} placeholder="e.g. 0123-456789"/>
              </>
            )}

            {/* Wallet selector */}
            {isWallet && (
              <>
                <div>
                  <label style={{color:th.textMuted,fontSize:11,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8,display:"block"}}>{isUrdu?"والٹ سروس":"Wallet Service"} <span style={{color:"#f87171"}}>*</span></label>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    {["EasyPaisa","JazzCash","SadaPay","NayaPay","UPaisa","Other / Custom"].map(w=>{
                      const ws2 = WALLET_BRANDS[w];
                      const sel = form.bankName===w;
                      return (
                        <button key={w} onClick={()=>{f("bankName")(w);if(w!=="Other / Custom")setCustomBank("");}} style={{padding:"10px 8px",borderRadius:12,border:`2px solid ${sel?ws2.color:th.border}`,background:sel?`${ws2.color}18`:"transparent",color:sel?ws2.color:th.textMuted,cursor:"pointer",fontWeight:700,fontSize:12,display:"flex",alignItems:"center",gap:8}}>
                          <span style={{fontSize:18}}>{ws2.icon}</span><span>{w}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                {form.bankName==="Other / Custom" && (
                  <div>
                    <label style={{color:th.textMuted,fontSize:11,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:5,display:"block"}}>{isUrdu?"کسٹم والٹ":"Custom Wallet"}</label>
                    <input value={customBank} onChange={e=>setCustomBank(e.target.value)} placeholder="Wallet name..." style={inpS} onFocus={e=>e.target.style.borderColor="#1abc9c"} onBlur={e=>e.target.style.borderColor=th.inputBorder}/>
                  </div>
                )}
                <FInput label={isUrdu?"موبائل نمبر":"Mobile Number"} value={form.accountNumber} onChange={f("accountNumber")} placeholder="e.g. 03001234567"/>
              </>
            )}

            <FInput
              label={(isBank||isWallet) ? (isUrdu?"لیبل (اختیاری)":"Label (optional)") : ((t.accountName||"Account Name")+" *")}
              value={form.name}
              onChange={f("name")}
              placeholder={isBank?(isUrdu?"مثلاً میرا HBL":"e.g. My HBL"):isWallet?(isUrdu?"مثلاً میرا EasyPaisa":"e.g. My EasyPaisa"):(isUrdu?"مثلاً دکان کیش":"e.g. Shop Cash")}
              required={!isBank && !isWallet}
            />

            <div>
              <label style={{color:th.textMuted,fontSize:11,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:5,display:"block"}}>{t.openingBalance||"Opening Balance"}</label>
              <div style={{position:"relative"}}>
                <span style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",color:th.textMuted,fontSize:13,fontWeight:600}}>Rs</span>
                <input type="number" value={form.openingBalance} onChange={e=>f("openingBalance")(e.target.value)} placeholder="0" min="0" step="1" style={{...inpS,paddingLeft:40,border:"2px solid rgba(26,188,156,0.3)"}} onFocus={e=>e.target.style.borderColor="#1abc9c"} onBlur={e=>e.target.style.borderColor="rgba(26,188,156,0.3)"}/>
              </div>
              {form.openingBalance && Number(form.openingBalance)>0 && <p style={{color:"#34d399",fontSize:12,margin:"4px 0 0"}}>{formatPKR(form.openingBalance)}</p>}
            </div>

            <div>
              <label style={{color:th.textMuted,fontSize:11,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:5,display:"block"}}>{isUrdu?"نوٹ (اختیاری)":"Notes (optional)"}</label>
              <textarea value={form.notes} onChange={e=>f("notes")(e.target.value)} placeholder={isUrdu?"کوئی نوٹ...":"Any notes..."} rows={2} style={{...inpS,resize:"vertical"}} onFocus={e=>e.target.style.borderColor="#1abc9c"} onBlur={e=>e.target.style.borderColor=th.inputBorder}/>
            </div>

            <SaveBtn label={saving?"...":(editing?(t.update||"Update"):(t.addAccount||"Add Account"))} onClick={handleSave} loading={saving} disabled={!canSave}/>
          </div>
        </Modal>
      )}
    </div>
  );
}


export default AccountsPage;
