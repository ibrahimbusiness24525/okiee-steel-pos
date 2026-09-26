import { useState, useRef, useLayoutEffect, useMemo } from "react";
import { useTheme } from "../context/ThemeContext";
import { useLang } from "../context/LangContext";
import { useResponsive, Icon, ICONS, Modal, FInput, SaveBtn, StatCard, Table, WeightKgGInput, useTypeaheadNav, DateFilterBar } from "../components/shared";
import { api } from "../utils/api";
import { savePurchaseReturn, removePurchaseReturn } from "../utils/returnsStore";
import { formatPKR, todayStr, loadShopProfile, formatWeightKgG, inDateFilter, formatDateTime, printThermalOrA4 } from "../utils/helpers";
import { convertQuantity, convertPrice, getUnitLabel, canConvert, unitOptions, productUnitOf } from "../utils/unitConversion";
import { safeProductName, productDisplayName } from "../utils/constants";
import { PurchaseReturnModal, ReturnsTable } from "../components/StockReturns";
import InventoryStockTable, { inventoryStats } from "../components/InventoryStockTable";
import PaymentTerms, { useAccounts, derivePayment, isPayValid, calcDiscount, DiscountCashFields } from "../components/PaymentTerms";
import { recordTradeFinance, reverseTradeFinance } from "../utils/tradeFinance";
import PartyNamePicker from "../components/PartyNamePicker";
import HardwareManageModal from "../components/HardwareManageModal";
import { ProductQuickAddModal } from "./ProductsPage";

// ═══════════════════════════════════════════════════════════════════════════
// PURCHASE PAGE — Invoice matches Billing style exactly
// ═══════════════════════════════════════════════════════════════════════════

const parseLength = (val) => parseFloat(String(val || "").replace(/[^0-9.\-]/g, "")) || 0;

const pipeCalc = (row, price) => {
  const length    = parseLength(row.length);
  const pieces    = Number(row.quantity) || 0;
  const totalFeet = length * pieces;
  const pct       = Number(row.purchasePercentage) || 0;
  const total     = totalFeet * (Number(price) || 0) * (1 + pct / 100);
  return { totalFeet, pieces, total };
};

const calcRowAmt = (row, cat, price) => {
  if (cat === "Chader") return (Number(row.purchasePrice) || 0) * (Number(row.weight) || 0);
  if (cat === "Net") {
    const totalFt = (Number(row.feet) || 0) * (Number(row.width) || 1);
    return (Number(row.purchasePricePerFeet) || 0) * totalFt;
  }
  if (cat === "Pipe") return pipeCalc(row, price).total;
  return (Number(row.purchasePrice) || 0) * (Number(row.qty) || 0);
};

function productCostSale(product) {
  if (!product) return { cost: 0, sale: 0 };
  if (product.category === "Pipe") {
    return { cost: Number(product.price) || 0, sale: Number(product.purchasePrice) || 0 };
  }
  return {
    cost: Number(product.purchasePrice) || 0,
    sale: Number(product.price) || 0,
  };
}

function prefillPurchaseRow(category, product) {
  const { cost, sale } = productCostSale(product);
  const n = (v) => (v > 0 ? String(v) : "");
  const r = { _id: Date.now() + Math.random() };
  if (category === "Chader") Object.assign(r, { purchasePrice: n(cost), salePrice: n(sale), weight: "" });
  else if (category === "Net") Object.assign(r, { feet: "", width: product?.width ? String(product.width) : "", purchasePricePerFeet: n(cost), salePricePerFeet: n(sale) });
  else if (category === "Pipe") Object.assign(r, { length: "", quantity: "", purchasePercentage: "" });
  else Object.assign(r, { unit: productUnitOf(product), qty: "", purchasePrice: n(cost), salePrice: n(sale) });
  return r;
}

const getUrduItemLabel = (cat) => {
  switch (cat) {
    case "Pipe":     return "پائپ";
    case "Chader":   return "چادر";
    case "Net":      return "جال";
    case "Hardware": return "ہارڈ ویئر";
    case "Custom":   return "آئٹم";
    default:         return "آئٹم";
  }
};

// ─── Print Styles (same as BillingSaleInvoice) ────────────────────────────────
const thermalPrintStyles = `
@page { size: 3in 297mm; margin: 1.5mm; }
@media print {
  html, body { margin:0 !important; padding:0 !important; background:#fff !important; }
  body * { visibility:hidden !important; }
  #print-portal-overlay, #print-portal-overlay *,
  #thermal-invoice-print, #thermal-invoice-print *,
  #thermal-invoice, #thermal-invoice * { visibility:visible !important; color:#000 !important; }
  button { display:none !important; }
}`;

