// ─── API Configuration ────────────────────────────────────────────────────────
const getBaseURL = () => {
  const saved = localStorage.getItem("steelpos_api_url");
  if (saved) return saved;
  return import.meta.env.VITE_API_URL || "https://pos-steel-backend-production.up.railway.app/api";
};
export const API = getBaseURL();

const smartFetch = async (url, options) => {
  try {
    const res = await fetch(url, options);
    return res;
  } catch (err) {
    const fallback = url.replace("http://localhost:", "http://127.0.0.1:");
    if (fallback !== url) return fetch(fallback, options);
    throw err;
  }
};
export const getToken = () => localStorage.getItem("steelpos_token");
export const authHeaders = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` });

export const api = {
  login: (email, password) => smartFetch(`${API}/auth/login`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({email,password}) }).then(async r => { const d = await r.json(); if(!r.ok) throw new Error(d.message||"Server error"); return d; }),
  getProducts:   () => smartFetch(`${API}/products`,  {headers:authHeaders()}).then(r=>r.json()),
  addProduct:    (d) => smartFetch(`${API}/products`,  {method:"POST",headers:authHeaders(),body:JSON.stringify(d)}).then(r=>r.json()),
  updateProduct: (id,d) => smartFetch(`${API}/products/${id}`,{method:"PUT",headers:authHeaders(),body:JSON.stringify(d)}).then(r=>r.json()),
  deleteProduct: (id) => smartFetch(`${API}/products/${id}`,{method:"DELETE",headers:authHeaders()}).then(r=>r.json()),
  adjustStock:   (id,type,qty) => smartFetch(`${API}/products/${id}/stock`,{method:"PATCH",headers:authHeaders(),body:JSON.stringify({type,qty})}).then(r=>r.json()),
  getPurchases:  () => smartFetch(`${API}/purchases`, {headers:authHeaders()}).then(r=>r.json()),
  addPurchase:   (d) => smartFetch(`${API}/purchases`,{method:"POST",headers:authHeaders(),body:JSON.stringify(d)}).then(r=>r.json()),
  updatePurchase:(id,d) => smartFetch(`${API}/purchases/${id}`,{method:"PUT",headers:authHeaders(),body:JSON.stringify(d)}).then(r=>r.json()),
  deletePurchase:(id) => smartFetch(`${API}/purchases/${id}`,{method:"DELETE",headers:authHeaders()}).then(r=>r.json()),
  getSales:      () => smartFetch(`${API}/sales`,     {headers:authHeaders()}).then(r=>r.json()),
  addSale:       (d) => smartFetch(`${API}/sales`,    {method:"POST",headers:authHeaders(),body:JSON.stringify(d)}).then(r=>r.json()),
  updateSale:    (id,d) => smartFetch(`${API}/sales/${id}`,{method:"PUT",headers:authHeaders(),body:JSON.stringify(d)}).then(r=>r.json()),
  deleteSale:    (id) => smartFetch(`${API}/sales/${id}`,{method:"DELETE",headers:authHeaders()}).then(r=>r.json()),
  getStaff:      () => smartFetch(`${API}/staff`,     {headers:authHeaders()}).then(r=>r.json()),
  addStaff:      (d) => smartFetch(`${API}/staff`,    {method:"POST",headers:authHeaders(),body:JSON.stringify(d)}).then(r=>r.json()),
  updateStaff:   (id,d) => smartFetch(`${API}/staff/${id}`,{method:"PUT",headers:authHeaders(),body:JSON.stringify(d)}).then(r=>r.json()),
  deleteStaff:   (id) => smartFetch(`${API}/staff/${id}`,{method:"DELETE",headers:authHeaders()}).then(r=>r.json()),
  getAccounts:   () => smartFetch(`${API}/accounts`, {headers:authHeaders()}).then(r=>r.json()),
  addAccount:    (d) => smartFetch(`${API}/accounts`, {method:"POST",headers:authHeaders(),body:JSON.stringify(d)}).then(r=>r.json()),
  updateAccount: (id,d) => smartFetch(`${API}/accounts/${id}`,{method:"PUT",headers:authHeaders(),body:JSON.stringify(d)}).then(r=>r.json()),
  deleteAccount: (id) => smartFetch(`${API}/accounts/${id}`,{method:"DELETE",headers:authHeaders()}).then(r=>r.json()),
  getParties:     (type) => smartFetch(`${API}/parties${type?`?type=${type}`:""}`, {headers:authHeaders()}).then(r=>r.json()),
  addParty:       (d) => smartFetch(`${API}/parties`, {method:"POST",headers:authHeaders(),body:JSON.stringify(d)}).then(r=>r.json()),
  getParty:       (id) => smartFetch(`${API}/parties/${id}`, {headers:authHeaders()}).then(r=>r.json()),
  updateParty:    (id,d) => smartFetch(`${API}/parties/${id}`,{method:"PUT",headers:authHeaders(),body:JSON.stringify(d)}).then(r=>r.json()),
  deleteParty:    (id) => smartFetch(`${API}/parties/${id}`,{method:"DELETE",headers:authHeaders()}).then(r=>r.json()),
  addPartyEntry:  (id,d) => smartFetch(`${API}/parties/${id}/entries`,{method:"POST",headers:authHeaders(),body:JSON.stringify(d)}).then(r=>r.json()),
  deletePartyEntry:(id,eid) => smartFetch(`${API}/parties/${id}/entries/${eid}`,{method:"DELETE",headers:authHeaders()}).then(r=>r.json()),
  importParties:  () => smartFetch(`${API}/parties/import`,{method:"POST",headers:authHeaders()}).then(r=>r.json()),
  saGetAdmins:   () => smartFetch(`${API}/superadmin/admins`, {headers:authHeaders()}).then(r=>r.json()),
  saAddAdmin:    (d) => smartFetch(`${API}/superadmin/admins`, {method:"POST",headers:authHeaders(),body:JSON.stringify(d)}).then(r=>r.json()),
  saUpdateAdmin: (id,d) => smartFetch(`${API}/superadmin/admins/${id}`,{method:"PUT",headers:authHeaders(),body:JSON.stringify(d)}).then(r=>r.json()),
  saDeleteAdmin: (id) => smartFetch(`${API}/superadmin/admins/${id}`,{method:"DELETE",headers:authHeaders()}).then(r=>r.json()),
  saGetStats:    () => smartFetch(`${API}/superadmin/stats`, {headers:authHeaders()}).then(r=>r.json()),
  updateCredentials: (d) => smartFetch(`${API}/auth/update-credentials`, {method:"PUT",headers:authHeaders(),body:JSON.stringify(d)}).then(r=>r.json()),
  getLoaders:    ()      => smartFetch(`${API}/loaders`,     {headers:authHeaders()}).then(r=>r.json()),
  addLoader:     (d)     => smartFetch(`${API}/loaders`,     {method:"POST",headers:authHeaders(),body:JSON.stringify(d)}).then(r=>r.json()),
  updateLoader:  (id,d)  => smartFetch(`${API}/loaders/${id}`,{method:"PUT",headers:authHeaders(),body:JSON.stringify(d)}).then(r=>r.json()),
  deleteLoader:  (id)    => smartFetch(`${API}/loaders/${id}`,{method:"DELETE",headers:authHeaders()}).then(r=>r.json()),
  getDailyLoaders: (date)=> smartFetch(`${API}/loaders/daily?date=${date}`,{headers:authHeaders()}).then(r=>r.json()),
  translateUrdu: (text) => smartFetch(`${API}/translate/urdu`, {method:"POST",headers:authHeaders(),body:JSON.stringify({text})}).then(r=>r.json()),
};