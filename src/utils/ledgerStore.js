import { api } from "./api";

const KEY = "steelpos_ledger_v1";

export function partyTotals(type, opening, entries) {
  let take = 0;
  let give = 0;
  (entries || []).forEach((e) => {
    const a = Number(e.amount) || 0;
    if (e.kind === "take") take += a;
    else if (e.kind === "give") give += a;
    else if (e.kind === "credit") {
      if (type === "supplier") take += a;
      else give += a;
    } else if (e.kind === "cash_in") {
      if (type === "supplier") take += a;
      else give -= a;
    } else if (e.kind === "cash_out") {
      if (type === "supplier") take -= a;
      else give += a;
    }
  });
  const open = Number(opening) || 0;
  if (type === "supplier") take += open;
  else give += open;
  const net = give - take;
  return {
    take, give, opening: open, balance: net,
    receivable: Math.max(0, net),
    payable: Math.max(0, -net),
  };
}

function read() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && Array.isArray(d.parties) && Array.isArray(d.entries)) return d;
  } catch { /* ignore */ }
  return { parties: [], entries: [] };
}
function write(d) {
  localStorage.setItem(KEY, JSON.stringify(d));
}
function nid() {
  return "lc_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function isRemoteOk(r) {
  return r && r.success === true;
}

const local = {
  list(type) {
    const db = read();
    const parties = db.parties
      .filter((p) => !type || p.type === type)
      .map((p) => {
        const ents = db.entries.filter((e) => e.party === p._id);
        return { ...p, ...partyTotals(p.type, p.openingBalance, ents) };
      })
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    return { success: true, parties, remote: false };
  },
  add(payload) {
    const db = read();
    const name = (payload.name || "").trim();
    if (!name) return { success: false, message: "Name is required" };
    if (!String(payload.phone || "").trim()) return { success: false, message: "Number is required" };
    if (db.parties.some((p) => p.type === payload.type && p.name.toLowerCase() === name.toLowerCase())) {
      return { success: false, message: "This name already exists" };
    }
    const party = {
      _id: nid(),
      type: payload.type,
      name,
      phone: payload.phone || "",
      partyType: payload.partyType || "",
      address: payload.address || "",
      notes: payload.notes || "",
      openingBalance: Number(payload.openingBalance) || 0,
    };
    db.parties.push(party);
    write(db);
    return { success: true, party: { ...party, ...partyTotals(party.type, party.openingBalance, []) }, remote: false };
  },
  get(id) {
    const db = read();
    const party = db.parties.find((p) => p._id === id);
    if (!party) return { success: false, message: "Not found" };
    const entries = db.entries.filter((e) => e.party === id).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return { success: true, party: { ...party, ...partyTotals(party.type, party.openingBalance, entries) }, entries, remote: false };
  },
  update(id, payload) {
    const db = read();
    const i = db.parties.findIndex((p) => p._id === id);
    if (i < 0) return { success: false, message: "Not found" };
    const next = { ...db.parties[i], ...payload, name: (payload.name || db.parties[i].name).trim() };
    if (payload.openingBalance !== undefined) next.openingBalance = Number(payload.openingBalance) || 0;
    db.parties[i] = next;
    write(db);
    const entries = db.entries.filter((e) => e.party === id);
    return { success: true, party: { ...next, ...partyTotals(next.type, next.openingBalance, entries) }, remote: false };
  },
  remove(id) {
    const db = read();
    db.parties = db.parties.filter((p) => p._id !== id);
    db.entries = db.entries.filter((e) => e.party !== id);
    write(db);
    return { success: true, remote: false };
  },
  addEntry(id, payload) {
    const db = read();
    const party = db.parties.find((p) => p._id === id);
    if (!party) return { success: false, message: "Not found" };
    const amt = Number(payload.amount);
    if (!amt || amt <= 0) return { success: false, message: "Amount must be greater than 0" };
    const entry = {
      _id: nid(),
      party: id,
      kind: payload.kind,
      amount: amt,
      date: payload.date || new Date().toISOString().slice(0, 10),
      note: payload.note || "",
      invoice: payload.invoice || "",
    };
    db.entries.push(entry);
    write(db);
    const entries = db.entries.filter((e) => e.party === id).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return { success: true, entry, party: { ...party, ...partyTotals(party.type, party.openingBalance, entries) }, entries, remote: false };
  },
  removeEntry(id, eid) {
    const db = read();
    const party = db.parties.find((p) => p._id === id);
    if (!party) return { success: false, message: "Not found" };
    db.entries = db.entries.filter((e) => e._id !== eid);
    write(db);
    const entries = db.entries.filter((e) => e.party === id);
    return { success: true, party: { ...party, ...partyTotals(party.type, party.openingBalance, entries) }, entries, remote: false };
  },
  importFrom(purchases, sales) {
    const db = read();
    const have = new Set(db.parties.map((p) => `${p.type}::${p.name.toLowerCase()}`));
    let created = 0;
    const add = (type, name) => {
      const n = (name || "").trim();
      if (!n) return;
      const key = `${type}::${n.toLowerCase()}`;
      if (have.has(key)) return;
      db.parties.push({ _id: nid(), type, name: n, phone: "-", partyType: "", address: "", notes: "", openingBalance: 0 });
      have.add(key);
      created += 1;
    };
    (purchases || []).forEach((p) => add("supplier", p.supplier || p.supplierName));
    (sales || []).forEach((s) => add("customer", s.customer));
    write(db);
    return { success: true, created, remote: false };
  },
};

export const ledgerApi = {
  async list(type) {
    try {
      const r = await api.getParties(type);
      if (isRemoteOk(r)) return { ...r, remote: true };
    } catch { /* local */ }
    return local.list(type);
  },
  async add(payload) {
    try {
      const r = await api.addParty(payload);
      if (isRemoteOk(r)) return { ...r, remote: true };
      if (r && r.message && r.message !== "Route not found") return r;
    } catch { /* local */ }
    return local.add(payload);
  },
  async get(id) {
    try {
      const r = await api.getParty(id);
      if (isRemoteOk(r)) return { ...r, remote: true };
    } catch { /* local */ }
    return local.get(id);
  },
  async update(id, payload) {
    try {
      const r = await api.updateParty(id, payload);
      if (isRemoteOk(r)) return { ...r, remote: true };
      if (r && r.message && r.message !== "Route not found") return r;
    } catch { /* local */ }
    return local.update(id, payload);
  },
  async remove(id) {
    try {
      const r = await api.deleteParty(id);
      if (isRemoteOk(r)) return { ...r, remote: true };
    } catch { /* local */ }
    return local.remove(id);
  },
  async addEntry(id, payload) {
    try {
      const r = await api.addPartyEntry(id, payload);
      if (isRemoteOk(r)) return { ...r, remote: true };
      if (r && r.message && r.message !== "Route not found") return r;
    } catch { /* local */ }
    return local.addEntry(id, payload);
  },
  async removeEntry(id, eid) {
    try {
      const r = await api.deletePartyEntry(id, eid);
      if (isRemoteOk(r)) return { ...r, remote: true };
    } catch { /* local */ }
    return local.removeEntry(id, eid);
  },
  async importNames(purchases, sales) {
    try {
      const r = await api.importParties();
      if (isRemoteOk(r)) return { ...r, remote: true };
    } catch { /* local */ }
    return local.importFrom(purchases, sales);
  },
};
