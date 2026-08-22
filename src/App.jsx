import React, { useEffect, useMemo, useState } from "react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
} from "recharts";
import {
  Wallet, TrendingDown, PiggyBank, Settings2, LogOut, LayoutGrid, ListChecks,
  Plus, X, ChevronLeft, ChevronRight, Lock, Mail, User, ArrowRight, Check, Loader2,
  StickyNote, Trash2, Camera, CircleX, CheckCircle2, Circle, UserRound, CalendarDays,
  Eye, EyeOff, Pencil, RefreshCw,
} from "lucide-react";

/* ------------------------------- supabase config ----------------------------- */

const SUPABASE_URL = "https://ywzncuftzgdfgkecelhk.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl3em5jdWZ0emdkZmdrZWNlbGhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwNjA4MTMsImV4cCI6MjEwMjYzNjgxM30.-fEasXY_ikULW80G1ZQkhdO8qJUuz5-GAivxqv2yIF4";
const SESSION_KEY = "supabase-session";
const TRIAL_DAYS = 1;
// TODO: troque pelo link de checkout real assim que criar o produto na Kiwify
const KIWIFY_CHECKOUT_URL = "https://pay.kiwify.com.br/1Jzzhkx";

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

async function apiRequestPasswordReset(email) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, redirect_to: window.location.origin + window.location.pathname }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(translateAuthError(data.msg || data.error_description || data.error));
  }
  return true;
}

async function apiUpdatePassword(accessToken, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(translateAuthError(data.msg || data.error_description || data.error));
  return data;
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

async function pgErrorMessage(res, fallback) {
  try {
    const data = await res.json();
    return data.message || data.hint || data.error_description || data.error || fallback;
  } catch (e) {
    return fallback;
  }
}

async function apiFetchRecords(session, month) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/records?month=eq.${month}&order=date.asc`,
    { headers: authHeaders(session) }
  );
  if (!res.ok) throw new Error(await pgErrorMessage(res, "Erro ao buscar registros."));
  const rows = await res.json();
  return rows.map((r) => ({ ...r, value: Number(r.value) }));
}

async function apiInsertRecord(session, record) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/records`, {
    method: "POST",
    headers: authHeaders(session, { Prefer: "return=representation" }),
    body: JSON.stringify({ ...record, user_id: session.user.id }),
  });
  if (!res.ok) throw new Error(await pgErrorMessage(res, "Erro ao salvar registro."));
  const rows = await res.json();
  return { ...rows[0], value: Number(rows[0].value) };
}

async function apiUpdateRecord(session, id, record) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/records?id=eq.${id}`, {
    method: "PATCH",
    headers: authHeaders(session, { Prefer: "return=representation" }),
    body: JSON.stringify(record),
  });
  if (!res.ok) throw new Error(await pgErrorMessage(res, "Erro ao atualizar registro."));
  const rows = await res.json();
  return { ...rows[0], value: Number(rows[0].value) };
}

async function apiDeleteRecord(session, id) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/records?id=eq.${id}`, {
    method: "DELETE",
    headers: authHeaders(session),
  });
  if (!res.ok) throw new Error(await pgErrorMessage(res, "Erro ao excluir registro."));
  return true;
}

// Apaga as instâncias já geradas nos meses seguintes ao mês informado (comparação
// funciona porque o "month" é sempre "YYYY-MM", então a ordem alfabética = ordem cronológica).
async function apiDeleteFutureRecurring(session, recurringGroup, afterMonthKey) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/records?recurring_group=eq.${encodeURIComponent(recurringGroup)}&month=gt.${afterMonthKey}`,
    { method: "DELETE", headers: authHeaders(session) }
  );
  if (!res.ok) throw new Error(await pgErrorMessage(res, "Erro ao remover os meses futuros."));
  return true;
}

function shiftDateToMonth(dateStr, targetMonthKey) {
  const day = Number(dateStr.split("-")[2]);
  const [y, m] = targetMonthKey.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const clampedDay = Math.min(day, daysInMonth);
  return `${targetMonthKey}-${String(clampedDay).padStart(2, "0")}`;
}

// Repete automaticamente para o mês visualizado qualquer receita/despesa fixa
// que já existia (e ainda está ativa) no mês anterior. Roda sempre que o
// usuário navega para um novo mês — por isso funciona mesmo sem um servidor
// rodando tarefas agendadas.
async function apiCarryForwardRecurring(session, targetMonthKey) {
  const prevMonthKey = shiftMonth(targetMonthKey, -1);
  let prevRows = [];
  let targetRows = [];
  try {
    [prevRows, targetRows] = await Promise.all([
      apiFetchRecords(session, prevMonthKey),
      apiFetchRecords(session, targetMonthKey),
    ]);
  } catch (e) {
    return false;
  }

  const existingGroups = new Set(targetRows.filter((r) => r.recurring_group).map((r) => r.recurring_group));
  const toCreate = prevRows.filter((r) => r.recurring_group && r.recurring_active && !existingGroups.has(r.recurring_group));

  for (const r of toCreate) {
    try {
      await apiInsertRecord(session, {
        type: r.type,
        month: targetMonthKey,
        date: shiftDateToMonth(r.date, targetMonthKey),
        description: r.description,
        value: r.value,
        category: r.category,
        recurring_group: r.recurring_group,
        recurring_active: true,
      });
    } catch (e) {
      // se uma falhar, segue tentando as demais
    }
  }
  return toCreate.length > 0;
}

async function apiFetchSettings(session) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/settings?user_id=eq.${session.user.id}&select=invest_pct,name,age,avatar_data,subscription_active`,
    { headers: authHeaders(session) }
  );
  if (!res.ok) throw new Error(await pgErrorMessage(res, "Erro ao buscar configurações."));
  const rows = await res.json();
  return rows[0] || null;
}

async function apiFetchTrialDays(session) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/app_config?select=trial_days&limit=1`, { headers: authHeaders(session) });
    if (!res.ok) return TRIAL_DAYS;
    const rows = await res.json();
    return rows[0]?.trial_days ?? TRIAL_DAYS;
  } catch (e) {
    return TRIAL_DAYS;
  }
}

async function apiUpsertSettings(session, patch) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/settings`, {
    method: "POST",
    headers: authHeaders(session, { Prefer: "resolution=merge-duplicates,return=representation" }),
    body: JSON.stringify({ user_id: session.user.id, ...patch }),
  });
  if (!res.ok) throw new Error(await pgErrorMessage(res, "Erro ao salvar configuração."));
  const rows = await res.json();
  return rows[0];
}

async function apiFetchNotes(session) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/notes?order=created_at.desc`, { headers: authHeaders(session) });
  if (!res.ok) throw new Error(await pgErrorMessage(res, "Erro ao buscar anotações."));
  return res.json();
}

// Busca leve (só a coluna "month") de todos os registros do usuário, usada
// apenas para calcular XP/nível — não carrega os dados completos.
async function apiFetchRecordMonths(session) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/records?select=month`, { headers: authHeaders(session) });
  if (!res.ok) return [];
  const rows = await res.json();
  return rows.map((r) => r.month);
}

