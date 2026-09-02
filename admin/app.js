const sb = supabase.createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.anonKey);
const ADMIN_MANAGE_URL = `${window.SUPABASE_CONFIG.url}/functions/v1/admin-manage`;

let ME = null; // { id, nama, role }
let currentTable = null;
let currentRows = [];
let editingId = null;

// =====================================================================
// Konfigurasi tiap tabel: kolom, tipe input, label. Dipakai buat
// generate tabel data & form modal secara otomatis.
// =====================================================================
const HARI_OPTIONS = ["Senin", "Selasa", "Rabu", "Kamis", "Jum'at", "Sabtu"];

const TABLES = {
  asisten: {
    label: "Asisten", icon: "fa-user-tie", desc: "Data akun & identitas asisten",
    pk: "id",
    columns: [
      { name: "nama_lengkap", label: "Nama Lengkap", type: "text", required: true },
      { name: "kode_asisten", label: "Kode Asisten", type: "text", required: true },
      { name: "nim", label: "NIM", type: "number", required: true },
      { name: "password", label: "Password", type: "text", required: true },
      { name: "link_telegram", label: "Link Telegram", type: "text" },
      { name: "divisi_id", label: "Divisi", type: "select-fk", fk: { table: "divisi", value: "id", label: "nama" } },
    ],
  },
  praktikan: {
    label: "Praktikan", icon: "fa-user-graduate", desc: "Data akun & identitas praktikan",
    pk: "id",
    columns: [
      { name: "nim", label: "NIM", type: "number", required: true },
      { name: "nama_lengkap", label: "Nama Lengkap", type: "text", required: true },
      { name: "password", label: "Password", type: "text", required: true },
      { name: "kelompok_besar", label: "Kelompok Besar", type: "text" },
      { name: "kelompok_sedang", label: "Kelompok Sedang", type: "text" },
      { name: "kelompok_kecil", label: "Kelompok Kecil", type: "text" },
      { name: "jurusan", label: "Jurusan", type: "text" },
      { name: "kode_jurusan", label: "Kode Jurusan", type: "text" },
    ],
  },
  jadwal_praktikum: {
    label: "Jadwal Praktikum", icon: "fa-calendar-days", desc: "Jadwal per tanggal per praktikan",
    pk: "id",
    columns: [
      { name: "praktikan_id", label: "Praktikan (NIM)", type: "select-fk", fk: { table: "praktikan", value: "id", label: "nim", label2: "nama_lengkap" }, required: true },
      { name: "putaran", label: "Putaran", type: "number" },
      { name: "tanggal", label: "Tanggal", type: "date", required: true },
      { name: "hari", label: "Hari", type: "select", options: HARI_OPTIONS },
      { name: "modul_text", label: "Modul (contoh: Pesawat Atwood [PA])", type: "text" },
      { name: "jurusan_baris", label: "Jurusan (isi 'All' jika semua)", type: "text" },
      { name: "kode_jurusan_baris", label: "Kode Jurusan", type: "text" },
      { name: "shift1_kode", label: "Shift 1 - Kode", type: "text" },
      { name: "shift2_kode", label: "Shift 2 - Kode", type: "text" },
      { name: "shift3_kode", label: "Shift 3 - Kode", type: "text" },
      { name: "shift4_kode", label: "Shift 4 - Kode", type: "text" },
      { name: "shift1_jam", label: "Shift 1 - Jam", type: "text", placeholder: "08.00-10.00" },
      { name: "shift2_jam", label: "Shift 2 - Jam", type: "text", placeholder: "11.00-13.00" },
      { name: "shift3_jam", label: "Shift 3 - Jam", type: "text", placeholder: "14.00-16.00" },
      { name: "shift4_jam", label: "Shift 4 - Jam", type: "text", placeholder: "17.00-19.00" },
    ],
  },
  jadwal_asistensi: {
    label: "Jadwal Asistensi", icon: "fa-people-arrows", desc: "Slot asisten per putaran/tanggal/shift (maks 6 slot)",
    pk: "id",
    columns: [
      { name: "putaran", label: "Putaran", type: "number", required: true },
      { name: "tanggal", label: "Tanggal", type: "date", required: true },
      { name: "shift", label: "Shift (1-4)", type: "number", required: true },
      { name: "slot_no", label: "Slot ke- (1-6)", type: "number", required: true },
      { name: "kode_asisten", label: "Kode Asisten", type: "text" },
    ],
  },
  jadwal_piket: {
    label: "Jadwal Piket", icon: "fa-broom", desc: "Piket asisten per hari",
    pk: "id",
    columns: [
      { name: "hari", label: "Hari", type: "select", options: HARI_OPTIONS, required: true },
      { name: "slot_no", label: "Slot ke-", type: "number", required: true },
      { name: "kode_asisten", label: "Kode Asisten", type: "text" },
    ],
  },
  nilai: {
    label: "Nilai", icon: "fa-star", desc: "Nilai per modul (1-6) per praktikan",
    pk: "id",
    columns: [
      { name: "praktikan_id", label: "Praktikan (NIM)", type: "select-fk", fk: { table: "praktikan", value: "id", label: "nim", label2: "nama_lengkap" }, required: true },
      { name: "grup", label: "Grup", type: "text" },
      { name: "modul_urutan", label: "Modul ke- (1-6)", type: "number", required: true },
      { name: "ast_kode", label: "Kode Asisten Penilai", type: "text" },
      { name: "modul_kode", label: "Kode Modul", type: "text" },
      { name: "tp", label: "TP (maks 5)", type: "number", step: "0.01" },
      { name: "tl", label: "TL (maks 25)", type: "number", step: "0.01" },
      { name: "pd", label: "PD (maks 20)", type: "number", step: "0.01" },
      { name: "lap", label: "Laporan (maks 50)", type: "number", step: "0.01" },
    ],
  },
  nilai_sosialisasi: {
    label: "Nilai Sosialisasi", icon: "fa-people-group", desc: "Nilai tambahan sosialisasi per praktikan",
    pk: "praktikan_id",
    columns: [
      { name: "praktikan_id", label: "Praktikan (NIM)", type: "select-fk", fk: { table: "praktikan", value: "id", label: "nim", label2: "nama_lengkap" }, required: true },
      { name: "nilai", label: "Nilai", type: "number", step: "0.01" },
    ],
  },
  pengumuman: {
    label: "Pengumuman", icon: "fa-bullhorn", desc: "Pengumuman untuk asisten / praktikan",
    pk: "id",
    columns: [
      { name: "target", label: "Untuk", type: "select", options: ["praktikan", "asisten"], required: true },
      { name: "tanggal", label: "Tanggal", type: "datetime-local" },
      { name: "judul", label: "Judul", type: "text", required: true },
      { name: "isi", label: "Isi", type: "textarea", required: true },
      { name: "urutan", label: "Urutan Tampil", type: "number" },
    ],
  },
  link_penting: {
    label: "Link Penting", icon: "fa-link", desc: "Link-link penting (materi, formulir, dll)",
    pk: "id",
    columns: [
      { name: "judul", label: "Judul (peruntukan)", type: "text", required: true },
      { name: "url", label: "URL", type: "text", required: true },
      { name: "tambahan", label: "Tambahan (contoh: Aktif/Nonaktif utk transparansi nilai)", type: "text" },
      { name: "urutan", label: "Urutan Tampil", type: "number" },
    ],
  },
  divisi: {
    label: "Divisi", icon: "fa-sitemap", desc: "Daftar divisi kepengurusan",
    pk: "id",
    columns: [{ name: "nama", label: "Nama Divisi", type: "text", required: true }],
  },
  struktur_pengurus: {
    label: "Struktur Pengurus", icon: "fa-users", desc: "Nama pengurus per divisi & urutan tampil",
    pk: "id",
    columns: [
      { name: "divisi_id", label: "Divisi", type: "select-fk", fk: { table: "divisi", value: "id", label: "nama" }, required: true },
      { name: "nama", label: "Nama", type: "text", required: true },
      { name: "urutan", label: "Urutan", type: "number" },
    ],
  },
  struktur_info: {
    label: "Info Struktur", icon: "fa-image", desc: "Foto kepengurusan & tahun angkatan (landing page)",
    pk: "key",
    columns: [
      { name: "key", label: "Key", type: "select", options: ["foto_asisten_url", "angkatan"], required: true },
      { name: "value", label: "Value", type: "text" },
    ],
  },
  modul: {
    label: "Modul", icon: "fa-flask", desc: "Referensi daftar modul praktikum",
    pk: "id",
    columns: [
      { name: "kode", label: "Kode", type: "text", required: true },
      { name: "nama", label: "Nama Modul", type: "text", required: true },
    ],
  },
};

