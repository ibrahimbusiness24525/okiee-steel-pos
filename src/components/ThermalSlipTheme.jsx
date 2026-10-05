import { loadShopProfile } from "../utils/helpers";

/** 80mm thermal receipt theme — matches paint-shop style slip. */
export const THERMAL_MM = 80;

export const thermalPrintStyles = `
@page { size: ${THERMAL_MM}mm auto; margin: 0 !important; }
@media print {
  html, body { margin:0 !important; padding:0 !important; background:#fff !important; width: ${THERMAL_MM}mm !important; height:auto !important; }
  body * { visibility:hidden !important; }
  #print-portal-overlay, #print-portal-overlay *,
  #thermal-invoice-print, #thermal-invoice-print *,
  #thermal-invoice, #thermal-invoice * { visibility:visible !important; color:#000 !important; }
  #thermal-invoice-print, #thermal-invoice {
    width: ${THERMAL_MM}mm !important;
    max-width: ${THERMAL_MM}mm !important;
    box-sizing: border-box !important;
    padding: 0 1.5mm !important;
    margin: 0 !important;
    height: auto !important;
    min-height: 0 !important;
  }
  button { display:none !important; }
}`;

export const slipPage = {
  width: `${THERMAL_MM}mm`,
  maxWidth: `${THERMAL_MM}mm`,
  margin: "0 auto",
  fontFamily: "Arial, Helvetica, sans-serif",
  fontSize: "12px",
  color: "#000",
  background: "#fff",
  padding: "0 1.5mm",
  boxSizing: "border-box",
  height: "fit-content",
  minHeight: 0,
};

export const slipLine = {
  borderTop: "1px solid #000",
  margin: "2px 0",
};

export function shopLabel(isUrdu) {
  const sp = loadShopProfile();
  const owners = (sp.owners || []).filter((o) => o.name || o.nameUr || o.phone);
  const contactLines = owners
    .map((o) => {
      const name = isUrdu
        ? (String(o.nameUr || o.name || "").trim())
        : (String(o.name || o.nameUr || "").trim());
      const phone = String(o.phone || "").trim();
      if (!name && !phone) return null;
      return { name, phone };
    })
    .filter(Boolean);
  // Fallback when profile has no owners
  const phoneBar = contactLines.length
    ? contactLines.map((c) => (c.name && c.phone ? `${c.name}: ${c.phone}` : (c.phone || c.name))).join("  ·  ")
    : "03090001316 - 03057903867";
  return {
    sp,
    shopName: isUrdu ? (sp.shopNameUr || sp.shopName || "STEELPOS") : (sp.shopName || "STEELPOS"),
    address: isUrdu ? (sp.addressUr || sp.address || "") : (sp.address || ""),
    phoneBar,
    contactLines,
    logo: sp.logoBase64 || "",
  };
}

