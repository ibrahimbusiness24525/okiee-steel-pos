export const formatPKR = (n) => "PKR " + Math.round(Number(n)||0).toLocaleString("en-PK");
export const todayStr  = () => ymd(new Date());

export function ymd(d) {
  const x = d instanceof Date ? d : new Date(d);
  if (isNaN(x)) return "";
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDaysYmd(days, from = new Date()) {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return ymd(d);
}

export function parseYmd(str) {
  if (!str) return "";
  const s = String(str).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const parts = s.split(/[-\/]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) return `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
    return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
  }
  const dt = new Date(s);
  return isNaN(dt) ? "" : ymd(dt);
}

/** today | yesterday | week (7d) | month (this calendar month) | custom | all */
export function inDateFilter(dateStr, filter, customFrom = "", customTo = "", createdAt) {
  const d = parseYmd(dateStr) || parseYmd(createdAt);
  if (!d) return filter === "all";
  const today = todayStr();
  if (filter === "today") return d === today;
  if (filter === "yesterday") return d === addDaysYmd(-1);
  if (filter === "week") return d >= addDaysYmd(-6) && d <= today;
  if (filter === "month") {
    const monthStart = `${today.slice(0, 8)}01`;
    return d >= monthStart && d <= today;
  }
  if (filter === "custom") {
    const from = customFrom || "0000-01-01";
    const to = customTo || "9999-12-31";
    return d >= from && d <= to;
  }
  return true;
}

export function formatDateTime(dateStr, createdAt, locale = "en-PK") {
  const day = parseYmd(dateStr) || parseYmd(createdAt) || "—";
  let time = "";
  if (createdAt) {
    const t = new Date(createdAt);
    if (!isNaN(t)) time = t.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  }
  return time ? `${day} · ${time}` : day;
}

export function sortLedgerEntries(list) {
  return (list || []).slice().sort((a, b) => {
    const tb = Date.parse(b.createdAt || b.updatedAt || "") || 0;
    const ta = Date.parse(a.createdAt || a.updatedAt || "") || 0;
    if (tb !== ta) return tb - ta;
    const idb = String(b._id || b.id || "");
    const ida = String(a._id || a.id || "");
    if (idb !== ida) return idb.localeCompare(ida);
    return String(b.date || "").localeCompare(String(a.date || ""));
  });
}

const PX_PER_MM = 96 / 25.4;
const nodeH = (n) => {
  if (!n || n.nodeType !== 1) return 0;
  const st = window.getComputedStyle(n);
  const mt = parseFloat(st.marginTop) || 0;
  const mb = parseFloat(st.marginBottom) || 0;
  return (n.offsetHeight || 0) + mt + mb;
};

export const pxToPageHeightMM = (el) => {
  const heightPx = (el && (el.scrollHeight || el.offsetHeight)) || 300;
  return Math.ceil(heightPx / PX_PER_MM) + 10;
};

function findItemsTable(root) {
  const marked = root.querySelector("table.inv-items");
  if (marked) return marked;
  const tables = [...root.querySelectorAll("table")];
  const ranked = tables
    .filter((t) => t.tHead && t.tBodies?.[0]?.rows?.length)
    .sort((a, b) => b.tBodies[0].rows.length - a.tBodies[0].rows.length);
  return ranked[0] || null;
}

function siblingBlock(root, table, after) {
  const nodes = [];
  if (after) {
    let n = table.nextSibling;
    while (n) { nodes.push(n); n = n.nextSibling; }
  } else {
    let n = root.firstChild;
    while (n && n !== table) { nodes.push(n); n = n.nextSibling; }
  }
  return nodes;
}

function copyTableShell(table) {
  const tbl = table.cloneNode(false);
  [...table.children].forEach((el) => {
    if (el.tagName === "COLGROUP") tbl.appendChild(el.cloneNode(true));
  });
  if (table.tHead) tbl.appendChild(table.tHead.cloneNode(true));
  return tbl;
}

function isBrandish(n) {
  if (!n || n.nodeType !== 1) return false;
  if (n.classList?.contains("inv-brand") || n.querySelector?.(".inv-brand")) return true;
  const t = (n.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
  return t.includes("okiiee") || t.includes("okiiiee software");
}

export function makeOkiieeBrandFooter() {
  const wrap = document.createElement("div");
  wrap.className = "inv-brand";
  wrap.style.cssText = "text-align:center;margin-top:6px;padding-top:6px;border-top:1px dashed #000;";
  const title = document.createElement("div");
  title.className = "inv-brand-title";
  title.style.cssText = "font-weight:800;font-size:13px;letter-spacing:0.2px;line-height:17px;";
  title.textContent = "For okiiee Software";
  const p1 = document.createElement("div");
  p1.className = "inv-brand-phone";
  p1.style.cssText = "font-weight:700;font-size:11px;line-height:15px;margin-top:3px;";
  p1.textContent = "03090001316";
  const p2 = document.createElement("div");
  p2.className = "inv-brand-phone";
  p2.style.cssText = "font-weight:700;font-size:11px;line-height:15px;";
  p2.textContent = "03057903867";
  wrap.append(title, p1, p2);
  return wrap;
}

function buildTrialSheet(itemsTable, rowsSlice, headerNodes, totalsNodes, withHeader, withTotals) {
  const sheet = document.createElement("div");
  if (withHeader) headerNodes.forEach((n) => sheet.appendChild(n.cloneNode(true)));
  const tbl = copyTableShell(itemsTable);
  const tb = document.createElement("tbody");
  rowsSlice.forEach((r) => tb.appendChild(r.cloneNode(true)));
  tbl.appendChild(tb);
  sheet.appendChild(tbl);
  if (withTotals) totalsNodes.forEach((n) => sheet.appendChild(n.cloneNode(true)));
  sheet.appendChild(makeOkiieeBrandFooter());
  return sheet;
}

function measureSheetHeight(sheet, widthPx) {
  const box = document.createElement("div");
  box.style.cssText = `position:absolute;left:-9999px;top:0;width:${Math.max(widthPx, 160)}px;visibility:hidden;background:#fff;`;
  box.appendChild(sheet);
  document.body.appendChild(box);
  const h = box.scrollHeight || box.offsetHeight || 0;
  box.remove();
  return h;
}

/**
 * Split a long invoice into pages by measuring real height so page 1 fills.
 * Last page: remaining items, then totals, then okiiee footer (no gap in between).
 */
export function paginateInvoiceClone(root, maxPagePx) {
  if (!root || !maxPagePx) return;
  const itemsTable = findItemsTable(root);
  if (!itemsTable) return;

  const headerNodes = siblingBlock(root, itemsTable, false);
  const footerNodes = siblingBlock(root, itemsTable, true);
  const invoiceFooterNodes = footerNodes.filter((n) => !isBrandish(n));
  const rows = [...(itemsTable.tBodies[0]?.rows || [])];
  if (!rows.length) return;

  const widthPx = root.offsetWidth || root.clientWidth || 220;
  const heightOf = (start, end, withHeader, withTotals) => measureSheetHeight(
    buildTrialSheet(itemsTable, rows.slice(start, end), headerNodes, invoiceFooterNodes, withHeader, withTotals),
    widthPx
  );

  if (heightOf(0, rows.length, true, true) <= maxPagePx) return;

  const ranges = [];
  let i = 0;
  while (i < rows.length) {
    const isFirst = ranges.length === 0;
    let j = i + 1;
    while (j <= rows.length) {
      const isLast = j === rows.length;
      const h = heightOf(i, j, isFirst, isLast);
      if (h > maxPagePx) {
        if (j > i + 1) j -= 1;
        break;
      }
      if (j === rows.length) break;
      j += 1;
    }
    ranges.push([i, j]);
    i = j;
  }

  const totalPages = ranges.length;
  const frag = document.createDocumentFragment();
  ranges.forEach(([start, end], pi) => {
    const isLast = pi === totalPages - 1;
    const sheet = document.createElement("div");
    sheet.className = isLast ? "print-sheet print-sheet-last" : "print-sheet";
    if (pi === 0) headerNodes.forEach((n) => sheet.appendChild(n.cloneNode(true)));
    const tbl = copyTableShell(itemsTable);
    const tb = document.createElement("tbody");
    rows.slice(start, end).forEach((r) => tb.appendChild(r.cloneNode(true)));
    tbl.appendChild(tb);
    sheet.appendChild(tbl);
    if (isLast) invoiceFooterNodes.forEach((n) => sheet.appendChild(n.cloneNode(true)));
    sheet.appendChild(makeOkiieeBrandFooter());
    frag.appendChild(sheet);
  });
  root.replaceChildren(frag);
}

function markLastPrintSheet(root) {
  const sheets = [...root.querySelectorAll(".print-sheet")];
  if (sheets.length) {
    sheets.forEach((s) => s.classList.remove("print-sheet-last"));
    sheets[sheets.length - 1].classList.add("print-sheet-last");
    return;
  }
  const wrap = document.createElement("div");
  wrap.className = "print-sheet print-sheet-last";
  while (root.firstChild) wrap.appendChild(root.firstChild);
  root.appendChild(wrap);
}

function printPageCss({ isA4, pageHeightMM }) {
  const thermalH = Math.max(80, Math.min(pageHeightMM || 297, 297));
  const page = isA4
    ? `@page { size: A4 portrait; margin: 8mm 10mm; }`
    : `@page { size: 3in ${thermalH}mm; margin: 1.5mm; }`;
  return `
    ${page}
    @media print {
      html, body {
        width: auto !important;
        margin: 0 !important;
        padding: 0 !important;
        background: #fff !important;
        color: #000 !important;
        height: auto !important;
        overflow: visible !important;
      }
      body > *:not(#print-portal-overlay) { display: none !important; }
      body * { visibility: hidden !important; }
      #print-portal-overlay,
      #print-portal-overlay *,
      #thermal-invoice-print,
      #thermal-invoice-print * {
        visibility: visible !important;
        color: #000 !important;
      }
      #print-portal-overlay {
        display: block !important;
        position: relative !important;
        left: 0 !important;
        top: 0 !important;
        width: 100% !important;
        max-width: 100% !important;
        height: auto !important;
        margin: 0 !important;
        padding: 0 !important;
        background: #fff !important;
        overflow: visible !important;
        transform: none !important;
        zoom: 1 !important;
      }
      #thermal-invoice-print {
        display: block !important;
        position: relative !important;
        left: 0 !important;
        top: 0 !important;
        width: 100% !important;
        max-width: 100% !important;
        margin: 0 !important;
        padding: 2mm 1mm !important;
        background: #fff !important;
        font-size: 13px !important;
        line-height: 1.35 !important;
      }
      #thermal-invoice-print * { box-sizing: border-box !important; max-width: 100% !important; }
      .print-sheet { page-break-after: always; break-after: page; }
      .print-sheet-last {
        page-break-after: auto !important;
        break-after: auto !important;
      }
      .print-sheet-last .inv-brand { margin-top: 8px !important; }
      #thermal-invoice-print table { page-break-inside: auto; width: 100% !important; }
      #thermal-invoice-print tr { page-break-inside: avoid; break-inside: avoid; }
      #thermal-invoice-print thead { display: table-header-group !important; }
      .inv-brand-title { font-size: 13px !important; font-weight: 800 !important; }
      .inv-brand-phone { font-size: 11px !important; font-weight: 700 !important; }
      button { display: none !important; }
    }
  `;
}

export function safePdfName(name) {
  const base = String(name || `invoice-${todayStr()}`).replace(/\.pdf$/i, "");
  const clean = base.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 80);
  return `${clean || "invoice"}.pdf`;
}

