import { useState } from "react";
import { useTheme } from "../context/ThemeContext";
import { useLang } from "../context/LangContext";
import { useResponsive, Icon, ICONS, Modal, StatCard, Table } from "../components/shared";
import { api } from "../utils/api";
import { formatPKR, todayStr, loadShopProfile, pxToPageHeightMM } from "../utils/helpers";
import { safeProductName } from "../utils/constants";
import { BillingNewSaleModal, BillingSaleInvoice, getPaymentBadgeStyle } from "./BillingPage";

// ═══════════════════════════════════════════════════════════════════════════
// SALES PAGE — Fixed: th (useTheme) was missing in SaleThermalInvoice
// causing crash on Print button click → blank page on print.
// ═══════════════════════════════════════════════════════════════════════════

const saleThermalPrintStyles = `@media print{body *{visibility:hidden !important;}#sale-thermal-invoice,#sale-thermal-invoice *{visibility:visible !important;font-weight:900 !important;}#sale-thermal-invoice{position:fixed !important;left:50% !important;top:0 !important;transform:translateX(-50%) !important;width:63mm !important;max-width:63mm !important;margin:0 !important;padding:1mm !important;box-sizing:border-box !important;overflow:hidden !important;}@page{margin:0;}html,body{width:65mm !important;max-width:65mm !important;margin:0 !important;padding:0 !important;overflow-x:hidden !important;}button{display:none !important;}}`;

