import { useTheme } from "../context/ThemeContext";
import { formatPKR, loadShopProfile, formatWeightKgG, printThermalOrA4 } from "../utils/helpers";
import {
  thermalPrintStyles,
  slipPage,
  ThermalSlipHeader,
  ThermalSlipMeta,
  ThermalSlipItemsTable,
  ThermalSlipTotals,
  ThermalSlipFooter,
  OkiieeBrandFooter,
  packLabel,
  saleTypeLabel,
  saleReceiptTitle,
} from "./ThermalSlipTheme";

export { thermalPrintStyles, OkiieeBrandFooter };

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
    const rows = (prod.rows && prod.rows.length)
      ? prod.rows
      : [{
          qty: Number(prod.qty) || 0,
          purchasePrice: Number(prod.productPrice) || 0,
          amount: Number(prod.total) || 0,
          desc: `${Number(prod.qty) || 0}pc × Rs${Number(prod.productPrice) || 0}/pc`,
        }];
    rows.forEach(row => {
      const li = parseRow(row, prod.category, prod.productName, prod.productPrice || 0);
      lineItems.push({ ...li, pack: packLabel(prod.category, li.qty) });
    });
  });

  const grandTotal  = lineItems.reduce((s, li) => s + li.amount, 0);
  const cashSaleNo = String(invoice || "").replace(/\D/g, "") || "";
  const handlePrint = buildPrintHandler("thermal");
  const handlePrintA4 = buildPrintHandler("a4");
  const handlePrintPdf = buildPrintHandler("pdf", `${invoice || "purchase"}-${date || "invoice"}`);
  const extras = [
    { label: L.payLbl, value: getPaymentLabel(paymentMethod, accountName || bankName, isUrdu) },
  ];

  return (
    <>
      <style>{thermalPrintStyles}</style>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
        <PrintButtonRow onClose={onClose} isUrdu={isUrdu} handlePrint={handlePrint} handlePrintA4={handlePrintA4} handlePrintPdf={handlePrintPdf} th={th} />
        <div style={{ background: "#f0f0f0", padding: "14px", borderRadius: 12, border: "1px solid #ccc", width: "100%", overflowX: "auto" }}>
          <div id="thermal-invoice" style={slipPage}>
            <ThermalSlipHeader title={isUrdu ? "خرید رسید" : "PURCHASE RECEIPT"} isUrdu={isUrdu} />
            <ThermalSlipMeta
              billNo={invoice}
              date={date}
              partyLabel={L.partyLbl}
              partyName={supplier}
              cashSaleLabel={cashSaleNo ? `${isUrdu ? "بل" : "BILL"} ${cashSaleNo}` : ""}
              isUrdu={isUrdu}
            />
            <ThermalSlipItemsTable
              isUrdu={isUrdu}
              rows={lineItems.map((li) => ({
                item: li.item, pack: li.pack, qty: li.qty, price: li.price, amount: li.amount,
              }))}
            />
            <ThermalSlipTotals
              isUrdu={isUrdu}
              itemCount={lineItems.length}
              gross={grandTotal}
              billAmount={grandTotal}
              cashReceived={paymentMethod === "credit" ? 0 : (Number(paidAmount) || grandTotal)}
              changeDue={0}
              paidAmount={paidAmount}
              remainingAmount={remainingAmount}
              isPartial={!!isPartial || Number(remainingAmount) > 0}
              extras={extras}
            />
            <ThermalSlipFooter isUrdu={isUrdu} role="admin" />
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
    grandTotal = 0, paymentMethod = "cash", bankName = "", settlement = "",
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
  const feeLoad = Number(loaderFee) || 0;
  const feeBind = Number(bindingFee) || 0;

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
      const line = parseRow(row, item.category, item.productName);
      if ((Number(line.amount) || 0) <= 0.009) return;
      lineItems.push({ ...line, pack: packLabel(item.category, line.qty) });
    });
  });

  const handlePrint = buildPrintHandler("thermal");
  const handlePrintA4 = buildPrintHandler("a4");
  const handlePrintPdf = buildPrintHandler("pdf", `${invoice || "sale"}-${date || "invoice"}`);
  const itemsGross = lineItems.reduce((s, li) => s + (Number(li.amount) || 0), 0);
  const gt = Number(grandTotal) || 0;
  const expectedWithLoader = Math.round((itemsGross + feeLoad + feeBind - discountAmt) * 100) / 100;
  const expectedWithout = Math.round((itemsGross + feeBind - discountAmt) * 100) / 100;
  const loaderInStoredTotal = feeLoad > 0 && itemsGross > 0
    && Math.abs(gt - expectedWithLoader) + 0.01 < Math.abs(gt - expectedWithout);
  const productsSubtotal = itemsGross > 0
    ? itemsGross
    : Math.max(0, (loaderInStoredTotal ? gt - feeLoad : gt) - feeBind + discountAmt);
  const netFromItems = Math.max(0, Math.round((productsSubtotal + feeBind - discountAmt) * 100) / 100);
  const storedNet = loaderInStoredTotal ? Math.max(0, Math.round((gt - feeLoad) * 100) / 100) : gt;
  const billAmount = itemsGross > 0
    ? (discountAmt > 0.009 && Math.abs(storedNet - productsSubtotal) < 0.5 ? netFromItems : (storedNet > 0 && Math.abs(storedNet - netFromItems) < 0.5 ? storedNet : netFromItems))
    : storedNet;

  const creditLike = paymentMethod === "credit"
    || settlement === "credit"
    || settlement === "partial"
    || !!isPartial
    || remaining > 0.009;
  const extras = [];
  if (feeBind > 0) extras.push({ label: L.bindingFeeLbl, value: formatPKR(feeBind) });
  extras.push({
    label: L.payLbl,
    value: creditLike
      ? (isUrdu ? "ادھار (Credit)" : (paid > 0 ? "Partial Credit" : "Credit"))
      : getPaymentLabel(paymentMethod, bankName, isUrdu),
  });
  const notes = [];
  if (loaderName || feeLoad > 0) {
    if (loaderName) notes.push({ label: L.loaderLbl, value: loaderName });
    if (feeLoad > 0) notes.push({ label: L.loaderFeeLbl, value: formatPKR(feeLoad) });
  }

  return (
    <>
      <style>{thermalPrintStyles}</style>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
        <PrintButtonRow onClose={onClose} isUrdu={isUrdu} handlePrint={handlePrint} handlePrintA4={handlePrintA4} handlePrintPdf={handlePrintPdf} th={th} />
        <div style={{ background: "#f0f0f0", padding: "14px", borderRadius: 12, border: "1px solid #ccc", width: "100%", overflowX: "auto" }}>
          <div id="thermal-invoice" style={slipPage}>
            <ThermalSlipHeader
              title={isPurchase
                ? (isUrdu ? "خرید رسید" : "PURCHASE RECEIPT")
                : saleReceiptTitle({ isCredit: creditLike, isUrdu })}
              isUrdu={isUrdu}
            />
            <ThermalSlipMeta
              billNo={invoice}
              date={date}
              partyLabel={L.customerLbl}
              partyName={customer}
              cashSaleLabel={isPurchase
                ? `${isUrdu ? "بل" : "BILL"} ${String(invoice || "").replace(/\D/g, "") || ""}`.trim()
                : saleTypeLabel({
                  invoice, paymentMethod, settlement, remainingAmount: remaining, isPartial: creditLike, isUrdu,
                })}
              isUrdu={isUrdu}
            />
            <ThermalSlipItemsTable
              isUrdu={isUrdu}
              rows={lineItems.map((li) => ({
                item: li.item, pack: li.pack, qty: li.qty, price: li.price, amount: li.amount,
              }))}
            />
            <ThermalSlipTotals
              isUrdu={isUrdu}
              itemCount={lineItems.length}
              gross={productsSubtotal}
              billAmount={billAmount}
              discount={discountAmt}
              cashReceived={cashIn > 0 ? cashIn : (creditLike ? 0 : billAmount)}
              changeDue={changeAmt}
              paidAmount={paid}
              remainingAmount={remaining}
              isPartial={creditLike}
              extras={extras}
              notes={notes}
            />
            <ThermalSlipFooter isUrdu={isUrdu} role="admin" />
          </div>
        </div>
      </div>
    </>
  );
}

export { CombinedThermalInvoice, CombinedSaleInvoice };