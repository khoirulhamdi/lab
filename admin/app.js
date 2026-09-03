const sb = supabase.createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.anonKey);
const ADMIN_MANAGE_URL = `${window.SUPABASE_CONFIG.url}/functions/v1/admin-manage`;

let ME = null;
let jurusanMap = {};       // { "3334": "Teknik Elektro", ... }
let jurusanListCache = []; // ["Teknik Elektro", ...]

// =====================================================================
// Auto-detect jurusan dari NIM (4 digit awal)
// =====================================================================
function jurusanFromNim(nim) {
  if (!nim) return "-";
  const kode = String(nim).slice(0, 4);
  return jurusanMap[kode] || "-";
}
function kodeFromJurusanName(nama) {
  for (const [kode, j] of Object.entries(jurusanMap)) if (j === nama) return kode;
  return null;
}
async function loadJurusanMap() {
  const { data, error } = await sb.from("kode_jurusan").select("kode, jurusan");
  if (error) { console.error(error); return; }
  jurusanMap = {};
  for (const r of data ?? []) jurusanMap[r.kode] = r.jurusan;
  jurusanListCache = Object.values(jurusanMap);
}

// =====================================================================
// Struktur navigasi: 4 menu utama, tiap menu punya beberapa subtab
// =====================================================================
const NAV = {
  dashboard: { label: "Dashboard", icon: "fa-gauge-high", subtabs: null },
  asisten: {
    label: "Asisten", icon: "fa-user-tie",
    subtabs: [
      { key: "asisten_anggota", label: "Anggota" },
      { key: "asisten_jadwal", label: "Jadwal & Piket" },
      { key: "asisten_struktur", label: "Struktur" },
      { key: "asisten_pengumuman", label: "Pengumuman" },
    ],
  },
  praktikan: {
    label: "Praktikan", icon: "fa-user-graduate",
    subtabs: [
      { key: "praktikan_anggota", label: "Anggota" },
      { key: "praktikan_jadwal", label: "Jadwal Praktikum" },
      { key: "praktikan_nilai", label: "Nilai" },
      { key: "praktikan_pengumuman", label: "Pengumuman" },
    ],
  },
  pengaturan: {
    label: "Pengaturan", icon: "fa-gear",
    subtabs: [
      { key: "link_penting", label: "Link Penting" },
      { key: "kode_jurusan", label: "Kode Jurusan" },
      { key: "kelola_admin", label: "Kelola Admin" },
    ],
  },
};

// =====================================================================
// Section generik (didukung mesin CRUD umum)
// =====================================================================
const SECTIONS = {
  asisten_anggota: {
    table: "asisten", pk: "id", label: "Anggota Asisten",
    desc: "Jurusan otomatis terdeteksi dari NIM, tidak perlu diisi manual.",
    columns: [
      { name: "nama_lengkap", label: "Nama Lengkap", type: "text", required: true },
      { name: "kode_asisten", label: "Kode Asisten", type: "text", required: true },
      { name: "nim", label: "NIM", type: "number", required: true },
      { name: "password", label: "Password", type: "text", required: true },
      { name: "link_telegram", label: "Link Telegram", type: "text" },
      { name: "divisi_id", label: "Divisi", type: "select-fk", fk: { table: "divisi", value: "id", label: "nama" } },
    ],
    computedColumns: [{ label: "Jurusan", fn: (r) => `<span class="badge-jurusan">${jurusanFromNim(r.nim)}</span>` }],
  },

  praktikan_anggota: {
    table: "praktikan", pk: "id", label: "Anggota Praktikan",
    desc: "Jurusan otomatis terdeteksi dari NIM, tidak perlu diisi manual.",
    columns: [
      { name: "nim", label: "NIM", type: "number", required: true },
      { name: "nama_lengkap", label: "Nama Lengkap", type: "text", required: true },
      { name: "password", label: "Password", type: "text", required: true },
      { name: "kelompok_besar", label: "Kelompok Besar", type: "text" },
      { name: "kelompok_sedang", label: "Kelompok Sedang", type: "text" },
      { name: "kelompok_kecil", label: "Kelompok Kecil", type: "text" },
    ],
    computedColumns: [{ label: "Jurusan", fn: (r) => `<span class="badge-jurusan">${jurusanFromNim(r.nim)}</span>` }],
    transformBeforeSave: (payload) => {
      const kode = String(payload.nim).slice(0, 4);
      payload.kode_jurusan = kode;
      payload.jurusan = jurusanMap[kode] || null;
    },
  },

  praktikan_jadwal: {
    table: "jadwal_praktikum", pk: "id", label: "Jadwal Praktikum",
    desc: "Jadwal per tanggal per praktikan",
    columns: [
      { name: "praktikan_id", label: "Praktikan (NIM)", type: "select-fk", fk: { table: "praktikan", value: "id", label: "nim", label2: "nama_lengkap" }, required: true },
      { name: "putaran", label: "Putaran", type: "number" },
      { name: "tanggal", label: "Tanggal", type: "date", required: true },
      { name: "hari", label: "Hari", type: "select", options: ["Senin", "Selasa", "Rabu", "Kamis", "Jum'at", "Sabtu"] },
      { name: "modul_text", label: "Modul (contoh: Pesawat Atwood [PA])", type: "text" },
      { name: "jurusan_baris", label: "Berlaku Untuk Jurusan", type: "select-dynamic", loadOptions: async () => ["All", ...jurusanListCache] },
      { name: "shift1_kode", label: "Shift 1 - Kode", type: "text" },
      { name: "shift2_kode", label: "Shift 2 - Kode", type: "text" },
      { name: "shift3_kode", label: "Shift 3 - Kode", type: "text" },
      { name: "shift4_kode", label: "Shift 4 - Kode", type: "text" },
      { name: "shift1_jam", label: "Shift 1 - Jam", type: "text", placeholder: "08.00-10.00" },
      { name: "shift2_jam", label: "Shift 2 - Jam", type: "text", placeholder: "11.00-13.00" },
      { name: "shift3_jam", label: "Shift 3 - Jam", type: "text", placeholder: "14.00-16.00" },
      { name: "shift4_jam", label: "Shift 4 - Jam", type: "text", placeholder: "17.00-19.00" },
    ],
    transformBeforeSave: (payload) => {
      if (payload.jurusan_baris && payload.jurusan_baris !== "All") {
        payload.kode_jurusan_baris = kodeFromJurusanName(payload.jurusan_baris);
      } else {
        payload.kode_jurusan_baris = null;
      }
    },
  },

  asisten_pengumuman: {
    table: "pengumuman", pk: "id", label: "Pengumuman Asisten",
    desc: "Pengumuman yang tampil di portal asisten",
    fixedValues: { target: "asisten" },
    columns: [
      { name: "tanggal", label: "Tanggal", type: "datetime-local" },
      { name: "judul", label: "Judul", type: "text", required: true },
      { name: "isi", label: "Isi", type: "textarea", required: true },
      { name: "urutan", label: "Urutan Tampil", type: "number" },
    ],
    filter: (q) => q.eq("target", "asisten"),
  },

  praktikan_pengumuman: {
    table: "pengumuman", pk: "id", label: "Pengumuman Praktikan",
    desc: "Pengumuman yang tampil di portal praktikan",
    fixedValues: { target: "praktikan" },
    columns: [
      { name: "tanggal", label: "Tanggal", type: "datetime-local" },
      { name: "judul", label: "Judul", type: "text", required: true },
      { name: "isi", label: "Isi", type: "textarea", required: true },
      { name: "urutan", label: "Urutan Tampil", type: "number" },
    ],
    filter: (q) => q.eq("target", "praktikan"),
  },

  link_penting: {
    table: "link_penting", pk: "id", label: "Link Penting",
    desc: "Link-link penting (materi, formulir, transparansi nilai, dll)",
    columns: [
      { name: "judul", label: "Judul (peruntukan)", type: "text", required: true },
      { name: "url", label: "URL", type: "text", required: true },
      { name: "tambahan", label: "Tambahan (Aktif/Nonaktif utk transparansi nilai)", type: "text" },
      { name: "urutan", label: "Urutan Tampil", type: "number" },
    ],
  },

  kode_jurusan: {
    table: "kode_jurusan", pk: "kode", label: "Kode Jurusan",
    desc: "4 digit awal NIM -> nama jurusan. Dipakai buat auto-detect di semua menu.",
    columns: [
      { name: "kode", label: "4 Digit Awal NIM", type: "text", required: true, placeholder: "3334" },
      { name: "jurusan", label: "Nama Jurusan", type: "text", required: true },
    ],
  },
};

