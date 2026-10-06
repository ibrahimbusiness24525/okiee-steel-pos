import { useState } from "react";
import { useTheme } from "../context/ThemeContext";
import { useLang } from "../context/LangContext";
import { useResponsive, Icon, ICONS, Modal, StatCard, Table, DateFilterBar, EditHistoryModal } from "../components/shared";
import { api } from "../utils/api";
import { saveSaleReturn, removeSaleReturn, netSaleAmount, saleReturnedAmount, netSaleItems } from "../utils/returnsStore";
import { formatPKR, todayStr, printThermalOrA4, inDateFilter } from "../utils/helpers";
import { safeProductName } from "../utils/constants";
import { BillingNewSaleModal, BillingSaleInvoice, getPaymentBadgeStyle, SaleRecordDetail } from "./BillingPage";
import { SaleReturnModal, ReturnsTable } from "../components/StockReturns";
import { reverseTradeFinance } from "../utils/tradeFinance";
import {
  thermalPrintStyles,
  slipPage,
  ThermalSlipHeader,
  ThermalSlipMeta,
  ThermalSlipItemsTable,
  ThermalSlipTotals,
  ThermalSlipFooter,
  packLabel,
  saleTypeLabel,
  saleReceiptTitle,
} from "../components/ThermalSlipTheme";

// ═══════════════════════════════════════════════════════════════════════════
// SALES PAGE
// ═══════════════════════════════════════════════════════════════════════════