const LEVEL_XP_STEP = 150;
const LEVEL_TITLES = [
  { min: 1, title: "Iniciante" },
  { min: 3, title: "Organizado" },
  { min: 6, title: "Poupador" },
  { min: 10, title: "Estrategista" },
  { min: 15, title: "Investidor" },
  { min: 20, title: "Mestre do Cofre" },
];

function computeLevel({ totalRecords, distinctMonths, completedNotes }) {
  const xp = totalRecords * 10 + distinctMonths * 30 + completedNotes * 15;
  const level = Math.floor(xp / LEVEL_XP_STEP) + 1;
  const xpIntoLevel = xp % LEVEL_XP_STEP;
  const title = [...LEVEL_TITLES].reverse().find((t) => level >= t.min)?.title || "Iniciante";
  return { xp, level, xpIntoLevel, xpForNextLevel: LEVEL_XP_STEP, progressPct: Math.round((xpIntoLevel / LEVEL_XP_STEP) * 100), title };
}

async function apiInsertNote(session, note) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/notes`, {
    method: "POST",
    headers: authHeaders(session, { Prefer: "return=representation" }),
    body: JSON.stringify({ ...note, user_id: session.user.id }),
  });
  if (!res.ok) throw new Error(await pgErrorMessage(res, "Erro ao salvar anotação."));
  const rows = await res.json();
  return rows[0];
}

async function apiUpdateNote(session, id, patch) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/notes?id=eq.${id}`, {
    method: "PATCH",
    headers: authHeaders(session, { Prefer: "return=representation" }),
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(await pgErrorMessage(res, "Erro ao atualizar anotação."));
  const rows = await res.json();
  return rows[0];
}

