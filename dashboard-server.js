import express from "express";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET || "change-this-secret-before-deploy";
const DATA_FILE = path.join(__dirname, "Cache", "silungkang.json");
const { Pool } = pg;
const pool = process.env.DATABASE_URL ? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("railway") || process.env.PGSSLMODE === "require"
    ? { rejectUnauthorized: false } : undefined
}) : null;

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

const STOCK_KEYS = ["dada", "pahaAtas", "pahaBawah", "sayap"];
const STOCK_LABELS = { dada: "Dada", pahaAtas: "Paha atas", pahaBawah: "Paha bawah", sayap: "Sayap" };
const ZERO_STOCK = () => ({ dada: 0, pahaAtas: 0, pahaBawah: 0, sayap: 0 });
const slug = value => String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const cleanPhone = value => String(value || "").replace(/\D/g, "");
const jidFor = value => {
  const phone = cleanPhone(value);
  return phone ? `${phone}@s.whatsapp.net` : "";
};
const totalStock = stock => STOCK_KEYS.reduce((sum, key) => sum + Number(stock?.[key] || 0), 0);

const initial = () => ({
  admins: [],
  branches: [
    { id: "sawahlunto", name: "Sawahlunto", phone: "", whatsappGroup: "", stock: ZERO_STOCK(), active: true },
    { id: "sijunjung", name: "Sijunjung", phone: "", whatsappGroup: "", stock: ZERO_STOCK(), active: true }
  ],
  menu: [
    { id: "Dada", name: "Ayam Bagian Dada", description: "Ayam Crispy Enak, Besar Dan Harga Terjangkau.", price: 10000, image: "" },
    { id: "Sayap", name: "Ayam Bagian Sayap", description: "Ayam Crispy Enak, Besar Dan Harga Terjangkau.", price: 10000, image: "" },
    { id: "Paha-Atas", name: "Ayam Bagian Paha Atas", description: "Ayam Crispy Enak, Besar Dan Harga Terjangkau.", price: 10000, image: "" },
    { id: "Paha-Bawah", name: "Ayam Bagian Paha Bawah", description: "Ayam Crispy Enak, Besar Dan Harga Terjangkau.", price: 10000, image: "" }
  ],
  orders: [],
  logs: [],
  settings: { shopName: "Silungkang FriedChicken", ownerPhone: "", whatsappGroup: "" }
});

function normalizeState(raw = {}) {
  const base = initial();
  const state = { ...base, ...raw, settings: { ...base.settings, ...(raw.settings || {}) } };
  if (!Array.isArray(raw.branches) || raw.branches.length === 0) {
    // Preserve the old shared stock in Sawahlunto only; do not duplicate it into Sijunjung.
    const legacyStock = { ...ZERO_STOCK(), ...(raw.stock || {}) };
    state.branches = base.branches.map((branch, index) => ({
      ...branch,
      stock: index === 0 ? legacyStock : ZERO_STOCK()
    }));
  } else {
    state.branches = raw.branches.map((branch, index) => ({
      id: slug(branch.id || branch.name) || `cabang-${index + 1}`,
      name: String(branch.name || `Cabang ${index + 1}`),
      phone: cleanPhone(branch.phone),
      whatsappGroup: String(branch.whatsappGroup || ""),
      stock: { ...ZERO_STOCK(), ...(branch.stock || {}) },
      active: branch.active !== false
    }));
  }
  state.admins = (Array.isArray(raw.admins) ? raw.admins : []).map(admin => ({
    ...admin,
    branchId: admin.role === "owner" ? null : (admin.branchId || state.branches[0]?.id || null),
    phone: cleanPhone(admin.phone)
  }));
  state.menu = Array.isArray(raw.menu) ? raw.menu : base.menu;
  state.orders = Array.isArray(raw.orders) ? raw.orders.map(order => ({
    ...order,
    branchId: order.branchId || state.branches[0]?.id || null,
    branchName: order.branchName || state.branches[0]?.name || "Sawahlunto"
  })) : [];
  state.logs = Array.isArray(raw.logs) ? raw.logs : [];
  return state;
}

let state = initial();
let queue = [];

async function load() {
  if (pool) {
    await pool.query(`CREATE TABLE IF NOT EXISTS sf_state (id int primary key default 1, data jsonb not null)`);
    const result = await pool.query("SELECT data FROM sf_state WHERE id=1");
    if (result.rows[0]) state = normalizeState(result.rows[0].data);
    else await save();
  } else {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    try {
      state = normalizeState(JSON.parse(fs.readFileSync(DATA_FILE, "utf8")));
    } catch {
      state = initial();
      await save();
    }
  }
}

