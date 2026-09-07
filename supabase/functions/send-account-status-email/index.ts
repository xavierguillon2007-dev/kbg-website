import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  Deno.env.get("SUPABASE_SECRET_KEY");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const allowedOrigins = [
  "https://www.koolboardgames.fr",
  "https://koolboardgames.fr"
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const allowed =
    allowedOrigins.includes(origin) ||
    /^https:\/\/kbg-website-[a-z0-9-]+\.vercel\.app$/i.test(origin);

  return {
    "Access-Control-Allow-Origin": allowed ? origin : "https://www.koolboardgames.fr",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  };
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Clé Supabase serveur manquante");
    }
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY manquante");
    }

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authentification requise" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const callerClient = createClient(
      SUPABASE_URL,
      Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: callerData, error: callerError } =
      await callerClient.auth.getUser();

    if (callerError || !callerData?.user) {
      return new Response(JSON.stringify({ error: "Session invalide" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const adminClient = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: adminRow, error: adminError } = await adminClient
      .from("admin_users")
      .select("user_id")
      .eq("user_id", callerData.user.id)
      .maybeSingle();

    if (adminError || !adminRow) {
      return new Response(JSON.stringify({ error: "Accès réservé aux administrateurs." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { to, first_name, status } = await req.json();

    if (!to || !first_name || status !== "approved") {
      return new Response(JSON.stringify({ error: "Paramètres invalides" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Le lien magique prouve la possession de l'adresse e-mail.
    // Lorsqu'il est utilisé, Supabase confirme l'e-mail et le trigger SQL
    // fait passer profiles.account_status de pending_email à approved.
    const { data: linkData, error: linkError } =
      await adminClient.auth.admin.generateLink({
        type: "magiclink",
        email: String(to).trim().toLowerCase(),
        options: {
          redirectTo: "https://www.koolboardgames.fr/index.html"
        }
      });

    if (linkError) {
      throw linkError;
    }

    const actionLink = linkData?.properties?.action_link;
    if (!actionLink) {
      throw new Error("Impossible de générer le lien de confirmation.");
    }

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_API_KEY}`
      },
      body: JSON.stringify({
        from: "Kool Board Games <noreply@koolboardgames.fr>",
        to: [String(to).trim().toLowerCase()],
        subject: "🎉 Votre compte KBG a été validé — confirmez votre e-mail",
        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.6;color:#222;max-width:620px;margin:auto;">
            <h2>🎉 Bonjour ${String(first_name).replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'}[c]))} !</h2>
            <p>
              Bonne nouvelle : votre compte <strong>Kool Board Games</strong>
              a été validé par un administrateur.
            </p>
            <p>
              Il reste une dernière étape : <strong>confirmer que cette adresse e-mail vous appartient</strong>.
            </p>
            <p style="margin:28px 0;">
              <a href="${actionLink}" style="display:inline-block;padding:12px 18px;background:#4b2e83;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;">
                Confirmer mon e-mail et activer mon compte
              </a>
            </p>
            <p style="font-size:13px;color:#666;">
              Ce lien est personnel et à usage unique. Après confirmation, votre compte sera définitivement activé.
            </p>
            <p>À bientôt sur KBG !</p>
          </div>
        `
      })
    });

    const result = await resendResponse.json();

    return new Response(JSON.stringify(result), {
      status: resendResponse.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error("send-account-status-email:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