async function apiDeleteNote(session, id) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/notes?id=eq.${id}`, { method: "DELETE", headers: authHeaders(session) });
  if (!res.ok) throw new Error(await pgErrorMessage(res, "Erro ao excluir anotação."));
  return true;
}

/* ---------------------------------- tokens --------------------------------- */

const C = {
  ink: "#132019", inkSoft: "#41504A", paper: "#F1EFE3", paperDeep: "#E7E3D2",
  card: "#FBFAF4", line: "#D8D4C0", emerald: "#1F6F54", emeraldSoft: "#DCEAE1",
  rust: "#B3492F", rustSoft: "#F3DED6", amber: "#C97B3D", gold: "#B8842E",
  goldSoft: "#F0E3C8", slate: "#4B7B8C", slateSoft: "#DCE9EC",
};

const PIE_PALETTE = ["#1F6F54", "#B3492F", "#B8842E", "#4B7B8C", "#7A5C8E", "#C97B3D", "#5C7A4E"];

const CATEGORY_OPTIONS = {
  receita: ["Salário", "Rendimentos", "Outros"],
  receita_variavel: ["Freelance", "Venda avulsa", "Bônus/13º", "Rendimentos", "Outros"],
  despesa_fixa: ["Moradia", "Contas e assinaturas", "Transporte", "Educação", "Saúde", "Outros"],
  despesa_variavel: ["Alimentação", "Lazer", "Compras", "Transporte", "Saúde", "Outros"],
  sobra: ["Reserva do mês"],
  investimento: ["Renda fixa", "Renda variável", "Reserva de emergência", "Outros"],
};

const TYPE_META = {
  receita: { label: "Receita fixa", dateLabel: "Data de recebimento (repete todo mês)", color: C.emerald },
  receita_variavel: { label: "Receita variável", dateLabel: "Data do recebimento", color: "#4E9C7C" },
  despesa_fixa: { label: "Despesa fixa", dateLabel: "Dia de vencimento (repete todo mês)", color: C.rust },
  despesa_variavel: { label: "Despesa variável", dateLabel: "Data do gasto", color: C.amber },
  sobra: { label: "Sobra", dateLabel: "Data de referência", color: C.gold },
  investimento: { label: "Valor sugerido p/ investir", dateLabel: "Data de referência", color: C.slate },
};

const TABS = [
  { id: "receitas", label: "Receitas", types: ["receita", "receita_variavel"] },
  { id: "despesas", label: "Despesas", types: ["despesa_fixa", "despesa_variavel"] },
  { id: "sobra_invest", label: "Sobra & investimento", types: ["sobra", "investimento"] },
];

const FIXED_TYPES = ["receita", "despesa_fixa"];

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
  const [phase, setPhase] = useState("boot"); // boot | login | signup | reset-password | app
  const [session, setSession] = useState(null);
  const [authError, setAuthError] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [recoveryToken, setRecoveryToken] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      if (hashParams.get("type") === "recovery" && hashParams.get("access_token")) {
        setRecoveryToken(hashParams.get("access_token"));
        window.history.replaceState(null, "", window.location.pathname);
        setPhase("reset-password");
        return;
      }
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

  async function handleForgotPassword(email) {
    try {
      await apiRequestPasswordReset(email);
    } catch (e) {
      // não expõe se o e-mail existe ou não, mas registra erros reais de rede
      console.log(e.message);
    }
  }

  async function handleResetPassword(newPassword) {
    setAuthError("");
    try {
      await apiUpdatePassword(recoveryToken, newPassword);
      setRecoveryToken(null);
      setAuthNotice("Senha atualizada! Faça login com a nova senha.");
      setPhase("login");
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
  if (phase === "reset-password") {
    return <ResetPasswordScreen onSubmit={handleResetPassword} error={authError} />;
  }
  if (phase === "login" || phase === "signup") {
    return (
      <AuthScreen
        mode={phase}
        error={authError}
        notice={authNotice}
        onSwitch={() => { setAuthError(""); setAuthNotice(""); setPhase(phase === "login" ? "signup" : "login"); }}
        onSubmit={phase === "login" ? handleLogin : handleSignup}
        onForgotPassword={handleForgotPassword}
      />
    );
  }
  return <MainApp session={session} onLogout={handleLogout} />;
}

/* ------------------------------- auth screens -------------------------------- */

function AuthScreen({ mode, onSwitch, onSubmit, onForgotPassword, error, notice }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [localError, setLocalError] = useState("");
  const isLogin = mode === "login";

  async function handleSubmit() {
    if (busy) return;
    setLocalError("");
    if (!isLogin && password !== confirmPassword) {
      setLocalError("As senhas não coincidem.");
      return;
    }
    setBusy(true);
    await onSubmit(email, password);
    setBusy(false);
  }

  async function handleForgot() {
    if (busy || !email) return;
    setBusy(true);
    await onForgotPassword(email);
    setBusy(false);
    setForgotSent(true);
  }

  return (
    <div style={{ background: C.ink, fontFamily: "Inter, system-ui, sans-serif" }} className="min-h-screen w-full flex items-center justify-center p-6 relative overflow-hidden">
      <div style={{ background: `radial-gradient(circle, ${C.gold}33, transparent 70%)` }} className="absolute -top-40 -left-40 w-96 h-96 rounded-full blur-3xl pointer-events-none" />
      <div style={{ background: `radial-gradient(circle, ${C.emerald}33, transparent 70%)` }} className="absolute -bottom-40 -right-20 w-96 h-96 rounded-full blur-3xl pointer-events-none" />

      <div style={{ boxShadow: "0 25px 70px rgba(0,0,0,0.5)" }} className="relative w-full max-w-4xl grid md:grid-cols-2 rounded-2xl overflow-hidden">
        <div style={{ background: `linear-gradient(155deg, ${C.ink} 0%, #1D3128 100%)`, color: C.paper }} className="hidden md:flex flex-col justify-between p-10 relative overflow-hidden">
          <div style={{ background: `radial-gradient(circle at 80% 20%, ${C.gold}22, transparent 55%)` }} className="absolute inset-0 pointer-events-none" />
          <div className="relative flex items-center gap-2">
            <div style={{ background: `linear-gradient(135deg, #E2B354 0%, ${C.gold} 100%)`, boxShadow: "0 4px 14px rgba(184,132,46,0.4)" }} className="w-9 h-9 rounded-lg flex items-center justify-center"><Wallet size={18} color={C.ink} /></div>
            <span style={{ fontFamily: "Fraunces, serif" }} className="text-xl tracking-tight">Cofre</span>
          </div>
          <div className="relative">
            <p style={{ fontFamily: "Fraunces, serif" }} className="text-3xl leading-snug mb-3">Cada real, com<br />seu devido lugar.</p>
            <p style={{ color: C.paperDeep }} className="text-sm leading-relaxed opacity-80 mb-6">
              Registre receitas, despesas fixas e variáveis, acompanhe a sobra do mês e planeje quanto investir — tudo organizado por mês.
            </p>
            <div className="flex flex-col gap-2.5">
              {["Controle mensal completo", "Metas com prazo e progresso", "Evolua de nível usando o app"].map((f) => (
                <div key={f} className="flex items-center gap-2.5">
                  <div style={{ background: C.gold }} className="w-1.5 h-1.5 rounded-full shrink-0" />
                  <span style={{ color: C.paperDeep }} className="text-xs">{f}</span>
                </div>
              ))}
            </div>
          </div>
          <p style={{ color: C.paperDeep }} className="relative text-xs opacity-60">Seus dados ficam protegidos por conta, com login real via Supabase.</p>
        </div>

        <div style={{ background: C.card }} className="p-8 md:p-10 flex flex-col justify-center">
          <div className="md:hidden flex items-center gap-2 mb-6">
            <div style={{ background: `linear-gradient(135deg, #E2B354 0%, ${C.gold} 100%)` }} className="w-8 h-8 rounded-lg flex items-center justify-center"><Wallet size={16} color={C.ink} /></div>
            <span style={{ fontFamily: "Fraunces, serif", color: C.ink }} className="text-lg">Cofre</span>
          </div>

          {showForgot ? (
            <>
              <h2 style={{ fontFamily: "Fraunces, serif", color: C.ink }} className="text-2xl mb-1">Redefinir senha</h2>
              <p style={{ color: C.inkSoft }} className="text-sm mb-6">Informe seu e-mail e enviaremos um link para você criar uma nova senha.</p>

              {forgotSent ? (
                <div style={{ background: C.emeraldSoft, color: C.emerald }} className="text-sm rounded-lg px-3 py-3 mb-4">
                  Se esse e-mail estiver cadastrado, você vai receber um link em instantes. Confira também a caixa de spam.
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <Field label="E-mail" icon={<Mail size={16} />}>
                    <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleForgot()} placeholder="voce@email.com" className="w-full bg-transparent outline-none text-sm" style={{ color: C.ink }} />
                  </Field>
                  <button type="button" onClick={handleForgot} disabled={busy} style={{ background: C.ink, color: C.paper, opacity: busy ? 0.7 : 1 }} className="rounded-lg py-2.5 text-sm font-medium flex items-center justify-center gap-2 hover:opacity-90 transition">
                    {busy ? <><Loader2 size={15} className="animate-spin" /> Enviando…</> : "Enviar link de redefinição"}
                  </button>
                </div>
              )}

              <button onClick={() => { setShowForgot(false); setForgotSent(false); }} style={{ color: C.emerald }} className="text-xs mt-5 text-center font-medium underline underline-offset-2 mx-auto block">
                Voltar para o login
              </button>
            </>
          ) : (
            <>
              <h2 style={{ fontFamily: "Fraunces, serif", color: C.ink }} className="text-2xl mb-1">{isLogin ? "Entrar na sua conta" : "Criar sua conta"}</h2>
              <p style={{ color: C.inkSoft }} className="text-sm mb-6">{isLogin ? "Continue de onde parou o controle do seu mês." : "Leva menos de um minuto para começar."}</p>

              {(error || localError) && <div style={{ background: C.rustSoft, color: C.rust }} className="text-xs rounded-lg px-3 py-2 mb-4">{error || localError}</div>}
              {notice && <div style={{ background: C.emeraldSoft, color: C.emerald }} className="text-xs rounded-lg px-3 py-2 mb-4">{notice}</div>}

              <div className="flex flex-col gap-4">
                <Field label="E-mail" icon={<Mail size={16} />}>
                  <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSubmit()} placeholder="voce@email.com" className="w-full bg-transparent outline-none text-sm" style={{ color: C.ink }} />
                </Field>
                <PasswordField label="Senha" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSubmit()} placeholder="mínimo 6 caracteres" minLength={6} autoComplete={isLogin ? "current-password" : "new-password"} />
                {!isLogin && (
                  <PasswordField label="Confirmar senha" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSubmit()} placeholder="digite a senha novamente" minLength={6} autoComplete="new-password" />
                )}
                {isLogin && (
                  <button type="button" onClick={() => setShowForgot(true)} style={{ color: C.emerald }} className="text-xs font-medium underline underline-offset-2 text-left -mt-1">
                    Esqueci minha senha
                  </button>
                )}
                <button type="button" onClick={handleSubmit} disabled={busy} style={{ background: C.ink, color: C.paper, opacity: busy ? 0.7 : 1 }} className="mt-1 rounded-lg py-2.5 text-sm font-medium flex items-center justify-center gap-2 hover:opacity-90 transition">
                  {busy ? <><Loader2 size={15} className="animate-spin" /> Só um instante…</> : <>{isLogin ? "Entrar" : "Criar conta"} <ArrowRight size={15} /></>}
                </button>
              </div>

              <p style={{ color: C.inkSoft }} className="text-xs mt-5 text-center">
                {isLogin ? "Ainda não tem conta?" : "Já tem uma conta?"}{" "}
                <button onClick={onSwitch} style={{ color: C.emerald }} className="font-medium underline underline-offset-2">{isLogin ? "Cadastre-se" : "Entrar"}</button>
              </p>
            </>
          )}
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

function PasswordField({ label, value, onChange, onKeyDown, placeholder, minLength, autoComplete }) {
  const [show, setShow] = useState(false);
  return (
    <label className="flex flex-col gap-1.5">
      <span style={{ color: C.inkSoft }} className="text-xs font-medium uppercase tracking-wide">{label}</span>
      <div style={{ borderColor: C.line, background: C.paper }} className="flex items-center gap-2 rounded-lg border px-3 py-2.5">
        <Lock size={16} style={{ color: C.inkSoft }} />
        <input
          type={show ? "text" : "password"}
          required
          minLength={minLength}
          value={value}
          onChange={onChange}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="flex-1 min-w-0 bg-transparent outline-none text-sm"
          style={{ color: C.ink }}
        />
        <button type="button" onClick={() => setShow((s) => !s)} style={{ color: C.inkSoft }} className="shrink-0" tabIndex={-1}>
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </label>
  );
}