const fkOptionsCache = {};
let currentSectionKey = null;
let currentRows = [];
let editingId = null;

// =====================================================================
// Auth guard
// =====================================================================
async function init() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { window.location.href = "login.html"; return; }

  const { data: adminRow, error } = await sb
    .from("admin_users").select("id, nama, role, is_active").eq("id", session.user.id).single();

  if (error || !adminRow || !adminRow.is_active) {
    await sb.auth.signOut();
    window.location.href = "login.html";
    return;
  }
  ME = adminRow;
  document.getElementById("me-nama").innerText = ME.nama;
  document.getElementById("me-role").innerText = ME.role === "super_admin" ? "Super Admin" : "Admin";

  await loadJurusanMap();
  buildNav();
  openMenu("dashboard");
}

document.getElementById("btn-logout").addEventListener("click", async () => {
  await sb.auth.signOut();
  window.location.href = "login.html";
});

// =====================================================================
// Sidebar nav (menu utama)
// =====================================================================
function buildNav() {
  const nav = document.getElementById("nav");
  nav.innerHTML = "";
  for (const [key, cfg] of Object.entries(NAV)) {
    if (key === "pengaturan" && ME.role !== "super_admin") {
      // admin biasa tetap bisa lihat Link Penting & Kode Jurusan, tapi
      // Kelola Admin di-skip di dalam renderSubtabs kalau bukan super_admin
    }
    const el = document.createElement("div");
    el.className = "nav-item";
    el.dataset.key = key;
    el.innerHTML = `<i class="fa-solid ${cfg.icon} w-4"></i> ${cfg.label}`;
    el.onclick = () => openMenu(key);
    nav.appendChild(el);
  }
}

function setActiveNav(key) {
  document.querySelectorAll(".nav-item").forEach((el) => el.classList.toggle("active", el.dataset.key === key));
}

function openMenu(menuKey) {
  setActiveNav(menuKey);
  const cfg = NAV[menuKey];
  document.getElementById("section-title").innerText = cfg.label;

  const subtabBar = document.getElementById("subtabs");
  subtabBar.innerHTML = "";

  if (menuKey === "dashboard") {
    document.getElementById("section-desc").innerText = "Ringkasan data lab";
    showPanel("dashboard");
    renderDashboard();
    return;
  }

  let subtabs = cfg.subtabs;
  if (menuKey === "pengaturan" && ME.role !== "super_admin") {
    subtabs = subtabs.filter((s) => s.key !== "kelola_admin");
  }

  subtabs.forEach((st, idx) => {
    const btn = document.createElement("div");
    btn.className = "subtab" + (idx === 0 ? " active" : "");
    btn.innerText = st.label;
    btn.dataset.key = st.key;
    btn.onclick = () => {
      document.querySelectorAll(".subtab").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      openSubtab(st.key);
    };
    subtabBar.appendChild(btn);
  });

  openSubtab(subtabs[0].key);
}

function showPanel(which) {
  document.getElementById("panel-dashboard").classList.toggle("hidden", which !== "dashboard");
  document.getElementById("panel-generic").classList.toggle("hidden", which !== "generic");
  document.getElementById("panel-custom").classList.toggle("hidden", which !== "custom");
}

function openSubtab(key) {
  if (key === "asisten_jadwal") { showPanel("custom"); renderAsistenJadwalPiket(); return; }
  if (key === "asisten_struktur") { showPanel("custom"); renderStrukturPanel(); return; }
  if (key === "praktikan_nilai") { showPanel("custom"); renderNilaiPanel(); return; }
  if (key === "kelola_admin") { showPanel("custom"); renderKelolaAdmin(); return; }

  // sisanya pakai mesin CRUD generik
  showPanel("generic");
  openGenericSection(key);
}