const fkOptionsCache = {};

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

  buildNav();
  const firstKey = Object.keys(TABLES)[0];
  openSection(firstKey);
}

document.getElementById("btn-logout").addEventListener("click", async () => {
  await sb.auth.signOut();
  window.location.href = "login.html";
});

// =====================================================================
// Sidebar nav
// =====================================================================
function buildNav() {
  const nav = document.getElementById("nav");
  nav.innerHTML = "";
  for (const [key, cfg] of Object.entries(TABLES)) {
    const el = document.createElement("div");
    el.className = "nav-item";
    el.dataset.key = key;
    el.innerHTML = `<i class="fa-solid ${cfg.icon} w-4"></i> ${cfg.label}`;
    el.onclick = () => openSection(key);
    nav.appendChild(el);
  }
  if (ME.role === "super_admin") {
    const el = document.createElement("div");
    el.className = "nav-item";
    el.dataset.key = "__admin__";
    el.innerHTML = `<i class="fa-solid fa-user-shield w-4"></i> Kelola Admin`;
    el.onclick = () => openAdminSection();
    nav.appendChild(el);
  }
}

function setActiveNav(key) {
  document.querySelectorAll(".nav-item").forEach((el) => {
    el.classList.toggle("active", el.dataset.key === key);
  });
}

