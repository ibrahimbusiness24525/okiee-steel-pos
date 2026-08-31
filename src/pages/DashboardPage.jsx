import { CombinedSaleInvoice } from "../components/InvoiceComponents";
import { useState } from "react";
import { useTheme } from "../context/ThemeContext";
import { useLang } from "../context/LangContext";
import { useResponsive, Icon, ICONS, Modal, StatCard } from "../components/shared";
import { formatPKR, todayStr, loadShopProfile } from "../utils/helpers";
import { safeProductName } from "../utils/constants";

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD
function Dashboard({ products, purchases, sales, staff, loaders=[], saleReturns=[], purchaseReturns=[] }) {
  const th = useTheme();
  const { t, lang } = useLang();
  const { isMobile } = useResponsive();
  const isUrdu = lang === "ur";

  const [filter, setFilter] = useState("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [showProfitModal, setShowProfitModal] = useState(false);

  // ─── Two separate modal states ────────────────────────────────────────────────
  const [purchaseModal, setPurchaseModal] = useState(null);
  const [saleModal,     setSaleModal]     = useState(null);

  const today = new Date();
  const toDateStr = (d) => d.toISOString().split("T")[0];
  const todayStr2 = toDateStr(today);
  const weekStart = (() => { const d = new Date(today); d.setDate(d.getDate() - 6); return toDateStr(d); })();
  const monthStart = (() => { const d = new Date(today); d.setDate(1); return toDateStr(d); })();

  const parseDate = (str) => {
    if (!str) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    const parts = str.split(/[-\/]/);
    if (parts.length === 3) { if (parts[0].length === 4) return str; return `${parts[2]}-${parts[1].padStart(2,"0")}-${parts[0].padStart(2,"0")}`; }
    return str;
  };

  const inRange = (dateStr) => {
    const d = parseDate(dateStr); if (!d) return false;
    if (filter === "today")  return d === todayStr2;
    if (filter === "week")   return d >= weekStart && d <= todayStr2;
    if (filter === "month")  return d >= monthStart && d <= todayStr2;
    if (filter === "custom") { const from = customFrom || "0000-01-01"; const to = customTo || "9999-12-31"; return d >= from && d <= to; }
    return true;
  };

  const filteredSales     = sales.filter((s) => inRange(s.date));
  const filteredPurchases = purchases.filter((p) => inRange(p.date));
  const filteredSaleReturns = (saleReturns || []).filter((r) => inRange(r.date));
  const filteredPurchaseReturns = (purchaseReturns || []).filter((r) => inRange(r.date));

  const totalSalesCount    = filteredSales.length;
  const totalSalesAmount   = filteredSales.reduce((s, p) => s + (Number(p.total) || Number(p.grandTotal) || 0), 0)
    - filteredSaleReturns.reduce((s, r) => s + (Number(r.total) || 0), 0);
  const totalPurchaseCount = filteredPurchases.length;
  const totalPurchaseAmt   = filteredPurchases.reduce((s, p) => s + (Number(p.total) || Number(p.grandTotal) || 0), 0)
    - filteredPurchaseReturns.reduce((s, r) => s + (Number(r.total) || 0), 0);

  // ─── PROFIT / LOSS — per invoice, real margin ────────────────────────────────
  const calcInvoiceProfit = (sale, productsList) => {
    // sale.grandTotal / sale.total is the full bill charged to the customer, which now
    // includes the loader's fee. The loader fee is just passed through to the loader —
    // it is NOT shop revenue, so it must be excluded before computing profit.
    const billTotal    = Number(sale.grandTotal) || Number(sale.total) || 0;
    const loaderFeeAmt = Number(sale.loaderFee) || 0;
    // Binding mazdori (Chader binding labour charge) is also just passed through
    // to the customer's bill, not shop revenue — exclude it same as loaderFee.
    const bindingFeeAmt = Number(sale.bindingFee) || 0;
    const passThroughFees = loaderFeeAmt + bindingFeeAmt;

    let costAmt      = 0;
    let costedSaleAmt = 0; // sale value of ONLY the items that have real cost data
    let hasCost       = false;
    if (sale.items && sale.items.length > 0) {
      sale.items.forEach(item => {
        if (item.costTotal !== undefined && item.costTotal !== null && Number(item.costTotal) > 0) {
          let itemCost;
          const sub = Number(item.subtotal) || 0;
          if (item.category === "Pipe") {
            // For Pipe: profit is always the absolute difference (never a loss).
            // e.g. bought at 5, sold at 3 -> still counted as +2 profit, not 0 and not -2.
            const cost = Number(item.costTotal) || 0;
            const absProfit = Math.abs(sub - cost);
            itemCost = sub - absProfit; // so itemSaleAmt - itemCost === absProfit for this item
          } else {
            itemCost = Number(item.costTotal);
          }
          costAmt       += itemCost;
          costedSaleAmt += sub;
          hasCost = true;
        }
      });
    }

    // saleAmt used for profit must only reflect items that actually have cost
    // data — mixing in the full invoice total (including items with no
    // recorded purchase price) made profit look bigger than it really is,
    // since those items would add 100% to "profit" with 0 cost. Items with
    // no cost data are simply left out of the profit math entirely, on
    // both sides, so profit stays exact instead of inflated.
    // (When every item has cost data, costedSaleAmt already equals the full
    // product total, so this is equivalent to the old billTotal-based logic
    // for the common case — it only differs when some items are missing cost.)
    const saleAmt = hasCost ? costedSaleAmt : (billTotal - passThroughFees);
    return { saleAmt, costAmt, profit: saleAmt - costAmt, hasCost };
  };

  // Per-invoice profit rows (for detail modal)
  const invoiceProfitRows = filteredSales.map(s => {
    const { saleAmt, costAmt, profit, hasCost } = calcInvoiceProfit(s, products);
    return {
      invoice:  s.invoice || s.invoiceNum || "—",
      customer: s.customer || "—",
      date:     s.date || "—",
      saleAmt,
      costAmt,
      profit,
      hasCost,
      items:    s.items || [],
    };
  });

  // Only invoices that actually have cost data recorded (hasCost) can be
  // counted toward profit — an invoice with no cost data mixed into the sum
  // was previously adding its FULL sale amount to totalSaleForProfit while
  // contributing 0 to totalCostForProfit, which silently inflated the
  // headline Net Profit figure any time even one product/invoice was
  // missing a purchase price. Excluding those keeps profit exact and
  // consistent with the breakdown lists below (which already do this).
  const costedRows          = invoiceProfitRows.filter(r => r.hasCost);
  const totalSaleForProfit  = costedRows.reduce((a, r) => a + r.saleAmt, 0);
  const totalCostForProfit  = costedRows.reduce((a, r) => a + r.costAmt, 0);
  const overallProfit       = totalSaleForProfit - totalCostForProfit;
  const hasAnyCostData      = invoiceProfitRows.some(r => r.hasCost);

  // ─── Supplier grouping ────────────────────────────────────────────────────────
  const supplierMap = {};
  filteredPurchases.forEach((p) => {
    const key = p.supplier || p.supplierName || "Unknown";
    if (!supplierMap[key]) supplierMap[key] = { name: key, total: 0, count: 0, purchases: [] };
    supplierMap[key].total += p.total || 0;
    supplierMap[key].count += 1;
    supplierMap[key].purchases.push(p);
  });
  const filteredSuppliers = Object.values(supplierMap)
    .sort((a, b) => b.total - a.total)
    .filter((s) => s.name.toLowerCase().includes(supplierSearch.toLowerCase()));

  // ─── Customer grouping ────────────────────────────────────────────────────────
  const customerMap = {};
  filteredSales.forEach((s) => {
    const key = s.customer || "Unknown";
    if (!customerMap[key]) customerMap[key] = { name: key, total: 0, count: 0, sales: [] };
    customerMap[key].total += s.total || 0;
    customerMap[key].count += 1;
    customerMap[key].sales.push(s);
  });
  const filteredCustomers = Object.values(customerMap)
    .sort((a, b) => b.total - a.total)
    .filter((c) => c.name.toLowerCase().includes(customerSearch.toLowerCase()));

  const filterLabel = () => {
    if (filter==="today")  return t.today    || "Today";
    if (filter==="week")   return t.thisWeek || "This Week";
    if (filter==="month")  return t.thisMonth|| "This Month";
    if (filter==="custom" && customFrom && customTo) return `${customFrom} → ${customTo}`;
    return t.allTime || "All Time";
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // PURCHASE INVOICE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════
  const purchaseRowToDescAmt = (row, cat, purchasePrice) => {
    if (row.desc !== undefined && row.amount !== undefined) {
      return { desc: row.desc, amount: Number(row.amount) || 0 };
    }
    if (cat === "Pipe") {
      const length = parseFloat(String(row.length||"").replace(/[^0-9.]/g,"")) || 0;
      const pieces = Number(row.quantity) || 0;
      const pct    = Number(row.purchasePercentage) || 0;
      const pricePerFt = (Number(purchasePrice)||0) * (1 + pct/100);
      const pricePerPc = pricePerFt * length;
      const total      = pricePerPc * pieces;
      return { desc:`${pieces}pc × Rs${pricePerPc.toFixed(0)}/pc`, amount: total };
    }
    if (cat === "Chader") {
      const kg    = Number(row.weight) || 0;
      const price = Number(row.purchasePrice) || 0;
      return { desc:`${kg}kg × Rs${price}/kg`, amount: kg * price };
    }
    if (cat === "Net") {
      const ft    = Number(row.feet)   || 0;
      const width = Number(row.width)  || 0;
      const price = Number(row.purchasePricePerFeet) || 0;
      const total = ft * (width || 1) * price;
      const widthPart = width ? `ft×${width}ft×` : "ft×";
      return { desc:`${ft}${widthPart} Rs${price}/ft`, amount: total };
    }
    const qty   = Number(row.qty) || 0;
    const price = Number(row.purchasePrice) || 0;
    return { desc:`${qty}pc × Rs${price}/pc`, amount: qty * price };
  };

  const buildPurchaseFallbackDescRow = (p) => {
    const cat = p.category || "";
    const qty  = p.qty  || 0;
    const rate = p.rate || 0;
    if (cat === "Chader") return [{ desc:`${qty}kg × Rs${rate}/kg`,  amount: qty * rate }];
    if (cat === "Net")    return [{ desc:`${qty}ft × Rs${rate}/ft`,  amount: qty * rate }];
    if (cat === "Pipe")   return [{ desc:`${qty}pc × Rs${rate}/pc`,  amount: qty * rate }];
    return [{ desc:`${qty}pc × Rs${rate}/pc`, amount: qty * rate }];
  };

  const purchasesToInvoiceData = (purchaseList, invoiceTitle, supplierName) => {
    const itemMap = {};
    purchaseList.forEach((p) => {
      const productId      = typeof p.product === "object" ? p.product?._id : p.product;
      const matchedProduct = products.find(pr => pr._id === productId);
      const purchasePrice  = Number(p.productPrice) || Number(matchedProduct?.price) || (typeof p.product === "object" ? Number(p.product?.price) : 0) || 0;
      const cat            = p.category || "";
      const prodName       = p.productName || safeProductName(p.product) || "—";
      let descRows;
      if (p.rows && p.rows.length > 0) {
        descRows = p.rows.map(r => purchaseRowToDescAmt(r, cat, purchasePrice));
      } else {
        descRows = buildPurchaseFallbackDescRow(p);
      }
      const subtotal = descRows.reduce((a, r) => a + r.amount, 0);
      const key = `${prodName}__${cat}`;
      if (!itemMap[key]) {
        itemMap[key] = { productName: prodName, category: cat, rows: descRows, subtotal };
      } else {
        itemMap[key].rows    = [...itemMap[key].rows, ...descRows];
        itemMap[key].subtotal += subtotal;
      }
    });
    const items      = Object.values(itemMap);
    const grandTotal = items.reduce((a, i) => a + i.subtotal, 0);
    return {
      invoice:         invoiceTitle,
      date:            toDateStr(today),
      customer:        supplierName,
      items,
      grandTotal,
      paymentMethod:   purchaseList.find(p => p.paymentMethod)?.paymentMethod || "cash",
      bankName:        purchaseList.find(p => p.bankName)?.bankName || "",
      isPartial:       false,
      paidAmount:      grandTotal,
      remainingAmount: 0,
      loaderName:      "",
      loaderFee:       0,
      bindingFee:      0,
      isPurchase:      true,
    };
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // SALE INVOICE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════
  const buildSaleFallbackRows = (s) => {
    const cat = s.category || "";
    if (cat === "Chader") return [{ desc:`${s.qty||0}kg × Rs${s.rate||0}/kg`, amount:(s.qty||0)*(s.rate||0) }];
    if (cat === "Net")    return [{ desc:`${s.qty||0}ft × Rs${s.rate||0}/ft`, amount:(s.qty||0)*(s.rate||0) }];
    if (cat === "Pipe")   return [{ desc:`${s.qty||0}pc × Rs${s.rate||0}/pc`, amount:(s.qty||0)*(s.rate||0) }];
    return [{ desc:`${s.qty||0}pc × Rs${s.rate||0}/pc`, amount:(s.qty||0)*(s.rate||0) }];
  };

  const salesToInvoiceData = (salesList, invoiceTitle, customerName) => {
    const itemMap = {};
    salesList.forEach((s) => {
      if (s.items && s.items.length > 0) {
        s.items.forEach((item, idx) => {
          const key = `${item.productName||""}__${item.category||""}__${idx}`;
          if (!itemMap[key]) {
            itemMap[key] = {
              productName: item.productName || "—",
              category:    item.category || "",
              rows:        item.rows || [],
              subtotal:    item.subtotal || item.rows?.reduce((a,r)=>a+(Number(r.amount)||0),0) || 0,
            };
          } else {
            itemMap[key].rows    = [...itemMap[key].rows, ...(item.rows||[])];
            itemMap[key].subtotal += item.subtotal || 0;
          }
        });
        return;
      }
      const key = `${s.productName||safeProductName(s.product)}__${s.category||""}`;
      const rows = s.rows && s.rows.length > 0
        ? s.rows.map(r => ({
            desc:   r.desc || `${r.qty||r.weight||r.feet||0} × Rs${r.salePrice||r.salePricePerFeet||r.salePricePerKg||0}`,
            amount: r.amount || (r.qty||r.weight||r.feet||0) * (r.salePrice||r.salePricePerFeet||0),
          }))
        : buildSaleFallbackRows(s);
      const rowTotal = rows.reduce((a,r) => a+(Number(r.amount)||0), 0);
      if (!itemMap[key]) {
        itemMap[key] = {
          productName: s.productName || safeProductName(s.product),
          category:    s.category || "",
          rows,
          subtotal: rowTotal,
        };
      } else {
        itemMap[key].rows    = [...itemMap[key].rows, ...rows];
        itemMap[key].subtotal += rowTotal;
      }
    });
    const items      = Object.values(itemMap);
    const grandTotal = items.reduce((a,i) => a+i.subtotal, 0);
    const firstSale  = salesList.find(s => s.paymentMethod) || salesList[0] || {};
    const loaderName = salesList.find(s => s.loaderName)?.loaderName || "";
    const loaderFee  = salesList.reduce((a,s) => a+(Number(s.loaderFee)||0), 0);
    const bindingFee = salesList.reduce((a,s) => a+(Number(s.bindingFee)||0), 0);
    const totalPaid      = salesList.reduce((a,s) => a+(Number(s.paidAmount)||Number(s.total)||0), 0);
    const totalRemaining = salesList.reduce((a,s) => a+(Number(s.remainingAmount)||0), 0);
    const isPartial      = totalRemaining > 0;
    return {
      invoice:         invoiceTitle,
      date:            toDateStr(today),
      customer:        customerName,
      items,
      grandTotal,
      paymentMethod:   firstSale.paymentMethod || "cash",
      bankName:        firstSale.bankName || "",
      isPartial,
      paidAmount:      totalPaid,
      remainingAmount: totalRemaining,
      loaderName,
      loaderFee,
      bindingFee,
    };
  };

  // ─── Print handlers ───────────────────────────────────────────────────────────
  const handlePrintAllPurchases = () => {
    if (!filteredPurchases.length) return;
    setPurchaseModal(purchasesToInvoiceData(
      filteredPurchases,
      isUrdu ? "کل خریداری رپورٹ" : `All Purchases — ${filterLabel()}`,
      filterLabel()
    ));
  };

  const handlePrintAllSales = () => {
    if (!filteredSales.length) return;
    setSaleModal(salesToInvoiceData(
      filteredSales,
      isUrdu ? "کل فروخت رپورٹ" : `All Sales — ${filterLabel()}`,
      filterLabel()
    ));
  };

  const handlePrintSupplier = (sup) => {
    setPurchaseModal(purchasesToInvoiceData(
      sup.purchases,
      isUrdu ? "سپلائر خریداری" : "Supplier Purchases",
      sup.name
    ));
  };

  const handlePrintCustomer = (cus) => {
    setSaleModal(salesToInvoiceData(
      cus.sales,
      isUrdu ? "کسٹمر فروخت" : "Customer Sales",
      cus.name
    ));
  };

  // ─── Styles ───────────────────────────────────────────────────────────────────
  const cardStyle        = { borderRadius:16, border:`1px solid ${th.border}`, background:th.bgCard, overflow:"hidden" };
  const headStyle        = { padding:"16px 20px", borderBottom:`1px solid ${th.border}`, display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, flexWrap:"wrap" };
  const rowStyle         = { padding:"13px 20px", borderBottom:`1px solid ${th.border}`, display:"flex", alignItems:"center", justifyContent:"space-between", gap:10 };
  const inputStyle       = { background:"transparent", border:`1px solid ${th.border}`, borderRadius:8, color:th.text, padding:"6px 12px", fontSize:13, outline:"none" };
  const filterBtnStyle   = (active) => ({ padding:"7px 16px", borderRadius:20, fontSize:13, fontWeight:600, cursor:"pointer", border:active?"none":`1px solid ${th.border}`, background:active?"#6366f1":"transparent", color:active?"#fff":th.textMuted });
  const printBtnStyle    = { padding:"6px 14px", borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer", border:"1px solid rgba(99,102,241,0.4)", background:"rgba(99,102,241,0.08)", color:"#818cf8", flexShrink:0, display:"flex", alignItems:"center", gap:5 };
  const printAllBtnStyle = { padding:"8px 18px", borderRadius:10, fontSize:13, fontWeight:700, cursor:"pointer", border:"none", background:"#6366f1", color:"#fff", flexShrink:0, display:"flex", alignItems:"center", gap:6 };
  const avatarStyle      = (bg, color) => ({ width:40, height:40, borderRadius:"50%", background:bg, color, display:"flex", alignItems:"center", justifyContent:"center", fontSize:15, fontWeight:700, flexShrink:0 });

  // ─── Summary Card ─────────────────────────────────────────────────────────────
  const SummaryCard = ({ label, count, countLabel, amount, amountLabel, color, icon, onPrint, printLabel }) => (
    <div style={{ borderRadius:16, border:`1px solid ${th.border}`, background:th.bgCard, display:"flex", flexDirection:"column", gap:12, overflow:"hidden" }}>
      <div style={{ padding:"20px 22px 0", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <span style={{ color:th.textMuted, fontSize:14, fontWeight:600 }}>{label}</span>
        <span style={{ width:36, height:36, borderRadius:"50%", background:`${color}20`, display:"flex", alignItems:"center", justifyContent:"center" }}><Icon path={icon} size={18}/></span>
      </div>
      <div style={{ padding:"0 22px", display:"flex", alignItems:"baseline", justifyContent:"space-between" }}>
        <span style={{ color:th.textDim, fontSize:13 }}>{countLabel}</span>
        <span style={{ color:th.text, fontSize:26, fontWeight:700 }}>{count}</span>
      </div>
      <div style={{ margin:"0 22px", borderTop:`1px dashed ${th.border}` }}/>
      <div style={{ padding:"0 22px", display:"flex", alignItems:"baseline", justifyContent:"space-between" }}>
        <span style={{ color:th.textDim, fontSize:13 }}>{amountLabel}</span>
        <span style={{ color, fontSize:20, fontWeight:700 }}>{formatPKR(amount)}</span>
      </div>
      {onPrint && (
        <div style={{ padding:"0 22px 18px" }}>
          <button style={printAllBtnStyle} onClick={onPrint}><Icon path={ICONS.print} size={15}/> {printLabel}</button>
        </div>
      )}
    </div>
  );

  // ─── Profit Detail Modal ──────────────────────────────────────────────────────
  const ProfitDetailModal = () => {
    const isLossOverall = overallProfit < 0;
    const overallColor  = isLossOverall ? "#ef4444" : "#10b981";
    const profitRows    = invoiceProfitRows.filter(r => r.hasCost && r.profit > 0);
    const lossRows      = invoiceProfitRows.filter(r => r.hasCost && r.profit < 0);
    const noCostRows    = invoiceProfitRows.filter(r => !r.hasCost);
    const totalProfit   = profitRows.reduce((s,r) => s + r.profit, 0);
    const totalLoss     = lossRows.reduce((s,r) => s + r.profit, 0);

    const InvoiceRow = ({ row, i }) => {
      const isLoss      = row.hasCost && row.profit < 0;
      const isProfit    = row.hasCost && row.profit >= 0;
      const profitColor = isLoss ? "#ef4444" : "#10b981";
      const rowBg       = isLoss ? "rgba(239,68,68,0.07)" : isProfit ? "rgba(16,185,129,0.04)" : "transparent";
      const borderLeft  = isLoss ? "3px solid #ef4444" : isProfit ? "3px solid #10b981" : "3px solid transparent";

      return (
        <div style={{ borderBottom:`1px solid ${th.border}`, background:rowBg, borderLeft, paddingLeft:12 }}>
          {/* Header row */}
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px 6px 0" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ fontSize:11, fontWeight:700, color:th.textDim, background:th.bg, border:`1px solid ${th.border}`, borderRadius:6, padding:"2px 7px" }}>
                #{row.invoice}
              </span>
              <span style={{ fontSize:12, color:th.textMuted }}>👤 {row.customer}</span>
              <span style={{ fontSize:11, color:th.textDim }}>📅 {row.date}</span>
            </div>
            <div style={{ textAlign:"right" }}>
              {row.hasCost ? (
                <span style={{ fontSize:15, fontWeight:900, color:profitColor }}>
                  {isLoss ? "▼ " : "▲ "}{isLoss ? "-" : "+"}{formatPKR(Math.abs(row.profit))}
                </span>
              ) : (
                <span style={{ fontSize:11, color:th.textDim }}>{isUrdu ? "لاگت نہیں" : "no cost"}</span>
              )}
            </div>
          </div>
          {/* Items */}
          <div style={{ paddingBottom:8, paddingRight:14 }}>
            {row.items.length > 0 ? row.items.map((item, j) => {
              const isPipe = item.category === "Pipe";
              // Pipe: har waqt profit (Math.abs) — loss kabhi nahi
              // Others: real +/-
              const itemProfit = isPipe
                ? (item.costTotal > 0 ? Math.abs(item.subtotal - item.costTotal) : null)
                : (item.costTotal > 0 ? (item.subtotal - item.costTotal) : null);
              return (
                <div key={j} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", fontSize:12, marginBottom:3, gap:8 }}>
                  <span style={{ color:th.text, fontWeight:600, flex:1 }}>{item.productName || "—"}</span>
                  <span style={{ color:th.textDim, fontSize:11 }}>
                    {isUrdu ? "فروخت:" : "Sale:"} <span style={{ color:"#60a5fa", fontWeight:600 }}>{formatPKR(item.subtotal)}</span>
                  </span>
                  {/* Cost: hide for Pipe */}
                  {!isPipe && item.costTotal > 0 && (
                    <span style={{ color:th.textDim, fontSize:11 }}>
                      {isUrdu ? "لاگت:" : "Cost:"} <span style={{ color:"#f87171", fontWeight:600 }}>{formatPKR(item.costTotal)}</span>
                    </span>
                  )}
                  {/* Profit: Pipe always green +, others show real +/- */}
                  {itemProfit !== null && (
                    <span style={{ fontWeight:700, fontSize:12, color: isPipe ? "#10b981" : (itemProfit < 0 ? "#ef4444" : "#10b981"), minWidth:70, textAlign:"right" }}>
                      {isPipe ? "+" + formatPKR(itemProfit) : (itemProfit >= 0 ? "+" : "") + formatPKR(itemProfit)}
                    </span>
                  )}
                </div>
              );
            }) : (
              <span style={{ fontSize:11, color:th.textDim }}>{isUrdu ? "تفصیل نہیں" : "no detail"}</span>
            )}
            {/* Sale vs Cost totals */}
            {row.hasCost && (
              <div style={{ display:"flex", gap:12, marginTop:5, paddingTop:5, borderTop:`1px dashed ${th.border}`, justifyContent:"flex-end" }}>
                <span style={{ fontSize:11, color:th.textDim }}>
                  {isUrdu ? "فروخت:" : "Sale:"} <span style={{ color:"#60a5fa", fontWeight:700 }}>{formatPKR(row.saleAmt)}</span>
                </span>
                <span style={{ fontSize:11, color:th.textDim }}>
                  {isUrdu ? "لاگت:" : "Cost:"} <span style={{ color:"#f87171", fontWeight:700 }}>{formatPKR(row.costAmt)}</span>
                </span>
              </div>
            )}
          </div>
        </div>
      );
    };

    return (
      <Modal title={isUrdu ? "💰 منافع / نقصان تفصیل" : "💰 Profit / Loss Detail"} onClose={() => setShowProfitModal(false)}>
        <div style={{ display:"flex", flexDirection:"column", maxHeight:"75vh", overflow:"hidden" }}>

          {/* ── Summary Cards ── */}
          <div style={{ display:"flex", gap:8, padding:"12px 14px", background: isLossOverall ? "rgba(239,68,68,0.06)" : "rgba(16,185,129,0.06)", borderBottom:`1px solid ${th.border}`, flexWrap:"wrap" }}>
            <div style={{ flex:1, minWidth:100, background:th.bgModal, borderRadius:10, padding:"10px 14px", border:`1px solid ${th.border}` }}>
              <div style={{ fontSize:10, color:th.textDim, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:3 }}>{isUrdu ? "کل فروخت" : "Total Sales"}</div>
              <div style={{ fontSize:16, fontWeight:800, color:"#60a5fa" }}>{formatPKR(totalSaleForProfit)}</div>
            </div>
            <div style={{ flex:1, minWidth:100, background:th.bgModal, borderRadius:10, padding:"10px 14px", border:`1px solid ${th.border}` }}>
              <div style={{ fontSize:10, color:th.textDim, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:3 }}>{isUrdu ? "کل لاگت" : "Total Cost"}</div>
              <div style={{ fontSize:16, fontWeight:800, color:"#f87171" }}>{hasAnyCostData ? formatPKR(totalCostForProfit) : "—"}</div>
            </div>
            <div style={{ flex:1, minWidth:100, background: isLossOverall ? "rgba(239,68,68,0.12)" : "rgba(16,185,129,0.12)", borderRadius:10, padding:"10px 14px", border:`1px solid ${isLossOverall ? "rgba(239,68,68,0.3)" : "rgba(16,185,129,0.3)"}` }}>
              <div style={{ fontSize:10, color:th.textDim, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:3 }}>
                {isUrdu ? (isLossOverall ? "کل نقصان" : "کل منافع") : (isLossOverall ? "Net Loss" : "Net Profit")}
              </div>
              <div style={{ fontSize:18, fontWeight:900, color:overallColor }}>
                {hasAnyCostData ? (isLossOverall ? "-" : "+") + formatPKR(Math.abs(overallProfit)) : "—"}
              </div>
            </div>
          </div>

          {/* ── Loss/Profit quick stats ── */}
          {hasAnyCostData && (lossRows.length > 0 || profitRows.length > 0) && (
            <div style={{ display:"flex", gap:0, borderBottom:`1px solid ${th.border}` }}>
              <div style={{ flex:1, padding:"8px 14px", borderRight:`1px solid ${th.border}`, textAlign:"center" }}>
                <span style={{ fontSize:11, color:"#10b981", fontWeight:700 }}>✅ {profitRows.length} {isUrdu ? "منافع انوائس" : "Profit invoices"}</span>
                <div style={{ fontSize:13, fontWeight:800, color:"#10b981" }}>+{formatPKR(totalProfit)}</div>
              </div>
              <div style={{ flex:1, padding:"8px 14px", textAlign:"center" }}>
                <span style={{ fontSize:11, color:"#ef4444", fontWeight:700 }}>🔴 {lossRows.length} {isUrdu ? "نقصان انوائس" : "Loss invoices"}</span>
                <div style={{ fontSize:13, fontWeight:800, color:"#ef4444" }}>{lossRows.length > 0 ? "-" + formatPKR(Math.abs(totalLoss)) : "—"}</div>
              </div>
            </div>
          )}

          {/* ── Invoice List ── */}
          <div style={{ overflowY:"auto", flex:1 }}>
            {invoiceProfitRows.length === 0 && (
              <div style={{ padding:32, textAlign:"center", color:th.textDim }}>{isUrdu ? "کوئی ریکارڈ نہیں" : "No records found"}</div>
            )}
            {lossRows.length > 0 && (
              <div style={{ padding:"6px 14px 2px", fontSize:11, fontWeight:700, color:"#ef4444", background:"rgba(239,68,68,0.04)", borderBottom:`1px solid ${th.border}` }}>
                🔴 {isUrdu ? "نقصان" : "LOSS"}
              </div>
            )}
            {lossRows.map((row, i) => <InvoiceRow key={"l"+i} row={row} i={i} />)}
            {profitRows.length > 0 && (
              <div style={{ padding:"6px 14px 2px", fontSize:11, fontWeight:700, color:"#10b981", background:"rgba(16,185,129,0.04)", borderBottom:`1px solid ${th.border}` }}>
                ✅ {isUrdu ? "منافع" : "PROFIT"}
              </div>
            )}
            {profitRows.map((row, i) => <InvoiceRow key={"p"+i} row={row} i={i} />)}
            {noCostRows.length > 0 && (
              <div style={{ padding:"6px 14px 2px", fontSize:11, fontWeight:700, color:th.textDim, borderBottom:`1px solid ${th.border}` }}>
                ⚪ {isUrdu ? "لاگت نہیں (پرانے ریکارڈ)" : "No cost data (old records)"}
              </div>
            )}
            {noCostRows.map((row, i) => <InvoiceRow key={"n"+i} row={row} i={i} />)}
          </div>

          {!hasAnyCostData && (
            <div style={{ padding:"10px 14px", background:"rgba(245,158,11,0.06)", borderTop:`1px solid ${th.border}`, fontSize:12, color:"#f59e0b", textAlign:"center" }}>
              {isUrdu ? "💡 نئی billing سے profit track ہونا شروع ہوگا" : "💡 Profit tracking starts with new billing"}
            </div>
          )}
        </div>
      </Modal>
    );
  };

  // ─── Profit Summary Card (clickable) ──────────────────────────────────────────
  const ProfitCard = () => {
    const isLoss   = hasAnyCostData && overallProfit < 0;
    const isProfit = hasAnyCostData && overallProfit >= 0;
    const color    = !hasAnyCostData ? "#6b7280" : isLoss ? "#ef4444" : "#10b981";
    const border   = !hasAnyCostData ? "rgba(107,114,128,0.3)" : isLoss ? "rgba(239,68,68,0.35)" : "rgba(16,185,129,0.35)";
    const bg       = !hasAnyCostData ? "rgba(107,114,128,0.05)" : isLoss ? "rgba(239,68,68,0.05)" : "rgba(16,185,129,0.05)";
    const iconPath = isLoss ? ICONS.trend_down : ICONS.trend_up;
    const label    = !hasAnyCostData ? (isUrdu ? "منافع / نقصان" : "Profit / Loss")
                   : isLoss          ? (isUrdu ? "نقصان" : "Loss")
                   :                   (isUrdu ? "منافع" : "Profit");
    const valueStr = !hasAnyCostData
      ? (isUrdu ? "نئی billing کریں" : "Make a sale to track")
      : (isLoss ? "-" : "+") + formatPKR(Math.abs(overallProfit));

    return (
      <div
        onClick={() => filteredSales.length > 0 && setShowProfitModal(true)}
        style={{ borderRadius:16, border:`1px solid ${border}`, background:bg, display:"flex", flexDirection:"column", gap:12, overflow:"hidden", cursor: filteredSales.length > 0 ? "pointer" : "default", transition:"box-shadow 0.15s" }}
        onMouseEnter={e => { if(filteredSales.length > 0) e.currentTarget.style.boxShadow = `0 0 0 2px ${color}40`; }}
        onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; }}
      >
        <div style={{ padding:"20px 22px 0", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <span style={{ color:th.textMuted, fontSize:14, fontWeight:600 }}>{label}</span>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            {filteredSales.length > 0 && (
              <span style={{ fontSize:10, color:th.textDim, border:`1px solid ${th.border}`, borderRadius:6, padding:"2px 7px" }}>
                {isUrdu ? "تفصیل دیکھیں" : "View Detail"}
              </span>
            )}
            <span style={{ width:36, height:36, borderRadius:"50%", background:`${color}20`, display:"flex", alignItems:"center", justifyContent:"center" }}>
              <Icon path={iconPath} size={18} color={color}/>
            </span>
          </div>
        </div>
        <div style={{ padding:"0 22px", display:"flex", alignItems:"baseline", justifyContent:"space-between" }}>
          <span style={{ color:th.textDim, fontSize:13 }}>{isUrdu ? "فروخت ۔ لاگت" : "Sale − Cost"}</span>
          <span style={{ color, fontSize:26, fontWeight:700 }}>{valueStr}</span>
        </div>
        <div style={{ margin:"0 22px", borderTop:`1px dashed ${border}` }}/>
        <div style={{ padding:"0 22px 18px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <span style={{ color:th.textDim, fontSize:12 }}>{filteredSales.length} {isUrdu ? "فروخت" : "sales"}</span>
          {hasAnyCostData && (
            <span style={{ fontSize:11, padding:"2px 10px", borderRadius:16, background:`${color}15`, color, fontWeight:700 }}>
              {isLoss
                ? (isUrdu ? "⚠️ قیمتیں چیک کریں" : "⚠️ Check prices")
                : (isUrdu ? "✓ فائدہ میں ہیں" : "✓ In profit")}
            </span>
          )}
        </div>
      </div>
    );
  };

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:20 }}>

      {showProfitModal && <ProfitDetailModal/>}

      {purchaseModal && (
        <Modal title={isUrdu ? "🖨️ خریداری رسید" : "🖨️ Purchase Invoice"} onClose={() => setPurchaseModal(null)}>
          <CombinedSaleInvoice invoiceData={purchaseModal} onClose={() => setPurchaseModal(null)} isUrdu={isUrdu}/>
        </Modal>
      )}

      {saleModal && (
        <Modal title={isUrdu ? "🖨️ فروخت رسید" : "🖨️ Sale Invoice"} onClose={() => setSaleModal(null)}>
          <CombinedSaleInvoice invoiceData={saleModal} onClose={() => setSaleModal(null)} isUrdu={isUrdu}/>
        </Modal>
      )}

      {/* Filter Bar */}
      <div style={{ ...cardStyle, padding:"14px 20px", display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
        <span style={{ color:th.textMuted, fontSize:13, fontWeight:600, marginRight:4 }}><Icon path={ICONS.calendar} size={15}/> {t.period||"Period"}:</span>
        {["all","today","week","month","custom"].map(f => (
          <button key={f} style={filterBtnStyle(filter===f)} onClick={() => setFilter(f)}>
            {f==="all"?"All Time":f==="today"?"Today":f==="week"?"This Week":f==="month"?"This Month":"Custom"}
          </button>
        ))}
        {filter==="custom" && (
          <>
            <input type="date" style={inputStyle} value={customFrom} onChange={e => setCustomFrom(e.target.value)}/>
            <span style={{ color:th.textMuted, fontSize:13 }}>→</span>
            <input type="date" style={inputStyle} value={customTo} onChange={e => setCustomTo(e.target.value)}/>
          </>
        )}
        <span style={{ marginLeft:"auto", fontSize:13, padding:"4px 12px", borderRadius:20, background:"rgba(99,102,241,0.12)", color:"#818cf8", fontWeight:600 }}>{filterLabel()}</span>
      </div>

      {/* Summary Cards */}
      <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr":"repeat(auto-fit,minmax(220px,1fr))", gap:14 }}>
        <SummaryCard
          label={t.totalPurchases||"Total Purchases"} count={totalPurchaseCount}
          countLabel={t.numberOfOrders||"No. of Orders"} amount={totalPurchaseAmt}
          amountLabel={t.purchaseAmount||"Purchase Amount"} color="#3b82f6"
          icon={ICONS.purchase} onPrint={handlePrintAllPurchases}
          printLabel={t.printAllPurchases||"Print All Purchases"}
        />
        <SummaryCard
          label={t.totalSales||"Total Sales"} count={totalSalesCount}
          countLabel={t.numberOfSales||"No. of Sales"} amount={totalSalesAmount}
          amountLabel={t.saleAmount||"Sale Amount"} color="#10b981"
          icon={ICONS.trend_up} onPrint={handlePrintAllSales}
          printLabel={t.printAllSales||"Print All Sales"}
        />
        <ProfitCard/>
      </div>

      {/* Recent Sales + Purchases */}
      <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr":"repeat(auto-fit,minmax(300px,1fr))", gap:20 }}>
        <div style={cardStyle}>
          <div style={headStyle}>
            <h3 style={{ color:th.text, fontWeight:700, fontSize:16, margin:0 }}>{t.recentSales||"Recent Sales"}</h3>
            <span style={{ fontSize:13, padding:"4px 12px", borderRadius:20, background:"rgba(16,185,129,0.12)", color:"#10b981", fontWeight:600 }}>{filteredSales.length}</span>
          </div>
          {filteredSales.length === 0
            ? <p style={{ textAlign:"center", padding:32, color:th.textDim, fontSize:14 }}>{t.noSalesYet}</p>
            : filteredSales.slice(-5).reverse().map((s, i) => (
              <div key={i} style={rowStyle}>
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ color:th.text, fontSize:14, fontWeight:600, margin:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.customer}</p>
                  <p style={{ color:th.textDim, fontSize:12, margin:0, marginTop:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.productName||safeProductName(s.product)} · {s.date}</p>
                </div>
                <span style={{ color:"#34d399", fontWeight:700, fontSize:14, flexShrink:0 }}>{formatPKR(s.total)}</span>
              </div>
            ))
          }
        </div>

        <div style={cardStyle}>
          <div style={headStyle}>
            <h3 style={{ color:th.text, fontWeight:700, fontSize:16, margin:0 }}>{t.recentPurchases||"Recent Purchases"}</h3>
            <span style={{ fontSize:13, padding:"4px 12px", borderRadius:20, background:"rgba(59,130,246,0.12)", color:"#3b82f6", fontWeight:600 }}>{filteredPurchases.length}</span>
          </div>
          {filteredPurchases.length === 0
            ? <p style={{ textAlign:"center", padding:32, color:th.textDim, fontSize:14 }}>{t.noPurchasesYet||"No purchases found"}</p>
            : filteredPurchases.slice(-5).reverse().map((p, i) => (
              <div key={i} style={rowStyle}>
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ color:th.text, fontSize:14, fontWeight:600, margin:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.supplier||p.supplierName||"—"}</p>
                  <p style={{ color:th.textDim, fontSize:12, margin:0, marginTop:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.productName||safeProductName(p.product)} · {p.date}</p>
                </div>
                <span style={{ color:"#60a5fa", fontWeight:700, fontSize:14, flexShrink:0 }}>{formatPKR(p.total)}</span>
              </div>
            ))
          }
        </div>
      </div>

      {/* Supplier + Customer wise */}
      <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr":"repeat(auto-fit,minmax(300px,1fr))", gap:20 }}>
        <div style={cardStyle}>
          <div style={headStyle}>
            <h3 style={{ color:th.text, fontWeight:700, fontSize:16, margin:0 }}>{t.supplierWisePurchases||"Supplier-wise Purchases"}</h3>
            <input style={{ ...inputStyle, width:130 }} placeholder={t.search||"Search..."} value={supplierSearch} onChange={e => setSupplierSearch(e.target.value)}/>
          </div>
          {filteredSuppliers.length === 0
            ? <p style={{ textAlign:"center", padding:32, color:th.textDim, fontSize:14 }}>{t.noData||"No data"}</p>
            : filteredSuppliers.map((sup, i) => (
              <div key={i} style={rowStyle}>
                <div style={avatarStyle("rgba(99,102,241,0.15)", "#818cf8")}>{sup.name.charAt(0).toUpperCase()}</div>
                <div style={{ flex:1, minWidth:0, marginLeft:12 }}>
                  <p style={{ color:th.text, fontSize:14, fontWeight:600, margin:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{sup.name}</p>
                  <p style={{ color:th.textDim, fontSize:12, margin:0, marginTop:2 }}>{sup.count} {t.invoices||"invoices"} · {formatPKR(sup.total)}</p>
                </div>
                <button style={printBtnStyle} onClick={() => handlePrintSupplier(sup)}>
                  <Icon path={ICONS.print} size={15}/> {t.print||"Print"}
                </button>
              </div>
            ))
          }
        </div>

        <div style={cardStyle}>
          <div style={headStyle}>
            <h3 style={{ color:th.text, fontWeight:700, fontSize:16, margin:0 }}>{t.customerWiseSales||"Customer-wise Sales"}</h3>
            <input style={{ ...inputStyle, width:130 }} placeholder={t.search||"Search..."} value={customerSearch} onChange={e => setCustomerSearch(e.target.value)}/>
          </div>
          {filteredCustomers.length === 0
            ? <p style={{ textAlign:"center", padding:32, color:th.textDim, fontSize:14 }}>{t.noData||"No data"}</p>
            : filteredCustomers.map((cus, i) => (
              <div key={i} style={rowStyle}>
                <div style={avatarStyle("rgba(16,185,129,0.15)", "#10b981")}>{cus.name.charAt(0).toUpperCase()}</div>
                <div style={{ flex:1, minWidth:0, marginLeft:12 }}>
                  <p style={{ color:th.text, fontSize:14, fontWeight:600, margin:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{cus.name}</p>
                  <p style={{ color:th.textDim, fontSize:12, margin:0, marginTop:2 }}>{cus.count} {t.invoices||"invoices"} · {formatPKR(cus.total)}</p>
                </div>
                <button style={printBtnStyle} onClick={() => handlePrintCustomer(cus)}>
                  <Icon path={ICONS.print} size={15}/> {t.print||"Print"}
                </button>
              </div>
            ))
          }
        </div>
      </div>

      {/* ─── LOADER REPORT ─── */}
      <LoaderDashboardReport sales={sales} loaders={loaders} isUrdu={isUrdu} th={th} filter={filter} customFrom={customFrom} customTo={customTo} filterLabel={filterLabel}/>

      {/* ─── CHADER BINDING FEE REPORT ─── */}
      <BindingFeeDashboardReport sales={sales} isUrdu={isUrdu} th={th} filter={filter} customFrom={customFrom} customTo={customTo} filterLabel={filterLabel}/>

    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CHADER BINDING FEE DASHBOARD REPORT — same pattern as LoaderDashboardReport,
// but for the "binding mazdori" flat labour fee (Chader items only). Shows a
// summary card with the total collected in the selected period, plus a list
// of every invoice that carried a binding fee, mirroring the Loader report so
// admins can see both pass-through fees at a glance from the Dashboard.
// ═══════════════════════════════════════════════════════════════════════════
function BindingFeeDashboardReport({ sales, isUrdu, th, filter, customFrom, customTo, filterLabel }) {
  const today = new Date();
  const toDateStr = (d) => d.toISOString().split("T")[0];
  const todayStr2 = toDateStr(today);
  const weekStart = (() => { const d = new Date(today); d.setDate(d.getDate() - 6); return toDateStr(d); })();
  const monthStart = (() => { const d = new Date(today); d.setDate(1); return toDateStr(d); })();

  const parseDate = (str) => {
    if (!str) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    const parts = str.split(/[-\/]/);
    if (parts.length === 3) { if (parts[0].length === 4) return str; return `${parts[2]}-${parts[1].padStart(2,"0")}-${parts[0].padStart(2,"0")}`; }
    return str;
  };

  const inRange = (dateStr) => {
    const d = parseDate(dateStr); if (!d) return false;
    if (filter === "today")  return d === todayStr2;
    if (filter === "week")   return d >= weekStart && d <= todayStr2;
    if (filter === "month")  return d >= monthStart && d <= todayStr2;
    if (filter === "custom") { const from = customFrom || "0000-01-01"; const to = customTo || "9999-12-31"; return d >= from && d <= to; }
    return true;
  };

  const salesWithBinding = sales.filter(s => Number(s.bindingFee) > 0 && inRange(s.date));
  if (salesWithBinding.length === 0) return null;

  const grandTotalFee = salesWithBinding.reduce((s,x) => s + (Number(x.bindingFee)||0), 0);
  const cardStyle = { borderRadius:16, border:`1px solid ${th.border}`, background:th.bgCard, overflow:"hidden" };

  return (
    <div style={cardStyle}>
      <div style={{ padding:"14px 20px", borderBottom:`1px solid ${th.border}`, display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:8 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:22 }}>📋</span>
          <div>
            <h3 style={{ color:th.text, fontWeight:800, fontSize:16, margin:0 }}>
              {isUrdu ? "چادر بائنڈنگ مزدوری رپورٹ" : "Chader Binding Fee Report"}
            </h3>
            <p style={{ color:th.textMuted, fontSize:12, margin:0 }}>
              {filterLabel()} · {salesWithBinding.length} {isUrdu ? "invoices" : "invoices"}
            </p>
          </div>
        </div>
        <div style={{ textAlign:"right" }}>
          <div style={{ color:th.textDim, fontSize:11, textTransform:"uppercase", letterSpacing:"0.06em" }}>{isUrdu?"کل بائنڈنگ مزدوری":"Total Binding Fee"}</div>
          <div style={{ color:"#fbbf24", fontWeight:900, fontSize:18 }}>{formatPKR(grandTotalFee)}</div>
        </div>
      </div>

      <div>
        {salesWithBinding.map((s, i) => (
          <div key={i} style={{ padding:"13px 20px", borderBottom: i < salesWithBinding.length-1 ? `1px solid ${th.border}` : "none", display:"flex", alignItems:"center", gap:14 }}>
            <div style={{ width:42, height:42, borderRadius:12, background:"rgba(251,191,36,0.12)", display:"flex", alignItems:"center", justifyContent:"center", color:"#fbbf24", fontWeight:900, fontSize:18, flexShrink:0 }}>
              📋
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ color:th.text, fontWeight:700, fontSize:14, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.customer || "—"}</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginTop:4, alignItems:"center" }}>
                <span style={{ fontFamily:"monospace", color:"#34d399", fontSize:10, background:"rgba(52,211,153,0.1)", padding:"1px 7px", borderRadius:5, fontWeight:600 }}>{s.invoice}</span>
                <span style={{ color:th.textDim, fontSize:11 }}>📅 {s.date}</span>
              </div>
            </div>
            <div style={{ textAlign:"right", flexShrink:0 }}>
              <div style={{ color:"#fbbf24", fontWeight:900, fontSize:16 }}>{formatPKR(Number(s.bindingFee)||0)}</div>
            </div>
          </div>
        ))}

        {salesWithBinding.length > 1 && (
          <div style={{ padding:"12px 20px", background:"rgba(251,191,36,0.06)", borderTop:`1px solid ${th.border}`, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <span style={{ color:th.textMuted, fontWeight:700, fontSize:13 }}>
              🏁 {salesWithBinding.length} {isUrdu?"invoices":"invoices"}
            </span>
            <span style={{ color:"#fbbf24", fontWeight:900, fontSize:16 }}>{formatPKR(grandTotalFee)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// LOADER DASHBOARD REPORT (unchanged)
// ═══════════════════════════════════════════════════════════════════════════
function LoaderDashboardReport({ sales, loaders, isUrdu, th, filter, customFrom, customTo, filterLabel }) {
  const { isMobile } = useResponsive();
  const today = new Date();
  const toDateStr = (d) => d.toISOString().split("T")[0];
  const todayStr2 = toDateStr(today);
  const weekStart = (() => { const d = new Date(today); d.setDate(d.getDate() - 6); return toDateStr(d); })();
  const monthStart = (() => { const d = new Date(today); d.setDate(1); return toDateStr(d); })();

  const parseDate = (str) => {
    if (!str) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    const parts = str.split(/[-\/]/);
    if (parts.length === 3) { if (parts[0].length === 4) return str; return `${parts[2]}-${parts[1].padStart(2,"0")}-${parts[0].padStart(2,"0")}`; }
    return str;
  };

  const inRange = (dateStr) => {
    const d = parseDate(dateStr); if (!d) return false;
    if (filter === "today")  return d === todayStr2;
    if (filter === "week")   return d >= weekStart && d <= todayStr2;
    if (filter === "month")  return d >= monthStart && d <= todayStr2;
    if (filter === "custom") { const from = customFrom || "0000-01-01"; const to = customTo || "9999-12-31"; return d >= from && d <= to; }
    return true;
  };

  const salesWithLoader = sales.filter(s => s.loaderName && inRange(s.date));
  if (salesWithLoader.length === 0 && loaders.length === 0) return null;

  const loaderMap = {};
  salesWithLoader.forEach(s => {
    const name = s.loaderName || "—";
    if (!loaderMap[name]) loaderMap[name] = { name, invoices:[], totalFee:0, totalSale:0, dates:[] };
    loaderMap[name].invoices.push(s.invoice);
    loaderMap[name].totalFee  += Number(s.loaderFee) || 0;
    loaderMap[name].totalSale += Number(s.grandTotal || s.total) || 0;
    const d = s.date; if (!loaderMap[name].dates.includes(d)) loaderMap[name].dates.push(d);
  });

  const loaderRows     = Object.values(loaderMap).sort((a,b) => b.totalFee - a.totalFee);
  const grandTotalFee  = loaderRows.reduce((s,l) => s + l.totalFee,  0);
  const grandTotalSale = loaderRows.reduce((s,l) => s + l.totalSale, 0);

  const avatarColor = (name) => {
    const cs = ["#a78bfa","#60a5fa","#34d399","#fbbf24","#f472b6","#fb923c"];
    let h = 0; for (let c of (name||"?")) h = c.charCodeAt(0) + ((h<<5)-h);
    return cs[Math.abs(h) % cs.length];
  };

  const cardStyle = { borderRadius:16, border:`1px solid ${th.border}`, background:th.bgCard, overflow:"hidden" };

  return (
    <div style={cardStyle}>
      <div style={{ padding:"14px 20px", borderBottom:`1px solid ${th.border}`, display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:8 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:22 }}>🏋️</span>
          <div>
            <h3 style={{ color:th.text, fontWeight:800, fontSize:16, margin:0 }}>
              {isUrdu ? "Loader رپورٹ" : "Loader Report"}
            </h3>
            <p style={{ color:th.textMuted, fontSize:12, margin:0 }}>
              {filterLabel()} · {salesWithLoader.length} {isUrdu ? "invoices" : "invoices"}
            </p>
          </div>
        </div>
        <div style={{ display:"flex", gap:16 }}>
          <div style={{ textAlign:"right" }}>
            <div style={{ color:th.textDim, fontSize:11, textTransform:"uppercase", letterSpacing:"0.06em" }}>{isUrdu?"کل Loading Fee":"Total Fees"}</div>
            <div style={{ color:"#a78bfa", fontWeight:900, fontSize:18 }}>{formatPKR(grandTotalFee)}</div>
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ color:th.textDim, fontSize:11, textTransform:"uppercase", letterSpacing:"0.06em" }}>{isUrdu?"کل فروخت":"Total Sales"}</div>
            <div style={{ color:"#34d399", fontWeight:900, fontSize:18 }}>{formatPKR(grandTotalSale)}</div>
          </div>
        </div>
      </div>

      {loaderRows.length === 0 && (
        <div style={{ padding:"32px", textAlign:"center" }}>
          <div style={{ fontSize:36, marginBottom:8 }}>🏋️</div>
          <p style={{ color:th.textMuted, fontSize:14, margin:0 }}>
            {isUrdu ? "اس period میں کوئی loader نہیں" : "No loader activity in this period"}
          </p>
          {loaders.length > 0 && (
            <p style={{ color:th.textDim, fontSize:12, marginTop:4 }}>
              {isUrdu ? `${loaders.length} loaders sidebar میں موجود ہیں` : `${loaders.length} loaders available in sidebar`}
            </p>
          )}
        </div>
      )}

      {loaderRows.length > 0 && (
        <div>
          {loaderRows.map((loader, i) => {
            const ac = avatarColor(loader.name);
            const feePercent = grandTotalFee > 0 ? (loader.totalFee / grandTotalFee * 100).toFixed(0) : 0;
            return (
              <div key={i} style={{ padding:"13px 20px", borderBottom: i < loaderRows.length-1 ? `1px solid ${th.border}` : "none", display:"flex", alignItems:"center", gap:14 }}>
                <div style={{ width:42, height:42, borderRadius:12, background:`${ac}20`, display:"flex", alignItems:"center", justifyContent:"center", color:ac, fontWeight:900, fontSize:18, flexShrink:0 }}>
                  {loader.name[0].toUpperCase()}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ color:th.text, fontWeight:700, fontSize:14 }}>{loader.name}</div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginTop:4 }}>
                    {loader.invoices.slice(0,5).map((inv,j) => (
                      <span key={j} style={{ fontFamily:"monospace", color:"#34d399", fontSize:10, background:"rgba(52,211,153,0.1)", padding:"1px 7px", borderRadius:5, fontWeight:600 }}>{inv}</span>
                    ))}
                    {loader.invoices.length > 5 && (
                      <span style={{ color:th.textDim, fontSize:10, padding:"1px 6px" }}>+{loader.invoices.length-5}</span>
                    )}
                  </div>
                  {grandTotalFee > 0 && (
                    <div style={{ marginTop:6, height:4, borderRadius:4, background:th.border, overflow:"hidden" }}>
                      <div style={{ height:"100%", width:`${feePercent}%`, background:ac, borderRadius:4, transition:"width 0.3s" }}/>
                    </div>
                  )}
                </div>
                <div style={{ textAlign:"right", flexShrink:0 }}>
                  <div style={{ color:ac, fontWeight:900, fontSize:16 }}>{formatPKR(loader.totalFee)}</div>
                  <div style={{ color:th.textDim, fontSize:11, marginTop:2 }}>
                    {loader.invoices.length} {isUrdu?"bill":"bills"} · {loader.dates.length} {isUrdu?"دن":"days"}
                  </div>
                  {loader.totalSale > 0 && (
                    <div style={{ color:th.textMuted, fontSize:11 }}>
                      {isUrdu?"فروخت:":"Sale:"} {formatPKR(loader.totalSale)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {loaderRows.length > 1 && (
            <div style={{ padding:"12px 20px", background:"rgba(167,139,250,0.06)", borderTop:`1px solid ${th.border}`, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <span style={{ color:th.textMuted, fontWeight:700, fontSize:13 }}>
                🏁 {loaderRows.length} loaders · {salesWithLoader.length} {isUrdu?"invoices":"invoices"}
              </span>
              <span style={{ color:"#a78bfa", fontWeight:900, fontSize:16 }}>{formatPKR(grandTotalFee)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export { Dashboard, LoaderDashboardReport, BindingFeeDashboardReport };
export default Dashboard;