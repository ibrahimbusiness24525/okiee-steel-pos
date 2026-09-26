import { useTheme } from "../context/ThemeContext";
import { formatPKR, loadShopProfile, formatWeightKgG, printThermalOrA4 } from "../utils/helpers";

// ─── Thermal print styles ─────────────────────────────────────────────────────
export const thermalPrintStyles = `
@page { size: 3in 297mm; margin: 1.5mm; }
@media print {
  html, body { margin:0 !important; padding:0 !important; background:#fff !important; }
  body * { visibility:hidden !important; }
  #print-portal-overlay, #print-portal-overlay *,
  #thermal-invoice-print, #thermal-invoice-print *,
  #thermal-invoice, #thermal-invoice * { visibility:visible !important; color:#000 !important; }
  button { display:none !important; }
}`;

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function OkiieeBrandFooter() {
  return (
    <div className="inv-brand" style={{ textAlign: "center", marginTop: 6, paddingTop: 6, borderTop: "1px dashed #000" }}>
      <div className="inv-brand-title" style={{ fontWeight: 800, fontSize: 13, letterSpacing: "0.2px", lineHeight: "17px" }}>For okiiee Software</div>
      <div className="inv-brand-phone" style={{ fontWeight: 700, fontSize: 11, lineHeight: "15px", marginTop: 3 }}>03090001316</div>
      <div className="inv-brand-phone" style={{ fontWeight: 700, fontSize: 11, lineHeight: "15px" }}>03057903867</div>
    </div>
  );
}

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

function priceFromAmount(qtyStr, amount, parsedPrice) {
  let price = Number(parsedPrice) || 0;
  const qn = parseFloat(qtyStr);
  if ((!price || !Number.isFinite(price)) && qn > 0 && amount) {
    price = Math.round((amount / qn) * 100) / 100;
  }
  return price;
}

/** Turn a saved sale row (`desc` + `amount`) into Qty / Price for the thermal slip. */
export function parseSaleInvoiceRow(row, category, productName) {
  const desc   = String(row?.desc || "");
  const amount = Number(row?.amount) || 0;
  const fallbackQty = row?.qty != null && row.qty !== "" ? String(row.qty) : "1";
  const genericQty = (desc.match(/^(\d+\.?\d*)/) || [])[1] || fallbackQty;
  const genericPrice = (desc.match(/Rs\s*(\d+\.?\d*)/i) || [])[1];

  if (category === "Pipe") {
    const qM = desc.match(/^(\d+\.?\d*)\s*pc/i);
    const pM = desc.match(/Rs\s*(\d+\.?\d*)\s*\/\s*pc/i);
    const qty = qM ? qM[1] : genericQty;
    return { item: shortenPipeName(productName), qty, price: priceFromAmount(qty, amount, pM ? pM[1] : genericPrice), amount };
  }
  if (category === "Chader") {
    const qM = desc.match(/^(\d+\.?\d*)\s*kg/i);
    const pM = desc.match(/Rs\s*(\d+\.?\d*)\s*\/\s*kg/i);
    const qtyNum = qM ? qM[1] : genericQty;
    return { item: productName, qty: qM ? formatWeightKgG(parseFloat(qM[1])) : fallbackQty, price: priceFromAmount(qtyNum, amount, pM ? pM[1] : genericPrice), amount };
  }
  if (category === "Net") {
    const qM = desc.match(/^(\d+\.?\d*)/);
    const pM = desc.match(/Rs\s*(\d+\.?\d*)/i);
    const qty = qM ? qM[1] : genericQty;
    return { item: productName, qty: qM ? `${qM[1]}ft` : fallbackQty, price: priceFromAmount(qty, amount, pM ? pM[1] : genericPrice), amount };
  }

  // Hardware / Custom: "10 Piece × Rs36/Piece" (not "10pc × Rs36/pc")
  const qtyNum = genericQty;
  return { item: productName, qty: qtyNum, price: priceFromAmount(qtyNum, amount, genericPrice), amount };
}

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
  if (paymentMethod === "credit")    return isUrdu ? "ادھار (Credit)" : "Credit";
  if (paymentMethod === "bank")      return `Bank: ${bankName || (isUrdu ? "بینک" : "Bank")}`;
  if (paymentMethod === "jazzcash")  return `JazzCash${bankName ? ` (${bankName})` : ""}`;
  if (paymentMethod === "easypaisa") return `Easypaisa${bankName ? ` (${bankName})` : ""}`;
  if (paymentMethod === "wallet")    return bankName ? `Wallet: ${bankName}` : (isUrdu ? "والٹ" : "Wallet");
  return isUrdu ? "نقد (Cash)" : "Cash";
}