// =====================================================================
// Generic CRUD: render tabel + form
// =====================================================================
async function openSection(key) {
  currentTable = key;
  setActiveNav(key);
  const cfg = TABLES[key];
  document.getElementById("section-title").innerText = cfg.label;
  document.getElementById("section-desc").innerText = cfg.desc;
  document.getElementById("btn-add").style.display = "inline-flex";
  document.getElementById("btn-add").onclick = () => openModal(null);
  document.getElementById("search-box").oninput = (e) => renderTable(filterRows(e.target.value));
  await loadRows();
}

async function loadRows() {
  const cfg = TABLES[currentTable];
  const { data, error } = await sb.from(currentTable).select("*").order(cfg.pk, { ascending: false }).limit(500);
  if (error) { toast(error.message, true); currentRows = []; }
  else currentRows = data ?? [];
  document.getElementById("search-box").value = "";
  renderTable(currentRows);
}

function filterRows(q) {
  if (!q) return currentRows;
  q = q.toLowerCase();
  return currentRows.filter((r) => JSON.stringify(r).toLowerCase().includes(q));
}

function renderTable(rows) {
  const cfg = TABLES[currentTable];
  const thead = document.querySelector("#data-table thead tr");
  const tbody = document.querySelector("#data-table tbody");
  thead.innerHTML = cfg.columns.map((c) => `<th>${c.label}</th>`).join("") + `<th></th>`;
  tbody.innerHTML = "";

  for (const row of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = cfg.columns.map((c) => `<td>${escapeHtml(displayValue(row, c))}</td>`).join("") +
      `<td class="text-right">
         <button class="btn btn-ghost mr-1" data-act="edit"><i class="fa-solid fa-pen"></i></button>
         <button class="btn btn-danger" data-act="del"><i class="fa-solid fa-trash"></i></button>
       </td>`;
    tr.querySelector('[data-act="edit"]').onclick = () => openModal(row);
    tr.querySelector('[data-act="del"]').onclick = () => deleteRow(row);
    tbody.appendChild(tr);
  }
  document.getElementById("row-count").innerText = `${rows.length} baris`;
}