async function save() {
  if (pool) {
    await pool.query(
      "INSERT INTO sf_state(id,data) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data",
      [state]
    );
  } else {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
  }
}

function enqueue(type, payload) {
  queue.push({ id: crypto.randomUUID(), type, payload, createdAt: new Date().toISOString() });
  if (queue.length > 500) queue = queue.slice(-500);
}

function branchRecipients(branch) {
  const recipients = new Set();
  const branchPhone = jidFor(branch?.phone);
  if (branchPhone) recipients.add(branchPhone);
  for (const admin of state.admins) {
    if (admin.role !== "owner" && admin.branchId === branch?.id) {
      const phone = jidFor(admin.phone);
      if (phone) recipients.add(phone);
    }
  }
  if (!recipients.size && (state.settings.ownerPhone || process.env.OWNER_WHATSAPP)) {
    const fallback = jidFor(state.settings.ownerPhone || process.env.OWNER_WHATSAPP);
    if (fallback) recipients.add(fallback);
  }
  return [...recipients];
}

function requireBotKey(req, res, next) {
  if (process.env.BOT_BRIDGE_KEY && req.headers["x-bot-key"] !== process.env.BOT_BRIDGE_KEY) {
    return res.sendStatus(401);
  }
  next();
}

function auth(req, res, next) {
  try {
    const token = (req.headers.authorization || "").replace(/^Bearer /, "");
    const decoded = jwt.verify(token, SECRET);
    const admin = state.admins.find(item => item.id === decoded.id);
    if (!admin) return res.status(401).json({ error: "Akun admin tidak ditemukan atau sudah dihapus." });
    req.admin = { id: admin.id, username: admin.username, role: admin.role, branchId: admin.branchId, phone: admin.phone };
    next();
  } catch {
    return res.status(401).json({ error: "Silakan login sebagai admin." });
  }
}
const adminOnly = auth;
const ownerOnly = (req, res, next) => {
  if (req.admin?.role !== "owner") return res.status(403).json({ error: "Fitur ini hanya untuk owner." });
  next();
};

app.get("/api/public", (req, res) => {
  const branches = state.branches.filter(branch => branch.active !== false).map(branch => ({
    id: branch.id, name: branch.name, phone: branch.phone,
    stock: branch.stock, ready: totalStock(branch.stock)
  }));
  res.json({
    shopName: state.settings.shopName,
    branches,
    // Legacy fields are retained for older bot commands.
    stock: branches[0]?.stock || ZERO_STOCK(),
    menu: state.menu,
    ready: branches.reduce((sum, branch) => sum + branch.ready, 0),
    needsSetup: state.admins.length === 0
  });
});

app.post("/api/setup", async (req, res) => {
  if (state.admins.length) return res.status(403).json({ error: "Admin utama sudah dibuat." });
  const { username, password } = req.body || {};
  if (!username || !password || String(password).length < 8) {
    return res.status(400).json({ error: "Isi username dan password minimal 8 karakter." });
  }
  state.admins.push({
    id: crypto.randomUUID(), username: String(username).trim(),
    password: await bcrypt.hash(password, 12), role: "owner", branchId: null, phone: "",
    createdAt: new Date().toISOString()
  });
  await save();
  res.json({ ok: true });
});

app.post("/api/login", async (req, res) => {
  const admin = state.admins.find(item => item.username === String(req.body?.username || "").trim());
  if (!admin || !await bcrypt.compare(String(req.body?.password || ""), admin.password)) {
    return res.status(401).json({ error: "Username atau password salah." });
  }
  res.json({
    token: jwt.sign({ id: admin.id }, SECRET, { expiresIn: "12h" }),
    username: admin.username, role: admin.role, branchId: admin.branchId
  });
});

app.get("/api/admin/state", adminOnly, (req, res) => {
  const safeAdmins = state.admins.map(({ password, ...admin }) => admin);
  const visibleOrders = req.admin.role === "owner"
    ? state.orders
    : state.orders.filter(order => order.branchId === req.admin.branchId);
  const visibleLogs = req.admin.role === "owner"
    ? state.logs
    : state.logs.filter(log => log.branchId === req.admin.branchId);
  res.json({
    ...state,
    admins: req.admin.role === "owner" ? safeAdmins : safeAdmins.filter(a => a.branchId === req.admin.branchId || a.role === "owner"),
    orders: visibleOrders,
    logs: visibleLogs,
    currentAdmin: req.admin
  });
});