export function fmtBillDate(date, isUrdu) {
  const d = date ? new Date(date) : new Date();
  if (Number.isNaN(d.getTime())) return String(date || "");
  const day = d.toLocaleDateString(isUrdu ? "ur-PK" : "en-GB", { weekday: "short" });
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${day} ${dd}/${mm}/${yyyy}`;
}

export function fmtPrintedOn(isUrdu) {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const time = d.toLocaleTimeString(isUrdu ? "ur-PK" : "en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  return `${dd}/${mm}/${yyyy} ${time.replace(/\s/g, "")}`;
}

/** Time only — shown under Bill Date */
export function fmtBillTime(isUrdu) {
  const d = new Date();
  return d.toLocaleTimeString(isUrdu ? "ur-PK" : "en-US", {
    hour: "2-digit", minute: "2-digit", hour12: true,
  }).replace(/\s/g, "");
}

/** Top receipt title: SALE RECEIPT / CREDIT SALE */
export function saleReceiptTitle({ isCredit, isUrdu }) {
  if (isCredit) return isUrdu ? "کریڈٹ سیل" : "CREDIT SALE";
  return isUrdu ? "سیل رسید" : "SALE RECEIPT";
}

export function fmtNum(n) {
  const v = Math.round(Number(n) || 0);
  return v.toLocaleString("en-PK");
}

export function packLabel(category, qtyStr) {
  const q = String(qtyStr || "");
  if (/kg|g\b/i.test(q)) return "Kg";
  if (/ft/i.test(q)) return "Ft";
  if (category === "Chader") return "Kg";
  if (category === "Net") return "Ft";
  if (category === "Pipe") return "Pc";
  return "Pc";
}

/** Header: shop name, address, black phone bar, receipt title */
export function ThermalSlipHeader({ title, isUrdu }) {
  const { shopName, address, phoneBar, contactLines, logo } = shopLabel(isUrdu);
  const lines = (contactLines && contactLines.length)
    ? contactLines
    : [{ name: "", phone: phoneBar }];
  return (
    <div style={{ margin: 0, padding: 0 }}>
      {logo ? (
        <div style={{ textAlign: "center", marginBottom: 2 }}>
          <img src={logo} alt="" style={{ maxWidth: 48, maxHeight: 32, objectFit: "contain" }} />
        </div>
      ) : null}
      <div style={{
        textAlign: "center", fontWeight: 800, fontSize: "17px",
        letterSpacing: "0.3px", lineHeight: 1.1, textTransform: "uppercase",
      }}>
        {shopName}
      </div>
      {address ? (
        <div style={{ textAlign: "center", fontSize: "10px", marginTop: 2, lineHeight: 1.2 }}>
          {address}
        </div>
      ) : null}
      <div style={{
        marginTop: 3, background: "#000", color: "#fff",
        textAlign: "center", padding: "4px 3px",
      }}>
        {lines.map((c, i) => (
          <div key={i} style={{
            lineHeight: 1.2,
            marginTop: i > 0 ? 1 : 0,
            display: "flex",
            justifyContent: "center",
            alignItems: "baseline",
            flexWrap: "wrap",
            gap: "2px 6px",
          }}>
            {c.name ? (
              <span style={{ fontSize: "11px", fontWeight: 700 }}>
                {c.name}:
              </span>
            ) : null}
            {c.phone ? (
              <span style={{
                fontSize: "14px", fontWeight: 900, letterSpacing: "0.5px",
                fontVariantNumeric: "tabular-nums",
              }}>
                {c.phone}
              </span>
            ) : null}
          </div>
        ))}
      </div>
      <div style={{
        textAlign: "center", fontWeight: 800, fontSize: "13px",
        marginTop: 4, marginBottom: 0, textDecoration: "underline", letterSpacing: "0.5px",
        textTransform: "uppercase",
      }}>
        {title}
      </div>
    </div>
  );
}

/** Bill No / Date / party lines */
export function ThermalSlipMeta({
  billNo, date, partyLabel, partyName, cashSaleLabel, isUrdu,
}) {
  return (
    <div style={{ marginTop: 4, fontSize: "11px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
        <div style={{ fontWeight: 700 }}>
          <div>Bill No {billNo || "—"}</div>
          {cashSaleLabel ? <div style={{ marginTop: 2 }}>{cashSaleLabel}</div> : null}
        </div>
        <div style={{ fontWeight: 700, textAlign: "right", whiteSpace: "nowrap" }}>
          <div>Bill Date :{fmtBillDate(date, isUrdu)}</div>
          <div style={{ marginTop: 2, fontWeight: 700 }}>{fmtBillTime(isUrdu)}</div>
        </div>
      </div>
      {partyName ? (
        <div style={{ fontWeight: 700, marginTop: 3 }}>
          {partyLabel}: {partyName}
        </div>
      ) : null}
    </div>
  );
}

/** Items table: Item Name | Packin | Qty | Price | Amount */
export function ThermalSlipItemsTable({ rows, isUrdu }) {
  const H = isUrdu
    ? { item: "آئٹم", pack: "پیک", qty: "مقدار", price: "ریٹ", amt: "رقم" }
    : { item: "Item Name", pack: "Packin", qty: "Qty", price: "Price", amt: "Amount" };
  const th = (align) => ({
    padding: "5px 2px", fontWeight: 800, fontSize: "13px",
    textAlign: align, borderBottom: "1px solid #000", borderTop: "1px solid #000",
  });
  const td = (align) => ({
    padding: "5px 2px", fontSize: "13px", fontWeight: 700, textAlign: align,
    verticalAlign: "top", wordBreak: "break-word",
  });
  return (
    <table className="inv-items" style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", marginTop: 4 }}>
      <colgroup>
        <col style={{ width: "34%" }} />
        <col style={{ width: "14%" }} />
        <col style={{ width: "14%" }} />
        <col style={{ width: "18%" }} />
        <col style={{ width: "20%" }} />
      </colgroup>
      <thead>
        <tr>
          <th style={th("left")}>{H.item}</th>
          <th style={th("center")}>{H.pack}</th>
          <th style={th("center")}>{H.qty}</th>
          <th style={th("right")}>{H.price}</th>
          <th style={th("right")}>{H.amt}</th>
        </tr>
      </thead>
      <tbody>
        {(rows || []).map((r, i) => (
          <tr key={i}>
            <td style={td("left")}>{r.item}</td>
            <td style={td("center")}>{r.pack || "Pc"}</td>
            <td style={{ ...td("center"), whiteSpace: "normal" }}>{r.qty}</td>
            <td style={td("right")}>{fmtNum(r.price)}</td>
            <td style={td("right")}>{fmtNum(r.amount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Totals: Total Amount → Discount → after discount (if any) → Paid → fees total */
export function ThermalSlipTotals({
  itemCount, gross, billAmount, cashReceived, changeDue,
  discount, paidAmount, remainingAmount, isPartial, isUrdu, extras = [], notes = [],
  loaderFee = 0, bindingFee = 0,
}) {
  const paidNow = Number(paidAmount) || 0;
  const balance = Number(remainingAmount) || 0;
  const disc = Number(discount) || 0;
  const grossAmt = Number(gross) || 0;
  const feeLoad = Number(loaderFee) || 0;
  const feeBind = Number(bindingFee) || 0;
  // Items only (no binding/loader) — after discount.
  const afterDiscItems = Math.max(0, Math.round((grossAmt - disc) * 100) / 100);
  const showAfterDisc = disc > 0.009;
  // Final total with optional loader + bedding/binding.
  const showWithFees = feeLoad > 0.009 || feeBind > 0.009;
  const totalWithFees = Math.max(0, Math.round((afterDiscItems + feeBind + feeLoad) * 100) / 100);
  const creditLike = !!isPartial || balance > 0.009;
  const row = (label, value, opts = {}) => (
    <div style={{
      display: "flex", justifyContent: "space-between", marginTop: 3,
      fontWeight: opts.bold ? 800 : 700, fontSize: opts.big ? "14px" : "12px",
    }}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
  const settleLine = {
    fontSize: "13px", fontWeight: 800, lineHeight: 1.55, marginTop: 2,
  };
  return (
    <div style={{ marginTop: 2, fontSize: "12px" }}>
      <div style={slipLine} />
      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: "12px" }}>
        <span>{isUrdu ? `کل آئٹمز ${itemCount}` : `Total Item's ${itemCount}`}</span>
        <span />
      </div>
      {row(isUrdu ? "کل رقم :" : "Total Amount :", fmtNum(grossAmt), { bold: true, big: true })}
      {showAfterDisc ? (
        <>
          {row(isUrdu ? "رعایت :" : "Discount :", `- ${fmtNum(disc)}`)}
          <div style={{ marginTop: 6, textAlign: "right" }}>
            <div style={{ fontWeight: 800, marginBottom: 3, fontSize: "13px" }}>
              {isUrdu ? "رعایت کے بعد کل :" : "Total after discount :"}
            </div>
            <div style={{
              display: "inline-block", border: "2px solid #000",
              padding: "4px 14px", fontWeight: 900, fontSize: "18px", minWidth: 80, textAlign: "center",
            }}>
              {fmtNum(afterDiscItems)}
            </div>
          </div>
        </>
      ) : null}
      <div style={{ marginTop: 6, textAlign: "right" }}>
        {creditLike || paidNow > 0 ? (
          <div style={settleLine}>{isUrdu ? "ابھی ادا :" : "Paid Now :"} {fmtNum(paidNow)}</div>
        ) : null}
        {creditLike ? (
          <div style={settleLine}>{isUrdu ? "بعد میں / باقی :" : "Paid Later / Balance :"} {fmtNum(balance)}</div>
        ) : null}
        <div style={settleLine}>{isUrdu ? "وصول نقد :" : "Received Cash :"} {Number(cashReceived) > 0 ? fmtNum(cashReceived) : ""}</div>
        <div style={settleLine}>{isUrdu ? "واپسی نقد :" : "Return Cash :"} {Number(changeDue) > 0 ? fmtNum(changeDue) : ""}</div>
      </div>
      {(extras || []).length > 0 && (
        <div style={{ marginTop: 4 }}>
          {(extras || []).map((ex, i) => (
            <div key={i} style={{
              display: "flex", justifyContent: "space-between", marginTop: 2,
              fontWeight: 800, fontSize: "13px",
            }}>
              <span>{ex.label}</span>
              <span>{ex.value}</span>
            </div>
          ))}
        </div>
      )}
      {(notes || []).length > 0 && (
        <div style={{ marginTop: 4 }}>
          <div style={slipLine} />
          {(notes || []).map((ex, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", marginTop: 2, fontWeight: 700, fontSize: "12px" }}>
              <span>{ex.label}</span>
              <span>{ex.value}</span>
            </div>
          ))}
        </div>
      )}
      {showWithFees ? (
        <div style={{ marginTop: 6 }}>
          <div style={slipLine} />
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            fontWeight: 900, fontSize: "13px", marginTop: 4, gap: 8,
          }}>
            <span>{isUrdu ? "لوڈر + بیڈنگ کل :" : "Total with loader + bedding :"}</span>
            <span style={{
              display: "inline-block", border: "2px solid #000",
              padding: "3px 10px", fontSize: "16px", minWidth: 64, textAlign: "center",
            }}>
              {fmtNum(totalWithFees)}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Sale type line: CASH SALE / CREDIT SALE */
export function saleTypeLabel({ invoice, paymentMethod, settlement, remainingAmount, isPartial, isUrdu }) {
  const no = String(invoice || "").replace(/\D/g, "") || "";
  const settle = String(settlement || "").toLowerCase();
  const credit = paymentMethod === "credit"
    || settle === "credit"
    || settle === "partial"
    || !!isPartial
    || Number(remainingAmount) > 0.009;
  if (credit) return `${isUrdu ? "کریڈٹ سیل" : "CREDIT SALE"}${no ? ` ${no}` : ""}`;
  return `${isUrdu ? "کیش سیل" : "CASH SALE"}${no ? ` ${no}` : ""}`;
}

/** Brand block (class inv-brand — print pagination reuses this) */
export function OkiieeBrandFooter() {
  return (
    <div className="inv-brand" style={{ textAlign: "center", marginTop: 2, marginBottom: 0, paddingBottom: 0 }}>
      <div style={slipLine} />
      <div className="inv-brand-title" style={{ fontSize: "10px", fontWeight: 800, marginTop: 1, marginBottom: 0 }}>
        Powered By okiiee Software Company
      </div>
      <div className="inv-brand-phone" style={{ fontSize: "10px", fontWeight: 700, marginTop: 1, marginBottom: 0, paddingBottom: 0 }}>
        UAN : 03090001316 - 03057903867
      </div>
    </div>
  );
}

/** Footer: role, disclaimer, visit again + brand (brand is a sibling for print split) */
export function ThermalSlipFooter({ isUrdu, role = "admin" }) {
  return (
    <>
      <div style={{ marginTop: 2, marginBottom: 0, paddingBottom: 0 }}>
        <div style={{ fontStyle: "italic", fontSize: "10px", marginBottom: 1 }}>{role}</div>
        <div style={slipLine} />
        <div style={{ fontSize: "9px", lineHeight: 1.25, textAlign: "left" }}>
          {isUrdu
            ? "معزز گاہک برائے مہربانی بل کے مطابق سامان اور نقدی کاؤنٹر پر چیک کریں۔ کاؤنٹر چھوڑنے کے بعد کوئی کلیم قابل قبول نہیں ہوگا۔"
            : "Dear Customer Please checks and verify your goods and Cash at Counter according to bill, No claim will be acceptable after leaving sale counter."}
        </div>
        <div style={{
          textAlign: "center", fontStyle: "italic", fontWeight: 700,
          fontSize: "11px", marginTop: 3, marginBottom: 0,
        }}>
          {isUrdu ? "دوبارہ تشریف لائیں" : "Hope you will Visit again."}
        </div>
      </div>
      <OkiieeBrandFooter />
    </>
  );
}