// ─── Purchase Thermal Invoice — BillingSaleInvoice style ──────────────────────
function CombinedThermalInvoice({ invoiceData, onClose, isUrdu }) {
  const th = useTheme();
  const { invoice, date, supplier, products, createdAt, paymentMethod, bankName, accountName, isPartial, paidAmount, remainingAmount } = invoiceData;
  const sp         = loadShopProfile();
  const ownerLines = (sp.owners || []).filter(o => o.name || o.nameUr);

  const L = isUrdu ? {
    shopName:     sp.shopNameUr || sp.shopName,
    phone1:       ownerLines[0] ? `${ownerLines[0].nameUr || ownerLines[0].name}: ${ownerLines[0].phone}` : "",
    phone2:       ownerLines[1] ? `${ownerLines[1].nameUr || ownerLines[1].name}: ${ownerLines[1].phone}` : "",
    phone3:       ownerLines[2] ? `${ownerLines[2].nameUr || ownerLines[2].name}: ${ownerLines[2].phone}` : "",
    address:      sp.addressUr || sp.address,
    billNoLbl:    "رسید نمبر",
    dateLbl:      "تاریخ",
    partyLbl:     "سپلائر",
    colSN:        "نمبر",
    colItem:      "آئٹم",
    colQty:       "مقدار",
    colPrice:     "ریٹ",
    colAmt:       "رقم",
    subtotalLbl:  "ذیلی کل",
    totalLbl:     "کل رقم",
    payLbl:       "ادائیگی",
    paidNowLbl:   "ادا کردہ",
    remainingLbl: "قابل ادائیگی",
    timeLbl:      "وقت",
    softPhone:    "03057903867",
  } : {
    shopName:     sp.shopName,
    phone1:       ownerLines[0] ? `${ownerLines[0].name}: ${ownerLines[0].phone}` : "",
    phone2:       ownerLines[1] ? `${ownerLines[1].name}: ${ownerLines[1].phone}` : "",
    phone3:       ownerLines[2] ? `${ownerLines[2].name}: ${ownerLines[2].phone}` : "",
    address:      sp.address,
    billNoLbl:    "Bill No",
    dateLbl:      "Date",
    partyLbl:     "Supplier",
    colSN:        "SN",
    colItem:      "Item",
    colQty:       "Qty",
    colPrice:     "Price",
    colAmt:       "Amt",
    subtotalLbl:  "Subtotal",
    totalLbl:     "TOTAL",
    payLbl:       "Payment",
    paidNowLbl:   "Paid",
    remainingLbl: "Payable",
    timeLbl:      "Time",
    softPhone:    "03057903867",
  };

  // ── Styles — identical to BillingSaleInvoice ──
  const page = {
    width: "3in", margin: "0 auto",
    fontFamily: "Arial, sans-serif", fontSize: "14px",
    color: "#000", background: "#fff",
    padding: "6px 4px 10px", boxSizing: "border-box",
  };
  const center  = { textAlign: "center" };
  const bold500 = { fontWeight: 500 };
  const dash    = { borderTop: "1px dashed #000", margin: "8px 0" };
  const tbl     = {
    width: "100%", borderCollapse: "collapse", tableLayout: "fixed",
  };
  const thS = (w, align) => ({
    width: w, padding: "6px 3px", fontWeight: 600, fontSize: "11px",
    textAlign: align || "center", whiteSpace: "nowrap", overflow: "hidden",
  });
  const tdS = (align) => ({
    padding: "6px 3px", fontWeight: 400, fontSize: "11px",
    textAlign: align || "center", verticalAlign: "top",
    wordBreak: "break-word", overflowWrap: "break-word",
  });
  const tdNum = (align) => ({
    padding: "6px 3px", fontWeight: 400, fontSize: "11px",
    textAlign: align || "right", whiteSpace: "nowrap",
  });

  const COL_SN    = "8%";
  const COL_ITEM  = "40%";
  const COL_QTY   = "16%";
  const COL_PRICE = "18%";
  const COL_AMT   = "18%";

  // ── Parse each product's rows → flat numbered lineItems ──
  const parseRow = (row, cat, productName, pp) => {
    // Already-saved rows (have desc + amount)
    if (row.desc !== undefined && row.amount !== undefined) {
      const desc   = row.desc || "";
      const amount = Number(row.amount) || 0;
      if (cat === "Pipe") {
        const qM = desc.match(/^(\d+\.?\d*)pc/);
        const pM = desc.match(/Rs(\d+\.?\d*)\/pc/);
        return { item: productName, qty: qM ? qM[1] : "1", price: pM ? Number(pM[1]) : 0, amount };
      }
      if (cat === "Chader") {
        const qM = desc.match(/^(\d+\.?\d*)kg/);
        const pM = desc.match(/Rs(\d+\.?\d*)\/kg/);
        return { item: productName, qty: qM ? formatWeightKgG(parseFloat(qM[1])) : "1", price: pM ? Number(pM[1]) : 0, amount };
      }
      if (cat === "Net") {
        const qM = desc.match(/^(\d+\.?\d*)ft/);
        const pM = desc.match(/Rs(\d+\.?\d*)\/ft/);
        return { item: productName, qty: qM ? `${qM[1]}ft` : "1", price: pM ? Number(pM[1]) : 0, amount };
      }
      const qM = desc.match(/^(\d+\.?\d*)pc/);
      const pM = desc.match(/Rs(\d+\.?\d*)\/pc/);
      return { item: productName, qty: qM ? qM[1] : "1", price: pM ? Number(pM[1]) : 0, amount };
    }
    // Live / native purchase row format
    if (cat === "Pipe") {
      const length     = parseLength(row.length);
      const pieces     = Number(row.quantity) || 0;
      const pct        = Number(row.purchasePercentage) || 0;
      const pricePerFt = (Number(pp) || 0) * (1 + pct / 100);
      const pricePerPc = pricePerFt * length;
      return { item: productName, qty: String(pieces), price: pricePerPc, amount: pricePerPc * pieces };
    }
    if (cat === "Chader") {
      const kg    = Number(row.weight) || 0;
      const price = Number(row.purchasePrice) || 0;
      return { item: productName, qty: formatWeightKgG(kg), price, amount: kg * price };
    }
    if (cat === "Net") {
      const ft    = Number(row.feet) || 0;
      const width = Number(row.width) || 0;
      const price = Number(row.purchasePricePerFeet) || 0;
      return { item: productName, qty: `${ft}ft${width ? `×${width}` : ""}`, price, amount: ft * (width || 1) * price };
    }
    const qty   = Number(row.qty) || 0;
    const price = Number(row.purchasePrice) || 0;
    return { item: productName, qty: String(qty), price, amount: qty * price };
  };

  const lineItems = [];
  (products || []).forEach(prod => {
    const rows = (prod.rows && prod.rows.length)
      ? prod.rows
      : [{
          qty: Number(prod.qty) || 0,
          purchasePrice: Number(prod.productPrice) || 0,
          amount: Number(prod.total) || 0,
          desc: `${Number(prod.qty) || 0}pc × Rs${Number(prod.productPrice) || 0}/pc`,
        }];
    rows.forEach(row => {
      lineItems.push(parseRow(row, prod.category, prod.productName, prod.productPrice || 0));
    });
  });

  const grandTotal = lineItems.reduce((s, li) => s + li.amount, 0);
  const btn = (bg) => ({
    flex: 1, padding: "10px 8px", borderRadius: 10, border: "none", background: bg,
    color: "white", fontWeight: 700, fontSize: 13, cursor: "pointer", minWidth: 90,
  });

  return (
    <>
      <style>{thermalPrintStyles}</style>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>

        <div style={{ display: "flex", gap: 8, width: "100%", flexWrap: "wrap" }}>
          <button onClick={() => printThermalOrA4("thermal")} style={btn("linear-gradient(135deg,#1abc9c,#2980b9)")}>
            🖨️ {isUrdu ? "تھرمل" : "Thermal"}
          </button>
          <button onClick={() => printThermalOrA4("a4")} style={btn("linear-gradient(135deg,#3b82f6,#1d4ed8)")}>
            📄 {isUrdu ? "A4 کاغذ" : "A4 Paper"}
          </button>
          <button onClick={() => printThermalOrA4("pdf", `${invoice || "purchase"}-${date || todayStr()}`)} style={btn("linear-gradient(135deg,#7c3aed,#5b21b6)")}>
            📑 PDF
          </button>
          <button onClick={onClose}
            style={{ padding: "10px 14px", borderRadius: 10, border: `1px solid ${th.border}`, background: th.bgCard, color: th.textMuted, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
            ✕ {isUrdu ? "بند کریں" : "Close"}
          </button>
        </div>

        {/* Preview wrapper */}
        <div style={{ background: "#f0f0f0", padding: "14px", borderRadius: 12, border: "1px solid #ccc", width: "100%", overflowX: "auto" }}>
          <div id="thermal-invoice" style={page}>

            {/* Logo */}
            {sp.logoBase64 && (
              <div style={{ ...center, marginBottom: 6 }}>
                <img src={sp.logoBase64} alt="logo" style={{ maxWidth: 56, maxHeight: 40, objectFit: "contain" }} />
              </div>
            )}

            {/* Shop name */}
            <div style={{ ...center, fontSize: "22px", fontWeight: 700, lineHeight: "28px", marginBottom: "4px", letterSpacing: "0.3px" }}>
              {L.shopName}
            </div>
            {L.address && <div style={{ ...center, ...bold500, fontSize: "10px", marginTop: 4,  lineHeight: 1.4 }}>{L.address}</div>}
            {L.phone1  && <div style={{ ...center, ...bold500, fontSize: "10px", marginTop: 2  }}>{L.phone1}</div>}
            {L.phone2  && <div style={{ ...center, ...bold500, fontSize: "10px", marginTop: 1  }}>{L.phone2}</div>}
            {L.phone3  && <div style={{ ...center, ...bold500, fontSize: "10px", marginTop: 1  }}>{L.phone3}</div>}

            {/* Bill No / Date */}
            <table style={{ ...tbl, marginTop: 8 }}>
              <tbody>
                <tr>
                  <td style={tdS("left")}>{L.billNoLbl}: {invoice}</td>
                  <td style={tdS("right")}>
                    {L.dateLbl}: {new Date(date).toLocaleDateString(
                      isUrdu ? "ur-PK" : "en-PK",
                      { day: "2-digit", month: "short", year: "numeric" }
                    )}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Supplier line */}
            <div style={{ fontWeight: 900, fontSize: "11px", marginTop: 2 }}>{L.partyLbl}: {supplier}</div>

            <div style={dash} />

            {/* Items table — SN / Item / Qty / Price / Amt */}
            <table className="inv-items" style={{ ...tbl, marginTop: 2 }}>
              <colgroup>
                <col style={{ width: COL_SN }} />
                <col style={{ width: COL_ITEM }} />
                <col style={{ width: COL_QTY }} />
                <col style={{ width: COL_PRICE }} />
                <col style={{ width: COL_AMT }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={thS(COL_SN, "center")}>{L.colSN}</th>
                  <th style={thS(COL_ITEM, "left")}>{L.colItem}</th>
                  <th style={thS(COL_QTY, "center")}>{L.colQty}</th>
                  <th style={thS(COL_PRICE, "right")}>{L.colPrice}</th>
                  <th style={thS(COL_AMT, "right")}>{L.colAmt}</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((li, i) => (
                  <tr key={i}>
                    <td style={tdS("center")}>{i + 1}</td>
                    <td style={{ ...tdS("left"), paddingRight: "6px" }}>{li.item}</td>
                    <td style={{...tdNum("center"), whiteSpace:"normal", wordBreak:"break-word", lineHeight:1.25, fontSize:"10px"}}>{li.qty}</td>
                    <td style={tdNum("right")}>
                      {Number.isInteger(Number(li.price)) ? Number(li.price) : Number(li.price).toFixed(1)}
                    </td>
                    <td style={tdNum("right")}>
                      {Number.isInteger(Number(li.amount)) ? Number(li.amount) : Number(li.amount).toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={dash} />

            {/* Subtotal row */}
            <table style={tbl}>
              <colgroup>
                <col style={{ width: "8%" }} /><col style={{ width: "40%" }} />
                <col style={{ width: "12%" }} /><col style={{ width: "20%" }} />
                <col style={{ width: "20%" }} />
              </colgroup>
              <tbody>
                <tr>
                  <td style={{ ...tdS("left"), fontWeight: 600 }} colSpan={2}>{L.subtotalLbl}</td>
                  <td style={tdNum("center")}>{lineItems.length}</td>
                  <td style={tdNum("right")} colSpan={2}>{formatPKR(grandTotal)}</td>
                </tr>
              </tbody>
            </table>

            <div style={dash} />

            {/* TOTAL */}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "15px", fontWeight: 900 }}>
              <span>{L.totalLbl}</span>
              <span>{formatPKR(grandTotal)}</span>
            </div>

            {(paymentMethod || isPartial || Number(remainingAmount) > 0) && (
              <>
                <div style={dash} />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", fontWeight: 600 }}>
                  <span>{L.payLbl}</span>
                  <span>
                    {paymentMethod === "credit" ? (isUrdu ? "ادھار" : "Credit")
                      : paymentMethod === "bank" ? `Bank: ${accountName || bankName || ""}`
                      : paymentMethod === "jazzcash" ? "JazzCash"
                      : paymentMethod === "easypaisa" ? "Easypaisa"
                      : paymentMethod === "wallet" ? (accountName || bankName || "Wallet")
                      : (accountName || (isUrdu ? "نقد" : "Cash"))}
                  </span>
                </div>
                {(isPartial || Number(remainingAmount) > 0) && (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", fontWeight: 600, marginTop: 4 }}>
                      <span>{L.paidNowLbl}</span>
                      <span>{formatPKR(paidAmount)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", fontWeight: 700, marginTop: 4 }}>
                      <span>{L.remainingLbl}</span>
                      <span>{formatPKR(remainingAmount)}</span>
                    </div>
                  </>
                )}
              </>
            )}

            <div style={dash} />

            {/* Time */}
            <table style={tbl}>
              <tbody>
                <tr>
                  <td style={{ ...tdS("left"), padding: "6px 3px" }}>{L.timeLbl}</td>
                  <td colSpan={4} style={{ ...tdS("right"), padding: "6px 3px", whiteSpace: "nowrap" }}>
                    {new Date(createdAt || Date.now()).toLocaleTimeString(isUrdu ? "ur-PK" : "en-PK", { hour: "2-digit", minute: "2-digit" })}
                  </td>
                </tr>
              </tbody>
            </table>

            <OkiieeBrandFooter />

          </div>
        </div>
      </div>
    </>
  );
}

// ─── Cell Input ───────────────────────────────────────────────────────────────
function CellInput({ value, onChange, placeholder }) {
  const th = useTheme();
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder || ""}
      style={{ background: th.input, border: `1px solid ${th.inputBorder}`, color: th.text, borderRadius: 8, padding: "7px 9px", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" }}
      onFocus={e => e.target.style.borderColor = "#1abc9c"}
      onBlur={e  => e.target.style.borderColor = "inherit"}
    />
  );
}

// ─── Purchase Entry Table ─────────────────────────────────────────────────────
function PurchaseEntryTable({ category, rows, setRows, productPrice, product }) {
  const th = useTheme();
  const { t } = useLang();
  const pp = Number(productPrice) || 0;
  const rowUnit = rows[0]?.unit || productUnitOf(product);
  const unitLbl = getUnitLabel(rowUnit);

  const colDefs = {
    Chader:   [{ key: "purchasePrice", label: t.purchasePrice, placeholder: "0" }, { key: "salePrice", label: t.salePrice, placeholder: "0" }, { key: "weight", label: t.weight, placeholder: "kg" }],
    Net:      [{ key: "feet", label: t.feet, placeholder: "0" }, { key: "width", label: "Width (ft)", placeholder: "e.g. 3" }, { key: "purchasePricePerFeet", label: t.purchasePricePerFt, placeholder: "0" }, { key: "salePricePerFeet", label: t.salePricePerFt, placeholder: "0" }],
    Hardware: [{ key: "unit", label: "Unit", isSelect: true }, { key: "qty", label: t.qty, placeholder: "0" }, { key: "purchasePrice", label: `Cost / ${unitLbl}`, placeholder: "0" }, { key: "salePrice", label: `Sale / ${unitLbl}`, placeholder: "0" }],
    Custom:   [{ key: "unit", label: "Unit", isSelect: true }, { key: "qty", label: t.qty, placeholder: "0" }, { key: "purchasePrice", label: `Cost / ${unitLbl}`, placeholder: "0" }, { key: "salePrice", label: `Sale / ${unitLbl}`, placeholder: "0" }],
    Pipe:     [{ key: "length", label: "Length (ft)", placeholder: "e.g. 20" }, { key: "quantity", label: "Pieces", placeholder: "0" }, { key: "purchasePercentage", label: "Purchase %", placeholder: "e.g. -5" }],
  };
  const cols = colDefs[category] || colDefs.Hardware;

  const addRow    = () => setRows(rs => [...rs, prefillPurchaseRow(category, product)]);
  const removeRow = (idx) => setRows(rs => rs.filter((_, i) => i !== idx));
  const roundAmt = (n) => {
    const x = Math.round((Number(n) || 0) * 100) / 100;
    return Number.isInteger(x) ? String(x) : String(x);
  };
  const updateRow = (idx, key, val) => setRows(rs => rs.map((r, i) => {
    if (i !== idx) return r;
    if (key !== "unit") return { ...r, [key]: val };
    const from = r.unit || "piece";
    const to = val;
    if (!canConvert(from, to) || from === to) return { ...r, unit: to };
    const next = { ...r, unit: to };
    if (Number(r.purchasePrice) > 0) next.purchasePrice = roundAmt(convertPrice(r.purchasePrice, from, to));
    if (Number(r.salePrice) > 0) next.salePrice = roundAmt(convertPrice(r.salePrice, from, to));
    if (Number(r.qty) > 0) next.qty = roundAmt(convertQuantity(r.qty, from, to));
    return next;
  }));
  const rowTotal  = (row) => calcRowAmt(row, category, pp);
  const grandTotal = rows.reduce((s, r) => s + rowTotal(r), 0);

  const getPipeRowDisplay = (row) => {
    const length     = parseLength(row.length);
    const pieces     = Number(row.quantity) || 0;
    const pct        = Number(row.purchasePercentage) || 0;
    const pricePerFt = pp * (1 + pct / 100);
    const pricePerPc = pricePerFt * length;
    const total      = pricePerPc * pieces;
    return { pieces, pricePerPc, total };
  };

  const thCell = { padding: "7px 6px", color: th.textMuted, fontSize: 12, textTransform: "uppercase", fontWeight: 600, whiteSpace: "nowrap", textAlign: "left" };
  const tdCell = { padding: "5px 6px", verticalAlign: "middle" };

  const pipeHint = category === "Pipe" && pp > 0
    ? <span style={{ fontSize: 12, color: "#60a5fa", fontWeight: 600 }}>Price: Rs {pp}/ft — Pieces × Length = Total Amount</span>
    : null;

  return (
    <div style={{ borderRadius: 12, border: `1px solid ${th.border}`, overflow: "hidden", background: th.bgCard }}>
      {pipeHint && (
        <div style={{ padding: "6px 12px", background: "rgba(96,165,250,0.08)", borderBottom: `1px solid ${th.border}`, display: "flex", alignItems: "center", gap: 6 }}>
          {pipeHint}
        </div>
      )}
      {rows.length === 0
        ? <div style={{ padding: "16px", textAlign: "center", color: th.textDim, fontSize: 14 }}>☝️ {t.startEntry}</div>
        : (
          <div style={{ overflowX: "auto", maxHeight: 240, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
                <tr style={{ background: th.thHead, borderBottom: `1px solid ${th.border}` }}>
                  <th style={{ ...thCell, width: 28 }}>#</th>
                  {cols.map(c => <th key={c.key} style={thCell}>{c.label}</th>)}
                  <th style={{ ...thCell, textAlign: "center" }}>Sub</th>
                  <th style={{ ...thCell, width: 36 }}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const amt      = rowTotal(row);
                  const isPipe   = category === "Pipe";
                  const pipeDisp = isPipe ? getPipeRowDisplay(row) : null;
                  return (
                    <tr
                      key={row._id}
                      style={{ borderBottom: `1px solid ${th.border}` }}
                      onMouseEnter={e => e.currentTarget.style.background = th.rowHover}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <td style={{ ...tdCell, padding: "4px 6px", color: th.textDim, fontSize: 11 }}>{idx + 1}</td>
                      {cols.map(c => (
                        <td key={c.key} style={tdCell}>
                          {category === "Chader" && c.key === "weight" ? (
                            <WeightKgGInput key={row._id} value={row[c.key]} onChange={v => updateRow(idx, c.key, v)} compact />
                          ) : c.isSelect ? (
                            <select
                              value={row[c.key] || "piece"}
                              onChange={e => updateRow(idx, c.key, e.target.value)}
                              style={{ background: th.input, border: `1px solid ${th.inputBorder}`, color: th.text, borderRadius: 8, padding: "7px 6px", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" }}
                              onFocus={e => e.target.style.borderColor = "#1abc9c"}
                              onBlur={e  => e.target.style.borderColor = th.inputBorder}
                            >
                              {unitOptions.map(opt => (
                                <option key={opt.value} value={opt.value} style={{ background: th.bgModal || th.bgCard }}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <CellInput value={row[c.key]} onChange={v => updateRow(idx, c.key, v)} placeholder={c.placeholder} />
                          )}
                        </td>
                      ))}
                      <td style={{ ...tdCell, textAlign: "center" }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                          <span style={{ color: "#34d399", fontWeight: 700, fontSize: 13, whiteSpace: "nowrap" }}>
                            {amt > 0 ? formatPKR(amt) : "—"}
                          </span>
                          {isPipe && pipeDisp && pipeDisp.pieces > 0 && (
                            <span style={{ fontSize: 10, color: th.textDim }}>{pipeDisp.pieces} pcs</span>
                          )}
                        </div>
                      </td>
                      <td style={{ ...tdCell, textAlign: "center" }}>
                        <button
                          onClick={() => removeRow(idx)}
                          style={{ background: "rgba(239,68,68,0.12)", border: "none", borderRadius: 5, color: "#f87171", cursor: "pointer", padding: "3px 7px", fontSize: 11, fontWeight: 700 }}
                          onMouseEnter={e => e.currentTarget.style.background = "rgba(239,68,68,0.25)"}
                          onMouseLeave={e => e.currentTarget.style.background = "rgba(239,68,68,0.12)"}
                        >✕</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      }
      <div style={{ padding: "7px 12px", borderTop: `1px solid ${th.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", background: th.thHead }}>
        <button
          onClick={addRow}
          style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 8, border: `1.5px dashed ${th.border}`, background: "transparent", color: th.textMuted, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "#1abc9c"; e.currentTarget.style.color = "#1abc9c"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = th.border;  e.currentTarget.style.color = th.textMuted; }}
        >
          <Icon path={ICONS.plus} size={12} /> {t.addRow || "+ Add Row"}
        </button>
        {grandTotal > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: th.textMuted, fontSize: 13, fontWeight: 600 }}>{t.totalPurchase}:</span>
            <span style={{ color: "#34d399", fontWeight: 900, fontSize: 16 }}>{formatPKR(grandTotal)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Product Block ────────────────────────────────────────────────────────────
function ProductBlock({ index, products, block, onChange, onRemove, canRemove }) {
  const th = useTheme();
  const { t } = useLang();
  const wrapRef = useRef(null);
  const keepInViewRef = useRef(false);
  const [open,         setOpen]         = useState(true);
  const [searchQuery,  setSearchQuery]  = useState("");
  const makeEmptyRow = (product) => prefillPurchaseRow(product.category, product);

  const handleSelectProduct = (product) => {
    keepInViewRef.current = true;
    setSearchQuery(product.name);
    setShowDropdown(false);
    onChange({ ...block, productId: product._id, rows: [makeEmptyRow(product)] });
  };

  const filteredProducts = products.filter(p =>
    (p.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.category || "").toLowerCase().includes(searchQuery.toLowerCase())
  );
  const { open: showDropdown, setOpen: setShowDropdown, hi, setHi, onKeyDown: navKeys, listRef } = useTypeaheadNav(filteredProducts, handleSelectProduct);

  useLayoutEffect(() => {
    if (!keepInViewRef.current) return;
    keepInViewRef.current = false;
    wrapRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [block.productId]);

  const selectedProduct = products.find(p => p._id === block.productId);
  const category        = selectedProduct?.category || "";
  const productPrice    = selectedProduct?.price    || 0;

  const setRows = (updater) => {
    const newRows = typeof updater === "function" ? updater(block.rows) : updater;
    onChange({ ...block, rows: newRows });
  };

  const blockTotal = block.rows.reduce((s, r) => s + calcRowAmt(r, category, productPrice), 0);
  const catColor   = category === "Pipe" ? "#60a5fa" : category === "Chader" ? "#34d399" : category === "Net" ? "#f472b6" : category === "Hardware" ? "#fbbf24" : "#a78bfa";
  const catBg      = category === "Pipe" ? "rgba(96,165,250,0.1)" : category === "Chader" ? "rgba(26,188,156,0.1)" : category === "Net" ? "rgba(244,114,182,0.1)" : category === "Hardware" ? "rgba(251,191,36,0.1)" : "rgba(167,139,250,0.1)";

  const inpS = { background: th.input, border: `1px solid ${th.inputBorder}`, color: th.text, borderRadius: 10, padding: "9px 11px", fontSize: 14, outline: "none", width: "100%", boxSizing: "border-box" };

  const pipeSummary = category === "Pipe" && block.rows.length > 0
    ? block.rows.reduce((acc, r) => {
        const pieces     = Number(r.quantity) || 0;
        const length     = parseLength(r.length);
        const pct        = Number(r.purchasePercentage) || 0;
        const pricePerFt = (Number(productPrice) || 0) * (1 + pct / 100);
        const pricePerPc = pricePerFt * length;
        const total      = pricePerPc * pieces;
        return { pieces: acc.pieces + pieces, total: acc.total + total };
      }, { pieces: 0, total: 0 })
    : null;

  return (
    <div ref={wrapRef} style={{ borderRadius: 12, border: `1.5px solid ${th.border}`, overflow: "visible", background: th.bgCard }}>
      <div style={{ padding: "8px 12px", background: th.thHead, borderBottom: open ? `1px solid ${th.border}` : "none", display: "flex", alignItems: "center", gap: 8, borderRadius: open ? "10px 10px 0 0" : 10 }}>
        <button onClick={() => setOpen(o => !o)} style={{ background: "none", border: "none", cursor: "pointer", color: th.textMuted, padding: 0, fontSize: 14, lineHeight: 1 }}>{open ? "▾" : "▸"}</button>
        <span style={{ color: th.text, fontWeight: 700, fontSize: 13 }}>🛒 Product {index + 1}</span>
        {!open && selectedProduct && <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: catBg, color: catColor, fontWeight: 600 }}>{selectedProduct.name}</span>}
        {block.rows.length > 0 && <span style={{ fontSize: 11, color: th.textDim, marginLeft: 2 }}>{block.rows.length} row{block.rows.length > 1 ? "s" : ""}</span>}
        {blockTotal > 0 && <span style={{ fontSize: 13, color: "#34d399", fontWeight: 700, marginLeft: "auto" }}>{formatPKR(blockTotal)}</span>}
        {canRemove && (
          <button
            onClick={onRemove}
            style={{ background: "rgba(239,68,68,0.12)", border: "none", borderRadius: 6, color: "#f87171", cursor: "pointer", padding: "3px 8px", fontSize: 11, fontWeight: 700, marginLeft: blockTotal > 0 ? 6 : 0 }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(239,68,68,0.25)"}
            onMouseLeave={e => e.currentTarget.style.background = "rgba(239,68,68,0.12)"}
          >✕</button>
        )}
      </div>

      {open && (
        <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <label style={{ color: th.textMuted, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4, display: "block" }}>
              {t.selectProduct} <span style={{ color: "#f87171" }}>*</span>
            </label>
            <div style={{ position: "relative" }}>
              <input
                type="text"
                value={searchQuery}
                data-product-search="1"
                data-suggest-open={showDropdown ? "1" : "0"}
                onChange={e => { setSearchQuery(e.target.value); setShowDropdown(true); setHi(0); onChange({ ...block, productId: "", rows: [] }); }}
                onFocus={() => setShowDropdown(true)}
                onKeyDown={navKeys}
                placeholder={`🔍 ${t.selectProduct}...`}
                style={inpS}
                autoComplete="off"
              />
              {showDropdown && (
                <>
                  <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 998 }} onMouseDown={(e) => { e.preventDefault(); setShowDropdown(false); }} />
                  <div ref={listRef} style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 999, background: th.bgModal || th.bgCard, border: `1px solid ${th.border}`, borderRadius: 10, maxHeight: 200, overflowY: "auto", boxShadow: "0 4px 16px rgba(0,0,0,0.18)" }}>
                    {filteredProducts.length === 0
                      ? <div style={{ padding: "12px", textAlign: "center", color: th.textDim, fontSize: 13 }}>No products found</div>
                      : filteredProducts.map((p, i) => (
                        <div
                          key={p._id}
                          data-nav-i={i}
                          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); handleSelectProduct(p); }}
                          onMouseEnter={() => setHi(i)}
                          style={{ padding: "9px 13px", cursor: "pointer", borderBottom: `1px solid ${th.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 14, color: th.text, background: i === hi ? "rgba(26,188,156,0.16)" : "transparent" }}
                        >
                          <span>{p.name}</span>
                          <span style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                            {(() => {
                              const cs = productCostSale(p);
                              return (
                                <span style={{ fontSize: 11, color: th.textMuted, fontWeight: 600 }}>
                                  {cs.cost > 0 ? formatPKR(cs.cost) : "—"}
                                  <span style={{ color: "#34d399" }}> · {cs.sale > 0 ? formatPKR(cs.sale) : "—"}</span>
                                </span>
                              );
                            })()}
                            <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: catBg, color: catColor, fontWeight: 600 }}>{p.category}</span>
                          </span>
                        </div>
                      ))
                    }
                  </div>
                </>
              )}
            </div>
          </div>

          {selectedProduct && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 11px", borderRadius: 8, background: catBg, border: `1px solid ${catColor}40`, flexWrap: "wrap" }}>
              <span style={{ color: catColor, fontSize: 12, fontWeight: 700 }}>{category}</span>
              <span style={{ color: th.text, fontSize: 13, fontWeight: 600 }}>{selectedProduct.name}</span>
              {category === "Pipe" && productPrice > 0 && <span style={{ marginLeft: "auto", color: "#60a5fa", fontSize: 12, fontWeight: 600 }}>Rs {productPrice}/ft</span>}
              {category !== "Pipe" && (() => {
                const cs = productCostSale(selectedProduct);
                return (
                  <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, display: "flex", gap: 10 }}>
                    <span style={{ color: th.text }}>{formatPKR(cs.cost)} <span style={{ color: th.textMuted, fontWeight: 500 }}>cost</span></span>
                    <span style={{ color: "#34d399" }}>{formatPKR(cs.sale)} <span style={{ opacity: 0.8, fontWeight: 500 }}>sale</span></span>
                  </span>
                );
              })()}
            </div>
          )}

          {category && <PurchaseEntryTable category={category} rows={block.rows} setRows={setRows} productPrice={productPrice} product={selectedProduct} />}
          {!category && <div style={{ padding: "14px", textAlign: "center", color: th.textDim, fontSize: 13, borderRadius: 8, border: `1px dashed ${th.border}` }}>👆 Select a product to add entries</div>}

          {pipeSummary && pipeSummary.pieces > 0 && (
            <div style={{ padding: "7px 11px", borderRadius: 8, background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.2)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "#60a5fa" }}>📦 Total: {pipeSummary.pieces} pieces</span>
              <span style={{ fontSize: 13, color: "#34d399", fontWeight: 700 }}>{formatPKR(pipeSummary.total)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Purchase Form Modal ──────────────────────────────────────────────────────
function PurchaseFormModal({ products, purchases = [], loadProducts, loadPurchases, onSave, onClose, extraNames=[] }) {
  const th = useTheme();
  const { t, lang } = useLang();
  const isUrdu = lang === "ur";
  const accounts = useAccounts();

  const [supplier,    setSupplier]    = useState("");
  const [invoiceNum,  setInvoiceNum]  = useState(`PO-${Date.now().toString().slice(-4)}`);
  const [date,        setDate]        = useState(todayStr());
  const [saving,      setSaving]      = useState(false);
  const [showInvoice, setShowInvoice] = useState(false);
  const [invoiceData, setInvoiceData] = useState(null);
  const [payForm,     setPayForm]     = useState({ settlement: "full", accountId: "", paidAmount: "" });
  const [discountMode, setDiscountMode] = useState("pkr");
  const [discount, setDiscount] = useState("");
  const [cashPaid, setCashPaid] = useState("");
  const [quickPick, setQuickPick] = useState(false);
  const [quickProduct, setQuickProduct] = useState(false);
  const [quickHardware, setQuickHardware] = useState(false);

  const newBlock = () => ({ _id: Date.now() + Math.random(), productId: "", rows: [] });
  const [blocks, setBlocks] = useState([newBlock()]);

  const addBlock    = () => setBlocks(bs => [...bs, newBlock()]);
  const removeBlock = (idx) => setBlocks(bs => bs.filter((_, i) => i !== idx));
  const updateBlock = (idx, val) => setBlocks(bs => bs.map((b, i) => i === idx ? val : b));

  const itemsTotal = blocks.reduce((sum, block) => {
    const prod     = products.find(p => p._id === block.productId);
    const category = prod?.category || "";
    const pp       = prod?.price || 0;
    return sum + block.rows.reduce((s, r) => s + calcRowAmt(r, category, pp), 0);
  }, 0);
  const discountAmt = calcDiscount(itemsTotal, discount, discountMode);
  const grandTotal = Math.max(0, Math.round((itemsTotal - discountAmt) * 100) / 100);
  const pay = derivePayment(grandTotal, payForm, accounts);
  const tendered = Number(cashPaid) || 0;
  const changeDue = tendered > 0 ? Math.max(0, Math.round((tendered - (pay.settlement === "full" ? grandTotal : (Number(pay.paidAmount) || 0))) * 100) / 100) : 0;
  const canSave = supplier && blocks.every(b => b.productId && b.rows.length > 0) && isPayValid(grandTotal, payForm, accounts);

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    let allOk = true;
    const invoiceProducts = [];

    for (const block of blocks) {
      const product  = products.find(p => p._id === block.productId);
      const category = product?.category || "";
      const pp       = product?.purchasePrice || product?.price || 0;
      let total = 0, qty = 0;

      let purchasePricePerUnit = pp;
      if (block.rows && block.rows.length > 0) {
        const firstRow = block.rows[0];
        if (category === "Chader" && Number(firstRow.purchasePrice) > 0) {
          purchasePricePerUnit = Number(firstRow.purchasePrice);
        } else if (category === "Net" && Number(firstRow.purchasePricePerFeet) > 0) {
          purchasePricePerUnit = Number(firstRow.purchasePricePerFeet);
        } else if ((category === "Hardware" || category === "Custom") && Number(firstRow.purchasePrice) > 0) {
          purchasePricePerUnit = Number(firstRow.purchasePrice);
        }
      }

      if (category === "Chader") {
        total = block.rows.reduce((s, r) => s + calcRowAmt(r, category, pp), 0);
        qty   = block.rows.reduce((s, r) => s + (Number(r.weight) || 0), 0);
      } else if (category === "Net") {
        total = block.rows.reduce((s, r) => s + calcRowAmt(r, category, pp), 0);
        qty   = block.rows.reduce((s, r) => s + (Number(r.feet) || 0) * (Number(r.width) || 1), 0);
      } else if (category === "Pipe") {
        total = block.rows.reduce((s, r) => s + calcRowAmt(r, category, pp), 0);
        qty   = block.rows.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
      } else {
        total = block.rows.reduce((s, r) => s + calcRowAmt(r, category, pp), 0);
        qty   = block.rows.reduce((s, r) => s + (Number(r.qty) || 0), 0);
      }

      const rate = qty > 0 ? total / qty : purchasePricePerUnit;
      const purchaseUnit = (category === "Hardware" || category === "Custom") && block.rows[0]?.unit 
        ? block.rows[0].unit 
        : null;
      const res  = await onSave({
        supplier, invoice: invoiceNum, date, productId: block.productId, rows: block.rows, total, qty, rate, category, productPrice: purchasePricePerUnit,
        paymentMethod: pay.paymentMethod, bankName: pay.bankName, accountId: pay.accountId, accountName: pay.accountName,
        settlement: pay.settlement, isPartial: pay.isPartial, paidAmount: pay.paidAmount, remainingAmount: pay.remainingAmount,
        unit: purchaseUnit,
        discount: discountAmt,
        discountType: discountMode,
        discountPct: discountMode === "pct" ? (Number(discount) || 0) : 0,
        cashReceived: tendered,
        changeDue,
      });
      if (!res || !res.success) { allOk = false; break; }
      invoiceProducts.push({ productName: product?.name || "", category, rows: block.rows, total, qty, productPrice: purchasePricePerUnit });
    }

    setSaving(false);
    if (allOk) {
      try {
        await recordTradeFinance({
          kind: "purchase",
          partyName: supplier,
          invoice: invoiceNum,
          date,
          paid: pay.paidAmount,
          remaining: pay.remainingAmount,
          accountId: pay.accountId,
        });
      } catch (e) {
        console.error(e);
      }
      setInvoiceData({
        invoice: invoiceNum, date, supplier, products: invoiceProducts,
        paymentMethod: pay.paymentMethod, bankName: pay.bankName, accountName: pay.accountName,
        isPartial: pay.isPartial, paidAmount: pay.paidAmount, remainingAmount: pay.remainingAmount,
        discount: discountAmt, cashReceived: tendered, changeDue,
      });
      setShowInvoice(true);
    }
  };

  const inpS = { background: th.input, border: `1px solid ${th.inputBorder}`, color: th.text, borderRadius: 10, padding: "9px 12px", fontSize: 14, outline: "none", width: "100%", boxSizing: "border-box" };
  const Lbl  = ({ c, req }) => (
    <label style={{ color: th.textMuted, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4, display: "block" }}>
      {c}{req && <span style={{ color: "#f87171", marginLeft: 3 }}>*</span>}
    </label>
  );

  if (showInvoice && invoiceData)
    return <CombinedThermalInvoice invoiceData={invoiceData} onClose={onClose} isUrdu={isUrdu} />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "10px", borderRadius: 12, background: th.thHead, border: `1px solid ${th.border}` }}>
        <div>
          <Lbl c={t.invoiceNum} />
          <input value={invoiceNum} onChange={e => setInvoiceNum(e.target.value)} style={inpS} onFocus={e => e.target.style.borderColor = "#1abc9c"} onBlur={e => e.target.style.borderColor = th.inputBorder} />
        </div>
        <div>
          <Lbl c={t.date} />
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inpS} onFocus={e => e.target.style.borderColor = "#1abc9c"} onBlur={e => e.target.style.borderColor = th.inputBorder} />
        </div>
        <div style={{ gridColumn: "1/-1" }}>
          <Lbl c={t.supplier} req />
          <PartyNamePicker
            type="supplier"
            value={supplier}
            onChange={setSupplier}
            extraNames={extraNames}
            isUrdu={isUrdu}
            inputStyle={inpS}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={() => setQuickPick(true)}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "10px 12px", borderRadius: 10, border: "none", cursor: "pointer", background: "linear-gradient(135deg,#0f766e,#14b8a6)", color: "#fff", fontWeight: 800, fontSize: 13 }}
      >
        + {isUrdu ? "نیا پروڈکٹ فوری شامل کریں" : "Add new product instantly"}
      </button>

      {blocks.map((block, idx) => (
        <ProductBlock
          key={block._id}
          index={idx}
          products={products}
          block={block}
          onChange={val => updateBlock(idx, val)}
          onRemove={() => removeBlock(idx)}
          canRemove={blocks.length > 1}
        />
      ))}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <button
          data-add-product="1"
          type="button"
          onClick={addBlock}
          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px", borderRadius: 10, border: `2px dashed ${th.border}`, background: "transparent", color: th.textMuted, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "#1abc9c"; e.currentTarget.style.color = "#1abc9c"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = th.border;  e.currentTarget.style.color = th.textMuted; }}
        >
          <Icon path={ICONS.plus} size={14} /> + {isUrdu ? "پروڈکٹ شامل کریں" : "Add Product"}
          <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.75 }}>(Ctrl+A)</span>
        </button>

        {grandTotal > 0 && (
          <PaymentTerms
            total={grandTotal}
            form={payForm}
            setForm={setPayForm}
            accounts={accounts}
            isUrdu={isUrdu}
            partyKind="supplier"
          />
        )}

        {itemsTotal > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "9px 14px", borderRadius: 10, background: "rgba(26,188,156,0.08)", border: "1px solid rgba(26,188,156,0.25)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: th.textMuted, fontSize: 13 }}>{isUrdu ? "آئٹمز کل:" : "Items total:"}</span>
              <span style={{ color: "#34d399", fontWeight: 700, fontSize: 16 }}>{formatPKR(itemsTotal)}</span>
            </div>
            <DiscountCashFields
              discount={discount}
              setDiscount={setDiscount}
              discountMode={discountMode}
              setDiscountMode={setDiscountMode}
              cashValue={cashPaid}
              setCashValue={setCashPaid}
              discountAmt={discountAmt}
              isUrdu={isUrdu}
              cashLabel={isUrdu ? "نقد ادا (Rs)" : "Cash paid (Rs)"}
              inpS={inpS}
            />
            {discountAmt > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ color: th.textMuted }}>{isUrdu ? "رعایت:" : "Discount:"}</span>
                <span style={{ color: "#f87171", fontWeight: 800 }}>- {formatPKR(discountAmt)}</span>
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <span style={{ color: th.textMuted, fontSize: 13, fontWeight: 600 }}>{isUrdu ? "کل رقم:" : "Grand Total:"}</span>
              <span style={{ color: "#34d399", fontWeight: 900, fontSize: 17 }}>{formatPKR(grandTotal)}</span>
            </div>
            {tendered > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ color: th.textMuted }}>{isUrdu ? "نقد ادا:" : "Cash paid:"}</span>
                <span style={{ color: "#60a5fa", fontWeight: 800 }}>{formatPKR(tendered)}</span>
              </div>
            )}
            {changeDue > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ color: "#fbbf24", fontWeight: 800 }}>{isUrdu ? "واپسی:" : "Change:"}</span>
                <span style={{ color: "#fbbf24", fontWeight: 900 }}>{formatPKR(changeDue)}</span>
              </div>
            )}
            {pay.settlement !== "full" && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ color: th.textMuted }}>{isUrdu ? "ابھی ادا:" : "Paying now:"}</span>
                <span style={{ color: "#fbbf24", fontWeight: 800 }}>{formatPKR(pay.paidAmount)}</span>
              </div>
            )}
            {pay.remainingAmount > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ color: th.textMuted }}>{isUrdu ? "قابل ادائیگی:" : "Payable:"}</span>
                <span style={{ color: "#f87171", fontWeight: 800 }}>{formatPKR(pay.remainingAmount)}</span>
              </div>
            )}
          </div>
        )}

        <SaveBtn label={saving ? "..." : t.savePurchase} onClick={handleSave} loading={saving} disabled={!canSave} />
      </div>
      {quickPick && (
        <Modal title={isUrdu ? "نیا آئٹم" : "Add new item"} onClose={() => setQuickPick(false)} layer={220}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <p style={{ color: th.textMuted, fontSize: 13, margin: 0 }}>
              {isUrdu ? "پروڈکٹ بنائیں یا ہارڈ ویئر آئٹم بنائیں — خریداری پر رہتے ہوئے" : "Create a product or a hardware item without leaving this purchase."}
            </p>
            <button type="button" onClick={() => { setQuickPick(false); setQuickProduct(true); }}
              style={{ padding: "14px 16px", borderRadius: 12, border: `1px solid ${th.border}`, background: th.bgCard, color: th.text, fontWeight: 800, fontSize: 14, cursor: "pointer", textAlign: "left" }}>
              🔩 {isUrdu ? "پروڈکٹ شامل کریں" : "Add Product"}
              <div style={{ fontWeight: 500, fontSize: 12, color: th.textMuted, marginTop: 4 }}>{isUrdu ? "پائپ / چادر / جالی / کسٹم" : "Pipe / Chader / Net / Custom"}</div>
            </button>
            <button type="button" onClick={() => { setQuickPick(false); setQuickHardware(true); }}
              style={{ padding: "14px 16px", borderRadius: 12, border: `1px solid ${th.border}`, background: th.bgCard, color: th.text, fontWeight: 800, fontSize: 14, cursor: "pointer", textAlign: "left" }}>
              🔧 {isUrdu ? "ہارڈ ویئر پروڈکٹ شامل کریں" : "Add Hardware Product"}
              <div style={{ fontWeight: 500, fontSize: 12, color: th.textMuted, marginTop: 4 }}>{isUrdu ? "نٹ، بولٹ، ٹولز وغیرہ" : "Nuts, bolts, tools, etc."}</div>
            </button>
          </div>
        </Modal>
      )}
      {quickProduct && (
        <ProductQuickAddModal
          loadProducts={loadProducts}
          loadPurchases={loadPurchases}
          onClose={() => setQuickProduct(false)}
        />
      )}
      {quickHardware && (
        <HardwareManageModal
          products={products}
          purchases={purchases}
          loadProducts={loadProducts}
          loadPurchases={loadPurchases}
          seed={null}
          onClose={() => setQuickHardware(false)}
          overlayZ={260}
        />
      )}
    </div>
  );
}

