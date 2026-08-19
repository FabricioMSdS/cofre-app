import React, { useEffect, useMemo, useState } from "react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
} from "recharts";
import {
  Wallet, TrendingDown, PiggyBank, Settings2, LogOut, LayoutGrid, ListChecks,
  Plus, X, ChevronLeft, ChevronRight, Lock, Mail, User, ArrowRight, Check, Loader2,
} from "lucide-react";

/* ------------------------------- supabase config ----------------------------- */

const SUPABASE_URL = "https://ywzncuftzgdfgkecelhk.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl3em5jdWZ0emdkZmdrZWNlbGhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwNjA4MTMsImV4cCI6MjEwMjYzNjgxM30.-fEasXY_ikULW80G1ZQkhdO8qJUuz5-GAivxqv2yIF4";
const SESSION_KEY = "supabase-session";

function authHeaders(session, extra) {
  return {
    "Content-Type": "application/json",
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${session?.access_token || SUPABASE_ANON_KEY}`,
    ...extra,
  };
}

function translateAuthError(msg) {
  const m = (msg || "").toLowerCase();
  if (m.includes("invalid login credentials")) return "E-mail ou senha inválidos.";
  if (m.includes("user already registered")) return "Já existe uma conta com este e-mail.";
  if (m.includes("password should be at least")) return "A senha precisa ter pelo menos 6 caracteres.";
  if (m.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar (verifique sua caixa de entrada).";
  return msg || "Ocorreu um erro. Tente novamente.";
}

async function apiSignUp(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(translateAuthError(data.msg || data.error_description || data.error));
  return data; // { access_token?, refresh_token?, user, expires_in? }
}

async function apiSignIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(translateAuthError(data.error_description || data.msg || data.error));
  return data;
}

async function apiRefresh(refresh_token) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ refresh_token }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error("Sessão expirada");
  return data;
}

async function apiSignOut(session) {
  try {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: "POST",
      headers: authHeaders(session),
    });
  } catch (e) { /* noop */ }
}

function toSession(tokenData) {
  if (!tokenData?.access_token) return null;
  return {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expires_at: Date.now() + (tokenData.expires_in || 3600) * 1000,
    user: tokenData.user,
  };
}

async function loadStoredSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
async function saveStoredSession(session) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch (e) {}
}
async function clearStoredSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
}

async function ensureFreshSession(session) {
  if (!session) return null;
  if (Date.now() < session.expires_at - 30000) return session;
  try {
    const fresh = toSession(await apiRefresh(session.refresh_token));
    await saveStoredSession(fresh);
    return fresh;
  } catch (e) {
    return null;
  }
}

async function apiFetchRecords(session, month) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/records?month=eq.${month}&order=date.asc`,
    { headers: authHeaders(session) }
  );
  if (!res.ok) throw new Error("Erro ao buscar registros.");
  const rows = await res.json();
  return rows.map((r) => ({ ...r, value: Number(r.value) }));
}

async function apiInsertRecord(session, record) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/records`, {
    method: "POST",
    headers: authHeaders(session, { Prefer: "return=representation" }),
    body: JSON.stringify({ ...record, user_id: session.user.id }),
  });
  if (!res.ok) throw new Error("Erro ao salvar registro.");
  const rows = await res.json();
  return { ...rows[0], value: Number(rows[0].value) };
}

async function apiUpdateRecord(session, id, record) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/records?id=eq.${id}`, {
    method: "PATCH",
    headers: authHeaders(session, { Prefer: "return=representation" }),
    body: JSON.stringify(record),
  });
  if (!res.ok) throw new Error("Erro ao atualizar registro.");
  const rows = await res.json();
  return { ...rows[0], value: Number(rows[0].value) };
}

async function apiDeleteRecord(session, id) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/records?id=eq.${id}`, {
    method: "DELETE",
    headers: authHeaders(session),
  });
  if (!res.ok) throw new Error("Erro ao excluir registro.");
  return true;
}

async function apiFetchSettings(session) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/settings?user_id=eq.${session.user.id}&select=invest_pct`,
    { headers: authHeaders(session) }
  );
  if (!res.ok) throw new Error("Erro ao buscar configurações.");
  const rows = await res.json();
  return rows[0]?.invest_pct ?? null;
}