app.put("/api/admin/branches/:id/stock", adminOnly, async (req, res) => {
  const branch = state.branches.find(item => item.id === req.params.id);
  if (!branch) return res.status(404).json({ error: "Cabang tidak ditemukan." });
  if (req.admin.role !== "owner" && req.admin.branchId !== branch.id) {
    return res.status(403).json({ error: "Admin hanya boleh mengubah stok cabangnya sendiri." });
  }
  const before = { ...branch.stock };
  for (const key of STOCK_KEYS) {
    if (req.body?.[key] !== undefined) {
      const value = Number(req.body[key]);
      if (!Number.isInteger(value) || value < 0 || value > 100000) {
        return res.status(400).json({ error: "Stok harus bilangan bulat dari 0 sampai 100.000." });
      }
      branch.stock[key] = value;
    }
  }
  const changes = STOCK_KEYS.filter(key => before[key] !== branch.stock[key]).map(key => ({
    key, before: before[key], after: branch.stock[key], delta: branch.stock[key] - before[key]
  }));
  if (changes.length) {
    state.logs.unshift({
      id: crypto.randomUUID(), branchId: branch.id, branchName: branch.name,
      admin: req.admin.username, changes, createdAt: new Date().toISOString()
    });
    state.logs = state.logs.slice(0, 500);
    enqueue("stock_updated", {
      branchId: branch.id, branchName: branch.name, admin: req.admin.username,
      stock: branch.stock, changes, ready: totalStock(branch.stock),
      recipients: branchRecipients(branch),
      group: branch.whatsappGroup || state.settings.whatsappGroup || process.env.WHATSAPP_GROUP_ID || ""
    });
  }
  await save();
  res.json({ ok: true, branch });
});

app.post("/api/admin/branches", adminOnly, ownerOnly, async (req, res) => {
  const { name, phone = "", whatsappGroup = "" } = req.body || {};
  const cleanName = String(name || "").trim();
  if (!cleanName) return res.status(400).json({ error: "Nama cabang wajib diisi." });
  const id = slug(cleanName);
  if (state.branches.some(branch => branch.id === id || branch.name.toLowerCase() === cleanName.toLowerCase())) {
    return res.status(409).json({ error: "Nama cabang sudah digunakan." });
  }
  const branch = { id, name: cleanName, phone: cleanPhone(phone), whatsappGroup: String(whatsappGroup), stock: ZERO_STOCK(), active: true };
  state.branches.push(branch);
  await save();
  res.json({ ok: true, branch });
});

app.put("/api/admin/branches/:id", adminOnly, ownerOnly, async (req, res) => {
  const branch = state.branches.find(item => item.id === req.params.id);
  if (!branch) return res.status(404).json({ error: "Cabang tidak ditemukan." });
  if (req.body?.name !== undefined) {
    const name = String(req.body.name || "").trim();
    if (!name) return res.status(400).json({ error: "Nama cabang tidak boleh kosong." });
    branch.name = name;
  }
  if (req.body?.phone !== undefined) branch.phone = cleanPhone(req.body.phone);
  if (req.body?.whatsappGroup !== undefined) branch.whatsappGroup = String(req.body.whatsappGroup || "").trim();
  if (req.body?.active !== undefined) branch.active = Boolean(req.body.active);
  await save();
  res.json({ ok: true, branch });
});

app.delete("/api/admin/branches/:id", adminOnly, ownerOnly, async (req, res) => {
  if (state.branches.length <= 1) return res.status(400).json({ error: "Minimal harus ada satu cabang." });
  const branch = state.branches.find(item => item.id === req.params.id);
  if (!branch) return res.status(404).json({ error: "Cabang tidak ditemukan." });
  if (state.orders.some(order => order.branchId === branch.id) ||
      state.admins.some(admin => admin.branchId === branch.id)) {
    return res.status(409).json({ error: "Cabang masih memiliki pesanan atau admin. Pindahkan/hapus data terkait dahulu." });
  }
  state.branches = state.branches.filter(item => item.id !== branch.id);
  await save();
  res.json({ ok: true });
});

