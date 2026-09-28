// send-notification-email: Sends email notifications for friendly challenges and ranking rounds
import { createClient } from "npm:@supabase/supabase-js@2.110.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabase = createClient(supabaseUrl, supabaseServiceKey);

type EmailRequest = {
  type: "friendly_challenge" | "ranking_round";
  recipientId: string;
  challengerName?: string;
  matchDate?: string | null;
  matchTime?: string | null;
  note?: string | null;
  roundNumber?: number;
  opponentName?: string;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json() as EmailRequest;
    const { type, recipientId } = body;

    if (!recipientId) {
      return new Response(
        JSON.stringify({ error: "recipientId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Fetch recipient email from profiles
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("email, display_name")
      .eq("id", recipientId)
      .maybeSingle();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: "Recipient not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const recipientEmail = profile.email as string;
    const recipientName = (profile.display_name as string) ?? "Jogador";

    let subject = "";
    let htmlBody = "";

    const siteUrl = supabaseUrl.replace(".supabase.co", "") || "https://tenis-entre-amigos.app";
    const loginLink = `${Deno.env.get("SITE_URL") ?? "https://tenis-entre-amigos.app"}`;

    if (type === "friendly_challenge") {
      const challengerName = body.challengerName ?? "Um jogador";
      const dateStr = body.matchDate
        ? `Data: ${body.matchDate}${body.matchTime ? ` as ${body.matchTime}` : ""}`
        : "";
      const noteStr = body.note ? `Mensagem: ${body.note}` : "";

      subject = "Voce recebeu um novo desafio de amistoso — TENIS ENTRE AMIGOS";
      htmlBody = `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #3D5200;">Novo desafio de amistoso</h2>
          <p>Ola <strong>${recipientName}</strong>,</p>
          <p>Voce recebeu um novo convite para um amistoso de <strong>${challengerName}</strong>.</p>
          ${dateStr ? `<p>${dateStr}</p>` : ""}
          ${noteStr ? `<p style="font-style: italic;">${noteStr}</p>` : ""}
          <p>Acesse o sistema para visualizar e responder ao convite:</p>
          <a href="${loginLink}/amistosos" style="display: inline-block; background: #3D5200; color: white; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-top: 10px;">Ver convite</a>
          <hr style="margin-top: 24px; border: none; border-top: 1px solid #eee;" />
          <p style="font-size: 12px; color: #999;">TENIS ENTRE AMIGOS — Rivalidade na quadra. Amizade fora dela.</p>
        </div>
      `;
    } else if (type === "ranking_round") {
      const roundNumber = body.roundNumber ?? 1;
      const opponentName = body.opponentName ?? "seu adversario";

      subject = "Nova rodada do Ranking disponivel — TENIS ENTRE AMIGOS";
      htmlBody = `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #3D5200;">Nova rodada do Ranking</h2>
          <p>Ola <strong>${recipientName}</strong>,</p>
          <p>A <strong>Rodada ${roundNumber}</strong> foi sorteada e sua partida esta disponivel.</p>
          <p>Seu adversario: <strong>${opponentName}</strong></p>
          <p>Acesse o sistema para visualizar sua partida:</p>
          <a href="${loginLink}/ranking" style="display: inline-block; background: #3D5200; color: white; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-top: 10px;">Ver minha partida</a>
          <hr style="margin-top: 24px; border: none; border-top: 1px solid #eee;" />
          <p style="font-size: 12px; color: #999;">TENIS ENTRE AMIGOS — Rivalidade na quadra. Amizade fora dela.</p>
        </div>
      `;
    } else {
      return new Response(
        JSON.stringify({ error: "Invalid notification type" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Send email using Supabase's built-in email service
    // Note: Supabase Auth has a built-in email system, but for custom emails
    // we use the Resend API if configured, otherwise we log and skip
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (resendApiKey) {
      const emailResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Tenis Entre Amigos <noreply@tenis-entre-amigos.app>",
          to: [recipientEmail],
          subject,
          html: htmlBody,
        }),
      });

      if (!emailResponse.ok) {
        const errText = await emailResponse.text();
        console.error("Email send failed:", errText);
        return new Response(
          JSON.stringify({ error: "Failed to send email", details: errText }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({ success: true, message: "Email sent" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    } else {
      // No email provider configured — log the email for development
      console.log("Email would be sent (no provider configured):", {
        to: recipientEmail,
        subject,
      });
      return new Response(
        JSON.stringify({ success: true, message: "Email logged (no provider configured)" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  } catch (err) {
    console.error("Edge function error:", err);
    return new Response(
      JSON.stringify({ error: err.message ?? "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