/** Capture #thermal-invoice into a jsPDF document. */
export async function invoicePdfDoc(filename) {
  const inv = document.getElementById("thermal-invoice");
  if (!inv) return null;

  const file = safePdfName(filename);
  const portal = document.createElement("div");
  portal.id = "pdf-capture-portal";
  portal.style.cssText = "position:fixed;left:-10000px;top:0;width:794px;background:#fff;padding:28px;z-index:-1;";
  const clone = inv.cloneNode(true);
  clone.id = "thermal-invoice-pdf";
  clone.style.width = "738px";
  clone.style.maxWidth = "738px";
  clone.style.margin = "0 auto";
  clone.style.background = "#fff";
  clone.style.color = "#000";
  clone.style.boxSizing = "border-box";
  portal.appendChild(clone);
  document.body.appendChild(portal);

  try {
    const html2canvas = (await import("html2canvas")).default;
    const { jsPDF } = await import("jspdf");
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const maxPagePx = Math.floor(285 * PX_PER_MM);
    paginateInvoiceClone(clone, maxPagePx);
    const sheets = [...clone.querySelectorAll(".print-sheet")];
    const targets = sheets.length ? sheets : [clone];
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 10;
    const imgW = pageW - margin * 2;
    const usableH = pageH - margin * 2;
    for (let i = 0; i < targets.length; i++) {
      const canvas = await html2canvas(targets[i], {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
      });
      const imgData = canvas.toDataURL("image/jpeg", 0.92);
      const imgH = (canvas.height * imgW) / canvas.width;
      if (i > 0) pdf.addPage();
      if (imgH <= usableH + 1) {
        pdf.addImage(imgData, "JPEG", margin, margin, imgW, imgH);
      } else {
        let heightLeft = imgH;
        let position = margin;
        pdf.addImage(imgData, "JPEG", margin, position, imgW, imgH);
        heightLeft -= usableH;
        while (heightLeft > 2) {
          position = margin - (imgH - heightLeft);
          pdf.addPage();
          pdf.addImage(imgData, "JPEG", margin, position, imgW, imgH);
          heightLeft -= usableH;
        }
      }
    }
    return { pdf, file, blob: pdf.output("blob") };
  } catch (err) {
    console.error(err);
    alert("Could not create PDF");
    return null;
  } finally {
    portal.remove();
  }
}

