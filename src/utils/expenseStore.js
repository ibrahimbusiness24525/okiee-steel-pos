import { api } from "./api";
import { ledgerApi } from "./ledgerStore";
import { ensureParty } from "./tradeFinance";
import { adjustAccountBalance, flushLocalAccountDeltas } from "./accountBalance";

const KEY = "steelpos_expenses_v1";
const TYPE_KEY = "steelpos_expense_types_v1";
const APPLIED_KEY = "steelpos_expense_acct_v1";

export const DEFAULT_EXPENSE_TYPES = [
  "Rent", "Salary", "Electricity", "Gas", "Water",
  "Transport", "Food", "Repair", "Internet", "Misc",
];

function nid() {
  return "ex_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function readList() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && Array.isArray(d.expenses)) return d.expenses;
  } catch { /* ignore */ }
  return [];
}
function writeList(expenses) {
  localStorage.setItem(KEY, JSON.stringify({ expenses }));
}
function seedTypeItems() {
  return DEFAULT_EXPENSE_TYPES.map((name) => ({
    _id: "def:" + name.toLowerCase(),
    key: "def:" + name.toLowerCase(),
    name,
    removed: false,
  }));
}
function readTypeItems() {
  try {
    const d = JSON.parse(localStorage.getItem(TYPE_KEY));
    if (d && Array.isArray(d.items)) return d.items;
    if (Array.isArray(d) && d.every((x) => typeof x === "string")) {
      const items = seedTypeItems();
      d.forEach((name) => {
        const n = String(name || "").trim();
        if (n && !items.some((i) => !i.removed && i.name.toLowerCase() === n.toLowerCase())) {
          items.push({ _id: "cus:" + n.toLowerCase(), key: "cus:" + n.toLowerCase(), name: n, removed: false });
        }
      });
      writeTypeItems(items);
      return items;
    }
  } catch { /* ignore */ }
  const items = seedTypeItems();
  writeTypeItems(items);
  return items;
}
function writeTypeItems(items) {
  localStorage.setItem(TYPE_KEY, JSON.stringify({ items }));
}
function activeTypeItems() {
  return readTypeItems().filter((t) => !t.removed);
}

function isRemoteOk(r) {
  return r && r.success === true;
}

function readApplied() {
  try {
    const d = JSON.parse(localStorage.getItem(APPLIED_KEY));
    if (Array.isArray(d)) return new Set(d.map(String));
  } catch { /* ignore */ }
  return new Set();
}
function writeApplied(set) {
  localStorage.setItem(APPLIED_KEY, JSON.stringify([...set]));
}
function isAccountApplied(id) {
  if (!id) return false;
  return readApplied().has(String(id));
}
function markAccountApplied(id) {
  if (!id) return;
  const s = readApplied();
  s.add(String(id));
  writeApplied(s);
}
function unmarkAccountApplied(id) {
  if (!id) return;
  const s = readApplied();
  s.delete(String(id));
  writeApplied(s);
}

function shouldCutAccount(exp) {
  const mode = exp?.payMode || "paid";
  return mode !== "payable";
}

async function adjustAccountOrThrow(exp, direction) {
  const amt = Math.round((Number(exp.amount) || 0) * 100) / 100;
  if (amt <= 0) return null;
  const r = await adjustAccountBalance(exp.accountId, {
    amount: amt,
    direction,
    accountName: exp.accountName,
  });
  if (!r?.success) {
    throw new Error(r?.message || "Account balance was not updated");
  }
  return r;
}