function SaleThermalInvoice({ invoiceData, onClose }) {
  const th = useTheme();
  const {
    invoice, date, customer, productName, category, qty, rate, total,
    paymentMethod, settlement, isPartial, paidAmount, remainingAmount,
    cashReceived, changeDue, discount,
  } = invoiceData;
  const rem = Number(remainingAmount) || 0;
  const creditLike = paymentMethod === "credit"
    || settlement === "credit"
    || settlement === "partial"
    || !!isPartial
    || rem > 0.009;
  const cashIn = Number(cashReceived) || 0;

  return (
    <>
      <style>{thermalPrintStyles}</style>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
        <div style={{ display: "flex", gap: 10, width: "100%" }}>
          <button onClick={() => printThermalOrA4("thermal")}
            style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#1abc9c,#2980b9)", color: "white", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            🖨️ Print Invoice
          </button>
          <button onClick={onClose}
            style={{ padding: "10px 18px", borderRadius: 10, border: `1px solid ${th.border}`, background: th.bgCard, color: th.textMuted, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
            ✕ Close
          </button>
        </div>

        <div style={{ background: "#f5f5f5", padding: "14px", borderRadius: 12, border: "1px solid #ddd", width: "100%", overflowX: "auto", boxSizing: "border-box", display: "flex", justifyContent: "center" }}>
          <div id="thermal-invoice" style={slipPage}>
            <ThermalSlipHeader title={saleReceiptTitle({ isCredit: creditLike, isUrdu: false })} isUrdu={false} />
            <ThermalSlipMeta
              billNo={invoice}
              date={date}
              partyLabel="Customer"
              partyName={customer}
              cashSaleLabel={saleTypeLabel({
                invoice, paymentMethod, settlement, remainingAmount: rem, isPartial: creditLike, isUrdu: false,
              })}
              isUrdu={false}
            />
            <ThermalSlipItemsTable
              rows={[{
                item: productName || "—",
                pack: packLabel(category, `${qty}`),
                qty,
                price: rate,
                amount: total,
              }]}
            />
            <ThermalSlipTotals
              itemCount={1}
              gross={total}
              billAmount={total}
              discount={discount}
              cashReceived={cashIn > 0 ? cashIn : (creditLike ? 0 : total)}
              changeDue={changeDue || 0}
              paidAmount={paidAmount}
              remainingAmount={rem}
              isPartial={creditLike}
            />
            <ThermalSlipFooter role="admin" />
          </div>
        </div>
      </div>
    </>
  );
}

function SalesPage({ sales, products, loadSales, loadProducts, loaders=[], saleReturns=[], loadSaleReturns, purchases=[], purchaseReturns=[] }) {
  const th = useTheme();
  const { t, lang } = useLang();
  const { isMobile } = useResponsive();
  const isUrdu = lang === "ur";

  const [showSaleModal, setShowSaleModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showReturnsPopup, setShowReturnsPopup] = useState(false);
  const [reprintData,   setReprintData]   = useState(null);
  const [editData,      setEditData]      = useState(null);
  const [viewSale,      setViewSale]      = useState(null);
  const [historySale,   setHistorySale]   = useState(null);
  const [dateFilter,    setDateFilter]    = useState("today");
  const [customFrom,    setCustomFrom]    = useState("");
  const [customTo,      setCustomTo]      = useState("");
  const [saleSearch,    setSaleSearch]    = useState("");

  const saleRecency = (s) => {
    const t = Date.parse(s?.createdAt || s?.updatedAt || "");
    if (Number.isFinite(t)) return t;
    const id = String(s?._id || s?.id || "");
    if (/^[a-fA-F0-9]{24}$/.test(id)) return parseInt(id.slice(0, 8), 16) * 1000;
    const d = Date.parse(s?.date || "");
    return Number.isFinite(d) ? d : 0;
  };
  const recentSales = [...(sales || [])]
    .filter((s) => inDateFilter(s.date, dateFilter, customFrom, customTo, s.createdAt))
    .filter((s) => {
      const q = saleSearch.trim().toLowerCase();
      if (!q) return true;
      const names = [
        s.invoice, s.invoiceNum, s.customer, s.productName,
        safeProductName(s.product),
        ...(s.items || []).map((it) => it.productName),
      ].filter(Boolean).join(" ").toLowerCase();
      return names.includes(q);
    })
    .sort((a, b) => saleRecency(b) - saleRecency(a));
  const periodRevenue = recentSales.reduce((s, x) => s + netSaleAmount(x, saleReturns), 0);
  const periodLoaders = recentSales.reduce((s, x) => s + (Number(x.loaderFee) || 0), 0);
  const periodRevenueWithLoaders = periodRevenue + periodLoaders;
  const periodBinding = recentSales.reduce((s, p) => s + (Number(p.bindingFee) || 0), 0);
  const filterRevenueLabel = dateFilter === "today" ? (isUrdu ? "آج کی آمدنی" : (t.todayRevenue || "Today Revenue"))
    : dateFilter === "yesterday" ? (isUrdu ? "کل کی آمدنی" : "Yesterday Revenue")
    : dateFilter === "week" ? (isUrdu ? "ہفتہ کی آمدنی" : "Week Revenue")
    : dateFilter === "month" ? (isUrdu ? "مہینہ کی آمدنی" : "Month Revenue")
    : (isUrdu ? "آمدنی" : "Revenue");

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
      accountId:payload.accountId||"", accountName:payload.accountName||"", settlement:payload.settlement||"full",
      total:payload.total, grandTotal:payload.grandTotal,
      loaderFee:Number(payload.loaderFee)||0, bindingFee:Number(payload.bindingFee)||0,
      discount:Number(payload.discount)||0, cashReceived:Number(payload.cashReceived)||0, changeDue:Number(payload.changeDue)||0,
      discountType: payload.discountType || "pkr",
      discountPct: Number(payload.discountPct) || 0,
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
    if (res.success) {
      await reverseTradeFinance({
        kind: "sale",
        partyName: s.customer,
        invoice: s.invoice || s.invoiceNum,
        paid: s.paidAmount,
        accountId: s.accountId,
      });
      await loadSales(); await loadProducts(); await loadSaleReturns?.();
    }
    else alert(res.message);
  };

  const delReturn = async (r) => {
    if (!window.confirm(isUrdu ? "کیا یہ واپسی حذف کریں؟" : "Delete this return?")) return;
    const res = await removeSaleReturn(r._id);
    if (res.success) { await loadSaleReturns?.(); await loadProducts(); }
    else alert(res.message);
  };

  const handleReprint = (s) => {
    const items      = netSaleItems(s, saleReturns).filter((it) => !it.fullyReturned && (Number(it.subtotal) || 0) > 0.009);
    const fallback   = items.length ? items : buildItemsFromSale(s);
    const itemsSum   = items.reduce((sum, i) => sum + (Number(i.subtotal) || 0), 0);
    const disc       = Number(s.discount) || 0;
    const bind       = Number(s.bindingFee) || 0;
    const storedGt   = Number(s.grandTotal) || Number(s.total) || 0;
    const grandTotal = storedGt > 0
      ? storedGt
      : Math.max(0, Math.round((itemsSum + bind - disc) * 100) / 100);
    const rem = Number(s.remainingAmount) || 0;
    const settle = s.settlement || (s.isPartial || rem > 0.009
      ? ((Number(s.paidAmount) || 0) === 0 ? "credit" : "partial")
      : "full");
    setReprintData({
      invoice: s.invoice, date: s.date, customer: s.customer,
      items: fallback, grandTotal,
      paymentMethod: s.paymentMethod || "cash",
      bankName:      s.accountName || s.bankName || "",
      accountName:   s.accountName || "",
      settlement:    settle,
      loaderName:    s.loaderName    || "",
      loaderFee:     s.loaderFee     || 0,
      bindingFee:    s.bindingFee    || 0,
      discount:      s.discount      || 0,
      cashReceived:  s.cashReceived  || 0,
      changeDue:     s.changeDue     || 0,
      isPartial:     !!(s.isPartial || rem > 0.009 || settle === "credit" || settle === "partial"),
      paidAmount:    (settle === "credit" || settle === "partial" || s.isPartial || rem > 0.009)
        ? (Number(s.paidAmount) || 0)
        : (Number(s.paidAmount) || grandTotal),
      remainingAmount: rem,
    });
  };

  const buildEditPayload = (s) => {
    const items = buildItemsFromSale(s);
    return {
      invoice: s.invoice, date: s.date, customer: s.customer,
      paymentMethod: s.paymentMethod || "cash", bankName: s.bankName || "",
      accountId: s.accountId || "", accountName: s.accountName || "",
      settlement: s.settlement || (s.isPartial ? ((Number(s.paidAmount)||0)===0 ? "credit" : "partial") : "full"),
      items, grandTotal: Number(s.grandTotal) || Number(s.total) || 0,
      total: Number(s.total) || 0, loaderFee: Number(s.loaderFee) || 0,
      bindingFee: Number(s.bindingFee) || 0,
      discount: Number(s.discount) || 0,
      discountType: s.discountType || "pkr",
      discountPct: Number(s.discountPct) || 0,
      cashReceived: Number(s.cashReceived) || 0,
      changeDue: Number(s.changeDue) || 0,
      saleItems: s.saleItems || [],
      loader: s.loaderName ? { name: s.loaderName, fee: s.loaderFee || 0 } : null,
      isPartial:       s.isPartial       || false,
      paidAmount:      Number(s.paidAmount)      || Number(s.total) || 0,
      remainingAmount: Number(s.remainingAmount) || 0,
      isEdit: true,
    };
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

      {/* Stat cards */}
      <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr 1fr":"repeat(auto-fit,minmax(180px,1fr))", gap:12 }}>
        <StatCard label={filterRevenueLabel} value={formatPKR(periodRevenue)} icon={ICONS.trend_up} color="#1abc9c" sub={`${recentSales.length} ${isUrdu?"فروخت":"sales"}`}/>
        <StatCard
          label={isUrdu ? `${filterRevenueLabel} + لوڈر` : `${filterRevenueLabel} + Loaders`}
          value={formatPKR(periodRevenueWithLoaders)}
          icon={ICONS.trend_up}
          color="#8b5cf6"
          sub={periodLoaders > 0 ? `${isUrdu ? "لوڈر" : "Loaders"} ${formatPKR(periodLoaders)}` : (isUrdu ? "لوڈر نہیں" : "no loaders")}
        />
        <StatCard label={isUrdu?"دستیاب اشیاء":t.productsInStock||"In Stock"} value={products.filter(p=>p.stock>0).length} icon={ICONS.box} color="#9b59b6"/>
        <StatCard label={isUrdu?"بائنڈنگ مزدوری":"Binding Fee"} value={formatPKR(periodBinding)} icon={ICONS.invoice} color="#fbbf24" sub={`${recentSales.filter(p=>Number(p.bindingFee)>0).length} ${isUrdu?"invoices":"invoices"}`}/>
        <StatCard
          label={isUrdu ? "واپسی" : "Returns"}
          value={(saleReturns || []).length}
          icon={ICONS.trend_down}
          color="#ef4444"
          sub={isUrdu ? "کلک کرکے دیکھیں" : "Click to view"}
          onClick={() => setShowReturnsPopup(true)}
        />
      </div>

      {/* Header row */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:8 }}>
        <h3 style={{ color:th.text, fontWeight:700, margin:0, fontSize:17 }}>{isUrdu?"فروخت کا ریکارڈ":t.salesRecords||"Sales Records"}</h3>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          <button onClick={()=>setShowReturnModal(true)}
            style={{ display:"flex", alignItems:"center", gap:6, padding:isMobile?"10px 14px":"12px 18px", borderRadius:12, border:"none", cursor:"pointer", background:"linear-gradient(135deg,#059669,#34d399)", color:"white", fontWeight:700, fontSize:14 }}>
            ↩ {isUrdu?"فروخت واپسی":t.saleReturn}
          </button>
          <button onClick={openAdd}
            style={{ display:"flex", alignItems:"center", gap:6, padding:isMobile?"10px 14px":"12px 20px", borderRadius:12, border:"none", cursor:"pointer", background:"linear-gradient(135deg,#1abc9c,#2980b9)", color:"white", fontWeight:700, fontSize:14 }}>
            <Icon path={ICONS.plus} size={16}/>{isUrdu?"نئی فروخت / انوائس":t.newSaleInvoice||"New Sale / Invoice"}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", padding: "12px 14px", borderRadius: 14, border: `1px solid ${th.border}`, background: th.bgCard }}>
        <DateFilterBar
          filter={dateFilter}
          setFilter={setDateFilter}
          customFrom={customFrom}
          setCustomFrom={setCustomFrom}
          customTo={customTo}
          setCustomTo={setCustomTo}
          search={saleSearch}
          setSearch={setSaleSearch}
          searchPlaceholder={isUrdu ? "انوائس / گاہک / آئٹم" : "Invoice / customer / item"}
        />
      </div>

      {/* Sales table — wrapped for horizontal scroll to prevent page stretch */}
      <div style={{ width:"100%", overflowX:"auto" }}>
        <Table
          cols={[t.invoiceNum, t.date, t.customer, t.products, t.totalLabel, "💳", "💰", isUrdu?"بائنڈنگ":"Binding", isUrdu?"کس نے فروخت کی":"Sold By", "🖨️"]}
          rows={recentSales.map(s=>{
            const net = netSaleAmount(s, saleReturns);
            const retAmt = saleReturnedAmount(s, saleReturns);
            return {
            data:s,
            cells:[
              <span style={{fontFamily:"monospace",color:"#34d399",fontSize:13}}>{s.invoice}</span>,
              s.date,
              <span style={{display:"inline-block",maxWidth:130,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",verticalAlign:"bottom"}} title={s.customer}>{s.customer}</span>,
              <span style={{display:"inline-block",maxWidth:150,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",verticalAlign:"bottom"}} title={s.productName||safeProductName(s.product)||(s.items?.[0]?.productName)||"—"}>
                {s.productName||safeProductName(s.product)||(s.items?.[0]?.productName)||"—"}
              </span>,
              <div>
                <span style={{fontWeight:700,color:"#34d399"}}>{formatPKR(net)}</span>
                {retAmt>0 && (
                  <div style={{marginTop:4,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                    <span style={{fontSize:10,padding:"2px 7px",borderRadius:20,background:"rgba(239,68,68,0.16)",color:"#ef4444",fontWeight:800,letterSpacing:"0.03em"}}>
                      {isUrdu ? "واپسی" : "RETURN"}
                    </span>
                    <span style={{fontSize:11,color:"#f87171",fontWeight:700}}>{formatPKR(retAmt)}</span>
                    {net <= 0.009 && (
                      <span style={{fontSize:10,color:th.textMuted,fontWeight:600}}>{isUrdu ? "مکمل واپس" : "fully returned"}</span>
                    )}
                  </div>
                )}
              </div>,
              <span style={{ fontSize:12, padding:"2px 8px", borderRadius:20, fontWeight:600, whiteSpace:"nowrap", ...getPaymentBadgeStyle(s.paymentMethod) }}>
                {s.paymentMethod==="credit"?(isUrdu?"ادھار":"Credit"):s.paymentMethod==="bank"?`🏦 ${s.accountName||s.bankName||"Bank"}`:s.paymentMethod==="jazzcash"?"🎵 JazzCash":s.paymentMethod==="easypaisa"?"📱 Easypaisa":s.paymentMethod==="wallet"?`📱 ${s.accountName||s.bankName||"Wallet"}`:(s.accountName?`💵 ${s.accountName}`:"💵 Cash")}
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
              <button onClick={(e)=>{ e.stopPropagation(); handleReprint(s); }}
                style={{background:"rgba(96,165,250,0.12)",border:"none",borderRadius:6,color:"#60a5fa",cursor:"pointer",padding:"4px 10px",fontSize:13}}
                onMouseEnter={e=>e.currentTarget.style.background="rgba(96,165,250,0.25)"}
                onMouseLeave={e=>e.currentTarget.style.background="rgba(96,165,250,0.12)"}>🖨️</button>,
            ]
          };
          })}
          onEdit={openEdit}
          onHistory={(s) => setHistorySale(s)}
          onRowClick={(s) => setViewSale(s)}
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
            extraNames={sales.map(s => s.customer)}
            purchases={purchases}
            sales={sales}
            purchaseReturns={purchaseReturns}
            saleReturns={saleReturns}
          />
        </Modal>
      )}

      {historySale && (
        <EditHistoryModal
          title={isUrdu ? `ترمیم تاریخ · ${historySale.invoice || ""}` : `Edit history · ${historySale.invoice || ""}`}
          history={historySale.editHistory || []}
          onClose={() => setHistorySale(null)}
          isUrdu={isUrdu}
        />
      )}

      {showReturnModal && (
        <SaleReturnModal
          sales={sales}
          products={products}
          returns={saleReturns}
          onClose={()=>setShowReturnModal(false)}
          onSave={async (payload) => {
            const res = await saveSaleReturn(payload, { products, sales });
            if (res.success) { await loadSaleReturns?.(); await loadProducts(); }
            return res;
          }}
        />
      )}

      {showReturnsPopup && (
        <Modal title={isUrdu ? "فروخت واپسی کے ریکارڈ" : t.returnRecords} onClose={() => setShowReturnsPopup(false)} wide>
          <ReturnsTable returns={saleReturns} kind="sale" />
        </Modal>
      )}

      {viewSale && (
        <Modal title={isUrdu ? "فروخت تفصیل" : "Sale details"} onClose={() => setViewSale(null)}>
          <SaleRecordDetail sale={viewSale} saleReturns={saleReturns} isUrdu={isUrdu} />
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