// =====================================================================
// Mesin CRUD generik
// =====================================================================
async function openGenericSection(key) {
  currentSectionKey = key;
  const cfg = SECTIONS[key];
  document.getElementById("section-desc").innerText = cfg.desc || "";
  document.getElementById("btn-add").onclick = () => openModal(null);
  document.getElementById("search-box").value = "";
  document.getElementById("search-box").oninput = (e) => renderTable(filterRows(e.target.value));
  await loadRows();
}

async function loadRows() {
  const cfg = SECTIONS[currentSectionKey];
  let q = sb.from(cfg.table).select("*").order(cfg.pk, { ascending: false }).limit(500);
  if (cfg.filter) q = cfg.filter(q);
  const { data, error } = await q;
  if (error) { toast(error.message, true); currentRows = []; }
  else currentRows = data ?? [];
  renderTable(currentRows);
}

function filterRows(q) {
  if (!q) return currentRows;
  q = q.toLowerCase();
  return currentRows.filter((r) => JSON.stringify(r).toLowerCase().includes(q));
}

function renderTable(rows) {
  const cfg = SECTIONS[currentSectionKey];
  const visibleCols = cfg.columns.filter((c) => !cfg.fixedValues || !(c.name in cfg.fixedValues));
  const thead = document.querySelector("#data-table thead tr");
  const tbody = document.querySelector("#data-table tbody");

  thead.innerHTML = visibleCols.map((c) => `<th>${c.label}</th>`).join("") +
    (cfg.computedColumns ? cfg.computedColumns.map((c) => `<th>${c.label}</th>`).join("") : "") + `<th></th>`;
  tbody.innerHTML = "";

  for (const row of rows) {
    const tr = document.createElement("tr");
    let html = visibleCols.map((c) => `<td>${escapeHtml(displayValue(row, c))}</td>`).join("");
    if (cfg.computedColumns) html += cfg.computedColumns.map((c) => `<td>${c.fn(row)}</td>`).join("");
    html += `<td class="text-right">
       <button class="btn btn-ghost mr-1" data-act="edit"><i class="fa-solid fa-pen"></i></button>
       <button class="btn btn-danger" data-act="del"><i class="fa-solid fa-trash"></i></button>
     </td>`;
    tr.innerHTML = html;
    tr.querySelector('[data-act="edit"]').onclick = () => openModal(row);
    tr.querySelector('[data-act="del"]').onclick = () => deleteRow(row);
    tbody.appendChild(tr);
  }
  document.getElementById("row-count").innerText = `${rows.length} baris`;
}

function displayValue(row, col) {
  const v = row[col.name];
  if (v === null || v === undefined) return "";
  if (col.type === "select-fk" && col.fk._labelMap) return col.fk._labelMap.get(v) ?? v;
  return v;
}

