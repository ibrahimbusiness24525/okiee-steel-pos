import { useTheme } from "../context/ThemeContext";
import { formatPKR, loadShopProfile, formatWeightKgG, pxToPageHeightMM } from "../utils/helpers";

// ─── Thermal print styles ─────────────────────────────────────────────────────
export const thermalPrintStyles = `
@page { margin: 0; }
@media print {
  html, body { width:65mm !important; margin:0 !important; padding:0 !important; font-family:Arial,sans-serif; font-size:14px; }
  body * { visibility:hidden; }
  #thermal-invoice, #thermal-invoice * { visibility:visible; }
  #thermal-invoice { position:absolute; left:0; top:0; width:65mm !important; padding:8px; background:#fff; box-sizing:border-box; font-size:14px; line-height:1.5; }
  button { display:none !important; }
}`;

// ─── Helpers ──────────────────────────────────────────────────────────────────
export const getUrduItemLabel = (cat) => {
  switch (cat) {
    case "Pipe":     return "پائپ";
    case "Chader":   return "چادر";
    case "Net":      return "جال";
    case "Hardware": return "ہارڈ ویئر";
    case "Custom":   return "آئٹم";
    default:         return "آئٹم";
  }
};

export const parseLength = (val) => parseFloat(String(val || "").replace(/[^0-9.\-]/g, "")) || 0;

// ─── Invoice-only display name fixer: Square → S, and add G suffix to a
// trailing bare gauge number (e.g. "...16" → "...16G"). Rest of the name
// (size/inches/etc.) is left exactly as-is. ────────────────────────────────
const KNOWN_GAUGES = ["14", "15", "16", "18", "19", "20", "21", "22", "24"];
export const shortenPipeName = (name) => {
  let n = String(name || "").replace(/\bSquare\b/gi, "S");
  const m = n.match(/(^|\s)(\d{2})$/);
  if (m && KNOWN_GAUGES.includes(m[2])) n = n.replace(/(\d{2})$/, "$1G");
  return n;
};

export const pipeCalc = (row, price) => {
  const length    = parseLength(row.length);
  const pieces    = Number(row.quantity) || 0;
  const totalFeet = length * pieces;
  const pct       = Number(row.purchasePercentage) || 0;
  const total     = totalFeet * (Number(price) || 0) * (1 + pct / 100);
  return { totalFeet, pieces, total };
};

export const calcRowAmt = (row, cat, price) => {
  if (cat === "Chader") return (Number(row.purchasePrice) || 0) * (Number(row.weight) || 0);
  if (cat === "Net") {
    const totalFt = (Number(row.feet) || 0) * (Number(row.width) || 1);
    return (Number(row.purchasePricePerFeet) || 0) * totalFt;
  }
  if (cat === "Pipe") return pipeCalc(row, price).total;
  return (Number(row.purchasePrice) || 0) * (Number(row.qty) || 0);
};