function ResetPasswordScreen({ onSubmit, error }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState("");

  async function handleSubmit() {
    if (busy) return;
    setLocalError("");
    if (password !== confirmPassword) {
      setLocalError("As senhas não coincidem.");
      return;
    }
    setBusy(true);
    await onSubmit(password);
    setBusy(false);
  }

  return (
    <div style={{ background: C.ink, fontFamily: "Inter, system-ui, sans-serif" }} className="min-h-screen w-full flex items-center justify-center p-6">
      <div style={{ background: C.card }} className="w-full max-w-sm rounded-2xl p-8">
        <h2 style={{ fontFamily: "Fraunces, serif", color: C.ink }} className="text-2xl mb-1">Criar nova senha</h2>
        <p style={{ color: C.inkSoft }} className="text-sm mb-6">Escolha uma nova senha para sua conta.</p>

        {(error || localError) && <div style={{ background: C.rustSoft, color: C.rust }} className="text-xs rounded-lg px-3 py-2 mb-4">{error || localError}</div>}

        <div className="flex flex-col gap-4">
          <PasswordField label="Nova senha" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSubmit()} placeholder="mínimo 6 caracteres" minLength={6} autoComplete="new-password" />
          <PasswordField label="Confirmar nova senha" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSubmit()} placeholder="digite a senha novamente" minLength={6} autoComplete="new-password" />
          <button type="button" onClick={handleSubmit} disabled={busy} style={{ background: C.ink, color: C.paper, opacity: busy ? 0.7 : 1 }} className="mt-1 rounded-lg py-2.5 text-sm font-medium flex items-center justify-center gap-2 hover:opacity-90 transition">
            {busy ? <><Loader2 size={15} className="animate-spin" /> Salvando…</> : "Salvar nova senha"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- main app ---------------------------------- */

function MainApp({ session, onLogout }) {
  const [view, setView] = useState("overview");
  const [month, setMonth] = useState(monthKey(new Date()));
  const [recordsByMonth, setRecordsByMonth] = useState({});
  const [loadingRecords, setLoadingRecords] = useState(true);
  const [investPct, setInvestPctState] = useState(10);
  const [profile, setProfile] = useState({ name: "", age: "", avatar_data: null });
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [trialDays, setTrialDays] = useState(TRIAL_DAYS);
  const [subscriptionActive, setSubscriptionActive] = useState(false);
  const [notes, setNotes] = useState([]);
  const [notesLoaded, setNotesLoaded] = useState(false);
  const [levelStats, setLevelStats] = useState(null); // computado quando o perfil é aberto
  const [showInvestEditor, setShowInvestEditor] = useState(false);
  const [modalType, setModalType] = useState(null);
  const [editingRecord, setEditingRecord] = useState(null);
  const [savedPulse, setSavedPulse] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const row = await apiFetchSettings(session);
        if (!row) {
          await apiUpsertSettings(session, { invest_pct: 10 });
          setInvestPctState(10);
        } else {
          setInvestPctState(row.invest_pct ?? 10);
          setProfile({ name: row.name || "", age: row.age ?? "", avatar_data: row.avatar_data || null });
          setSubscriptionActive(!!row.subscription_active);
        }
      } catch (e) { setErrorMsg(e.message); }
      setSettingsLoaded(true);
    })();
    (async () => {
      const days = await apiFetchTrialDays(session);
      setTrialDays(days);
    })();
    (async () => {
      try {
        const rows = await apiFetchNotes(session);
        setNotes(rows);
      } catch (e) { setErrorMsg(e.message); }
      setNotesLoaded(true);
    })();
  }, []);

  useEffect(() => {
    let active = true;
    setLoadingRecords(true);
    (async () => {
      try {
        await apiCarryForwardRecurring(session, month);
        const rows = await apiFetchRecords(session, month);
        if (active) { setRecordsByMonth((p) => ({ ...p, [month]: rows })); setLoadingRecords(false); }
      } catch (e) {
        if (active) { setErrorMsg(e.message); setLoadingRecords(false); }
      }
    })();
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
      const isFixed = FIXED_TYPES.includes(rec.type);
      const payload = isFixed
        ? { ...rec, month, recurring_group: crypto.randomUUID(), recurring_active: true }
        : { ...rec, month };
      const saved = await apiInsertRecord(session, payload);
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

  async function stopRecurring(record) {
    try {
      await apiDeleteFutureRecurring(session, record.recurring_group, record.month);
      const saved = await apiUpdateRecord(session, record.id, { recurring_active: false });
      setRecordsByMonth((p) => {
        const next = { ...p, [month]: (p[month] || []).map((r) => (r.id === record.id ? saved : r)) };
        // limpa dos meses já carregados em memória que ficaram à frente deste
        for (const key of Object.keys(next)) {
          if (key > record.month) {
            next[key] = next[key].filter((r) => r.recurring_group !== record.recurring_group);
          }
        }
        return next;
      });
      pulse();
    } catch (e) { setErrorMsg(e.message); }
  }

  async function setInvestPct(pct) {
    setInvestPctState(pct);
    try { await apiUpsertSettings(session, { invest_pct: pct }); pulse(); } catch (e) { setErrorMsg(e.message); }
  }

  async function saveProfile(patch) {
    const next = { ...profile, ...patch };
    setProfile(next);
    try { await apiUpsertSettings(session, patch); pulse(); } catch (e) { setErrorMsg(e.message); }
  }

  useEffect(() => {
    if (view !== "profile") return;
    (async () => {
      const months = await apiFetchRecordMonths(session);
      const completedNotes = notes.filter((n) => n.completed).length;
      setLevelStats(computeLevel({
        totalRecords: months.length,
        distinctMonths: new Set(months).size,
        completedNotes,
      }));
    })();
  }, [view, notes]);

  async function addNote(note) {
    try {
      const saved = await apiInsertNote(session, note);
      setNotes((p) => [saved, ...p]);
      pulse();
    } catch (e) { setErrorMsg(e.message); }
  }

  async function toggleNote(id, completed) {
    setNotes((p) => p.map((n) => (n.id === id ? { ...n, completed } : n)));
    try { await apiUpdateNote(session, id, { completed }); } catch (e) { setErrorMsg(e.message); }
  }

  async function editNote(id, patch) {
    try {
      const saved = await apiUpdateNote(session, id, patch);
      setNotes((p) => p.map((n) => (n.id === id ? saved : n)));
      pulse();
    } catch (e) { setErrorMsg(e.message); }
  }

  async function deleteNote(id) {
    try {
      await apiDeleteNote(session, id);
      setNotes((p) => p.filter((n) => n.id !== id));
    } catch (e) { setErrorMsg(e.message); }
  }

  const totals = useMemo(() => {
    const sum = (types) => activeRecords.filter((r) => types.includes(r.type)).reduce((a, r) => a + r.value, 0);
    return { receita: sum(["receita"]), despesas: sum(["despesa_fixa", "despesa_variavel"]) };
  }, [activeRecords]);

  const investCalc = Math.round((totals.receita * investPct) / 100);

  const createdAt = session.user?.created_at ? new Date(session.user.created_at) : new Date();
  const trialEndsAt = new Date(createdAt.getTime() + trialDays * 24 * 60 * 60 * 1000);
  const trialDaysLeft = Math.max(0, Math.ceil((trialEndsAt - new Date()) / (24 * 60 * 60 * 1000)));
  const hasAccess = subscriptionActive || new Date() < trialEndsAt;

  if (settingsLoaded && !hasAccess) {
    return <Paywall email={session.user?.email} onLogout={onLogout} />;
  }

  return (
    <div style={{ background: C.paper, fontFamily: "Inter, system-ui, sans-serif" }} className="min-h-screen w-full flex">
      <Sidebar view={view} setView={setView} onLogout={onLogout} userEmail={session.user?.email} profile={profile} />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar
          trialDaysLeft={!subscriptionActive && settingsLoaded ? trialDaysLeft : null}
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
          {view === "overview" && (
            <Overview totals={totals} investPct={investPct} investCalc={investCalc} onOpenInvestEditor={() => setShowInvestEditor(true)} loading={!settingsLoaded || loadingRecords} />
          )}
          {view === "records" && (
            <Records
              records={activeRecords}
              loading={loadingRecords}
              onNewRecord={() => setModalType("receita")}
              onEditRecord={(r) => setEditingRecord(r)}
              totals={totals}
              investPct={investPct}
              investCalc={investCalc}
            />
          )}
          {view === "notes" && (
            <NotesView notes={notes} loaded={notesLoaded} onAdd={addNote} onEdit={editNote} onToggle={toggleNote} onDelete={deleteNote} />
          )}
          {view === "profile" && (
            <ProfileView profile={profile} email={session.user?.email} onSave={saveProfile} loaded={settingsLoaded} levelStats={levelStats} />
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
          onStopRecurring={() => { stopRecurring(editingRecord); setEditingRecord(null); }}
        />
      )}
    </div>
  );
}

/* ------------------------------ mobile tab bar --------------------------------- */

function MobileTabBar({ view, setView, onLogout }) {
  const items = [
    { id: "overview", label: "Geral", icon: LayoutGrid },
    { id: "records", label: "Registros", icon: ListChecks },
    { id: "notes", label: "Metas", icon: StickyNote },
    { id: "profile", label: "Perfil", icon: UserRound },
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
            className="flex flex-col items-center justify-center gap-1 flex-1 py-2.5 text-[10px] font-medium"
          >
            <Icon size={18} />
            {it.label}
          </button>
        );
      })}
      <button
        onClick={onLogout}
        style={{ color: C.paperDeep }}
        className="flex flex-col items-center justify-center gap-1 flex-1 py-2.5 text-[10px] font-medium"
      >
        <LogOut size={18} />
        Sair
      </button>
    </nav>
  );
}

