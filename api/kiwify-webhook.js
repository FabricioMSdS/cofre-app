// Função serverless (roda no servidor da Vercel, não no navegador).
// Recebe o aviso da Kiwify quando um pagamento é aprovado/reembolsado/estornado
// e atualiza o campo subscription_active do usuário correspondente no Supabase.
//
// Variáveis de ambiente necessárias (configurar em Vercel → Project → Settings → Environment Variables):
//   SUPABASE_URL                - mesma URL usada no app
//   SUPABASE_SERVICE_ROLE_KEY   - chave service_role do Supabase (NUNCA no front-end)
//   KIWIFY_WEBHOOK_TOKEN        - token secreto que você escolhe e usa na URL do webhook

const APPROVED_EVENTS = ["compra_aprovada", "purchase.approved", "paid", "approved"];
const REVOKE_EVENTS = ["compra_reembolsada", "chargeback", "purchase.refunded", "refunded", "refused"];

async function findUserByEmail(supabaseUrl, serviceRoleKey, email) {
  const headers = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` };

  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/admin/users?email=${encodeURIComponent(email)}`, { headers });
    if (res.ok) {
      const data = await res.json();
      const list = data?.users || data || [];
      const found = list.find((u) => u.email?.toLowerCase() === email.toLowerCase());
      if (found) return found;
    }
  } catch (e) {
    /* segue para o fallback */
  }

  for (let page = 1; page <= 10; page++) {
    const res = await fetch(`${supabaseUrl}/auth/v1/admin/users?page=${page}&per_page=200`, { headers });
    if (!res.ok) break;
    const data = await res.json();
    const list = data?.users || data || [];
    const found = list.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (list.length < 200) break;
  }
  return null;
}

function extractEmail(body) {
  return (
    body?.Customer?.email ||
    body?.customer?.email ||
    body?.data?.Customer?.email ||
    body?.data?.customer?.email ||
    body?.buyer?.email ||
    null
  );
}

function extractEventType(body) {
  return body?.webhook_event_type || body?.event || body?.order_status || body?.status || body?.data?.order_status || null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }

  const token = req.query.token;
  if (!token || token !== process.env.KIWIFY_WEBHOOK_TOKEN) {
    res.status(401).send("Unauthorized");
    return;
  }

  const body = req.body || {};
  console.log("Kiwify webhook recebido:", JSON.stringify(body));

  const email = extractEmail(body);
  const eventType = (extractEventType(body) || "").toString().toLowerCase();

  if (!email) {
    console.log("Webhook sem e-mail do comprador — ignorando.");
    res.status(200).send("ok (sem email)");
    return;
  }

  const isApproval = APPROVED_EVENTS.some((e) => eventType.includes(e));
  const isRevoke = REVOKE_EVENTS.some((e) => eventType.includes(e));

  if (!isApproval && !isRevoke) {
    console.log("Evento não tratado:", eventType);
    res.status(200).send("ok (evento ignorado)");
    return;
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const user = await findUserByEmail(SUPABASE_URL, SERVICE_ROLE_KEY, email);
  if (!user) {
    console.log("Nenhum usuário do Cofre encontrado para o e-mail:", email);
    res.status(200).send("ok (usuário não encontrado)");
    return;
  }

  const upsertRes = await fetch(`${SUPABASE_URL}/rest/v1/settings`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify({
      user_id: user.id,
      subscription_active: isApproval,
      subscription_updated_at: new Date().toISOString(),
    }),
  });

  if (!upsertRes.ok) {
    const errText = await upsertRes.text();
    console.log("Erro ao atualizar settings:", errText);
    res.status(200).send("ok (falha ao atualizar, veja os logs)");
    return;
  }

  console.log(`Assinatura ${isApproval ? "ativada" : "revogada"} para`, email);
  res.status(200).send("ok");
}