/** Capture #thermal-invoice and download an A4 PDF file (no print dialog). */
export async function downloadInvoicePdf(filename) {
  const r = await invoicePdfDoc(filename);
  if (r?.pdf) r.pdf.save(r.file);
}

function whatsappUrl(phone, text) {
  const msg = encodeURIComponent(text || "");
  const digits = String(phone || "").replace(/[^\d]/g, "");
  if (!digits) return `https://wa.me/?text=${msg}`;
  let intl = digits;
  if (digits.startsWith("00")) intl = digits.slice(2);
  else if (digits.startsWith("0")) intl = "92" + digits.slice(1);
  return `https://wa.me/${intl}?text=${msg}`;
}

/** Download the PDF, then open WhatsApp. Uses native share with the file when the phone supports it. */
export async function sharePdfOnWhatsApp({ filename, text, phone } = {}) {
  const r = await invoicePdfDoc(filename);
  if (!r) return;
  const file = new File([r.blob], r.file, { type: "application/pdf" });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: r.file, text: text || "" });
      return;
    }
  } catch (e) {
    if (e?.name === "AbortError") return;
  }
  r.pdf.save(r.file);
  const hint = (text || "Report PDF") + "\n\nPDF downloaded — attach that file in WhatsApp.";
  window.open(whatsappUrl(phone, hint), "_blank");
}