function buildPrintHandler(mode = "thermal", filename) {
  return () => printThermalOrA4(mode, filename);
}

// ─── SHARED STYLE OBJECTS (identical to BillingSaleInvoice) ──────────────────
const sharedStyles = {
  page: {
    width: "3in", margin: "0 auto",
    fontFamily: "Arial, sans-serif", fontSize: "14px",
    color: "#000", background: "#fff",
    padding: "6px 4px 10px", boxSizing: "border-box",
  },
  center:  { textAlign: "center" },
  bold500: { fontWeight: 500 },
  dash:    { borderTop: "1px dashed #000", margin: "8px 0" },
  tbl: {
    width: "100%", borderCollapse: "collapse", tableLayout: "fixed",
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

const COL_SN    = "8%";
const COL_ITEM  = "40%";
const COL_QTY   = "16%";
const COL_PRICE = "18%";
const COL_AMT   = "18%";

// ─── SHARED INVOICE HEADER BLOCK ─────────────────────────────────────────────
function InvoiceTopHeader({ sp, L, isUrdu }) {
  const { page, center, bold500, tbl, tdS } = sharedStyles;
  return null; // used inline below — kept for reference
}

// ─── SHARED BUTTON ROW ────────────────────────────────────────────────────────
function PrintButtonRow({ onClose, isUrdu, handlePrint, handlePrintA4, handlePrintPdf, th }) {
  const btn = (bg) => ({
    flex: 1, padding: "10px 8px", borderRadius: 10, border: "none", background: bg,
    color: "white", fontWeight: 700, fontSize: 13, cursor: "pointer", minWidth: 90,
  });
  return (
    <div style={{ display: "flex", gap: 8, width: "100%", flexWrap: "wrap" }}>
      <button onClick={handlePrint} style={btn("linear-gradient(135deg,#1abc9c,#2980b9)")}>
        🖨️ {isUrdu ? "تھرمل" : "Thermal"}
      </button>
      <button onClick={handlePrintA4 || handlePrint} style={btn("linear-gradient(135deg,#3b82f6,#1d4ed8)")}>
        📄 {isUrdu ? "A4 کاغذ" : "A4 Paper"}
      </button>
      <button onClick={handlePrintPdf || handlePrintA4 || handlePrint} style={btn("linear-gradient(135deg,#7c3aed,#5b21b6)")}>
        📑 PDF
      </button>
      <button onClick={onClose}
        style={{ padding: "10px 14px", borderRadius: 10, border: `1px solid ${th.border}`, background: th.bgCard, color: th.textMuted, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
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
  const {
    invoice, date,
    supplier: supplierRaw, customer,
    products: productsRaw, items,
    paymentMethod, bankName, accountName,
    isPartial, paidAmount, remainingAmount, createdAt,
  } = invoiceData;
  const supplier = supplierRaw || customer || "";
  const products = productsRaw || items || [];
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

  // ── Parse each row → { item, qty, price, amount } ──
  const parseRow = (row, cat, productName, pp) => {
    // desc/amount format
    if (row.desc !== undefined && row.amount !== undefined) {
      return parseSaleInvoiceRow(row, cat, productName);
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
  const handlePrint = buildPrintHandler("thermal");
  const handlePrintA4 = buildPrintHandler("a4");
  const handlePrintPdf = buildPrintHandler("pdf", `${invoice || "purchase"}-${date || "invoice"}`);
  const { page, center, bold500, dash, tbl, thS, tdS, tdNum } = sharedStyles;

  return (
    <>
      <style>{thermalPrintStyles}</style>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>

        <PrintButtonRow onClose={onClose} isUrdu={isUrdu} handlePrint={handlePrint} handlePrintA4={handlePrintA4} handlePrintPdf={handlePrintPdf} th={th} />

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
                  <th style={thS(COL_SN,  "center")}>{L.colSN}</th>
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

            {(paymentMethod || isPartial || Number(remainingAmount) > 0) && (
              <>
                <div style={dash} />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", fontWeight: 600 }}>
                  <span>{L.payLbl}</span>
                  <span>
                    {getPaymentLabel(paymentMethod, accountName || bankName, isUrdu)}
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
    loaderName = "", loaderFee = 0, bindingFee = 0, isPurchase = false,
    discount = 0, cashReceived = 0, changeDue = 0,
  } = invoiceData;

  const sp         = loadShopProfile();
  const ownerLines = (sp.owners || []).filter(o => o.name || o.nameUr);
  const paid       = Number(paidAmount) || 0;
  const remaining  = Number(remainingAmount) || 0;
  const discountAmt = Number(discount) || 0;
  const cashIn = Number(cashReceived) || 0;
  const changeAmt = Number(changeDue) || 0;
  const productsSubtotal = Number(grandTotal) - (Number(loaderFee) || 0) - (Number(bindingFee) || 0) + discountAmt;

  const L = isUrdu ? {
    shopName:      sp.shopNameUr || sp.shopName,
    phone1:        ownerLines[0] ? `${ownerLines[0].nameUr || ownerLines[0].name}: ${ownerLines[0].phone}` : "",
    phone2:        ownerLines[1] ? `${ownerLines[1].nameUr || ownerLines[1].name}: ${ownerLines[1].phone}` : "",
    phone3:        ownerLines[2] ? `${ownerLines[2].nameUr || ownerLines[2].name}: ${ownerLines[2].phone}` : "",
    address:       sp.addressUr || sp.address,
    billNoLbl:     "رسید نمبر",
    dateLbl:       "تاریخ",
    customerLbl:   isPurchase ? "سپلائر" : "گاہک",
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
    customerLbl:   isPurchase ? "Supplier" : "Customer",
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
  const parseRow = (row, category, productName) => parseSaleInvoiceRow(row, category, productName);

  const lineItems = [];
  (items || []).forEach(item => {
    (item.rows || []).forEach(row => {
      lineItems.push(parseRow(row, item.category, item.productName));
    });
  });

  const handlePrint = buildPrintHandler("thermal");
  const handlePrintA4 = buildPrintHandler("a4");
  const handlePrintPdf = buildPrintHandler("pdf", `${invoice || "sale"}-${date || "invoice"}`);
  const { page, center, bold500, dash, tbl, thS, tdS, tdNum } = sharedStyles;

  return (
    <>
      <style>{thermalPrintStyles}</style>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>

        <PrintButtonRow onClose={onClose} isUrdu={isUrdu} handlePrint={handlePrint} handlePrintA4={handlePrintA4} handlePrintPdf={handlePrintPdf} th={th} />

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
                  <th style={thS(COL_SN,  "center")}>{L.colSN}</th>
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
                  <td style={tdNum("right")} colSpan={2}>{formatPKR(productsSubtotal)}</td>
                </tr>
              </tbody>
            </table>

            <div style={dash} />

            {/* TOTAL */}
            {discountAmt > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", fontWeight: 700, marginBottom: 4 }}>
                <span>{isUrdu ? "رعایت" : "Discount"}</span>
                <span>- {formatPKR(discountAmt)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "15px", fontWeight: 900 }}>
              <span>{L.totalLbl}</span>
              <span>{formatPKR(grandTotal)}</span>
            </div>
            {cashIn > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", fontWeight: 700, marginTop: 4 }}>
                <span>{isUrdu ? "وصول رقم" : "Cash received"}</span>
                <span>{formatPKR(cashIn)}</span>
              </div>
            )}
            {changeAmt > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", fontWeight: 900, marginTop: 4 }}>
                <span>{isUrdu ? "واپسی (چینج)" : "Change"}</span>
                <span>{formatPKR(changeAmt)}</span>
              </div>
            )}

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


            <OkiieeBrandFooter />

          </div>
        </div>
      </div>
    </>
  );
}

export { CombinedThermalInvoice, CombinedSaleInvoice };