import { useEffect, useMemo, useState } from "react";
import { CombinedSaleInvoice } from "../components/InvoiceComponents";
import { useTheme } from "../context/ThemeContext";
import { useLang } from "../context/LangContext";
import { useResponsive, Icon, ICONS, Modal } from "../components/shared";
import { formatPKR, formatDateTime, printThermalOrA4, downloadInvoicePdf, todayStr } from "../utils/helpers";
import { safeProductName } from "../utils/constants";
import { ledgerApi, partyTotals, openingKindOf } from "../utils/ledgerStore";
import PartyLedgerSheet, { buildPartyLedger } from "../components/PartyLedgerSheet";

function partyOpening(p) {
  if (!p) return 0;
  const n = Number(p.openingBalance);
  if (Number.isFinite(n) && n !== 0) return n;
  const alt = Number(p.opening);
  return Number.isFinite(alt) ? alt : (Number.isFinite(n) ? n : 0);
}

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

function groupTotal(group, kind) {
  const h = group.head || {};
  if (kind === "sale" && group.items.length === 1) {
    return Number(h.grandTotal) || Number(h.total) || 0;
  }
  const lines = kind === "sale" ? saleItemLines(group) : purchaseItemLines(group);
  return lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
}

function invoiceNo(rec) {
  return String(rec?.invoice || rec?.invoiceNum || "").trim();
}

function nameEq(a, b) {
  return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
}

function whatsappHref(phone, text) {
  const digits = String(phone || "").replace(/[^\d]/g, "");
  if (!digits || digits === "0") return null;
  let intl = digits;
  if (digits.startsWith("00")) intl = digits.slice(2);
  else if (digits.startsWith("0")) intl = "92" + digits.slice(1);
  return `https://wa.me/${intl}?text=${encodeURIComponent(text)}`;
}

function purchaseRowToDescAmt(row, cat, purchasePrice) {
  if (row.desc !== undefined && row.amount !== undefined) {
    return { desc: row.desc, amount: Number(row.amount) || 0 };
  }
  if (cat === "Pipe") {
    const length = parseFloat(String(row.length || "").replace(/[^0-9.]/g, "")) || 0;
    const pieces = Number(row.quantity) || 0;
    const pct = Number(row.purchasePercentage) || 0;
    const pricePerFt = (Number(purchasePrice) || 0) * (1 + pct / 100);
    const pricePerPc = pricePerFt * length;
    return { desc: `${pieces}pc × Rs${pricePerPc.toFixed(0)}/pc`, amount: pricePerPc * pieces };
  }
  if (cat === "Chader") {
    const kg = Number(row.weight) || 0;
    const price = Number(row.purchasePrice) || 0;
    return { desc: `${kg}kg × Rs${price}/kg`, amount: kg * price };
  }
  if (cat === "Net") {
    const ft = Number(row.feet) || 0;
    const width = Number(row.width) || 0;
    const price = Number(row.purchasePricePerFeet) || 0;
    const total = ft * (width || 1) * price;
    const widthPart = width ? `ft×${width}ft×` : "ft×";
    return { desc: `${ft}${widthPart} Rs${price}/ft`, amount: total };
  }
  const qty = Number(row.qty) || 0;
  const price = Number(row.purchasePrice) || 0;
  return { desc: `${qty}pc × Rs${price}/pc`, amount: qty * price };
}

function purchaseFallbackRows(p) {
  const cat = p.category || "";
  const qty = p.qty || 0;
  const rate = p.rate || 0;
  if (cat === "Chader") return [{ desc: `${qty}kg × Rs${rate}/kg`, amount: qty * rate }];
  if (cat === "Net") return [{ desc: `${qty}ft × Rs${rate}/ft`, amount: qty * rate }];
  return [{ desc: `${qty}pc × Rs${rate}/pc`, amount: qty * rate }];
}

function saleFallbackRows(s) {
  const cat = s.category || "";
  const qty = s.qty || 0;
  const rate = s.rate || 0;
  if (cat === "Chader") return [{ desc: `${qty}kg × Rs${rate}/kg`, amount: qty * rate }];
  if (cat === "Net") return [{ desc: `${qty}ft × Rs${rate}/ft`, amount: qty * rate }];
  return [{ desc: `${qty}pc × Rs${rate}/pc`, amount: qty * rate }];
}