const local = {
  list() {
    return { success: true, expenses: readList().sort((a, b) => String(b.date).localeCompare(String(a.date))), remote: false };
  },
  add(payload) {
    const amount = Number(payload.amount);
    if (!amount || amount <= 0) return { success: false, message: "Amount must be greater than 0" };
    const type = String(payload.type || "").trim();
    if (!type) return { success: false, message: "Expense type is required" };
    const expenses = readList();
    const expense = {
      _id: nid(),
      date: payload.date || new Date().toISOString().slice(0, 10),
      type,
      amount,
      note: payload.note || "",
      payMode: payload.payMode || "paid",
      accountId: payload.accountId || "",
      accountName: payload.accountName || "",
      partyName: payload.partyName || "",
      partyType: payload.partyType || "",
      invoice: "",
      createdAt: new Date().toISOString(),
    };
    expense.invoice = `EXP-${String(expense._id).slice(-6).toUpperCase()}`;
    expenses.unshift(expense);
    writeList(expenses);
    const items = readTypeItems();
    if (!items.some((t) => !t.removed && t.name.toLowerCase() === type.toLowerCase())) {
      items.push({ _id: "cus:" + type.toLowerCase() + Date.now().toString(36), key: "cus:" + Date.now().toString(36), name: type, removed: false });
      writeTypeItems(items);
    }
    return { success: true, expense, remote: false };
  },
  update(id, payload) {
    const expenses = readList();
    const i = expenses.findIndex((e) => e._id === id);
    if (i < 0) return { success: false, message: "Expense not found" };
    expenses[i] = { ...expenses[i], ...payload, _id: expenses[i]._id, invoice: expenses[i].invoice };
    writeList(expenses);
    return { success: true, expense: expenses[i], remote: false };
  },
  remove(id) {
    const expenses = readList();
    writeList(expenses.filter((e) => e._id !== id));
    return { success: true, remote: false };
  },
  types() {
    const items = activeTypeItems();
    return { success: true, types: items.map((t) => t.name), records: items, custom: items, remote: false };
  },
  addType(name) {
    const n = String(name || "").trim();
    if (!n) return { success: false, message: "Type name is required" };
    const items = readTypeItems();
    const hit = items.find((t) => t.name.toLowerCase() === n.toLowerCase());
    if (hit) {
      hit.removed = false;
      hit.name = n;
      writeTypeItems(items);
      return { success: true, type: hit, remote: false };
    }
    const type = { _id: "cus:" + Date.now().toString(36), key: "cus:" + Date.now().toString(36), name: n, removed: false };
    items.push(type);
    writeTypeItems(items);
    return { success: true, type, remote: false };
  },
  updateType(id, name) {
    const n = String(name || "").trim();
    if (!n) return { success: false, message: "Type name is required" };
    const items = readTypeItems();
    const i = items.findIndex((t) => String(t._id) === String(id) || t.name === id);
    if (i < 0) return { success: false, message: "Type not found" };
    const clash = items.find((t) => t !== items[i] && !t.removed && t.name.toLowerCase() === n.toLowerCase());
    if (clash) return { success: false, message: "This type already exists" };
    const oldName = items[i].name;
    items[i] = { ...items[i], name: n, removed: false };
    writeTypeItems(items);
    if (oldName !== n) {
      const expenses = readList().map((e) => (e.type === oldName ? { ...e, type: n } : e));
      writeList(expenses);
    }
    return { success: true, type: items[i], remote: false };
  },
  removeType(id) {
    const items = readTypeItems();
    const i = items.findIndex((t) => String(t._id) === String(id) || t.name === id || t.key === id);
    if (i < 0) return { success: true, remote: false };
    if (String(items[i].key || items[i]._id || "").startsWith("def:")) {
      items[i] = { ...items[i], removed: true };
    } else {
      items.splice(i, 1);
    }
    writeTypeItems(items);
    return { success: true, remote: false };
  },
};

export async function applyExpenseFinance(exp) {
  const amt = Math.round((Number(exp.amount) || 0) * 100) / 100;
  const inv = (exp.invoice || `EXP-${exp._id}`).trim();
  const when = exp.date || new Date().toISOString().slice(0, 10);
  if (shouldCutAccount(exp) && (exp.accountId || exp.accountName) && amt > 0) {
    if (!isAccountApplied(exp._id)) {
      await adjustAccountOrThrow(exp, "out");
      markAccountApplied(exp._id);
    }
  }
  if (exp.payMode === "payable" && (exp.partyName || "").trim()) {
    const party = await ensureParty("supplier", exp.partyName);
    const pid = party?._id || party?.id;
    if (pid) {
      await ledgerApi.addEntry(pid, {
        kind: "credit",
        amount: amt,
        date: when,
        invoice: inv,
        note: `Expense · ${exp.type}${exp.note ? ` — ${exp.note}` : ""}`,
      });
    }
  }
  if (exp.payMode === "receivable" && (exp.partyName || "").trim()) {
    const party = await ensureParty("customer", exp.partyName);
    const pid = party?._id || party?.id;
    if (pid) {
      await ledgerApi.addEntry(pid, {
        kind: "credit",
        amount: amt,
        date: when,
        invoice: inv,
        note: `Expense · ${exp.type}${exp.note ? ` — ${exp.note}` : ""}`,
      });
    }
  }
}