app.post("/api/admin/admins", adminOnly, ownerOnly, async (req, res) => {
  const { username, password, branchId, phone = "" } = req.body || {};
  const cleanUsername = String(username || "").trim();
  if (!cleanUsername || !password || String(password).length < 8) {
    return res.status(400).json({ error: "Username dan password minimal 8 karakter." });
  }
  if (state.admins.some(admin => admin.username.toLowerCase() === cleanUsername.toLowerCase())) {
    return res.status(409).json({ error: "Username sudah digunakan." });
  }
  const branch = state.branches.find(item => item.id === branchId);
  if (!branch) return res.status(400).json({ error: "Pilih cabang untuk admin tersebut." });
  state.admins.push({
    id: crypto.randomUUID(), username: cleanUsername, password: await bcrypt.hash(password, 12),
    role: "admin", branchId: branch.id, phone: cleanPhone(phone), createdAt: new Date().toISOString()
  });
  await save();
  res.json({ ok: true });
});

app.put("/api/admin/admins/:id", adminOnly, ownerOnly, async (req, res) => {
  const admin = state.admins.find(item => item.id === req.params.id);
  if (!admin) return res.status(404).json({ error: "Admin tidak ditemukan." });
  if (admin.role === "owner") return res.status(400).json({ error: "Akun owner utama tidak dapat diubah dari daftar admin." });
  if (req.body?.branchId !== undefined) {
    const branch = state.branches.find(item => item.id === req.body.branchId);
    if (!branch) return res.status(400).json({ error: "Pilih cabang yang valid." });
    admin.branchId = branch.id;
  }
  if (req.body?.phone !== undefined) admin.phone = cleanPhone(req.body.phone);
  await save();
  res.json({ ok: true });
});

app.delete("/api/admin/admins/:id", adminOnly, ownerOnly, async (req, res) => {
  if (req.params.id === req.admin.id) return res.status(400).json({ error: "Tidak dapat menghapus akun sendiri." });
  state.admins = state.admins.filter(admin => admin.id !== req.params.id);
  await save();
  res.json({ ok: true });
});

app.put("/api/admin/settings", adminOnly, ownerOnly, async (req, res) => {
  for (const key of ["ownerPhone", "whatsappGroup", "shopName"]) {
    if (req.body?.[key] !== undefined) state.settings[key] = String(req.body[key]).trim();
  }
  await save();
  res.json({ ok: true });
});

app.put("/api/admin/menu", adminOnly, ownerOnly, async (req, res) => {
  if (!Array.isArray(req.body?.menu)) return res.status(400).json({ error: "Format menu tidak valid." });
  state.menu = req.body.menu.map((item, index) => ({
    id: String(item.id || crypto.randomUUID()),
    name: String(item.name || `Menu ${index + 1}`),
    description: String(item.description || ""),
    price: Math.max(0, Number(item.price) || 0),
    image: String(item.image || "")
  }));
  await save();
  res.json({ ok: true });
});

function stockKeyForMenu(menu) {
  const key = String(menu.stockKey || menu.id || "").toLowerCase().replace(/[^a-z]/g, "");
  const map = {
    dada: "dada", sayap: "sayap", pahaatas: "pahaAtas", pahabawah: "pahaBawah"
  };
  return map[key] || null;
}

app.post("/api/orders", async (req, res) => {
  const { items = [], customerName = "", phone = "", address = "", note = "", branchId } = req.body || {};
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: "Pilih menu terlebih dahulu." });
  const branch = state.branches.find(item => item.id === branchId && item.active !== false)
    || (!branchId ? state.branches.find(item => item.active !== false) : null);
  if (!branch) return res.status(400).json({ error: "Pilih cabang yang masih aktif." });

  const normalized = [];
  for (const item of items) {
    const menu = state.menu.find(entry => entry.id === item.id);
    const qty = Number(item.qty);
    if (!menu || !Number.isInteger(qty) || qty < 1 || qty > 50) {
      return res.status(400).json({ error: "Item pesanan tidak valid." });
    }
    const stockKey = stockKeyForMenu(menu);
    if (stockKey && Number(branch.stock[stockKey] || 0) < qty) {
      return res.status(409).json({ error: `Stok ${menu.name} di ${branch.name} tidak mencukupi. Sisa ${branch.stock[stockKey] || 0} potong.` });
    }
    normalized.push({ id: menu.id, name: menu.name, price: menu.price, qty, stockKey });
  }

  for (const item of normalized) {
    if (item.stockKey) branch.stock[item.stockKey] = Math.max(0, Number(branch.stock[item.stockKey] || 0) - item.qty);
  }
  const order = {
    id: "SF-" + Date.now().toString().slice(-8),
    branchId: branch.id, branchName: branch.name,
    customerName: String(customerName || "Pelanggan"),
    phone: cleanPhone(phone), address: String(address), note: String(note),
    items: normalized.map(({ stockKey, ...item }) => item),
    total: normalized.reduce((sum, item) => sum + item.price * item.qty, 0),
    status: "Baru", createdAt: new Date().toISOString()
  };
  state.orders.unshift(order);
  state.logs.unshift({
    id: crypto.randomUUID(), branchId: branch.id, branchName: branch.name,
    admin: "Pesanan otomatis", changes: normalized.filter(item => item.stockKey).map(item => ({
      key: item.stockKey, before: Number(branch.stock[item.stockKey] || 0) + item.qty,
      after: Number(branch.stock[item.stockKey] || 0), delta: -item.qty
    })), createdAt: new Date().toISOString()
  });
  state.logs = state.logs.slice(0, 500);
  await save();

  const recipients = branchRecipients(branch);
  enqueue("new_order", {
    order, branchName: branch.name, recipients,
    group: branch.whatsappGroup || state.settings.whatsappGroup || process.env.WHATSAPP_GROUP_ID || ""
  });
  res.json({ ok: true, orderId: order.id, branchName: branch.name, branchPhone: branch.phone });
});

