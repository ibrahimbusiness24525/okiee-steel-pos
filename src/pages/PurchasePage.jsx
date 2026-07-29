import { useState } from "react";
import { useTheme } from "../context/ThemeContext";
import { useLang } from "../context/LangContext";
import { useResponsive, Icon, ICONS, Modal, FInput, SaveBtn, StatCard, Table, WeightKgGInput } from "../components/shared";
import { api } from "../utils/api";
import { formatPKR, todayStr, loadShopProfile, formatWeightKgG, pxToPageHeightMM } from "../utils/helpers";
import { safeProductName } from "../utils/constants";

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
@page { margin: 0; }
@media print {
  html, body { width:65mm !important; margin:0 !important; padding:0 !important; font-family:Arial,sans-serif; font-size:14px; }
  body * { visibility:hidden; }
  #thermal-invoice, #thermal-invoice * { visibility:visible; }
  #thermal-invoice { position:absolute; left:0; top:0; width:65mm !important; padding:8px; background:#fff; box-sizing:border-box; font-size:14px; line-height:1.5; }
  button { display:none !important; }
}`;

// ─── Purchase Thermal Invoice — BillingSaleInvoice style ──────────────────────
function CombinedThermalInvoice({ invoiceData, onClose, isUrdu }) {
  const th = useTheme();
  const { invoice, date, supplier, products } = invoiceData;
  const sp         = loadShopProfile();
  const ownerLines = sp.owners.filter(o => o.name || o.nameUr);

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
    timeLbl:      "Time",
    softPhone:    "03057903867",
  };

  // ── Styles — identical to BillingSaleInvoice ──
  const page = {
    width: "65mm", margin: "0 auto",
    fontFamily: "Arial, sans-serif", fontSize: "14px",
    color: "#000", background: "#fff",
    padding: "8px 8px 12px", boxSizing: "border-box",
  };
  const center  = { textAlign: "center" };
  const bold500 = { fontWeight: 500 };
  const dash    = { borderTop: "1px dashed #000", margin: "8px 0" };
  const tbl     = {
    width: "100%", borderCollapse: "collapse", tableLayout: "fixed",
    border: "1px solid #cfcfcf", borderRadius: "8px", overflow: "hidden",
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

  const COL_SN    = "10%";
  const COL_ITEM  = "36%";
  const COL_QTY   = "14%";
  const COL_PRICE = "20%";
  const COL_AMT   = "20%";

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
    (prod.rows || []).forEach(row => {
      lineItems.push(parseRow(row, prod.category, prod.productName, prod.productPrice || 0));
    });
  });

  const grandTotal = lineItems.reduce((s, li) => s + li.amount, 0);

  // ── Print handler — same as BillingSaleInvoice (no font overrides on clone) ──
  const handlePrint = () => {
    const existingOverlay = document.getElementById("print-portal-overlay");
    if (existingOverlay) existingOverlay.remove();
    const existingStyle = document.getElementById("print-portal-style");
    if (existingStyle) existingStyle.remove();

    const inv = document.getElementById("thermal-invoice");
    if (!inv) return;

    const portal = document.createElement("div");
    portal.id = "print-portal-overlay";
    portal.style.position = "absolute";
    portal.style.left = "-9999px";
    portal.style.top = "0";
    portal.style.width = "65mm";

    const clone = inv.cloneNode(true);
    clone.id = "thermal-invoice-print";
    clone.style.width = "65mm";
    clone.style.maxWidth = "65mm";
    clone.style.margin = "0";
    clone.style.boxSizing = "border-box";
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
        html, body { width:65mm !important; max-width:65mm !important; margin:0 !important; padding:0 !important; }
        body * { visibility:hidden !important; }
        #thermal-invoice-print, #thermal-invoice-print * { visibility:visible !important; }
        #print-portal-overlay {
          position:fixed !important; left:0 !important; top:0 !important;
          width:65mm !important; max-width:65mm !important; height:auto !important;
          z-index:99999 !important; box-sizing:border-box !important;
        }
        #thermal-invoice-print { width:65mm !important; margin:0 !important; }
        #thermal-invoice-print * { box-sizing:border-box !important; max-width:100% !important; }
        button { display:none !important; }
      }
    `;
    document.head.appendChild(styleEl);
    window.print();
    setTimeout(() => { portal.remove(); styleEl.remove(); }, 1000);
  };

  return (
    <>
      <style>{thermalPrintStyles}</style>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>

        {/* Buttons */}
        <div style={{ display: "flex", gap: 10, width: "100%" }}>
          <button onClick={handlePrint}
            style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#1abc9c,#2980b9)", color: "white", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
            🖨️ {isUrdu ? "پرنٹ کریں" : "Print Invoice"}
          </button>
          <button onClick={onClose}
            style={{ padding: "10px 18px", borderRadius: 10, border: `1px solid ${th.border}`, background: th.bgCard, color: th.textMuted, fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
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
            <table style={{ ...tbl, marginTop: 2 }}>
              <colgroup>
                <col style={{ width: COL_SN }} />
                <col style={{ width: COL_ITEM }} />
                <col style={{ width: COL_QTY }} />
                <col style={{ width: COL_PRICE }} />
                <col style={{ width: COL_AMT }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={thS("8%",  "center")}>{L.colSN}</th>
                  <th style={thS("40%", "left")}>{L.colItem}</th>
                  <th style={thS("12%", "center")}>{L.colQty}</th>
                  <th style={thS("20%", "right")}>{L.colPrice}</th>
                  <th style={thS("20%", "right")}>{L.colAmt}</th>
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

            <div style={dash} />

            {/* Time */}
            <table style={tbl}>
              <tbody>
                <tr>
                  <td style={{ ...tdS("left"), padding: "6px 3px" }}>{L.timeLbl}</td>
                  <td colSpan={4} style={{ ...tdS("right"), padding: "6px 3px", whiteSpace: "nowrap" }}>
                    {new Date().toLocaleTimeString(isUrdu ? "ur-PK" : "en-PK", { hour: "2-digit", minute: "2-digit" })}
                  </td>
                </tr>
              </tbody>
            </table>

            <div style={dash} />

            {/* Footer */}
            <div style={{ ...center, fontWeight: 700, fontSize: "12px", letterSpacing: "0.8px", lineHeight: "18px", marginTop: "4px" }}>
              OKIIEE SOFTWARE COMPANY
            </div>
            <div style={{ ...center, fontWeight: 700, fontSize: "11px", letterSpacing: "0.5px", marginTop: "2px" }}>
              {L.softPhone}
            </div>

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
function PurchaseEntryTable({ category, rows, setRows, productPrice }) {
  const th = useTheme();
  const { t } = useLang();
  const pp = Number(productPrice) || 0;

  const colDefs = {
    Chader:   [{ key: "purchasePrice", label: t.purchasePrice, placeholder: "0" }, { key: "salePrice", label: t.salePrice, placeholder: "0" }, { key: "weight", label: t.weight, placeholder: "kg" }],
    Net:      [{ key: "feet", label: t.feet, placeholder: "0" }, { key: "width", label: "Width (ft)", placeholder: "e.g. 3" }, { key: "purchasePricePerFeet", label: t.purchasePricePerFt, placeholder: "0" }, { key: "salePricePerFeet", label: t.salePricePerFt, placeholder: "0" }],
    Hardware: [{ key: "qty", label: t.qty, placeholder: "0" }, { key: "purchasePrice", label: t.purchasePricePerPc, placeholder: "0" }, { key: "salePrice", label: t.salePricePerPc, placeholder: "0" }],
    Custom:   [{ key: "qty", label: t.qty, placeholder: "0" }, { key: "purchasePrice", label: t.purchasePricePerPc, placeholder: "0" }, { key: "salePrice", label: t.salePricePerPc, placeholder: "0" }],
    Pipe:     [{ key: "length", label: "Length (ft)", placeholder: "e.g. 20" }, { key: "quantity", label: "Pieces", placeholder: "0" }, { key: "purchasePercentage", label: "Purchase %", placeholder: "e.g. -5" }],
  };
  const cols = colDefs[category] || colDefs.Hardware;

  const addRow    = () => { const r = { _id: Date.now() + Math.random() }; cols.forEach(c => (r[c.key] = "")); setRows(rs => [...rs, r]); };
  const removeRow = (idx) => setRows(rs => rs.filter((_, i) => i !== idx));
  const updateRow = (idx, key, val) => setRows(rs => rs.map((r, i) => i === idx ? { ...r, [key]: val } : r));
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
  const [open,         setOpen]         = useState(true);
  const [searchQuery,  setSearchQuery]  = useState("");
  const [showDropdown, setShowDropdown] = useState(false);

  const selectedProduct = products.find(p => p._id === block.productId);
  const category        = selectedProduct?.category || "";
  const productPrice    = selectedProduct?.price    || 0;

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const makeEmptyRow = (cat) => {
    const keys = {
      Chader:   ["purchasePrice", "salePrice", "weight"],
      Net:      ["feet", "width", "purchasePricePerFeet", "salePricePerFeet"],
      Hardware: ["qty", "purchasePrice", "salePrice"],
      Custom:   ["qty", "purchasePrice", "salePrice"],
      Pipe:     ["length", "quantity", "purchasePercentage"],
    };
    const r = { _id: Date.now() + Math.random() };
    (keys[cat] || keys.Hardware).forEach(k => (r[k] = ""));
    return r;
  };

  const handleSelectProduct = (product) => {
    setSearchQuery(product.name);
    setShowDropdown(false);
    onChange({ ...block, productId: product._id, rows: [makeEmptyRow(product.category)] });
  };

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
    <div style={{ borderRadius: 12, border: `1.5px solid ${th.border}`, overflow: "visible", background: th.bgCard }}>
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
                onChange={e => { setSearchQuery(e.target.value); setShowDropdown(true); onChange({ ...block, productId: "", rows: [] }); }}
                onFocus={() => setShowDropdown(true)}
                placeholder={`🔍 ${t.selectProduct}...`}
                style={inpS}
              />
              {showDropdown && (
                <>
                  <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 998 }} onMouseDown={() => setShowDropdown(false)} />
                  <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 999, background: th.bgModal || th.bgCard, border: `1px solid ${th.border}`, borderRadius: 10, maxHeight: 200, overflowY: "auto", boxShadow: "0 4px 16px rgba(0,0,0,0.18)" }}>
                    {filteredProducts.length === 0
                      ? <div style={{ padding: "12px", textAlign: "center", color: th.textDim, fontSize: 13 }}>No products found</div>
                      : filteredProducts.map(p => (
                        <div
                          key={p._id}
                          onMouseDown={() => handleSelectProduct(p)}
                          style={{ padding: "9px 13px", cursor: "pointer", borderBottom: `1px solid ${th.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 14, color: th.text }}
                          onMouseEnter={e => e.currentTarget.style.background = th.rowHover}
                          onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                        >
                          <span>{p.name}</span>
                          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: catBg, color: catColor, fontWeight: 600 }}>{p.category}</span>
                        </div>
                      ))
                    }
                  </div>
                </>
              )}
            </div>
          </div>

          {selectedProduct && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 11px", borderRadius: 8, background: catBg, border: `1px solid ${catColor}40` }}>
              <span style={{ color: catColor, fontSize: 12, fontWeight: 700 }}>{category}</span>
              <span style={{ color: th.text, fontSize: 13, fontWeight: 600 }}>{selectedProduct.name}</span>
              {category === "Pipe" && productPrice > 0 && <span style={{ marginLeft: "auto", color: "#60a5fa", fontSize: 12, fontWeight: 600 }}>Rs {productPrice}/ft</span>}
            </div>
          )}

          {category && <PurchaseEntryTable category={category} rows={block.rows} setRows={setRows} productPrice={productPrice} />}
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
function PurchaseFormModal({ products, onSave, onClose }) {
  const th = useTheme();
  const { t, lang } = useLang();
  const isUrdu = lang === "ur";

  const [supplier,    setSupplier]    = useState("");
  const [invoiceNum,  setInvoiceNum]  = useState(`PO-${Date.now().toString().slice(-4)}`);
  const [date,        setDate]        = useState(todayStr());
  const [saving,      setSaving]      = useState(false);
  const [showInvoice, setShowInvoice] = useState(false);
  const [invoiceData, setInvoiceData] = useState(null);

  const newBlock = () => ({ _id: Date.now() + Math.random(), productId: "", rows: [] });
  const [blocks, setBlocks] = useState([newBlock()]);

  const addBlock    = () => setBlocks(bs => [...bs, newBlock()]);
  const removeBlock = (idx) => setBlocks(bs => bs.filter((_, i) => i !== idx));
  const updateBlock = (idx, val) => setBlocks(bs => bs.map((b, i) => i === idx ? val : b));

  const grandTotal = blocks.reduce((sum, block) => {
    const prod     = products.find(p => p._id === block.productId);
    const category = prod?.category || "";
    const pp       = prod?.price || 0;
    return sum + block.rows.reduce((s, r) => s + calcRowAmt(r, category, pp), 0);
  }, 0);

  const canSave = supplier && blocks.every(b => b.productId && b.rows.length > 0);

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
      const res  = await onSave({ supplier, invoice: invoiceNum, date, productId: block.productId, rows: block.rows, total, qty, rate, category, productPrice: purchasePricePerUnit });
      if (!res || !res.success) { allOk = false; break; }
      invoiceProducts.push({ productName: product?.name || "", category, rows: block.rows, total, qty, productPrice: purchasePricePerUnit });
    }

    setSaving(false);
    if (allOk) {
      setInvoiceData({ invoice: invoiceNum, date, supplier, products: invoiceProducts });
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
          <input value={supplier} onChange={e => setSupplier(e.target.value)} placeholder={t.supplier + "..."} style={inpS} onFocus={e => e.target.style.borderColor = "#1abc9c"} onBlur={e => e.target.style.borderColor = th.inputBorder} />
        </div>
      </div>

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
          onClick={addBlock}
          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px", borderRadius: 10, border: `2px dashed ${th.border}`, background: "transparent", color: th.textMuted, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "#1abc9c"; e.currentTarget.style.color = "#1abc9c"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = th.border;  e.currentTarget.style.color = th.textMuted; }}
        >
          <Icon path={ICONS.plus} size={14} /> + {isUrdu ? "پروڈکٹ شامل کریں" : "Add Product"}
        </button>

        {grandTotal > 0 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "9px 14px", borderRadius: 10, background: "rgba(26,188,156,0.08)", border: "1px solid rgba(26,188,156,0.25)" }}>
            <span style={{ color: th.textMuted, fontSize: 13, fontWeight: 600 }}>{isUrdu ? "کل رقم:" : "Grand Total:"}</span>
            <span style={{ color: "#34d399", fontWeight: 900, fontSize: 17 }}>{formatPKR(grandTotal)}</span>
          </div>
        )}

        <SaveBtn label={saving ? "..." : t.savePurchase} onClick={handleSave} loading={saving} disabled={!canSave} />
      </div>
    </div>
  );
}

// ─── Purchase Page ────────────────────────────────────────────────────────────
function PurchasePage({ purchases, products, loadPurchases, loadProducts }) {
  const th = useTheme();
  const { t, lang } = useLang();
  const { isMobile } = useResponsive();
  const isUrdu = lang === "ur";

  const [showModal,        setShowModal]        = useState(false);
  const [printData,        setPrintData]        = useState(null);
  const [showSupplierList, setShowSupplierList] = useState(false);

  const handleSave = async ({ supplier, invoice, date, productId, rows, total, qty, rate, category, productPrice }) => {
    const matchedProd   = products.find(p => p._id === productId);
    const resolvedPrice = Number(productPrice) || Number(matchedProd?.price) || 0;
    const payload = { supplier, invoice, date, product: productId, rows, total, qty, rate, category, productName: matchedProd?.name || "", productPrice: resolvedPrice };
    const res = await api.addPurchase(payload);
    if (res.success) { await loadPurchases(); await loadProducts(); }
    else alert(res.message || "Error saving purchase");
    return res;
  };

  const del = async (d) => {
    if (!window.confirm(t.deletePurchaseConfirm)) return;
    const res = await api.deletePurchase(d._id);
    if (res.success) { await loadPurchases(); await loadProducts(); }
    else alert(res.message);
  };

  const supplierGroups = {};
  purchases.forEach(p => {
    const key = p.supplier || "—";
    if (!supplierGroups[key]) supplierGroups[key] = [];
    supplierGroups[key].push(p);
  });
  const supplierNames = Object.keys(supplierGroups);

  const handleSupplierInvoice = (supplierName) => {
    const supplierPurchases = supplierGroups[supplierName] || [];
    const allProducts = supplierPurchases.map(p => {
      const productId      = typeof p.product === "object" ? p.product?._id : p.product;
      const matchedProduct = products.find(pr => pr._id === productId);
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
    setPrintData({ invoice: isUrdu ? "کل خریداری" : "ALL PURCHASES", date: todayStr(), supplier: supplierName, products: allProducts });
    setShowSupplierList(false);
  };

  const totalSpent = purchases.reduce((s, p) => s + (p.total || 0), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <p style={{ color: th.textMuted, fontSize: 14, margin: 0 }}>{purchases.length} {t.purchaseRecords}</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {purchases.length > 0 && (
            <button
              onClick={() => setShowSupplierList(true)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 12, border: "none", cursor: "pointer", background: "linear-gradient(135deg,#9b59b6,#8e44ad)", color: "white", fontWeight: 600, fontSize: 14 }}
            >
              📊 {isMobile ? (isUrdu ? "سپلائر" : "Sup") : (isUrdu ? "سپلائر وار اینوائس" : "Supplier Invoice")}
            </button>
          )}
          <button
            onClick={() => setShowModal(true)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 12, border: "none", cursor: "pointer", background: "linear-gradient(135deg,#1abc9c,#2980b9)", color: "white", fontWeight: 600, fontSize: 14 }}
          >
            <Icon path={ICONS.plus} size={15} />{isMobile ? "+" : t.addPurchase}
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fit,minmax(190px,1fr))", gap: 12 }}>
        <StatCard label={t.totalSpent}  value={formatPKR(totalSpent)} icon={ICONS.purchase} color="#3498db" />
        <StatCard label={t.totalOrders} value={purchases.length}      icon={ICONS.box}      color="#9b59b6" />
      </div>

      <Table
        cols={[t.invoiceNum, t.date, t.supplier, t.name, t.category, t.quantity, t.totalLabel]}
        rows={purchases.map(p => ({
          data: p,
          cells: [
            <span style={{ fontFamily: "monospace", color: "#60a5fa", fontSize: 13 }}>{p.invoice}</span>,
            p.date,
            p.supplier,
            p.productName || safeProductName(p.product),
            <span style={{
              fontSize: 12, padding: "3px 9px", borderRadius: 20, fontWeight: 600,
              background: p.category === "Pipe" ? "rgba(41,128,185,0.15)" : p.category === "Chader" ? "rgba(26,188,156,0.15)" : p.category === "Net" ? "rgba(244,114,182,0.15)" : p.category === "Hardware" ? "rgba(251,191,36,0.15)" : "rgba(167,139,250,0.15)",
              color: p.category === "Pipe" ? "#60a5fa" : p.category === "Chader" ? "#34d399" : p.category === "Net" ? "#f472b6" : p.category === "Hardware" ? "#fbbf24" : "#a78bfa",
            }}>
              {isUrdu ? (p.category ? getUrduItemLabel(p.category) : "—") : (p.category || "—")}
            </span>,
            <span style={{ color: th.textMuted, fontSize: 14 }}>
              {p.category === "Pipe"    ? `${Math.round(p.qty || 0)} pcs`
               : p.category === "Chader" ? formatWeightKgG(p.qty || 0)
               : p.category === "Net"    ? `${Math.round(p.qty || 0)} ft²`
               : Math.round(p.qty || 0)}
            </span>,
            <span style={{ fontWeight: 700, color: th.text, fontSize: 14 }}>{formatPKR(p.total)}</span>,
          ],
        }))}
        onDelete={del}
      />

      {showModal && (
        <Modal title={t.addPurchase} onClose={() => setShowModal(false)} wide>
          <PurchaseFormModal products={products} onSave={handleSave} onClose={() => setShowModal(false)} />
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