async function apiUpsertSettings(session, investPct) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/settings`, {
    method: "POST",
    headers: authHeaders(session, { Prefer: "resolution=merge-duplicates,return=representation" }),
    body: JSON.stringify({ user_id: session.user.id, invest_pct: investPct }),
  });
  if (!res.ok) throw new Error("Erro ao salvar configuração.");
  return res.json();
}

/* ---------------------------------- tokens --------------------------------- */

const C = {
  ink: "#132019", inkSoft: "#41504A", paper: "#F1EFE3", paperDeep: "#E7E3D2",
  card: "#FBFAF4", line: "#D8D4C0", emerald: "#1F6F54", emeraldSoft: "#DCEAE1",
  rust: "#B3492F", rustSoft: "#F3DED6", amber: "#C97B3D", gold: "#B8842E",
  goldSoft: "#F0E3C8", slate: "#4B7B8C",
};

const PIE_PALETTE = ["#1F6F54", "#B3492F", "#B8842E", "#4B7B8C", "#7A5C8E", "#C97B3D", "#5C7A4E"];

const CATEGORY_OPTIONS = {
  receita: ["Salário", "Freelance", "Rendimentos", "Outros"],
  despesa_fixa: ["Moradia", "Contas e assinaturas", "Transporte", "Educação", "Saúde", "Outros"],
  despesa_variavel: ["Alimentação", "Lazer", "Compras", "Transporte", "Saúde", "Outros"],
  sobra: ["Reserva do mês"],
  investimento: ["Renda fixa", "Renda variável", "Reserva de emergência", "Outros"],
};

const TYPE_META = {
  receita: { label: "Receita", dateLabel: "Data de recebimento (repete todo mês)", color: C.emerald },
  despesa_fixa: { label: "Despesa fixa", dateLabel: "Dia de vencimento (repete todo mês)", color: C.rust },
  despesa_variavel: { label: "Despesa variável", dateLabel: "Data do gasto", color: C.amber },
  sobra: { label: "Sobra", dateLabel: "Data de referência", color: C.gold },
  investimento: { label: "Valor sugerido p/ investir", dateLabel: "Data de referência", color: C.slate },
};

const TABS = [
  { id: "receitas", label: "Receitas", types: ["receita"] },
  { id: "despesas", label: "Despesas", types: ["despesa_fixa", "despesa_variavel"] },
  { id: "sobra_invest", label: "Sobra & investimento", types: ["sobra", "investimento"] },
];

/* --------------------------------- helpers ---------------------------------- */

function monthKey(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; }
function shiftMonth(key, delta) {
  const [y, m] = key.split("-").map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
}
function monthLabel(key) {
  const [y, m] = key.split("-").map(Number);
  const label = new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}
function currency(v) { return (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }

/* ---------------------------------- shell ----------------------------------- */

export default function App() {
  const [phase, setPhase] = useState("boot"); // boot | login | signup | app
  const [session, setSession] = useState(null);
  const [authError, setAuthError] = useState("");
  const [authNotice, setAuthNotice] = useState("");

  useEffect(() => {
    let mounted = true;
    (async () => {
      const stored = await loadStoredSession();
      const fresh = await ensureFreshSession(stored);
      if (!mounted) return;
      if (fresh) { setSession(fresh); setPhase("app"); }
      else { await clearStoredSession(); setPhase("login"); }
    })();
    return () => { mounted = false; };
  }, []);

  async function handleSignup(email, password) {
    setAuthError(""); setAuthNotice("");
    try {
      const data = await apiSignUp(email, password);
      const sess = toSession(data);
      if (sess) {
        await saveStoredSession(sess);
        setSession(sess);
        setPhase("app");
      } else {
        setAuthNotice("Conta criada! Verifique seu e-mail para confirmar antes de entrar.");
        setPhase("login");
      }
    } catch (e) {
      setAuthError(e.message);
    }
  }

  async function handleLogin(email, password) {
    setAuthError(""); setAuthNotice("");
    try {
      const data = await apiSignIn(email, password);
      const sess = toSession(data);
      await saveStoredSession(sess);
      setSession(sess);
      setPhase("app");
    } catch (e) {
      setAuthError(e.message);
    }
  }

  async function handleLogout() {
    if (session) await apiSignOut(session);
    await clearStoredSession();
    setSession(null);
    setPhase("login");
  }

  if (phase === "boot") {
    return (
      <div style={{ background: C.ink, color: C.paper, fontFamily: "Inter, system-ui, sans-serif" }} className="min-h-screen w-full flex items-center justify-center text-sm gap-2">
        <Loader2 size={16} className="animate-spin" /> Carregando sua conta…
      </div>
    );
  }
  if (phase === "login" || phase === "signup") {
    return (
      <AuthScreen
        mode={phase}
        error={authError}
        notice={authNotice}
        onSwitch={() => { setAuthError(""); setAuthNotice(""); setPhase(phase === "login" ? "signup" : "login"); }}
        onSubmit={phase === "login" ? handleLogin : handleSignup}
      />
    );
  }
  return <MainApp session={session} onLogout={handleLogout} />;
}

/* ------------------------------- auth screens -------------------------------- */

function AuthScreen({ mode, onSwitch, onSubmit, error, notice }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const isLogin = mode === "login";

  async function handleSubmit() {
    if (busy) return;
    setBusy(true);
    await onSubmit(email, password);
    setBusy(false);
  }

  return (
    <div style={{ background: C.ink, fontFamily: "Inter, system-ui, sans-serif" }} className="min-h-screen w-full flex items-center justify-center p-6">
      <div className="w-full max-w-4xl grid md:grid-cols-2 rounded-2xl overflow-hidden shadow-2xl">
        <div style={{ background: `linear-gradient(155deg, ${C.ink} 0%, #1D3128 100%)`, color: C.paper }} className="hidden md:flex flex-col justify-between p-10">
          <div className="flex items-center gap-2">
            <div style={{ background: C.gold }} className="w-9 h-9 rounded-lg flex items-center justify-center"><Wallet size={18} color={C.ink} /></div>
            <span style={{ fontFamily: "Fraunces, serif" }} className="text-xl tracking-tight">Cofre</span>
          </div>
          <div>
            <p style={{ fontFamily: "Fraunces, serif" }} className="text-3xl leading-snug mb-3">Cada real, com<br />seu devido lugar.</p>
            <p style={{ color: C.paperDeep }} className="text-sm leading-relaxed opacity-80">
              Registre receitas, despesas fixas e variáveis, acompanhe a sobra do mês e planeje quanto investir — tudo organizado por mês.
            </p>
          </div>
          <p style={{ color: C.paperDeep }} className="text-xs opacity-60">Seus dados ficam protegidos por conta, com login real via Supabase.</p>
        </div>

        <div style={{ background: C.card }} className="p-8 md:p-10 flex flex-col justify-center">
          <div className="md:hidden flex items-center gap-2 mb-6">
            <div style={{ background: C.gold }} className="w-8 h-8 rounded-lg flex items-center justify-center"><Wallet size={16} color={C.ink} /></div>
            <span style={{ fontFamily: "Fraunces, serif", color: C.ink }} className="text-lg">Cofre</span>
          </div>

          <h2 style={{ fontFamily: "Fraunces, serif", color: C.ink }} className="text-2xl mb-1">{isLogin ? "Entrar na sua conta" : "Criar sua conta"}</h2>
          <p style={{ color: C.inkSoft }} className="text-sm mb-6">{isLogin ? "Continue de onde parou o controle do seu mês." : "Leva menos de um minuto para começar."}</p>

          {error && <div style={{ background: C.rustSoft, color: C.rust }} className="text-xs rounded-lg px-3 py-2 mb-4">{error}</div>}
          {notice && <div style={{ background: C.emeraldSoft, color: C.emerald }} className="text-xs rounded-lg px-3 py-2 mb-4">{notice}</div>}

          <div className="flex flex-col gap-4">
            <Field label="E-mail" icon={<Mail size={16} />}>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSubmit()} placeholder="voce@email.com" className="w-full bg-transparent outline-none text-sm" style={{ color: C.ink }} />
            </Field>
            <Field label="Senha" icon={<Lock size={16} />}>
              <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSubmit()} placeholder="mínimo 6 caracteres" className="w-full bg-transparent outline-none text-sm" style={{ color: C.ink }} />
            </Field>
            <button type="button" onClick={handleSubmit} disabled={busy} style={{ background: C.ink, color: C.paper, opacity: busy ? 0.7 : 1 }} className="mt-2 rounded-lg py-2.5 text-sm font-medium flex items-center justify-center gap-2 hover:opacity-90 transition">
              {busy ? <><Loader2 size={15} className="animate-spin" /> Só um instante…</> : <>{isLogin ? "Entrar" : "Criar conta"} <ArrowRight size={15} /></>}
            </button>
          </div>

          <p style={{ color: C.inkSoft }} className="text-xs mt-5 text-center">
            {isLogin ? "Ainda não tem conta?" : "Já tem uma conta?"}{" "}
            <button onClick={onSwitch} style={{ color: C.emerald }} className="font-medium underline underline-offset-2">{isLogin ? "Cadastre-se" : "Entrar"}</button>
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({ label, icon, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span style={{ color: C.inkSoft }} className="text-xs font-medium uppercase tracking-wide">{label}</span>
      <div style={{ borderColor: C.line, background: C.paper }} className="flex items-center gap-2 rounded-lg border px-3 py-2.5">
        <span style={{ color: C.inkSoft }}>{icon}</span>
        {children}
      </div>
    </label>
  );
}

