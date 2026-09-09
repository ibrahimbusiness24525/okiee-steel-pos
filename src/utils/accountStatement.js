function accId(acc) {
  return String(acc?._id || acc?.id || "");
}

function nameOf(acc) {
  return String(acc?.name || acc?.accountName || "").trim().toLowerCase();
}

function matchesAccount(rec, acc) {
  if (!rec || !acc) return false;
  const id = accId(acc);
  if (id && rec.accountId && String(rec.accountId) === id) return true;
  const recName = String(rec.accountName || "").trim().toLowerCase();
  const accName = nameOf(acc);
  return Boolean(recName && accName && recName === accName);
}

function groupByInvoice(list) {
  const map = new Map();
  (list || []).forEach((rec) => {
    const key = `${rec.invoice || rec.invoiceNum || rec._id}|${rec.date || ""}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(rec);
  });
  return [...map.values()].map((items) => {
    const stamp = items.reduce((m, r) => {
      const s = String(r.createdAt || r.date || "");
      return s > m ? s : m;
    }, "");
    const ordered = items.slice().sort((a, b) =>
      String(a.createdAt || "").localeCompare(String(b.createdAt || ""))
    );
    return { items: ordered, head: ordered[0], stamp };
  });
}

function groupTotal(group) {
  const head = group.head || {};
  const items = group.items || [];
  if (items.length === 1) {
    return Number(head.grandTotal) || Number(head.total) || 0;
  }
  return items.reduce((s, r) => s + (Number(r.grandTotal) || Number(r.total) || 0), 0);
}

function cashPaid(group) {
  const head = group.head || {};
  const remaining = Number(head.remainingAmount) || 0;
  const paid = Number(head.paidAmount);
  const total = groupTotal(group);
  if (head.settlement === "credit" || head.paymentMethod === "credit") {
    return Number.isFinite(paid) && paid > 0 ? paid : 0;
  }
  if (Number.isFinite(paid) && paid > 0) return paid;
  return Math.max(0, Math.round((total - remaining) * 100) / 100);
}

function money(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function sortKey(line) {
  return `${line.date || "0000-00-00"}|${line.createdAt || ""}`;
}

/**
 * Rebuild an account's money in / money out from sales, purchases, and expenses.
 * Opening is the account opening balance; closing is opening + in − out.
 */
export function buildAccountStatement(account, { sales = [], purchases = [], expenses = [] } = {}) {
  const opening = money(account?.openingBalance);
  const lines = [];

  groupByInvoice(sales).forEach((g) => {
    if (!matchesAccount(g.head, account)) return;
    const amt = cashPaid(g);
    if (amt <= 0) return;
    const inv = g.head.invoice || g.head.invoiceNum || "";
    lines.push({
      date: g.head.date || "",
      createdAt: g.head.createdAt || g.stamp || "",
      type: "sale",
      label: inv ? `Sale ${inv}` : "Sale",
      detail: g.head.customer || "",
      inAmt: amt,
      outAmt: 0,
    });
  });

  groupByInvoice(purchases).forEach((g) => {
    if (!matchesAccount(g.head, account)) return;
    const amt = cashPaid(g);
    if (amt <= 0) return;
    const inv = g.head.invoice || g.head.invoiceNum || "";
    lines.push({
      date: g.head.date || "",
      createdAt: g.head.createdAt || g.stamp || "",
      type: "purchase",
      label: inv ? `Purchase ${inv}` : "Purchase",
      detail: g.head.supplier || "",
      inAmt: 0,
      outAmt: amt,
    });
  });

  (expenses || []).forEach((e) => {
    if (!matchesAccount(e, account)) return;
    if ((e.payMode || "paid") === "payable") return;
    const amt = money(e.amount);
    if (amt <= 0) return;
    lines.push({
      date: e.date || "",
      createdAt: e.createdAt || "",
      type: "expense",
      label: `Expense · ${e.type || "Misc"}`,
      detail: e.note || e.invoice || "",
      inAmt: 0,
      outAmt: amt,
    });
  });

  lines.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

  let bal = opening;
  const withBal = lines.map((l) => {
    bal = money(bal + l.inAmt - l.outAmt);
    return { ...l, balance: bal };
  });

  const totalIn = money(withBal.reduce((s, l) => s + l.inAmt, 0));
  const totalOut = money(withBal.reduce((s, l) => s + l.outAmt, 0));

  return {
    opening,
    lines: withBal,
    closing: bal,
    totalIn,
    totalOut,
  };
}