/* --------------------------------- sidebar ------------------------------------ */

function Sidebar({ view, setView, onLogout, userEmail, profile }) {
  const items = [
    { id: "overview", label: "Visão geral", icon: LayoutGrid },
    { id: "records", label: "Registros", icon: ListChecks },
    { id: "notes", label: "Anotações", icon: StickyNote },
    { id: "profile", label: "Perfil", icon: UserRound },
  ];
  return (
    <aside style={{ background: `linear-gradient(180deg, ${C.ink} 0%, #0D1712 100%)` }} className="w-60 shrink-0 hidden md:flex flex-col justify-between py-6 px-4">
      <div>
        <div className="flex items-center gap-2 px-2 mb-8">
          <div style={{ background: `linear-gradient(135deg, #E2B354 0%, ${C.gold} 100%)`, boxShadow: "0 4px 14px rgba(184,132,46,0.35)" }} className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"><Wallet size={16} color={C.ink} /></div>
          <span style={{ fontFamily: "Fraunces, serif", color: C.paper }} className="text-lg">Cofre</span>
        </div>
        <nav className="flex flex-col gap-1">
          {items.map((it) => {
            const Icon = it.icon; const active = view === it.id;
            return (
              <button key={it.id} onClick={() => setView(it.id)}
                style={{
                  background: active ? `linear-gradient(90deg, rgba(184,132,46,0.22) 0%, rgba(184,132,46,0.05) 100%)` : "transparent",
                  color: active ? C.gold : C.paperDeep,
                  borderLeft: active ? `2px solid ${C.gold}` : "2px solid transparent",
                }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-r-lg text-sm text-left transition hover:bg-white/5">
                <Icon size={17} />{it.label}
              </button>
            );
          })}
        </nav>
      </div>
      <div>
        <button onClick={() => setView("profile")} style={{ borderColor: "rgba(255,255,255,0.1)" }} className="border-t pt-4 mb-2 flex items-center gap-2 px-2 w-full hover:opacity-80 transition">
          {profile?.avatar_data ? (
            <img src={profile.avatar_data} alt="" className="w-7 h-7 rounded-full object-cover shrink-0 ring-2" style={{ "--tw-ring-color": C.gold }} />
          ) : (
            <div style={{ background: `linear-gradient(135deg, ${C.emerald} 0%, #123B2E 100%)` }} className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium shrink-0">
              <span style={{ color: C.paper }}>{(profile?.name || userEmail || "V")[0].toUpperCase()}</span>
            </div>
          )}
          <span style={{ color: C.paperDeep }} className="text-sm truncate">{profile?.name || userEmail}</span>
        </button>
        <button onClick={onLogout} style={{ color: C.paperDeep }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm hover:bg-white/5 transition">
          <LogOut size={16} /> Sair
        </button>
      </div>
    </aside>
  );
}

/* --------------------------------- topbar ------------------------------------- */

function Topbar({ month, onPrev, onNext, onToday, savedPulse, trialDaysLeft }) {
  const isCurrent = month === monthKey(new Date());
  return (
    <header style={{ borderColor: C.line }} className="border-b px-6 md:px-8 py-4 flex items-center justify-between flex-wrap gap-2">
      <div className="flex items-center gap-3">
        <button onClick={onPrev} style={{ borderColor: C.line, color: C.ink }} className="w-8 h-8 rounded-full border flex items-center justify-center hover:bg-black/5"><ChevronLeft size={16} /></button>
        <div className="text-center min-w-[160px]">
          <p style={{ fontFamily: "Fraunces, serif", color: C.ink }} className="text-lg leading-none">{monthLabel(month)}</p>
          {!isCurrent && <button onClick={onToday} style={{ color: C.emerald }} className="text-xs mt-1 underline underline-offset-2">voltar para o mês atual</button>}
        </div>
        <button onClick={onNext} style={{ borderColor: C.line, color: C.ink }} className="w-8 h-8 rounded-full border flex items-center justify-center hover:bg-black/5"><ChevronRight size={16} /></button>
      </div>
      <div className="flex items-center gap-2">
        {trialDaysLeft !== null && trialDaysLeft !== undefined && (
          <a
            href={KIWIFY_CHECKOUT_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{ background: C.goldSoft, color: C.gold }}
            className="text-xs px-3 py-1.5 rounded-full font-medium"
          >
            {trialDaysLeft === 0 ? "Teste acaba hoje — assinar" : `${trialDaysLeft} dia${trialDaysLeft === 1 ? "" : "s"} de teste — assinar`}
          </a>
        )}
        <div style={{ background: savedPulse ? C.emeraldSoft : C.paperDeep, color: savedPulse ? C.emerald : C.inkSoft }} className="text-xs px-3 py-1.5 rounded-full font-medium hidden sm:flex items-center gap-1.5 transition-colors">
          {savedPulse ? <Check size={12} /> : null}{savedPulse ? "Salvo" : "Conectado ao Supabase"}
        </div>
      </div>
    </header>
  );
}

/* --------------------------------- paywall ------------------------------------- */

function Paywall({ email, onLogout }) {
  const checkoutUrl = `${KIWIFY_CHECKOUT_URL}${KIWIFY_CHECKOUT_URL.includes("?") ? "&" : "?"}email=${encodeURIComponent(email || "")}`;
  return (
    <div style={{ background: C.ink, fontFamily: "Inter, system-ui, sans-serif" }} className="min-h-screen w-full flex items-center justify-center p-6">
      <div style={{ background: C.card }} className="w-full max-w-md rounded-2xl p-8 text-center">
        <div style={{ background: C.gold }} className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-5"><Wallet size={22} color={C.ink} /></div>
        <p style={{ fontFamily: "Fraunces, serif", color: C.ink }} className="text-2xl mb-2">Seu teste grátis acabou</p>
        <p style={{ color: C.inkSoft }} className="text-sm mb-6 leading-relaxed">
          Assine o Cofre para continuar registrando suas receitas e despesas e manter o controle do seu mês.
          Use o mesmo e-mail (<strong>{email}</strong>) no pagamento para liberarmos o acesso automaticamente.
        </p>
        <a
          href={checkoutUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ background: C.ink, color: C.paper }}
          className="w-full inline-flex items-center justify-center gap-2 rounded-lg py-3 text-sm font-medium hover:opacity-90 transition mb-3"
        >
          Assinar agora <ArrowRight size={15} />
        </a>
        <button onClick={onLogout} style={{ color: C.inkSoft }} className="text-xs underline underline-offset-2">Sair da conta</button>
      </div>
    </div>
  );
}

/* -------------------------------- overview ------------------------------------ */

function Overview({ totals, investPct, investCalc, onOpenInvestEditor, loading }) {
  return (
    <div>
      <p style={{ color: C.inkSoft }} className="text-sm mb-6">Resumo do mês selecionado.</p>
      <div className="grid sm:grid-cols-3 gap-4 max-w-4xl">
        <SummaryCard
          label="Receita do mês"
          value={loading ? "…" : currency(totals.receita)}
          icon={<TrendingDown size={19} style={{ transform: "rotate(180deg)" }} />}
          gradient={`linear-gradient(135deg, ${C.emerald} 0%, #123B2E 100%)`}
        />
        <SummaryCard
          label="Despesas do mês"
          value={loading ? "…" : currency(totals.despesas)}
          icon={<TrendingDown size={19} />}
          gradient={`linear-gradient(135deg, ${C.rust} 0%, #5C2318 100%)`}
        />
        <SummaryCard
          label="Investir"
          value={loading ? "…" : currency(investCalc)}
          icon={<PiggyBank size={19} />}
          gradient={`linear-gradient(135deg, ${C.gold} 0%, #6E4D14 100%)`}
          onSettings={onOpenInvestEditor}
          footnote={`${investPct}% da receita sugerido`}
        />
      </div>
    </div>
  );
}

function SummaryCard({ label, value, icon, gradient, onSettings, footnote }) {
  return (
    <div style={{ background: gradient }} className="rounded-2xl p-5 relative overflow-hidden shadow-lg">
      <div style={{ background: "radial-gradient(circle at 100% 0%, rgba(255,255,255,0.14), transparent 60%)" }} className="absolute inset-0 pointer-events-none" />
      <div className="relative flex items-center justify-between mb-5">
        <div style={{ background: "rgba(255,255,255,0.16)", color: C.paper }} className="w-10 h-10 rounded-xl flex items-center justify-center backdrop-blur-sm">{icon}</div>
        {onSettings && (
          <button onClick={onSettings} style={{ color: "rgba(255,255,255,0.75)" }} className="hover:text-white transition" title="Ajustar percentual">
            <Settings2 size={17} />
          </button>
        )}
      </div>
      <p style={{ color: "rgba(255,255,255,0.72)" }} className="relative text-xs uppercase tracking-wide mb-1 font-medium">{label}</p>
      <p style={{ fontFamily: "Fraunces, serif", color: C.paper }} className="relative text-[26px] leading-tight">{value}</p>
      {footnote && <p style={{ color: "rgba(255,255,255,0.85)" }} className="relative text-xs mt-2 font-medium">{footnote}</p>}
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

function Records({ records, loading, onNewRecord, onEditRecord, totals, investPct, investCalc }) {
  const [tab, setTab] = useState("receitas");
  const activeTab = TABS.find((t) => t.id === tab);
  const filtered = records.filter((r) => activeTab.types.includes(r.type));
  const sobraCalculada = (totals?.receita || 0) - (totals?.despesas || 0);

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

      {tab === "sobra_invest" && (
        <div className="grid sm:grid-cols-2 gap-4 mb-5">
          <div style={{ background: C.goldSoft, borderColor: C.gold + "44" }} className="rounded-xl border p-4">
            <p style={{ color: C.gold }} className="text-xs font-medium uppercase tracking-wide mb-1">Sobra calculada (receita − despesas)</p>
            <p style={{ fontFamily: "Fraunces, serif", color: C.ink }} className="text-xl">{currency(sobraCalculada)}</p>
          </div>
          <div style={{ background: C.slateSoft || C.goldSoft, borderColor: C.slate + "44" }} className="rounded-xl border p-4">
            <p style={{ color: C.slate }} className="text-xs font-medium uppercase tracking-wide mb-1">Sugestão de investimento ({investPct}% da receita)</p>
            <p style={{ fontFamily: "Fraunces, serif", color: C.ink }} className="text-xl">{currency(investCalc)}</p>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-5">
        <div style={{ background: C.card, borderColor: C.line }} className="lg:col-span-2 rounded-xl border overflow-hidden">
          {/* mobile: lista em cards, sem rolagem lateral */}
          <div className="sm:hidden divide-y" style={{ borderColor: C.line }}>
            {loading && <p style={{ color: C.inkSoft }} className="px-4 py-10 text-center text-sm">Carregando registros…</p>}
            {!loading && filtered.length === 0 && (
              <p style={{ color: C.inkSoft }} className="px-4 py-10 text-center text-sm">Nenhum registro nesta aba ainda. Use "Novo registro" para adicionar o primeiro.</p>
            )}
            {!loading && filtered.map((r) => {
              const meta = TYPE_META[r.type];
              return (
                <button
                  key={r.id}
                  onClick={() => onEditRecord(r)}
                  style={{ borderColor: C.line }}
                  className="w-full text-left px-4 py-3 flex items-center justify-between gap-3 hover:bg-black/[0.03] transition"
                >
                  <div className="min-w-0">
                    <p style={{ color: C.ink }} className="text-sm font-medium truncate">{r.description}</p>
                    <p style={{ color: C.inkSoft }} className="text-xs mt-0.5 truncate">{r.category} · {r.date?.split("-").reverse().join("/")}</p>
                    <span style={{ background: meta.color + "22", color: meta.color }} className="inline-block text-[10px] px-2 py-0.5 rounded-full font-medium mt-1.5">{meta.label}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span style={{ color: C.ink }} className="text-sm font-semibold">{currency(r.value)}</span>
                    <ChevronRight size={15} style={{ color: C.inkSoft }} />
                  </div>
                </button>
              );
            })}
          </div>

          {/* desktop/tablet: tabela completa */}
          <table className="w-full text-sm hidden sm:table">
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

function NewRecordModal({ initialType, existingRecord, onClose, onSave, onDelete, onStopRecurring }) {
  const isEdit = !!existingRecord;
  const [type, setType] = useState(initialType);
  const [date, setDate] = useState(existingRecord?.date || "");
  const [description, setDescription] = useState(existingRecord?.description || "");
  const [value, setValue] = useState(existingRecord ? String(existingRecord.value) : "");
  const [category, setCategory] = useState(existingRecord?.category || CATEGORY_OPTIONS[initialType][0]);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingStop, setConfirmingStop] = useState(false);

  function handleTypeChange(t) { if (isEdit) return; setType(t); setCategory(CATEGORY_OPTIONS[t][0]); }
  const meta = TYPE_META[type];
  const isRecurring = !!existingRecord?.recurring_group;
  const recurringActive = existingRecord?.recurring_active !== false;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4" style={{ background: "rgba(19,32,25,0.45)" }}>
      <div style={{ background: C.card }} className="w-full max-w-lg rounded-xl p-6 relative max-h-[90vh] overflow-auto">
        <button onClick={onClose} style={{ color: C.inkSoft }} className="absolute top-4 right-4 hover:text-black"><X size={18} /></button>
        <p style={{ fontFamily: "Fraunces, serif", color: C.ink }} className="text-lg mb-1">{isEdit ? "Editar registro" : "Novo registro"}</p>
        {isRecurring && (
          <p style={{ color: recurringActive ? C.emerald : C.inkSoft }} className="text-xs font-medium mb-4 flex items-center gap-1.5">
            <RefreshCw size={12} /> {recurringActive ? "Item fixo — repete todo mês automaticamente" : "Recorrência encerrada — não repete mais"}
          </p>
        )}
        {!isRecurring && <div className="mb-5" />}

        <p style={{ color: C.inkSoft }} className="text-xs uppercase tracking-wide font-medium mb-2">Tipo de registro</p>
        <div className="grid grid-cols-2 gap-2 mb-5">
          {Object.entries(TYPE_META).map(([key, m]) => (
            <button key={key} onClick={() => handleTypeChange(key)} disabled={isEdit}
              style={{ borderColor: type === key ? m.color : C.line, background: type === key ? m.color + "1A" : "transparent", color: type === key ? m.color : C.inkSoft, opacity: isEdit && type !== key ? 0.5 : 1, cursor: isEdit ? "default" : "pointer" }}
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
          <p style={{ color: C.inkSoft }} className="text-xs -mt-2">Isso altera só o registro deste mês — meses futuros ainda não gerados vão herdar essa alteração.</p>

          {isEdit && isRecurring && recurringActive && (
            <div>
              {!confirmingStop ? (
                <button type="button" onClick={() => setConfirmingStop(true)} style={{ color: C.gold }} className="text-xs font-medium hover:underline flex items-center gap-1.5">
                  <RefreshCw size={12} /> Encerrar recorrência (não repetir mais)
                </button>
              ) : (
                <div style={{ background: C.goldSoft }} className="rounded-lg p-3 flex items-center justify-between gap-3 flex-wrap">
                  <span style={{ color: C.gold }} className="text-xs">Este mês continua salvo, mas os meses futuros que já foram gerados a partir dele serão apagados. Confirma?</span>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setConfirmingStop(false)} style={{ color: C.inkSoft }} className="text-xs px-2 py-1">Cancelar</button>
                    <button type="button" onClick={onStopRecurring} style={{ background: C.gold, color: "#fff" }} className="text-xs px-3 py-1.5 rounded-md font-medium">Encerrar</button>
                  </div>
                </div>
              )}
            </div>
          )}

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
                  <span style={{ color: C.rust }} className="text-xs">
                    {isRecurring ? "Isso apaga só o registro deste mês (não afeta os outros meses)." : "Tem certeza? Essa ação não pode ser desfeita."}
                  </span>
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

/* ---------------------------------- notes -------------------------------------- */

function isOverdue(note) {
  if (note.completed || !note.due_date) return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return new Date(note.due_date + "T00:00:00") < today;
}

function NotesView({ notes, loaded, onAdd, onEdit, onToggle, onDelete }) {
  const [formMode, setFormMode] = useState(null); // null | "new" | note object sendo editado
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);

  const pending = notes.filter((n) => !n.completed);
  const done = notes.filter((n) => n.completed);
  const isEditing = formMode && formMode !== "new";

  function openNew() {
    setTitle(""); setDueDate(""); setFormMode("new");
  }
  function openEdit(note) {
    setTitle(note.title); setDueDate(note.due_date || ""); setFormMode(note);
  }
  function closeForm() {
    setFormMode(null);
  }

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    if (isEditing) {
      await onEdit(formMode.id, { title: title.trim(), due_date: dueDate || null });
    } else {
      await onAdd({ title: title.trim(), due_date: dueDate || null, completed: false });
    }
    setSaving(false);
    closeForm();
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-5">
        <div>
          <p style={{ fontFamily: "Fraunces, serif", color: C.ink }} className="text-xl">Anotações & metas</p>
          <p style={{ color: C.inkSoft }} className="text-sm mt-0.5">Marque como concluído quando terminar. Prazos vencidos aparecem com um X.</p>
        </div>
        <button onClick={openNew} style={{ background: C.ink, color: C.paper }} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition shrink-0">
          <Plus size={16} /> Nova
        </button>
      </div>

      {formMode && (
        <div style={{ background: C.card, borderColor: C.line }} className="rounded-xl border p-4 mb-5 flex flex-col gap-3">
          <p style={{ color: C.inkSoft }} className="text-xs uppercase tracking-wide font-medium">{isEditing ? "Editar anotação" : "Nova anotação"}</p>
          <Field label="Título da meta ou anotação" icon={<StickyNote size={15} />}>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Juntar reserva de emergência" className="w-full bg-transparent outline-none text-sm" style={{ color: C.ink }} />
          </Field>
          <Field label="Prazo (opcional)" icon={<CalendarDays size={15} />}>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full bg-transparent outline-none text-sm" style={{ color: C.ink }} />
          </Field>
          <div className="flex gap-2">
            <button type="button" onClick={closeForm} style={{ color: C.inkSoft, borderColor: C.line }} className="flex-1 border rounded-lg py-2 text-sm">Cancelar</button>
            <button type="button" disabled={saving} onClick={handleSave} style={{ background: C.ink, color: C.paper, opacity: saving ? 0.7 : 1 }} className="flex-1 rounded-lg py-2 text-sm font-medium flex items-center justify-center gap-2">
              {saving ? <Loader2 size={15} className="animate-spin" /> : "Salvar"}
            </button>
          </div>
        </div>
      )}

      {!loaded ? (
        <p style={{ color: C.inkSoft }} className="text-sm">Carregando…</p>
      ) : notes.length === 0 ? (
        <p style={{ color: C.inkSoft }} className="text-sm">Nenhuma anotação ainda. Use "Nova" para começar.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {[...pending, ...done].map((n) => {
            const overdue = isOverdue(n);
            return (
              <div key={n.id} style={{ background: C.card, borderColor: C.line }} className="rounded-xl border p-3.5 flex items-center gap-3">
                <button
                  onClick={() => onToggle(n.id, !n.completed)}
                  title={n.completed ? "Marcar como pendente" : "Marcar como concluída"}
                  style={{ color: n.completed ? C.emerald : overdue ? C.rust : C.inkSoft }}
                  className="shrink-0"
                >
                  {n.completed ? <CheckCircle2 size={22} /> : overdue ? <CircleX size={22} /> : <Circle size={22} />}
                </button>
                <button onClick={() => openEdit(n)} className="min-w-0 flex-1 text-left">
                  <p style={{ color: n.completed ? C.inkSoft : C.ink, textDecoration: n.completed ? "line-through" : "none" }} className="text-sm font-medium truncate">
                    {n.title}
                  </p>
                  {n.due_date && (
                    <p style={{ color: overdue ? C.rust : C.inkSoft }} className="text-xs mt-0.5">
                      {overdue ? "Venceu em " : "Prazo: "}{n.due_date.split("-").reverse().join("/")}
                    </p>
                  )}
                </button>
                <button onClick={() => openEdit(n)} style={{ color: C.inkSoft }} className="shrink-0 hover:text-black transition" title="Editar">
                  <Pencil size={15} />
                </button>
                <button onClick={() => onDelete(n.id)} style={{ color: C.inkSoft }} className="shrink-0 hover:text-black transition" title="Excluir">
                  <Trash2 size={16} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* --------------------------------- profile -------------------------------------- */

function resizeImageToDataUrl(file, maxSize = 240) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Arquivo de imagem inválido."));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function ProfileView({ profile, email, onSave, loaded, levelStats }) {
  const [name, setName] = useState(profile?.name || "");
  const [age, setAge] = useState(profile?.age ?? "");
  const [avatar, setAvatar] = useState(profile?.avatar_data || null);
  const [saving, setSaving] = useState(false);
  const [imgError, setImgError] = useState("");

  useEffect(() => {
    setName(profile?.name || "");
    setAge(profile?.age ?? "");
    setAvatar(profile?.avatar_data || null);
  }, [profile?.name, profile?.age, profile?.avatar_data]);

  async function handlePhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImgError("");
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      setAvatar(dataUrl);
    } catch (err) {
      setImgError(err.message);
    }
  }

  async function handleSave() {
    setSaving(true);
    await onSave({ name: name.trim() || null, age: age === "" ? null : Number(age), avatar_data: avatar });
    setSaving(false);
  }

  if (!loaded) return <p style={{ color: C.inkSoft }} className="text-sm">Carregando…</p>;

  return (
    <div className="max-w-md">
      <p style={{ fontFamily: "Fraunces, serif", color: C.ink }} className="text-xl mb-1">Seu perfil</p>
      <p style={{ color: C.inkSoft }} className="text-sm mb-6">Essas informações ficam só na sua conta.</p>

      <div style={{ background: `linear-gradient(135deg, ${C.ink} 0%, #1D3128 100%)` }} className="rounded-2xl p-5 mb-6 relative overflow-hidden">
        <div style={{ background: `radial-gradient(circle at 90% 0%, ${C.gold}2A, transparent 60%)` }} className="absolute inset-0 pointer-events-none" />
        <div className="relative flex items-center gap-4 mb-4">
          <div className="relative shrink-0">
            <div style={{ background: C.paperDeep }} className="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center ring-2" style={{ "--tw-ring-color": C.gold }}>
              {avatar ? <img src={avatar} alt="" className="w-full h-full object-cover" /> : <UserRound size={26} style={{ color: C.inkSoft }} />}
            </div>
            {levelStats && (
              <div style={{ background: `linear-gradient(135deg, #E2B354 0%, ${C.gold} 100%)`, borderColor: C.ink, color: C.ink }} className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full border-2 flex items-center justify-center text-[10px] font-bold">
                {levelStats.level}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p style={{ color: C.paper }} className="text-sm font-medium truncate">{name || "Você"}</p>
            {levelStats ? (
              <p style={{ color: C.gold }} className="text-xs font-medium">Nível {levelStats.level} · {levelStats.title}</p>
            ) : (
              <p style={{ color: C.paperDeep }} className="text-xs">Calculando nível…</p>
            )}
          </div>
        </div>
        {levelStats && (
          <div className="relative">
            <div style={{ background: "rgba(255,255,255,0.12)" }} className="w-full h-2 rounded-full overflow-hidden">
              <div style={{ width: `${levelStats.progressPct}%`, background: `linear-gradient(90deg, ${C.gold} 0%, #E2B354 100%)` }} className="h-full rounded-full transition-all duration-500" />
            </div>
            <p style={{ color: C.paperDeep }} className="text-[11px] mt-1.5">
              {levelStats.xpIntoLevel} / {levelStats.xpForNextLevel} XP para o nível {levelStats.level + 1}
            </p>
            <p style={{ color: C.paperDeep, opacity: 0.75 }} className="text-[11px] mt-2 leading-relaxed">
              Ganhe XP registrando receitas e despesas, concluindo metas e usando o Cofre todo mês.
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-4 mb-6">
        <div style={{ background: C.paperDeep }} className="w-20 h-20 rounded-full overflow-hidden flex items-center justify-center shrink-0">
          {avatar ? <img src={avatar} alt="" className="w-full h-full object-cover" /> : <UserRound size={30} style={{ color: C.inkSoft }} />}
        </div>
        <label style={{ borderColor: C.line, color: C.ink }} className="border rounded-lg px-3 py-2 text-sm font-medium flex items-center gap-2 cursor-pointer hover:bg-black/5 transition">
          <Camera size={15} /> {avatar ? "Trocar foto" : "Adicionar foto"}
          <input type="file" accept="image/*" onChange={handlePhoto} className="hidden" />
        </label>
      </div>
      {imgError && <p style={{ color: C.rust }} className="text-xs mb-4">{imgError}</p>}

      <div className="flex flex-col gap-4">
        <Field label="E-mail" icon={<Mail size={16} />}>
          <span className="w-full text-sm" style={{ color: C.inkSoft }}>{email}</span>
        </Field>
        <Field label="Nome" icon={<User size={16} />}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" className="w-full bg-transparent outline-none text-sm" style={{ color: C.ink }} />
        </Field>
        <Field label="Idade" icon={<CalendarDays size={16} />}>
          <input type="number" min="0" max="120" value={age} onChange={(e) => setAge(e.target.value)} placeholder="Sua idade" className="w-full bg-transparent outline-none text-sm" style={{ color: C.ink }} />
        </Field>

        <button
          type="button"
          disabled={saving}
          onClick={handleSave}
          style={{ background: C.ink, color: C.paper, opacity: saving ? 0.7 : 1 }}
          className="mt-2 rounded-lg py-2.5 text-sm font-medium hover:opacity-90 transition flex items-center justify-center gap-2"
        >
          {saving ? <><Loader2 size={15} className="animate-spin" /> Salvando…</> : "Salvar perfil"}
        </button>
      </div>
    </div>
  );
}
