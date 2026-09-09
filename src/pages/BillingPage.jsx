import { useState } from "react";
import { useTheme } from "../context/ThemeContext";
import { useLang } from "../context/LangContext";
import { useResponsive, Icon, ICONS, Modal, StatCard, Table, WeightKgGInput, useTypeaheadNav, focusNextField } from "../components/shared";
import { api } from "../utils/api";
import { formatPKR, todayStr, loadShopProfile, formatWeightKgG, printThermalOrA4 } from "../utils/helpers";
import { convertQuantity, convertPrice, getUnitLabel, canConvert, unitOptions, productUnitOf } from "../utils/unitConversion";
import { shortenPipeName, OkiieeBrandFooter } from "../components/InvoiceComponents";
import { productDisplayName } from "../utils/constants";
import PaymentTerms, { useAccounts, derivePayment, isPayValid } from "../components/PaymentTerms";
import { recordTradeFinance } from "../utils/tradeFinance";
import PartyNamePicker from "../components/PartyNamePicker";

// ═══════════════════════════════════════════════════════════════════════════
// BILLING PAGE — COMPLETE UPDATE
// ✅ Fix 1: safeProductName function
// ✅ Fix 2: loaderName & loaderFee correctly passed to api.addSale
// ✅ Fix 3: Stock Validation
// ✅ Fix 4: Partial Payment feature
// ✅ Fix 5: Invoice in proper TABLE — clean, attractive, professional
// ✅ Fix 6: PRINT — visibility trick fixes Modal nesting issue
// ✅ Fix 7: PRINT WIDTH — 3 inch thermal slip
// ✅ Fix 8: PRINT FULL BOLD — font-weight:900 forced on every element
// ✅ Fix 9: TABLE INVOICE — Description/Qty/Rate/Amount columns per product
// ✅ Fix 10: INVOICE REDESIGN — plain "Sleek Bill" style (SN/Item/Qty/Price/Amt,
//            dashed rules, Subtotal + TOTAL, Thank You footer)
// ✅ Fix 11: PRINT BLANK PAGE FIX — portal no longer collapses to zero height,
//            th (theme) was missing inside BillingSaleInvoice causing a crash
// ✅ Fix 12: PRINT NOW MATCHES PREVIEW — print clone no longer overrides the
//            invoice's own fonts/weights (was forcing Courier New + 900 on
//            everything, which made the print look different from preview)
// ═══════════════════════════════════════════════════════════════════════════

function safeProductName(product) {
  if (!product) return "—";
  if (typeof product === "string") return product;
  return product.name || product.productName || "—";
}

function numberToWords(num) {
  if (!num || isNaN(num)) return "";
  const ones = ["","one","two","three","four","five","six","seven","eight","nine",
    "ten","eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen"];
  const tens2 = ["","","twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety"];
  function convert(n) {
    if (n === 0) return "";
    if (n < 20) return ones[n];
    if (n < 100) return tens2[Math.floor(n/10)] + (n%10 ? " " + ones[n%10] : "");
    if (n < 1000) return ones[Math.floor(n/100)] + " hundred" + (n%100 ? " " + convert(n%100) : "");
    if (n < 100000) return convert(Math.floor(n/1000)) + " thousand" + (n%1000 ? " " + convert(n%1000) : "");
    if (n < 10000000) return convert(Math.floor(n/100000)) + " lakh" + (n%100000 ? " " + convert(n%100000) : "");
    return convert(Math.floor(n/10000000)) + " crore" + (n%10000000 ? " " + convert(n%10000000) : "");
  }
  const integer = Math.floor(Math.abs(num));
  const decimal = Math.round((Math.abs(num) - integer) * 100);
  let result = convert(integer) + " rupees";
  if (decimal > 0) result += " and " + convert(decimal) + " paisa";
  return result.charAt(0).toUpperCase() + result.slice(1) + " only";
}

function getProductId(product) {
  if (!product) return null;
  return product._id || product.id || null;
}

const pipeBillCalc = (purchasePrice, percentage, qty, length) => {
  const totalFeet = (Number(qty)||0) * (Number(length)||0);
  const effectivePrice = (Number(purchasePrice)||0) * (1 + (Number(percentage)||0)/100);
  return { totalFeet, effectivePrice, total: totalFeet * effectivePrice };
};
const netBillCalc = (salePricePerFeet, feet) => {
  const sp = Number(salePricePerFeet)||0; const f = Number(feet)||0;
  return { salePricePerFeet: sp, total: sp * f };
};
const chaderBillCalc = (salePricePerKg, weight) => {
  const sp = Number(salePricePerKg)||0; const w = Number(weight)||0;
  return { salePricePerKg: sp, total: sp * w };
};
const hwBillCalc = (salePricePerPc, qty) => {
  const sp = Number(salePricePerPc)||0; const q = Number(qty)||0;
  return { salePricePerPc: sp, total: sp * q };
};
const roundUnitAmt = (n) => {
  const x = Math.round((Number(n) || 0) * 100) / 100;
  return String(x);
};
const stockUnitLabel = (cat, product) => {
  if (cat === "Chader") return "kg";
  if (cat === "Net" || cat === "Pipe") return "ft";
  return getUnitLabel(productUnitOf(product));
};
const getBillingBlockSubtotal = (block, products) => {
  const prod = products.find(p => (p._id || p.id) === block.productId);
  if (!prod) return 0;
  const pp = prod.price || 0;
  if (prod.category === "Pipe")   return (block.pipeRows||[]).reduce((s,r) => s + pipeBillCalc(pp, r.percentage, r.qty, r.length).total, 0);
  if (prod.category === "Chader") return (block.chaderRows||[]).reduce((s,r) => s + chaderBillCalc(r.salePrice ?? pp, r.weight).total, 0);
  if (prod.category === "Net")    return (block.netRows||[]).reduce((s,r) => s + netBillCalc(r.salePrice ?? pp, r.feet).total, 0);
  return (block.hwRows||[]).reduce((s,r) => s + hwBillCalc(r.salePrice ?? pp, r.qty).total, 0);
};

const getBillingBlockStockError = (block, products, isUrdu) => {
  const prod = products.find(p => (p._id || p.id) === block.productId);
  if (!prod) return null;
  const stock = Number(prod.stock) || 0;
  const cat   = prod.category || "";
  let entered = 0;
  if (cat === "Pipe")   entered = (block.pipeRows||[]).reduce((s,r) => s + (Number(r.qty)||0), 0);
  else if (cat === "Chader") entered = (block.chaderRows||[]).reduce((s,r) => s + (Number(r.weight)||0), 0);
  else if (cat === "Net")    entered = (block.netRows||[]).reduce((s,r) => s + (Number(r.feet)||0), 0);
  else {
    const pUnit = productUnitOf(prod);
    entered = (block.hwRows||[]).reduce((s, r) => {
      const saleUnit = r.unit || pUnit;
      return s + convertQuantity(Number(r.qty) || 0, saleUnit, pUnit);
    }, 0);
  }
  if (entered > 0 && entered > stock) {
    const unit = cat === "Chader" ? "kg" : cat === "Net" ? "ft" : getUnitLabel(productUnitOf(prod));
    return isUrdu
      ? `🚫 Stock صرف ${stock} ${unit} ہے — آپ نے ${entered} ${unit} داخل کیا`
      : `🚫 Only ${stock} ${unit} in stock — you entered ${entered} ${unit}`;
  }
  return null;
};

const getPaymentLabel = (paymentMethod, bankName, isUrdu) => {
  if (paymentMethod === "credit")    return isUrdu ? "ادھار (Credit)" : "Credit";
  if (paymentMethod === "bank")      return `Bank: ${bankName || (isUrdu ? "بینک" : "Bank")}`;
  if (paymentMethod === "jazzcash")  return `JazzCash${bankName ? ` (${bankName})` : ""}`;
  if (paymentMethod === "easypaisa") return `Easypaisa${bankName ? ` (${bankName})` : ""}`;
  if (paymentMethod === "wallet")    return bankName ? `Wallet: ${bankName}` : (isUrdu ? "والٹ" : "Wallet");
  return bankName ? (isUrdu ? `نقد: ${bankName}` : `Cash: ${bankName}`) : (isUrdu ? "نقد (Cash)" : "Cash");
};
const getPaymentBadgeStyle = (paymentMethod) => {
  if (paymentMethod === "credit")    return { background:"rgba(248,113,113,0.15)", color:"#f87171" };
  if (paymentMethod === "bank")      return { background:"rgba(96,165,250,0.15)",  color:"#60a5fa" };
  if (paymentMethod === "jazzcash")  return { background:"rgba(232,67,147,0.15)", color:"#e84393" };
  if (paymentMethod === "easypaisa") return { background:"rgba(0,166,81,0.15)",   color:"#00a651" };
  if (paymentMethod === "wallet")    return { background:"rgba(167,139,250,0.15)", color:"#a78bfa" };
  return { background:"rgba(52,211,153,0.15)", color:"#34d399" };
};

// ─── PRINT STYLES ────────────────────────────────────────────────────────────
// NOTE: this <style> tag is only a fallback for direct Ctrl+P while the
// modal happens to be open. It mirrors the SAME fonts/weights used in the
// live preview below (Arial, normal weights) so screen and print never
// disagree. It must NOT force a different font or font-weight onto the
// invoice — that mismatch was the actual bug being reported.
const thermalPrintStyles = `
@page {
  size: 3in 297mm;
  margin: 1.5mm;
}

@media print {

html,
body{
    margin:0 !important;
    padding:0 !important;
    background:#fff !important;
    font-family:Arial, sans-serif;
    font-size:14px;
}

body *{
    visibility:hidden !important;
}

#print-portal-overlay,
#print-portal-overlay *,
#thermal-invoice-print,
#thermal-invoice-print *,
#thermal-invoice,
#thermal-invoice *{
    visibility:visible !important;
    color:#000 !important;
}

#thermal-invoice-print,
#thermal-invoice{
    position:relative !important;
    left:0 !important;
    top:0 !important;
    width:100% !important;
    padding:2mm 1mm !important;
    background:#fff;
    box-sizing:border-box;
    font-size:12px;
    line-height:1.35;
}

/* HEADER */
.bill-title{
    text-align:center;
    font-size:26px;
    margin-bottom:8px;
}

.bill-info{
    text-align:center;
    font-size:13px;
    line-height:1.3;
}

/* TABLE */

.invoice-table{
    width:100%;
    table-layout:fixed;
    border-collapse:collapse;
}

.invoice-table thead{
    border-top:1px dashed #000;
    border-bottom:1px dashed #000;
}

.invoice-table th{
    padding:8px 0;
    font-size:15px;
    font-weight:600;
}

.invoice-table td{
    padding:8px 0;
    vertical-align:top;
    word-break:break-word;
}

/* COLUMN WIDTHS */

.col-sn{
width:10%;
text-align:center;
}

.col-item{
width:42%;
text-align:left;
}

.col-qty{
width:12%;
text-align:center;
}

.col-price{
width:18%;
text-align:right;
}

.col-amt{
width:18%;
text-align:right;
}

/* TOTAL AREA */

.summary{
border-top:1px dashed #000;
padding-top:8px;
}

.summary-row{
display:flex;
justify-content:space-between;
margin-bottom:6px;
}

.total{
font-size:22px;
font-weight:600;
}

.footer{
text-align:center;
margin-top:20px;
}

button{
display:none !important;
}

}
`;