function escapeHtml(v) {
  return String(v).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

async function fetchFkOptions(col) {
  const cacheKey = `${col.fk.table}:${col.fk.value}:${col.fk.label}`;
  if (fkOptionsCache[cacheKey]) return fkOptionsCache[cacheKey];
  const selectCols = col.fk.label2 ? `${col.fk.value},${col.fk.label},${col.fk.label2}` : `${col.fk.value},${col.fk.label}`;
  const { data, error } = await sb.from(col.fk.table).select(selectCols).order(col.fk.label);
  if (error) { toast(error.message, true); return []; }
  const opts = (data ?? []).map((r) => ({
    value: r[col.fk.value],
    label: col.fk.label2 ? `${r[col.fk.label]} - ${r[col.fk.label2]}` : r[col.fk.label],
  }));
  col.fk._labelMap = new Map(opts.map((o) => [o.value, o.label]));
  fkOptionsCache[cacheKey] = opts;
  return opts;
}

async function openModal(row) {
  const cfg = SECTIONS[currentSectionKey];
  editingId = row ? row[cfg.pk] : null;
  document.getElementById("modal-title").innerText = row ? `Edit ${cfg.label}` : `Tambah ${cfg.label}`;
  const form = document.getElementById("modal-form");
  form.innerHTML = "";

  for (const col of cfg.columns) {
    if (cfg.fixedValues && col.name in cfg.fixedValues) continue; // field fixed, tidak perlu form
    const wrap = document.createElement("div");
    const val = row ? row[col.name] ?? "" : "";
    let inputHtml = "";

    if (col.type === "select-fk") {
      const opts = await fetchFkOptions(col);
      inputHtml = `<select name="${col.name}" ${col.required ? "required" : ""}>
        <option value="">- pilih -</option>
        ${opts.map((o) => `<option value="${o.value}" ${String(o.value) === String(val) ? "selected" : ""}>${escapeHtml(o.label)}</option>`).join("")}
      </select>`;
    } else if (col.type === "select-dynamic") {
      const opts = await col.loadOptions();
      inputHtml = `<select name="${col.name}" ${col.required ? "required" : ""}>
        <option value="">- pilih -</option>
        ${opts.map((o) => `<option value="${o}" ${o === val ? "selected" : ""}>${o}</option>`).join("")}
      </select>`;
    } else if (col.type === "select") {
      inputHtml = `<select name="${col.name}" ${col.required ? "required" : ""}>
        <option value="">- pilih -</option>
        ${col.options.map((o) => `<option value="${o}" ${o === val ? "selected" : ""}>${o}</option>`).join("")}
      </select>`;
    } else if (col.type === "textarea") {
      inputHtml = `<textarea name="${col.name}" rows="4" ${col.required ? "required" : ""}>${escapeHtml(val)}</textarea>`;
    } else {
      inputHtml = `<input name="${col.name}" type="${col.type}" placeholder="${col.placeholder ?? ""}"
        value="${escapeHtml(val)}" ${col.required ? "required" : ""} />`;
    }

    wrap.innerHTML = `<label class="text-xs text-gray-400 mb-1 block">${col.label}</label>${inputHtml}`;
    form.appendChild(wrap);
  }

  const actions = document.createElement("div");
  actions.className = "flex justify-end gap-2 pt-2";
  actions.innerHTML = `<button type="button" id="btn-cancel" class="btn btn-ghost">Batal</button>
    <button type="submit" class="btn btn-primary">Simpan</button>`;
  form.appendChild(actions);
  form.querySelector("#btn-cancel").onclick = closeModal;
  form.onsubmit = saveRow;

  document.getElementById("modal").classList.remove("hidden");
  document.getElementById("modal").classList.add("flex");
}

function closeModal() {
  document.getElementById("modal").classList.add("hidden");
  document.getElementById("modal").classList.remove("flex");
}
document.getElementById("modal-close").onclick = closeModal;

async function saveRow(e) {
  e.preventDefault();
  const cfg = SECTIONS[currentSectionKey];
  const form = e.target;
  const payload = { ...(cfg.fixedValues || {}) };

  for (const col of cfg.columns) {
    if (cfg.fixedValues && col.name in cfg.fixedValues) continue;
    const el = form.elements[col.name];
    if (!el) continue;
    let v = el.value;
    if (v === "") v = null;
    if (v !== null && col.type === "number") v = Number(v);
    payload[col.name] = v;
  }

  if (cfg.transformBeforeSave) cfg.transformBeforeSave(payload);

  let error;
  if (editingId !== null) ({ error } = await sb.from(cfg.table).update(payload).eq(cfg.pk, editingId));
  else ({ error } = await sb.from(cfg.table).insert(payload));

  if (error) { toast(error.message, true); return; }
  toast("Tersimpan");
  closeModal();
  await loadRows();
}

async function deleteRow(row) {
  const cfg = SECTIONS[currentSectionKey];
  if (!confirm("Hapus baris ini? Tindakan tidak bisa dibatalkan.")) return;
  const { error } = await sb.from(cfg.table).delete().eq(cfg.pk, row[cfg.pk]);
  if (error) { toast(error.message, true); return; }
  toast("Terhapus");
  await loadRows();
}

// =====================================================================
// Dashboard
// =====================================================================
async function renderDashboard() {
  const panel = document.getElementById("panel-dashboard");
  panel.innerHTML = `<p class="text-xs text-gray-500">Memuat...</p>`;

  const [asistenCount, praktikanCount, pengumuman] = await Promise.all([
    sb.from("asisten").select("*", { count: "exact", head: true }),
    sb.from("praktikan").select("*", { count: "exact", head: true }),
    sb.from("pengumuman").select("target, judul, tanggal").order("tanggal", { ascending: false }).limit(6),
  ]);

  panel.innerHTML = `
    <div class="grid grid-cols-3 gap-4 mb-6">
      <div class="stat-card">
        <div class="text-xs text-gray-500 mb-1">Total Asisten</div>
        <div class="text-2xl font-extrabold">${asistenCount.count ?? 0}</div>
      </div>
      <div class="stat-card">
        <div class="text-xs text-gray-500 mb-1">Total Praktikan</div>
        <div class="text-2xl font-extrabold">${praktikanCount.count ?? 0}</div>
      </div>
      <div class="stat-card">
        <div class="text-xs text-gray-500 mb-1">Pengumuman Terbaru</div>
        <div class="text-2xl font-extrabold">${pengumuman.data?.length ?? 0}</div>
      </div>
    </div>
    <div class="surface-card border border-[#242424] p-4">
      <h3 class="text-sm font-bold mb-3">Pengumuman Terbaru</h3>
      <div class="space-y-2">
        ${(pengumuman.data ?? []).map((p) => `
          <div class="flex items-center justify-between border-b border-[#242424] pb-2">
            <div>
              <div class="text-xs font-semibold">${escapeHtml(p.judul)}</div>
              <div class="text-[10px] text-gray-500">${p.target === "asisten" ? "Untuk Asisten" : "Untuk Praktikan"} - ${new Date(p.tanggal).toLocaleDateString("id-ID")}</div>
            </div>
          </div>`).join("") || `<p class="text-xs text-gray-500">Belum ada pengumuman.</p>`}
      </div>
    </div>`;
}

// =====================================================================
// Custom panel: Jadwal Asistensi & Piket (chip-based, tidak bertele-tele)
// =====================================================================
async function renderAsistenJadwalPiket() {
  document.getElementById("section-desc").innerText = "Kelola slot asistensi & piket dengan cepat";
  const panel = document.getElementById("panel-custom");
  panel.innerHTML = `<p class="text-xs text-gray-500">Memuat...</p>`;

  const [{ data: asistensi }, { data: piket }] = await Promise.all([
    sb.from("jadwal_asistensi").select("*").order("putaran").order("tanggal").order("shift").order("slot_no"),
    sb.from("jadwal_piket").select("*").order("slot_no"),
  ]);

  // group asistensi by (putaran, tanggal)
  const groups = new Map();
  for (const r of asistensi ?? []) {
    const key = `${r.putaran}|${r.tanggal}`;
    if (!groups.has(key)) groups.set(key, { putaran: r.putaran, tanggal: r.tanggal, shifts: { 1: [], 2: [], 3: [], 4: [] } });
    if (r.kode_asisten) groups.get(key).shifts[r.shift].push(r.kode_asisten);
  }
  const groupList = [...groups.values()].sort((a, b) => a.tanggal.localeCompare(b.tanggal));

  const HARI = ["Senin", "Selasa", "Rabu", "Kamis", "Jum'at", "Sabtu"];
  const piketByHari = {};
  HARI.forEach((h) => (piketByHari[h] = []));
  for (const r of piket ?? []) if (r.kode_asisten) piketByHari[r.hari]?.push(r.kode_asisten);

  panel.innerHTML = `
    <div class="flex justify-between items-center mb-3">
      <h3 class="text-sm font-bold">Jadwal Asistensi</h3>
      <button id="btn-add-asistensi" class="btn btn-primary"><i class="fa-solid fa-plus mr-1"></i>Tambah Slot</button>
    </div>
    <div class="surface-card border border-[#242424] overflow-auto mb-8" style="max-height:320px;">
      <table>
        <thead><tr><th>Putaran</th><th>Tanggal</th><th>Shift 1</th><th>Shift 2</th><th>Shift 3</th><th>Shift 4</th></tr></thead>
        <tbody>
          ${groupList.map((g) => `
            <tr>
              <td>${g.putaran}</td>
              <td>${new Date(g.tanggal).toLocaleDateString("id-ID")}</td>
              ${[1, 2, 3, 4].map((s) => `<td>${g.shifts[s].map((k) => chipHtml(k, "asistensi", g.putaran, g.tanggal, s)).join("") || '<span class="text-gray-600">-</span>'}</td>`).join("")}
            </tr>`).join("") || `<tr><td colspan="6" class="text-gray-500">Belum ada jadwal asistensi.</td></tr>`}
        </tbody>
      </table>
    </div>

    <div class="flex justify-between items-center mb-3">
      <h3 class="text-sm font-bold">Jadwal Piket</h3>
      <button id="btn-add-piket" class="btn btn-primary"><i class="fa-solid fa-plus mr-1"></i>Tambah Piket</button>
    </div>
    <div class="surface-card border border-[#242424] overflow-auto" style="max-height:280px;">
      <table>
        <thead><tr>${HARI.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
        <tbody><tr>
          ${HARI.map((h) => `<td class="align-top">${piketByHari[h].map((k) => chipHtml(k, "piket", null, null, null, h)).join("") || '<span class="text-gray-600">-</span>'}</td>`).join("")}
        </tr></tbody>
      </table>
    </div>`;

  document.getElementById("btn-add-asistensi").onclick = openAddAsistensiModal;
  document.getElementById("btn-add-piket").onclick = openAddPiketModal;

  panel.querySelectorAll("[data-remove]").forEach((el) => {
    el.onclick = async () => {
      const d = JSON.parse(el.dataset.remove);
      if (d.type === "asistensi") await removeAsistensiKode(d.putaran, d.tanggal, d.shift, d.kode);
      else await removePiketKode(d.hari, d.kode);
      renderAsistenJadwalPiket();
    };
  });
}

function chipHtml(kode, type, putaran, tanggal, shift, hari) {
  const payload = type === "asistensi" ? { type, putaran, tanggal, shift, kode } : { type, hari, kode };
  return `<span class="chip">${escapeHtml(kode)}<button data-remove='${JSON.stringify(payload)}'><i class="fa-solid fa-xmark"></i></button></span>`;
}

async function openAddAsistensiModal() {
  document.getElementById("modal-title").innerText = "Tambah Slot Asistensi";
  const form = document.getElementById("modal-form");
  form.innerHTML = `
    <div><label class="text-xs text-gray-400 mb-1 block">Putaran</label><input name="putaran" type="number" required /></div>
    <div><label class="text-xs text-gray-400 mb-1 block">Tanggal</label><input name="tanggal" type="date" required /></div>
    <div><label class="text-xs text-gray-400 mb-1 block">Shift</label>
      <select name="shift" required><option value="1">Shift 1</option><option value="2">Shift 2</option><option value="3">Shift 3</option><option value="4">Shift 4</option></select>
    </div>
    <div><label class="text-xs text-gray-400 mb-1 block">Kode Asisten</label><input name="kode" required /></div>
    <div class="flex justify-end gap-2 pt-2">
      <button type="button" id="btn-cancel" class="btn btn-ghost">Batal</button>
      <button type="submit" class="btn btn-primary">Tambah</button>
    </div>`;
  form.querySelector("#btn-cancel").onclick = closeModal;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const ok = await addAsistensiKode(Number(f.putaran.value), f.tanggal.value, Number(f.shift.value), f.kode.value.trim().toUpperCase());
    if (!ok) return;
    closeModal();
    renderAsistenJadwalPiket();
  };
  document.getElementById("modal").classList.remove("hidden");
  document.getElementById("modal").classList.add("flex");
}

