import { CombinedSaleInvoice, CombinedThermalInvoice } from "../components/InvoiceComponents";
import { useState, useMemo, useEffect } from "react";
import { useTheme } from "../context/ThemeContext";
import { useLang } from "../context/LangContext";
import { useResponsive, Icon, ICONS, Modal, Table } from "../components/shared";
import { formatPKR, formatDateTime, printThermalOrA4, downloadInvoicePdf, sharePdfOnWhatsApp, loadShopProfile, inDateFilter } from "../utils/helpers";
import { safeProductName } from "../utils/constants";
import InventoryStockTable, { inventoryStats } from "../components/InventoryStockTable";

function groupByInvoice(list) {
  const map = new Map();
  (list || []).forEach((rec) => {
    const key = `${rec.invoice || rec.invoiceNum || rec._id}|${rec.date || ""}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(rec);
  });
  return [...map.values()]
    .map((items) => {
      const stamp = items.reduce((m, r) => {
        const s = String(r.createdAt || r.date || "");
        return s > m ? s : m;
      }, "");
      const ordered = items.slice().sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
      return { items: ordered, head: ordered[0], stamp };
    })
    .sort((a, b) => String(b.stamp).localeCompare(String(a.stamp)));
}

function saleItemLines(group) {
  const lines = [];
  (group.items || []).forEach((s) => {
    if (Array.isArray(s.items) && s.items.length) {
      s.items.forEach((it) => {
        lines.push({
          name: it.productName || "—",
          extra: it.rows?.[0]?.desc || it.category || "",
          amount: Number(it.subtotal) || (it.rows || []).reduce((a, r) => a + (Number(r.amount) || 0), 0) || 0,
        });
      });
    } else {
      lines.push({
        name: s.productName || safeProductName(s.product) || "—",
        extra: s.category || "",
        amount: Number(s.total) || 0,
      });
    }
  });
  return lines;
}

function purchaseItemLines(group) {
  return (group.items || []).map((p) => ({
    name: p.productName || safeProductName(p.product) || "—",
    extra: p.category || "",
    qty: p.qty,
    cost: Number(p.rate) || Number(p.productPrice) || 0,
    amount: Number(p.total) || 0,
  }));
}

function DateTimeLine({ date, createdAt, locale, th, dateColor }) {
  const full = formatDateTime(date, createdAt, locale);
  const parts = String(full).split(" · ");
  const day = parts[0] || date || "—";
  const time = parts[1] || "";
  return (
    <span style={{ fontSize: 12, color: th.textDim, whiteSpace: "nowrap" }}>
      <span style={{ color: dateColor || th.textMuted, fontWeight: 600 }}>{day}</span>
      {time ? <> · {time}</> : null}
    </span>
  );
}

function findProduct(products, id, name) {
  const wantId = typeof id === "object" && id ? String(id._id || id.id || "") : String(id || "");
  const wantName = String(name || "").trim().toLowerCase();
  return (products || []).find((p) =>
    (wantId && String(p._id) === wantId) ||
    (wantName && String(p.name || "").trim().toLowerCase() === wantName)
  );
}

function resolveCategory(rec, prod) {
  const type = String(rec?.category || prod?.category || "").trim();
  const hw = rec?.hwCategory || prod?.hwCategory || rec?.subType || prod?.subType
    || rec?.subCategory || prod?.subCategory || "";
  const isHw = /^hardware$/i.test(type);
  const v = isHw ? (hw || type) : (type || hw);
  return String(v).trim() || "—";
}

function flattenPurchases(list, products) {
  return (list || []).map((p) => {
    const name = p.productName || (typeof p.product === "object" ? p.product?.name : "") || "—";
    const prod = findProduct(products, p.productId || p.product, name);
    return {
      date: p.date || "",
      invoice: p.invoice || p.invoiceNum || "—",
      supplier: p.supplier || p.supplierName || "—",
      name,
      category: resolveCategory(p, prod),
      qty: Number(p.qty) || 0,
      amount: Number(p.total) || Number(p.grandTotal) || Number(p.totalAmount) || 0,
    };
  });
}

function flattenSales(list, products) {
  const lines = [];
  (list || []).forEach((s) => {
    const invoice = s.invoice || s.invoiceNum || "—";
    const date = s.date || "";
    const customer = s.customer || "—";
    if (Array.isArray(s.items) && s.items.length) {
      s.items.forEach((it) => {
        const name = it.productName || "—";
        const prod = findProduct(products, it.productId || it.product, name);
        const category = resolveCategory({ ...it, category: it.category || s.category }, prod);
        const saleAmt = Number(it.subtotal) || (it.rows || []).reduce((a, r) => a + (Number(r.amount) || 0), 0) || 0;
        let qty = Number(it.qty) || 0;
        if (!qty && it.rows?.[0]?.desc) {
          const m = String(it.rows[0].desc).match(/^(\d+\.?\d*)/);
          if (m) qty = parseFloat(m[1]) || 0;
        }
        let costAmt = Number(it.costTotal) || 0;
        if (costAmt <= 0) {
          costAmt = (Number(prod?.purchasePrice) || 0) * (qty || 1);
        }
        lines.push({ date, invoice, customer, name, category, qty, saleAmt, costAmt, profit: saleAmt - costAmt });
      });
    } else {
      const name = s.productName || (typeof s.product === "object" ? s.product?.name : "") || "—";
      const saleAmt = Number(s.total) || Number(s.grandTotal) || 0;
      const qty = Number(s.qty) || 0;
      const prod = findProduct(products, s.product, name);
      const costAmt = Number(s.costTotal) || (Number(s.purchasePrice) || Number(prod?.purchasePrice) || 0) * (qty || 1);
      lines.push({ date, invoice, customer, name, category: resolveCategory(s, prod), qty, saleAmt, costAmt, profit: saleAmt - costAmt });
    }
  });
  return lines;
}

function groupByKey(rows, keyFn) {
  const map = new Map();
  rows.forEach((r) => {
    const k = String(keyFn(r) || "—").trim() || "—";
    if (!map.has(k)) map.set(k, { key: k, count: 0, qty: 0, amount: 0, saleAmt: 0, costAmt: 0, profit: 0, invoiceSet: new Set() });
    const g = map.get(k);
    g.count += 1;
    g.qty += Number(r.qty) || 0;
    g.amount += Number(r.amount) || 0;
    g.saleAmt += Number(r.saleAmt) || 0;
    g.costAmt += Number(r.costAmt) || 0;
    g.profit += Number(r.profit) || 0;
    if (r.invoice) g.invoiceSet.add(String(r.invoice));
  });
  return [...map.values()].map((g) => ({
    key: g.key,
    count: g.count,
    qty: g.qty,
    amount: g.amount,
    saleAmt: g.saleAmt,
    costAmt: g.costAmt,
    profit: g.profit,
    invoices: g.invoiceSet.size,
  })).sort((a, b) => (b.saleAmt || b.amount) - (a.saleAmt || a.amount));
}

function periodName(period, isUrdu, customFrom = "", customTo = "") {
  if (period === "today") return isUrdu ? "آج" : "Today";
  if (period === "yesterday") return isUrdu ? "کل" : "Yesterday";
  if (period === "week") return isUrdu ? "ہفتہ" : "This Week";
  if (period === "month") return isUrdu ? "مہینہ" : "This Month";
  if (period === "custom") {
    if (customFrom || customTo) return `${customFrom || "…"} → ${customTo || "…"}`;
    return isUrdu ? "تاریخ" : "Custom dates";
  }
  return isUrdu ? "سب" : "All Time";
}

function reportGroups(isUrdu) {
  return [
    {
      title: isUrdu ? "خریداری" : "Purchases",
      color: "#f59e0b",
      items: [
        { id: "pur-overall", label: isUrdu ? "کل خریداری رپورٹ" : "Overall purchases report" },
        { id: "pur-item", label: isUrdu ? "آئٹم وار خریداری" : "Item wise purchases report" },
        { id: "pur-cat", label: isUrdu ? "کیٹیگری وار خریداری" : "Category wise purchases report" },
        { id: "pur-sup", label: isUrdu ? "سپلائر وار خریداری" : "Supplier wise purchases report" },
      ],
    },
    {
      title: isUrdu ? "فروخت" : "Sales",
      color: "#10b981",
      items: [
        { id: "sale-overall", label: isUrdu ? "کل فروخت رپورٹ" : "Overall sales report" },
        { id: "sale-item", label: isUrdu ? "آئٹم وار فروخت و منافع" : "Item wise sales and profit" },
        { id: "sale-cat", label: isUrdu ? "کیٹیگری وار فروخت و منافع" : "Category wise sales report" },
        { id: "sale-cust", label: isUrdu ? "گاہک وار فروخت رپورٹ" : "Customer wise sales report" },
        { id: "sale-pl", label: isUrdu ? "کل منافع / نقصان" : "Overall profit / loss report" },
      ],
    },
    {
      title: isUrdu ? "اخراجات" : "Expenses",
      color: "#ef4444",
      items: [
        { id: "exp-overall", label: isUrdu ? "کل اخراجات رپورٹ" : "Overall expenses report" },
      ],
    },
  ];
}

function exportActionLabel(mode, isUrdu) {
  if (mode === "a4") return isUrdu ? "A4 پرنٹ" : "A4 Print";
  if (mode === "thermal") return isUrdu ? "تھرمل پرنٹ" : "Thermal Print";
  if (mode === "pdf") return "PDF";
  if (mode === "whatsapp") return isUrdu ? "WhatsApp PDF" : "WhatsApp PDF";
  return mode || "—";
}

function analyticsReportPack(reportKey, isUrdu, d) {
  const empty = isUrdu ? "اس مدت میں ریکارڈ نہیں" : "No records in this period";
  const purLines = d.purLines || [];
  const saleLines = d.saleLines || [];
  const purItem = d.purItem || [];
  const purCat = d.purCat || [];
  const purSup = d.purSup || [];
  const saleItem = d.saleItem || [];
  const saleCat = d.saleCat || [];
  const saleCust = d.saleCust || [];
  const expenses = d.modalFilteredExpenses || [];
  const saleProfitTotal = d.saleProfitTotal || 0;
  const saleCostTotal = d.saleCostTotal || 0;
  const expAmt = d.totalExpenses || 0;
  const purAmt = purLines.reduce((s, r) => s + r.amount, 0);
  const saleAmt = saleLines.reduce((s, r) => s + r.saleAmt, 0);
  const netPl = saleProfitTotal - expAmt;
  const titles = {
    "pur-overall": isUrdu ? "کل خریداری رپورٹ" : "Overall purchases report",
    "pur-item": isUrdu ? "آئٹم وار خریداری" : "Item wise purchases report",
    "pur-cat": isUrdu ? "کیٹیگری وار خریداری" : "Category wise purchases report",
    "pur-sup": isUrdu ? "سپلائر وار خریداری" : "Supplier wise purchases report",
    "sale-overall": isUrdu ? "کل فروخت رپورٹ" : "Overall sales report",
    "sale-item": isUrdu ? "آئٹم وار فروخت و منافع" : "Item wise sales and profit",
    "sale-cat": isUrdu ? "کیٹیگری وار فروخت رپورٹ" : "Category wise sales report",
    "sale-cust": isUrdu ? "گاہک وار فروخت رپورٹ" : "Customer wise sales report",
    "sale-pl": isUrdu ? "کل منافع / نقصان" : "Overall profit / loss report",
    "exp-overall": isUrdu ? "کل اخراجات رپورٹ" : "Overall expenses report",
  };
  let cols = [];
  let rows = [];
  let footer = null;
  let extra = null;
  if (reportKey === "pur-overall") {
    cols = [isUrdu ? "تاریخ" : "Date", isUrdu ? "انوائس" : "Invoice", isUrdu ? "سپلائر" : "Supplier", isUrdu ? "آئٹم" : "Item", isUrdu ? "قسم" : "Category", isUrdu ? "رقم" : "Amount"];
    rows = purLines.map((r) => [r.date || "—", r.invoice, r.supplier, r.name, r.category, formatPKR(r.amount)]);
    footer = purLines.length ? [isUrdu ? "کل" : "Total", "", "", "", `${purLines.length}`, formatPKR(purAmt)] : null;
  } else if (reportKey === "pur-item") {
    cols = [isUrdu ? "آئٹم" : "Item", isUrdu ? "تعداد" : "Qty", isUrdu ? "انٹریز" : "Entries", isUrdu ? "رقم" : "Amount"];
    rows = purItem.map((g) => [g.key, g.qty, g.count, formatPKR(g.amount)]);
    footer = purItem.length ? [isUrdu ? "کل" : "Total", "", "", formatPKR(purAmt)] : null;
  } else if (reportKey === "pur-cat") {
    cols = [isUrdu ? "کیٹیگری" : "Category", isUrdu ? "تعداد" : "Qty", isUrdu ? "انٹریز" : "Entries", isUrdu ? "رقم" : "Amount"];
    rows = purCat.map((g) => [g.key, g.qty, g.count, formatPKR(g.amount)]);
    footer = purCat.length ? [isUrdu ? "کل" : "Total", "", "", formatPKR(purAmt)] : null;
  } else if (reportKey === "pur-sup") {
    cols = [isUrdu ? "سپلائر" : "Supplier", isUrdu ? "انٹریز" : "Entries", isUrdu ? "رقم" : "Amount"];
    rows = purSup.map((g) => [g.key, g.count, formatPKR(g.amount)]);
    footer = purSup.length ? [isUrdu ? "کل" : "Total", "", formatPKR(purAmt)] : null;
  } else if (reportKey === "sale-overall") {
    cols = [isUrdu ? "تاریخ" : "Date", isUrdu ? "انوائس" : "Invoice", isUrdu ? "گاہک" : "Customer", isUrdu ? "آئٹم" : "Item", isUrdu ? "فروخت" : "Sale", isUrdu ? "منافع" : "Profit"];
    rows = saleLines.map((r) => [r.date || "—", r.invoice, r.customer, r.name, formatPKR(r.saleAmt), formatPKR(r.profit)]);
    footer = saleLines.length ? [isUrdu ? "کل" : "Total", "", "", `${saleLines.length}`, formatPKR(saleAmt), formatPKR(saleProfitTotal)] : null;
  } else if (reportKey === "sale-item") {
    cols = [isUrdu ? "آئٹم" : "Item", isUrdu ? "فروخت" : "Sales", isUrdu ? "لاگت" : "Cost", isUrdu ? "منافع" : "Profit"];
    rows = saleItem.map((g) => [g.key, formatPKR(g.saleAmt), formatPKR(g.costAmt), formatPKR(g.profit)]);
    footer = saleItem.length ? [isUrdu ? "کل" : "Total", formatPKR(saleAmt), formatPKR(saleCostTotal), formatPKR(saleProfitTotal)] : null;
  } else if (reportKey === "sale-cat") {
    cols = [isUrdu ? "کیٹیگری" : "Category", isUrdu ? "تعداد" : "Qty", isUrdu ? "فروخت" : "Sales", isUrdu ? "لاگت" : "Cost", isUrdu ? "منافع" : "Profit"];
    rows = saleCat.map((g) => [g.key, g.qty, formatPKR(g.saleAmt), formatPKR(g.costAmt), formatPKR(g.profit)]);
    footer = saleCat.length ? [isUrdu ? "کل" : "Total", "", formatPKR(saleAmt), formatPKR(saleCostTotal), formatPKR(saleProfitTotal)] : null;
  } else if (reportKey === "sale-cust") {
    cols = [isUrdu ? "گاہک" : "Customer", isUrdu ? "انوائس" : "Invoices", isUrdu ? "فروخت" : "Sales", isUrdu ? "لاگت" : "Cost", isUrdu ? "منافع" : "Profit"];
    rows = saleCust.map((g) => [g.key, g.invoices || g.count, formatPKR(g.saleAmt), formatPKR(g.costAmt), formatPKR(g.profit)]);
    footer = saleCust.length ? [isUrdu ? "کل" : "Total", "", formatPKR(saleAmt), formatPKR(saleCostTotal), formatPKR(saleProfitTotal)] : null;
  } else if (reportKey === "sale-pl") {
    cols = [isUrdu ? "تفصیل" : "Particulars", isUrdu ? "رقم" : "Amount"];
    rows = [
      [isUrdu ? "کل فروخت" : "Total sales", formatPKR(saleAmt)],
      [isUrdu ? "کل لاگت" : "Total cost", formatPKR(saleCostTotal)],
      [isUrdu ? "گراس منافع" : "Gross profit", formatPKR(saleProfitTotal)],
      [isUrdu ? "کل اخراجات" : "Total expenses", formatPKR(expAmt)],
      [netPl >= 0 ? (isUrdu ? "خالص منافع" : "Net profit") : (isUrdu ? "خالص نقصان" : "Net loss"), formatPKR(Math.abs(netPl))],
    ];
  } else if (reportKey === "exp-overall") {
    cols = [isUrdu ? "تاریخ" : "Date", isUrdu ? "قسم" : "Type", isUrdu ? "بینک / والٹ" : "Bank / Wallet", isUrdu ? "نوٹ" : "Note", isUrdu ? "رقم" : "Amount"];
    rows = expenses.map((e) => [e.date || "—", e.type || "—", e.accountName || "—", e.note || "—", formatPKR(e.amount)]);
    footer = expenses.length ? [isUrdu ? "کل" : "Total", "", "", `${expenses.length}`, formatPKR(expAmt)] : null;
    const expByType = groupByKey(expenses.map((e) => ({ key: e.type || "—", amount: Number(e.amount) || 0 })), (r) => r.key);
    extra = expByType.length ? {
      title: isUrdu ? "قسم کے حساب سے" : "By type",
      cols: [isUrdu ? "قسم" : "Type", isUrdu ? "انٹریز" : "Entries", isUrdu ? "رقم" : "Amount"],
      rows: expByType.map((g) => [g.key, g.count, formatPKR(g.amount)]),
    } : null;
  }
  return { title: titles[reportKey] || "", cols, rows, footer, extra, empty, purAmt, saleAmt, expAmt, netPl, saleProfitTotal, saleCostTotal };
}

function AnalyticsPrintSheet({ shop, periodLabel, actionLabel, packs = [], summary, isUrdu }) {
  const page = {
    width: "65mm",
    maxWidth: "65mm",
    fontFamily: "'Courier New', Courier, monospace",
    fontSize: "11px",
    color: "#000",
    background: "#fff",
    padding: "4px",
    boxSizing: "border-box",
  };
  const line = { borderTop: "1px dashed #000", margin: "6px 0" };
  const thS = { textAlign: "left", fontSize: "9px", fontWeight: 900, borderBottom: "1px solid #000", padding: "2px 2px" };
  const tdS = { fontSize: "9px", fontWeight: 700, padding: "2px 2px", borderBottom: "1px dotted #000", verticalAlign: "top" };
  const names = packs.map((p) => p.title).filter(Boolean);
  const PrintTable = ({ pack }) => (
    pack.rows.length === 0 ? (
      <div style={{ textAlign: "center" }}>{pack.empty}</div>
    ) : (
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>{pack.cols.map((c) => <th key={c} style={thS}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {pack.rows.map((cells, i) => (
            <tr key={i}>{cells.map((cell, j) => <td key={j} style={tdS}>{cell}</td>)}</tr>
          ))}
        </tbody>
        {pack.footer ? (
          <tfoot>
            <tr>{pack.footer.map((cell, i) => <td key={i} style={{ ...tdS, fontWeight: 900, borderBottom: "none" }}>{cell}</td>)}</tr>
          </tfoot>
        ) : null}
      </table>
    )
  );
  return (
    <div id="thermal-invoice" style={page}>
      <div style={{ textAlign: "center", fontWeight: 900, fontSize: "14px" }}>{shop?.shopName || "STEELPOS"}</div>
      <div style={{ textAlign: "center", fontWeight: 900, fontSize: "12px", marginTop: 2 }}>
        {isUrdu ? "رپورٹ" : "REPORT"}
      </div>
      <div style={line} />
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span>{isUrdu ? "مدت" : "Period"}</span><span style={{ fontWeight: 900 }}>{periodLabel}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span>{isUrdu ? "بٹن" : "Action"}</span><span style={{ fontWeight: 900 }}>{actionLabel || "—"}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span>{isUrdu ? "فلٹرز" : "Filters"}</span><span style={{ fontWeight: 900 }}>{names.length}</span>
      </div>
      {names.map((n, i) => (
        <div key={i} style={{ fontSize: "9px" }}>{i + 1}. {n}</div>
      ))}
      <div style={line} />
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span>{isUrdu ? "فروخت" : "Sales"}</span><span>{formatPKR(summary.sales)}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span>{isUrdu ? "خریداری" : "Purchases"}</span><span>{formatPKR(summary.purchases)}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span>{isUrdu ? "اخراجات" : "Expenses"}</span><span>{formatPKR(summary.expenses)}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 900 }}>
        <span>{isUrdu ? "منافع" : "Profit"}</span><span>{formatPKR(summary.profit)}</span>
      </div>
      {packs.map((pack, idx) => (
        <div key={pack.title || idx}>
          <div style={line} />
          <div style={{ fontWeight: 900, textAlign: "center", marginBottom: 4 }}>{pack.title}</div>
          <PrintTable pack={pack} />
          {pack.extra && pack.extra.rows?.length > 0 && (
            <>
              <div style={{ fontWeight: 900, margin: "6px 0 4px" }}>{pack.extra.title}</div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>{pack.extra.cols.map((c) => <th key={c} style={thS}>{c}</th>)}</tr>
                </thead>
                <tbody>
                  {pack.extra.rows.map((cells, i) => (
                    <tr key={i}>{cells.map((cell, j) => <td key={j} style={tdS}>{cell}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      ))}
      <div style={line} />
      <div style={{ textAlign: "center", fontSize: "9px" }}>okiiee Software</div>
    </div>
  );
}

function ReportTable({ cols, rows, empty, th, footer, hideFooter }) {
  if (!rows.length) {
    return (
      <div style={{ padding: 18, textAlign: "center", color: th.textDim, border: `1px dashed ${th.border}`, borderRadius: 12, fontSize: 13 }}>
        {empty}
      </div>
    );
  }
  const headBg = th.bgModal || th.bgCard || (th.dark ? "#111827" : "#fff");
  const thS = { textAlign: "left", padding: "8px 10px", fontSize: 11, fontWeight: 800, color: th.textMuted, letterSpacing: "0.04em", textTransform: "uppercase", borderBottom: `1px solid ${th.border}`, whiteSpace: "nowrap", position: "sticky", top: 0, background: headBg, zIndex: 1 };
  const tdS = { padding: "8px 10px", borderBottom: `1px solid ${th.border}`, fontSize: 13, color: th.text };
  const showFoot = footer && !hideFooter;
  return (
    <div style={{ overflow: "auto", maxHeight: showFoot ? 360 : 420, border: `1px solid ${th.border}`, borderRadius: 12 }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {cols.map((c) => <th key={c} style={thS}>{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i}>
              {cells.map((cell, j) => <td key={j} style={tdS}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
        {showFoot ? (
          <tfoot>
            <tr>
              {footer.map((cell, i) => (
                <td key={i} style={{
                  ...tdS,
                  borderBottom: "none",
                  borderTop: `2px solid ${th.border}`,
                  fontWeight: 800,
                  position: "sticky",
                  bottom: 0,
                  background: headBg,
                  boxShadow: th.dark ? "0 -8px 16px rgba(0,0,0,0.35)" : "0 -8px 16px rgba(0,0,0,0.08)",
                }}>{cell}</td>
              ))}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

function ReportTotalsBar({ packs, th, isUrdu }) {
  const list = (packs || []).filter((p) => p.footer && p.footer.length);
  if (!list.length) return null;
  const bg = th.bgModal || th.bgCard || (th.dark ? "#111827" : "#fff");
  return (
    <div style={{
      flexShrink: 0,
      marginTop: 10,
      padding: "10px 14px",
      border: `1px solid ${th.border}`,
      borderRadius: 12,
      background: bg,
      boxShadow: th.dark ? "0 -10px 24px rgba(0,0,0,0.4)" : "0 -10px 24px rgba(0,0,0,0.08)",
    }}>
      {list.map((pack, idx) => (
        <div key={pack.title || idx} style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          padding: list.length > 1 ? "7px 0" : 0,
          borderTop: idx ? `1px solid ${th.border}` : "none",
        }}>
          <span style={{ fontWeight: 800, fontSize: 13, color: th.text }}>
            {pack.title} — {pack.footer[0] || (isUrdu ? "کل" : "Total")}
          </span>
          <span style={{ display: "flex", gap: 14, flexWrap: "wrap", fontWeight: 800, fontSize: 13, color: th.text, fontVariantNumeric: "tabular-nums" }}>
            {pack.footer.slice(1).filter((c) => String(c || "").trim() !== "").map((c, i) => (
              <span key={i}>{c}</span>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// DAILY ANALYTICS MODAL - Comprehensive daily report
// ═══════════════════════════════════════════════════════════════════════════
function DailyAnalyticsModal({ 
  isUrdu, 
  th, 
  onClose, 
  parties = [],
  expenses = [],
  sales = [],
  purchases = [],
  products = [],
  initialFilter = "today",
  initialFrom = "",
  initialTo = "",
}) {
  const [reportFilter, setReportFilter] = useState(initialFilter || "today");
  const [customFrom, setCustomFrom] = useState(initialFrom || "");
  const [customTo, setCustomTo] = useState(initialTo || "");
  const [reportKeys, setReportKeys] = useState([]);
  const [multiOn, setMultiOn] = useState(false);
  const [exportAction, setExportAction] = useState("");
  const [pendingExport, setPendingExport] = useState(null);

  const dateInp = {
    background: th.input,
    border: reportFilter === "custom" ? "2px solid #6366f1" : `1px solid ${th.inputBorder || th.border}`,
    borderRadius: 8,
    color: th.text,
    padding: "5px 8px",
    fontSize: 13,
    outline: "none",
  };

  const inRange = (rec) => inDateFilter(rec?.date, reportFilter, customFrom, customTo, rec?.createdAt);

  const modalFilteredSales = (sales || []).filter(inRange);
  const modalFilteredPurchases = (purchases || []).filter(inRange);
  const modalFilteredExpenses = (expenses || []).filter(inRange);

  // Recalculate totals based on filtered data
  const modalTotalSales = modalFilteredSales.reduce((s, p) => s + (Number(p.total) || Number(p.grandTotal) || 0), 0);
  const modalTotalPurchases = modalFilteredPurchases.reduce((s, p) => s + (Number(p.total) || Number(p.grandTotal) || 0), 0);
  
  // Recalculate profit for filtered period
  const calcProfit = () => {
    let totalSaleAmt = 0;
    let totalCostAmt = 0;
    modalFilteredSales.forEach(sale => {
      if (sale.items && sale.items.length > 0) {
        sale.items.forEach(item => {
          if (item.costTotal !== undefined && item.costTotal !== null && Number(item.costTotal) > 0) {
            totalSaleAmt += Number(item.subtotal) || 0;
            totalCostAmt += Number(item.costTotal) || 0;
          }
        });
      }
    });
    return totalSaleAmt - totalCostAmt;
  };
  const modalProfit = calcProfit();
  const modalHasCost = modalFilteredSales.some(s => s.items?.some(i => i.costTotal > 0))
    || flattenSales(modalFilteredSales, products).some((l) => l.costAmt > 0);

  const purLines = flattenPurchases(modalFilteredPurchases, products);
  const saleLines = flattenSales(modalFilteredSales, products);
  const purItem = groupByKey(purLines, (r) => r.name);
  const purCat = groupByKey(purLines, (r) => r.category);
  const purSup = groupByKey(purLines, (r) => r.supplier);
  const saleItem = groupByKey(saleLines, (r) => r.name);
  const saleCat = groupByKey(saleLines, (r) => r.category);
  const saleCust = groupByKey(saleLines, (r) => r.customer);
  const saleProfitTotal = saleLines.reduce((s, r) => s + (Number(r.profit) || 0), 0);
  const saleCostTotal = saleLines.reduce((s, r) => s + (Number(r.costAmt) || 0), 0);

  const filterLabel = () => periodName(reportFilter, isUrdu, customFrom, customTo); 
  const L = isUrdu ? {
    title: "📊 روزانہ تجزیہ",
    sales: "آج کی فروخت",
    purchases: "آج کی خریداری",
    payable: "کل ادائیگی (سپلائر)",
    receivable: "کل وصولی (گاہک)",
    expenses: "کل اخراجات",
    profit: "کل منافع",
    netProfit: "خالص رقم",
    netLoss: "خالص نقصان",
    remaining: "باقی رقم",
    count: "تعداد",
    amount: "رقم",
  } : {
    title: "📊 Daily Analytics",
    sales: "Total Sales",
    purchases: "Total Purchases",
    payable: "Total Payable (to suppliers)",
    receivable: "Total Receivable (from customers)",
    expenses: "Total Expenses",
    profit: "Total Profit",
    netProfit: "Net Profit",
    netLoss: "Net Loss",
    remaining: "Net Amount",
    count: "Count",
    amount: "Amount",
  };

  // Calculate totals from parties (payable/receivable)
  const totalPayable = useMemo(() => {
    return (parties || []).reduce((s, p) => {
      const bal = Number(p.balance) || 0;
      return s + (Number(p.payable) || Math.max(0, -bal));
    }, 0);
  }, [parties]);

  const totalReceivable = useMemo(() => {
    return (parties || []).reduce((s, p) => {
      const bal = Number(p.balance) || 0;
      return s + (Number(p.receivable) || Math.max(0, bal));
    }, 0);
  }, [parties]);

  // Calculate total expenses from FILTERED expenses
  const totalExpenses = useMemo(() => {
    return modalFilteredExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  }, [modalFilteredExpenses]);

  const packData = {
    purLines, saleLines, purItem, purCat, purSup, saleItem, saleCat, saleCust,
    modalFilteredExpenses, saleProfitTotal, saleCostTotal, totalExpenses,
  };
  const selectedKeys = reportKeys;
  const reportPacks = selectedKeys.map((k) => analyticsReportPack(k, isUrdu, packData));
  const shop = loadShopProfile();

  const toggleReport = (id) => {
    if (!multiOn) {
      setReportKeys((ks) => (ks.includes(id) ? [] : [id]));
      return;
    }
    setReportKeys((ks) => {
      if (ks.includes(id)) return ks.filter((k) => k !== id);
      return [...ks, id];
    });
  };

  const runExport = (mode) => {
    setExportAction(mode);
    setPendingExport(mode);
  };

  useEffect(() => {
    if (!pendingExport) return;
    const mode = pendingExport;
    const t = setTimeout(async () => {
      const label = periodName(reportFilter, isUrdu, customFrom, customTo);
      const names = reportPacks.map((p) => p.title).join(", ");
      const file = `report-${reportFilter}-${selectedKeys.join("-") || "analytics"}`;
      const text = `${shop?.shopName || "STEELPOS"} — ${label} — ${exportActionLabel(mode, isUrdu)}\n${names}`;
      try {
        if (mode === "a4") printThermalOrA4("a4");
        else if (mode === "thermal") printThermalOrA4("thermal");
        else if (mode === "pdf") await downloadInvoicePdf(file);
        else if (mode === "whatsapp") await sharePdfOnWhatsApp({ filename: file, text });
      } finally {
        setPendingExport(null);
      }
    }, 80);
    return () => clearTimeout(t);
  }, [pendingExport]);

  // Net calculation: profit - expenses
  const netAmount = modalHasCost ? modalProfit - totalExpenses : 0;
  const isNetLoss = netAmount < 0;

  const cardStyle = {
    padding: "16px 18px",
    borderRadius: 12,
    border: `1px solid ${th.border}`,
    background: th.bgCard,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  };

  const MetricCard = ({ label, amount, count, color = "#64748b", highlight = false }) => (
    <div style={{
      ...cardStyle,
      borderLeft: `4px solid ${color}`,
      background: highlight 
        ? (th.dark ? `${color}15` : `linear-gradient(135deg, ${color}08 0%, ${th.bgCard} 60%)`)
        : th.bgCard,
    }}>
      <div style={{
        color: th.textMuted,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
      }}>
        {label}
      </div>
      <div style={{
        color: highlight ? color : th.text,
        fontSize: highlight ? 24 : 20,
        fontWeight: highlight ? 900 : 800,
      }}>
        {formatPKR(amount)}
      </div>
      {count !== undefined && (
        <div style={{ color: th.textDim, fontSize: 12 }}>
          {count} {L.count}
        </div>
      )}
    </div>
  );

  const hdrBtn = (mode, label, color) => (
    <button
      key={mode}
      type="button"
      onClick={() => runExport(mode)}
      style={{
        padding: "5px 9px",
        borderRadius: 8,
        border: "none",
        cursor: "pointer",
        background: color,
        color: "#fff",
        fontWeight: 800,
        fontSize: 11,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );

  return (
    <Modal
      title={isUrdu ? `📊 رپورٹ - ${filterLabel()}` : `📊 Report - ${filterLabel()}`}
      onClose={onClose}
      xl
      headerRight={
        <>
          {hdrBtn("a4", isUrdu ? "A4 پرنٹ" : "A4 Print", "#2563eb")}
          {hdrBtn("thermal", isUrdu ? "تھرمل" : "Thermal", "#0f766e")}
          {hdrBtn("pdf", "PDF", "#7c3aed")}
          {hdrBtn("whatsapp", "WhatsApp", "#16a34a")}
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", maxHeight: "75vh", minHeight: 0 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, flex: 1, minHeight: 0, overflowY: "auto" }}>
        
        {/* Date Filter Buttons */}
        <div style={{
          display: "flex",
          gap: 8,
          padding: "12px 16px",
          background: th.dark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
          borderRadius: 12,
          border: `1px solid ${th.border}`,
          flexWrap: "wrap",
          alignItems: "center",
        }}>
          <span style={{ color: th.textMuted, fontSize: 13, fontWeight: 600, marginRight: 8 }}>
            {isUrdu ? "مدت:" : "Period:"}
          </span>
          {["today", "yesterday", "week", "month", "all"].map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setReportFilter(f)}
              style={{
                padding: "6px 14px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                border: reportFilter === f ? "2px solid #6366f1" : `1px solid ${th.border}`,
                background: reportFilter === f ? "rgba(99,102,241,0.15)" : "transparent",
                color: reportFilter === f ? "#6366f1" : th.textMuted,
                transition: "all 0.2s",
              }}
            >
              {f === "today" ? (isUrdu ? "آج" : "Today") :
               f === "yesterday" ? (isUrdu ? "کل" : "Yesterday") :
               f === "week" ? (isUrdu ? "ہفتہ" : "Week") :
               f === "month" ? (isUrdu ? "مہینہ" : "Month") :
               (isUrdu ? "سب" : "All")}
            </button>
          ))}
          <span style={{ width: 1, height: 22, background: th.border, margin: "0 4px" }} />
          <label style={{ color: th.textMuted, fontSize: 12, fontWeight: 700 }}>
            {isUrdu ? "سے" : "From"}
          </label>
          <input
            type="date"
            value={customFrom}
            onChange={(e) => {
              setCustomFrom(e.target.value);
              setReportFilter("custom");
            }}
            style={dateInp}
          />
          <label style={{ color: th.textMuted, fontSize: 12, fontWeight: 700 }}>
            {isUrdu ? "تک" : "To"}
          </label>
          <input
            type="date"
            value={customTo}
            onChange={(e) => {
              setCustomTo(e.target.value);
              setReportFilter("custom");
            }}
            style={dateInp}
          />
        </div>

        {/* Revenue & Costs Section */}
        <div>
          <h4 style={{ 
            color: th.textMuted, 
            fontSize: 12, 
            fontWeight: 700, 
            letterSpacing: "0.08em", 
            textTransform: "uppercase", 
            margin: "0 0 12px 0" 
          }}>
            {isUrdu ? "📈 آمدنی و اخراج" : "📈 Revenue & Costs"}
          </h4>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            <MetricCard label={L.sales} amount={modalTotalSales} count={modalFilteredSales.length} color="#10b981" />
            <MetricCard label={L.purchases} amount={modalTotalPurchases} count={modalFilteredPurchases.length} color="#f59e0b" />
            {modalHasCost && (
              <MetricCard label={L.profit} amount={modalProfit} color={modalProfit >= 0 ? "#2dd4bf" : "#ef4444"} />
            )}
            <MetricCard label={L.expenses} amount={totalExpenses} count={modalFilteredExpenses.length} color="#ef4444" />
          </div>
        </div>

        {/* Ledger Section */}
        <div>
          <h4 style={{ 
            color: th.textMuted, 
            fontSize: 12, 
            fontWeight: 700, 
            letterSpacing: "0.08em", 
            textTransform: "uppercase", 
            margin: "0 0 12px 0" 
          }}>
            {isUrdu ? "📒 کھاتہ" : "📒 Ledger"}
          </h4>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            <MetricCard label={L.receivable} amount={totalReceivable} color="#3b82f6" />
            <MetricCard label={L.payable} amount={totalPayable} color="#f97316" />
          </div>
        </div>

        {/* Net Amount - Highlighted */}
        {modalHasCost && (
          <div style={{
            ...cardStyle,
            borderLeft: `6px solid ${isNetLoss ? "#ef4444" : "#10b981"}`,
            background: isNetLoss 
              ? (th.dark ? "rgba(239,68,68,0.15)" : "rgba(239,68,68,0.08)")
              : (th.dark ? "rgba(16,185,129,0.15)" : "rgba(16,185,129,0.08)"),
            padding: "20px 24px",
          }}>
            <div style={{
              color: th.textMuted,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}>
              {isNetLoss ? L.netLoss : L.netProfit} ({isUrdu ? "منافع - اخراج" : "Profit - Expenses"})
            </div>
            <div style={{
              color: isNetLoss ? "#ef4444" : "#10b981",
              fontSize: 32,
              fontWeight: 900,
              marginTop: 8,
            }}>
              {isNetLoss ? "-" : "+"}{formatPKR(Math.abs(netAmount))}
            </div>
            <div style={{
              color: th.textDim,
              fontSize: 13,
              marginTop: 8,
            }}>
              {formatPKR(modalProfit)} ({L.profit}) - {formatPKR(totalExpenses)} ({L.expenses})
            </div>
          </div>
        )}

        {!modalHasCost && (
          <div style={{
            padding: "16px 20px",
            background: "rgba(245,158,11,0.08)",
            borderRadius: 12,
            border: `1px solid rgba(245,158,11,0.3)`,
            color: "#f59e0b",
            fontSize: 13,
            textAlign: "center",
          }}>
            {isUrdu ? "💡 نئی billing سے profit track ہونا شروع ہوگا" : "💡 Profit tracking starts with new billing"}
          </div>
        )}

        {(() => {
          const groups = reportGroups(isUrdu);
          const chip = (item) => {
            const on = selectedKeys.includes(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => toggleReport(item.id)}
                style={{
                  padding: "7px 12px",
                  borderRadius: 20,
                  cursor: "pointer",
                  fontWeight: 700,
                  fontSize: 12,
                  textAlign: "left",
                  border: on ? "none" : `1px solid ${th.border}`,
                  background: on ? "#0f766e" : "transparent",
                  color: on ? "#fff" : th.textMuted,
                }}
              >
                {item.label}
              </button>
            );
          };
          return (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, margin: "8px 0 12px 0", flexWrap: "wrap" }}>
                <h4 style={{
                  color: th.textMuted, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em",
                  textTransform: "uppercase", margin: 0,
                }}>
                  {isUrdu ? "رپورٹس" : "Reports"}
                </h4>
                <button
                  type="button"
                  onClick={() => {
                    setMultiOn((v) => {
                      const next = !v;
                      if (!next) setReportKeys((ks) => (ks.length ? [ks[ks.length - 1]] : []));
                      return next;
                    });
                  }}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "5px 8px 5px 12px",
                    borderRadius: 20, cursor: "pointer", fontWeight: 800, fontSize: 12,
                    border: `1px solid ${multiOn ? "#0f766e" : th.border}`,
                    background: multiOn ? "rgba(15,118,110,0.12)" : "transparent",
                    color: multiOn ? "#0f766e" : th.textMuted,
                  }}
                >
                  {isUrdu ? "ملٹی فلٹر" : "Multi filter"}
                  <span style={{
                    width: 36, height: 20, borderRadius: 20, position: "relative",
                    background: multiOn ? "#0f766e" : th.border,
                    display: "inline-block",
                  }}>
                    <span style={{
                      position: "absolute", top: 2, left: multiOn ? 18 : 2,
                      width: 16, height: 16, borderRadius: "50%", background: "#fff",
                    }} />
                  </span>
                </button>
              </div>
              <div style={{ fontSize: 12, color: th.textDim, marginBottom: 10 }}>
                {multiOn
                  ? (isUrdu ? "آن: ایک سے زیادہ رپورٹ منتخب کریں — پرنٹ پر نیچے نیچے آئیں گی" : "ON: pick multiple reports — they print one under another")
                  : (isUrdu ? "آف: صرف ایک رپورٹ" : "OFF: one report at a time")}
              </div>
              {groups.map((g) => (
                <div key={g.title} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: g.color, marginBottom: 8 }}>{g.title}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{g.items.map(chip)}</div>
                </div>
              ))}
              {reportPacks.map((pack) => (
                <div key={pack.title} style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: th.text, margin: "4px 0 8px" }}>{pack.title}</div>
                  <ReportTable th={th} empty={pack.empty} cols={pack.cols} rows={pack.rows} footer={pack.footer} hideFooter />
                  {pack.extra && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: th.textMuted, marginBottom: 8 }}>{pack.extra.title}</div>
                      <ReportTable th={th} empty={pack.empty} cols={pack.extra.cols} rows={pack.extra.rows} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
        })()}
      </div>

        <ReportTotalsBar packs={reportPacks} th={th} isUrdu={isUrdu} />

        <div style={{ position: "fixed", left: -10000, top: 0, width: 280, pointerEvents: "none" }} aria-hidden="true">
          <AnalyticsPrintSheet
            shop={shop}
            periodLabel={periodName(reportFilter, isUrdu, customFrom, customTo)}
            actionLabel={exportActionLabel(exportAction || pendingExport, isUrdu)}
            packs={reportPacks}
            summary={{
              sales: modalTotalSales,
              purchases: modalTotalPurchases,
              expenses: totalExpenses,
              profit: saleProfitTotal,
            }}
            isUrdu={isUrdu}
          />
        </div>
      </div>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD
function Dashboard({ products, purchases, sales, staff, loaders=[], saleReturns=[], purchaseReturns=[], parties=[], expenses=[], loadParties, loadExpenses }) {
  const th = useTheme();
  const { t, lang } = useLang();
  const { isMobile } = useResponsive();
  const isUrdu = lang === "ur";

  const [filter, setFilter] = useState("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [showProfitModal, setShowProfitModal] = useState(false);
  const [showInvPopup, setShowInvPopup] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);

  // Load expenses and parties data when component mounts
  useEffect(() => {
    console.log("Dashboard mounted, loading expenses and parties...");
    console.log("Current expenses:", expenses);
    console.log("Current parties:", parties);
    if (loadExpenses) {
      loadExpenses().then(() => console.log("Expenses loaded"));
    }
    if (loadParties) {
      loadParties().then(() => console.log("Parties loaded"));
    }
  }, []);

  // ─── Two separate modal states ────────────────────────────────────────────────
  const [purchaseModal, setPurchaseModal] = useState(null);
  const [saleModal,     setSaleModal]     = useState(null);
  const [dashDetail,    setDashDetail]    = useState(null);
  const invStats = inventoryStats(products);

  const today = new Date();
  const toDateStr = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  const todayStr2 = toDateStr(today);
  const yesterdayStr = (() => { const d = new Date(today); d.setDate(d.getDate() - 1); return toDateStr(d); })();
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
    if (filter === "yesterday") return d === yesterdayStr;
    if (filter === "week")   return d >= weekStart && d <= todayStr2;
    if (filter === "month")  return d >= monthStart && d <= todayStr2;
    if (filter === "custom") { const from = customFrom || "0000-01-01"; const to = customTo || "9999-12-31"; return d >= from && d <= to; }
    return true;
  };

  const filteredSales     = sales.filter((s) => inRange(s.date));
  const filteredPurchases = purchases.filter((p) => inRange(p.date));
  const saleGroups        = groupByInvoice(filteredSales);
  const purchaseGroups    = groupByInvoice(filteredPurchases);
  const filteredSaleReturns = (saleReturns || []).filter((r) => inRange(r.date));
  const filteredPurchaseReturns = (purchaseReturns || []).filter((r) => inRange(r.date));
  const filteredExpenses = (expenses || []).filter((e) => inRange(e.date));

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
    if (filter==="yesterday") return t.yesterday || "Yesterday";
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

  const printSaleGroup = (g) => {
    const inv = g.head.invoice || g.head.invoiceNum || "INV";
    const data = salesToInvoiceData(g.items, inv, g.head.customer || "—");
    data.date = g.head.date || data.date;
    setSaleModal(data);
  };
  const printPurchaseGroup = (g) => {
    const inv = g.head.invoice || g.head.invoiceNum || "PO";
    const data = purchasesToInvoiceData(g.items, inv, g.head.supplier || g.head.supplierName || "—");
    data.date = g.head.date || data.date;
    setPurchaseModal(data);
  };

  // ─── Styles ───────────────────────────────────────────────────────────────────
  const cardStyle  = { borderRadius:16, border:`1px solid ${th.border}`, background:th.bgCard, overflow:"hidden", boxShadow:th.cardShadow };
  const headStyle  = { padding:"14px 18px", borderBottom:`1px solid ${th.border}`, display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, flexWrap:"wrap", background:th.thHead };
  const rowStyle   = { padding:"12px 18px", borderBottom:`1px solid ${th.border}`, display:"flex", alignItems:"center", justifyContent:"space-between", gap:10 };
  const inputStyle = { background:th.input, border:`1px solid ${th.inputBorder}`, borderRadius:8, color:th.text, padding:"6px 10px", fontSize:13, outline:"none" };
  const filterBtnStyle = (active) => ({
    padding:"6px 12px", borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer",
    border: active ? "1px solid #1abc9c" : `1px solid ${th.border}`,
    background: active ? "rgba(26,188,156,0.12)" : "transparent",
    color: active ? (th.dark ? "#2dd4bf" : "#0f766e") : th.textMuted,
  });
  const printBtnStyle = {
    padding:"5px 10px", borderRadius:8, fontSize:12, fontWeight:600, cursor:"pointer",
    border:`1px solid ${th.border}`, background:"transparent", color:th.textMuted,
    flexShrink:0, display:"flex", alignItems:"center", gap:5,
  };
  const avatarStyle = (tint) => ({
    width:34, height:34, borderRadius:8, background: tint ? `${tint}18` : th.thHead, color: tint || th.textMuted,
    display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:700, flexShrink:0,
    border:`1px solid ${tint ? `${tint}33` : th.border}`,
  });

  const KpiCard = ({ label, amount, sub, onPrint, printLabel, onClick, color = "#1abc9c" }) => (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      style={{
        ...cardStyle, padding:"16px 18px", cursor: onClick ? "pointer" : "default",
        display:"flex", flexDirection:"column", gap:8,
        borderLeft: `3px solid ${color}`,
        background: th.dark ? th.bgCard : `linear-gradient(180deg, ${color}0f 0%, ${th.bgCard} 48%)`,
      }}
    >
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8 }}>
        <div style={{ color:th.textMuted, fontSize:11, fontWeight:700, letterSpacing:"0.06em", textTransform:"uppercase" }}>{label}</div>
        <span style={{ width:8, height:8, borderRadius:"50%", background:color, flexShrink:0 }} />
      </div>
      <div style={{ color, fontSize:20, fontWeight:800 }}>{amount}</div>
      {sub && <div style={{ color:th.textDim, fontSize:12 }}>{sub}</div>}
      {onPrint && (
        <button
          type="button"
          style={{ ...printBtnStyle, alignSelf:"flex-start", marginTop:4, color, borderColor: `${color}55` }}
          onClick={(e) => { e.stopPropagation(); onPrint(); }}
        >
          <Icon path={ICONS.print} size={13}/> {printLabel}
        </button>
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
    const color    = !hasAnyCostData ? th.text : isLoss ? (th.dark ? "#f87171" : "#b91c1c") : (th.dark ? "#2dd4bf" : "#0f766e");
    const label    = !hasAnyCostData ? (isUrdu ? "منافع / نقصان" : "Profit / Loss")
                   : isLoss          ? (isUrdu ? "نقصان" : "Loss")
                   :                   (isUrdu ? "منافع" : "Profit");
    const valueStr = !hasAnyCostData
      ? "—"
      : (isLoss ? "-" : "") + formatPKR(Math.abs(overallProfit));

    return (
      <KpiCard
        label={label}
        amount={valueStr}
        sub={`${filteredSales.length} ${isUrdu ? "فروخت" : "sales"}`}
        onClick={() => filteredSales.length > 0 && setShowProfitModal(true)}
        color={color === th.text ? "#64748b" : color}
      />
    );
  };

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

      {showProfitModal && <ProfitDetailModal/>}

      {showAnalytics && (
        <DailyAnalyticsModal
          isUrdu={isUrdu}
          th={th}
          onClose={() => setShowAnalytics(false)}
          filteredSales={filteredSales}
          filteredPurchases={filteredPurchases}
          totalSalesAmount={totalSalesAmount}
          totalPurchaseAmt={totalPurchaseAmt}
          overallProfit={overallProfit}
          hasAnyCostData={hasAnyCostData}
          parties={parties}
          expenses={expenses}
          sales={sales}
          purchases={purchases}
          products={products}
          initialFilter={filter}
          initialFrom={customFrom}
          initialTo={customTo}
        />
      )}

      {purchaseModal && (
        <Modal title={isUrdu ? "خریداری رسید" : "Purchase Invoice"} onClose={() => setPurchaseModal(null)}>
          <CombinedThermalInvoice invoiceData={purchaseModal} onClose={() => setPurchaseModal(null)} isUrdu={isUrdu}/>
        </Modal>
      )}

      {saleModal && (
        <Modal title={isUrdu ? "فروخت رسید" : "Sale Invoice"} onClose={() => setSaleModal(null)}>
          <CombinedSaleInvoice invoiceData={saleModal} onClose={() => setSaleModal(null)} isUrdu={isUrdu}/>
        </Modal>
      )}

      {dashDetail && (
        <Modal
          title={
            dashDetail.kind === "sale"
              ? `${dashDetail.group.head.invoice || dashDetail.group.head.invoiceNum || "INV"} · ${isUrdu ? "فروخت" : "Sale"}`
              : `${dashDetail.group.head.invoice || dashDetail.group.head.invoiceNum || "PO"} · ${isUrdu ? "خریداری" : "Purchase"}`
          }
          onClose={() => setDashDetail(null)}
          xl
        >
          {(() => {
            const g = dashDetail.group;
            const h = g.head;
            const isSale = dashDetail.kind === "sale";
            const lines = isSale ? saleItemLines(g) : purchaseItemLines(g);
            const total = isSale
              ? (g.items.length === 1 ? (Number(h.grandTotal) || Number(h.total) || 0) : lines.reduce((s, l) => s + l.amount, 0))
              : lines.reduce((s, l) => s + l.amount, 0);
            const party = isSale ? (h.customer || "—") : (h.supplier || h.supplierName || "—");
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", padding: "10px 12px", borderRadius: 12, border: `1px solid ${th.border}`, background: th.bgCard }}>
                  <div>
                    <div style={{ color: th.textMuted, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>{isUrdu ? "انوائس" : "Invoice"}</div>
                    <div style={{ fontFamily: "monospace", color: isSale ? "#059669" : "#b45309", fontWeight: 800, fontSize: 15 }}>{h.invoice || h.invoiceNum || "—"}</div>
                  </div>
                  <div>
                    <div style={{ color: th.textMuted, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>{isSale ? (isUrdu ? "کسٹمر" : "Customer") : (isUrdu ? "سپلائر" : "Supplier")}</div>
                    <div style={{ color: th.text, fontWeight: 800, fontSize: 15 }}>{party}</div>
                  </div>
                  <div>
                    <div style={{ color: th.textMuted, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>{isUrdu ? "تاریخ / وقت" : "Date / Time"}</div>
                    <DateTimeLine date={h.date} createdAt={h.createdAt} locale={isUrdu ? "ur-PK" : "en-PK"} th={th} />
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ color: th.textMuted, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>{isUrdu ? "کل رقم" : "Total"}</div>
                    <div style={{ color: isSale ? "#059669" : "#b45309", fontWeight: 900, fontSize: 16 }}>{formatPKR(total)}</div>
                  </div>
                </div>
                <Table
                  compact
                  cols={isSale
                    ? [t.name || "Name", isUrdu ? "تفصیل" : "Detail", t.totalLabel || "Total"]
                    : [t.name || "Name", t.category || "Category", t.quantity || "Qty", isUrdu ? "لاگت" : "Cost", t.totalLabel || "Total"]}
                  rows={lines.map((ln) => ({
                    data: ln,
                    cells: isSale
                      ? [
                          <div style={{ fontWeight: 700, color: th.text }}>{ln.name}</div>,
                          <span style={{ color: th.textMuted, fontSize: 12 }}>{ln.extra || "—"}</span>,
                          <span style={{ fontWeight: 800, color: "#059669", whiteSpace: "nowrap" }}>{formatPKR(ln.amount)}</span>,
                        ]
                      : [
                          <div style={{ fontWeight: 700, color: th.text }}>{ln.name}</div>,
                          <span style={{ fontSize: 12, color: th.textMuted }}>{ln.extra || "—"}</span>,
                          <span style={{ fontWeight: 700 }}>{ln.qty ?? "—"}</span>,
                          <span style={{ whiteSpace: "nowrap", fontSize: 12 }}>{ln.cost ? formatPKR(ln.cost) : "—"}</span>,
                          <span style={{ fontWeight: 800, color: "#b45309", whiteSpace: "nowrap" }}>{formatPKR(ln.amount)}</span>,
                        ],
                  }))}
                />
                <button
                  type="button"
                  onClick={() => { const group = g; setDashDetail(null); isSale ? printSaleGroup(group) : printPurchaseGroup(group); }}
                  style={{ padding: "10px 14px", borderRadius: 10, border: "none", cursor: "pointer", background: "linear-gradient(135deg,#1abc9c,#2980b9)", color: "#fff", fontWeight: 700, fontSize: 13 }}
                >
                  🖨️ {isUrdu ? "پرنٹ رسید" : "Print invoice"}
                </button>
              </div>
            );
          })()}
        </Modal>
      )}

      {showInvPopup && (
        <Modal title={isUrdu ? "اسٹاک لسٹ" : "Stock List"} onClose={() => setShowInvPopup(false)} xl>
          <InventoryStockTable products={products} purchases={purchases} sales={sales} purchaseReturns={purchaseReturns} saleReturns={saleReturns} />
        </Modal>
      )}

      <div style={{ ...cardStyle, padding:"12px 16px", display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
        <span style={{ color:th.textMuted, fontSize:13, fontWeight:600 }}>{t.period||"Period"}</span>
        {["today","yesterday","week","month","custom"].map(f => (
          <button key={f} type="button" style={filterBtnStyle(filter===f)} onClick={() => setFilter(f)}>
            {f==="today"?(isUrdu?"آج":"Today"):f==="yesterday"?(isUrdu?"کل":"Yesterday"):f==="week"?(isUrdu?"ہفتہ":"Week"):f==="month"?(isUrdu?"مہینہ":"Month"):(isUrdu?"تاریخ":"Date")}
          </button>
        ))}
        <input
          type="date"
          style={{ ...inputStyle, border: filter === "custom" ? "2px solid #6366f1" : inputStyle.border }}
          value={customFrom}
          onChange={e => { setCustomFrom(e.target.value); setFilter("custom"); }}
        />
        <span style={{ color:th.textMuted, fontSize:13 }}>–</span>
        <input
          type="date"
          style={{ ...inputStyle, border: filter === "custom" ? "2px solid #6366f1" : inputStyle.border }}
          value={customTo}
          onChange={e => { setCustomTo(e.target.value); setFilter("custom"); }}
        />
        <span style={{ marginLeft:"auto", color:th.textDim, fontSize:12 }}>{filterLabel()}</span>
        <button
          type="button"
          onClick={async () => {
            // Refresh data before opening analytics
            if (loadExpenses) await loadExpenses();
            if (loadParties) await loadParties();
            setShowAnalytics(true);
          }}
          style={{
            padding: "8px 16px",
            borderRadius: 10,
            border: "none",
            cursor: "pointer",
            background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
            color: "#fff",
            fontWeight: 700,
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          📊 {isUrdu ? "تجزیہ دیکھیں" : "View Analytics"}
        </button>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,minmax(0,1fr))", gap:12 }}>
        <KpiCard
          label={t.totalPurchases||"Purchases"}
          amount={formatPKR(totalPurchaseAmt)}
          sub={`${totalPurchaseCount} ${t.numberOfOrders||"orders"}`}
          onPrint={handlePrintAllPurchases}
          printLabel={t.print||"Print"}
          color="#3b82f6"
        />
        <KpiCard
          label={t.totalSales||"Sales"}
          amount={formatPKR(totalSalesAmount)}
          sub={`${totalSalesCount} ${t.numberOfSales||"invoices"}`}
          onPrint={handlePrintAllSales}
          printLabel={t.print||"Print"}
          color="#10b981"
        />
        <ProfitCard/>
        <KpiCard
          label={isUrdu ? "اسٹاک لسٹ" : "Stock List"}
          amount={formatPKR(invStats.inventoryAmount)}
          sub={`${invStats.stockedCount} ${isUrdu ? "آئٹمز" : "in stock"}`}
          onClick={() => setShowInvPopup(true)}
          color="#d97706"
        />
      </div>

      <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr":"1fr 1fr", gap:12 }}>
        <div style={{ ...cardStyle, borderTop: "2px solid #10b981" }}>
          <div style={headStyle}>
            <h3 style={{ color:th.text, fontWeight:700, fontSize:14, margin:0 }}>{t.recentSales||"Recent Sales"}</h3>
            <span style={{ color:"#059669", fontSize:12, fontWeight:700 }}>{saleGroups.length}</span>
          </div>
          {saleGroups.length === 0
            ? <p style={{ textAlign:"center", padding:"28px 16px", color:th.textDim, fontSize:13, margin:0 }}>{t.noSalesYet}</p>
            : saleGroups.slice(0, 5).map((g, i) => {
              const names = saleItemLines(g).map((l) => l.name).filter(Boolean);
              const total = g.items.length === 1
                ? (Number(g.head.grandTotal) || Number(g.head.total) || 0)
                : names.length ? saleItemLines(g).reduce((s, l) => s + l.amount, 0) : g.items.reduce((s, r) => s + (Number(r.total) || 0), 0);
              const label = names.length > 1 ? `${names[0]} +${names.length - 1}` : (names[0] || "—");
              const inv = g.head.invoice || g.head.invoiceNum || "—";
              return (
              <div key={i} style={{ ...rowStyle, cursor: "pointer" }}
                onClick={() => setDashDetail({ kind: "sale", group: g })}
                onMouseEnter={(e) => { e.currentTarget.style.background = th.rowHover; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:"flex", alignItems:"baseline", gap:8, minWidth:0 }}>
                    <span style={{ fontFamily:"ui-monospace,monospace", color: th.dark ? "#34d399" : "#059669", fontSize:12, fontWeight:600, flexShrink:0 }}>{inv}</span>
                    <span style={{ color:th.text, fontSize:13, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{g.head.customer || "—"}</span>
                  </div>
                  <p style={{ color:th.textDim, fontSize:12, margin:"3px 0 0", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }} title={names.join(", ")}>{label}</p>
                  <div style={{ marginTop: 3 }}>
                    <DateTimeLine date={g.head.date} createdAt={g.head.createdAt} locale={isUrdu ? "ur-PK" : "en-PK"} th={th} dateColor={th.dark ? "#5eead4" : "#0f766e"} />
                  </div>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
                  <span style={{ color: th.dark ? "#34d399" : "#059669", fontWeight:700, fontSize:13, whiteSpace:"nowrap" }}>{formatPKR(total)}</span>
                  <button type="button" style={{ ...printBtnStyle, color: th.dark ? "#34d399" : "#059669", borderColor:"rgba(5,150,105,0.35)" }} onClick={(e) => { e.stopPropagation(); printSaleGroup(g); }}>
                    <Icon path={ICONS.print} size={13}/> {t.print||"Print"}
                  </button>
                </div>
              </div>
              );
            })
          }
        </div>

        <div style={{ ...cardStyle, borderTop: "2px solid #d97706" }}>
          <div style={headStyle}>
            <h3 style={{ color:th.text, fontWeight:700, fontSize:14, margin:0 }}>{t.recentPurchases||"Recent Purchases"}</h3>
            <span style={{ color:"#d97706", fontSize:12, fontWeight:700 }}>{purchaseGroups.length}</span>
          </div>
          {purchaseGroups.length === 0
            ? <p style={{ textAlign:"center", padding:"28px 16px", color:th.textDim, fontSize:13, margin:0 }}>{t.noPurchasesYet||"No purchases found"}</p>
            : purchaseGroups.slice(0, 5).map((g, i) => {
              const names = purchaseItemLines(g).map((l) => l.name).filter(Boolean);
              const total = purchaseItemLines(g).reduce((s, l) => s + l.amount, 0);
              const label = names.length > 1 ? `${names[0]} +${names.length - 1}` : (names[0] || "—");
              const inv = g.head.invoice || g.head.invoiceNum || "—";
              return (
              <div key={i} style={{ ...rowStyle, cursor: "pointer" }}
                onClick={() => setDashDetail({ kind: "purchase", group: g })}
                onMouseEnter={(e) => { e.currentTarget.style.background = th.rowHover; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:"flex", alignItems:"baseline", gap:8, minWidth:0 }}>
                    <span style={{ fontFamily:"ui-monospace,monospace", color: th.dark ? "#fbbf24" : "#b45309", fontSize:12, fontWeight:600, flexShrink:0 }}>{inv}</span>
                    <span style={{ color:th.text, fontSize:13, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{g.head.supplier||g.head.supplierName||"—"}</span>
                  </div>
                  <p style={{ color:th.textDim, fontSize:12, margin:"3px 0 0", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }} title={names.join(", ")}>{label}</p>
                  <div style={{ marginTop: 3 }}>
                    <DateTimeLine date={g.head.date} createdAt={g.head.createdAt} locale={isUrdu ? "ur-PK" : "en-PK"} th={th} dateColor={th.dark ? "#fbbf24" : "#b45309"} />
                  </div>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
                  <span style={{ color: th.dark ? "#fbbf24" : "#b45309", fontWeight:700, fontSize:13, whiteSpace:"nowrap" }}>{formatPKR(total)}</span>
                  <button type="button" style={{ ...printBtnStyle, color: th.dark ? "#fbbf24" : "#b45309", borderColor:"rgba(217,119,6,0.35)" }} onClick={(e) => { e.stopPropagation(); printPurchaseGroup(g); }}>
                    <Icon path={ICONS.print} size={13}/> {t.print||"Print"}
                  </button>
                </div>
              </div>
              );
            })
          }
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr":"1fr 1fr", gap:12 }}>
        <div style={cardStyle}>
          <div style={headStyle}>
            <h3 style={{ color:th.text, fontWeight:700, fontSize:14, margin:0 }}>{t.supplierWisePurchases||"Suppliers"}</h3>
            <input style={{ ...inputStyle, width:140 }} placeholder={t.search||"Search..."} value={supplierSearch} onChange={e => setSupplierSearch(e.target.value)}/>
          </div>
          {filteredSuppliers.length === 0
            ? <p style={{ textAlign:"center", padding:"28px 16px", color:th.textDim, fontSize:13, margin:0 }}>{t.noData||"No data"}</p>
            : filteredSuppliers.map((sup, i) => (
              <div key={i} style={rowStyle}
                onMouseEnter={(e) => { e.currentTarget.style.background = th.rowHover; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <div style={avatarStyle("#3b82f6")}>{sup.name.charAt(0).toUpperCase()}</div>
                <div style={{ flex:1, minWidth:0, marginLeft:10 }}>
                  <p style={{ color:th.text, fontSize:13, fontWeight:600, margin:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{sup.name}</p>
                  <p style={{ color:th.textDim, fontSize:12, margin:"2px 0 0" }}>{sup.count} {t.invoices||"invoices"} · {formatPKR(sup.total)}</p>
                </div>
                <button type="button" style={printBtnStyle} onClick={() => handlePrintSupplier(sup)}>
                  <Icon path={ICONS.print} size={13}/> {t.print||"Print"}
                </button>
              </div>
            ))
          }
        </div>

        <div style={cardStyle}>
          <div style={headStyle}>
            <h3 style={{ color:th.text, fontWeight:700, fontSize:14, margin:0 }}>{t.customerWiseSales||"Customers"}</h3>
            <input style={{ ...inputStyle, width:140 }} placeholder={t.search||"Search..."} value={customerSearch} onChange={e => setCustomerSearch(e.target.value)}/>
          </div>
          {filteredCustomers.length === 0
            ? <p style={{ textAlign:"center", padding:"28px 16px", color:th.textDim, fontSize:13, margin:0 }}>{t.noData||"No data"}</p>
            : filteredCustomers.map((cus, i) => (
              <div key={i} style={rowStyle}
                onMouseEnter={(e) => { e.currentTarget.style.background = th.rowHover; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <div style={avatarStyle("#10b981")}>{cus.name.charAt(0).toUpperCase()}</div>
                <div style={{ flex:1, minWidth:0, marginLeft:10 }}>
                  <p style={{ color:th.text, fontSize:13, fontWeight:600, margin:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{cus.name}</p>
                  <p style={{ color:th.textDim, fontSize:12, margin:"2px 0 0" }}>{cus.count} {t.invoices||"invoices"} · {formatPKR(cus.total)}</p>
                </div>
                <button type="button" style={printBtnStyle} onClick={() => handlePrintCustomer(cus)}>
                  <Icon path={ICONS.print} size={13}/> {t.print||"Print"}
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
  const toDateStr = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  const todayStr2 = toDateStr(today);
  const yesterdayStr = (() => { const d = new Date(today); d.setDate(d.getDate() - 1); return toDateStr(d); })();
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
    if (filter === "yesterday") return d === yesterdayStr;
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
  const toDateStr = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  const todayStr2 = toDateStr(today);
  const yesterdayStr = (() => { const d = new Date(today); d.setDate(d.getDate() - 1); return toDateStr(d); })();
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
    if (filter === "yesterday") return d === yesterdayStr;
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