// ─── INVOICE COMPONENT ───────────────────────────────────────────────────────
function BillingSaleInvoice({ invoiceData, onClose, isUrdu }) {
  const th = useTheme();
  const {
    invoice, date, customer, items, grandTotal,
    paymentMethod, bankName, accountName,
    paidAmount, remainingAmount, isPartial,
    loaderName, loaderFee, bindingFee
  } = invoiceData;

  const sp         = loadShopProfile();
  const ownerLines = sp.owners.filter(o => o.name || o.nameUr);
  const paid       = Number(paidAmount)      || 0;
  const remaining  = Number(remainingAmount) || 0;
  // grandTotal already includes loaderFee + bindingFee (bill total charged to customer).
  // Subtotal row should show products-only amount, so subtract both back out.
  const productsSubtotal = Number(grandTotal) - (Number(loaderFee) || 0) - (Number(bindingFee) || 0);

  const L = isUrdu ? {
    shopName:      sp.shopNameUr || sp.shopName,
    phone1:        ownerLines[0] ? `${ownerLines[0].nameUr||ownerLines[0].name}: ${ownerLines[0].phone}` : "",
    phone2:        ownerLines[1] ? `${ownerLines[1].nameUr||ownerLines[1].name}: ${ownerLines[1].phone}` : "",
    phone3:        ownerLines[2] ? `${ownerLines[2].nameUr||ownerLines[2].name}: ${ownerLines[2].phone}` : "",
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
    thanks:        "شکریہ",
    softName:      "اوکی سافٹ ویئر",
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
    thanks:        "Thank You",
    softName:      "okiiee Software",
    softPhone:     "03057903867",
  };

  // Parse invoice row desc into flat line-items (SN / Item / Qty / Price / Amt)
  // Each product block can contain multiple rows — every row becomes its own
  // numbered line, exactly like the sample bill (SN goes 1,2,3... across ALL items).
  const parseRow = (row, category, productName) => {
    const desc = row.desc || "";
    if (category === "Pipe") {
      const qM = desc.match(/^(\d+\.?\d*)pc/);
      const pM = desc.match(/Rs(\d+\.?\d*)\/pc/);
      return { item: shortenPipeName(productName), qty: qM ? qM[1] : "1", price: pM ? Number(pM[1]) : 0, amount: row.amount };
    }
    if (category === "Chader") {
      const qM = desc.match(/^(\d+\.?\d*)kg/);
      const pM = desc.match(/Rs(\d+\.?\d*)\/kg/);
      return { item: productName, qty: qM ? formatWeightKgG(parseFloat(qM[1])) : "1", price: pM ? Number(pM[1]) : 0, amount: row.amount };
    }
    if (category === "Net") {
      const qM = desc.match(/^(\d+\.?\d*)ft/);
      const pM = desc.match(/Rs(\d+\.?\d*)\/ft/);
      return { item: productName, qty: qM ? `${qM[1]}ft` : "1", price: pM ? Number(pM[1]) : 0, amount: row.amount };
    }
    const qM = desc.match(/^(\d+\.?\d*)pc/);
    const pM = desc.match(/Rs(\d+\.?\d*)\/pc/);
    return { item: productName, qty: qM ? qM[1] : "1", price: pM ? Number(pM[1]) : 0, amount: row.amount };
  };

  // Flatten all items/rows into a single numbered list for the receipt body
  const lineItems = [];
  (items || []).forEach(item => {
    (item.rows || []).forEach(row => {
      lineItems.push(parseRow(row, item.category, item.productName));
    });
  });

  const page = {
  width: "3in",
  margin: "0 auto",
  fontFamily: "Arial, sans-serif",
  fontSize: "14px",
  color: "#000",
  background: "#fff",
  padding: "6px 4px 10px",
  boxSizing: "border-box",
};

const center = {
  textAlign: "center",
};

const bold900 = {
  fontWeight: 500,
};

const dash = {
  borderTop: "1px dashed #000",
  margin: "8px 0",
};

const tbl = {
  width: "100%",
  borderCollapse: "collapse",
  tableLayout: "fixed",
};

const thS = (w, align) => ({
  width: w,
  padding: "6px 3px", // sab equal gap
  fontWeight: 600,
  fontSize: "11px",

  textAlign: align || "center",

  whiteSpace: "nowrap",
  overflow: "hidden",
});

const tdS = (align) => ({
  padding: "6px 3px", // equal spacing
  fontWeight: 400,
  fontSize: "11px",

  textAlign: align || "center",
  verticalAlign: "top",

  wordBreak: "break-word",
  overflowWrap: "break-word",
});

const tdNum = (align) => ({
  padding: "6px 3px", // same gap
  fontWeight: 400,
  fontSize: "11px",

  textAlign: align || "right",

  whiteSpace: "nowrap",
});


/* BALANCED WIDTHS */

const COL_SN = "8%";
const COL_ITEM = "40%";
const COL_QTY = "16%";
const COL_PRICE = "18%";
const COL_AMT = "18%";


  // ── PRINT MECHANISM ─────────────────────────────────────────────────────
  // Two things this must guarantee:
  // 1) No blank page: the portal stays in normal document flow (real width
  //    & height) instead of width:0/height:0/overflow:hidden, which is what
  //    used to make some browsers compute a zero-height printable area.
  // 2) Print must look IDENTICAL to the on-screen preview: we clone the
  //    actual rendered #thermal-invoice node as-is and do NOT overwrite its
  //    font-family/font-weight on the clone. Previously the clone was force-
  //    set to Courier New + font-weight 900 on every element, which is why
  //    the printed receipt looked different from the preview (different
  //    font, everything bold). That override is removed below.
  const handlePrint = () => printThermalOrA4("thermal");

  return (
    <>
      <style>{thermalPrintStyles}</style>
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:16 }}>

        {/* ── Buttons ── */}
        <div style={{ display:"flex", gap:10, width:"100%" }}>
          <button onClick={handlePrint}
            style={{ flex:1, padding:"10px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#1abc9c,#2980b9)", color:"white", fontWeight:700, fontSize:14, cursor:"pointer" }}>
            🖨️ {isUrdu ? "پرنٹ کریں" : "Print Invoice"}
          </button>
          <button onClick={onClose}
            style={{ padding:"10px 18px", borderRadius:10, border:`1px solid ${th.border}`, background:th.bgCard, color:th.textMuted, fontWeight:600, fontSize:14, cursor:"pointer" }}>
            ✕ {isUrdu ? "بند کریں" : "Close"}
          </button>
        </div>

        {/* ── Preview wrapper ── */}
        <div style={{ background:"#f0f0f0", padding:"14px", borderRadius:12, border:"1px solid #ccc", width:"100%", overflowX:"auto" }}>
          <div id="thermal-invoice" style={page}>

            {/* Shop logo */}
            {sp.logoBase64 && (
              <div style={{ ...center, marginBottom:6 }}>
                <img src={sp.logoBase64} alt="logo" style={{ maxWidth:56, maxHeight:40, objectFit:"contain" }}/>
              </div>
            )}

            {/* Shop name */}
            <div
style={{
...center,
fontSize:"22px",
fontWeight:700,
lineHeight:"28px",
marginBottom:"4px",
letterSpacing:"0.3px"
}}
>{L.shopName}</div>

            {/* Address */}
            {L.address && <div style={{ ...center, ...bold900, fontSize:"10px", marginTop:4, lineHeight:1.4 }}>{L.address}</div>}

            {/* Owner phones */}
            {L.phone1 && <div style={{ ...center, ...bold900, fontSize:"10px", marginTop:2 }}>{L.phone1}</div>}
            {L.phone2 && <div style={{ ...center, ...bold900, fontSize:"10px", marginTop:1 }}>{L.phone2}</div>}
            {L.phone3 && <div style={{ ...center, ...bold900, fontSize:"10px", marginTop:1 }}>{L.phone3}</div>}

            {/* ── Bill No / Date row ── */}
            <table style={{ ...tbl, marginTop:8 }}>
              <tbody>
                <tr>
                  <td style={tdS("left")}>{L.billNoLbl}: {invoice}</td>
                  <td style={tdS("right")}>
                    {L.dateLbl}: {new Date(date).toLocaleDateString(
                      isUrdu ? "ur-PK" : "en-PK",
                      { day:"2-digit", month:"short", year:"numeric" }
                    )}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Customer line */}
            <div style={{ fontWeight:900, fontSize:"11px", marginTop:2 }}>{L.customerLbl}: {customer}</div>

            <div style={dash}/>

            {/* ── Items table — header + rows + subtotal in ONE table so the
                 5 columns stay locked/aligned (separate tables before this
                 fix each computed their own widths independently, which is
                 what caused the column "stretching"/misalignment). ── */}
          {/* ITEMS TABLE */}
<table className="inv-items" style={{ ...tbl, marginTop: 2 }}>

<colgroup>
<col style={{width:COL_SN}}/>
<col style={{width:COL_ITEM}}/>
<col style={{width:COL_QTY}}/>
<col style={{width:COL_PRICE}}/>
<col style={{width:COL_AMT}}/>
</colgroup>

<thead>

<tr>

<th style={thS(COL_SN,"center")}>
{L.colSN}
</th>

<th style={thS(COL_ITEM,"left")}>
{L.colItem}
</th>

<th style={thS(COL_QTY,"center")}>
{L.colQty}
</th>

<th style={thS(COL_PRICE,"right")}>
Price
</th>

<th style={thS(COL_AMT,"right")}>
Amount
</th>

</tr>

</thead>

<tbody>

{lineItems.map((li,i)=>(

<tr key={i}>

<td style={tdS("center")}>
{i+1}
</td>

<td
style={{
...tdS("left"),
paddingRight:"6px"
}}
>
{li.item}
</td>

<td style={{...tdNum("center"), whiteSpace:"normal", wordBreak:"break-word", lineHeight:1.25, fontSize:"10px"}}>
  {li.qty}
</td>

<td style={tdNum("right")}>
  {
    Number.isInteger(Number(li.price))
      ? Number(li.price)
      : Number(li.price).toFixed(1)
  }
</td>

<td style={tdNum("right")}>
  {
    Number.isInteger(Number(li.amount))
      ? Number(li.amount)
      : Number(li.amount).toFixed(1)
  }
</td>

</tr>

))}

</tbody>

</table>

<div style={dash}/>


{/* SUBTOTAL */}
<table style={tbl}>

<colgroup>
<col style={{ width:"8%" }} />
<col style={{ width:"40%" }} />
<col style={{ width:"12%" }} />
<col style={{ width:"20%" }} />
<col style={{ width:"20%" }} />
</colgroup>

<tbody>

<tr>

<td
style={{
...tdS("left"),
fontWeight:600
}}
colSpan={2}
>
{L.subtotalLbl}
</td>

<td style={tdNum("center")}>
{lineItems.length}
</td>

<td
style={tdNum("right")}
colSpan={2}
>
{formatPKR(productsSubtotal)}
</td>

</tr>

</tbody>

</table>

            <div style={dash}/>

            {/* ── Subtotal — own table, same colgroup so its columns line up
                 with the items table above it ── */}
        

            <div style={dash}/>

            {/* ── TOTAL ── */}
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:"15px", fontWeight:900 }}>
              <span>{L.totalLbl}</span>
              <span>{formatPKR(grandTotal)}</span>
            </div>

            {/* ── Partial payment breakdown (kept, styled plainly) ── */}
            {isPartial && paid > 0 && (
              <>
                <div style={dash}/>
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
                <div style={{ textAlign:"center", marginTop:4, fontWeight:900, fontSize:"10px", letterSpacing:"0.4px" }}>
                  {remaining > 0 ? `⚠ ${L.partialBadge}` : `✓ ${L.fullPaidBadge}`}
                </div>
              </>
            )}
            {!isPartial && (
              <div style={{ textAlign:"center", marginTop:6, fontWeight:900, fontSize:"10px", letterSpacing:"0.4px" }}>
                ✓ {L.fullPaidBadge}
              </div>
            )}

          
           

            <div style={dash}/>

            {/* ── Payment & loader info ── */}
       <table style={{ ...tbl }}>

<tbody>

<tr>

<td
style={{
...tdS("left"),
width:"30%",
verticalAlign:"middle",
padding:"6px 3px"
}}
>
{L.payLbl}
</td>

<td
colSpan={4}
style={{
...tdS("right"),
width:"70%",
verticalAlign:"middle",
padding:"6px 3px",
whiteSpace:"nowrap"
}}
>
{getPaymentLabel(paymentMethod, accountName || bankName, isUrdu)}
</td>

</tr>

{loaderName && (
<tr>

<td style={{...tdS("left"),verticalAlign:"middle"}}>
{L.loaderLbl}
</td>

<td
colSpan={4}
style={{
...tdS("right"),
verticalAlign:"middle"
}}
>
{loaderName}
</td>

</tr>
)}

{loaderName && Number(loaderFee)>0 && (
<tr>

<td style={{...tdS("left"),verticalAlign:"middle"}}>
{L.loaderFeeLbl}
</td>

<td
colSpan={4}
style={{
...tdS("right"),
verticalAlign:"middle"
}}
>
{formatPKR(Number(loaderFee))}
</td>

</tr>
)}

{Number(bindingFee)>0 && (
<tr>

<td style={{...tdS("left"),verticalAlign:"middle"}}>
{L.bindingFeeLbl}
</td>

<td
colSpan={4}
style={{
...tdS("right"),
verticalAlign:"middle"
}}
>
{formatPKR(Number(bindingFee))}
</td>

</tr>
)}

<tr>

<td style={{...tdS("left"),verticalAlign:"middle"}}>
{L.timeLbl}
</td>

<td
colSpan={4}
style={{
...tdS("right"),
verticalAlign:"middle"
}}
>
{new Date().toLocaleTimeString(
isUrdu?"ur-PK":"en-PK",
{
hour:"2-digit",
minute:"2-digit"
}
)}
</td>

</tr>

</tbody>

</table>

            <div style={dash}/>

            <OkiieeBrandFooter />

          </div>
        </div>
      </div>
    </>
  );
}