async function addAsistensiKode(putaran, tanggal, shift, kode) {
  const { data: existing, error: e1 } = await sb.from("jadwal_asistensi")
    .select("slot_no, kode_asisten").eq("putaran", putaran).eq("tanggal", tanggal).eq("shift", shift).order("slot_no");
  if (e1) { toast(e1.message, true); return false; }
  let targetSlot = -1;
  for (let s = 1; s <= 6; s++) {
    const row = (existing ?? []).find((r) => r.slot_no === s);
    if (!row || !row.kode_asisten) { targetSlot = s; break; }
  }
  if (targetSlot === -1) { toast("Shift ini sudah penuh (maks 6 asisten)", true); return false; }
  const { error } = await sb.from("jadwal_asistensi")
    .upsert({ putaran, tanggal, shift, slot_no: targetSlot, kode_asisten: kode }, { onConflict: "putaran,tanggal,shift,slot_no" });
  if (error) { toast(error.message, true); return false; }
  toast("Ditambahkan");
  return true;
}

async function removeAsistensiKode(putaran, tanggal, shift, kode) {
  const { data: existing, error: e1 } = await sb.from("jadwal_asistensi")
    .select("slot_no, kode_asisten").eq("putaran", putaran).eq("tanggal", tanggal).eq("shift", shift).order("slot_no");
  if (e1) { toast(e1.message, true); return; }
  const rows = existing ?? [];
  const idx = rows.findIndex((r) => r.kode_asisten === kode);
  if (idx === -1) return;
  const codes = rows.map((r) => r.kode_asisten).filter((_, i) => i !== idx);
  for (let s = 1; s <= 6; s++) {
    await sb.from("jadwal_asistensi").upsert(
      { putaran, tanggal, shift, slot_no: s, kode_asisten: codes[s - 1] ?? null },
      { onConflict: "putaran,tanggal,shift,slot_no" }
    );
  }
  toast("Dihapus");
}

