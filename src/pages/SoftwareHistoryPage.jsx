import { useEffect, useMemo, useState } from "react";
import { useTheme } from "../context/ThemeContext";
import { useLang } from "../context/LangContext";
import { DateFilterBar, Table, useResponsive } from "../components/shared";
import { api } from "../utils/api";
import { filterDateRange, formatDateTime, formatHistoryQty } from "../utils/helpers";

const TYPES = [
  { id: "all", en: "All", ur: "سب" },
  { id: "sale", en: "Sale", ur: "فروخت" },
  { id: "purchase", en: "Purchase", ur: "خریداری" },
  { id: "stock-edit", en: "Edit", ur: "ایڈٹ" },
  { id: "purchase-delete", en: "Delete", ur: "حذف" },
  { id: "sale-delete", en: "Sale delete", ur: "فروخت حذف" },
];

function typeLabel(type, isUrdu) {
  const row = TYPES.find((t) => t.id === type);
  if (row) return isUrdu ? row.ur : row.en;
  return type;
}

function typeColor(type) {
  if (type === "sale") return "#34d399";
  if (type === "purchase") return "#60a5fa";
  if (type === "stock-edit") return "#fbbf24";
  if (type === "purchase-delete" || type === "sale-delete") return "#f87171";
  return "#a78bfa";
}

export default function SoftwareHistoryPage() {
  const th = useTheme();
  const { lang } = useLang();
  const { isMobile } = useResponsive();
  const isUrdu = lang === "ur";
  const [filter, setFilter] = useState("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [kind, setKind] = useState("all");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    const range = filterDateRange(filter, customFrom, customTo);
    setLoading(true);
    api.getActivity({ ...range, type: kind === "all" || kind === "delete" || kind === "stock-edit" ? "" : kind, limit: 800 })
      .then((r) => {
        if (!live) return;
        let list = r?.activities || [];
        if (kind === "delete") list = list.filter((a) => String(a.type || "").includes("delete"));
        if (kind === "stock-edit") list = list.filter((a) => String(a.type || "").includes("edit"));
        setRows(list);
      })
      .catch(() => { if (live) setRows([]); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [filter, customFrom, customTo, kind]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((a) => [a.productName, a.invoice, a.party, a.summary, a.type, a.byName].filter(Boolean).join(" ").toLowerCase().includes(q));
  }, [rows, search]);

  const chips = [
    { id: "all", en: "All", ur: "سب" },
    { id: "sale", en: "Sale", ur: "فروخت" },
    { id: "purchase", en: "Purchase", ur: "خریداری" },
    { id: "stock-edit", en: "Edit", ur: "ایڈٹ" },
    { id: "delete", en: "Delete", ur: "حذف" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <h2 style={{ margin: 0, color: th.text, fontSize: 18 }}>{isUrdu ? "سافٹ ویئر ہسٹری" : "Software History"}</h2>
        <p style={{ margin: "4px 0 0", color: th.textMuted, fontSize: 13 }}>
          {isUrdu ? "آج، ہفتہ، مہینہ — فروخت، خرید، ایڈٹ، حذف" : "Today, week, month — sales, purchases, edits, deletes"}
        </p>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "12px 14px", borderRadius: 14, border: `1px solid ${th.border}`, background: th.bgCard }}>
        <DateFilterBar
          filter={filter}
          setFilter={setFilter}
          customFrom={customFrom}
          setCustomFrom={setCustomFrom}
          customTo={customTo}
          setCustomTo={setCustomTo}
          search={search}
          setSearch={setSearch}
          searchPlaceholder={isUrdu ? "پروڈکٹ / انوائس" : "Product / invoice"}
        />
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {chips.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setKind(c.id)}
            style={{
              padding: "7px 12px", borderRadius: 10, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 12,
              background: kind === c.id ? "linear-gradient(135deg,#1abc9c,#2980b9)" : th.thHead,
              color: kind === c.id ? "#fff" : th.textMuted,
            }}
          >
            {isUrdu ? c.ur : c.en}
          </button>
        ))}
      </div>
      <Table
        compact
        loading={loading && shown.length === 0}
        empty={loading ? (isUrdu ? "لوڈ ہو رہا ہے…" : "Loading…") : undefined}
        cols={[isUrdu ? "وقت" : "When", isUrdu ? "قسم" : "Type", isUrdu ? "پروڈکٹ" : "Product", isUrdu ? "انوائس" : "Invoice", isUrdu ? "مقدار" : "Qty", isUrdu ? "تفصیل" : "Detail"]}
        rows={shown.map((a) => ({
          data: a,
          cells: [
            <span style={{ whiteSpace: "nowrap", fontSize: 12 }}>{formatDateTime(a.date, a.createdAt)}</span>,
            <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, fontWeight: 700, background: `${typeColor(a.type)}22`, color: typeColor(a.type) }}>{typeLabel(a.type, isUrdu)}</span>,
            a.productName || "—",
            <span style={{ fontFamily: "monospace", fontSize: 12 }}>{a.invoice || "—"}</span>,
            formatHistoryQty(a),
            <span style={{ color: th.textMuted, fontSize: 12 }}>{a.party || a.summary || a.byName || "—"}</span>,
          ],
        }))}
      />
      {!isMobile && <p style={{ color: th.textDim, fontSize: 12, margin: 0 }}>{shown.length} {isUrdu ? "ریکارڈ" : "records"}</p>}
    </div>
  );
}