// ─── Purchase Page ────────────────────────────────────────────────────────────
function PurchasePage({ purchases, products, loadPurchases, loadProducts, purchaseReturns=[], loadPurchaseReturns, sales=[], saleReturns=[] }) {
  const th = useTheme();
  const { t, lang } = useLang();
  const { isMobile } = useResponsive();
  const isUrdu = lang === "ur";

  const [showModal,        setShowModal]        = useState(false);
  const [showReturnModal,  setShowReturnModal]  = useState(false);
  const [showDemandPopup,  setShowDemandPopup]  = useState(false);
  const [showReturnsPopup, setShowReturnsPopup] = useState(false);
  const [showInvPopup,     setShowInvPopup]     = useState(false);
  const [returnSeedId,     setReturnSeedId]     = useState("");
  const [printData,        setPrintData]        = useState(null);
  const [showSupplierList, setShowSupplierList] = useState(false);
  const [dateFilter,       setDateFilter]       = useState("today");
  const [customFrom,       setCustomFrom]       = useState("");
  const [customTo,         setCustomTo]         = useState("");
  const [viewGroup,        setViewGroup]        = useState(null);
  const [purchaseSearch,   setPurchaseSearch]   = useState("");

  const handleSave = async (payload) => {
    const { supplier, invoice, date, productId, rows, total, qty, rate, category, productPrice } = payload;
    const matchedProd   = products.find(p => p._id === productId);
    const resolvedPrice = Number(productPrice) || Number(matchedProd?.price) || 0;
      const data = {
      supplier, invoice, date, product: productId, rows, total, qty, rate, category,
      productName: matchedProd?.name || "", productPrice: resolvedPrice,
      paymentMethod: payload.paymentMethod || "cash",
      bankName: payload.bankName || "",
      accountId: payload.accountId || "",
      accountName: payload.accountName || "",
      settlement: payload.settlement || "full",
      isPartial: payload.isPartial || false,
      paidAmount: payload.paidAmount || 0,
      remainingAmount: payload.remainingAmount || 0,
      discount: Number(payload.discount) || 0,
      discountType: payload.discountType || "pkr",
      discountPct: Number(payload.discountPct) || 0,
      cashReceived: Number(payload.cashReceived) || 0,
      changeDue: Number(payload.changeDue) || 0,
      unit: payload.unit || rows?.[0]?.unit || matchedProd?.unit || "",
    };
    const res = await api.addPurchase(data);
    if (res.success) { await loadPurchases(); await loadProducts(); }
    else alert(res.message || "Error saving purchase");
    return res;
  };

  const delGroup = async (g) => {
    const items = g.items || [g];
    const inv = g.head?.invoice || g.head?.invoiceNum || g.invoice || g.invoiceNum || "";
    const n = items.length;
    const ok = window.confirm(
      n > 1
        ? (isUrdu ? `انوائس ${inv} کی ${n} آئٹمز حذف کریں؟` : `Delete invoice ${inv} (${n} items)?`)
        : t.deletePurchaseConfirm
    );
    if (!ok) return;
    for (const line of items) {
      const res = await api.deletePurchase(line._id);
      if (!res.success) { alert(res.message); return; }
    }
    await reverseTradeFinance({
      kind: "purchase",
      partyName: g.head?.supplier || g.supplier || g.supplierName,
      invoice: inv,
      paid: g.head?.paidAmount ?? g.paidAmount,
      accountId: g.head?.accountId || g.accountId,
    });
    setViewGroup(null);
    await loadPurchases(); await loadProducts(); await loadPurchaseReturns?.();
  };

  const delReturn = async (r) => {
    if (!window.confirm(isUrdu ? "کیا یہ واپسی حذف کریں؟" : "Delete this return?")) return;
    const res = await removePurchaseReturn(r._id);
    if (res.success) { await loadPurchaseReturns?.(); await loadProducts(); }
    else alert(res.message);
  };

  const filteredPurchases = [...purchases]
    .filter((p) => inDateFilter(p.date, dateFilter, customFrom, customTo, p.createdAt))
    .filter((p) => {
      const q = purchaseSearch.trim().toLowerCase();
      if (!q) return true;
      return [
        p.invoice, p.invoiceNum, p.supplier, p.supplierName, p.productName,
        safeProductName(p.product),
      ].filter(Boolean).join(" ").toLowerCase().includes(q);
    })
    .sort((a, b) => String(b.createdAt || b.date || "").localeCompare(String(a.createdAt || a.date || "")));
  const purchaseGroups = (() => {
    const map = new Map();
    filteredPurchases.forEach((p) => {
      const key = `${p.invoice || p.invoiceNum || p._id}|${p.date || ""}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    });
    return [...map.values()].map((items) => {
      items.sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
      const head = items[0];
      const names = items.map((p) => p.productName || safeProductName(p.product)).filter(Boolean);
      const cats = [...new Set(items.map((p) => p.category).filter(Boolean))];
      return {
        items,
        head,
        names,
        cats,
        total: items.reduce((s, p) => s + (Number(p.total) || 0), 0),
        due: Number(head.remainingAmount) || 0,
        paid: Number(head.paidAmount) || 0,
      };
    });
  })();
  const filteredReturns = (purchaseReturns || []).filter((r) => inDateFilter(r.date, dateFilter, customFrom, customTo, r.createdAt));
  const periodPurchaseAmt = filteredPurchases.reduce((s, p) => s + (Number(p.total) || 0), 0);
  const periodReturnAmt = filteredReturns.reduce((s, r) => s + (Number(r.total) || 0), 0);
  const periodNet = periodPurchaseAmt - periodReturnAmt;

  const filterLabel = dateFilter === "today" ? (isUrdu ? "آج" : "Today")
    : dateFilter === "yesterday" ? (isUrdu ? "کل" : "Yesterday")
    : dateFilter === "week" ? (isUrdu ? "ایک ہفتہ" : "1 Week")
    : dateFilter === "month" ? (isUrdu ? "ایک مہینہ" : "1 Month")
    : (customFrom || customTo) ? `${customFrom || "…"} → ${customTo || "…"}`
    : (isUrdu ? "تاریخ" : "Date");

  const toInvoiceProducts = (list) => list.map((p) => {
    const productId      = typeof p.product === "object" ? p.product?._id : p.product;
    const matchedProduct = products.find((pr) => pr._id === productId);
    const resolvedPrice  = Number(p.productPrice) || Number(matchedProduct?.price) || (typeof p.product === "object" ? Number(p.product?.price) : 0) || 0;
    return {
      productName:  p.productName || safeProductName(p.product),
      category:     p.category || "",
      rows:         p.rows || [],
      total:        p.total || 0,
      qty:          p.qty || 0,
      productPrice: resolvedPrice,
    };
  });

  const supplierGroups = {};
  filteredPurchases.forEach((p) => {
    const key = p.supplier || "—";
    if (!supplierGroups[key]) supplierGroups[key] = [];
    supplierGroups[key].push(p);
  });
  const supplierNames = Object.keys(supplierGroups);

  const handleSupplierInvoice = (supplierName) => {
    const supplierPurchases = supplierGroups[supplierName] || [];
    setPrintData({ invoice: isUrdu ? "کل خریداری" : "ALL PURCHASES", date: todayStr(), supplier: supplierName, products: toInvoiceProducts(supplierPurchases) });
    setShowSupplierList(false);
  };

  const openPurchaseInvoice = (g) => {
    const list = g.items || [g];
    const p = g.head || g;
    const inv = p.invoice || p.invoiceNum || "";
    setPrintData({
      invoice: inv || "PO", date: p.date || todayStr(), supplier: p.supplier || "—",
      products: toInvoiceProducts(list), createdAt: p.createdAt,
      paymentMethod: p.paymentMethod, bankName: p.bankName, accountName: p.accountName,
      isPartial: p.isPartial, paidAmount: p.paidAmount, remainingAmount: p.remainingAmount,
    });
  };

  const printFiltered = () => {
    if (!filteredPurchases.length) return;
    setPrintData({
      invoice: isUrdu ? `خریداری · ${filterLabel}` : `Purchases — ${filterLabel}`,
      date: todayStr(),
      supplier: isUrdu ? "تمام سپلائرز" : "All suppliers",
      products: toInvoiceProducts(filteredPurchases),
    });
  };

  const catBadge = (cat) => (
    <span style={{
      fontSize: 12, padding: "3px 9px", borderRadius: 20, fontWeight: 600,
      background: cat === "Pipe" ? "rgba(41,128,185,0.15)" : cat === "Chader" ? "rgba(26,188,156,0.15)" : cat === "Net" ? "rgba(244,114,182,0.15)" : cat === "Hardware" ? "rgba(251,191,36,0.15)" : "rgba(167,139,250,0.15)",
      color: cat === "Pipe" ? "#60a5fa" : cat === "Chader" ? "#34d399" : cat === "Net" ? "#f472b6" : cat === "Hardware" ? "#fbbf24" : "#a78bfa",
    }}>
      {isUrdu ? (cat ? getUrduItemLabel(cat) : "—") : (cat || "—")}
    </span>
  );

  const stockLabel = (cat, qty) => (
    cat === "Pipe"    ? `${Math.round(qty || 0)} pcs`
    : cat === "Chader" ? formatWeightKgG(qty || 0)
    : cat === "Net"    ? `${Math.round(qty || 0)} ft²`
    : Math.round(qty || 0)
  );

  const { stockedCount, inventoryAmount, demandZero, demandLow } = useMemo(
    () => inventoryStats(products, { purchases, sales, purchaseReturns, saleReturns, products }),
    [products, purchases, sales, purchaseReturns, saleReturns]
  );
  const demandCount = (demandZero?.length || 0) + (demandLow?.length || 0);

  const saleOf = (p) => {
    const r = (p.rows || [])[0] || {};
    return Number(r.salePrice) || Number(r.salePricePerFeet) || 0;
  };
  const costOf = (p) => Number(p.rate) || Number(p.productPrice) || 0;

  const openInvReturn = (p) => {
    setShowInvPopup(false);
    setShowDemandPopup(false);
    setReturnSeedId(p?._id || "");
    setShowReturnModal(true);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", padding: "12px 14px", borderRadius: 14, border: `1px solid ${th.border}`, background: th.bgCard }}>
        <DateFilterBar
          filter={dateFilter}
          setFilter={setDateFilter}
          customFrom={customFrom}
          setCustomFrom={setCustomFrom}
          customTo={customTo}
          setCustomTo={setCustomTo}
          search={purchaseSearch}
          setSearch={setPurchaseSearch}
          searchPlaceholder={isUrdu ? "انوائس / سپلائر / آئٹم" : "Invoice / supplier / item"}
        />
        <button
          onClick={printFiltered}
          disabled={!filteredPurchases.length}
          style={{ padding: "8px 14px", borderRadius: 10, border: "none", cursor: filteredPurchases.length ? "pointer" : "not-allowed", background: filteredPurchases.length ? "linear-gradient(135deg,#1abc9c,#2980b9)" : th.thHead, color: filteredPurchases.length ? "#fff" : th.textMuted, fontWeight: 700, fontSize: 13 }}
        >
          🖨️ {isUrdu ? "پرنٹ / PDF" : "Print / PDF"}
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(5, minmax(0, 1fr))", gap: 10 }}>
        <StatCard
          label={isUrdu ? "مدت کی خریداری" : "Period Purchases"}
          value={formatPKR(periodNet)}
          icon={ICONS.purchase}
          color="#3498db"
          sub={periodReturnAmt > 0 ? `− ${formatPKR(periodReturnAmt)}` : `${purchaseGroups.length} ${isUrdu ? "آرڈر" : "orders"}`}
        />
        <StatCard
          label={t.inventoryValue}
          value={formatPKR(inventoryAmount)}
          icon={ICONS.box}
          color="#f59e0b"
          sub={isUrdu ? "کلک کرکے دیکھیں" : "Click to open"}
          onClick={() => setShowInvPopup(true)}
        />
        <StatCard
          label={isUrdu ? "اسٹاک لسٹ" : "Stock List"}
          value={stockedCount}
          icon={ICONS.box}
          color="#22c55e"
          sub={isUrdu ? "کلک کرکے دیکھیں" : "Click to open"}
          onClick={() => setShowInvPopup(true)}
        />
        <StatCard
          label={isUrdu ? "ڈیمانڈ" : "Demand"}
          value={demandCount}
          icon={ICONS.warning}
          color="#ea580c"
          sub={isUrdu ? "زیرو + کم اسٹاک" : "Out of stock + low"}
          onClick={() => setShowDemandPopup(true)}
        />
        <StatCard
          label={isUrdu ? "واپسی" : "Returns"}
          value={filteredReturns.length}
          icon={ICONS.trend_down}
          color="#ef4444"
          sub={isUrdu ? "کلک کرکے دیکھیں" : "Click to view"}
          onClick={() => setShowReturnsPopup(true)}
        />
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <div>
            <h3 style={{ color: th.text, fontWeight: 700, margin: 0, fontSize: 16 }}>
              {isUrdu ? "خریداریاں" : "Purchases"} · {filterLabel}
            </h3>
            <p style={{ color: th.textMuted, fontSize: 12, margin: "4px 0 0" }}>
              {isUrdu ? "آئٹمز دیکھنے کے لیے قطار پر کلک کریں" : "Click a row to see items"}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {filteredPurchases.length > 0 && (
              <button
                onClick={() => setShowSupplierList(true)}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 12, border: "none", cursor: "pointer", background: "linear-gradient(135deg,#9b59b6,#8e44ad)", color: "white", fontWeight: 600, fontSize: 14 }}
              >
                📊 {isMobile ? (isUrdu ? "سپلائر" : "Sup") : (isUrdu ? "سپلائر وار اینوائس" : "Supplier Invoice")}
              </button>
            )}
            <button
              onClick={() => { setReturnSeedId(""); setShowReturnModal(true); }}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 12, border: "none", cursor: "pointer", background: "linear-gradient(135deg,#dc2626,#f87171)", color: "white", fontWeight: 600, fontSize: 14 }}
            >
              ↩ {isMobile ? (isUrdu ? "واپسی" : "Return") : t.purchaseReturn}
            </button>
            <button
              onClick={() => setShowModal(true)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 12, border: "none", cursor: "pointer", background: "linear-gradient(135deg,#1abc9c,#2980b9)", color: "white", fontWeight: 600, fontSize: 14 }}
            >
              <Icon path={ICONS.plus} size={15} />{isMobile ? "+" : t.addPurchase}
            </button>
          </div>
        </div>
        <Table
          cols={[t.invoiceNum, isUrdu ? "تاریخ / وقت" : "Date / Time", t.supplier, t.name, t.category, t.quantity, t.totalLabel, isUrdu ? "ادائیگی" : "Pay"]}
          rows={purchaseGroups.map((g) => {
            const p = g.head;
            const multi = g.items.length > 1;
            const nameLabel = !g.names.length
              ? "—"
              : multi ? `${g.names[0]} +${g.names.length - 1}` : g.names[0];
            return {
              data: g,
              cells: [
                <span style={{ fontFamily: "monospace", color: "#60a5fa", fontSize: 13 }}>{p.invoice || p.invoiceNum || "—"}</span>,
                <span style={{ whiteSpace: "nowrap", fontSize: 13 }}>{formatDateTime(p.date, p.createdAt, isUrdu ? "ur-PK" : "en-PK")}</span>,
                p.supplier || "—",
                <div style={{ fontWeight: 700, color: th.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 280 }} title={g.names.join(", ")}>
                  {nameLabel}
                </div>,
                multi && g.cats.length > 1
                  ? <span style={{ display: "flex", alignItems: "center", gap: 4 }}>{catBadge(g.cats[0])}<span style={{ fontSize: 11, color: th.textMuted }}>+{g.cats.length - 1}</span></span>
                  : catBadge(g.cats[0] || p.category),
                <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>
                  {multi ? `${g.items.length} ${isUrdu ? "آئٹمز" : "items"}` : stockLabel(p.category, p.qty)}
                </span>,
                <span style={{ fontWeight: 800, color: "#60a5fa", whiteSpace: "nowrap" }}>{formatPKR(g.total)}</span>,
                g.due > 0
                  ? <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 20, background: "rgba(248,113,113,0.15)", color: "#f87171", fontWeight: 700, whiteSpace: "nowrap" }}>⏳ {formatPKR(g.due)}</span>
                  : <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 20, background: "rgba(52,211,153,0.12)", color: "#34d399", fontWeight: 600 }}>{p.accountName || p.bankName || (isUrdu ? "ادا" : "Paid")}</span>,
              ],
            };
          })}
          onRowClick={(g) => setViewGroup(g)}
          onDelete={delGroup}
        />
      </div>

      {viewGroup && (
        <Modal
          title={`${viewGroup.head.invoice || viewGroup.head.invoiceNum || "PO"} · ${viewGroup.items.length} ${isUrdu ? "آئٹمز" : "items"}`}
          onClose={() => setViewGroup(null)}
          xl
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", padding: "10px 12px", borderRadius: 12, border: `1px solid ${th.border}`, background: th.bgCard }}>
              <div>
                <div style={{ color: th.textMuted, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>{isUrdu ? "سپلائر" : "Supplier"}</div>
                <div style={{ color: th.text, fontWeight: 800, fontSize: 15 }}>{viewGroup.head.supplier || "—"}</div>
              </div>
              <div>
                <div style={{ color: th.textMuted, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>{isUrdu ? "تاریخ" : "Date"}</div>
                <div style={{ color: th.text, fontWeight: 700, fontSize: 14 }}>{formatDateTime(viewGroup.head.date, viewGroup.head.createdAt, isUrdu ? "ur-PK" : "en-PK")}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ color: th.textMuted, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>{isUrdu ? "کل رقم" : "Invoice total"}</div>
                <div style={{ color: "#60a5fa", fontWeight: 900, fontSize: 16 }}>{formatPKR(viewGroup.total)}</div>
              </div>
            </div>
            {(viewGroup.due > 0 || viewGroup.paid > 0) && (
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13, padding: "8px 12px", borderRadius: 10, border: `1px solid ${th.border}` }}>
                <span style={{ color: th.textMuted }}>{isUrdu ? "ادا کردہ" : "Paid"} · {formatPKR(viewGroup.paid)}</span>
                {viewGroup.due > 0
                  ? <span style={{ color: "#f87171", fontWeight: 800 }}>{isUrdu ? "باقی" : "Due"} · {formatPKR(viewGroup.due)}</span>
                  : <span style={{ color: "#34d399", fontWeight: 700 }}>{viewGroup.head.accountName || viewGroup.head.bankName || (isUrdu ? "مکمل ادا" : "Paid")}</span>}
              </div>
            )}
            <Table
              compact
              cols={[t.name, t.category, t.quantity, isUrdu ? "لاگت" : "Cost", t.salePrice || "Sale", t.totalLabel]}
              rows={viewGroup.items.map((p) => {
                const cost = costOf(p);
                const sale = saleOf(p);
                return {
                  data: p,
                  cells: [
                    <div style={{ fontWeight: 700, color: th.text }}>{p.productName || safeProductName(p.product)}</div>,
                    catBadge(p.category),
                    <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{stockLabel(p.category, p.qty)}</span>,
                    <span style={{ whiteSpace: "nowrap", fontSize: 12 }}>{cost ? formatPKR(cost) : "—"}</span>,
                    <span style={{ whiteSpace: "nowrap", fontSize: 12, color: "#34d399", fontWeight: 700 }}>{sale ? formatPKR(sale) : "—"}</span>,
                    <span style={{ fontWeight: 800, color: "#60a5fa", whiteSpace: "nowrap" }}>{formatPKR(p.total)}</span>,
                  ],
                };
              })}
            />
            <button
              type="button"
              onClick={() => { const g = viewGroup; setViewGroup(null); openPurchaseInvoice(g); }}
              style={{ padding: "10px 14px", borderRadius: 10, border: "none", cursor: "pointer", background: "linear-gradient(135deg,#1abc9c,#2980b9)", color: "#fff", fontWeight: 700, fontSize: 13 }}
            >
              🖨️ {isUrdu ? "پرنٹ رسید" : "Print invoice"}
            </button>
          </div>
        </Modal>
      )}

      {showInvPopup && (
        <Modal title={isUrdu ? `اسٹاک لسٹ · ${stockedCount}` : `Stock List · ${stockedCount}`} onClose={() => setShowInvPopup(false)} xl>
          <InventoryStockTable products={products} purchases={purchases} sales={sales} purchaseReturns={purchaseReturns} saleReturns={saleReturns} onReturn={openInvReturn} />
        </Modal>
      )}

      {showDemandPopup && (
        <Modal title={isUrdu ? `ڈیمانڈ · ${demandCount}` : `Demand · ${demandCount}`} onClose={() => setShowDemandPopup(false)} xl>
          <InventoryStockTable products={products} purchases={purchases} sales={sales} purchaseReturns={purchaseReturns} saleReturns={saleReturns} onReturn={openInvReturn} kind="demand" />
        </Modal>
      )}

      {showReturnsPopup && (
        <Modal title={isUrdu ? "خریداری واپسی کے ریکارڈ" : t.returnRecords} onClose={() => setShowReturnsPopup(false)} wide>
          <ReturnsTable returns={filteredReturns} kind="purchase" onDelete={delReturn} />
        </Modal>
      )}

      {showReturnModal && (
        <PurchaseReturnModal
          purchases={purchases}
          products={products}
          returns={purchaseReturns}
          seedProductId={returnSeedId}
          onClose={() => { setShowReturnModal(false); setReturnSeedId(""); }}
          onSave={async (payload) => {
            const res = await savePurchaseReturn(payload, { products, purchases });
            if (res.success) { await loadPurchaseReturns?.(); await loadProducts(); }
            return res;
          }}
        />
      )}

      {showModal && (
        <Modal title={t.addPurchase} onClose={() => setShowModal(false)} wide>
          <PurchaseFormModal
            products={products}
            purchases={purchases}
            loadProducts={loadProducts}
            loadPurchases={loadPurchases}
            extraNames={[
              ...purchases.map((p) => p.supplier || p.supplierName),
              ...products.flatMap((p) => (Array.isArray(p.suppliers) ? p.suppliers.map((s) => s?.name) : [])),
              ...products.map((p) => p.lastSupplier),
            ]}
            onSave={handleSave}
            onClose={() => setShowModal(false)}
          />
        </Modal>
      )}

      {showSupplierList && (
        <Modal title={isUrdu ? "📊 سپلائر وار اینوائس" : "📊 Supplier Wise Invoice"} onClose={() => setShowSupplierList(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <p style={{ color: th.textMuted, fontSize: 13, margin: 0, textAlign: "center" }}>
              {isUrdu ? "سپلائر پر کلک کریں" : "Click a supplier to view their purchase invoice"}
            </p>
            {supplierNames.map(name => {
              const items    = supplierGroups[name];
              const supTotal = items.reduce((s, p) => s + (p.total || 0), 0);
              return (
                <div
                  key={name}
                  onClick={() => handleSupplierInvoice(name)}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderRadius: 10, border: `1px solid ${th.border}`, background: th.bgCard, cursor: "pointer", gap: 10 }}
                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(155,89,182,0.08)"; e.currentTarget.style.borderColor = "#9b59b6"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = th.bgCard; e.currentTarget.style.borderColor = th.border; }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 8, background: "rgba(155,89,182,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17 }}>👤</div>
                    <div>
                      <div style={{ color: th.text, fontWeight: 700, fontSize: 15 }}>{name}</div>
                      <div style={{ color: th.textDim, fontSize: 12 }}>{items.length} {isUrdu ? "خریداریاں" : "purchases"}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ color: "#34d399", fontWeight: 800, fontSize: 16 }}>{formatPKR(supTotal)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </Modal>
      )}

      {printData && (
        <Modal title={isUrdu ? "🖨️ رسید" : "🖨️ Invoice"} onClose={() => setPrintData(null)}>
          <CombinedThermalInvoice invoiceData={printData} onClose={() => setPrintData(null)} isUrdu={isUrdu} />
        </Modal>
      )}
    </div>
  );
}

export default PurchasePage;