async function openAddPiketModal() {
  document.getElementById("modal-title").innerText = "Tambah Piket";
  const form = document.getElementById("modal-form");
  form.innerHTML = `
    <div><label class="text-xs text-gray-400 mb-1 block">Hari</label>
      <select name="hari" required>${["Senin", "Selasa", "Rabu", "Kamis", "Jum'at", "Sabtu"].map((h) => `<option value="${h}">${h}</option>`).join("")}</select>
    </div>
    <div><label class="text-xs text-gray-400 mb-1 block">Kode Asisten</label><input name="kode" required /></div>
    <div class="flex justify-end gap-2 pt-2">
      <button type="button" id="btn-cancel" class="btn btn-ghost">Batal</button>
      <button type="submit" class="btn btn-primary">Tambah</button>
    </div>`;
  form.querySelector("#btn-cancel").onclick = closeModal;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const ok = await addPiketKode(f.hari.value, f.kode.value.trim().toUpperCase());
    if (!ok) return;
    closeModal();
    renderAsistenJadwalPiket();
  };
  document.getElementById("modal").classList.remove("hidden");
  document.getElementById("modal").classList.add("flex");
}

async function addPiketKode(hari, kode) {
  const { data: existing, error: e1 } = await sb.from("jadwal_piket").select("slot_no, kode_asisten").eq("hari", hari).order("slot_no");
  if (e1) { toast(e1.message, true); return false; }
  const rows = existing ?? [];
  let targetSlot = rows.length ? Math.max(...rows.map((r) => r.slot_no)) + 1 : 1;
  const { error } = await sb.from("jadwal_piket").upsert({ hari, slot_no: targetSlot, kode_asisten: kode }, { onConflict: "hari,slot_no" });
  if (error) { toast(error.message, true); return false; }
  toast("Ditambahkan");
  return true;
}

async function removePiketKode(hari, kode) {
  const { data: existing, error: e1 } = await sb.from("jadwal_piket").select("slot_no, kode_asisten").eq("hari", hari).order("slot_no");
  if (e1) { toast(e1.message, true); return; }
  const rows = existing ?? [];
  const idx = rows.findIndex((r) => r.kode_asisten === kode);
  if (idx === -1) return;
  await sb.from("jadwal_piket").delete().eq("hari", hari).eq("slot_no", rows[idx].slot_no);
  toast("Dihapus");
}

// =====================================================================
// Custom panel: Struktur Organisasi
// =====================================================================
async function renderStrukturPanel() {
  document.getElementById("section-desc").innerText = "Susunan pengurus per divisi + foto & angkatan (landing page)";
  const panel = document.getElementById("panel-custom");
  panel.innerHTML = `<p class="text-xs text-gray-500">Memuat...</p>`;

  const [{ data: divisiList }, { data: pengurus }, { data: infoRows }] = await Promise.all([
    sb.from("divisi").select("id, nama").order("id"),
    sb.from("struktur_pengurus").select("id, divisi_id, nama, urutan").order("urutan"),
    sb.from("struktur_info").select("key, value"),
  ]);
  const info = Object.fromEntries((infoRows ?? []).map((r) => [r.key, r.value]));

  panel.innerHTML = `
    <div class="grid grid-cols-2 gap-4 mb-6">
      <div class="surface-card border border-[#242424] p-4">
        <label class="text-xs text-gray-400 mb-1 block">URL Foto Kepengurusan</label>
        <input id="foto-url" value="${escapeHtml(info.foto_asisten_url || "")}" placeholder="https://..." />
      </div>
      <div class="surface-card border border-[#242424] p-4">
        <label class="text-xs text-gray-400 mb-1 block">Tahun Angkatan</label>
        <input id="angkatan" value="${escapeHtml(info.angkatan || "")}" placeholder="2026" />
      </div>
    </div>
    <button id="btn-save-info" class="btn btn-primary mb-6"><i class="fa-solid fa-save mr-1"></i>Simpan Foto & Angkatan</button>

    <div class="flex justify-between items-center mb-3">
      <h3 class="text-sm font-bold">Susunan Pengurus</h3>
      <button id="btn-add-pengurus" class="btn btn-primary"><i class="fa-solid fa-plus mr-1"></i>Tambah Pengurus</button>
    </div>
    <div class="grid grid-cols-3 gap-3">
      ${(divisiList ?? []).map((d) => `
        <div class="surface-card border border-[#242424] p-3">
          <div class="text-xs font-bold mb-2">${escapeHtml(d.nama)}</div>
          ${(pengurus ?? []).filter((p) => p.divisi_id === d.id).map((p) => `
            <div class="flex justify-between items-center text-xs py-1 border-b border-[#242424]">
              <span>${escapeHtml(p.nama)}</span>
              <button data-del-pengurus="${p.id}" class="text-red-400 hover:text-red-300"><i class="fa-solid fa-xmark"></i></button>
            </div>`).join("") || '<div class="text-[11px] text-gray-600">Belum ada</div>'}
        </div>`).join("")}
    </div>`;

  document.getElementById("btn-save-info").onclick = async () => {
    const foto = document.getElementById("foto-url").value.trim();
    const angkatan = document.getElementById("angkatan").value.trim();
    const rows = [];
    if (foto) rows.push({ key: "foto_asisten_url", value: foto });
    if (angkatan) rows.push({ key: "angkatan", value: angkatan });
    if (rows.length) {
      const { error } = await sb.from("struktur_info").upsert(rows, { onConflict: "key" });
      if (error) { toast(error.message, true); return; }
    }
    toast("Tersimpan");
  };

  document.getElementById("btn-add-pengurus").onclick = () => openAddPengurusModal(divisiList ?? []);
  panel.querySelectorAll("[data-del-pengurus]").forEach((btn) => {
    btn.onclick = async () => {
      if (!confirm("Hapus pengurus ini?")) return;
      await sb.from("struktur_pengurus").delete().eq("id", btn.dataset.delPengurus);
      renderStrukturPanel();
    };
  });
}