/* --------------------------------- main app ---------------------------------- */

function MainApp({ session, onLogout }) {
  const [view, setView] = useState("overview");
  const [month, setMonth] = useState(monthKey(new Date()));
  const [recordsByMonth, setRecordsByMonth] = useState({});
  const [loadingRecords, setLoadingRecords] = useState(true);
  const [investPct, setInvestPctState] = useState(10);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [showInvestEditor, setShowInvestEditor] = useState(false);
  const [modalType, setModalType] = useState(null);
  const [editingRecord, setEditingRecord] = useState(null);
  const [savedPulse, setSavedPulse] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const pct = await apiFetchSettings(session);
        if (pct === null) { await apiUpsertSettings(session, 10); setInvestPctState(10); }
        else setInvestPctState(pct);
      } catch (e) { setErrorMsg(e.message); }
      setSettingsLoaded(true);
    })();
  }, []);

  useEffect(() => {
    let active = true;
    setLoadingRecords(true);
    apiFetchRecords(session, month)
      .then((rows) => { if (active) { setRecordsByMonth((p) => ({ ...p, [month]: rows })); setLoadingRecords(false); } })
      .catch((e) => { if (active) { setErrorMsg(e.message); setLoadingRecords(false); } });
    return () => { active = false; };
  }, [month]);

  const activeRecords = recordsByMonth[month] || [];

  function pulse() {
    setSavedPulse(true);
    window.clearTimeout(pulse._t);
    pulse._t = window.setTimeout(() => setSavedPulse(false), 1200);
  }

  async function addRecord(rec) {
    try {
      const saved = await apiInsertRecord(session, { ...rec, month });
      setRecordsByMonth((p) => ({ ...p, [month]: [...(p[month] || []), saved] }));
      pulse();
    } catch (e) { setErrorMsg(e.message); }
  }

  async function updateRecord(id, rec) {
    try {
      const saved = await apiUpdateRecord(session, id, rec);
      setRecordsByMonth((p) => ({ ...p, [month]: (p[month] || []).map((r) => (r.id === id ? saved : r)) }));
      pulse();
    } catch (e) { setErrorMsg(e.message); }
  }

  async function deleteRecord(id) {
    try {
      await apiDeleteRecord(session, id);
      setRecordsByMonth((p) => ({ ...p, [month]: (p[month] || []).filter((r) => r.id !== id) }));
      pulse();
    } catch (e) { setErrorMsg(e.message); }
  }

  async function setInvestPct(pct) {
    setInvestPctState(pct);
    try { await apiUpsertSettings(session, pct); pulse(); } catch (e) { setErrorMsg(e.message); }
  }

  const totals = useMemo(() => {
    const sum = (types) => activeRecords.filter((r) => types.includes(r.type)).reduce((a, r) => a + r.value, 0);
    return { receita: sum(["receita"]), despesas: sum(["despesa_fixa", "despesa_variavel"]) };
  }, [activeRecords]);

  const investCalc = Math.round((totals.receita * investPct) / 100);

  return (
    <div style={{ background: C.paper, fontFamily: "Inter, system-ui, sans-serif" }} className="min-h-screen w-full flex">
      <Sidebar view={view} setView={setView} onLogout={onLogout} userEmail={session.user?.email} />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar
          month={month} savedPulse={savedPulse}
          onPrev={() => setMonth(shiftMonth(month, -1))}
          onNext={() => setMonth(shiftMonth(month, 1))}
          onToday={() => setMonth(monthKey(new Date()))}
        />
        {errorMsg && (
          <div style={{ background: C.rustSoft, color: C.rust }} className="mx-6 md:mx-8 mt-4 text-xs rounded-lg px-3 py-2 flex items-center justify-between">
            {errorMsg}
            <button onClick={() => setErrorMsg("")}><X size={13} /></button>
          </div>
        )}
        <main className="flex-1 p-6 md:p-8 pb-24 md:pb-8 overflow-auto">
          {view === "overview" ? (
            <Overview totals={totals} investPct={investPct} investCalc={investCalc} onOpenInvestEditor={() => setShowInvestEditor(true)} loading={!settingsLoaded || loadingRecords} />
          ) : (
            <Records records={activeRecords} loading={loadingRecords} onNewRecord={() => setModalType("receita")} onEditRecord={(r) => setEditingRecord(r)} />
          )}
        </main>
      </div>
      <MobileTabBar view={view} setView={setView} onLogout={onLogout} />
      {showInvestEditor && <InvestEditor pct={investPct} onChange={setInvestPct} onClose={() => setShowInvestEditor(false)} />}
      {modalType && <NewRecordModal initialType={modalType} onClose={() => setModalType(null)} onSave={(rec) => { addRecord(rec); setModalType(null); }} />}
      {editingRecord && (
        <NewRecordModal
          initialType={editingRecord.type}
          existingRecord={editingRecord}
          onClose={() => setEditingRecord(null)}
          onSave={(rec) => { updateRecord(editingRecord.id, rec); setEditingRecord(null); }}
          onDelete={() => { deleteRecord(editingRecord.id); setEditingRecord(null); }}
        />
      )}
    </div>
  );
}

