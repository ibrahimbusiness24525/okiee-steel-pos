import { useState, useEffect } from "react";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import { LangProvider, useLang } from "./context/LangContext";
import { useResponsive } from "./components/shared";
import { Sidebar, Topbar, BottomNav } from "./components/Layout";
import { api, API, authHeaders } from "./utils/api";
import { listPurchaseReturns, listSaleReturns } from "./utils/returnsStore";

// Pages
import LoginPage from "./pages/LoginPage";
import Dashboard from "./pages/DashboardPage";
import ProductsPage from "./pages/ProductsPage";
import PurchasePage from "./pages/PurchasePage";
import SalesPage from "./pages/SalesPage";
import AccountsPage from "./pages/AccountsPage";
import LedgerPage from "./pages/LedgerPage";
import StaffPage from "./pages/StaffPage";
import LoadersPage from "./pages/LoadersPage";
import ShopProfilePage from "./pages/ShopProfilePage";
import AdminProfilePage from "./pages/AdminProfilePage";
import BillingPage from "./pages/BillingPage";
import SuperAdminPage from "./pages/SuperAdminPage";

// ── Okiiee Loading Screen ────────────────────────────────────────────────────
function AppLoader() {
  return (
    <div style={{
      minHeight:"100vh",
      display:"flex",
      alignItems:"center",
      justifyContent:"center",
      background:"#0d1117",
      position:"relative",
      overflow:"hidden",
    }}>
      <style>{`
        @keyframes okSpin { to { transform: rotate(360deg); } }
        @keyframes okDot  { 0%,80%,100%{transform:scale(0.6);opacity:0.4} 40%{transform:scale(1.1);opacity:1} }
        @keyframes okFloat{ from{transform:translateY(0px)} to{transform:translateY(-12px)} }
        @keyframes okPulse{ from{opacity:0.5} to{opacity:1} }
      `}</style>

      <div style={{
        position:"absolute", inset:0, pointerEvents:"none",
        backgroundImage:"linear-gradient(rgba(124,110,247,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(124,110,247,0.04) 1px,transparent 1px)",
        backgroundSize:"60px 60px",
      }}/>

      <div style={{ position:"absolute", top:-100, left:-100, width:350, height:350, borderRadius:"50%", background:"radial-gradient(circle,rgba(124,110,247,0.1) 0%,transparent 70%)", pointerEvents:"none" }}/>
      <div style={{ position:"absolute", bottom:-100, right:-100, width:350, height:350, borderRadius:"50%", background:"radial-gradient(circle,rgba(26,188,156,0.08) 0%,transparent 70%)", pointerEvents:"none" }}/>

      <div style={{ textAlign:"center", position:"relative", zIndex:1 }}>
        <div style={{ display:"flex", justifyContent:"center", marginBottom:20, animation:"okFloat 3.5s ease-in-out infinite alternate" }}>
          <svg width="68" height="68" viewBox="0 0 100 100" fill="none"
            style={{ animation:"okSpin 18s linear infinite", transformOrigin:"center" }}>
            {[0,30,60,90,120,150,180,210,240,270,300,330].map((deg, i) => (
              <rect key={i} x="44" y="2" width="12" height="16" rx="3"
                fill="#7c6ef7"
                transform={`rotate(${deg} 50 50)`}
              />
            ))}
            <path d="M 50 18 A 32 32 0 1 1 18 50" stroke="#7c6ef7" strokeWidth="12" fill="none" strokeLinecap="round"/>
            <circle cx="50" cy="50" r="14" fill="#0d1117"/>
          </svg>
        </div>

        <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:10, marginBottom:4 }}>
          <span style={{ fontFamily:"'Inter','Segoe UI',sans-serif", fontWeight:800, fontSize:22, letterSpacing:"-0.02em", color:"white" }}>
            Oki<span style={{ color:"#7c6ef7" }}>iee</span>
          </span>
          <span style={{ color:"rgba(255,255,255,0.15)", fontSize:16 }}>×</span>
          <span style={{ color:"white", fontWeight:900, fontSize:20, letterSpacing:"0.18em", fontFamily:"monospace" }}>
            STEEL<span style={{ color:"#1abc9c" }}>POS</span>
          </span>
        </div>

        <div style={{ color:"#4b5563", fontSize:12, letterSpacing:"0.06em", marginBottom:20 }}>
          Management System
        </div>

        <div style={{ display:"flex", gap:7, justifyContent:"center" }}>
          {[0,1,2].map(i => (
            <div key={i} style={{
              width:7, height:7, borderRadius:"50%",
              background:"#7c6ef7",
              animation:`okDot 1.2s ${i * 0.2}s ease-in-out infinite`,
            }}/>
          ))}
        </div>
      </div>
    </div>
  );
}