app.patch("/api/admin/orders/:id", adminOnly, async (req, res) => {
  const order = state.orders.find(item => item.id === req.params.id);
  if (!order) return res.status(404).json({ error: "Pesanan tidak ditemukan." });
  if (req.admin.role !== "owner" && req.admin.branchId !== order.branchId) {
    return res.status(403).json({ error: "Admin hanya boleh mengubah pesanan cabangnya sendiri." });
  }
  const allowed = ["Diproses", "Siap diambil", "Selesai", "Dibatalkan"];
  if (!allowed.includes(req.body?.status)) return res.status(400).json({ error: "Status tidak valid." });
  const previousStatus = order.status;
  const branch = state.branches.find(item => item.id === order.branchId);

  // Jika pesanan dibatalkan, kembalikan stok ke cabang yang menerima pesanan.
  if (branch && req.body.status === "Dibatalkan" && previousStatus !== "Dibatalkan" && !order.stockRestoredAt) {
    const changes = [];
    for (const item of order.items || []) {
      const menu = state.menu.find(entry => entry.id === item.id);
      const key = menu ? stockKeyForMenu(menu) : null;
      if (!key) continue;
      const before = Number(branch.stock[key] || 0);
      branch.stock[key] = before + Number(item.qty || 0);
      changes.push({ key, before, after: branch.stock[key], delta: Number(item.qty || 0) });
    }
    if (changes.length) {
      order.stockRestoredAt = new Date().toISOString();
      state.logs.unshift({
        id: crypto.randomUUID(), branchId: branch.id, branchName: branch.name,
        admin: `Pembatalan ${order.id}`, changes, createdAt: new Date().toISOString()
      });
      enqueue("stock_updated", {
        branchId: branch.id, branchName: branch.name, admin: `Pembatalan ${order.id}`,
        stock: branch.stock, changes, ready: totalStock(branch.stock),
        recipients: branchRecipients(branch),
        group: branch.whatsappGroup || state.settings.whatsappGroup || process.env.WHATSAPP_GROUP_ID || ""
      });
    }
  }
  order.status = req.body.status;
  await save();
  res.json({ ok: true });
});

// Bot bridge: event baru diambil dan baru dihapus setelah bot mengirim ACK.
app.get("/api/bot/config", requireBotKey, (req, res) => {
  res.json({ shopName: state.settings.shopName, branches: state.branches.filter(b => b.active !== false) });
});
app.get("/api/bot/queue", requireBotKey, (req, res) => {
  res.json(queue.slice(0, 20));
});
app.post("/api/bot/ack", requireBotKey, (req, res) => {
  const ids = new Set(Array.isArray(req.body?.ids) ? req.body.ids : []);
  queue = queue.filter(event => !ids.has(event.id));
  res.json({ ok: true });
});

app.get("/api/health", (req, res) => res.json({
  ok: true, service: "Silungkang FriedChicken",
  database: pool ? "postgres" : "json",
  branches: state.branches.length
}));

await load();
app.listen(PORT, "0.0.0.0", () => console.log(`[Silungkang] Dashboard berjalan di port ${PORT}`));