/* ------------------------------ mobile tab bar --------------------------------- */

function MobileTabBar({ view, setView, onLogout }) {
  const items = [
    { id: "overview", label: "Visão geral", icon: LayoutGrid },
    { id: "records", label: "Registros", icon: ListChecks },
  ];
  return (
    <nav
      style={{ background: C.ink, borderColor: "rgba(255,255,255,0.1)" }}
      className="md:hidden fixed bottom-0 left-0 right-0 border-t flex items-stretch justify-around z-30"
    >
      {items.map((it) => {
        const Icon = it.icon;
        const active = view === it.id;
        return (
          <button
            key={it.id}
            onClick={() => setView(it.id)}
            style={{ color: active ? C.gold : C.paperDeep }}
            className="flex flex-col items-center justify-center gap-1 flex-1 py-2.5 text-[11px] font-medium"
          >
            <Icon size={19} />
            {it.label}
          </button>
        );
      })}
      <button
        onClick={onLogout}
        style={{ color: C.paperDeep }}
        className="flex flex-col items-center justify-center gap-1 flex-1 py-2.5 text-[11px] font-medium"
      >
        <LogOut size={19} />
        Sair
      </button>
    </nav>
  );
}

/* --------------------------------- sidebar ------------------------------------ */

function Sidebar({ view, setView, onLogout, userEmail }) {
  const items = [
    { id: "overview", label: "Visão geral", icon: LayoutGrid },
    { id: "records", label: "Registros", icon: ListChecks },
  ];
  return (
    <aside style={{ background: C.ink }} className="w-60 shrink-0 hidden md:flex flex-col justify-between py-6 px-4">
      <div>
        <div className="flex items-center gap-2 px-2 mb-8">
          <div style={{ background: C.gold }} className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"><Wallet size={16} color={C.ink} /></div>
          <span style={{ fontFamily: "Fraunces, serif", color: C.paper }} className="text-lg">Cofre</span>
        </div>
        <nav className="flex flex-col gap-1">
          {items.map((it) => {
            const Icon = it.icon; const active = view === it.id;
            return (
              <button key={it.id} onClick={() => setView(it.id)}
                style={{ background: active ? "rgba(255,255,255,0.08)" : "transparent", color: active ? C.paper : C.paperDeep }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left transition hover:bg-white/5">
                <Icon size={17} />{it.label}
              </button>
            );
          })}
        </nav>
      </div>
      <div>
        <div style={{ borderColor: "rgba(255,255,255,0.1)" }} className="border-t pt-4 mb-2 flex items-center gap-2 px-2">
          <div style={{ background: C.emerald }} className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium">
            <span style={{ color: C.paper }}>{(userEmail || "V")[0].toUpperCase()}</span>
          </div>
          <span style={{ color: C.paperDeep }} className="text-sm truncate">{userEmail}</span>
        </div>
        <button onClick={onLogout} style={{ color: C.paperDeep }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm hover:bg-white/5 transition">
          <LogOut size={16} /> Sair
        </button>
      </div>
    </aside>
  );
}

/* --------------------------------- topbar ------------------------------------- */

function Topbar({ month, onPrev, onNext, onToday, savedPulse }) {
  const isCurrent = month === monthKey(new Date());
  return (
    <header style={{ borderColor: C.line }} className="border-b px-6 md:px-8 py-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <button onClick={onPrev} style={{ borderColor: C.line, color: C.ink }} className="w-8 h-8 rounded-full border flex items-center justify-center hover:bg-black/5"><ChevronLeft size={16} /></button>
        <div className="text-center min-w-[160px]">
          <p style={{ fontFamily: "Fraunces, serif", color: C.ink }} className="text-lg leading-none">{monthLabel(month)}</p>
          {!isCurrent && <button onClick={onToday} style={{ color: C.emerald }} className="text-xs mt-1 underline underline-offset-2">voltar para o mês atual</button>}
        </div>
        <button onClick={onNext} style={{ borderColor: C.line, color: C.ink }} className="w-8 h-8 rounded-full border flex items-center justify-center hover:bg-black/5"><ChevronRight size={16} /></button>
      </div>
      <div style={{ background: savedPulse ? C.emeraldSoft : C.paperDeep, color: savedPulse ? C.emerald : C.inkSoft }} className="text-xs px-3 py-1.5 rounded-full font-medium hidden sm:flex items-center gap-1.5 transition-colors">
        {savedPulse ? <Check size={12} /> : null}{savedPulse ? "Salvo" : "Conectado ao Supabase"}
      </div>
    </header>
  );
}

/* -------------------------------- overview ------------------------------------ */

function Overview({ totals, investPct, investCalc, onOpenInvestEditor, loading }) {
  return (
    <div>
      <p style={{ color: C.inkSoft }} className="text-sm mb-6">Resumo do mês selecionado.</p>
      <div className="grid sm:grid-cols-3 gap-4 max-w-4xl">
        <SummaryCard label="Receita do mês" value={loading ? "…" : currency(totals.receita)} icon={<TrendingDown size={18} style={{ transform: "rotate(180deg)" }} />} tint={C.emeraldSoft} accent={C.emerald} />
        <SummaryCard label="Despesas do mês" value={loading ? "…" : currency(totals.despesas)} icon={<TrendingDown size={18} />} tint={C.rustSoft} accent={C.rust} />
        <SummaryCard label="Investir" value={loading ? "…" : currency(investCalc)} icon={<PiggyBank size={18} />} tint={C.goldSoft} accent={C.gold} onSettings={onOpenInvestEditor} footnote={`${investPct}% da receita sugerido`} />
      </div>
    </div>
  );
}

function SummaryCard({ label, value, icon, tint, accent, onSettings, footnote }) {
  return (
    <div style={{ background: C.card, borderColor: C.line }} className="rounded-xl border p-5 relative">
      <div className="flex items-center justify-between mb-4">
        <div style={{ background: tint, color: accent }} className="w-9 h-9 rounded-lg flex items-center justify-center">{icon}</div>
        {onSettings && <button onClick={onSettings} style={{ color: C.inkSoft }} className="hover:text-black transition" title="Ajustar percentual"><Settings2 size={17} /></button>}
      </div>
      <p style={{ color: C.inkSoft }} className="text-xs uppercase tracking-wide mb-1">{label}</p>
      <p style={{ fontFamily: "Fraunces, serif", color: C.ink }} className="text-2xl">{value}</p>
      {footnote && <p style={{ color: accent }} className="text-xs mt-1.5 font-medium">{footnote}</p>}
    </div>
  );
}

function InvestEditor({ pct, onChange, onClose }) {
  const [local, setLocal] = useState(pct);
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4" style={{ background: "rgba(19,32,25,0.45)" }}>
      <div style={{ background: C.card }} className="w-full max-w-sm rounded-xl p-6 relative">
        <button onClick={onClose} style={{ color: C.inkSoft }} className="absolute top-4 right-4 hover:text-black"><X size={18} /></button>
        <p style={{ fontFamily: "Fraunces, serif", color: C.ink }} className="text-lg mb-1">Percentual para investir</p>
        <p style={{ color: C.inkSoft }} className="text-sm mb-5">Escolha quantos % da sua receita mensal deseja reservar para investimentos.</p>
        <div className="flex items-center gap-4 mb-2">
          <input type="range" min={0} max={50} value={local} onChange={(e) => setLocal(Number(e.target.value))} className="flex-1" />
          <span style={{ fontFamily: "Fraunces, serif", color: C.gold }} className="text-xl w-14 text-right">{local}%</span>
        </div>
        <button onClick={() => { onChange(local); onClose(); }} style={{ background: C.ink, color: C.paper }} className="w-full mt-4 rounded-lg py-2.5 text-sm font-medium hover:opacity-90 transition">Salvar percentual</button>
      </div>
    </div>
  );
}

/* --------------------------------- records ------------------------------------ */

function Records({ records, loading, onNewRecord, onEditRecord }) {
  const [tab, setTab] = useState("receitas");
  const activeTab = TABS.find((t) => t.id === tab);
  const filtered = records.filter((r) => activeTab.types.includes(r.type));

  const pieData = useMemo(() => {
    const map = {};
    filtered.forEach((r) => { map[r.category] = (map[r.category] || 0) + r.value; });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [filtered]);

  return (
    <div>
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div style={{ borderColor: C.line }} className="flex rounded-lg border p-1 gap-1" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ background: tab === t.id ? C.ink : "transparent", color: tab === t.id ? C.paper : C.inkSoft }}
              className="px-4 py-1.5 rounded-md text-sm font-medium transition">
              {t.label}
            </button>
          ))}
        </div>
        <button onClick={onNewRecord} style={{ background: C.ink, color: C.paper }} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition">
          <Plus size={16} /> Novo registro
        </button>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <div style={{ background: C.card, borderColor: C.line }} className="lg:col-span-2 rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderColor: C.line, color: C.inkSoft }} className="border-b text-left">
                <th className="px-4 py-3 font-medium">Descrição</th>
                <th className="px-4 py-3 font-medium">Categoria</th>
                <th className="px-4 py-3 font-medium">Data</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium text-right">Valor</th>
                <th className="px-4 py-3 font-medium w-8"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} style={{ color: C.inkSoft }} className="px-4 py-10 text-center text-sm">Carregando registros…</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={6} style={{ color: C.inkSoft }} className="px-4 py-10 text-center text-sm">Nenhum registro nesta aba ainda. Use "Novo registro" para adicionar o primeiro.</td></tr>
              )}
              {!loading && filtered.map((r) => {
                const meta = TYPE_META[r.type];
                return (
                  <tr
                    key={r.id}
                    onClick={() => onEditRecord(r)}
                    style={{ borderColor: C.line }}
                    className="border-b last:border-0 cursor-pointer hover:bg-black/[0.03] transition"
                  >
                    <td style={{ color: C.ink }} className="px-4 py-3">{r.description}</td>
                    <td style={{ color: C.inkSoft }} className="px-4 py-3">{r.category}</td>
                    <td style={{ color: C.inkSoft }} className="px-4 py-3">{r.date?.split("-").reverse().join("/")}</td>
                    <td className="px-4 py-3">
                      <span style={{ background: meta.color + "22", color: meta.color }} className="text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap">{meta.label}</span>
                    </td>
                    <td style={{ color: C.ink }} className="px-4 py-3 text-right font-medium">{currency(r.value)}</td>
                    <td className="px-2 py-3" style={{ color: C.inkSoft }}><ChevronRight size={15} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!loading && filtered.length > 0 && (
            <p style={{ color: C.inkSoft, borderColor: C.line }} className="text-xs px-4 py-2.5 border-t">Toque em um registro para editar ou excluir.</p>
          )}
        </div>

        <div style={{ background: C.card, borderColor: C.line }} className="rounded-xl border p-5 flex flex-col">
          <p style={{ fontFamily: "Fraunces, serif", color: C.ink }} className="text-base mb-4">Por categoria</p>
          {pieData.length === 0 ? (
            <p style={{ color: C.inkSoft }} className="text-sm my-auto text-center">{loading ? "Carregando…" : "Sem dados para exibir."}</p>
          ) : (
            <div style={{ width: "100%", height: 260 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2}>
                    {pieData.map((_, i) => <Cell key={i} fill={PIE_PALETTE[i % PIE_PALETTE.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => currency(v)} />
                  <Legend verticalAlign="bottom" height={48} wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- new record modal ------------------------------ */

function NewRecordModal({ initialType, existingRecord, onClose, onSave, onDelete }) {
  const isEdit = !!existingRecord;
  const [type, setType] = useState(initialType);
  const [date, setDate] = useState(existingRecord?.date || "");
  const [description, setDescription] = useState(existingRecord?.description || "");
  const [value, setValue] = useState(existingRecord ? String(existingRecord.value) : "");
  const [category, setCategory] = useState(existingRecord?.category || CATEGORY_OPTIONS[initialType][0]);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function handleTypeChange(t) { setType(t); setCategory(CATEGORY_OPTIONS[t][0]); }
  const meta = TYPE_META[type];

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4" style={{ background: "rgba(19,32,25,0.45)" }}>
      <div style={{ background: C.card }} className="w-full max-w-lg rounded-xl p-6 relative max-h-[90vh] overflow-auto">
        <button onClick={onClose} style={{ color: C.inkSoft }} className="absolute top-4 right-4 hover:text-black"><X size={18} /></button>
        <p style={{ fontFamily: "Fraunces, serif", color: C.ink }} className="text-lg mb-5">{isEdit ? "Editar registro" : "Novo registro"}</p>

        <p style={{ color: C.inkSoft }} className="text-xs uppercase tracking-wide font-medium mb-2">Tipo de registro</p>
        <div className="grid grid-cols-2 gap-2 mb-5">
          {Object.entries(TYPE_META).map(([key, m]) => (
            <button key={key} onClick={() => handleTypeChange(key)}
              style={{ borderColor: type === key ? m.color : C.line, background: type === key ? m.color + "1A" : "transparent", color: type === key ? m.color : C.inkSoft }}
              className="border rounded-lg px-3 py-2 text-xs font-medium text-left transition">
              {m.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-4">
          <Field label={meta.dateLabel} icon={<ChevronRight size={14} style={{ opacity: 0 }} />}>
            <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="w-full bg-transparent outline-none text-sm" style={{ color: C.ink }} />
          </Field>
          <Field label="Descrição" icon={<ChevronRight size={14} style={{ opacity: 0 }} />}>
            <input required value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: Salário, Aluguel, Supermercado..." className="w-full bg-transparent outline-none text-sm" style={{ color: C.ink }} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Valor (R$)" icon={<ChevronRight size={14} style={{ opacity: 0 }} />}>
              <input required type="number" min="0" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0,00" className="w-full bg-transparent outline-none text-sm" style={{ color: C.ink }} />
            </Field>
            <label className="flex flex-col gap-1.5">
              <span style={{ color: C.inkSoft }} className="text-xs font-medium uppercase tracking-wide">Categoria</span>
              <div style={{ borderColor: C.line, background: C.paper }} className="rounded-lg border px-3 py-2.5">
                <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full bg-transparent outline-none text-sm" style={{ color: C.ink }}>
                  {CATEGORY_OPTIONS[type].map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </label>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={async () => {
              if (!description || !value || !date) return;
              setSaving(true);
              await onSave({ type, date, description, value: Number(value), category });
              setSaving(false);
            }}
            style={{ background: C.ink, color: C.paper, opacity: saving ? 0.7 : 1 }}
            className="mt-2 rounded-lg py-2.5 text-sm font-medium hover:opacity-90 transition flex items-center justify-center gap-2"
          >
            {saving ? <><Loader2 size={15} className="animate-spin" /> Salvando…</> : isEdit ? "Salvar alterações" : "Salvar registro"}
          </button>

          {isEdit && (
            <div style={{ borderColor: C.line }} className="border-t pt-4 mt-1">
              {!confirmingDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  style={{ color: C.rust }}
                  className="text-xs font-medium hover:underline"
                >
                  Excluir este registro
                </button>
              ) : (
                <div style={{ background: C.rustSoft }} className="rounded-lg p-3 flex items-center justify-between gap-3 flex-wrap">
                  <span style={{ color: C.rust }} className="text-xs">Tem certeza? Essa ação não pode ser desfeita.</span>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setConfirmingDelete(false)} style={{ color: C.inkSoft }} className="text-xs px-2 py-1">Cancelar</button>
                    <button type="button" onClick={onDelete} style={{ background: C.rust, color: "#fff" }} className="text-xs px-3 py-1.5 rounded-md font-medium">Excluir</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