function SaleThermalInvoice({ invoiceData, onClose }) {
  // ✅ FIX: th was missing — Close button used th.border / th.bgCard / th.textMuted
  // which caused a ReferenceError crash on render, making print go blank.
  const th = useTheme();

  const handlePrint = () => {
    const existing = document.getElementById("print-portal-overlay");
    if (existing) document.body.removeChild(existing);

    const portal = document.createElement("div");
    portal.id = "print-portal-overlay";
    portal.style.cssText = [
      "position:fixed","top:0","left:0","width:0","height:0",
      "overflow:hidden","z-index:-1","pointer-events:none"
    ].join(";");

    const invoiceEl = document.getElementById("sale-thermal-invoice");
    // ✅ FIX: guard — if element not found, abort silently instead of crashing
    if (!invoiceEl) {
      console.warn("SaleThermalInvoice: #sale-thermal-invoice not found in DOM");
      return;
    }

    const clone = invoiceEl.cloneNode(true);
    clone.id = "sale-thermal-invoice-print";
    clone.style.cssText = [
      "width:63mm","max-width:63mm","font-family:'Courier New',Courier,monospace",
      "font-size:12px","color:#000","background:#fff",
      "padding:1mm","box-sizing:border-box",
      "margin:0","overflow:hidden","font-weight:900"
    ].join(";");
    portal.appendChild(clone);
    document.body.appendChild(portal);

    // Measure the actual rendered receipt height (now that it's in the DOM)
    // and give the @page rule an explicit height in mm. "65mm auto" is not
    // valid CSS, so browsers fell back to their default page size and long
    // invoices (many line items) got cut off after roughly one default page.
    const pageHeightMM = pxToPageHeightMM(clone);

    const styleEl = document.createElement("style");
    styleEl.id = "print-portal-style";
    styleEl.innerHTML = `
      @page { size: 65mm ${pageHeightMM}mm; margin: 0; }
      @media print {
        html, body { width:65mm !important; max-width:65mm !important; margin:0 !important; padding:0 !important; overflow-x:hidden !important; }
        body * { visibility: hidden !important; }
        #sale-thermal-invoice-print, #sale-thermal-invoice-print * { visibility: visible !important; }
        #print-portal-overlay {
          position: fixed !important; top:0 !important; left:50% !important;
          transform: translateX(-50%) !important;
          width:63mm !important; max-width:63mm !important;
          height:auto !important; overflow:hidden !important;
          z-index:99999 !important; margin:0 !important; box-sizing:border-box !important;
        }
        #sale-thermal-invoice-print {
          position:static !important; margin:0 !important;
          width:63mm !important; max-width:63mm !important; box-sizing:border-box !important;
        }
        #sale-thermal-invoice-print * { box-sizing:border-box !important; font-weight:900 !important; max-width:100% !important; }
        button { display: none !important; }
      }
    `;

    document.body.appendChild(styleEl);
    window.print();

    setTimeout(() => {
      const p  = document.getElementById("print-portal-overlay");
      const st = document.getElementById("print-portal-style");
      if (p)  document.body.removeChild(p);
      if (st) document.body.removeChild(st);
    }, 1000);
  };

  const { invoice, date, customer, productName, category, qty, rate, total } = invoiceData;
  const sp = loadShopProfile();
  const ownerLines = sp.owners.filter(o => o.name || o.nameUr);

  const s = {
    page:    { width:"63mm", maxWidth:"63mm", fontFamily:"'Courier New',Courier,monospace", fontSize:"12px", color:"#000", fontWeight:"900", background:"#fff", padding:"1mm", boxSizing:"border-box", overflow:"hidden", margin:"0 auto" },
    center:  { textAlign:"center", fontWeight:"900" },
    bold:    { fontWeight:"900" },
    divider: { borderTop:"1px dashed #000", margin:"4px 0" },
    total:   { display:"flex", justifyContent:"space-between", fontWeight:"900", fontSize:"14px", padding:"3px 0" },
    footer:  { fontSize:"11px", color:"#000", textAlign:"center", marginTop:2, fontWeight:"900" },
  };

  return (
    <>
      <style>{saleThermalPrintStyles}</style>
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:16 }}>
        <div style={{ display:"flex", gap:10, width:"100%" }}>
          <button onClick={handlePrint}
            style={{ flex:1, padding:"10px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#1abc9c,#2980b9)", color:"white", fontWeight:700, fontSize:13, cursor:"pointer" }}>
            🖨️ Print Invoice
          </button>
          {/* ✅ FIX: was using th.border / th.bgCard / th.textMuted without th defined */}
          <button onClick={onClose}
            style={{ padding:"10px 18px", borderRadius:10, border:`1px solid ${th.border}`, background:th.bgCard, color:th.textMuted, fontWeight:600, fontSize:13, cursor:"pointer" }}>
            ✕ Close
          </button>
        </div>

        <div style={{ background:"#f5f5f5", padding:"3px", borderRadius:12, border:"1px solid #ddd", width:"100%", maxWidth:"320px", overflowX:"hidden", boxSizing:"border-box", display:"flex", justifyContent:"center" }}>
          <div id="sale-thermal-invoice" style={s.page}>
            {sp.logoBase64 && (
              <div style={{...s.center,marginBottom:4}}>
                <img src={sp.logoBase64} alt="logo" style={{maxWidth:60,maxHeight:45,objectFit:"contain"}}/>
              </div>
            )}
            <div style={{ ...s.center, ...s.bold, fontSize:"17px", letterSpacing:"0.5px", fontWeight:"900" }}>{sp.shopName}</div>
            {ownerLines[0] && <div style={{ ...s.center, fontSize:"11px", marginTop:4, fontWeight:"900" }}>{ownerLines[0].name}: {ownerLines[0].phone}</div>}
            {ownerLines[1] && <div style={{ ...s.center, fontSize:"11px", marginTop:2, fontWeight:"900" }}>{ownerLines[1].name}: {ownerLines[1].phone}</div>}
            {ownerLines[2] && <div style={{ ...s.center, fontSize:"11px", marginTop:2, fontWeight:"900" }}>{ownerLines[2].name}: {ownerLines[2].phone}</div>}
            <div style={{ ...s.center, fontSize:"10px", marginTop:3, fontWeight:"900" }}>{sp.address}</div>
            <div style={{ ...s.center, fontSize:"10px", marginTop:2, fontWeight:"900" }}>
              {new Date(date).toLocaleDateString("en-PK", { day:"2-digit", month:"short", year:"numeric" })}
            </div>
            <div style={s.divider}/>
            <div style={{ ...s.center, ...s.bold, fontSize:"13px", fontWeight:"900" }}>★ SALE INVOICE ★</div>
            <div style={s.divider}/>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:"11px", padding:"2px 0", fontWeight:"900" }}>
              <span style={{ fontWeight:"900" }}>Invoice#:</span>
              <span style={{ fontWeight:"900" }}>{invoice}</span>
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:"11px", padding:"2px 0", fontWeight:"900" }}>
              <span style={{ fontWeight:"900" }}>Customer:</span>
              <span style={{ fontWeight:"900", maxWidth:120, textAlign:"right", wordBreak:"break-word" }}>{customer}</span>
            </div>
            <div style={s.divider}/>
            <div style={{ fontWeight:"900", fontSize:"12px", marginBottom:3 }}>
              {productName}
              {category && <span style={{ fontWeight:"900", fontSize:"10px", marginLeft:5 }}>[{category}]</span>}
            </div>
            <table style={{ width:"100%", borderCollapse:"collapse", tableLayout:"fixed" }}>
              <colgroup>
                <col style={{ width:"50%" }}/>
                <col style={{ width:"50%" }}/>
              </colgroup>
              <thead>
                <tr style={{ borderTop:"1.5px solid #000", borderBottom:"1.5px solid #000" }}>
                  <th style={{ fontSize:"10px", fontWeight:"900", padding:"2px 0", textAlign:"left" }}>Description</th>
                  <th style={{ fontSize:"10px", fontWeight:"900", padding:"2px 0", textAlign:"right" }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom:"1px dotted #000" }}>
                  <td style={{ fontSize:"10px", fontWeight:"900", padding:"2px 0", overflow:"hidden", wordBreak:"break-all" }}>{qty} pc @ {formatPKR(rate)}</td>
                  <td style={{ fontSize:"10px", fontWeight:"900", padding:"2px 0", textAlign:"right", overflow:"hidden" }}>{formatPKR(total)}</td>
                </tr>
              </tbody>
            </table>
            <div style={s.divider}/>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:"11px", padding:"2px 0", fontWeight:"900" }}>
              <span style={{ fontWeight:"900" }}>Total Qty:</span>
              <span style={{ fontWeight:"900" }}>{qty} pc</span>
            </div>
            <div style={s.divider}/>
            <div style={s.total}>
              <span style={{ fontWeight:"900" }}>TOTAL:</span>
              <span style={{ fontWeight:"900" }}>{formatPKR(total)}</span>
            </div>
            <div style={s.divider}/>
            <div style={{ ...s.center, fontSize:"11px", fontWeight:"900", marginTop:4 }}>Thank You! Visit Again</div>
            <div style={{ ...s.center, fontSize:"10px", fontWeight:"900", marginTop:2 }}>
              {new Date().toLocaleTimeString("en-PK", { hour:"2-digit", minute:"2-digit" })}
            </div>
            <div style={s.divider}/>
            <div style={s.footer}>okiiee Software Company</div>
            <div style={{ ...s.footer, fontSize:"10px", fontWeight:"900" }}>For software contact:</div>
            <div style={{ ...s.footer, fontSize:"12px", fontWeight:"900", letterSpacing:"0.3px" }}>03057903867</div>
          </div>
        </div>
      </div>
    </>
  );
}