function openAddPengurusModal(divisiList) {
  document.getElementById("modal-title").innerText = "Tambah Pengurus";
  const form = document.getElementById("modal-form");
  form.innerHTML = `
    <div><label class="text-xs text-gray-400 mb-1 block">Divisi</label>
      <select name="divisi_id" required>${divisiList.map((d) => `<option value="${d.id}">${escapeHtml(d.nama)}</option>`).join("")}</select>
    </div>
    <div><label class="text-xs text-gray-400 mb-1 block">Nama</label><input name="nama" required /></div>
    <div><label class="text-xs text-gray-400 mb-1 block">Urutan</label><input name="urutan" type="number" value="0" /></div>
    <div class="flex justify-end gap-2 pt-2">
      <button type="button" id="btn-cancel" class="btn btn-ghost">Batal</button>
      <button type="submit" class="btn btn-primary">Tambah</button>
    </div>`;
  form.querySelector("#btn-cancel").onclick = closeModal;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const { error } = await sb.from("struktur_pengurus").insert({
      divisi_id: Number(f.divisi_id.value), nama: f.nama.value, urutan: Number(f.urutan.value) || 0,
    });
    if (error) { toast(error.message, true); return; }
    toast("Ditambahkan");
    closeModal();
    renderStrukturPanel();
  };
  document.getElementById("modal").classList.remove("hidden");
  document.getElementById("modal").classList.add("flex");
}

// =====================================================================
// Custom panel: Nilai (per-praktikan, 6 modul sekaligus)
// =====================================================================
async function renderNilaiPanel() {
  document.getElementById("section-desc").innerText = "Cari praktikan, lalu isi nilai 6 modul sekaligus";
  const panel = document.getElementById("panel-custom");
  panel.innerHTML = `
    <div class="mb-4">
      <input id="nilai-search" placeholder="Ketik NIM atau nama praktikan..." class="w-96" />
      <div id="nilai-search-results" class="mt-2"></div>
    </div>
    <div id="nilai-form-area"></div>`;

  let debounce;
  document.getElementById("nilai-search").oninput = (e) => {
    clearTimeout(debounce);
    debounce = setTimeout(() => searchPraktikanForNilai(e.target.value), 300);
  };
}

async function searchPraktikanForNilai(q) {
  const resultDiv = document.getElementById("nilai-search-results");
  if (!q || q.length < 2) { resultDiv.innerHTML = ""; return; }
  const { data, error } = await sb.from("praktikan").select("id, nim, nama_lengkap")
    .or(`nama_lengkap.ilike.%${q}%,nim.eq.${isNaN(Number(q)) ? -1 : Number(q)}`).limit(8);
  if (error) { toast(error.message, true); return; }
  resultDiv.innerHTML = (data ?? []).map((p) => `
    <div class="chip cursor-pointer" data-pick="${p.id}" style="cursor:pointer">
      ${escapeHtml(p.nama_lengkap)} - ${p.nim}
    </div>`).join("") || `<p class="text-xs text-gray-500">Tidak ditemukan</p>`;
  resultDiv.querySelectorAll("[data-pick]").forEach((el) => {
    el.onclick = () => loadNilaiForm(el.dataset.pick);
  });
}

async function loadNilaiForm(praktikanId) {
  const [{ data: praktikan }, { data: nilaiRows }, { data: sosial }] = await Promise.all([
    sb.from("praktikan").select("id, nim, nama_lengkap").eq("id", praktikanId).single(),
    sb.from("nilai").select("*").eq("praktikan_id", praktikanId).order("modul_urutan"),
    sb.from("nilai_sosialisasi").select("*").eq("praktikan_id", praktikanId).single(),
  ]);
  const byModul = {};
  for (const r of nilaiRows ?? []) byModul[r.modul_urutan] = r;

  const area = document.getElementById("nilai-form-area");
  area.innerHTML = `
    <div class="surface-card border border-[#242424] p-4">
      <h3 class="text-sm font-bold mb-1">${escapeHtml(praktikan.nama_lengkap)}</h3>
      <p class="text-xs text-gray-500 mb-4">NIM: ${praktikan.nim} · Jurusan: ${jurusanFromNim(praktikan.nim)}</p>

      <div class="mb-4">
        <label class="text-xs text-gray-400 mb-1 block">Grup</label>
        <input id="nilai-grup" value="${escapeHtml(byModul[1]?.grup || "")}" class="w-48" />
      </div>

      <div class="grid grid-cols-6 gap-2 mb-4">
        <div class="text-[10px] text-gray-500 uppercase font-bold col-span-6 mb-1">Nilai per Modul</div>
        <div class="text-[10px] text-gray-500 uppercase">Modul</div>
        <div class="text-[10px] text-gray-500 uppercase">Ast</div>
        <div class="text-[10px] text-gray-500 uppercase">Kode</div>
        <div class="text-[10px] text-gray-500 uppercase">TP (5)</div>
        <div class="text-[10px] text-gray-500 uppercase">TL (25)</div>
        <div class="text-[10px] text-gray-500 uppercase">PD (20)</div>
        ${[1, 2, 3, 4, 5, 6].map((i) => `
          <div class="flex items-center text-xs font-semibold">Modul ${i}</div>
          <input data-modul="${i}" data-field="ast_kode" value="${escapeHtml(byModul[i]?.ast_kode || "")}" />
          <input data-modul="${i}" data-field="modul_kode" value="${escapeHtml(byModul[i]?.modul_kode || "")}" />
          <input data-modul="${i}" data-field="tp" type="number" step="0.01" value="${byModul[i]?.tp ?? ""}" />
          <input data-modul="${i}" data-field="tl" type="number" step="0.01" value="${byModul[i]?.tl ?? ""}" />
          <input data-modul="${i}" data-field="pd" type="number" step="0.01" value="${byModul[i]?.pd ?? ""}" />
        `).join("")}
      </div>
      <div class="grid grid-cols-6 gap-2 mb-4">
        ${[1, 2, 3, 4, 5, 6].map((i) => `
          <div class="col-span-5 text-right text-[10px] text-gray-500 pr-1">Laporan Modul ${i} (50)</div>
          <input data-modul="${i}" data-field="lap" type="number" step="0.01" value="${byModul[i]?.lap ?? ""}" />
        `).join("")}
      </div>

      <div class="mb-4 w-48">
        <label class="text-xs text-gray-400 mb-1 block">Nilai Sosialisasi</label>
        <input id="nilai-sosial" type="number" step="0.01" value="${sosial?.nilai ?? ""}" />
      </div>

      <button id="btn-save-nilai" class="btn btn-primary"><i class="fa-solid fa-save mr-1"></i>Simpan Semua Nilai</button>
    </div>`;

  document.getElementById("btn-save-nilai").onclick = async () => {
    const grup = document.getElementById("nilai-grup").value.trim() || null;
    const rows = [];
    for (let i = 1; i <= 6; i++) {
      const get = (f) => area.querySelector(`[data-modul="${i}"][data-field="${f}"]`).value;
      const ast = get("ast_kode"), modul = get("modul_kode");
      const tp = get("tp"), tl = get("tl"), pd = get("pd"), lap = get("lap");
      if (!ast && !modul && !tp && !tl && !pd && !lap) continue; // kosong semua, skip
      rows.push({
        praktikan_id: praktikanId, grup, modul_urutan: i,
        ast_kode: ast || null, modul_kode: modul || null,
        tp: tp ? Number(tp) : null, tl: tl ? Number(tl) : null,
        pd: pd ? Number(pd) : null, lap: lap ? Number(lap) : null,
      });
    }
    if (rows.length) {
      const { error } = await sb.from("nilai").upsert(rows, { onConflict: "praktikan_id,modul_urutan" });
      if (error) { toast(error.message, true); return; }
    }
    const sosialVal = document.getElementById("nilai-sosial").value;
    if (sosialVal !== "") {
      const { error } = await sb.from("nilai_sosialisasi").upsert(
        { praktikan_id: praktikanId, nilai: Number(sosialVal) }, { onConflict: "praktikan_id" }
      );
      if (error) { toast(error.message, true); return; }
    }
    toast("Nilai tersimpan");
  };
}