export async function reverseExpenseFinance(exp) {
  const amt = Math.round((Number(exp.amount) || 0) * 100) / 100;
  const inv = (exp.invoice || "").trim();
  if (shouldCutAccount(exp) && (exp.accountId || exp.accountName) && amt > 0) {
    try {
      await adjustAccountOrThrow(exp, "in");
    } catch (e) {
      console.error("expense account reverse failed", e);
    }
    unmarkAccountApplied(exp._id);
  }
  const type = exp.payMode === "payable" ? "supplier" : exp.payMode === "receivable" ? "customer" : "";
  const n = (exp.partyName || "").trim();
  if (type && n && inv) {
    try {
      const r = await ledgerApi.list(type);
      const party = (r.parties || []).find((p) => (p.name || "").trim().toLowerCase() === n.toLowerCase());
      const pid = party?._id || party?.id;
      if (pid) {
        const det = await ledgerApi.get(pid);
        const ents = (det.entries || []).filter((e) => (e.invoice || "").trim() === inv && e.kind === "credit");
        for (const e of ents) await ledgerApi.removeEntry(pid, e._id || e.id);
      }
    } catch (e) {
      console.error("expense ledger reverse failed", e);
    }
  }
}

/** Cut cash for expenses that were saved but never applied to the account. */
export async function ensurePendingAccountCuts(expenses) {
  await flushLocalAccountDeltas();
  for (const e of expenses || []) {
    const id = e?._id;
    if (!id || isAccountApplied(id)) continue;
    if (!shouldCutAccount(e) || !(e.accountId || e.accountName)) continue;
    if (!(Number(e.amount) > 0)) continue;
    try {
      await applyExpenseFinance(e);
    } catch (err) {
      console.error("expense account cut failed", err);
    }
  }
}

export const expenseApi = {
  async list() {
    try {
      const r = await api.getExpenses();
      if (isRemoteOk(r)) return { ...r, expenses: r.expenses || [], remote: true };
    } catch { /* local */ }
    return local.list();
  },
  async add(payload) {
    try {
      const r = await api.addExpense(payload);
      if (isRemoteOk(r)) return { ...r, remote: true };
      if (r && r.message && r.message !== "Route not found") return r;
    } catch { /* local */ }
    return local.add(payload);
  },
  async update(id, payload) {
    try {
      const r = await api.updateExpense(id, payload);
      if (isRemoteOk(r)) return { ...r, remote: true };
      if (r && r.message && r.message !== "Route not found") return r;
    } catch { /* local */ }
    return local.update(id, payload);
  },
  async remove(id) {
    try {
      const r = await api.deleteExpense(id);
      if (isRemoteOk(r)) return { ...r, remote: true };
    } catch { /* local */ }
    return local.remove(id);
  },
  async types() {
    try {
      const r = await api.getExpenseTypes();
      if (isRemoteOk(r)) return { ...r, types: r.types || DEFAULT_EXPENSE_TYPES, records: r.records || r.custom || [], remote: true };
    } catch { /* local */ }
    return local.types();
  },
  async addType(name) {
    try {
      const r = await api.addExpenseType({ name });
      if (isRemoteOk(r)) return { ...r, remote: true };
      if (r && r.message && r.message !== "Route not found") return r;
    } catch { /* local */ }
    return local.addType(name);
  },
  async updateType(id, name) {
    try {
      const r = await api.updateExpenseType(id, { name });
      if (isRemoteOk(r)) return { ...r, remote: true };
      if (r && r.message && r.message !== "Route not found") return r;
    } catch { /* local */ }
    return local.updateType(id, name);
  },
  async removeType(id) {
    try {
      const r = await api.deleteExpenseType(id);
      if (isRemoteOk(r)) return { ...r, remote: true };
    } catch { /* local */ }
    return local.removeType(id);
  },
};
