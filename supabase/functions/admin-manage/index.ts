// supabase/functions/admin-manage/index.ts
//
// Satu-satunya jalur untuk membuat / mencabut akun admin. SENGAJA dipisah
// dari RLS biasa: function ini pakai service_role key (bisa apa saja),
// tapi SETIAP request WAJIB divalidasi dulu: pemanggil harus admin aktif
// dengan role 'super_admin'. Tanpa ini, admin biasa bisa saja memanipulasi
// request langsung ke tabel dan menaikkan dirinya jadi super_admin.
//
// Deploy: supabase functions deploy admin-manage
// (TANPA --no-verify-jwt — endpoint ini WAJIB ada Supabase Auth JWT valid)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders, json } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function requireSuperAdmin(req: Request) {
  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace("Bearer ", "");
  if (!jwt) return { error: "Tidak ada token" };

  // pakai token pemanggil sendiri buat ambil identitas (bukan service role)
  const callerClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: userData, error: userErr } = await callerClient.auth.getUser();
  if (userErr || !userData?.user) return { error: "Token tidak valid" };

  const { data: adminRow, error: adminErr } = await adminClient
    .from("admin_users")
    .select("id, role, is_active")
    .eq("id", userData.user.id)
    .single();
  if (adminErr || !adminRow) return { error: "Bukan admin" };
  if (!adminRow.is_active) return { error: "Akun admin nonaktif" };
  if (adminRow.role !== "super_admin") return { error: "Hanya super_admin yang boleh melakukan ini" };

  return { callerId: adminRow.id };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return json({ success: false, error: auth.error }, 403);

  const body = await req.json().catch(() => ({}));
  const action = body.action;

  try {
    if (action === "create_admin") {
      const { email, password, nama, role } = body;
      if (!email || !password || !nama) {
        return json({ success: false, error: "email, password, nama wajib diisi" }, 400);
      }
      const finalRole = role === "super_admin" ? "super_admin" : "admin";

      const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
        email, password, email_confirm: true,
      });
      if (createErr || !created?.user) {
        return json({ success: false, error: createErr?.message ?? "Gagal membuat user" }, 400);
      }

      const { error: insertErr } = await adminClient.from("admin_users").insert({
        id: created.user.id, nama, role: finalRole, is_active: true, created_by: auth.callerId,
      });
      if (insertErr) {
        // rollback: hapus auth user kalau insert admin_users gagal
        await adminClient.auth.admin.deleteUser(created.user.id);
        return json({ success: false, error: insertErr.message }, 400);
      }
      return json({ success: true, id: created.user.id });
    }

    if (action === "revoke_admin") {
      const { id } = body;
      if (!id) return json({ success: false, error: "id wajib diisi" }, 400);
      if (id === auth.callerId) {
        return json({ success: false, error: "Tidak bisa mencabut akses diri sendiri" }, 400);
      }

      const { error: updateErr } = await adminClient
        .from("admin_users")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (updateErr) return json({ success: false, error: updateErr.message }, 400);

      // opsional tapi disarankan: langsung matikan juga sesi auth-nya
      await adminClient.auth.admin.signOut(id).catch(() => {});
      return json({ success: true });
    }

    if (action === "reactivate_admin") {
      const { id } = body;
      if (!id) return json({ success: false, error: "id wajib diisi" }, 400);
      const { error: updateErr } = await adminClient
        .from("admin_users")
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (updateErr) return json({ success: false, error: updateErr.message }, 400);
      return json({ success: true });
    }

    if (action === "list_admins") {
      const { data, error } = await adminClient
        .from("admin_users")
        .select("id, nama, role, is_active, created_at")
        .order("created_at");
      if (error) return json({ success: false, error: error.message }, 400);
      return json({ success: true, admins: data });
    }

    return json({ success: false, error: "Action tidak dikenal" }, 400);
  } catch (err) {
    console.error(err);
    return json({ success: false, error: String((err as Error).message ?? err) }, 500);
  }
});