/** Print #thermal-invoice as thermal roll (3 inch) or A4 paper. PDF downloads a file (no print dialog). */
export function printThermalOrA4(mode = "thermal", filename) {
  if (mode === "pdf") {
    downloadInvoicePdf(filename);
    return;
  }

  const existingOverlay = document.getElementById("print-portal-overlay");
  if (existingOverlay) existingOverlay.remove();
  const existingStyle = document.getElementById("print-portal-style");
  if (existingStyle) existingStyle.remove();

  const inv = document.getElementById("thermal-invoice");
  if (!inv) return;

  const isA4 = mode === "a4";
  const portal = document.createElement("div");
  portal.id = "print-portal-overlay";
  portal.style.position = "absolute";
  portal.style.left = "-9999px";
  portal.style.top = "0";
  portal.style.width = isA4 ? "210mm" : "3in";

  const clone = inv.cloneNode(true);
  clone.id = "thermal-invoice-print";
  clone.style.width = isA4 ? "190mm" : "3in";
  clone.style.maxWidth = isA4 ? "190mm" : "3in";
  clone.style.margin = "0";
  clone.style.boxSizing = "border-box";
  clone.style.color = "#000";
  clone.style.background = "#fff";
  if (isA4) clone.style.fontSize = "14px";
  portal.appendChild(clone);
  document.body.appendChild(portal);

  const styleEl = document.createElement("style");
  styleEl.id = "print-portal-style";
  styleEl.innerHTML = printPageCss({ isA4 });
  document.head.appendChild(styleEl);

  requestAnimationFrame(() => requestAnimationFrame(() => {
    paginateInvoiceClone(clone, Math.floor((isA4 ? 270 : 291) * PX_PER_MM));
    markLastPrintSheet(clone);
    const sheets = [...clone.querySelectorAll(".print-sheet")];
    const hPx = Math.max(
      1,
      ...((sheets.length ? sheets : [clone]).map((s) => s.scrollHeight || s.offsetHeight || 0))
    );
    const pageHeightMM = isA4 ? 297 : Math.max(80, Math.min(Math.ceil(hPx / PX_PER_MM) + 6, 297));
    styleEl.innerHTML = printPageCss({ isA4, pageHeightMM });
    portal.style.position = "relative";
    portal.style.left = "0";
    portal.style.top = "0";
    requestAnimationFrame(() => {
      window.print();
      setTimeout(() => { portal.remove(); styleEl.remove(); }, 1500);
    });
  }));
}