function purchasesToInvoiceData(purchaseList, invoiceTitle, supplierName, products) {
  const itemMap = {};
  (purchaseList || []).forEach((p) => {
    const productId = typeof p.product === "object" ? p.product?._id : p.product;
    const matchedProduct = (products || []).find((pr) => pr._id === productId);
    const purchasePrice = Number(p.productPrice) || Number(matchedProduct?.price) || (typeof p.product === "object" ? Number(p.product?.price) : 0) || 0;
    const cat = p.category || "";
    const prodName = p.productName || safeProductName(p.product) || "—";
    const descRows = p.rows && p.rows.length > 0
      ? p.rows.map((r) => purchaseRowToDescAmt(r, cat, purchasePrice))
      : purchaseFallbackRows(p);
    const subtotal = descRows.reduce((a, r) => a + r.amount, 0);
    const key = `${prodName}__${cat}`;
    if (!itemMap[key]) itemMap[key] = { productName: prodName, category: cat, rows: descRows, subtotal };
    else {
      itemMap[key].rows = [...itemMap[key].rows, ...descRows];
      itemMap[key].subtotal += subtotal;
    }
  });
  const items = Object.values(itemMap);
  const grandTotal = items.reduce((a, i) => a + i.subtotal, 0);
  const head = purchaseList[0] || {};
  const remaining = Number(head.remainingAmount) || 0;
  const paid = Number(head.paidAmount);
  return {
    invoice: invoiceTitle,
    date: head.date || todayStr(),
    customer: supplierName,
    items,
    grandTotal,
    paymentMethod: purchaseList.find((p) => p.paymentMethod)?.paymentMethod || "cash",
    bankName: purchaseList.find((p) => p.bankName)?.bankName || "",
    isPartial: remaining > 0,
    paidAmount: Number.isFinite(paid) && paid > 0 ? paid : Math.max(0, grandTotal - remaining),
    remainingAmount: remaining,
    loaderName: "",
    loaderFee: 0,
    bindingFee: 0,
  };
}

function salesToInvoiceData(salesList, invoiceTitle, customerName) {
  const itemMap = {};
  (salesList || []).forEach((s) => {
    if (s.items && s.items.length > 0) {
      s.items.forEach((item, idx) => {
        const key = `${item.productName || ""}__${item.category || ""}__${idx}`;
        const subtotal = item.subtotal || item.rows?.reduce((a, r) => a + (Number(r.amount) || 0), 0) || 0;
        if (!itemMap[key]) {
          itemMap[key] = { productName: item.productName || "—", category: item.category || "", rows: item.rows || [], subtotal };
        } else {
          itemMap[key].rows = [...itemMap[key].rows, ...(item.rows || [])];
          itemMap[key].subtotal += subtotal;
        }
      });
      return;
    }
    const key = `${s.productName || safeProductName(s.product)}__${s.category || ""}`;
    const rows = s.rows && s.rows.length > 0
      ? s.rows.map((r) => ({
        desc: r.desc || `${r.qty || r.weight || r.feet || 0} × Rs${r.salePrice || r.salePricePerFeet || r.salePricePerKg || 0}`,
        amount: r.amount || (r.qty || r.weight || r.feet || 0) * (r.salePrice || r.salePricePerFeet || 0),
      }))
      : saleFallbackRows(s);
    const rowTotal = rows.reduce((a, r) => a + (Number(r.amount) || 0), 0);
    if (!itemMap[key]) {
      itemMap[key] = { productName: s.productName || safeProductName(s.product), category: s.category || "", rows, subtotal: rowTotal };
    } else {
      itemMap[key].rows = [...itemMap[key].rows, ...rows];
      itemMap[key].subtotal += rowTotal;
    }
  });
  const items = Object.values(itemMap);
  const itemsTotal = items.reduce((a, i) => a + i.subtotal, 0);
  const head = salesList[0] || {};
  const grandTotal = salesList.length === 1
    ? (Number(head.grandTotal) || Number(head.total) || itemsTotal)
    : itemsTotal;
  const remaining = Number(head.remainingAmount) || 0;
  const paid = Number(head.paidAmount);
  return {
    invoice: invoiceTitle,
    date: head.date || todayStr(),
    customer: customerName,
    items,
    grandTotal,
    paymentMethod: salesList.find((s) => s.paymentMethod)?.paymentMethod || "cash",
    bankName: salesList.find((s) => s.bankName)?.bankName || "",
    isPartial: remaining > 0,
    paidAmount: Number.isFinite(paid) && paid > 0 ? paid : Math.max(0, grandTotal - remaining),
    remainingAmount: remaining,
    loaderName: salesList.find((s) => s.loaderName)?.loaderName || "",
    loaderFee: Number(head.loaderFee) || 0,
    bindingFee: Number(head.bindingFee) || 0,
    discount: Number(head.discount) || 0,
    cashReceived: Number(head.cashReceived) || 0,
    changeDue: Number(head.changeDue) || 0,
  };
}

function DateTimeLine({ date, createdAt, locale, th }) {
  const full = formatDateTime(date, createdAt, locale);
  const parts = String(full).split(" · ");
  return (
    <span style={{ fontSize: 12, color: th.textDim, whiteSpace: "nowrap" }}>
      <span style={{ color: th.textMuted, fontWeight: 600 }}>{parts[0] || date || "—"}</span>
      {parts[1] ? <> · {parts[1]}</> : null}
    </span>
  );
}

