import { api } from "./api";

const KEY = "steelpos_account_delta_v1";

function readMap() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && typeof d === "object" && !Array.isArray(d)) return d;
  } catch { /* ignore */ }
  return {};
}
function writeMap(m) {
  localStorage.setItem(KEY, JSON.stringify(m));
}

export function localAccountDelta(accOrId) {
  const m = readMap();
  if (typeof accOrId !== "object") return Number(m[String(accOrId || "")]) || 0;
  const id = String(accOrId?._id || accOrId?.id || "");
  const name = String(accOrId?.name || accOrId?.accountName || "").trim().toLowerCase();
  return (Number(m[id]) || 0) + (name ? (Number(m[`name:${name}`]) || 0) : 0);
}

function addLocalDelta(id, delta) {
  if (!id) return;
  const m = readMap();
  const next = (Number(m[id]) || 0) + delta;
  if (Math.abs(next) < 0.005) delete m[id];
  else m[id] = Math.round(next * 100) / 100;
  writeMap(m);
}

function clearLocalDelta(id) {
  if (!id) return;
  const m = readMap();
  delete m[id];
  writeMap(m);
}

/** Balance from the server document only (no local overlay). */
export function serverBalance(acc) {
  if (!acc) return 0;
  if (acc.balanceReady) {
    const n = Number(acc.currentBalance);
    return Number.isFinite(n) ? n : 0;
  }
  const cur = Number(acc.currentBalance);
  if (Number.isFinite(cur) && cur !== 0) return cur;
  return Number(acc.openingBalance) || 0;
}

async function tryAdjustApi(id, amount, direction) {
  try {
    return await api.adjustAccount(id, { amount, direction });
  } catch (e) {
    return { success: false, message: e.message };
  }
}

function pickAccount(list, accountId, accountName) {
  const wantId = String(accountId || "");
  const wantName = String(accountName || "").trim().toLowerCase();
  return (list || []).find((a) => {
    const id = String(a._id || a.id || "");
    if (wantId && id === wantId) return true;
    const n = String(a.name || a.accountName || "").trim().toLowerCase();
    return Boolean(wantName && n && n === wantName);
  }) || null;
}

/**
 * Move money in or out of an account.
 * 1) POST /accounts/:id/adjust when the server has that route
 * 2) PUT currentBalance on older backends
 * 3) Local overlay so the UI still shows the cut
 */
export async function adjustAccountBalance(accountId, { amount, direction, accountName } = {}) {
  const amt = Math.round((Math.abs(Number(amount) || 0)) * 100) / 100;
  if (!amt) throw new Error("Amount must be greater than 0");
  const dir = direction === "out" ? "out" : "in";
  const signed = dir === "out" ? -amt : amt;

  if (accountId) {
    const r = await tryAdjustApi(accountId, amt, dir);
    if (r?.success) {
      clearLocalDelta(accountId);
      return r;
    }
  }

  try {
    const list = await api.getAccounts();
    const acc = pickAccount(list.accounts, accountId, accountName);
    if (acc) {
      const id = acc._id || acc.id;
      const viaAdjust = await tryAdjustApi(id, amt, dir);
      if (viaAdjust?.success) {
        clearLocalDelta(id);
        return viaAdjust;
      }
      const next = Math.round((serverBalance(acc) + signed) * 100) / 100;
      const u = await api.updateAccount(id, { currentBalance: next, balanceReady: true });
      if (u?.success) {
        clearLocalDelta(id);
        return { success: true, account: u.account, via: "put" };
      }
    }
  } catch { /* fall through to local */ }

  const id = accountId || `name:${String(accountName || "").trim().toLowerCase()}`;
  addLocalDelta(id, signed);
  return { success: true, local: true };
}

export async function flushLocalAccountDeltas() {
  const m = readMap();
  const ids = Object.keys(m);
  if (!ids.length) return;
  for (const id of ids) {
    const delta = Number(m[id]) || 0;
    const amt = Math.round(Math.abs(delta) * 100) / 100;
    if (!amt) {
      clearLocalDelta(id);
      continue;
    }
    const dir = delta < 0 ? "out" : "in";
    const r = await tryAdjustApi(id, amt, dir);
    if (r?.success) clearLocalDelta(id);
  }
}
