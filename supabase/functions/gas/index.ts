// supabase/functions/gas/index.ts
//
// Pengganti Google Apps Script (code-gs.txt). Dipanggil frontend lewat
// path relatif "/api/gas" (lihat rewrite rule di hosting). Bentuk request
// & response SENGAJA dibuat identik dengan code.gs supaya index.html,
// index_1.html, dan index_37e554.html TIDAK PERLU diubah sama sekali.
//
// Deploy: supabase functions deploy gas --no-verify-jwt
// (--no-verify-jwt karena portal asisten/praktikan bukan Supabase Auth user,
//  otorisasi dilakukan manual di dalam function ini via NIM+password)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders, json } from "../_shared/cors.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------
const HARI_LIST = ["Senin", "Selasa", "Rabu", "Kamis", "Jum'at", "Sabtu"];

function fmtTanggal(d: string | null): string {
  // input: 'YYYY-MM-DD' (Postgres date) -> output: 'DD/MM/YYYY'
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function n0(v: number | null | undefined): number {
  return typeof v === "number" && !isNaN(v) ? v : 0;
}

// ---------------------------------------------------------------------
// getAllData() — setara persis code.gs getAllData()
// ---------------------------------------------------------------------
async function getAllData() {
  const [
    asistenRows,
    praktikanRows,
    linkRows,
    nilaiRows,
    pengumumanRows,
    strukturGrid,
    jadwalAsisten2d,
  ] = await Promise.all([
    buildAsisten(),
    buildJadwal(),
    buildLink(),
    buildNilai(),
    buildPengumuman(), // { praktikan: [...], asisten: [...] }
    buildStruktur(),
    buildJadwalAsisten2D(),
  ]);

  return {
    asisten: asistenRows,
    jadwal: praktikanRows,
    link: linkRows,
    nilai: nilaiRows,
    pengumuman: pengumumanRows.praktikan,
    pengumuman_asisten: pengumumanRows.asisten,
    struktur: strukturGrid,
    jadwal_asisten_2d: jadwalAsisten2d,
  };
}

async function getPartialData() {
  const [linkRows, nilaiRows, pengumumanRows] = await Promise.all([
    buildLink(),
    buildNilai(),
    buildPengumuman(),
  ]);
  return {
    link: linkRows,
    nilai: nilaiRows,
    pengumuman: pengumumanRows.praktikan,
  };
}

// ---------------------------------------------------------------------
// asisten -> {"Nama Lengkap","Kode Asisten","Link Telegram","NIM","Password"}
// ---------------------------------------------------------------------
async function buildAsisten() {
  const { data, error } = await supabase
    .from("asisten")
    .select("nama_lengkap, kode_asisten, link_telegram, nim, password")
    .order("nama_lengkap");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    "Nama Lengkap": r.nama_lengkap,
    "Kode Asisten": r.kode_asisten,
    "Link Telegram": r.link_telegram ?? "",
    "NIM": r.nim,
    "Password": r.password,
  }));
}