const PAGE_KEY = "steelpos_active_page";
const ROLE_PAGES = {
  admin: ["dashboard", "products", "purchase", "sales", "accounts", "ledger", "staff", "loaders", "shop-profile", "profile"],
  staff: ["billing", "loaders"],
  superadmin: ["superadmin"],
};
const homePage = (role) => (role === "admin" ? "dashboard" : role === "superadmin" ? "superadmin" : "billing");
const savedPage = (role) => {
  try {
    const saved = localStorage.getItem(PAGE_KEY);
    if (saved && (ROLE_PAGES[role] || []).includes(saved)) return saved;
  } catch { /* ignore */ }
  return homePage(role);
};
function AppInner() {
  const th = useTheme();
  const { t, isUrdu } = useLang();
  const { isMobile } = useResponsive();
  const showSidebar = !isMobile;

  const [user,      setUser]      = useState(null);
  const [active,    setActiveState] = useState(() => {
    try { return localStorage.getItem(PAGE_KEY) || "dashboard"; } catch { return "dashboard"; }
  });
  const setActive = (page) => {
    setActiveState(page);
    try { localStorage.setItem(PAGE_KEY, page); } catch { /* ignore */ }
  };
  const [loading,   setLoading]   = useState(true);
  const [products,  setProducts]  = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [sales,     setSales]     = useState([]);
  const [saleReturns, setSaleReturns] = useState([]);
  const [purchaseReturns, setPurchaseReturns] = useState([]);
  const [staff,     setStaff]     = useState([]);
  const [loaders,   setLoaders]   = useState([]);

  const loadLoaders   = async () => { try { const r = await api.getLoaders();   if (r.success) setLoaders(r.loaders || []); } catch (e) {} };
  const loadProducts  = async () => { const r = await api.getProducts();  if (r.success) setProducts(Array.isArray(r.products) ? r.products : Array.isArray(r.data) ? r.data : Array.isArray(r) ? r : []); };
  const loadPurchases = async () => { const r = await api.getPurchases(); if (r.success) setPurchases(Array.isArray(r.purchases) ? r.purchases : Array.isArray(r.data) ? r.data : Array.isArray(r) ? r : []); };
  const loadSales     = async () => { const r = await api.getSales();     if (r.success) setSales(Array.isArray(r.sales) ? r.sales : Array.isArray(r.data) ? r.data : Array.isArray(r) ? r : []); };
  const loadSaleReturns = async () => { try { const r = await listSaleReturns(); if (r.success) setSaleReturns(r.returns || []); } catch (e) {} };
  const loadPurchaseReturns = async () => { try { const r = await listPurchaseReturns(); if (r.success) setPurchaseReturns(r.returns || []); } catch (e) {} };
  const loadStaff     = async () => { const r = await api.getStaff();     if (r.success) setStaff(Array.isArray(r.staff) ? r.staff : Array.isArray(r.data) ? r.data : Array.isArray(r) ? r : []); };

  useEffect(() => {
    const token = localStorage.getItem("steelpos_token");
    if (token) {
      fetch(`${API}/auth/me`, { headers: authHeaders() })
        .then(r => r.json())
        .then(data => {
          if (data.success) {
            setUser(data.user);
            setActive(savedPage(data.user.role));
          } else {
            localStorage.removeItem("steelpos_token");
          }
          setLoading(false);
        })
        .catch(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user && user.role !== "superadmin") {
      loadProducts();
      loadSales();
      loadLoaders();
      loadSaleReturns();
      if (user.role === "admin") { loadPurchases(); loadStaff(); loadPurchaseReturns(); }
    }
  }, [user]);

  const handleLogin = (u) => {
    setUser(u);
    setActive(homePage(u.role));
  };

  const handleLogout = () => {
    localStorage.removeItem("steelpos_token");
    localStorage.removeItem(PAGE_KEY);
    setUser(null);
    setActiveState("dashboard");
    setProducts([]); setPurchases([]); setSales([]); setStaff([]); setLoaders([]); setSaleReturns([]); setPurchaseReturns([]);
  };

  if (loading) return <AppLoader />;
  if (!user)   return <LoginPage onLogin={handleLogin} />;
  if (user.role === "superadmin") return <SuperAdminPage onLogout={handleLogout} />;

  const mainContent = (
    <main dir={isUrdu ? "rtl" : "ltr"} style={{ flex: 1, overflowY: "auto", padding: isMobile ? "14px" : "20px", paddingBottom: isMobile ? 80 : 20 }}>
      {user.role === "admin" && (
        <>
          {active === "dashboard"    && <Dashboard products={products} purchases={purchases} sales={sales} staff={staff} loaders={loaders} saleReturns={saleReturns} purchaseReturns={purchaseReturns} />}
          {active === "products"     && <ProductsPage products={products} loadProducts={loadProducts} loadPurchases={loadPurchases} />}
          {active === "purchase"     && <PurchasePage purchases={purchases} products={products} loadPurchases={loadPurchases} loadProducts={loadProducts} purchaseReturns={purchaseReturns} loadPurchaseReturns={loadPurchaseReturns} />}
          {active === "sales"        && <SalesPage sales={sales} products={products} loadSales={loadSales} loadProducts={loadProducts} loaders={loaders} saleReturns={saleReturns} loadSaleReturns={loadSaleReturns} />}
          {active === "accounts"     && <AccountsPage />}
          {active === "ledger"       && <LedgerPage purchases={purchases} sales={sales} />}
          {active === "staff"        && <StaffPage staff={staff} loadStaff={loadStaff} />}
          {active === "loaders"      && <LoadersPage loaders={loaders} loadLoaders={loadLoaders} />}
          {active === "shop-profile" && <ShopProfilePage />}
          {active === "profile"      && <AdminProfilePage user={user} />}
        </>
      )}
      {user.role === "staff" && (
        <>
          {active === "billing" && <BillingPage sales={sales} products={products} loadSales={loadSales} loadProducts={loadProducts} currentUser={user} loaders={loaders} />}
          {active === "loaders" && <LoadersPage loaders={loaders} loadLoaders={loadLoaders} />}
        </>
      )}
    </main>
  );

  return (
    <div dir="ltr" style={{ display:"flex", height:"100vh", overflow:"hidden", background:th.bg }}>
      {showSidebar && <Sidebar user={user} active={active} setActive={setActive} onLogout={handleLogout} />}
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", minWidth:0 }}>
        <Topbar active={active} user={user} isMobile={isMobile} />
        {mainContent}
        {isMobile && <BottomNav user={user} active={active} setActive={setActive} onLogout={handleLogout} />}
      </div>
    </div>
  );
}

export default function SteelPOS() {
  return (
    <ThemeProvider>
      <LangProvider>
        <AppInner />
      </LangProvider>
    </ThemeProvider>
  );
}