// ─── PIPE BILLING ROWS ────────────────────────────────────────────────────────
function PipeBillingRows({ rows, onChange, purchasePrice, availStock, isUrdu }) {
  const th = useTheme();
  const inpS = { background:th.input, border:`1px solid ${th.inputBorder}`, color:th.text, borderRadius:10, padding:"9px 11px", fontSize:14, outline:"none", width:"100%", boxSizing:"border-box" };
  const currentRows = rows.length > 0 ? rows : [{ _id:Date.now()+Math.random(), length:"", qty:"", percentage:"" }];
  const row = currentRows[0];
  const update = (k, v) => onChange([{ ...row, [k]: v }]);
  const c = pipeBillCalc(purchasePrice, row.percentage, row.qty, row.length);
  const pricePerPc = c.effectivePrice * (Number(row.length)||0);
  const enteredQty = Number(row.qty) || 0;
  const stockErr   = enteredQty > 0 && enteredQty > availStock;
  return (
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      <div style={{padding:"7px 11px",borderRadius:8,background:"rgba(96,165,250,0.08)",border:"1px solid rgba(96,165,250,0.2)",fontSize:13,color:"#60a5fa",fontWeight:600}}>
        🔩 Purchase Price: Rs {purchasePrice}/ft — {isUrdu ? "مارکپ % داخل کریں" : "Enter markup % for sale price"}
      </div>
      <div style={{padding:"6px 11px",borderRadius:8,background:availStock===0?"rgba(248,113,113,0.1)":"rgba(52,211,153,0.08)",border:`1px solid ${availStock===0?"rgba(248,113,113,0.3)":"rgba(52,211,153,0.2)"}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{fontSize:12,color:th.textMuted}}>{isUrdu?"دستیاب Stock:":"Available Stock:"}</span>
        <span style={{fontWeight:900,fontSize:14,color:availStock===0?"#f87171":availStock<10?"#fbbf24":"#34d399"}}>
          {availStock} pcs {availStock===0?"🚫":availStock<10?"⚠️":""}
        </span>
      </div>
      <div style={{padding:10,borderRadius:10,border:`1px solid ${stockErr?"rgba(248,113,113,0.5)":th.border}`,background:th.bgCard}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
          <div>
            <label style={{color:th.textMuted,fontSize:11,display:"block",marginBottom:3}}>Length (ft)</label>
            <input type="text" inputMode="decimal" value={row.length} onChange={e=>update("length",e.target.value)} placeholder="e.g. 20" style={inpS}/>
          </div>
          <div>
            <label style={{color:stockErr?"#f87171":th.textMuted,fontSize:11,display:"block",marginBottom:3,fontWeight:stockErr?700:400}}>
              Pieces {availStock>0&&<span style={{color:th.textDim,fontWeight:400}}>(max: {availStock})</span>}
            </label>
            <input type="text" inputMode="decimal" value={row.qty} onChange={e=>update("qty",e.target.value)} placeholder="0"
              style={{...inpS,border:stockErr?"2px solid rgba(248,113,113,0.7)":inpS.border}}/>
          </div>
          <div>
            <label style={{color:th.textMuted,fontSize:11,display:"block",marginBottom:3}}>Markup %</label>
            <input type="text" inputMode="decimal" value={row.percentage} onChange={e=>update("percentage",e.target.value)} placeholder="5" style={inpS}/>
          </div>
        </div>
        {stockErr && (
          <div style={{marginTop:8,padding:"7px 10px",borderRadius:8,background:"rgba(248,113,113,0.12)",border:"1px solid rgba(248,113,113,0.4)",color:"#f87171",fontSize:13,fontWeight:700}}>
            🚫 {isUrdu?`Stock صرف ${availStock} pcs ہے`:`Only ${availStock} pcs in stock`}
          </div>
        )}
        {c.total > 0 && !stockErr && (
          <div style={{marginTop:8,padding:"5px 10px",borderRadius:8,background:"rgba(52,211,153,0.08)",border:"1px solid rgba(52,211,153,0.15)",display:"flex",justifyContent:"space-between",fontSize:13}}>
            <span style={{color:th.textMuted}}>{row.qty}pc × Rs{pricePerPc.toFixed(0)}/pc</span>
            <span style={{color:"#34d399",fontWeight:700}}>{formatPKR(c.total)}</span>
          </div>
        )}
      </div>
      {c.total > 0 && !stockErr && (
        <div style={{display:"flex",justifyContent:"space-between",padding:"9px 14px",borderRadius:10,background:"rgba(96,165,250,0.08)",border:"1px solid rgba(96,165,250,0.2)"}}>
          <span style={{color:th.textMuted,fontSize:14,fontWeight:600}}>Pipe Total:</span>
          <span style={{color:"#60a5fa",fontWeight:900,fontSize:16}}>{formatPKR(c.total)}</span>
        </div>
      )}
    </div>
  );
}

// ─── CHADER BILLING ROWS ──────────────────────────────────────────────────────
function ChaderBillingRows({ rows, onChange, purchasePrice, availStock, isUrdu }) {
  const th = useTheme();
  const inpS = { background:th.input, border:`1px solid ${th.inputBorder}`, color:th.text, borderRadius:10, padding:"9px 11px", fontSize:14, outline:"none", width:"100%", boxSizing:"border-box" };
  // Sale price is only pre-filled once when the product is first selected (see makeDefaultRow).
  // It is NOT re-forced from purchasePrice on every render, so the user can freely clear it
  // and type their own custom sale price without it snapping back.
  const row = rows[0] || { _id:Date.now()+Math.random(), weight:"", salePrice:"" };
  const update = (k, v) => onChange([{ ...row, [k]: v }]);
  const c = chaderBillCalc(row.salePrice, row.weight);
  const enteredKg = Number(row.weight) || 0;
  const stockErr  = enteredKg > 0 && enteredKg > availStock;
  const ppZero    = !purchasePrice || purchasePrice === 0;
  return (
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      <div style={{padding:"7px 11px",borderRadius:8,background:ppZero?"rgba(251,191,36,0.08)":"rgba(52,211,153,0.08)",border:ppZero?"1px solid rgba(251,191,36,0.3)":"1px solid rgba(52,211,153,0.2)",fontSize:13,color:ppZero?"#fbbf24":"#34d399",fontWeight:600}}>
        📋 {ppZero
          ? (isUrdu ? "⚠️ خریداری قیمت سیٹ نہیں — Sale price نیچے خود داخل کریں" : "⚠️ Purchase price not set — enter sale price/kg manually below")
          : (isUrdu ? `خریداری قیمت: Rs ${purchasePrice}/kg — Sale price نیچے تبدیل کریں` : `Purchase Price: Rs ${purchasePrice}/kg — Sale price editable below`)
        }
      </div>
      <div style={{padding:"6px 11px",borderRadius:8,background:availStock===0?"rgba(248,113,113,0.1)":"rgba(52,211,153,0.08)",border:`1px solid ${availStock===0?"rgba(248,113,113,0.3)":"rgba(52,211,153,0.2)"}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{fontSize:12,color:th.textMuted}}>{isUrdu?"دستیاب Stock:":"Available Stock:"}</span>
        <span style={{fontWeight:900,fontSize:14,color:availStock===0?"#f87171":availStock<10?"#fbbf24":"#34d399"}}>
          {availStock} kg {availStock===0?"🚫":availStock<10?"⚠️":""}
        </span>
      </div>
      <div style={{padding:10,borderRadius:10,border:`1px solid ${stockErr?"rgba(248,113,113,0.5)":th.border}`,background:th.bgCard}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <div>
            <label style={{color:stockErr?"#f87171":th.textMuted,fontSize:11,display:"block",marginBottom:3,fontWeight:stockErr?700:400}}>
              Weight {availStock>0&&<span style={{color:th.textDim,fontWeight:400}}>(max: {formatWeightKgG(availStock)})</span>}
            </label>
            <div style={{border:stockErr?"2px solid rgba(248,113,113,0.7)":"none",borderRadius:10}}>
              <WeightKgGInput key={row._id} value={row.weight} onChange={v=>update("weight",v)} compact/>
            </div>
          </div>
          <div>
            <label style={{color:th.textMuted,fontSize:11,display:"block",marginBottom:3}}>Sale Price/kg (Rs)</label>
            <input type="text" inputMode="decimal" value={row.salePrice} onChange={e=>update("salePrice",e.target.value)} placeholder={purchasePrice > 0 ? String(purchasePrice) : "قیمت داخل کریں"} style={{...inpS,border:"2px solid rgba(52,211,153,0.4)"}}/>
          </div>
        </div>
        {stockErr && (
          <div style={{marginTop:8,padding:"7px 10px",borderRadius:8,background:"rgba(248,113,113,0.12)",border:"1px solid rgba(248,113,113,0.4)",color:"#f87171",fontSize:13,fontWeight:700}}>
            🚫 {isUrdu?`Stock صرف ${availStock} kg ہے`:`Only ${availStock} kg in stock`}
          </div>
        )}
        {c.total > 0 && !stockErr && (
          <div style={{marginTop:8,padding:"5px 10px",borderRadius:8,background:"rgba(52,211,153,0.08)",display:"flex",justifyContent:"space-between",fontSize:13}}>
            <span style={{color:th.textMuted}}>{formatWeightKgG(row.weight)} × Rs{Number(row.salePrice) > 0 ? Number(row.salePrice).toFixed(0) : "?"}/kg</span>
            <span style={{color:"#34d399",fontWeight:700}}>{formatPKR(c.total)}</span>
          </div>
        )}
      </div>
      {c.total > 0 && !stockErr && (
        <div style={{display:"flex",justifyContent:"space-between",padding:"9px 14px",borderRadius:10,background:"rgba(52,211,153,0.08)",border:"1px solid rgba(52,211,153,0.2)"}}>
          <span style={{color:th.textMuted,fontSize:14,fontWeight:600}}>Chader Total:</span>
          <span style={{color:"#34d399",fontWeight:900,fontSize:16}}>{formatPKR(c.total)}</span>
        </div>
      )}
    </div>
  );
}

// ─── NET BILLING ROWS ─────────────────────────────────────────────────────────
function NetBillingRows({ rows, onChange, purchasePrice, availStock, isUrdu }) {
  const th = useTheme();
  const inpS = { background:th.input, border:`1px solid ${th.inputBorder}`, color:th.text, borderRadius:10, padding:"9px 11px", fontSize:14, outline:"none", width:"100%", boxSizing:"border-box" };
  // Sale price is only pre-filled once when the product is first selected (see makeDefaultRow).
  // It is NOT re-forced from purchasePrice on every render, so the user can freely clear it
  // and type their own custom sale price without it snapping back.
  const row = rows[0] || { _id:Date.now()+Math.random(), feet:"", salePrice:"", width:"" };
  const update = (k, v) => onChange([{ ...row, [k]: v }]);
  const c = netBillCalc(row.salePrice, row.feet);
  const enteredFt = Number(row.feet) || 0;
  const stockErr  = enteredFt > 0 && enteredFt > availStock;
  const ppZero    = !purchasePrice || purchasePrice === 0;
  return (
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      <div style={{padding:"7px 11px",borderRadius:8,background:ppZero?"rgba(251,191,36,0.08)":"rgba(244,114,182,0.08)",border:ppZero?"1px solid rgba(251,191,36,0.3)":"1px solid rgba(244,114,182,0.2)",fontSize:13,color:ppZero?"#fbbf24":"#f472b6",fontWeight:600}}>
        🕸️ {ppZero
          ? (isUrdu ? "⚠️ خریداری قیمت سیٹ نہیں — Sale price نیچے خود داخل کریں" : "⚠️ Purchase price not set — enter sale price/ft manually below")
          : (isUrdu ? `خریداری قیمت: Rs ${purchasePrice}/ft — Sale price نیچے تبدیل کریں` : `Purchase Price: Rs ${purchasePrice}/ft — Sale price editable below`)
        }
      </div>
      <div style={{padding:"6px 11px",borderRadius:8,background:availStock===0?"rgba(248,113,113,0.1)":"rgba(244,114,182,0.08)",border:`1px solid ${availStock===0?"rgba(248,113,113,0.3)":"rgba(244,114,182,0.2)"}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{fontSize:12,color:th.textMuted}}>{isUrdu?"دستیاب Stock:":"Available Stock:"}</span>
        <span style={{fontWeight:900,fontSize:14,color:availStock===0?"#f87171":availStock<10?"#fbbf24":"#f472b6"}}>
          {availStock} ft {availStock===0?"🚫":availStock<10?"⚠️":""}
        </span>
      </div>
      <div style={{padding:10,borderRadius:10,border:`1px solid ${stockErr?"rgba(248,113,113,0.5)":th.border}`,background:th.bgCard}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
          <div>
            <label style={{color:stockErr?"#f87171":th.textMuted,fontSize:11,display:"block",marginBottom:3,fontWeight:stockErr?700:400}}>
              Feet {availStock>0&&<span style={{color:th.textDim,fontWeight:400}}>(max: {availStock})</span>}
            </label>
            <input type="text" inputMode="decimal" value={row.feet} onChange={e=>update("feet",e.target.value)} placeholder="0"
              style={{...inpS,border:stockErr?"2px solid rgba(248,113,113,0.7)":inpS.border}}/>
          </div>
          <div>
            <label style={{color:"#f472b6",fontSize:11,display:"block",marginBottom:3,fontWeight:700}}>
              Width <span style={{fontWeight:400,color:th.textDim}}>{isUrdu?"(اختیاری)":"(optional)"}</span>
            </label>
            <input type="text" value={row.width||""} onChange={e=>update("width",e.target.value)} placeholder='e.g. 4ft / 60"' style={{...inpS,border:"2px solid rgba(244,114,182,0.3)"}}/>
          </div>
          <div>
            <label style={{color:th.textMuted,fontSize:11,display:"block",marginBottom:3}}>Sale Price/ft (Rs)</label>
            <input type="text" inputMode="decimal" value={row.salePrice} onChange={e=>update("salePrice",e.target.value)} placeholder={purchasePrice > 0 ? String(purchasePrice) : "قیمت داخل کریں"} style={{...inpS,border:"2px solid rgba(244,114,182,0.4)"}}/>
          </div>
        </div>
        {stockErr && (
          <div style={{marginTop:8,padding:"7px 10px",borderRadius:8,background:"rgba(248,113,113,0.12)",border:"1px solid rgba(248,113,113,0.4)",color:"#f87171",fontSize:13,fontWeight:700}}>
            🚫 {isUrdu?`Stock صرف ${availStock} ft ہے`:`Only ${availStock} ft in stock`}
          </div>
        )}
        {c.total > 0 && !stockErr && (
          <div style={{marginTop:8,padding:"5px 10px",borderRadius:8,background:"rgba(244,114,182,0.08)",display:"flex",justifyContent:"space-between",fontSize:13}}>
            <span style={{color:th.textMuted}}>{row.feet}ft{row.width?` × ${row.width}`:""} × Rs{Number(row.salePrice) > 0 ? Number(row.salePrice).toFixed(0) : "?"}/ft</span>
            <span style={{color:"#f472b6",fontWeight:700}}>{formatPKR(c.total)}</span>
          </div>
        )}
      </div>
      {c.total > 0 && !stockErr && (
        <div style={{display:"flex",justifyContent:"space-between",padding:"9px 14px",borderRadius:10,background:"rgba(244,114,182,0.08)",border:"1px solid rgba(244,114,182,0.2)"}}>
          <span style={{color:th.textMuted,fontSize:14,fontWeight:600}}>Net Total:</span>
          <span style={{color:"#f472b6",fontWeight:900,fontSize:16}}>{formatPKR(c.total)}</span>
        </div>
      )}
    </div>
  );
}

// ─── HW/CUSTOM BILLING ROWS ───────────────────────────────────────────────────
function HwBillingRows({ rows, onChange, purchasePrice, purchaseUnit, productSalePrice, catLabel, catColor, catBg, availStock, isUrdu }) {
  const th = useTheme();
  const color      = catColor || "#fbbf24";
  const bgTint     = catBg    || "rgba(251,191,36,0.08)";
  const borderTint = catBg ? catBg.replace("0.08","0.2") : "rgba(251,191,36,0.2)";
  const inpS = { background:th.input, border:`1px solid ${th.inputBorder}`, color:th.text, borderRadius:10, padding:"9px 11px", fontSize:14, outline:"none", width:"100%", boxSizing:"border-box" };
  const pUnit = purchaseUnit || "piece";
  const row = rows[0] || { _id:Date.now()+Math.random(), unit: pUnit, qty:"", salePrice:"" };
  const saleUnit = row.unit || pUnit;
  const matchedUnits = unitOptions.filter((opt) => canConvert(pUnit, opt.value));
  
  const update = (k, v) => {
    const newRow = { ...row, [k]: v };
    if (k === "unit") {
      const from = saleUnit;
      const to = v;
      if (from !== to && canConvert(from, to)) {
        const currentPrice = Number(row.salePrice) || 0;
        const baseSale = Number(productSalePrice) || 0;
        if (currentPrice > 0) newRow.salePrice = roundUnitAmt(convertPrice(currentPrice, from, to));
        else if (baseSale > 0) newRow.salePrice = roundUnitAmt(convertPrice(baseSale, pUnit, to));
        else if (purchasePrice > 0) newRow.salePrice = roundUnitAmt(convertPrice(purchasePrice, pUnit, to));
        if (Number(row.qty) > 0) newRow.qty = roundUnitAmt(convertQuantity(row.qty, from, to));
      }
    }
    onChange([newRow]);
  };
  
  const enteredQty = Number(row.qty) || 0;
  const qtyInStockUnit = canConvert(saleUnit, pUnit)
    ? convertQuantity(enteredQty, saleUnit, pUnit)
    : enteredQty;
  const stockErr = qtyInStockUnit > 0 && qtyInStockUnit > availStock;
  
  const c = hwBillCalc(row.salePrice, enteredQty);
  const ppZero = !purchasePrice || purchasePrice === 0;
  const costInSaleUnit = canConvert(pUnit, saleUnit) && purchasePrice > 0
    ? convertPrice(purchasePrice, pUnit, saleUnit)
    : purchasePrice;
  
  // Display purchase info with unit and related unit price
  const purchaseInfo = ppZero
    ? (isUrdu ? "⚠️ خریداری قیمت سیٹ نہیں — Sale price نیچے خود داخل کریں" : "⚠️ Purchase price not set — enter sale price manually below")
    : saleUnit !== pUnit && canConvert(pUnit, saleUnit)
      ? (isUrdu
        ? `خریداری: Rs ${purchasePrice}/${getUnitLabel(pUnit)} → cost Rs ${Math.round(costInSaleUnit * 100) / 100}/${getUnitLabel(saleUnit)}`
        : `Purchase: Rs ${purchasePrice}/${getUnitLabel(pUnit)} → cost Rs ${Math.round(costInSaleUnit * 100) / 100}/${getUnitLabel(saleUnit)}`)
      : (isUrdu
        ? `خریداری قیمت: Rs ${purchasePrice}/${getUnitLabel(pUnit)}`
        : `Purchase Price: Rs ${purchasePrice}/${getUnitLabel(pUnit)}`);
  const maxInSaleUnit = canConvert(pUnit, saleUnit)
    ? convertQuantity(availStock, pUnit, saleUnit)
    : availStock;
  
  return (
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      <div style={{padding:"7px 11px",borderRadius:8,background:ppZero?"rgba(251,191,36,0.08)":bgTint,border:ppZero?"1px solid rgba(251,191,36,0.3)":`1px solid ${borderTint}`,fontSize:13,color:ppZero?"#fbbf24":color,fontWeight:600}}>
        🔧 {purchaseInfo}
      </div>
      <div style={{padding:"6px 11px",borderRadius:8,background:availStock===0?"rgba(248,113,113,0.1)":bgTint,border:`1px solid ${availStock===0?"rgba(248,113,113,0.3)":borderTint}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{fontSize:12,color:th.textMuted}}>{isUrdu?"دستیاب Stock:":"Available Stock:"}</span>
        <span style={{fontWeight:900,fontSize:14,color:availStock===0?"#f87171":availStock<10?"#fbbf24":color}}>
          {availStock} {getUnitLabel(pUnit)} {availStock===0?"🚫":availStock<10?"⚠️":""}
        </span>
      </div>
      <div style={{padding:10,borderRadius:10,border:`1px solid ${stockErr?"rgba(248,113,113,0.5)":th.border}`,background:th.bgCard}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
          <div>
            <label style={{color:th.textMuted,fontSize:11,display:"block",marginBottom:3,fontWeight:400}}>
              Sale Unit
            </label>
            <select
              value={saleUnit}
              onChange={e => update("unit", e.target.value)}
              style={{...inpS,padding:"9px 8px"}}
            >
              {matchedUnits.map(opt => (
                <option key={opt.value} value={opt.value} style={{ background: th.bgModal }}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={{color:stockErr?"#f87171":th.textMuted,fontSize:11,display:"block",marginBottom:3,fontWeight:stockErr?700:400}}>
              Qty {availStock>0&&<span style={{color:th.textDim,fontWeight:400}}>(max: {maxInSaleUnit} {getUnitLabel(saleUnit)})</span>}
            </label>
            <input type="text" inputMode="decimal" value={row.qty} onChange={e=>update("qty",e.target.value)} placeholder="0"
              style={{...inpS,border:stockErr?"2px solid rgba(248,113,113,0.7)":inpS.border}}/>
          </div>
          <div>
            <label style={{color:th.textMuted,fontSize:11,display:"block",marginBottom:3}}>
              Sale Price/{getUnitLabel(saleUnit)} (Rs)
              {canConvert(pUnit, saleUnit) && purchasePrice > 0 && (
                <span style={{color:"#34d399",fontSize:10,marginLeft:4,fontWeight:600}}>
                  (Cost: {Math.round(costInSaleUnit * 100) / 100})
                </span>
              )}
            </label>
            <input 
              type="text" 
              inputMode="decimal" 
              value={row.salePrice} 
              onChange={e=>update("salePrice",e.target.value)} 
              placeholder={canConvert(pUnit, saleUnit) && purchasePrice > 0 ? String(Math.round(costInSaleUnit * 100) / 100) : String(purchasePrice)} 
              style={{...inpS,border:`2px solid ${borderTint}`}}
            />
          </div>
        </div>
        {stockErr && (
          <div style={{marginTop:8,padding:"7px 10px",borderRadius:8,background:"rgba(248,113,113,0.12)",border:"1px solid rgba(248,113,113,0.4)",color:"#f87171",fontSize:13,fontWeight:700}}>
            🚫 {isUrdu?`Stock صرف ${availStock} ${getUnitLabel(pUnit)} ہے`:`Only ${availStock} ${getUnitLabel(pUnit)} in stock`}
          </div>
        )}
        {c.total > 0 && !stockErr && (
          <div style={{marginTop:8,padding:"5px 10px",borderRadius:8,background:bgTint,display:"flex",justifyContent:"space-between",fontSize:13}}>
            <span style={{color:th.textMuted}}>{enteredQty} {getUnitLabel(saleUnit)} × Rs{Number(row.salePrice).toFixed(0)}/{getUnitLabel(saleUnit)}</span>
            <span style={{color,fontWeight:700}}>{formatPKR(c.total)}</span>
          </div>
        )}
      </div>
      {c.total > 0 && !stockErr && (
        <div style={{display:"flex",justifyContent:"space-between",padding:"9px 14px",borderRadius:10,background:bgTint,border:`1px solid ${borderTint}`}}>
          <span style={{color:th.textMuted,fontSize:14,fontWeight:600}}>{catLabel||"Total"}:</span>
          <span style={{color,fontWeight:900,fontSize:16}}>{formatPKR(c.total)}</span>
        </div>
      )}
    </div>
  );
}

// ─── BILLING PRODUCT BLOCK ────────────────────────────────────────────────────
function BillingProductBlock({ index, products, block, onChange, onRemove, canRemove, isUrdu }) {
  const th = useTheme();
  const [open, setOpen] = useState(true);
  const [search, setSearch] = useState(() => {
    const found = products.find(p => (p._id || p.id) === block.productId);
    return found ? productDisplayName(found) : "";
  });
  const selectedProduct = products.find(p => (p._id || p.id) === block.productId);
  const category   = selectedProduct?.category || "";
  const availStock = Number(selectedProduct?.stock) || 0;
  const catColors  = { Pipe:"#60a5fa", Chader:"#34d399", Net:"#f472b6", Hardware:"#fbbf24", Custom:"#a78bfa" };
  const catBgs     = { Pipe:"rgba(96,165,250,0.1)", Chader:"rgba(26,188,156,0.1)", Net:"rgba(244,114,182,0.1)", Hardware:"rgba(251,191,36,0.1)", Custom:"rgba(167,139,250,0.1)" };
  const filtered   = products.filter(p => productDisplayName(p).toLowerCase().includes(search.toLowerCase()) || (p.category||"").toLowerCase().includes(search.toLowerCase()));
  const blockTotal = getBillingBlockSubtotal(block, products);
  const stockError = getBillingBlockStockError(block, products, isUrdu);
  const inpS = { background:th.input, border:`1px solid ${th.inputBorder}`, color:th.text, borderRadius:10, padding:"9px 11px", fontSize:14, outline:"none", width:"100%", boxSizing:"border-box" };

  const makeDefaultRow = (cat, pp, product) => {
    if (cat === "Pipe")   return { _id:Date.now()+Math.random(), length:"", qty:"", percentage:"" };
    if (cat === "Chader") return { _id:Date.now()+Math.random(), weight:"", salePrice: pp };
    if (cat === "Net")    return { _id:Date.now()+Math.random(), feet:"", width:"", salePrice: pp };
    return { _id:Date.now()+Math.random(), unit: productUnitOf(product), qty:"", salePrice: pp };
  };
  const handleSelectProduct = (product) => {
    const pp = product.category === "Pipe"
      ? (Number(product.price) || 0)
      : product.category === "Hardware"
        ? (Number(product.price) || Number(product.purchasePrice) || 0)
        : (Number(product.purchasePrice) || Number(product.price) || 0);
    const productId = product._id || product.id;
    setSearch(productDisplayName(product));
    setShowDrop(false);
    onChange({ ...block, productId, pipeRows:[makeDefaultRow("Pipe",pp, product)], chaderRows:[makeDefaultRow("Chader",pp, product)], netRows:[makeDefaultRow("Net",pp, product)], hwRows:[makeDefaultRow("Hardware",pp, product)] });
    requestAnimationFrame(() => {
      const root = document.querySelector("[data-modal-box]");
      focusNextField(document.activeElement, root);
    });
  };
  const { open: showDrop, setOpen: setShowDrop, hi, setHi, onKeyDown: navKeys, listRef } = useTypeaheadNav(filtered, handleSelectProduct);

  return (
    <div style={{ borderRadius:12, border:`1.5px solid ${stockError?"rgba(248,113,113,0.5)":th.border}`, overflow:"visible", background:th.bgCard }}>
      <div style={{ padding:"7px 10px", background:th.thHead, borderBottom:open?`1px solid ${th.border}`:"none", display:"flex", alignItems:"center", gap:8, borderRadius:open?"10px 10px 0 0":10 }}>
        <button onClick={()=>setOpen(o=>!o)} style={{background:"none",border:"none",cursor:"pointer",color:th.textMuted,padding:0,fontSize:14}}>{open?"▾":"▸"}</button>
        <span style={{color:th.text,fontWeight:700,fontSize:13}}>🛒 Product {index+1}</span>
        {!open && selectedProduct && <span style={{fontSize:12,padding:"2px 7px",borderRadius:20,background:catBgs[category]||"transparent",color:catColors[category]||th.text,fontWeight:600}}>{productDisplayName(selectedProduct)}</span>}
        {stockError && <span style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:"rgba(248,113,113,0.15)",color:"#f87171",fontWeight:700}}>🚫 Stock Limit</span>}
        {blockTotal>0 && !stockError && <span style={{fontSize:13,color:"#34d399",fontWeight:700,marginLeft:"auto"}}>{formatPKR(blockTotal)}</span>}
        {canRemove && <button onClick={onRemove} style={{background:"rgba(239,68,68,0.12)",border:"none",borderRadius:6,color:"#f87171",cursor:"pointer",padding:"2px 7px",fontSize:11,fontWeight:700,marginLeft:"auto"}}>✕</button>}
      </div>
      {open && (
        <div style={{ padding:"10px", display:"flex", flexDirection:"column", gap:10 }}>
          <div>
            <label style={{color:th.textMuted,fontSize:11,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:3,display:"block"}}>
              {isUrdu ? "Product منتخب کریں *" : "Select Product *"}
            </label>
            <div style={{position:"relative"}}>
              <input type="text" value={search}
                data-product-search="1"
                data-suggest-open={showDrop ? "1" : "0"}
                onChange={e=>{ setSearch(e.target.value); setShowDrop(true); setHi(0); if(block.productId) onChange({...block,productId:""}); }}
                onFocus={()=>setShowDrop(true)}
                onKeyDown={navKeys}
                placeholder="🔍 Search product..." style={inpS} autoComplete="off"/>
              {showDrop && (
                <>
                  <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,zIndex:998}} onMouseDown={()=>setShowDrop(false)}/>
                  <div ref={listRef} style={{position:"absolute",top:"100%",left:0,right:0,zIndex:999,background:th.bgModal||th.bgCard,border:`1px solid ${th.border}`,borderRadius:10,maxHeight:180,overflowY:"auto",boxShadow:"0 4px 16px rgba(0,0,0,0.25)"}}>
                    {filtered.length===0
                      ? <div style={{padding:"10px",textAlign:"center",color:th.textDim,fontSize:13}}>{isUrdu?"کوئی product نہیں ملا":"No products found"}</div>
                      : filtered.map((p, i)=>{
                          const displayPrice = (p.category==="Pipe" || p.category==="Hardware") ? (Number(p.price)||Number(p.purchasePrice)||0) : (Number(p.purchasePrice)||Number(p.price)||0);
                          const displayUnit  = stockUnitLabel(p.category, p);
                          return (
                          <div key={p._id||p.id} data-nav-i={i} onMouseDown={()=>handleSelectProduct(p)} onMouseEnter={()=>setHi(i)}
                            style={{padding:"8px 12px",cursor:"pointer",borderBottom:`1px solid ${th.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",fontSize:14,color:th.text,background:i===hi?"rgba(26,188,156,0.16)":"transparent"}}>
                            <span>{productDisplayName(p)}</span>
                            <div style={{display:"flex",alignItems:"center",gap:6}}>
                              <span style={{fontSize:11,color:Number(p.stock)===0?"#f87171":Number(p.stock)<10?"#fbbf24":"#34d399",fontWeight:700}}>Stock: {p.stock||0}</span>
                              <span style={{fontSize:12,color:displayPrice>0?"#34d399":"#f87171",fontWeight:600}}>
                                {displayPrice>0 ? `Rs ${displayPrice}/${displayUnit}` : "⚠️ price 0"}
                              </span>
                              <span style={{fontSize:11,padding:"2px 7px",borderRadius:20,background:catBgs[p.category]||"transparent",color:catColors[p.category]||th.text,fontWeight:600}}>{p.category}</span>
                            </div>
                          </div>
                        )})
                    }
                  </div>
                </>
              )}
            </div>
          </div>
          {selectedProduct && (() => {
            const displayPrice = (selectedProduct.category==="Pipe" || selectedProduct.category==="Hardware") ? (Number(selectedProduct.price)||Number(selectedProduct.purchasePrice)||0) : (Number(selectedProduct.purchasePrice)||Number(selectedProduct.price)||0);
            const displayUnit  = stockUnitLabel(category, selectedProduct);
            return (
            <div style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",borderRadius:8,background:catBgs[category]||"transparent",border:`1px solid ${(catColors[category]||"#aaa")}40`}}>
              <span style={{color:catColors[category],fontSize:12,fontWeight:700}}>{category}</span>
              <span style={{color:th.text,fontSize:13,fontWeight:600}}>{productDisplayName(selectedProduct)}</span>
              <span style={{marginLeft:"auto",color:displayPrice>0?catColors[category]:"#f87171",fontSize:12,fontWeight:600,padding:"2px 8px",borderRadius:8,background:th.input}}>
                {displayPrice>0 ? `${selectedProduct.category==="Hardware"?"Sale":"Purchase"}: Rs ${displayPrice}/${displayUnit}` : "⚠️ Purchase price not set"}
              </span>
            </div>
            );
          })()}
          {category==="Pipe"     && <PipeBillingRows    rows={block.pipeRows||[]}   onChange={rows=>onChange({...block,pipeRows:rows})}   purchasePrice={Number(selectedProduct?.price)||Number(selectedProduct?.purchasePrice)||0} availStock={availStock} isUrdu={isUrdu}/>}
          {category==="Chader"   && <ChaderBillingRows  rows={block.chaderRows||[]} onChange={rows=>onChange({...block,chaderRows:rows})} purchasePrice={Number(selectedProduct?.purchasePrice)||Number(selectedProduct?.price)||0} availStock={availStock} isUrdu={isUrdu}/>}
          {category==="Net"      && <NetBillingRows     rows={block.netRows||[]}    onChange={rows=>onChange({...block,netRows:rows})}    purchasePrice={Number(selectedProduct?.purchasePrice)||Number(selectedProduct?.price)||0} availStock={availStock} isUrdu={isUrdu}/>}
          {category==="Hardware" && <HwBillingRows      rows={block.hwRows||[]}     onChange={rows=>onChange({...block,hwRows:rows})}     purchasePrice={Number(selectedProduct?.purchasePrice)||0} purchaseUnit={productUnitOf(selectedProduct)} productSalePrice={Number(selectedProduct?.price)||0} availStock={availStock} isUrdu={isUrdu} catLabel="Hardware Total" catColor="#fbbf24" catBg="rgba(251,191,36,0.08)"/>}
          {category==="Custom"   && <HwBillingRows      rows={block.hwRows||[]}     onChange={rows=>onChange({...block,hwRows:rows})}     purchasePrice={Number(selectedProduct?.purchasePrice)||0} purchaseUnit={productUnitOf(selectedProduct)} productSalePrice={Number(selectedProduct?.price)||0} availStock={availStock} isUrdu={isUrdu} catLabel="Custom Total"   catColor="#a78bfa" catBg="rgba(167,139,250,0.08)"/>}
          {!category && (
            <div style={{padding:"12px",textAlign:"center",color:th.textDim,fontSize:13,borderRadius:8,border:`1px dashed ${th.border}`}}>
              {isUrdu ? "👆 Product منتخب کریں billing شروع کریں" : "👆 Select a product to start billing"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── LOADER SECTION ───────────────────────────────────────────────────────────
// ─── BINDING FEE (Chader binding mazdori) — flat labour charge added on top of
// the bill, same as Loader Fee, but only shown when the sale has a Chader item.
function BindingFeeSection({ bindingFee, setBindingFee, isUrdu }) {
  const th = useTheme();
  const fee = Number(bindingFee) || 0;
  const inpS = { background:th.input, border:`1px solid ${th.inputBorder}`, color:th.text, borderRadius:10, padding:"9px 11px", fontSize:14, outline:"none", width:"100%", boxSizing:"border-box" };
  return (
    <div style={{ borderRadius:14, border:`1px solid ${fee>0?"rgba(251,191,36,0.4)":th.border}`, overflow:"hidden", background:fee>0?"rgba(251,191,36,0.04)":"transparent" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"11px 14px", background:fee>0?"rgba(251,191,36,0.08)":th.thHead, borderBottom:`1px solid ${fee>0?"rgba(251,191,36,0.2)":th.border}` }}>
        <div>
          <span style={{ color:fee>0?"#fbbf24":th.text, fontWeight:700, fontSize:14 }}>{isUrdu?"چادر بائنڈنگ مزدوری":"Chader Binding Mazdori"}</span>
          <span style={{ color:th.textDim, fontSize:12, marginLeft:6 }}>{isUrdu?"(اختیاری)":"(optional)"}</span>
        </div>
        {fee > 0 && <span style={{ color:"#fbbf24", fontWeight:800, fontSize:14, padding:"2px 10px", borderRadius:20, background:"rgba(251,191,36,0.12)" }}>+{formatPKR(fee)}</span>}
      </div>
      <div style={{ padding:"12px 14px" }}>
        <label style={{ color:th.textMuted, fontSize:11, textTransform:"uppercase", letterSpacing:"0.06em", display:"block", marginBottom:4 }}>
          {isUrdu?"بائنڈنگ فیس (روپے)":"Binding Fee (Rs)"}
        </label>
        <input type="text" inputMode="decimal" value={bindingFee} onChange={e=>setBindingFee(e.target.value)} placeholder="0" style={inpS}/>
        <span style={{ color:th.textDim, fontSize:12, marginTop:4, display:"block" }}>{isUrdu?"کل میں شامل ہوگی":"Will be added to total"}</span>
      </div>
    </div>
  );
}

function LoaderSection({ loaderForm, setLoaderForm, isUrdu, loaders=[] }) {
  const th = useTheme();
  const [open, setOpen] = useState(false);
  const inpS = { background:th.input, border:`1px solid ${th.inputBorder}`, color:th.text, borderRadius:10, padding:"10px 14px", fontSize:14, outline:"none", width:"100%", boxSizing:"border-box" };
  const loaderFee = Number(loaderForm.fee) || 0;
  const selectedLoader = loaders.find(l => (l._id||l.id) === loaderForm.selectedId);
  const hasLoader = !!loaderForm.selectedId;
  const selectLoader = (id) => {
    const found = loaders.find(l => (l._id||l.id) === id);
    setLoaderForm({ selectedId:id, customName:"", fee: found ? String(found.defaultFee||"") : "" });
  };
  const selectCustom = () => setLoaderForm({ selectedId:"custom", customName:"", fee:"" });
  const clear = () => { setLoaderForm({ selectedId:"", customName:"", fee:"" }); setOpen(false); };
  const avatarColor = (name) => {
    const colors = ["#a78bfa","#60a5fa","#34d399","#fbbf24","#f472b6","#fb923c"];
    let h = 0; for (let c of (name||"?")) h = c.charCodeAt(0) + ((h<<5)-h);
    return colors[Math.abs(h) % colors.length];
  };
  return (
    <div style={{ borderRadius:14, border:`1px solid ${hasLoader?"rgba(167,139,250,0.4)":th.border}`, overflow:"hidden", transition:"border-color 0.2s", background:hasLoader?"rgba(167,139,250,0.04)":"transparent" }}>
      <div onClick={()=>!hasLoader?setOpen(o=>!o):undefined}
        style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"11px 14px", cursor:hasLoader?"default":"pointer", background:hasLoader?"rgba(167,139,250,0.08)":th.thHead, borderBottom:(open||hasLoader)?`1px solid ${hasLoader?"rgba(167,139,250,0.2)":th.border}`:"none" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontSize:18 }}>🏋️</span>
          <div>
            <span style={{ color:hasLoader?"#a78bfa":th.text, fontWeight:700, fontSize:14 }}>Loader</span>
            {!hasLoader && <span style={{ color:th.textDim, fontSize:12, marginLeft:6 }}>{isUrdu?"(اختیاری)":"(optional)"}</span>}
            {hasLoader && selectedLoader && <span style={{ color:th.textMuted, fontSize:12, marginLeft:6 }}>— {selectedLoader.name}</span>}
            {hasLoader && loaderForm.selectedId==="custom" && <span style={{ color:th.textMuted, fontSize:12, marginLeft:6 }}>— {loaderForm.customName||(isUrdu?"نیا Loader":"Custom")}</span>}
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          {loaderFee > 0 && <span style={{ color:"#a78bfa", fontWeight:800, fontSize:14, padding:"2px 10px", borderRadius:20, background:"rgba(167,139,250,0.12)" }}>+{formatPKR(loaderFee)}</span>}
          {hasLoader
            ? <button onClick={clear} style={{ fontSize:12, color:"#f87171", background:"rgba(248,113,113,0.1)", border:"1px solid rgba(248,113,113,0.3)", borderRadius:8, padding:"4px 10px", cursor:"pointer", fontWeight:600 }}>✕ {isUrdu?"ہٹائیں":"Remove"}</button>
            : <span style={{ color:th.textDim, fontSize:18, lineHeight:1, display:"inline-block", transform:open?"rotate(180deg)":"rotate(0deg)" }}>⌄</span>
          }
        </div>
      </div>
      {(open||hasLoader) && (
        <div style={{ padding:14, display:"flex", flexDirection:"column", gap:12 }}>
          {loaders.length > 0 && (
            <div>
              <p style={{ color:th.textDim, fontSize:11, textTransform:"uppercase", letterSpacing:"0.08em", margin:"0 0 8px", fontWeight:600 }}>
                {isUrdu?"Loader منتخب کریں":"Select a Loader"}
              </p>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))", gap:8 }}>
                {loaders.map(l => {
                  const ac = avatarColor(l.name);
                  const sel = loaderForm.selectedId === (l._id||l.id);
                  return (
                    <button key={l._id||l.id} onClick={()=>selectLoader(l._id||l.id)}
                      style={{ borderRadius:12, border:`2px solid ${sel?ac:th.border}`, background:sel?`${ac}15`:th.bgCard, cursor:"pointer", padding:"10px 8px", display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}>
                      <div style={{ width:38, height:38, borderRadius:10, background:`${ac}22`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:17, fontWeight:800, color:ac }}>
                        {l.name[0].toUpperCase()}
                      </div>
                      <span style={{ color:sel?ac:th.text, fontWeight:700, fontSize:13, textAlign:"center", wordBreak:"break-word" }}>{l.name}</span>
                      <span style={{ color:sel?ac:th.textMuted, fontSize:11, fontWeight:600 }}>Rs {l.defaultFee||0}</span>
                    </button>
                  );
                })}
                <button onClick={selectCustom}
                  style={{ borderRadius:12, border:`2px solid ${loaderForm.selectedId==="custom"?"#fbbf24":th.border}`, background:loaderForm.selectedId==="custom"?"rgba(251,191,36,0.08)":th.bgCard, cursor:"pointer", padding:"10px 8px", display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}>
                  <div style={{ width:38, height:38, borderRadius:10, background:"rgba(251,191,36,0.15)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20 }}>➕</div>
                  <span style={{ color:loaderForm.selectedId==="custom"?"#fbbf24":th.textMuted, fontWeight:700, fontSize:12, textAlign:"center" }}>{isUrdu?"نیا":"Custom"}</span>
                </button>
              </div>
            </div>
          )}
          {loaders.length===0 && !loaderForm.selectedId && (
            <button onClick={selectCustom} style={{ width:"100%", padding:"11px", borderRadius:12, border:"1px dashed rgba(251,191,36,0.5)", background:"rgba(251,191,36,0.05)", color:"#fbbf24", fontWeight:700, fontSize:13, cursor:"pointer" }}>
              ➕ {isUrdu?"Loader کا نام اور فیس لکھیں":"Enter loader name & fee"}
            </button>
          )}
          {hasLoader && (
            <div style={{ display:"flex", flexDirection:"column", gap:8, padding:12, borderRadius:12, background:th.bgCard, border:`1px solid ${th.border}` }}>
              {loaderForm.selectedId==="custom" && (
                <div>
                  <label style={{ color:th.textMuted, fontSize:11, textTransform:"uppercase", letterSpacing:"0.06em", display:"block", marginBottom:4 }}>{isUrdu?"Loader کا نام *":"Loader Name *"}</label>
                  <input value={loaderForm.customName} onChange={e=>setLoaderForm(p=>({...p,customName:e.target.value}))} placeholder={isUrdu?"نام لکھیں...":"Enter name..."} style={inpS}/>
                </div>
              )}
              <div>
                <label style={{ color:th.textMuted, fontSize:11, textTransform:"uppercase", letterSpacing:"0.06em", display:"block", marginBottom:4 }}>{isUrdu?"Loading فیس (روپے)":"Loading Fee (Rs)"}</label>
                <div style={{ position:"relative" }}>
                  <span style={{ position:"absolute", left:14, top:"50%", transform:"translateY(-50%)", color:th.textMuted, fontSize:13, fontWeight:600 }}>Rs</span>
                  <input type="text" inputMode="decimal" value={loaderForm.fee} onChange={e=>setLoaderForm(p=>({...p,fee:e.target.value}))} placeholder="0"
                    style={{ ...inpS, paddingLeft:42, border:"2px solid rgba(167,139,250,0.4)", fontSize:16, fontWeight:700 }}/>
                </div>
                {loaderFee > 0 && (
                  <div style={{ marginTop:6, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"6px 12px", borderRadius:8, background:"rgba(167,139,250,0.08)", border:"1px solid rgba(167,139,250,0.2)" }}>
                    <span style={{ color:th.textMuted, fontSize:12 }}>{isUrdu?"کل میں شامل ہوگی":"Will be added to total"}</span>
                    <span style={{ color:"#a78bfa", fontWeight:800, fontSize:14 }}>+ {formatPKR(loaderFee)}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── TODAY LOADERS SUMMARY ────────────────────────────────────────────────────
function TodayLoadersSummary({ sales, isUrdu }) {
  const th = useTheme();
  const today = todayStr();
  const todaySalesWithLoader = sales.filter(s => s.date === today && s.loaderName);
  if (todaySalesWithLoader.length === 0) return null;
  const loaderMap = {};
  todaySalesWithLoader.forEach(s => {
    const name = s.loaderName || "—";
    if (!loaderMap[name]) loaderMap[name] = { name, invoices:[], totalFee:0 };
    loaderMap[name].invoices.push(s.invoice);
    loaderMap[name].totalFee += Number(s.loaderFee)||0;
  });
  const loaderList  = Object.values(loaderMap);
  const grandTotal  = loaderList.reduce((s,l) => s + l.totalFee, 0);
  const aColor = (name) => {
    const cs=["#a78bfa","#60a5fa","#34d399","#fbbf24","#f472b6"];
    let h=0; for(let c of (name||"?")) h=c.charCodeAt(0)+((h<<5)-h);
    return cs[Math.abs(h)%cs.length];
  };
  return (
    <div style={{ borderRadius:16, border:"1px solid rgba(167,139,250,0.25)", background:"rgba(167,139,250,0.04)", overflow:"hidden" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 16px", background:"rgba(167,139,250,0.08)", borderBottom:"1px solid rgba(167,139,250,0.15)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontSize:20 }}>🏋️</span>
          <span style={{ color:"#a78bfa", fontWeight:800, fontSize:15 }}>{isUrdu?"آج کے Loaders":"Today's Loaders"}</span>
          <span style={{ fontSize:11, padding:"2px 9px", borderRadius:20, background:"rgba(167,139,250,0.18)", color:"#a78bfa", fontWeight:700 }}>
            {todaySalesWithLoader.length} {isUrdu?"invoices":"invoices"}
          </span>
        </div>
        <span style={{ color:"#a78bfa", fontWeight:900, fontSize:17 }}>{formatPKR(grandTotal)}</span>
      </div>
      <div style={{ padding:12, display:"flex", flexDirection:"column", gap:8 }}>
        {loaderList.map((loader,i) => {
          const ac = aColor(loader.name);
          return (
            <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", borderRadius:12, background:th.bgCard, border:`1px solid ${th.border}` }}>
              <div style={{ width:40, height:40, borderRadius:10, background:`${ac}20`, display:"flex", alignItems:"center", justifyContent:"center", color:ac, fontWeight:900, fontSize:17, flexShrink:0 }}>
                {loader.name[0].toUpperCase()}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ color:th.text, fontWeight:700, fontSize:14, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{loader.name}</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginTop:3 }}>
                  {loader.invoices.slice(0,4).map((inv,j)=>(
                    <span key={j} style={{ fontFamily:"monospace", color:"#34d399", fontSize:10, background:"rgba(52,211,153,0.1)", padding:"1px 7px", borderRadius:5, fontWeight:600 }}>{inv}</span>
                  ))}
                  {loader.invoices.length>4 && <span style={{ color:th.textDim, fontSize:10 }}>+{loader.invoices.length-4} more</span>}
                </div>
              </div>
              <div style={{ textAlign:"right", flexShrink:0 }}>
                <div style={{ color:ac, fontWeight:900, fontSize:16 }}>{formatPKR(loader.totalFee)}</div>
                <div style={{ color:th.textDim, fontSize:10, marginTop:1 }}>{loader.invoices.length} {isUrdu?"bill":"bills"}</div>
              </div>
            </div>
          );
        })}
        {loaderList.length > 1 && (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"9px 14px", borderRadius:12, background:"rgba(167,139,250,0.12)", border:"1px solid rgba(167,139,250,0.22)" }}>
            <span style={{ color:th.textMuted, fontSize:13, fontWeight:700 }}>🏁 {isUrdu?"کل Loading Fee:":"Total Loading Fee:"}</span>
            <span style={{ color:"#a78bfa", fontWeight:900, fontSize:17 }}>{formatPKR(grandTotal)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── TODAY BINDING FEE (Chader Mazdori) SUMMARY ───────────────────────────────
// Same idea as TodayLoadersSummary above, but for the Chader "binding mazdori"
// flat labour fee — lists every invoice today that had a binding fee, plus a
// running grand total, so it's clear at a glance how much binding mazdori was
// earned today.
function TodayBindingFeeSummary({ sales, isUrdu }) {
  const th = useTheme();
  const today = todayStr();
  const todaySalesWithBinding = sales.filter(s => s.date === today && Number(s.bindingFee) > 0);
  if (todaySalesWithBinding.length === 0) return null;
  const grandTotal = todaySalesWithBinding.reduce((s,x) => s + (Number(x.bindingFee)||0), 0);
  return (
    <div style={{ borderRadius:16, border:"1px solid rgba(251,191,36,0.25)", background:"rgba(251,191,36,0.04)", overflow:"hidden" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 16px", background:"rgba(251,191,36,0.08)", borderBottom:"1px solid rgba(251,191,36,0.15)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontSize:20 }}>📋</span>
          <span style={{ color:"#fbbf24", fontWeight:800, fontSize:15 }}>{isUrdu?"آج کی چادر بائنڈنگ مزدوری":"Today's Chader Binding Mazdori"}</span>
          <span style={{ fontSize:11, padding:"2px 9px", borderRadius:20, background:"rgba(251,191,36,0.18)", color:"#fbbf24", fontWeight:700 }}>
            {todaySalesWithBinding.length} {isUrdu?"invoices":"invoices"}
          </span>
        </div>
        <span style={{ color:"#fbbf24", fontWeight:900, fontSize:17 }}>{formatPKR(grandTotal)}</span>
      </div>
      <div style={{ padding:12, display:"flex", flexDirection:"column", gap:8 }}>
        {todaySalesWithBinding.map((s,i) => (
          <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", borderRadius:12, background:th.bgCard, border:`1px solid ${th.border}` }}>
            <div style={{ width:40, height:40, borderRadius:10, background:"rgba(251,191,36,0.12)", display:"flex", alignItems:"center", justifyContent:"center", color:"#fbbf24", fontWeight:900, fontSize:16, flexShrink:0 }}>
              📋
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ color:th.text, fontWeight:700, fontSize:14, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.customer || "—"}</div>
              <div style={{ marginTop:3 }}>
                <span style={{ fontFamily:"monospace", color:"#34d399", fontSize:10, background:"rgba(52,211,153,0.1)", padding:"1px 7px", borderRadius:5, fontWeight:600 }}>{s.invoice}</span>
              </div>
            </div>
            <div style={{ textAlign:"right", flexShrink:0 }}>
              <div style={{ color:"#fbbf24", fontWeight:900, fontSize:16 }}>{formatPKR(Number(s.bindingFee)||0)}</div>
            </div>
          </div>
        ))}
        {todaySalesWithBinding.length > 1 && (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"9px 14px", borderRadius:12, background:"rgba(251,191,36,0.12)", border:"1px solid rgba(251,191,36,0.22)" }}>
            <span style={{ color:th.textMuted, fontSize:13, fontWeight:700 }}>🏁 {isUrdu?"کل بائنڈنگ مزدوری:":"Total Binding Mazdori:"}</span>
            <span style={{ color:"#fbbf24", fontWeight:900, fontSize:17 }}>{formatPKR(grandTotal)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── NEW SALE MODAL ───────────────────────────────────────────────────────────
function BillingNewSaleModal({ products, onSave, onClose, isUrdu, prefill, loaders=[], extraNames=[] }) {
  const th = useTheme();
  const accounts = useAccounts();
  const [customer,      setCustomer]      = useState(prefill?.customer || "");
  const [invoiceNum,    setInvoiceNum]    = useState(prefill?.invoice  || `INV-${Date.now().toString().slice(-4)}`);
  const [date,          setDate]          = useState(prefill?.date     || todayStr());
  const [saving,        setSaving]        = useState(false);
  const [invoiceData,   setInvoiceData]   = useState(null);
  const [payForm, setPayForm] = useState(() => {
    const s = prefill?.settlement
      || (prefill?.isPartial ? ((Number(prefill.paidAmount) || 0) === 0 ? "credit" : "partial") : "full");
    return {
      settlement: s,
      accountId: prefill?.accountId || "",
      paidAmount: s === "partial" ? String(prefill?.paidAmount || "") : "",
    };
  });
  const [loaderForm, setLoaderForm] = useState({ selectedId:"", customName:"", fee:"" });
  const [bindingFee, setBindingFee] = useState("");

  const newBlock = () => ({
    _id: Date.now()+Math.random(), productId:"",
    pipeRows:   [{ _id:Date.now()+Math.random(), length:"", qty:"", percentage:"" }],
    chaderRows: [{ _id:Date.now()+Math.random(), weight:"", salePrice:"" }],
    netRows:    [{ _id:Date.now()+Math.random(), feet:"", width:"", salePrice:"" }],
    hwRows:     [{ _id:Date.now()+Math.random(), unit:"piece", qty:"", salePrice:"" }],
  });
  const [blocks, setBlocks] = useState([newBlock()]);

  // productsTotal = sum of item sale prices only (this is what profit is based on).
  // loaderFeeAmt is added on top so the customer's bill covers the loader's charge,
  // but it must NEVER be treated as sale revenue for profit purposes.
  const productsTotal = blocks.reduce((s,b) => s + getBillingBlockSubtotal(b, products), 0);
  const loaderFeeAmt  = Number(loaderForm.fee) || 0;
  // Chader "binding mazdori" — only relevant when this sale actually contains a
  // Chader item, same pass-through-charge treatment as loaderFee.
  const hasChaderItem = blocks.some(b => products.find(p => (p._id||p.id) === b.productId)?.category === "Chader");
  const bindingFeeAmt = hasChaderItem ? (Number(bindingFee) || 0) : 0;
  const grandTotal = productsTotal + loaderFeeAmt + bindingFeeAmt; // full bill total shown/charged to customer
  const finalTotal = grandTotal;
  const pay = derivePayment(finalTotal, payForm, accounts);
  const paid       = pay.paidAmount;
  const remaining  = pay.remainingAmount;
  const paidError  = pay.paidError;
  const anyStockError = blocks.some(b => getBillingBlockStockError(b, products, isUrdu) !== null);

  const canSave = customer.trim()
    && blocks.every(b => b.productId)
    && productsTotal > 0
    && !paidError
    && !anyStockError
    && isPayValid(finalTotal, payForm, accounts);

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    const items = blocks.map(block => {
      const prod = products.find(p => (p._id||p.id) === block.productId);
      const cat  = prod?.category || "";
      const pp   = (cat === "Pipe")
        ? (Number(prod?.price) || Number(prod?.purchasePrice) || 0)
        : (Number(prod?.purchasePrice) || 0);
      let rows   = [];
      let costTotal = 0; // total cost for this item (purchase price × qty)
      if (cat === "Pipe") {
        const r = block.pipeRows[0] || {};
        const c = pipeBillCalc(pp, r.percentage, r.qty, r.length);
        const pricePerPc = c.effectivePrice * (Number(r.length)||0);
        rows = [{ desc:`${r.qty||0}pc × Rs${pricePerPc.toFixed(0)}/pc`, amount:c.total }];
        // Cost: use purchasePercentage stored in product to get actual cost per ft
        // e.g. bought at -5%: cost = pp * 0.95, sold at -3%: sale = pp * 0.97 → profit = 2%
        const purchPct = Number(prod?.purchasePercentage) || 0;
        const actualCostPerFt = pp * (1 + purchPct / 100);
        const costPerPc = actualCostPerFt * (Number(r.length)||0);
        const rawCost = costPerPc * (Number(r.qty)||0);
        // Store the real cost as-is (even if higher than sale price).
        // Dashboard is responsible for showing Pipe profit as always-positive; we must not
        // zero out the real cost here or that profit/loss info is lost permanently.
        costTotal = rawCost;
      } else if (cat === "Chader") {
        const r  = block.chaderRows[0] || {};
        const sp = r.salePrice !== undefined && r.salePrice !== "" ? r.salePrice : pp;
        const c  = chaderBillCalc(sp, r.weight);
        rows = [{ desc:`${r.weight}kg × Rs${Number(sp).toFixed(0)}/kg`, amount:c.total }];
        costTotal = pp * (Number(r.weight)||0);
      } else if (cat === "Net") {
        const r  = block.netRows[0] || {};
        const sp = r.salePrice !== undefined && r.salePrice !== "" ? r.salePrice : pp;
        const c  = netBillCalc(sp, r.feet);
        const widthPart = r.width ? `ft×${r.width}×` : "ft×";
        rows = [{ desc:`${r.feet}${widthPart} Rs${Number(sp).toFixed(0)}/ft`, amount:c.total }];
        costTotal = pp * (Number(r.feet)||0) * (Number(r.width)||1);
      } else {
        const r  = block.hwRows[0] || {};
        const pUnit = productUnitOf(prod);
        const saleUnit = r.unit || pUnit;
        const sp = r.salePrice !== undefined && r.salePrice !== "" ? r.salePrice : (Number(prod?.price) || 0);
        const c  = hwBillCalc(sp, r.qty);
        const uLbl = getUnitLabel(saleUnit);
        rows = [{ desc:`${r.qty||0} ${uLbl} × Rs${Number(sp).toFixed(0)}/${uLbl}`, amount:c.total, unit: saleUnit }];
        const costPerSaleUnit = canConvert(pUnit, saleUnit) ? convertPrice(pp, pUnit, saleUnit) : pp;
        costTotal = costPerSaleUnit * (Number(r.qty)||0);
      }
      const subtotal = rows.reduce((s,r) => s + r.amount, 0);
      // itemQty = actual stock-unit quantity being sold for THIS product (pc/kg/ft),
      // used by backend to check + deduct stock per product in a multi-product sale.
      let itemQty = 0;
      if (cat === "Pipe")        itemQty = Number(block.pipeRows[0]?.qty)   || 0;
      else if (cat === "Chader") itemQty = Number(block.chaderRows[0]?.weight) || 0;
      else if (cat === "Net")    itemQty = Number(block.netRows[0]?.feet)   || 0;
      else {
        const r = block.hwRows[0] || {};
        const pUnit = productUnitOf(prod);
        const saleUnit = r.unit || pUnit;
        itemQty = canConvert(saleUnit, pUnit)
          ? convertQuantity(Number(r.qty) || 0, saleUnit, pUnit)
          : (Number(r.qty) || 0);
      }
      return {
        productName: productDisplayName(prod), category: cat, rows, subtotal, costPrice: pp, costTotal,
        productId: block.productId || (prod?._id || prod?.id || ""),
        qty: itemQty,
      };
    });

    const resolvedLoaderName = loaderForm.selectedId === "custom"
      ? (loaderForm.customName || "")
      : (loaders.find(l=>(l._id||l.id)===loaderForm.selectedId)?.name || "");
    const payload = {
      invoice:invoiceNum, date, customer,
      paymentMethod: pay.paymentMethod, bankName: pay.bankName,
      accountId: pay.accountId, accountName: pay.accountName, settlement: pay.settlement,
      items, grandTotal,
      total: grandTotal,
      isPartial:       pay.isPartial,
      paidAmount:      pay.paidAmount,
      remainingAmount: pay.remainingAmount,
      loaderName: resolvedLoaderName,
      loaderFee:  loaderFeeAmt,
      bindingFee: bindingFeeAmt,
    };

    const res = await onSave(payload);
    setSaving(false);
    if (res && res.success) {
      if (!prefill?.isEdit) {
        await recordTradeFinance({
          kind: "sale",
          partyName: customer,
          invoice: invoiceNum,
          date,
          paid: pay.paidAmount,
          remaining: pay.remainingAmount,
          accountId: pay.accountId,
        });
      }
      setInvoiceData(payload);
    }
    else { alert(res?.message || "Error saving"); }
  };

  const inpS = { background:th.input, border:`1px solid ${th.inputBorder}`, color:th.text, borderRadius:10, padding:"9px 11px", fontSize:14, outline:"none", width:"100%", boxSizing:"border-box" };
  const Lbl = ({c,req}) => (
    <label style={{color:th.textMuted,fontSize:11,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:3,display:"block"}}>
      {c}{req&&<span style={{color:"#f87171",marginLeft:3}}>*</span>}
    </label>
  );

  if (invoiceData) return <BillingSaleInvoice invoiceData={invoiceData} onClose={onClose} isUrdu={isUrdu}/>;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      {/* Header fields */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,padding:"10px",borderRadius:12,background:th.thHead,border:`1px solid ${th.border}`}}>
        <div><Lbl c="Invoice #"/><input value={invoiceNum} onChange={e=>setInvoiceNum(e.target.value)} style={inpS}/></div>
        <div><Lbl c="Date"/><input type="date" value={date} onChange={e=>setDate(e.target.value)} style={inpS}/></div>
        <div style={{gridColumn:"1/-1"}}>
          <Lbl c={isUrdu?"گاہک کا نام":"Customer"} req/>
          <PartyNamePicker
            type="customer"
            value={customer}
            onChange={setCustomer}
            extraNames={extraNames}
            isUrdu={isUrdu}
            inputStyle={inpS}
          />
        </div>
      </div>

      {/* Product blocks */}
      {blocks.map((block,idx) => (
        <BillingProductBlock key={block._id} index={idx} products={products} block={block}
          onChange={updated => setBlocks(bs=>bs.map((b,i)=>i===idx?updated:b))}
          onRemove={()=>setBlocks(bs=>bs.filter((_,i)=>i!==idx))}
          canRemove={blocks.length>1}
          isUrdu={isUrdu}/>
      ))}

      {/* Stock error banner */}
      {anyStockError && (
        <div style={{padding:"12px 16px",borderRadius:12,background:"rgba(248,113,113,0.12)",border:"2px solid rgba(248,113,113,0.4)",display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:20}}>🚫</span>
          <div>
            <div style={{color:"#f87171",fontWeight:700,fontSize:14}}>{isUrdu?"Stock کی حد سے زیادہ":"Stock Limit Exceeded"}</div>
            <div style={{color:"#f87171",fontSize:12,marginTop:2}}>{isUrdu?"مقدار کم کریں — Stock سے زیادہ sale نہیں ہو سکتی":"Please reduce quantity — cannot sell more than available stock"}</div>
          </div>
        </div>
      )}

      {/* Add product button */}
      <button data-add-product="1" type="button" onClick={()=>setBlocks(bs=>[...bs,newBlock()])}
        style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"9px",borderRadius:10,border:`2px dashed ${th.border}`,background:"transparent",color:th.textMuted,fontSize:13,fontWeight:600,cursor:"pointer"}}
        onMouseEnter={e=>{e.currentTarget.style.borderColor="#1abc9c";e.currentTarget.style.color="#1abc9c";}}
        onMouseLeave={e=>{e.currentTarget.style.borderColor=th.border;e.currentTarget.style.color=th.textMuted;}}>
        <Icon path={ICONS.plus} size={14}/> + {isUrdu?"Product شامل کریں":"Add Product"}
        <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.75 }}>(Ctrl+A)</span>
      </button>

      {/* Payment: full / credit / partial + cash or bank account */}
      {grandTotal > 0 && (
        <PaymentTerms
          total={finalTotal}
          form={payForm}
          setForm={setPayForm}
          accounts={accounts}
          isUrdu={isUrdu}
          partyKind="customer"
        />
      )}

      {/* Grand total summary */}
      {grandTotal > 0 && (
        <div style={{padding:"12px 16px",borderRadius:12,border:"1px solid rgba(26,188,156,0.3)",background:"rgba(26,188,156,0.08)",display:"flex",flexDirection:"column",gap:6}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{color:th.textMuted,fontSize:14}}>{isUrdu?"Items کل:":"Items total:"}</span>
            <span style={{color:"#34d399",fontWeight:700,fontSize:16}}>{formatPKR(productsTotal)}</span>
          </div>
          {loaderFeeAmt > 0 && (
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{color:"#a78bfa",fontSize:14}}>{isUrdu?"لوڈر فیس:":"Loader Fee:"}</span>
              <span style={{color:"#a78bfa",fontWeight:700,fontSize:16}}>{formatPKR(loaderFeeAmt)}</span>
            </div>
          )}
          {bindingFeeAmt > 0 && (
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{color:"#fbbf24",fontSize:14}}>{isUrdu?"بائنڈنگ مزدوری:":"Binding Mazdori:"}</span>
              <span style={{color:"#fbbf24",fontWeight:700,fontSize:16}}>{formatPKR(bindingFeeAmt)}</span>
            </div>
          )}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{color:th.text,fontWeight:700,fontSize:15}}>{isUrdu?"کل رقم:":"Grand Total:"}</span>
            <span style={{color:"#34d399",fontWeight:900,fontSize:21}}>{formatPKR(grandTotal)}</span>
          </div>
          {pay.isPartial && paid > 0 && !paidError && (
            <>
              <div style={{borderTop:"1px dashed rgba(26,188,156,0.3)",paddingTop:6,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{color:th.textMuted,fontSize:13}}>💰 {isUrdu?"ابھی ادا:":"Paying now:"}</span>
                <span style={{color:"#fbbf24",fontWeight:800,fontSize:15}}>{formatPKR(paid)}</span>
              </div>
              {remaining > 0 && (
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{color:th.textMuted,fontSize:13}}>⏳ {isUrdu?"قابل وصول:":"Receivable:"}</span>
                  <span style={{color:"#f87171",fontWeight:800,fontSize:15}}>{formatPKR(remaining)}</span>
                </div>
              )}
            </>
          )}
          {pay.settlement === "credit" && (
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{color:th.textMuted,fontSize:13}}>⏳ {isUrdu?"قابل وصول:":"Receivable:"}</span>
              <span style={{color:"#f87171",fontWeight:800,fontSize:15}}>{formatPKR(remaining)}</span>
            </div>
          )}
          <div style={{fontSize:12,color:th.textMuted,fontStyle:"italic",marginTop:2}}>
            {numberToWords(pay.settlement === "full" ? grandTotal : (paid > 0 ? paid : grandTotal))}
          </div>
        </div>
      )}

      {/* Binding fee — Chader items only */}
      {hasChaderItem && (
        <BindingFeeSection bindingFee={bindingFee} setBindingFee={setBindingFee} isUrdu={isUrdu}/>
      )}

      {/* Loader */}
      <LoaderSection loaderForm={loaderForm} setLoaderForm={setLoaderForm} isUrdu={isUrdu} loaders={loaders}/>

      {/* Save button */}
      <button data-save="1" onClick={handleSave} disabled={!canSave||saving}
        style={{padding:"14px",borderRadius:12,border:"none",cursor:canSave&&!saving?"pointer":"not-allowed",background:canSave&&!saving?"linear-gradient(135deg,#1abc9c,#2980b9)":"rgba(26,188,156,0.3)",color:"white",fontWeight:700,fontSize:15,opacity:canSave&&!saving?1:0.7}}>
        {saving ? "..." : (isUrdu ? "محفوظ کریں اور Invoice Print کریں" : "Save & Print Invoice")}
      </button>
    </div>
  );
}

// ─── MAIN BILLING PAGE ────────────────────────────────────────────────────────
function BillingPage({ sales, products, loadSales, loadProducts, currentUser, loaders=[] }) {
  const th = useTheme();
  const { t, lang } = useLang();
  const { isMobile } = useResponsive();
  const isUrdu = lang === "ur";

  const [showSaleModal, setShowSaleModal] = useState(false);
  const [reprintData,   setReprintData]   = useState(null);

  const mySales = sales.filter(s =>
    s.staffEmail === currentUser.email ||
    s.staff?.email === currentUser.email ||
    s.staff === currentUser.id
  );
  const saleRecency = (s) => {
    const t = Date.parse(s?.createdAt || s?.updatedAt || "");
    if (Number.isFinite(t)) return t;
    const id = String(s?._id || s?.id || "");
    if (/^[a-fA-F0-9]{24}$/.test(id)) return parseInt(id.slice(0, 8), 16) * 1000;
    const d = Date.parse(s?.date || "");
    return Number.isFinite(d) ? d : 0;
  };
  const recentSales = [...mySales].sort((a, b) => saleRecency(b) - saleRecency(a));
  const today2       = todayStr();
  const todaySales   = mySales.filter(s => s.date === today2);
  const todayRevenue = todaySales.reduce((s,x) => s + (x.total||0), 0);

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
      if (cat==="Pipe")   { const m=desc.match(/^(\d+\.?\d*)pc/); totalQty+=m?parseFloat(m[1]):0; }
      else if (cat==="Chader") { const m=desc.match(/^(\d+\.?\d*)kg/); totalQty+=m?parseFloat(m[1]):0; }
      else if (cat==="Net")    { const m=desc.match(/^(\d+\.?\d*)ft/); totalQty+=m?parseFloat(m[1]):0; }
      else                      { const m=desc.match(/^(\d+\.?\d*)pc/); totalQty+=m?parseFloat(m[1]):0; }
    });

    // Build a clean productId+qty list for EVERY product in this sale (not just the
    // first one) so the backend can check & deduct stock correctly for each product.
    const saleItems = payload.items.map(item => ({
      productId: item.productId || (products.find(p => p.name === item.productName)?._id
                  || products.find(p => p.name === item.productName)?.id || ""),
      qty: Number(item.qty) || 0,
    })).filter(si => si.productId && si.qty > 0);

    const res = await api.addSale({
      invoice:payload.invoice, date:payload.date, customer:payload.customer,
      paymentMethod:payload.paymentMethod, bankName:payload.bankName,
      accountId:payload.accountId||"", accountName:payload.accountName||"", settlement:payload.settlement||"full",
      total:payload.total, grandTotal:payload.grandTotal,
      loaderName: payload.loaderName || "",
      loaderFee:  payload.loaderFee  || 0,
      bindingFee: payload.bindingFee || 0,
      items:payload.items, rows:resolvedRows,
      saleItems,
      product:productId,
      productName:firstProductName||"", qty:totalQty||1,
      rate:totalQty>0?payload.grandTotal/totalQty:payload.grandTotal,
      category:payload.items[0]?.category||"",
      isPartial:payload.isPartial||false,
      paidAmount:payload.paidAmount||payload.total,
      remainingAmount:payload.remainingAmount||0,
    });
    if (res.success) { await loadSales(); await loadProducts(); }
    return res;
  };

  const handleReprint = (s) => {
    setReprintData({
      invoice:s.invoice, date:s.date, customer:s.customer,
      items: s.items || [{ productName:s.productName||safeProductName(s.product), category:"", rows:[{ desc:`1pc × Rs${s.total}/pc`, amount:s.total }], subtotal:s.total }],
      grandTotal:s.grandTotal||s.total, paymentMethod:s.paymentMethod||"cash", bankName:s.accountName||s.bankName||"",
      loaderName:s.loaderName||"", loaderFee:s.loaderFee||0, bindingFee:s.bindingFee||0,
      isPartial:s.isPartial||false,
      paidAmount: (s.isPartial || s.settlement === "credit") ? (Number(s.paidAmount)||0) : (Number(s.paidAmount)||s.total),
      remainingAmount:s.remainingAmount||0,
    });
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

      {/* Stat cards */}
      <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr 1fr":"repeat(auto-fit,minmax(160px,1fr))", gap:12 }}>
        <StatCard label={t.todayRevenue}    value={formatPKR(todayRevenue)} icon={ICONS.trend_up} color="#1abc9c" sub={`${todaySales.length} ${t.todayInvoices}`}/>
        <StatCard label={t.productsInStock} value={products.filter(p=>p.stock>0).length} icon={ICONS.box} color="#9b59b6"/>
      </div>

      {/* Header row */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <h3 style={{ color:th.text, fontWeight:700, margin:0, fontSize:17 }}>{t.billingCounter}</h3>
        <button onClick={()=>setShowSaleModal(true)}
          style={{ display:"flex", alignItems:"center", gap:6, padding:isMobile?"10px 14px":"12px 20px", borderRadius:12, border:"none", cursor:"pointer", background:"linear-gradient(135deg,#1abc9c,#2980b9)", color:"white", fontWeight:700, fontSize:14 }}>
          <Icon path={ICONS.plus} size={16}/>{t.newSaleInvoice}
        </button>
      </div>

      {/* Today loaders summary */}
      <TodayLoadersSummary sales={mySales} isUrdu={isUrdu}/>

      {/* Today Chader binding mazdori summary */}
      <TodayBindingFeeSummary sales={mySales} isUrdu={isUrdu}/>

      {/* Sales table */}
      <Table
        cols={[t.invoiceNum, t.date, t.customer, t.products, t.totalLabel, "💳", "💰", "🖨️"]}
        rows={recentSales.map(s=>({
          data:s,
          cells:[
            <span style={{fontFamily:"monospace",color:"#34d399",fontSize:13}}>{s.invoice}</span>,
            s.date,
            s.customer,
            s.productName || safeProductName(s.product) || s.items?.[0]?.productName || "—",
            <span style={{fontWeight:700,color:th.text}}>{formatPKR(s.total)}</span>,
            <span style={{ fontSize:12, padding:"2px 8px", borderRadius:20, fontWeight:600, ...getPaymentBadgeStyle(s.paymentMethod) }}>
              {s.paymentMethod==="credit"?(isUrdu?"ادھار":"Credit"):s.paymentMethod==="bank"?`🏦 ${s.accountName||s.bankName||"Bank"}`:s.paymentMethod==="jazzcash"?"🎵 JazzCash":s.paymentMethod==="easypaisa"?"📱 Easypaisa":s.paymentMethod==="wallet"?`📱 ${s.accountName||s.bankName||"Wallet"}`:(s.accountName?`💵 ${s.accountName}`:"💵 Cash")}
            </span>,
            s.isPartial
              ? <span style={{fontSize:11,padding:"2px 7px",borderRadius:20,background:"rgba(248,113,113,0.15)",color:"#f87171",fontWeight:700}}>⏳ {formatPKR(s.remainingAmount||0)} {isUrdu?"باقی":"due"}</span>
              : <span style={{fontSize:11,padding:"2px 7px",borderRadius:20,background:"rgba(52,211,153,0.12)",color:"#34d399",fontWeight:600}}>✅ {isUrdu?"مکمل":"Paid"}</span>,
            <button onClick={()=>handleReprint(s)}
              style={{background:"rgba(96,165,250,0.12)",border:"none",borderRadius:6,color:"#60a5fa",cursor:"pointer",padding:"4px 10px",fontSize:13}}
              onMouseEnter={e=>e.currentTarget.style.background="rgba(96,165,250,0.25)"}
              onMouseLeave={e=>e.currentTarget.style.background="rgba(96,165,250,0.12)"}>🖨️</button>,
          ]
        }))}
      />

      {/* New sale modal */}
      {showSaleModal && (
        <Modal title={isUrdu?"نئی Sale — Invoice بنائیں":"New Sale — Create Invoice"} onClose={()=>setShowSaleModal(false)} wide>
          <BillingNewSaleModal products={products} onSave={handleSave} onClose={()=>setShowSaleModal(false)} isUrdu={isUrdu} loaders={loaders} extraNames={sales.map(s=>s.customer)}/>
        </Modal>
      )}

      {/* Reprint modal */}
      {reprintData && (
        <Modal title={isUrdu?"🖨️ رسید":"🖨️ Invoice"} onClose={()=>setReprintData(null)}>
          <BillingSaleInvoice invoiceData={reprintData} onClose={()=>setReprintData(null)} isUrdu={isUrdu}/>
        </Modal>
      )}
    </div>
  );
}

export { BillingNewSaleModal, BillingSaleInvoice, getPaymentBadgeStyle, TodayLoadersSummary, TodayBindingFeeSummary };
export default BillingPage;