// ─── numberToWords ────────────────────────────────────────────────────────────
function numberToWords(num) {
  if (!num || isNaN(num)) return "";
  const ones  = ["","one","two","three","four","five","six","seven","eight","nine","ten","eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen"];
  const tens2 = ["","","twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety"];
  function convert(n) {
    if (n === 0)       return "";
    if (n < 20)        return ones[n];
    if (n < 100)       return tens2[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
    if (n < 1000)      return ones[Math.floor(n / 100)] + " hundred" + (n % 100 ? " " + convert(n % 100) : "");
    if (n < 100000)    return convert(Math.floor(n / 1000)) + " thousand" + (n % 1000 ? " " + convert(n % 1000) : "");
    if (n < 10000000)  return convert(Math.floor(n / 100000)) + " lakh" + (n % 100000 ? " " + convert(n % 100000) : "");
    return convert(Math.floor(n / 10000000)) + " crore" + (n % 10000000 ? " " + convert(n % 10000000) : "");
  }
  const integer = Math.floor(Math.abs(num));
  const decimal = Math.round((Math.abs(num) - integer) * 100);
  let result = convert(integer) + " rupees";
  if (decimal > 0) result += " and " + convert(decimal) + " paisa";
  return result.charAt(0).toUpperCase() + result.slice(1) + " only";
}

// ─── getPaymentLabel ──────────────────────────────────────────────────────────
function getPaymentLabel(paymentMethod, bankName, isUrdu) {
  if (paymentMethod === "bank")      return `Bank: ${bankName || (isUrdu ? "بینک" : "Bank")}`;
  if (paymentMethod === "jazzcash")  return `JazzCash${bankName ? ` (${bankName})` : ""}`;
  if (paymentMethod === "easypaisa") return `Easypaisa${bankName ? ` (${bankName})` : ""}`;
  return isUrdu ? "نقد (Cash)" : "Cash";
}

// ─── SHARED PRINT HANDLER (BillingSaleInvoice style — no font overrides) ─────
function buildPrintHandler() {
  return () => {
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
    // and give the @page rule an explicit height in mm, as a FALLBACK for
    // engines that don't understand `size: 65mm auto`. Long invoices (many
    // line items) were being squeezed onto a single fixed-height page by
    // some print pipelines' own "shrink to fit" step whenever the fixed mm
    // height we requested didn't match the real content height closely
    // enough — the whole receipt (including the shop name / fonts) got
    // scaled down visibly the more items were on it.
    //
    // Fix: use the CSS `auto` keyword for the page height wherever it's
    // supported (modern Chrome/Chromium — which is what almost all Android
    // print bridges to thermal printers are built on). `auto` tells the
    // browser "this dimension is a continuous roll, just lay out the full
    // content at 100% and don't try to fit it into one page" — so fonts
    // never shrink no matter how many items are on the invoice. The
    // JS-measured fixed-height rule is kept first as a generous fallback
    // for any engine that doesn't support `auto`, with extra buffer so
    // nothing is ever clipped at the bottom.
    const pageHeightMM = Math.max(pxToPageHeightMM(clone), 40) + 20;

    const styleEl = document.createElement("style");
    styleEl.id = "print-portal-style";
    styleEl.innerHTML = `
      @page { size: 65mm ${pageHeightMM}mm; margin: 0; }
      @page { size: 65mm auto; margin: 0; }
      @media print {
        html, body { width:65mm !important; max-width:65mm !important; margin:0 !important; padding:0 !important; zoom:1 !important; }
        body * { visibility:hidden !important; }
        #thermal-invoice-print, #thermal-invoice-print * { visibility:visible !important; }
        #print-portal-overlay {
          position:fixed !important; left:0 !important; top:0 !important;
          width:65mm !important; max-width:65mm !important; height:auto !important;
          z-index:99999 !important; box-sizing:border-box !important;
          transform:none !important; zoom:1 !important;
        }
        #thermal-invoice-print { width:65mm !important; margin:0 !important; transform:none !important; zoom:1 !important; }
        #thermal-invoice-print * { box-sizing:border-box !important; max-width:100% !important; }
        button { display:none !important; }
      }
    `;
    document.head.appendChild(styleEl);

    // Wait one extra paint cycle before printing so the freshly-appended
    // clone (and its logo image, if any) is fully laid out — printing
    // immediately after appendChild occasionally caught a not-yet-settled
    // layout on very long invoices, which is exactly what caused the
    // measured height (and therefore the fallback page size) to come out
    // too small for big orders.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      window.print();
      setTimeout(() => { portal.remove(); styleEl.remove(); }, 1000);
    }));
  };
}

// ─── SHARED STYLE OBJECTS (identical to BillingSaleInvoice) ──────────────────
const sharedStyles = {
  page: {
    width: "65mm", margin: "0 auto",
    fontFamily: "Arial, sans-serif", fontSize: "14px",
    color: "#000", background: "#fff",
    padding: "8px 8px 12px", boxSizing: "border-box",
  },
  center:  { textAlign: "center" },
  bold500: { fontWeight: 500 },
  dash:    { borderTop: "1px dashed #000", margin: "8px 0" },
  tbl: {
    width: "100%", borderCollapse: "collapse", tableLayout: "fixed",
    border: "1px solid #cfcfcf", borderRadius: "8px", overflow: "hidden",
  },
  thS: (w, align) => ({
    width: w, padding: "6px 3px", fontWeight: 600, fontSize: "11px",
    textAlign: align || "center", whiteSpace: "nowrap", overflow: "hidden",
  }),
  tdS: (align) => ({
    padding: "6px 3px", fontWeight: 400, fontSize: "11px",
    textAlign: align || "center", verticalAlign: "top",
    wordBreak: "break-word", overflowWrap: "break-word",
  }),
  tdNum: (align) => ({
    padding: "6px 3px", fontWeight: 400, fontSize: "11px",
    textAlign: align || "right", whiteSpace: "nowrap",
  }),
};

