import { createClient } from "npm:@supabase/supabase-js@2.110.3";
import { hashEditKey, editKeyMatches } from "./edit-key.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, x-tournament-edit-key",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status: number, details?: unknown) {
  return json({ error: message, details }, status);
}

function getEditKey(req: Request): string {
  return req.headers.get("x-tournament-edit-key")?.trim() ?? "";
}

function stateIsReasonableSize(value: unknown): boolean {
  return JSON.stringify(value).length <= 500_000;
}

function getSupabaseAdmin() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return errorResponse("Cloud storage is not configured", 503);

  const url = new URL(req.url);
  const pathParts = url.pathname.replace(/^\/functions\/v1\/tournament-api\/?/, "").split("/").filter(Boolean);

  try {
    // GET /tournament-api — list all tournaments
    if (req.method === "GET" && pathParts.length === 0) {
      const { data, error } = await supabase
        .from("tournaments")
        .select("slug, name, revision, created_at, updated_at")
        .order("updated_at", { ascending: false })
        .limit(200);

      if (error) return errorResponse("Could not list tournaments", 500);
      return json({
        tournaments: data.map((row: Record<string, unknown>) => ({
          slug: row.slug,
          name: row.name,
          revision: row.revision,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        })),
      });
    }

    // POST /tournament-api — create tournament
    if (req.method === "POST" && pathParts.length === 0) {
      let body: unknown;
      try { body = await req.json(); } catch { return errorResponse("Invalid JSON body", 400); }
      if (!stateIsReasonableSize(body)) return errorResponse("Tournament data is too large", 413);

      const slug = (body as Record<string, unknown>)?.slug;
      const editKey = (body as Record<string, unknown>)?.editKey;
      const data = (body as Record<string, unknown>)?.data;
      if (typeof slug !== "string" || typeof editKey !== "string" || typeof data !== "object") {
        return errorResponse("Invalid tournament data", 400);
      }

      const { data: tournament, error } = await supabase
        .from("tournaments")
        .insert({ slug, name: (data as Record<string, unknown>).name, data })
        .select("id, slug, revision, updated_at")
        .single();

      if (error) {
        if (error.code === "23505") return errorResponse("That public link is already taken", 409);
        return errorResponse("Could not create the shared tournament", 500);
      }

      const { error: secretError } = await supabase
        .from("tournament_edit_secrets")
        .insert({ tournament_id: tournament.id, edit_key_hash: hashEditKey(editKey) });

      if (secretError) {
        await supabase.from("tournaments").delete().eq("id", tournament.id);
        return errorResponse("Could not secure the shared tournament", 500);
      }

      return json({ slug: tournament.slug, revision: tournament.revision, updatedAt: tournament.updated_at }, 201);
    }

    // Routes with slug: /tournament-api/{slug} and /tournament-api/{slug}/verify
    if (pathParts.length >= 1) {
      const slug = pathParts[0];
      const action = pathParts[1];

      // POST /tournament-api/{slug}/verify
      if (req.method === "POST" && action === "verify") {
        const editKey = getEditKey(req);
        if (!editKey) return errorResponse("The tournament edit key is required", 401);

        const { data: tournament } = await supabase
          .from("tournaments").select("id").eq("slug", slug).maybeSingle();
        if (!tournament) return errorResponse("Tournament not found", 404);

        const { data: secret } = await supabase
          .from("tournament_edit_secrets")
          .select("edit_key_hash")
          .eq("tournament_id", tournament.id)
          .maybeSingle();
        if (!secret || !editKeyMatches(editKey, secret.edit_key_hash)) {
          return errorResponse("Incorrect tournament edit key", 403);
        }
        return json({ ok: true });
      }

      // GET /tournament-api/{slug}
      if (req.method === "GET" && !action) {
        const { data: row, error } = await supabase
          .from("tournaments")
          .select("slug, revision, updated_at, data")
          .eq("slug", slug)
          .maybeSingle();
        if (error) return errorResponse("Cloud storage is not configured", 503);
        if (!row) return errorResponse("Tournament not found", 404);
        return json({ slug: row.slug, revision: row.revision, updatedAt: row.updated_at, data: row.data });
      }

      // DELETE /tournament-api/{slug}
      if (req.method === "DELETE" && !action) {
        const editKey = getEditKey(req);
        if (!editKey) return errorResponse("The tournament edit key is required", 401);

        const { data: row } = await supabase
          .from("tournaments").select("id").eq("slug", slug).maybeSingle();
        if (!row) return errorResponse("Tournament not found", 404);

        const { data: secret } = await supabase
          .from("tournament_edit_secrets")
          .select("edit_key_hash")
          .eq("tournament_id", row.id)
          .maybeSingle();
        if (!secret || !editKeyMatches(editKey, secret.edit_key_hash)) {
          return errorResponse("Incorrect tournament edit key", 403);
        }

        const { error } = await supabase.from("tournaments").delete().eq("id", row.id);
        if (error) return errorResponse("Could not delete the tournament", 500);
        return json({ ok: true });
      }

      // PATCH /tournament-api/{slug}
      if (req.method === "PATCH" && !action) {
        const editKey = getEditKey(req);
        if (!editKey) return errorResponse("The tournament edit key is required", 401);

        let body: unknown;
        try { body = await req.json(); } catch { return errorResponse("Invalid JSON body", 400); }
        if (!stateIsReasonableSize(body)) return errorResponse("Tournament data is too large", 413);

        const expectedRevision = (body as Record<string, unknown>)?.expectedRevision;
        const data = (body as Record<string, unknown>)?.data;
        if (typeof expectedRevision !== "number" || typeof data !== "object") {
          return errorResponse("Invalid tournament update", 400);
        }

        const { data: row } = await supabase
          .from("tournaments")
          .select("id, slug, revision, updated_at, data")
          .eq("slug", slug)
          .maybeSingle();
        if (!row) return errorResponse("Tournament not found", 404);

        const { data: secret } = await supabase
          .from("tournament_edit_secrets")
          .select("edit_key_hash")
          .eq("tournament_id", row.id)
          .maybeSingle();
        if (!secret || !editKeyMatches(editKey, secret.edit_key_hash)) {
          return errorResponse("Incorrect tournament edit key", 403);
        }

        if (row.revision !== expectedRevision) {
          return json({
            error: "Tournament changed elsewhere",
            current: { slug: row.slug, revision: row.revision, updatedAt: row.updated_at, data: row.data },
          }, 409);
        }

        const nextRevision = row.revision + 1;
        const { data: updated, error: updateError } = await supabase
          .from("tournaments")
          .update({
            name: (data as Record<string, unknown>).name,
            data,
            revision: nextRevision,
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id)
          .eq("revision", row.revision)
          .select("slug, revision, updated_at, data")
          .maybeSingle();

        if (updateError) return errorResponse("Could not save the tournament", 500);
        if (!updated) {
          const { data: latest } = await supabase
            .from("tournaments")
            .select("slug, revision, updated_at, data")
            .eq("slug", slug)
            .maybeSingle();
          return json({
            error: "Tournament changed elsewhere",
            current: latest ? { slug: latest.slug, revision: latest.revision, updatedAt: latest.updated_at, data: latest.data } : null,
          }, 409);
        }

        return json({ slug: updated.slug, revision: updated.revision, updatedAt: updated.updated_at, data: updated.data });
      }
    }

    return errorResponse("Not found", 404);
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Internal server error", 500);
  }
});