function displayValue(row, col) {
  const v = row[col.name];
  if (v === null || v === undefined) return "";
  if (col.type === "select-fk" && col.fk._labelMap) {
    return col.fk._labelMap.get(v) ?? v;
  }
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
  editingId = row ? row[TABLES[currentTable].pk] : null;
  const cfg = TABLES[currentTable];
  document.getElementById("modal-title").innerText = row ? `Edit ${cfg.label}` : `Tambah ${cfg.label}`;
  const form = document.getElementById("modal-form");
  form.innerHTML = "";

  for (const col of cfg.columns) {
    // pk yg auto (id) di tabel dgn pk custom (spt struktur_info.key) tetap perlu diisi manual saat tambah
    const wrap = document.createElement("div");
    const val = row ? row[col.name] ?? "" : "";
    let inputHtml = "";

    if (col.type === "select-fk") {
      const opts = await fetchFkOptions(col);
      inputHtml = `<select name="${col.name}" ${col.required ? "required" : ""}>
        <option value="">- pilih -</option>
        ${opts.map((o) => `<option value="${o.value}" ${String(o.value) === String(val) ? "selected" : ""}>${escapeHtml(o.label)}</option>`).join("")}
      </select>`;
    } else if (col.type === "select") {
      inputHtml = `<select name="${col.name}" ${col.required ? "required" : ""}>
        <option value="">- pilih -</option>
        ${col.options.map((o) => `<option value="${o}" ${o === val ? "selected" : ""}>${o}</option>`).join("")}
      </select>`;
    } else if (col.type === "textarea") {
      inputHtml = `<textarea name="${col.name}" rows="4" ${col.required ? "required" : ""}>${escapeHtml(val)}</textarea>`;
    } else {
      inputHtml = `<input name="${col.name}" type="${col.type}" ${col.step ? `step="${col.step}"` : ""}
        placeholder="${col.placeholder ?? ""}" value="${escapeHtml(val)}" ${col.required ? "required" : ""} />`;
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
  const cfg = TABLES[currentTable];
  const form = e.target;
  const payload = {};
  for (const col of cfg.columns) {
    const el = form.elements[col.name];
    let v = el.value;
    if (v === "") v = null;
    if (v !== null && col.type === "number") v = Number(v);
    payload[col.name] = v;
  }

  let error;
  if (editingId !== null) {
    ({ error } = await sb.from(currentTable).update(payload).eq(cfg.pk, editingId));
  } else {
    ({ error } = await sb.from(currentTable).insert(payload));
  }

  if (error) { toast(error.message, true); return; }
  toast("Tersimpan");
  closeModal();
  await loadRows();
}

async function deleteRow(row) {
  const cfg = TABLES[currentTable];
  if (!confirm("Hapus baris ini? Tindakan tidak bisa dibatalkan.")) return;
  const { error } = await sb.from(currentTable).delete().eq(cfg.pk, row[cfg.pk]);
  if (error) { toast(error.message, true); return; }
  toast("Terhapus");
  await loadRows();
}

// =====================================================================
// Kelola Admin (super_admin only) — lewat Edge Function admin-manage
// =====================================================================
async function callAdminManage(action, body) {
  const { data: { session } } = await sb.auth.getSession();
  const res = await fetch(ADMIN_MANAGE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ action, ...body }),
  });
  return res.json();
}

async function openAdminSection() {
  currentTable = null;
  setActiveNav("__admin__");
  document.getElementById("section-title").innerText = "Kelola Admin";
  document.getElementById("section-desc").innerText = "Angkat atau cabut akses admin lain";
  document.getElementById("btn-add").style.display = "inline-flex";
  document.getElementById("btn-add").onclick = openCreateAdminModal;
  document.getElementById("search-box").oninput = null;
  document.getElementById("search-box").value = "";

  const result = await callAdminManage("list_admins", {});
  if (!result.success) { toast(result.error, true); return; }

  const thead = document.querySelector("#data-table thead tr");
  const tbody = document.querySelector("#data-table tbody");
  thead.innerHTML = `<th>Nama</th><th>Role</th><th>Status</th><th>Dibuat</th><th></th>`;
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
        openAdminSection();
      };
      actionTd.appendChild(btn);
    } else {
      actionTd.innerHTML = `<span class="text-[11px] text-gray-500">Ini akun kamu</span>`;
    }
    tbody.appendChild(tr);
  }
  document.getElementById("row-count").innerText = `${result.admins.length} admin`;
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
    const r = await callAdminManage("create_admin", {
      nama: f.nama.value, email: f.email.value, password: f.password.value, role: f.role.value,
    });
    if (!r.success) { toast(r.error, true); return; }
    toast("Admin baru dibuat");
    closeModal();
    openAdminSection();
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