// =====================================================================
// Custom panel: Kelola Admin (super_admin only)
// =====================================================================
async function callAdminManage(action, body) {
  const { data: { session } } = await sb.auth.getSession();
  const res = await fetch(ADMIN_MANAGE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ action, ...body }),
  });
  return res.json();
}

async function renderKelolaAdmin() {
  document.getElementById("section-desc").innerText = "Angkat atau cabut akses admin lain";
  const panel = document.getElementById("panel-custom");
  panel.innerHTML = `
    <div class="flex justify-end mb-3">
      <button id="btn-add-admin" class="btn btn-primary"><i class="fa-solid fa-plus mr-1"></i>Tambah Admin</button>
    </div>
    <div id="admin-list" class="surface-card border border-[#242424] overflow-auto"><table><thead><tr><th>Nama</th><th>Role</th><th>Status</th><th>Dibuat</th><th></th></tr></thead><tbody></tbody></table></div>`;
  document.getElementById("btn-add-admin").onclick = openCreateAdminModal;

  const result = await callAdminManage("list_admins", {});
  if (!result.success) { toast(result.error, true); return; }
  const tbody = document.querySelector("#admin-list tbody");
  tbody.innerHTML = "";
  for (const a of result.admins) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(a.nama)}</td>
      <td>${a.role === "super_admin" ? "Super Admin" : "Admin"}</td>
      <td>${a.is_active ? '<span class="text-green-400">Aktif</span>' : '<span class="text-red-400">Nonaktif</span>'}</td>
      <td>${new Date(a.created_at).toLocaleDateString("id-ID")}</td>
      <td class="text-right"></td>`;
    const actionTd = tr.querySelector("td:last-child");
    if (a.id !== ME.id) {
      const btn = document.createElement("button");
      btn.className = a.is_active ? "btn btn-danger" : "btn btn-primary";
      btn.innerText = a.is_active ? "Cabut Akses" : "Aktifkan";
      btn.onclick = async () => {
        if (!confirm(`${a.is_active ? "Cabut" : "Aktifkan"} akses admin "${a.nama}"?`)) return;
        const r = await callAdminManage(a.is_active ? "revoke_admin" : "reactivate_admin", { id: a.id });
        if (!r.success) { toast(r.error, true); return; }
        toast("Berhasil diperbarui");
        renderKelolaAdmin();
      };
      actionTd.appendChild(btn);
    } else {
      actionTd.innerHTML = `<span class="text-[11px] text-gray-500">Ini akun kamu</span>`;
    }
    tbody.appendChild(tr);
  }
}

function openCreateAdminModal() {
  document.getElementById("modal-title").innerText = "Tambah Admin";
  const form = document.getElementById("modal-form");
  form.innerHTML = `
    <div><label class="text-xs text-gray-400 mb-1 block">Nama</label><input name="nama" required /></div>
    <div><label class="text-xs text-gray-400 mb-1 block">Email</label><input name="email" type="email" required /></div>
    <div><label class="text-xs text-gray-400 mb-1 block">Password Awal</label><input name="password" type="text" required minlength="6" /></div>
    <div><label class="text-xs text-gray-400 mb-1 block">Role</label>
      <select name="role"><option value="admin">Admin</option><option value="super_admin">Super Admin</option></select>
    </div>
    <div class="flex justify-end gap-2 pt-2">
      <button type="button" id="btn-cancel" class="btn btn-ghost">Batal</button>
      <button type="submit" class="btn btn-primary">Buat Admin</button>
    </div>`;
  form.querySelector("#btn-cancel").onclick = closeModal;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const r = await callAdminManage("create_admin", { nama: f.nama.value, email: f.email.value, password: f.password.value, role: f.role.value });
    if (!r.success) { toast(r.error, true); return; }
    toast("Admin baru dibuat");
    closeModal();
    renderKelolaAdmin();
  };
  document.getElementById("modal").classList.remove("hidden");
  document.getElementById("modal").classList.add("flex");
}

// =====================================================================
// Toast
// =====================================================================
function toast(msg, isError) {
  const el = document.getElementById("toast");
  const body = document.getElementById("toast-body");
  body.innerText = msg;
  body.style.color = isError ? "#f87171" : "#4ade80";
  el.classList.remove("hidden");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => el.classList.add("hidden"), 3000);
}

init();
