import { ledgerApi } from "./ledgerStore";
import { todayStr } from "./helpers";
import { adjustAccountBalance, localAccountDelta, serverBalance } from "./accountBalance";

function partyId(p) {
  return p?._id || p?.id || "";
}

export function liveBalance(acc) {
  return serverBalance(acc) + localAccountDelta(acc);
}

export async function ensureParty(type, name) {
  const n = (name || "").trim();
  if (!n || (type !== "supplier" && type !== "customer")) return null;
  const match = (list) => (list || []).find(
    (p) => (p.name || "").trim().toLowerCase() === n.toLowerCase()
  );
  const r = await ledgerApi.list(type);
  const found = match(r.parties);
  if (found) return found;
  const created = await ledgerApi.add({
    type,
    name: n,
    phone: "-",
    openingBalance: 0,
  });
  if (created?.party) return created.party;
  const r2 = await ledgerApi.list(type);
  return match(r2.parties) || null;
}

export async function recordTradeFinance({
  kind,
  partyName,
  invoice,
  date,
  paid,
  remaining,
  accountId,
}) {
  const type = kind === "sale" ? "customer" : "supplier";
  const rem = Math.round((Number(remaining) || 0) * 100) / 100;
  const pay = Math.round((Number(paid) || 0) * 100) / 100;
  const inv = (invoice || "").trim();
  const when = date || todayStr();

  if (rem > 0 && (partyName || "").trim()) {
    try {
      const party = await ensureParty(type, partyName);
      if (party && partyId(party)) {
        await ledgerApi.addEntry(partyId(party), {
          kind: "credit",
          amount: rem,
          date: when,
          invoice: inv,
          note: kind === "sale"
            ? `Sale ${inv} — receivable`
            : `Purchase ${inv} — payable`,
        });
      }
    } catch (e) {
      console.error("ledger credit failed", e);
    }
  }

  if (pay > 0 && accountId) {
    try {
      await adjustAccountBalance(accountId, {
        amount: pay,
        direction: kind === "sale" ? "in" : "out",
      });
    } catch (e) {
      console.error("account adjust failed", e);
    }
  }
}

export function invoicePayInfo(recOrRows) {
  const head = Array.isArray(recOrRows) ? (recOrRows[0] || {}) : (recOrRows || {});
  const remaining = Number(head.remainingAmount) || 0;
  const settlement = String(head.settlement || "").toLowerCase();
  const method = String(head.paymentMethod || "").toLowerCase();
  const isCredit = settlement === "credit" || method === "credit" || remaining > 0.5;
  return {
    isCredit,
    remaining,
    accountId: head.accountId || "",
    settlement: isCredit
      ? (settlement === "partial" || (remaining > 0 && settlement !== "credit") ? "partial" : "credit")
      : "paid",
  };
}

export async function applyReturnFinance({
  kind,
  partyName,
  invoice,
  date,
  returnTotal,
  remaining,
  accountId,
  accountName,
  isCredit,
  reverseLedger,
}) {
  const ret = Math.round((Number(returnTotal) || 0) * 100) / 100;
  if (ret <= 0) return;
  const rem = Math.round((Number(remaining) || 0) * 100) / 100;
  const type = kind === "sale" ? "customer" : "supplier";
  const inv = (invoice || "").trim();
  const when = date || todayStr();
  const credit = isCredit || rem > 0.5;
  const doLedger = reverseLedger === true || (reverseLedger !== false && credit);

  let leftover = ret;
  if (doLedger && (partyName || "").trim()) {
    const cut = rem > 0.5 ? Math.min(ret, rem) : ret;
    try {
      const party = await ensureParty(type, partyName);
      if (party && partyId(party)) {
        await ledgerApi.addEntry(partyId(party), {
          kind: kind === "sale" ? "take" : "give",
          amount: cut,
          date: when,
          invoice: inv,
          note: kind === "sale"
            ? `Sale return ${inv} — receivable`
            : `Purchase return ${inv} — payable`,
        });
      }
    } catch (e) {
      console.error("return ledger failed", e);
    }
    leftover = Math.round((ret - cut) * 100) / 100;
  }

  if (leftover > 0.5 && accountId) {
    try {
      await adjustAccountBalance(accountId, {
        amount: leftover,
        direction: kind === "sale" ? "out" : "in",
        accountName,
      });
    } catch (e) {
      console.error("return cash failed", e);
    }
  }
}

export async function reverseTradeFinance({
  kind,
  partyName,
  invoice,
  paid,
  accountId,
}) {
  const type = kind === "sale" ? "customer" : "supplier";
  const n = (partyName || "").trim();
  const inv = (invoice || "").trim();
  const pay = Math.round((Number(paid) || 0) * 100) / 100;

  if (n && inv) {
    try {
      const r = await ledgerApi.list(type);
      const party = (r.parties || []).find(
        (p) => (p.name || "").trim().toLowerCase() === n.toLowerCase()
      );
      if (party && partyId(party)) {
        const det = await ledgerApi.get(partyId(party));
        const ents = (det.entries || []).filter(
          (e) => (e.invoice || "").trim() === inv && e.kind === "credit"
        );
        for (const e of ents) {
          await ledgerApi.removeEntry(partyId(party), e._id || e.id);
        }
      }
    } catch (e) {
      console.error("ledger reverse failed", e);
    }
  }

  if (pay > 0 && accountId) {
    try {
      await adjustAccountBalance(accountId, {
        amount: pay,
        direction: kind === "sale" ? "out" : "in",
      });
    } catch (e) {
      console.error("account reverse failed", e);
    }
  }
}