// ---------------------------------------------------------------------
// jadwal (data_praktikan) -> satu baris per (praktikan, tanggal)
// header order harus persis sama urutan sheet asli karena findKey()
// pakai substring-match berbasis urutan insersi key.
// ---------------------------------------------------------------------
async function buildJadwal() {
  // PENTING: query dimulai dari tabel `praktikan` (bukan `jadwal_praktikum`)
  // supaya praktikan yang BELUM punya jadwal sekalipun tetap muncul di sini
  // (identitas login tidak boleh bergantung pada adanya baris jadwal).
  const [{ data: praktikanList, error: e1 }, { data: jadwalRows, error: e2 }] = await Promise.all([
    supabase.from("praktikan")
      .select("id, nim, nama_lengkap, password, kelompok_besar, kelompok_sedang, kelompok_kecil"),
    supabase.from("jadwal_praktikum")
      .select(`
        praktikan_id, putaran, tanggal, hari, modul_text, jurusan_baris, kode_jurusan_baris,
        shift1_kode, shift2_kode, shift3_kode, shift4_kode,
        shift1_jam, shift2_jam, shift3_jam, shift4_jam
      `)
      .order("tanggal"),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;

  const byPraktikan = new Map<string, any[]>();
  for (const r of jadwalRows ?? []) {
    if (!byPraktikan.has(r.praktikan_id)) byPraktikan.set(r.praktikan_id, []);
    byPraktikan.get(r.praktikan_id)!.push(r);
  }

  const out: Record<string, unknown>[] = [];
  for (const p of praktikanList ?? []) {
    // kalau belum ada jadwal sama sekali, tetap emit 1 baris identitas
    // (field jadwal kosong) supaya NIM+password tetap kebaca saat login
    const rows = byPraktikan.get(p.id) ?? [null];
    for (const r of rows) {
      out.push({
        "Kelompok Besar": p.kelompok_besar ?? "",
        "Kelompok Sedang": p.kelompok_sedang ?? "",
        "Kelompok Kecil": p.kelompok_kecil ?? "",
        "NIM": p.nim,
        "Nama Lengkap": p.nama_lengkap,
        "Password": p.password,
        "Putaran": r?.putaran ?? "",
        "Tanggal": r ? fmtTanggal(r.tanggal) : "",
        "Shift 1": r?.shift1_kode ?? "",
        "Shift 2": r?.shift2_kode ?? "",
        "Shift 3": r?.shift3_kode ?? "",
        "Shift 4": r?.shift4_kode ?? "",
        "Modul": r?.modul_text ?? "",
        "Jurusan": r?.jurusan_baris ?? "",
        "Kode Jurusan": r?.kode_jurusan_baris ?? "",
        "Hari": r?.hari ?? "",
        "S1": r?.shift1_jam ?? "",
        "S2": r?.shift2_jam ?? "",
        "S3": r?.shift3_jam ?? "",
        "S4": r?.shift4_jam ?? "",
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------
// link -> {"Judul (peruntukan)","Link","Tambahan"}
// ---------------------------------------------------------------------
async function buildLink() {
  const { data, error } = await supabase
    .from("link_penting")
    .select("judul, url, tambahan")
    .order("urutan");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    "Judul (peruntukan)": r.judul,
    "Link": r.url,
    "Tambahan": r.tambahan ?? "",
  }));
}

// ---------------------------------------------------------------------
// nilai -> 1 baris per praktikan, 6 blok modul + rerata + nilai akhir
// Formula (dikonfirmasi dari data sheet asli):
//   Rerata X = SUM(X1..X6, blank dianggap 0) / 6
//   Nilai Asli = Rerata TP + Rerata TL + Rerata PD + Rerata Lap
//   Nilai Asli + Sosialisasi = Nilai Asli + Nilai Sosialisasi
// ---------------------------------------------------------------------
async function buildNilai() {
  const { data: praktikanList, error: e1 } = await supabase
    .from("praktikan")
    .select("id, nim, kelompok_kecil");
  if (e1) throw e1;

  const { data: nilaiRows, error: e2 } = await supabase
    .from("nilai")
    .select("praktikan_id, grup, modul_urutan, ast_kode, modul_kode, tp, tl, pd, lap");
  if (e2) throw e2;

  const { data: sosialRows, error: e3 } = await supabase
    .from("nilai_sosialisasi")
    .select("praktikan_id, nilai");
  if (e3) throw e3;

  const byPraktikan = new Map<string, any[]>();
  for (const row of nilaiRows ?? []) {
    if (!byPraktikan.has(row.praktikan_id)) byPraktikan.set(row.praktikan_id, []);
    byPraktikan.get(row.praktikan_id)!.push(row);
  }
  const sosialMap = new Map<string, number>();
  for (const s of sosialRows ?? []) sosialMap.set(s.praktikan_id, n0(s.nilai));

  const out: Record<string, unknown>[] = [];
  for (const p of praktikanList ?? []) {
    const rows = byPraktikan.get(p.id) ?? [];
    if (rows.length === 0) continue; // belum ada nilai sama sekali, skip (sesuai perilaku lama)

    const byModul = new Map<number, any>();
    for (const r of rows) byModul.set(r.modul_urutan, r);

    const row: Record<string, unknown> = {
      "Grup": rows[0]?.grup ?? p.kelompok_kecil ?? "",
      "NIM": p.nim,
    };

    let sumTp = 0, sumTl = 0, sumPd = 0, sumLap = 0;
    for (let i = 1; i <= 6; i++) {
      const m = byModul.get(i);
      row[`Ast ${i}`] = m?.ast_kode ?? "";
      row[`Modul ${i}`] = m?.modul_kode ?? "";
      row[`TP ${i} (5)`] = m?.tp ?? "";
      row[`TL ${i} (25)`] = m?.tl ?? "";
      row[`PD ${i} (20)`] = m?.pd ?? "";
      row[`Lap ${i} (50)`] = m?.lap ?? "";
      sumTp += n0(m?.tp); sumTl += n0(m?.tl); sumPd += n0(m?.pd); sumLap += n0(m?.lap);
    }

    const rerataTp = sumTp / 6, rerataTl = sumTl / 6, rerataPd = sumPd / 6, rerataLap = sumLap / 6;
    const nilaiAsli = rerataTp + rerataTl + rerataPd + rerataLap;
    const sosial = sosialMap.get(p.id) ?? 0;

    row["Rerata TP"] = rerataTp;
    row["Rerata TL"] = rerataTl;
    row["Rerata PD "] = rerataPd; // trailing space sengaja, sesuai header asli
    row["Rerata Lap"] = rerataLap;
    row["Nilai Sosialisasi"] = sosial;
    row["Nilai Asli "] = nilaiAsli; // trailing space sengaja
    row["Nilai Asli + Sosialisasi"] = nilaiAsli + sosial;

    out.push(row);
  }
  return out;
}

// ---------------------------------------------------------------------
// pengumuman -> { praktikan: [{"Tanggal","Judul","Isi"}], asisten: [...] }
// ---------------------------------------------------------------------
async function buildPengumuman() {
  const { data, error } = await supabase
    .from("pengumuman")
    .select("target, tanggal, judul, isi")
    .order("urutan", { ascending: true })
    .order("tanggal", { ascending: false });
  if (error) throw error;

  const praktikan: Record<string, unknown>[] = [];
  const asisten: Record<string, unknown>[] = [];
  for (const r of data ?? []) {
    const row = { "Tanggal": r.tanggal, "Judul": r.judul, "Isi": r.isi };
    if (r.target === "asisten") asisten.push(row);
    else praktikan.push(row);
  }
  return { praktikan, asisten };
}

// ---------------------------------------------------------------------
// struktur -> 2D array. Header = nama divisi, baris berikutnya = nama
// anggota per urutan. Foto & angkatan disisipkan sebagai baris terpisah
// di akhir (posisi tidak penting, keduanya dideteksi via pattern-match
// oleh landing page, bukan posisi).
// ---------------------------------------------------------------------
async function buildStruktur() {
  const { data: divisiList, error: e1 } = await supabase
    .from("divisi").select("id, nama").order("id");
  if (e1) throw e1;

  const { data: pengurus, error: e2 } = await supabase
    .from("struktur_pengurus")
    .select("divisi_id, nama, urutan")
    .order("urutan");
  if (e2) throw e2;

  const { data: infoRows, error: e3 } = await supabase
    .from("struktur_info").select("key, value");
  if (e3) throw e3;
  const info = new Map((infoRows ?? []).map((r) => [r.key, r.value]));

  const byDivisi = new Map<number, string[]>();
  for (const d of divisiList ?? []) byDivisi.set(d.id, []);
  for (const p of pengurus ?? []) {
    if (!byDivisi.has(p.divisi_id)) byDivisi.set(p.divisi_id, []);
    byDivisi.get(p.divisi_id)!.push(p.nama);
  }

  const header = (divisiList ?? []).map((d) => d.nama);
  const maxRows = Math.max(0, ...[...byDivisi.values()].map((v) => v.length));

  const grid: (string | null)[][] = [header];
  for (let r = 0; r < maxRows; r++) {
    grid.push((divisiList ?? []).map((d) => byDivisi.get(d.id)?.[r] ?? null));
  }

  const fotoUrl = info.get("foto_asisten_url");
  const angkatan = info.get("angkatan");
  if (fotoUrl || angkatan) {
    const extra = header.map(() => null);
    extra[0] = fotoUrl ?? null;
    extra[1] = angkatan ?? null;
    grid.push(extra);
  }
  return grid;
}

// ---------------------------------------------------------------------
// jadwal_asisten_2d -> rekonstruksi grid identik sheet data_asisten:
// kolom 0-4 identitas asisten, kolom 6-11 blok JADWAL ASISTENSI,
// kolom 12-17 blok JADWAL PIKET. Ketiga blok independen, di-"zip"
// jadi satu array baris (row index tidak punya arti lintas-blok,
// persis seperti sheet aslinya).
// ---------------------------------------------------------------------
async function buildJadwalAsisten2D() {
  const { data: asistenList, error: e1 } = await supabase
    .from("asisten")
    .select("nama_lengkap, kode_asisten, link_telegram, nim, password")
    .order("nama_lengkap");
  if (e1) throw e1;

  const { data: asistensi, error: e2 } = await supabase
    .from("jadwal_asistensi")
    .select("putaran, tanggal, shift, slot_no, kode_asisten")
    .order("putaran").order("tanggal").order("slot_no").order("shift");
  if (e2) throw e2;

  const { data: piket, error: e3 } = await supabase
    .from("jadwal_piket")
    .select("hari, slot_no, kode_asisten")
    .order("slot_no");
  if (e3) throw e3;

  // ---- blok identitas (kolom 0-4) ----
  const identityRows: (string | number | null)[][] = [
    ["Nama Lengkap", "Kode Asisten", "Link Telegram", "NIM", "Password"],
    ...(asistenList ?? []).map((a) => [
      a.nama_lengkap, a.kode_asisten, a.link_telegram ?? "", a.nim, a.password,
    ]),
  ];

  // ---- blok JADWAL ASISTENSI (kolom 6-11 relatif thd kolom 6) ----
  // group by putaran -> by tanggal -> array 6 slot x 4 shift
  const groups = new Map<number, Map<string, Map<number, Map<number, string>>>>();
  for (const r of asistensi ?? []) {
    if (!groups.has(r.putaran)) groups.set(r.putaran, new Map());
    const byTgl = groups.get(r.putaran)!;
    if (!byTgl.has(r.tanggal)) byTgl.set(r.tanggal, new Map());
    const bySlot = byTgl.get(r.tanggal)!;
    if (!bySlot.has(r.slot_no)) bySlot.set(r.slot_no, new Map());
    bySlot.get(r.slot_no)!.set(r.shift, r.kode_asisten ?? "");
  }

  const astBlock: (string | null)[][] = [["JADWAL ASISTENSI", null, null, null, null, null]];
  const putaranKeys = [...groups.keys()].sort((a, b) => a - b);
  for (const putaran of putaranKeys) {
    astBlock.push([`Putaran ${putaran}`, null, null, null, null, null]);
    astBlock.push(["Tanggal", "Shift 1", "Shift 2", "Shift 3", "Shift 4", null]);
    const byTgl = groups.get(putaran)!;
    const tglKeys = [...byTgl.keys()].sort();
    for (const tgl of tglKeys) {
      const bySlot = byTgl.get(tgl)!;
      const slotKeys = [...bySlot.keys()].sort((a, b) => a - b);
      let first = true;
      for (const slot of slotKeys) {
        const shifts = bySlot.get(slot)!;
        astBlock.push([
          first ? fmtTanggal(tgl) : null,
          shifts.get(1) ?? "", shifts.get(2) ?? "", shifts.get(3) ?? "", shifts.get(4) ?? "",
          null,
        ]);
        first = false;
      }
    }
  }

  // ---- blok JADWAL PIKET (kolom 12-17) ----
  const piketBySlot = new Map<number, Map<string, string>>();
  for (const r of piket ?? []) {
    if (!piketBySlot.has(r.slot_no)) piketBySlot.set(r.slot_no, new Map());
    piketBySlot.get(r.slot_no)!.set(r.hari, r.kode_asisten ?? "");
  }
  const piketBlock: (string | null)[][] = [
    ["JADWAL PIKET", null, null, null, null, null],
    HARI_LIST,
  ];
  const slotKeysPiket = [...piketBySlot.keys()].sort((a, b) => a - b);
  for (const slot of slotKeysPiket) {
    const map = piketBySlot.get(slot)!;
    piketBlock.push(HARI_LIST.map((h) => map.get(h) ?? ""));
  }

  // ---- zip semua blok jadi satu grid ----
  const maxRows = Math.max(identityRows.length, astBlock.length, piketBlock.length);
  const grid: (string | number | null)[][] = [];
  for (let r = 0; r < maxRows; r++) {
    const idRow = identityRows[r] ?? [null, null, null, null, null];
    const astRow = astBlock[r] ?? [null, null, null, null, null, null];
    const pikRow = piketBlock[r] ?? [null, null, null, null, null, null];
    grid.push([...idRow, null, ...astRow, ...pikRow]);
  }
  return grid;
}

// ---------------------------------------------------------------------
// change_pass (praktikan) & change_pass_asisten
// ---------------------------------------------------------------------
async function changePass(table: "praktikan" | "asisten", nim: string, newpass: string) {
  const { data, error } = await supabase
    .from(table)
    .update({ password: newpass })
    .eq("nim", nim)
    .select("id");
  if (error) return { success: false, error: error.message };
  if (!data || data.length === 0) {
    return { success: false, message: "NIM tidak ditemukan", error: "NIM tidak ditemukan" };
  }
  return { success: true, message: "Password diubah" };
}

// ---------------------------------------------------------------------
// update_jadwal (add/remove asisten ke slot asistensi)
// ---------------------------------------------------------------------
async function updateJadwalAsisten(params: URLSearchParams) {
  const op = params.get("op");
  const putaran = parseInt(params.get("putaran") || "0", 10);
  const tanggalStr = params.get("tanggal") || ""; // DD/MM/YYYY dari frontend
  const shift = parseInt(params.get("shift") || "0", 10);
  const kode = (params.get("kode") || "").toUpperCase().replace(/\[|\]/g, "");

  const [dd, mm, yyyy] = tanggalStr.split("/");
  if (!dd || !mm || !yyyy) return { success: false, error: "Format tanggal salah" };
  const tanggalISO = `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;

  if (op === "add") {
    // cari slot kosong pertama (1-6) utk putaran+tanggal+shift ini
    const { data: existing, error: e1 } = await supabase
      .from("jadwal_asistensi")
      .select("slot_no, kode_asisten")
      .eq("putaran", putaran).eq("tanggal", tanggalISO).eq("shift", shift)
      .order("slot_no");
    if (e1) return { success: false, error: e1.message };

    const filled = new Set((existing ?? []).map((r) => r.slot_no));
    let targetSlot = -1;
    for (let s = 1; s <= 6; s++) {
      const row = (existing ?? []).find((r) => r.slot_no === s);
      if (!row || !row.kode_asisten) { targetSlot = s; break; }
    }
    if (targetSlot === -1) return { success: false, error: "Shift ini sudah penuh (Max 6)" };

    const { error: e2 } = await supabase.from("jadwal_asistensi").upsert({
      putaran, tanggal: tanggalISO, shift, slot_no: targetSlot, kode_asisten: kode,
    }, { onConflict: "putaran,tanggal,shift,slot_no" });
    if (e2) return { success: false, error: e2.message };
    return { success: true };
  }

  if (op === "remove") {
    const { data: existing, error: e1 } = await supabase
      .from("jadwal_asistensi")
      .select("slot_no, kode_asisten")
      .eq("putaran", putaran).eq("tanggal", tanggalISO).eq("shift", shift)
      .order("slot_no");
    if (e1) return { success: false, error: e1.message };

    const rows = existing ?? [];
    const idx = rows.findIndex((r) =>
      String(r.kode_asisten || "").toUpperCase().replace(/\[|\]/g, "") === kode
    );
    if (idx === -1) return { success: true }; // sudah tidak ada, anggap sukses (idempotent)

    // geser kode ke atas (persis logika lama), slot kosong di akhir
    const codes = rows.map((r) => r.kode_asisten).filter((_, i) => i !== idx);
    for (let s = 1; s <= 6; s++) {
      const val = codes[s - 1] ?? null;
      const { error: e3 } = await supabase.from("jadwal_asistensi").upsert({
        putaran, tanggal: tanggalISO, shift, slot_no: s, kode_asisten: val,
      }, { onConflict: "putaran,tanggal,shift,slot_no" });
      if (e3) return { success: false, error: e3.message };
    }
    return { success: true };
  }

  return { success: false, error: "op tidak dikenal" };
}

// ---------------------------------------------------------------------
// add_pengumuman / delete_pengumuman
// ---------------------------------------------------------------------
async function addPengumuman(params: URLSearchParams) {
  const target = params.get("target") === "asisten" ? "asisten" : "praktikan";
  const tanggal = params.get("tanggal") || new Date().toISOString();
  const judul = params.get("judul") || "";
  const isi = params.get("isi") || "";

  const { error } = await supabase.from("pengumuman").insert({
    target, tanggal, judul, isi,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

async function deletePengumuman(params: URLSearchParams) {
  const target = params.get("target") === "asisten" ? "asisten" : "praktikan";
  const judul = (params.get("judul") || "").trim();

  const { error } = await supabase
    .from("pengumuman")
    .delete()
    .eq("target", target)
    .eq("judul", judul);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ---------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    let params = url.searchParams;

    if (req.method === "GET") {
      const action = params.get("action");
      if (action === "change_pass") {
        return json(await changePass("praktikan", params.get("nim") || "", params.get("newpass") || ""));
      }
      if (action === "change_pass_asisten") {
        return json(await changePass("asisten", params.get("nim") || "", params.get("newpass") || ""));
      }
      if (action === "update_jadwal") {
        return json(await updateJadwalAsisten(params));
      }
      if (action === "delete_pengumuman") {
        return json(await deletePengumuman(params));
      }
      if (action === "get_partial") {
        return json(await getPartialData());
      }
      return json(await getAllData());
    }

    if (req.method === "POST") {
      // dukung action dari query string ATAU form body, sesuai code.gs (e.parameter)
      const contentType = req.headers.get("content-type") || "";
      if (contentType.includes("application/x-www-form-urlencoded")) {
        const body = await req.text();
        const bodyParams = new URLSearchParams(body);
        for (const [k, v] of bodyParams) params.set(k, v);
      } else if (contentType.includes("application/json")) {
        const body = await req.json().catch(() => ({}));
        for (const k of Object.keys(body)) params.set(k, String(body[k]));
      }
      const action = params.get("action");
      if (action === "add_pengumuman") {
        return json(await addPengumuman(params));
      }
      return json({ error: "Action not found" }, 404);
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (err) {
    console.error(err);
    return json({ success: false, error: String((err as Error).message ?? err) }, 500);
  }
});