// ─── Chader/weight helpers (kg + grams) ────────────────────────────────────
// Weight is always stored internally as ONE decimal number of kilograms
// (e.g. 12.6 for "12kg 600g"). These helpers convert between that decimal
// and separate kg/gram parts so entry + display is never wrong/ambiguous.

// decimal kg -> { kg, g }  (rounded to the nearest gram to avoid float drift)
export const decimalKgToParts = (dec) => {
  const totalGrams = Math.round((Number(dec) || 0) * 1000);
  const kg = Math.trunc(totalGrams / 1000);
  const g  = Math.abs(totalGrams) % 1000;
  return { kg, g };
};

// kg part + gram part (0-999) -> decimal kg, rounded to 3 decimals (gram precision)
export const partsToDecimalKg = (kg, g) => {
  const k = Number(kg) || 0;
  let gr  = Number(g) || 0;
  if (gr > 999) gr = 999; // grams can't reach 1000, that would be +1kg
  if (gr < 0)   gr = 0;
  return Math.round((k * 1000 + gr)) / 1000;
};

// decimal kg -> "12kg 600g" / "12kg" / "600g" / "0kg" for display everywhere
export const formatWeightKgG = (dec) => {
  const { kg, g } = decimalKgToParts(dec);
  if (!kg && !g) return "0kg";
  if (!g) return `${kg}kg`;
  if (!kg) return `${g}g`;
  return `${kg}kg ${g}g`;
};

// Shop Profile helpers
export const SHOP_PROFILE_KEY = "steelpos_shop_profile";
export const defaultShopProfile = () => ({
  shopName: "", shopNameUr: "", address: "", addressUr: "", logoBase64: "",
  owners: [{ name: "", nameUr: "", phone: "" }],
});
export const loadShopProfile = () => {
  try { const s = localStorage.getItem(SHOP_PROFILE_KEY); return s ? JSON.parse(s) : defaultShopProfile(); }
  catch { return defaultShopProfile(); }
};
export const saveShopProfile = (p) => localStorage.setItem(SHOP_PROFILE_KEY, JSON.stringify(p));