function SegBtn({ active, onClick, children, color }) {
  const th = useTheme();
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "9px 16px",
        borderRadius: 10,
        cursor: "pointer",
        fontWeight: 800,
        fontSize: 13,
        border: active ? "none" : `1px solid ${th.border}`,
        background: active ? (color || "#0f766e") : "transparent",
        color: active ? "#fff" : th.textMuted,
      }}
    >
      {children}
    </button>
  );
}

function OutlineBtn({ onClick, color, children, disabled }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onClick?.(e); }}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "6px 10px",
        borderRadius: 8,
        border: `1px solid ${color}55`,
        background: "transparent",
        color,
        cursor: disabled ? "not-allowed" : "pointer",
        fontWeight: 700,
        fontSize: 12,
        opacity: disabled ? 0.45 : 1,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

export default function RecordsPage({ products = [], purchases = [], sales = [] }) {
  const th = useTheme();
  const { isUrdu } = useLang();
  const { isMobile } = useResponsive();

  const L = isUrdu ? {
    parties: "گاہک / سپلائر",
    invoices: "انوائس ریکارڈ",
    customers: "گاہک",
    suppliers: "سپلائر",
    searchParty: "نام یا نمبر سے تلاش...",
    searchInv: "انوائس نمبر لکھیں...",
    lookupHint: "فروخت یا خریداری کا انوائس نمبر لکھیں — ریکارڈ کھل جائے گا۔",
    noneParty: "کوئی ریکارڈ نہیں",
    noneInv: "یہ انوائس نہیں ملا",
    pickParty: "تفصیل دیکھنے کے لیے نام منتخب کریں",
    ledger: "کھاتہ",
    history: "تاریخ",
    sale: "فروخت",
    purchase: "خریداری",
    print: "پرنٹ",
    pdf: "PDF",
    send: "PDF بھیجیں",
    whatsapp: "WhatsApp",
    statement: "بیان پرنٹ",
    view: "دیکھیں",
    phone: "نمبر",
    balance: "بیلنس",
    receivable: "میں لوں گا",
    payable: "میں دوں گا",
    settled: "حساب صاف",
    total: "کل",
    loading: "لوڈ ہو رہا ہے...",
    typeSale: "فروخت رسید",
    typePurchase: "خریداری رسید",
    noPhone: "فون نمبر دستیاب نہیں",
  } : {
    parties: "Customers / Suppliers",
    invoices: "Invoice record",
    customers: "Customers",
    suppliers: "Suppliers",
    searchParty: "Search by name or number...",
    searchInv: "Type invoice number...",
    lookupHint: "Enter a sale or purchase invoice number to open that record.",
    noneParty: "No records yet",
    noneInv: "No invoice found",
    pickParty: "Select a name to see ledger and history",
    ledger: "Ledger",
    history: "History",
    sale: "Sale",
    purchase: "Purchase",
    print: "Print",
    pdf: "PDF",
    send: "Send PDF",
    whatsapp: "WhatsApp",
    statement: "Print statement",
    view: "View",
    phone: "Phone",
    balance: "Balance",
    receivable: "I will get",
    payable: "I will give",
    settled: "Settled",
    total: "Total",
    loading: "Loading...",
    typeSale: "Sale invoice",
    typePurchase: "Purchase invoice",
    noPhone: "No phone number on file",
  };

  const [portion, setPortion] = useState("parties");
  const [roleTab, setRoleTab] = useState("customer");
  const [partySearch, setPartySearch] = useState("");
  const [invQuery, setInvQuery] = useState("");
  const [parties, setParties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [entries, setEntries] = useState([]);
  const [invoiceModal, setInvoiceModal] = useState(null);
  const [statementOpen, setStatementOpen] = useState(false);
  const [pendingSend, setPendingSend] = useState(null);
  const [pendingPrint, setPendingPrint] = useState(null);

  const loadParties = async () => {
    try {
      const r = await ledgerApi.list();
      if (r.success) setParties(r.parties || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };
  useEffect(() => { loadParties(); }, []);

  const directory = useMemo(() => {
    const list = [...parties];
    const have = new Set(list.map((p) => `${p.type}::${String(p.name || "").trim().toLowerCase()}`));
    const addGhost = (type, name) => {
      const n = (name || "").trim();
      if (!n || n === "—") return;
      const key = `${type}::${n.toLowerCase()}`;
      if (have.has(key)) return;
      have.add(key);
      list.push({
        _id: `ghost:${type}:${n.toLowerCase()}`,
        type, name: n, phone: "", balance: 0, payable: 0, receivable: 0, openingBalance: 0, opening: 0, ghost: true,
      });
    };
    (purchases || []).forEach((p) => addGhost("supplier", p.supplier || p.supplierName));
    (sales || []).forEach((s) => addGhost("customer", s.customer));
    return list;
  }, [parties, purchases, sales]);

  const filteredParties = useMemo(() => {
    const q = partySearch.trim().toLowerCase();
    return directory
      .filter((p) => p.type === roleTab)
      .filter((p) => {
        if (!q) return true;
        return (p.name || "").toLowerCase().includes(q)
          || (p.phone || "").toLowerCase().includes(q)
          || (p.address || "").toLowerCase().includes(q);
      })
      .sort((a, b) => {
        const na = Math.abs(Number(a.balance) || 0);
        const nb = Math.abs(Number(b.balance) || 0);
        const aOpen = na > 0.5 ? 1 : 0;
        const bOpen = nb > 0.5 ? 1 : 0;
        if (aOpen !== bOpen) return bOpen - aOpen;
        if (nb !== na) return nb - na;
        return (a.name || "").localeCompare(b.name || "");
      });
  }, [directory, roleTab, partySearch]);

  const openParty = async (p) => {
    setSelected(p);
    setStatementOpen(false);
    if (!p || p.ghost) { setEntries([]); return; }
    try {
      const r = await ledgerApi.get(p._id);
      if (r.success) {
        const next = { ...p, ...r.party };
        next.openingBalance = partyOpening(r.party) || partyOpening(p);
        setSelected(next);
        setEntries(r.entries || []);
      } else setEntries([]);
    } catch { setEntries([]); }
  };

  const partySales = useMemo(() => {
    if (!selected || selected.type !== "customer") return [];
    return groupByInvoice((sales || []).filter((s) => nameEq(s.customer, selected.name)));
  }, [selected, sales]);

  const partyPurchases = useMemo(() => {
    if (!selected || selected.type !== "supplier") return [];
    return groupByInvoice((purchases || []).filter((p) => nameEq(p.supplier || p.supplierName, selected.name)));
  }, [selected, purchases]);

  const partyHistory = selected?.type === "supplier" ? partyPurchases : partySales;
  const historyKind = selected?.type === "supplier" ? "purchase" : "sale";

  const netOf = (p) => {
    if (!p) return 0;
    if (p.balance !== undefined) return Number(p.balance) || 0;
    return Number(partyTotals(p.type, p.openingBalance, entries).balance) || 0;
  };

  const toneLabel = (net) => {
    if (net > 0.5) return L.receivable;
    if (net < -0.5) return L.payable;
    return L.settled;
  };
  const toneColor = (net) => (net > 0.5 ? "#16a34a" : net < -0.5 ? "#dc2626" : th.textMuted);

  const findPhone = (name, type) => {
    const p = directory.find((x) => x.type === type && nameEq(x.name, name));
    const phone = (p?.phone || "").trim();
    if (!phone || phone === "-") return "";
    return phone;
  };

  const openInvoiceGroup = (group, kind, send) => {
    const h = group.head || {};
    const inv = invoiceNo(h) || (kind === "sale" ? "INV" : "PO");
    const data = kind === "sale"
      ? salesToInvoiceData(group.items, inv, h.customer || "—")
      : purchasesToInvoiceData(group.items, inv, h.supplier || h.supplierName || "—", products);
    data.date = h.date || data.date || todayStr();
    const phone = kind === "sale"
      ? findPhone(h.customer, "customer")
      : findPhone(h.supplier || h.supplierName, "supplier");
    data._phone = phone;
    data._kind = kind;
    setInvoiceModal(data);
    if (!send) setPendingSend(null);
    if (send) {
      const total = formatPKR(data.grandTotal);
      const partyName = data.customer || "";
      const msg = isUrdu
        ? `السلام علیکم ${partyName}، انوائس ${inv} مورخہ ${data.date || ""}۔ کل رقم: ${total}۔ PDF منسلک ہے۔`
        : `Assalamualaikum ${partyName}, invoice ${inv} dated ${data.date || ""}. Total: ${total}. PDF is attached.`;
      setPendingSend({ phone, filename: `${inv}-${data.date || "invoice"}`, message: msg });
    }
  };

  useEffect(() => {
    if (!invoiceModal || !pendingSend) return;
    const t = setTimeout(async () => {
      await printThermalOrA4("pdf", pendingSend.filename);
      const href = whatsappHref(pendingSend.phone, pendingSend.message);
      if (href) window.open(href, "_blank");
      else if (!pendingSend.phone) alert(L.noPhone);
      setPendingSend(null);
    }, 450);
    return () => clearTimeout(t);
  }, [invoiceModal, pendingSend]);

  useEffect(() => {
    if (!pendingPrint || !selected) return;
    const mode = pendingPrint;
    const t = setTimeout(() => {
      const file = `ledger-${String(selected.name || "party").replace(/\s+/g, "-")}`;
      try {
        if (mode === "pdf") downloadInvoicePdf(file);
        else printThermalOrA4(mode, file);
      } finally {
        setPendingPrint(null);
      }
    }, 80);
    return () => clearTimeout(t);
  }, [pendingPrint, selected]);

  const invoiceHits = useMemo(() => {
    const q = invQuery.trim().toLowerCase();
    if (!q) return [];
    const score = (rec) => {
      const n = invoiceNo(rec).toLowerCase();
      if (n === q) return 0;
      if (n.startsWith(q)) return 1;
      if (n.includes(q)) return 2;
      return -1;
    };
    const collect = (list, kind) => groupByInvoice(list)
      .map((g) => ({ g, kind, s: score(g.head) }))
      .filter((x) => x.s >= 0);
    return [...collect(sales, "sale"), ...collect(purchases, "purchase")]
      .sort((a, b) => a.s - b.s || String(b.g.stamp).localeCompare(String(a.g.stamp)));
  }, [invQuery, sales, purchases]);

  const card = { borderRadius: 16, border: `1px solid ${th.border}`, background: th.bgCard, overflow: "hidden", boxShadow: th.cardShadow };
  const inp = {
    width: "100%", padding: "10px 12px 10px 36px", borderRadius: 12, border: `1px solid ${th.border}`,
    background: th.bg, color: th.text, fontSize: 14, outline: "none", boxSizing: "border-box",
  };

  const renderHistoryRow = (g, kind) => {
    const h = g.head;
    const inv = invoiceNo(h) || "—";
    const total = groupTotal(g, kind);
    const isSale = kind === "sale";
    const accent = isSale ? (th.dark ? "#34d399" : "#059669") : (th.dark ? "#fbbf24" : "#b45309");
    const party = isSale ? (h.customer || "—") : (h.supplier || h.supplierName || "—");
    const names = (isSale ? saleItemLines(g) : purchaseItemLines(g)).map((l) => l.name).filter(Boolean);
    const label = names.length > 1 ? `${names[0]} +${names.length - 1}` : (names[0] || "—");
    return (
      <div
        key={`${kind}-${inv}-${h.date}-${h._id}`}
        onClick={() => openInvoiceGroup(g, kind, false)}
        style={{ padding: "12px 14px", borderBottom: `1px solid ${th.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, cursor: "pointer" }}
        onMouseEnter={(e) => { e.currentTarget.style.background = th.rowHover; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
            <span style={{ fontFamily: "ui-monospace,monospace", color: accent, fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{inv}</span>
            <span style={{ fontSize: 10, fontWeight: 800, color: accent, letterSpacing: "0.04em" }}>{isSale ? L.sale : L.purchase}</span>
            <span style={{ color: th.text, fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{party}</span>
          </div>
          <p style={{ color: th.textDim, fontSize: 12, margin: "3px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</p>
          <div style={{ marginTop: 3 }}>
            <DateTimeLine date={h.date} createdAt={h.createdAt} locale={isUrdu ? "ur-PK" : "en-PK"} th={th} />
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <span style={{ color: accent, fontWeight: 800, fontSize: 13, whiteSpace: "nowrap" }}>{formatPKR(total)}</span>
          <OutlineBtn color={accent} onClick={() => openInvoiceGroup(g, kind, false)}>
            <Icon path={ICONS.print} size={13} /> {L.print}
          </OutlineBtn>
          <OutlineBtn color="#7c3aed" onClick={() => openInvoiceGroup(g, kind, true)}>
            {L.send}
          </OutlineBtn>
        </div>
      </div>
    );
  };

  const partyDetail = selected && (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ ...card, padding: 16, borderTop: `3px solid ${selected.type === "supplier" ? "#d97706" : "#2563eb"}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div>
            <div style={{ color: th.text, fontWeight: 800, fontSize: 18 }}>{selected.name}</div>
            <div style={{ color: th.textMuted, fontSize: 13, marginTop: 2 }}>
              {selected.phone || "—"}{selected.address ? ` · ${selected.address}` : ""}
            </div>
          </div>
          <span style={{
            fontSize: 11, fontWeight: 800, padding: "4px 10px", borderRadius: 20,
            background: selected.type === "supplier" ? "rgba(217,119,6,0.15)" : "rgba(37,99,235,0.15)",
            color: selected.type === "supplier" ? "#d97706" : "#2563eb",
          }}>
            {selected.type === "supplier" ? L.suppliers : L.customers}
          </span>
        </div>
        {(() => {
          const net = netOf(selected);
          const openAmt = partyOpening(selected);
          const kind = openingKindOf(selected.type, openAmt);
          const kindLbl = kind === "lana" ? (isUrdu ? "میں نے لینا ہے" : "Maine lana hain") : (isUrdu ? "میں نے دینا ہے" : "Maine dena hain");
          return (
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10, marginTop: 14 }}>
              <div style={{ padding: "10px 12px", borderRadius: 12, background: th.dark ? "rgba(255,255,255,0.04)" : "rgba(15,23,42,0.04)", border: `1px solid ${th.border}` }}>
                <div style={{ color: th.textMuted, fontSize: 11, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase" }}>{isUrdu ? "اوپننگ بیلنس" : "Opening balance"}</div>
                <div style={{ color: th.text, fontWeight: 900, fontSize: 18, marginTop: 4 }}>{formatPKR(Math.abs(openAmt))}</div>
                <div style={{ color: openAmt ? (kind === "lana" ? "#16a34a" : "#dc2626") : th.textDim, fontSize: 12, fontWeight: 700, marginTop: 2 }}>
                  {openAmt ? kindLbl : (isUrdu ? "کوئی اوپننگ نہیں" : "No opening")}
                </div>
              </div>
              <div style={{ padding: "10px 12px", borderRadius: 12, background: net > 0.5 ? "rgba(22,163,74,0.08)" : net < -0.5 ? "rgba(220,38,38,0.08)" : (th.dark ? "rgba(255,255,255,0.04)" : "rgba(15,23,42,0.04)"), border: `1px solid ${net > 0.5 ? "rgba(22,163,74,0.3)" : net < -0.5 ? "rgba(220,38,38,0.3)" : th.border}` }}>
                <div style={{ color: th.textMuted, fontSize: 11, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase" }}>{isUrdu ? "موجودہ بیلنس" : "Current balance"}</div>
                <div style={{ color: toneColor(net), fontWeight: 900, fontSize: 18, marginTop: 4 }}>{formatPKR(Math.abs(net))}</div>
                <div style={{ color: toneColor(net), fontSize: 12, fontWeight: 700, marginTop: 2 }}>{toneLabel(net)}</div>
              </div>
            </div>
          );
        })()}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <OutlineBtn color="#0f766e" onClick={() => setStatementOpen(true)}>
            <Icon path={ICONS.print} size={13} /> {L.statement}
          </OutlineBtn>
          {selected.phone ? (
            <OutlineBtn
              color="#16a34a"
              onClick={() => {
                const href = whatsappHref(selected.phone, isUrdu
                  ? `السلام علیکم ${selected.name}، آپ کا کھاتہ بیلنس ${formatPKR(Math.abs(netOf(selected)))} ہے۔`
                  : `Assalamualaikum ${selected.name}, your account balance is ${formatPKR(Math.abs(netOf(selected)))}.`);
                if (href) window.open(href, "_blank");
              }}
            >
              {L.whatsapp}
            </OutlineBtn>
          ) : null}
        </div>
      </div>

      <div style={card}>
        {(() => {
          const pack = buildPartyLedger({ party: selected, entries, isUrdu });
          const thS = { textAlign: "left", padding: "8px 10px", fontSize: 11, fontWeight: 800, color: th.textMuted, borderBottom: `1px solid ${th.border}`, whiteSpace: "nowrap" };
          const tdS = { padding: "8px 10px", borderBottom: `1px solid ${th.border}`, fontSize: 13, color: th.text };
          const numS = { ...tdS, textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" };
          const rows = pack.rows.length ? pack.rows : [{ date: "—", source: "—", description: "—", debit: 0, credit: 0, balance: pack.opening }];
          return (
            <>
              <div style={{ padding: "10px 14px", borderBottom: `1px solid ${th.border}`, display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <span style={{ color: th.textMuted, fontSize: 12, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                  {L.ledger} · {pack.rows.length}
                </span>
                <span style={{ color: th.text, fontSize: 12, fontWeight: 800 }}>
                  {isUrdu ? "اوپننگ بیلنس" : "Opening"}: {formatPKR(Math.abs(partyOpening(selected) || pack.opening))}
                </span>
              </div>
              <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: 360 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
                  <thead>
                    <tr style={{ background: th.dark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)" }}>
                      <th style={thS}>#</th>
                      <th style={thS}>{isUrdu ? "تاریخ" : "Date"}</th>
                      <th style={thS}>{isUrdu ? "حوالہ" : "Source"}</th>
                      <th style={thS}>{isUrdu ? "تفصیل" : "Description"}</th>
                      <th style={{ ...thS, textAlign: "right" }}>{isUrdu ? "میں نے دیے" : "Maine Diye"}</th>
                      <th style={{ ...thS, textAlign: "right" }}>{isUrdu ? "میں نے لیے" : "Maine Liye"}</th>
                      <th style={{ ...thS, textAlign: "right" }}>{isUrdu ? "بیلنس" : "Balance"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i}>
                        <td style={tdS}>{i + 1}</td>
                        <td style={{ ...tdS, whiteSpace: "nowrap" }}>{r.date}</td>
                        <td style={tdS}>{r.source}</td>
                        <td style={tdS}>{r.description}</td>
                        <td style={numS}>{formatPKR(r.debit)}</td>
                        <td style={numS}>{formatPKR(r.credit)}</td>
                        <td style={{ ...numS, fontWeight: 800 }}>{formatPKR(r.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td style={{ ...tdS, borderBottom: "none", fontWeight: 800 }} colSpan={4}>{L.total}</td>
                      <td style={{ ...numS, borderBottom: "none", fontWeight: 800 }}>{formatPKR(pack.totalDebit)}</td>
                      <td style={{ ...numS, borderBottom: "none", fontWeight: 800 }}>{formatPKR(pack.totalCredit)}</td>
                      <td style={{ ...numS, borderBottom: "none", fontWeight: 800 }}>{formatPKR(pack.closing)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          );
        })()}
      </div>

      <div style={{ ...card, borderTop: `2px solid ${historyKind === "sale" ? "#10b981" : "#d97706"}` }}>
        <div style={{ padding: "10px 14px", borderBottom: `1px solid ${th.border}`, display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: th.textMuted, fontSize: 12, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase" }}>
            {historyKind === "sale" ? L.sale : L.purchase} · {L.history}
          </span>
          <span style={{ color: historyKind === "sale" ? "#059669" : "#d97706", fontSize: 12, fontWeight: 800 }}>{partyHistory.length}</span>
        </div>
        <div style={{ maxHeight: 320, overflowY: "auto" }}>
        {partyHistory.length === 0
          ? <div style={{ padding: 18, color: th.textDim, fontSize: 13 }}>—</div>
          : partyHistory.map((g) => renderHistoryRow(g, historyKind))}
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <SegBtn active={portion === "parties"} onClick={() => setPortion("parties")} color="#2563eb">{L.parties}</SegBtn>
        <SegBtn active={portion === "invoice"} onClick={() => setPortion("invoice")} color="#0f766e">{L.invoices}</SegBtn>
      </div>

      {portion === "parties" && (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <SegBtn active={roleTab === "customer"} onClick={() => { setRoleTab("customer"); setSelected(null); setEntries([]); }} color="#2563eb">{L.customers}</SegBtn>
            <SegBtn active={roleTab === "supplier"} onClick={() => { setRoleTab("supplier"); setSelected(null); setEntries([]); }} color="#d97706">{L.suppliers}</SegBtn>
            <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
              <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: th.textMuted }}>
                <Icon path={ICONS.search} size={14} />
              </span>
              <input value={partySearch} onChange={(e) => setPartySearch(e.target.value)} placeholder={L.searchParty} style={inp} />
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: "center", padding: 48, color: th.textDim }}>{L.loading}</div>
          ) : (
            <div style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "minmax(260px, 300px) minmax(0, 1fr)",
              gap: 14,
              alignItems: "stretch",
              minHeight: isMobile ? undefined : "calc(100dvh - 230px)",
            }}>
              <div style={{
                ...card,
                display: "flex",
                flexDirection: "column",
                minHeight: 0,
                maxHeight: isMobile ? 380 : "calc(100dvh - 230px)",
              }}>
                <div style={{
                  padding: "10px 14px",
                  borderBottom: `1px solid ${th.border}`,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexShrink: 0,
                  background: th.dark ? "rgba(255,255,255,0.03)" : "rgba(15,23,42,0.03)",
                }}>
                  <span style={{ color: th.textMuted, fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                    {roleTab === "supplier" ? L.suppliers : L.customers}
                  </span>
                  <span style={{
                    fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 999,
                    background: roleTab === "supplier" ? "rgba(217,119,6,0.15)" : "rgba(37,99,235,0.15)",
                    color: roleTab === "supplier" ? "#d97706" : "#2563eb",
                  }}>{filteredParties.length}</span>
                </div>
                <div style={{ overflowY: "auto", overflowX: "hidden", flex: 1, minHeight: 0, WebkitOverflowScrolling: "touch" }}>
                {filteredParties.length === 0 && <div style={{ padding: 28, textAlign: "center", color: th.textDim, fontSize: 13 }}>{L.noneParty}</div>}
                {filteredParties.map((p) => {
                  const net = Number(p.balance) || 0;
                  const openAmt = partyOpening(p);
                  const on = selected && selected._id === p._id;
                  const accent = p.type === "supplier" ? "#d97706" : "#2563eb";
                  const initial = String(p.name || "?").trim().charAt(0).toUpperCase();
                  return (
                    <div
                      key={p._id}
                      onClick={() => openParty(p)}
                      style={{
                        padding: "11px 12px",
                        borderBottom: `1px solid ${th.border}`,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        background: on ? (th.dark ? "rgba(37,99,235,0.14)" : "rgba(37,99,235,0.07)") : "transparent",
                        borderLeft: on ? `3px solid ${accent}` : "3px solid transparent",
                      }}
                    >
                      <div style={{
                        width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontWeight: 800, fontSize: 13, color: accent,
                        background: p.type === "supplier" ? "rgba(217,119,6,0.14)" : "rgba(37,99,235,0.14)",
                      }}>{initial}</div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ color: th.text, fontWeight: 800, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                        <div style={{ color: th.textMuted, fontSize: 11, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.phone && p.phone !== "-" ? p.phone : (isUrdu ? "نمبر نہیں" : "No number")}</div>
                        {openAmt ? (
                          <div style={{ color: th.textDim, fontSize: 10, fontWeight: 700, marginTop: 2 }}>
                            {isUrdu ? "اوپننگ" : "Opening"} {formatPKR(Math.abs(openAmt))}
                          </div>
                        ) : null}
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ color: toneColor(net), fontSize: 12, fontWeight: 800 }}>{formatPKR(Math.abs(net))}</div>
                        <div style={{ color: toneColor(net), fontSize: 10, fontWeight: 700, marginTop: 2 }}>{toneLabel(net)}</div>
                      </div>
                    </div>
                  );
                })}
                </div>
              </div>
              {isMobile ? (
                selected && (
                  <Modal title={selected.name} onClose={() => { setSelected(null); setEntries([]); }} xl>
                    {partyDetail}
                  </Modal>
                )
              ) : (
                <div style={{ minHeight: 0, maxHeight: "calc(100dvh - 230px)", overflowY: "auto", overflowX: "hidden" }}>
                  {selected ? partyDetail : (
                    <div style={{ ...card, padding: 48, textAlign: "center", color: th.textDim, fontSize: 14 }}>{L.pickParty}</div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {portion === "invoice" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ ...card, padding: 16, borderTop: "2px solid #0f766e" }}>
            <div style={{ color: th.textMuted, fontSize: 12, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 8 }}>{L.invoices}</div>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: th.textMuted }}>
                <Icon path={ICONS.search} size={16} />
              </span>
              <input
                value={invQuery}
                onChange={(e) => setInvQuery(e.target.value)}
                placeholder={L.searchInv}
                autoFocus
                style={{ ...inp, fontSize: 16, fontFamily: "ui-monospace,monospace", fontWeight: 700, padding: "12px 14px 12px 40px" }}
              />
            </div>
            <div style={{ color: th.textDim, fontSize: 12, marginTop: 8 }}>{L.lookupHint}</div>
          </div>

          {!invQuery.trim() ? null : invoiceHits.length === 0 ? (
            <div style={{ ...card, padding: 40, textAlign: "center", color: th.textDim }}>{L.noneInv}</div>
          ) : (
            <div style={card}>
              {invoiceHits.map(({ g, kind }) => renderHistoryRow(g, kind))}
            </div>
          )}
        </div>
      )}

      {invoiceModal && (
        <Modal
          title={invoiceModal._kind === "purchase" ? L.typePurchase : L.typeSale}
          onClose={() => { setInvoiceModal(null); setPendingSend(null); }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {invoiceModal._phone ? (
              <OutlineBtn
                color="#16a34a"
                onClick={() => {
                  const href = whatsappHref(
                    invoiceModal._phone,
                    isUrdu
                      ? `السلام علیکم ${invoiceModal.customer}، انوائس ${invoiceModal.invoice}۔ کل رقم: ${formatPKR(invoiceModal.grandTotal)}۔`
                      : `Assalamualaikum ${invoiceModal.customer}, invoice ${invoiceModal.invoice}. Total: ${formatPKR(invoiceModal.grandTotal)}.`,
                  );
                  if (href) window.open(href, "_blank");
                }}
              >
                {L.whatsapp}
              </OutlineBtn>
            ) : null}
            <CombinedSaleInvoice
              invoiceData={invoiceModal}
              onClose={() => { setInvoiceModal(null); setPendingSend(null); }}
              isUrdu={isUrdu}
            />
          </div>
        </Modal>
      )}

      {statementOpen && selected && (
        <Modal title={`${selected.name} · ${L.statement}`} onClose={() => { setStatementOpen(false); setPendingPrint(null); }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <OutlineBtn color="#0f766e" onClick={() => setPendingPrint("thermal")}>
                <Icon path={ICONS.print} size={13} /> {L.print}
              </OutlineBtn>
              <OutlineBtn color="#3b82f6" onClick={() => setPendingPrint("a4")}>A4</OutlineBtn>
              <OutlineBtn color="#7c3aed" onClick={() => {
                setPendingPrint("pdf");
                const href = whatsappHref(selected.phone, isUrdu
                  ? `السلام علیکم ${selected.name}، آپ کا کھاتہ بیان منسلک ہے۔ بیلنس: ${formatPKR(Math.abs(netOf(selected)))}۔`
                  : `Assalamualaikum ${selected.name}, your account statement is attached. Balance: ${formatPKR(Math.abs(netOf(selected)))}.`);
                if (href) setTimeout(() => window.open(href, "_blank"), 700);
              }}>
                {L.send}
              </OutlineBtn>
            </div>
            <div style={{ background: "#f0f0f0", padding: 14, borderRadius: 12, border: "1px solid #ccc", width: "100%", overflowX: "auto" }}>
              <PartyLedgerSheet party={selected} entries={entries} isUrdu={isUrdu} compact={pendingPrint === "thermal"} />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