const COL_SN    = "10%";
const COL_ITEM  = "36%";
const COL_QTY   = "14%";
const COL_PRICE = "20%";
const COL_AMT   = "20%";

// ─── SHARED INVOICE HEADER BLOCK ─────────────────────────────────────────────
function InvoiceTopHeader({ sp, L, isUrdu }) {
  const { page, center, bold500, tbl, tdS } = sharedStyles;
  return null; // used inline below — kept for reference
}

// ─── SHARED BUTTON ROW ────────────────────────────────────────────────────────
function PrintButtonRow({ onClose, isUrdu, handlePrint, th }) {
  return (
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
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CombinedThermalInvoice — PURCHASE
// invoiceData: { invoice, date, supplier, products:[{productName, category, productPrice, rows:[]}] }
// ═══════════════════════════════════════════════════════════════════════════════
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

  // ── Parse each row → { item, qty, price, amount } ──
  const parseRow = (row, cat, productName, pp) => {
    // desc/amount format
    if (row.desc !== undefined && row.amount !== undefined) {
      const desc   = row.desc || "";
      const amount = Number(row.amount) || 0;
      if (cat === "Pipe") {
        const qM = desc.match(/^(\d+\.?\d*)pc/);
        const pM = desc.match(/Rs(\d+\.?\d*)\/pc/);
        return { item: shortenPipeName(productName), qty: qM ? qM[1] : "1", price: pM ? Number(pM[1]) : 0, amount };
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
    // Native purchase row format
    if (cat === "Pipe") {
      const length     = parseLength(row.length);
      const pieces     = Number(row.quantity) || 0;
      const pct        = Number(row.purchasePercentage) || 0;
      const pricePerFt = (Number(pp) || 0) * (1 + pct / 100);
      const pricePerPc = pricePerFt * length;
      return { item: shortenPipeName(productName), qty: String(pieces), price: pricePerPc, amount: pricePerPc * pieces };
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

  const grandTotal  = lineItems.reduce((s, li) => s + li.amount, 0);
  const handlePrint = buildPrintHandler();
  const { page, center, bold500, dash, tbl, thS, tdS, tdNum } = sharedStyles;

  return (
    <>
      <style>{thermalPrintStyles}</style>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>

        <PrintButtonRow onClose={onClose} isUrdu={isUrdu} handlePrint={handlePrint} th={th} />

        <div style={{ background: "#f0f0f0", padding: "14px", borderRadius: 12, border: "1px solid #ccc", width: "100%", overflowX: "auto" }}>
          <div id="thermal-invoice" style={page}>

            {sp.logoBase64 && (
              <div style={{ ...center, marginBottom: 6 }}>
                <img src={sp.logoBase64} alt="logo" style={{ maxWidth: 56, maxHeight: 40, objectFit: "contain" }} />
              </div>
            )}

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

            <div style={{ fontWeight: 900, fontSize: "11px", marginTop: 2 }}>{L.partyLbl}: {supplier}</div>

            <div style={dash} />

            {/* Items table */}
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

            {/* Subtotal */}
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

// ═══════════════════════════════════════════════════════════════════════════════
// CombinedSaleInvoice — SALE  (now matches BillingSaleInvoice exactly)
// invoiceData: { invoice, date, customer, items:[{productName, category, rows:[{desc,amount}], subtotal}],
//               grandTotal, paymentMethod, bankName, isPartial, paidAmount, remainingAmount,
//               loaderName, loaderFee }
// ═══════════════════════════════════════════════════════════════════════════════
function CombinedSaleInvoice({ invoiceData, onClose, isUrdu }) {
  const th = useTheme();
  const {
    invoice, date, customer, items = [],
    grandTotal = 0, paymentMethod = "cash", bankName = "",
    isPartial = false, paidAmount = 0, remainingAmount = 0,
    loaderName = "", loaderFee = 0, bindingFee = 0,
  } = invoiceData;

  const sp         = loadShopProfile();
  const ownerLines = sp.owners.filter(o => o.name || o.nameUr);
  const paid       = Number(paidAmount) || 0;
  const remaining  = Number(remainingAmount) || 0;

  const L = isUrdu ? {
    shopName:      sp.shopNameUr || sp.shopName,
    phone1:        ownerLines[0] ? `${ownerLines[0].nameUr || ownerLines[0].name}: ${ownerLines[0].phone}` : "",
    phone2:        ownerLines[1] ? `${ownerLines[1].nameUr || ownerLines[1].name}: ${ownerLines[1].phone}` : "",
    phone3:        ownerLines[2] ? `${ownerLines[2].nameUr || ownerLines[2].name}: ${ownerLines[2].phone}` : "",
    address:       sp.addressUr || sp.address,
    billNoLbl:     "رسید نمبر",
    dateLbl:       "تاریخ",
    customerLbl:   "گاہک",
    colSN:         "نمبر",
    colItem:       "آئٹم",
    colQty:        "مقدار",
    colPrice:      "ریٹ",
    colAmt:        "رقم",
    subtotalLbl:   "ذیلی کل",
    totalLbl:      "کل رقم",
    payLbl:        "ادائیگی",
    paidNowLbl:    "ادا کردہ",
    remainingLbl:  "باقی رقم",
    partialBadge:  "ادھار باقی ہے",
    fullPaidBadge: "مکمل ادائیگی",
    loaderLbl:     "لوڈر",
    loaderFeeLbl:  "لوڈر فیس",
    bindingFeeLbl: "بائنڈنگ مزدوری",
    timeLbl:       "وقت",
    softPhone:     "03057903867",
  } : {
    shopName:      sp.shopName,
    phone1:        ownerLines[0] ? `${ownerLines[0].name}: ${ownerLines[0].phone}` : "",
    phone2:        ownerLines[1] ? `${ownerLines[1].name}: ${ownerLines[1].phone}` : "",
    phone3:        ownerLines[2] ? `${ownerLines[2].name}: ${ownerLines[2].phone}` : "",
    address:       sp.address,
    billNoLbl:     "Bill No",
    dateLbl:       "Date",
    customerLbl:   "Customer",
    colSN:         "SN",
    colItem:       "Item",
    colQty:        "Qty",
    colPrice:      "Price",
    colAmt:        "Amt",
    subtotalLbl:   "Subtotal",
    totalLbl:      "TOTAL",
    payLbl:        "Payment",
    paidNowLbl:    "Paid Now",
    remainingLbl:  "Balance Due",
    partialBadge:  "BALANCE DUE",
    fullPaidBadge: "FULLY PAID",
    loaderLbl:     "Loader",
    loaderFeeLbl:  "Loader Fee",
    bindingFeeLbl: "Binding Mazdori",
    timeLbl:       "Time",
    softPhone:     "03057903867",
  };

  // ── Parse each item's rows → flat numbered lineItems ──────────────────────
  const parseRow = (row, category, productName) => {
    const desc   = row.desc   || "";
    const amount = Number(row.amount) || 0;
    if (category === "Pipe") {
      const qM = desc.match(/^(\d+\.?\d*)pc/);
      const pM = desc.match(/Rs(\d+\.?\d*)\/pc/);
      return { item: shortenPipeName(productName), qty: qM ? qM[1] : "1", price: pM ? Number(pM[1]) : 0, amount };
    }
    if (category === "Chader") {
      const qM = desc.match(/^(\d+\.?\d*)kg/);
      const pM = desc.match(/Rs(\d+\.?\d*)\/kg/);
      return { item: productName, qty: qM ? formatWeightKgG(parseFloat(qM[1])) : "1", price: pM ? Number(pM[1]) : 0, amount };
    }
    if (category === "Net") {
      const qM = desc.match(/^(\d+\.?\d*)ft/);
      const pM = desc.match(/Rs(\d+\.?\d*)\/ft/);
      return { item: productName, qty: qM ? `${qM[1]}ft` : "1", price: pM ? Number(pM[1]) : 0, amount };
    }
    const qM = desc.match(/^(\d+\.?\d*)pc/);
    const pM = desc.match(/Rs(\d+\.?\d*)\/pc/);
    return { item: productName, qty: qM ? qM[1] : "1", price: pM ? Number(pM[1]) : 0, amount };
  };

  const lineItems = [];
  (items || []).forEach(item => {
    (item.rows || []).forEach(row => {
      lineItems.push(parseRow(row, item.category, item.productName));
    });
  });

  const handlePrint = buildPrintHandler();
  const { page, center, bold500, dash, tbl, thS, tdS, tdNum } = sharedStyles;

  return (
    <>
      <style>{thermalPrintStyles}</style>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>

        <PrintButtonRow onClose={onClose} isUrdu={isUrdu} handlePrint={handlePrint} th={th} />

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

            {/* Customer */}
            <div style={{ fontWeight: 900, fontSize: "11px", marginTop: 2 }}>{L.customerLbl}: {customer}</div>

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

            {/* Subtotal */}
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

            {/* Partial payment */}
            {isPartial && paid > 0 && (
              <>
                <div style={dash} />
                <table style={tbl}>
                  <tbody>
                    <tr>
                      <td style={tdS("left")}>{L.paidNowLbl}</td>
                      <td style={tdS("right")} colSpan={4}>{formatPKR(paid)}</td>
                    </tr>
                    <tr>
                      <td style={tdS("left")}>{L.remainingLbl}</td>
                      <td style={tdS("right")} colSpan={4}>{formatPKR(remaining)}</td>
                    </tr>
                  </tbody>
                </table>
                <div style={{ textAlign: "center", marginTop: 4, fontWeight: 900, fontSize: "10px", letterSpacing: "0.4px" }}>
                  {remaining > 0 ? `⚠ ${L.partialBadge}` : `✓ ${L.fullPaidBadge}`}
                </div>
              </>
            )}
            {!isPartial && (
              <div style={{ textAlign: "center", marginTop: 6, fontWeight: 900, fontSize: "10px", letterSpacing: "0.4px" }}>
                ✓ {L.fullPaidBadge}
              </div>
            )}

            <div style={dash} />

            {/* Payment / loader / time */}
        <table style={{ ...tbl, tableLayout: "fixed" }}>

<colgroup>
  <col style={{ width: "32%" }} />
  <col style={{ width: "68%" }} />
</colgroup>

<tbody>

<tr>

<td
style={{
...tdS("left"),
padding:"5px 3px",
verticalAlign:"middle",
whiteSpace:"nowrap"
}}
>
{L.payLbl}
</td>

<td
style={{
...tdS("right"),
padding:"5px 3px",
verticalAlign:"middle",
wordBreak:"break-word"
}}
>
{getPaymentLabel(paymentMethod, bankName, isUrdu)}
</td>

</tr>

{paymentMethod==="jazzcash" && (

<tr>
<td
colSpan={2}
style={{
...tdS("center"),
fontWeight:900
}}
>
JazzCash: 03057903867
</td>
</tr>
)}

{paymentMethod==="easypaisa" && (

<tr>
<td
colSpan={2}
style={{
...tdS("center"),
fontWeight:900
}}
>
Easypaisa: 03057903867
</td>
</tr>
)}

{loaderName && (

<tr>

<td
style={{
...tdS("left"),
padding:"5px 3px"
}}
>
{L.loaderLbl}
</td>

<td
style={{
...tdS("right"),
padding:"5px 3px"
}}
>
{loaderName}
</td>

</tr>
)}

{loaderName && Number(loaderFee)>0 && (

<tr>

<td
style={{
...tdS("left"),
padding:"5px 3px"
}}
>
{L.loaderFeeLbl}
</td>

<td
style={{
...tdS("right"),
padding:"5px 3px"
}}
>
{formatPKR(Number(loaderFee))}
</td>

</tr>
)}

{Number(bindingFee)>0 && (

<tr>

<td
style={{
...tdS("left"),
padding:"5px 3px"
}}
>
{L.bindingFeeLbl}
</td>

<td
style={{
...tdS("right"),
padding:"5px 3px"
}}
>
{formatPKR(Number(bindingFee))}
</td>

</tr>
)}

<tr>

<td
style={{
...tdS("left"),
padding:"5px 3px"
}}
>
{L.timeLbl}
</td>

<td
style={{
...tdS("right"),
padding:"5px 3px",
whiteSpace:"nowrap"
}}
>
{new Date().toLocaleTimeString(
isUrdu ? "ur-PK":"en-PK",
{
hour:"2-digit",
minute:"2-digit"
}
)}
</td>

</tr>

</tbody>

</table>


            <div style={dash} />

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

export { CombinedThermalInvoice, CombinedSaleInvoice };