function SalesPage({ sales, products, loadSales, loadProducts, loaders=[] }) {
  const th = useTheme();
  const { t, lang } = useLang();
  const { isMobile } = useResponsive();
  const isUrdu = lang === "ur";

  const [showSaleModal, setShowSaleModal] = useState(false);
  const [reprintData,   setReprintData]   = useState(null);
  const [editData,      setEditData]      = useState(null);

  const today2       = todayStr();
  const todaySales   = sales.filter(s => s.date === today2);
  const todayRevenue = todaySales.reduce((s, x) => s + (x.total || 0), 0);

  const buildItemsFromSale = (s) => {
    if (s.items && s.items.length > 0) return s.items;
    const cat   = s.category || "";
    const qty   = Number(s.qty)   || 0;
    const rate  = Number(s.rate)  || 0;
    const total = Number(s.total) || 0;
    const name  = s.productName || safeProductName(s.product) || "Item";
    let desc = "";
    if (cat === "Pipe")        desc = `${qty}pc × Rs${rate}/pc`;
    else if (cat === "Chader") desc = `${qty}kg × Rs${rate}/kg`;
    else if (cat === "Net")    desc = `${qty}ft × Rs${rate}/ft`;
    else                       desc = `${qty}pc × Rs${rate}/pc`;
    return [{ productName: name, category: cat, rows: [{ desc, amount: total }], subtotal: total }];
  };

  const handleSave = async (payload) => {
    const firstProductName = payload.items[0]?.productName;
    const foundProduct     = products.find(p => p.name === firstProductName);
    const productId        = foundProduct ? (foundProduct._id || foundProduct.id) : undefined;

    const buildRowsFromItems = (items) => {
      const allRows = [];
      items.forEach(item => {
        const cat  = item.category || "";
        const prod = products.find(p => p.name === item.productName);
        const pp   = prod?.price || 0;
        if (cat === "Pipe") {
          const r = item.rows[0]; const desc = r?.desc || "";
          const qM = desc.match(/^(\d+\.?\d*)pc/); const pM = desc.match(/Rs(\d+\.?\d*)\/pc/);
          allRows.push({ _id:Date.now()+Math.random(), length:0, quantity:qM?parseFloat(qM[1]):0, purchasePercentage:0, salePrice:pM?parseFloat(pM[1]):0 });
        } else if (cat === "Chader") {
          const r = item.rows[0]; const desc = r?.desc || "";
          const wM = desc.match(/^(\d+\.?\d*)kg/); const pM = desc.match(/Rs(\d+\.?\d*)\/kg/);
          allRows.push({ _id:Date.now()+Math.random(), weight:wM?parseFloat(wM[1]):0, purchasePrice:0, salePrice:pM?parseFloat(pM[1]):pp });
        } else if (cat === "Net") {
          const r = item.rows[0]; const desc = r?.desc || "";
          const fM = desc.match(/^(\d+\.?\d*)ft/); const pM = desc.match(/Rs(\d+\.?\d*)\/ft/); const wM = desc.match(/ft×([^×]+)×/);
          allRows.push({ _id:Date.now()+Math.random(), feet:fM?parseFloat(fM[1]):0, width:wM?wM[1].trim():"", purchasePricePerFeet:0, salePricePerFeet:pM?parseFloat(pM[1]):pp });
        } else {
          const r = item.rows[0]; const desc = r?.desc || "";
          const qM = desc.match(/^(\d+\.?\d*)pc/); const pM = desc.match(/Rs(\d+\.?\d*)\/pc/);
          allRows.push({ _id:Date.now()+Math.random(), qty:qM?parseFloat(qM[1]):0, purchasePrice:0, salePrice:pM?parseFloat(pM[1]):pp });
        }
      });
      return allRows;
    };

    const resolvedRows = buildRowsFromItems(payload.items);
    let totalQty = 0;
    payload.items.forEach(item => {
      const cat = item.category || ""; const r = item.rows[0]; const desc = r?.desc || "";
      if (cat==="Pipe")        { const m=desc.match(/^(\d+\.?\d*)pc/); totalQty+=m?parseFloat(m[1]):0; }
      else if (cat==="Chader") { const m=desc.match(/^(\d+\.?\d*)kg/); totalQty+=m?parseFloat(m[1]):0; }
      else if (cat==="Net")    { const m=desc.match(/^(\d+\.?\d*)ft/); totalQty+=m?parseFloat(m[1]):0; }
      else                     { const m=desc.match(/^(\d+\.?\d*)pc/); totalQty+=m?parseFloat(m[1]):0; }
    });

    // Build a clean productId+qty list for EVERY product in this sale (not just the
    // first one) so the backend can check & deduct stock correctly for each product.
    const saleItems = payload.items.map(item => ({
      productId: item.productId || (products.find(p => p.name === item.productName)?._id
                  || products.find(p => p.name === item.productName)?.id || ""),
      qty: Number(item.qty) || 0,
    })).filter(si => si.productId && si.qty > 0);

    const saleData = {
      invoice:payload.invoice, date:payload.date, customer:payload.customer,
      paymentMethod:payload.paymentMethod, bankName:payload.bankName,
      total:payload.total, grandTotal:payload.grandTotal,
      loaderFee:Number(payload.loaderFee)||0, bindingFee:Number(payload.bindingFee)||0,
      items:payload.items, rows:resolvedRows,
      saleItems,
      loaderName:payload.loaderName||"", product:productId,
      productName:firstProductName||"", qty:totalQty||1,
      rate:totalQty>0?payload.grandTotal/totalQty:payload.grandTotal,
      category:payload.items[0]?.category||"",
      isPartial:payload.isPartial||false,
      paidAmount:payload.paidAmount||payload.total,
      remainingAmount:payload.remainingAmount||0,
    };

    let res;
    if (editData) res = await api.updateSale(editData._id, saleData);
    else          res = await api.addSale(saleData);

    if (res.success) { await loadSales(); await loadProducts(); }
    return res;
  };

  const openEdit   = (s) => { setEditData(s); setShowSaleModal(true); };
  const openAdd    = ()  => { setEditData(null); setShowSaleModal(true); };
  const closeModal = ()  => { setShowSaleModal(false); setEditData(null); };

  const del = async (s) => {
    if (!window.confirm(t.deleteSaleConfirm || (isUrdu ? "کیا آپ یہ فروخت حذف کرنا چاہتے ہیں؟" : "Delete this sale?"))) return;
    const res = await api.deleteSale(s._id);
    if (res.success) { await loadSales(); await loadProducts(); }
    else alert(res.message);
  };

  const handleReprint = (s) => {
    const items      = buildItemsFromSale(s);
    const grandTotal = Number(s.grandTotal) || Number(s.total) || items.reduce((sum,i)=>sum+(i.subtotal||0),0);
    setReprintData({
      invoice: s.invoice, date: s.date, customer: s.customer,
      items, grandTotal,
      paymentMethod: s.paymentMethod || "cash",
      bankName:      s.bankName      || "",
      loaderName:    s.loaderName    || "",
      loaderFee:     s.loaderFee     || 0,
      bindingFee:    s.bindingFee    || 0,
      isPartial:      s.isPartial      || false,
      paidAmount:     Number(s.paidAmount)     || grandTotal,
      remainingAmount:Number(s.remainingAmount)|| 0,
    });
  };

  const buildEditPayload = (s) => {
    const items = buildItemsFromSale(s);
    return {
      invoice: s.invoice, date: s.date, customer: s.customer,
      paymentMethod: s.paymentMethod || "cash", bankName: s.bankName || "",
      items, grandTotal: Number(s.grandTotal) || Number(s.total) || 0,
      total: Number(s.total) || 0, loaderFee: Number(s.loaderFee) || 0,
      bindingFee: Number(s.bindingFee) || 0,
      loader: s.loaderName ? { name: s.loaderName, fee: s.loaderFee || 0 } : null,
      isPartial:       s.isPartial       || false,
      paidAmount:      Number(s.paidAmount)      || Number(s.total) || 0,
      remainingAmount: Number(s.remainingAmount) || 0,
    };
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

      {/* Stat cards */}
      <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr 1fr":"repeat(auto-fit,minmax(180px,1fr))", gap:12 }}>
        <StatCard label={isUrdu?"آج کی آمدنی":t.todayRevenue||"Today Revenue"} value={formatPKR(todayRevenue)} icon={ICONS.trend_up} color="#1abc9c" sub={`${todaySales.length} ${isUrdu?"آج کی فروخت":"today's sales"}`}/>
        <StatCard label={isUrdu?"دستیاب اشیاء":t.productsInStock||"In Stock"} value={products.filter(p=>p.stock>0).length} icon={ICONS.box} color="#9b59b6"/>
        <StatCard label={isUrdu?"بائنڈنگ مزدوری":"Binding Fee"} value={formatPKR(sales.reduce((s,p)=>s+(Number(p.bindingFee)||0),0))} icon={ICONS.invoice} color="#fbbf24" sub={`${sales.filter(p=>Number(p.bindingFee)>0).length} ${isUrdu?"invoices":"invoices"}`}/>
      </div>

      {/* Header row */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <h3 style={{ color:th.text, fontWeight:700, margin:0, fontSize:17 }}>{isUrdu?"فروخت کا ریکارڈ":t.salesRecords||"Sales Records"}</h3>
        <button onClick={openAdd}
          style={{ display:"flex", alignItems:"center", gap:6, padding:isMobile?"10px 14px":"12px 20px", borderRadius:12, border:"none", cursor:"pointer", background:"linear-gradient(135deg,#1abc9c,#2980b9)", color:"white", fontWeight:700, fontSize:14 }}>
          <Icon path={ICONS.plus} size={16}/>{isUrdu?"نئی فروخت / انوائس":t.newSaleInvoice||"New Sale / Invoice"}
        </button>
      </div>

      {/* Sales table — wrapped for horizontal scroll to prevent page stretch */}
      <div style={{ width:"100%", overflowX:"auto" }}>
        <Table
          cols={[t.invoiceNum, t.date, t.customer, t.products, t.totalLabel, "💳", "💰", isUrdu?"بائنڈنگ":"Binding", isUrdu?"کس نے فروخت کی":"Sold By", "🖨️"]}
          rows={[...sales].reverse().map(s=>({
            data:s,
            cells:[
              <span style={{fontFamily:"monospace",color:"#34d399",fontSize:13}}>{s.invoice}</span>,
              s.date,
              <span style={{display:"inline-block",maxWidth:130,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",verticalAlign:"bottom"}} title={s.customer}>{s.customer}</span>,
              <span style={{display:"inline-block",maxWidth:150,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",verticalAlign:"bottom"}} title={s.productName||safeProductName(s.product)||(s.items?.[0]?.productName)||"—"}>
                {s.productName||safeProductName(s.product)||(s.items?.[0]?.productName)||"—"}
              </span>,
              <span style={{fontWeight:700,color:th.text}}>{formatPKR(s.total)}</span>,
              <span style={{ fontSize:12, padding:"2px 8px", borderRadius:20, fontWeight:600, whiteSpace:"nowrap", ...getPaymentBadgeStyle(s.paymentMethod) }}>
                {s.paymentMethod==="bank"?`🏦 ${s.bankName||"Bank"}`:s.paymentMethod==="jazzcash"?"🎵 JazzCash":s.paymentMethod==="easypaisa"?"📱 Easypaisa":"💵 Cash"}
              </span>,
              s.isPartial
                ? <span style={{fontSize:11,padding:"2px 7px",borderRadius:20,background:"rgba(248,113,113,0.15)",color:"#f87171",fontWeight:700,whiteSpace:"nowrap"}}>⏳ {formatPKR(s.remainingAmount||0)} {isUrdu?"باقی":"due"}</span>
                : <span style={{fontSize:11,padding:"2px 7px",borderRadius:20,background:"rgba(52,211,153,0.12)",color:"#34d399",fontWeight:600,whiteSpace:"nowrap"}}>✅ {isUrdu?"مکمل":"Paid"}</span>,
              Number(s.bindingFee) > 0
                ? <span style={{fontSize:11,padding:"2px 7px",borderRadius:20,background:"rgba(251,191,36,0.15)",color:"#fbbf24",fontWeight:700,whiteSpace:"nowrap"}}>🧵 {formatPKR(s.bindingFee)}</span>
                : <span style={{fontSize:12,color:th.textDim}}>—</span>,
              (()=>{
                const seller = s.createdBy;
                const name   = seller?.name  || s.staffName  || "";
                const email  = seller?.email || s.staffEmail || "";
                const isAdm  = !seller || seller.role === "admin";
                return (
                  <div style={{display:"flex",flexDirection:"column",gap:2,maxWidth:130}}>
                    <span style={{fontWeight:700,fontSize:13,color:isAdm?"#f59e0b":"#a78bfa",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={name}>
                      {isAdm?"👑 ":"👤 "}{name||(isAdm?(isUrdu?"منتظم":"Admin"):(isUrdu?"عملہ":"Staff"))}
                    </span>
                    {email && <span style={{fontSize:11,color:th.textMuted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={email}>{email}</span>}
                  </div>
                );
              })(),
              <button onClick={()=>handleReprint(s)}
                style={{background:"rgba(96,165,250,0.12)",border:"none",borderRadius:6,color:"#60a5fa",cursor:"pointer",padding:"4px 10px",fontSize:13}}
                onMouseEnter={e=>e.currentTarget.style.background="rgba(96,165,250,0.25)"}
                onMouseLeave={e=>e.currentTarget.style.background="rgba(96,165,250,0.12)"}>🖨️</button>,
            ]
          }))}
          onEdit={openEdit}
          onDelete={del}
        />
      </div>

      {/* New / Edit sale modal */}
      {showSaleModal && (
        <Modal
          title={editData ? (isUrdu?"Sale ترمیم کریں":"Edit Sale") : (isUrdu?"نئی Sale — Invoice بنائیں":"New Sale — Create Invoice")}
          onClose={closeModal}
          wide
        >
          <BillingNewSaleModal
            products={products}
            onSave={handleSave}
            onClose={closeModal}
            isUrdu={isUrdu}
            prefill={editData ? buildEditPayload(editData) : null}
            loaders={loaders}
          />
        </Modal>
      )}

      {/* Reprint modal — uses BillingSaleInvoice from BillingPage (full detailed invoice) */}
      {reprintData && (
        <Modal title={isUrdu?"🖨️ رسید":"🖨️ Invoice"} onClose={()=>setReprintData(null)}>
          <BillingSaleInvoice invoiceData={reprintData} onClose={()=>setReprintData(null)} isUrdu={isUrdu}/>
        </Modal>
      )}
    </div>
  );
}

export default SalesPage;