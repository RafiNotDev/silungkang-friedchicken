const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
let token = localStorage.getItem("sf_token") || "";
let cart = {};
let adminState = null;
let publicData = null;

const names = { dada: "Dada", pahaAtas: "Paha Atas", pahaBawah: "Paha Bawah", sayap: "Sayap" };
const icons = { dada: "🍗", pahaAtas: "🍖", pahaBawah: "🍗", sayap: "🍗" };
const rupiah = value => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value || 0);
const stockTotal = stock => Object.values(stock || {}).reduce((sum, value) => sum + Number(value || 0), 0);

function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("show");
  setTimeout(() => element.classList.remove("show"), 2800);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(data.error || "Permintaan gagal.");
  return data;
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
}

function updateClock() {
  const date = new Date();
  const hour = date.getHours(), minute = date.getMinutes(), second = date.getSeconds();
  $("#hour").style.transform = `translateX(-50%) rotate(${(hour % 12) * 30 + minute * .5}deg)`;
  $("#minute").style.transform = `translateX(-50%) rotate(${minute * 6 + second * .1}deg)`;
  $("#second").style.transform = `translateX(-50%) rotate(${second * 6}deg)`;
  $("#digital").textContent = date.toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour12: false });
  $("#date").textContent = date.toLocaleDateString("id-ID", {
    timeZone: "Asia/Jakarta", weekday: "long", day: "numeric", month: "long", year: "numeric"
  });
}
setInterval(updateClock, 1000);
updateClock();
$("#year").textContent = new Date().getFullYear();

function renderStock(branches = []) {
  const total = branches.reduce((sum, branch) => sum + stockTotal(branch.stock), 0);
  $("#readyTotal").innerHTML = `${total} <small>potong</small>`;
  $("#publicStock").innerHTML = branches.length ? branches.map(branch => `
    <article class="branch-stock-card">
      <div class="branch-stock-title"><span>📍</span><div><h3>${esc(branch.name)}</h3><small>${branch.ready ?? stockTotal(branch.stock)} potong tersedia</small></div></div>
      <div class="branch-stock-items">
        ${Object.entries(names).map(([key, label]) => `
          <div><span>${icons[key]} ${label}</span><b>${Number(branch.stock?.[key] || 0)}</b></div>
        `).join("")}
      </div>
    </article>
  `).join("") : '<p class="muted">Belum ada lokasi yang aktif.</p>';
}

function renderMenu(menu = []) {
  $("#menuGrid").innerHTML = menu.map(item => `
    <article class="menu-card">
      <div class="menu-image">${item.image ? `<img src="${esc(item.image)}" alt="${esc(item.name)}">` : "🍗"}</div>
      <div class="menu-info"><h3>${esc(item.name)}</h3><p>${esc(item.description)}</p>
        <div class="menu-bottom"><b>${rupiah(item.price)}</b><button class="add-btn" data-add="${esc(item.id)}">+ Tambah</button></div>
      </div>
    </article>
  `).join("");
}

function renderBranchOptions() {
  const options = (publicData?.branches || []).map(branch =>
    `<option value="${esc(branch.id)}">${esc(branch.name)} — ${branch.ready ?? stockTotal(branch.stock)} potong ready</option>`
  ).join("");
  const select = $("#orderBranch");
  const previous = select.value;
  select.innerHTML = `<option value="">Pilih lokasi pengambilan/pemesanan</option>${options}`;
  if (previous && (publicData.branches || []).some(branch => branch.id === previous)) select.value = previous;
  else if (publicData?.branches?.length === 1) select.value = publicData.branches[0].id;
}

async function refreshPublic() {
  try {
    publicData = await api("/api/public");
    renderStock(publicData.branches || []);
    renderMenu(publicData.menu || []);
    renderBranchOptions();
  } catch (error) {
    toast(error.message);
  }
}

function renderCart() {
  const rows = Object.entries(cart).filter(([, quantity]) => quantity > 0).map(([id, quantity]) => {
    const item = publicData?.menu?.find(entry => entry.id === id);
    return item ? { ...item, quantity } : null;
  }).filter(Boolean);
  $("#cartItems").innerHTML = rows.length ? rows.map(item => `
    <div class="cart-row"><span>${esc(item.name)} × ${item.quantity}</span>
      <span>${rupiah(item.price * item.quantity)} <button data-remove="${esc(item.id)}">×</button></span>
    </div>
  `).join("") : '<p class="muted">Belum ada menu dipilih.</p>';
  $("#cartTotal").textContent = rupiah(rows.reduce((sum, item) => sum + item.price * item.quantity, 0));
}

document.addEventListener("click", event => {
  const add = event.target.closest("[data-add]");
  if (add) {
    cart[add.dataset.add] = (cart[add.dataset.add] || 0) + 1;
    renderCart();
    toast("Menu ditambahkan.");
  }
  const remove = event.target.closest("[data-remove]");
  if (remove) {
    cart[remove.dataset.remove] = Math.max(0, (cart[remove.dataset.remove] || 0) - 1);
    renderCart();
  }
});

$("#orderJump").onclick = () => $("#order").scrollIntoView({ behavior: "smooth" });

$("#orderForm").onsubmit = async event => {
  event.preventDefault();
  const items = Object.entries(cart).filter(([, quantity]) => quantity > 0).map(([id, qty]) => ({ id, qty }));
  if (!items.length) return toast("Pilih menu terlebih dahulu.");
  const form = new FormData(event.target);
  if (!form.get("branchId")) return toast("Pilih lokasi Sawahlunto atau Sijunjung terlebih dahulu.");
  try {
    const result = await api("/api/orders", {
      method: "POST",
      body: JSON.stringify({
        branchId: form.get("branchId"),
        items,
        customerName: form.get("customerName"),
        phone: form.get("phone"),
        address: form.get("address"),
        note: form.get("note")
      })
    });
    cart = {};
    renderCart();
    event.target.reset();
    await refreshPublic();
    toast(`Pesanan ${result.orderId} masuk ke cabang ${result.branchName}.`);
    if (result.branchPhone) {
      const text = encodeURIComponent(`Halo ${result.branchName}, saya sudah mengirim pesanan ${result.orderId}. Mohon konfirmasi ya.`);
      window.open(`https://wa.me/${result.branchPhone}?text=${text}`, "_blank");
    }
  } catch (error) {
    toast(error.message);
  }
};

$("#adminOpen").onclick = () => {
  $("#adminModal").classList.remove("hidden");
  checkSetup();
};
$("#closeAdmin").onclick = () => $("#adminModal").classList.add("hidden");
$("#adminModal").onclick = event => {
  if (event.target.id === "adminModal") $("#adminModal").classList.add("hidden");
};

async function checkSetup() {
  try {
    adminState = await api("/api/admin/state");
    showAdmin();
  } catch {
    try {
      const data = await api("/api/public");
      if (data.needsSetup) {
        $("#loginTitle").innerHTML = "Buat akun <em>Owner.</em>";
        $("#loginDesc").textContent = "Ini pertama kali? Buat akun owner untuk mengamankan dashboard.";
        $("#setupForm").classList.remove("hidden");
        $("#loginForm").classList.add("hidden");
      } else {
        $("#loginTitle").innerHTML = "Admin <em>Silungkang.</em>";
        $("#loginDesc").textContent = "Masuk untuk mengelola stok dan pesanan cabang.";
      }
    } catch (error) {
      toast(error.message);
    }
  }
}

$("#setupForm").onsubmit = async event => {
  event.preventDefault();
  const form = new FormData(event.target);
  try {
    await api("/api/setup", {
      method: "POST",
      body: JSON.stringify({ username: form.get("username"), password: form.get("password") })
    });
    toast("Akun owner dibuat. Silakan login.");
    $("#setupForm").classList.add("hidden");
    $("#loginForm").classList.remove("hidden");
    $("#loginTitle").innerHTML = "Admin <em>Silungkang.</em>";
    $("#loginDesc").textContent = "Masuk dengan akun owner yang baru dibuat.";
  } catch (error) {
    toast(error.message);
  }
};

$("#loginForm").onsubmit = async event => {
  event.preventDefault();
  const form = new FormData(event.target);
  try {
    const result = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ username: form.get("username"), password: form.get("password") })
    });
    token = result.token;
    localStorage.setItem("sf_token", token);
    adminState = await api("/api/admin/state");
    showAdmin();
  } catch (error) {
    toast(error.message);
  }
};

function showAdmin() {
  $("#loginView").classList.add("hidden");
  $("#adminView").classList.remove("hidden");
  const isOwner = adminState.currentAdmin?.role === "owner";
  $("#adminIdentity").textContent = isOwner
    ? `Login sebagai owner · Memantau ${adminState.branches.length} cabang`
    : `Login sebagai admin · Cabang ${adminState.branches.find(branch => branch.id === adminState.currentAdmin.branchId)?.name || "-"}`;
  ["adminsTabButton", "branchesTabButton", "settingsTabButton"].forEach(id => {
    $("#" + id).classList.toggle("hidden", !isOwner);
  });
  renderAdmin();
}

function renderAdmin() {
  if (!adminState) return;
  const isOwner = adminState.currentAdmin?.role === "owner";
  $("#saveMenu").classList.toggle("hidden", !isOwner);
  const visibleBranches = isOwner
    ? adminState.branches
    : adminState.branches.filter(branch => branch.id === adminState.currentAdmin.branchId);

  $("#adminStock").innerHTML = visibleBranches.map(branch => `
    <section class="branch-admin-card">
      <div class="branch-stock-title"><span>📍</span><div><h3>${esc(branch.name)}</h3><small>Total ${stockTotal(branch.stock)} potong</small></div></div>
      <div class="admin-stock">
        ${Object.entries(names).map(([key, label]) => `
          <label>${label}<input type="number" min="0" max="100000" step="1"
            data-stock="${key}" data-branch="${esc(branch.id)}" value="${Number(branch.stock?.[key] || 0)}"></label>
        `).join("")}
      </div>
      <button class="btn btn-gold full" data-save-stock="${esc(branch.id)}">Simpan stok ${esc(branch.name)}</button>
    </section>
  `).join("") || '<p class="muted">Akun ini belum ditautkan ke cabang.</p>';

  $("#stockLogs").innerHTML = (adminState.logs || []).slice(0, 35).map(log => `
    <div class="log-item"><b>${esc(log.admin)}</b> · ${esc(log.branchName || "")}
      <small>${new Date(log.createdAt).toLocaleString("id-ID")} · ${(log.changes || []).map(change =>
        `${names[change.key] || change.key} ${change.delta > 0 ? "+" : ""}${change.delta} (${change.after})`
      ).join(" · ") || "Aktivitas stok"}</small>
    </div>
  `).join("") || '<p class="muted">Belum ada aktivitas stok.</p>';

  $("#ordersList").innerHTML = (adminState.orders || []).map(order => `
    <div class="order-item">
      <b>${esc(order.id)} · ${esc(order.customerName)}</b>
      <span class="order-branch">${esc(order.branchName || "")}</span>
      <small>${new Date(order.createdAt).toLocaleString("id-ID")} · ${esc(order.phone)} · ${rupiah(order.total)}</small>
      <p>${(order.items || []).map(item => `${esc(item.name)} × ${item.qty}`).join(", ")}</p>
      <small>${esc(order.address)} ${order.note ? "· " + esc(order.note) : ""}</small>
      <select data-order="${esc(order.id)}">${["Baru", "Diproses", "Siap diambil", "Selesai", "Dibatalkan"].map(status =>
        `<option ${order.status === status ? "selected" : ""}>${status}</option>`
      ).join("")}</select>
    </div>
  `).join("") || '<p class="muted">Belum ada pesanan masuk di cabang ini.</p>';

  $("#menuEditor").innerHTML = (adminState.menu || []).map((item, index) => `
    <div class="menu-edit-row"><b>Menu ${index + 1}</b>
      <label>Nama<input data-menu-name="${index}" value="${esc(item.name)}"></label>
      <label>Deskripsi<input data-menu-desc="${index}" value="${esc(item.description)}"></label>
      <label>Harga (Rp)<input type="number" min="0" data-menu-price="${index}" value="${Number(item.price) || 0}"></label>
      <label>URL foto<input data-menu-image="${index}" value="${esc(item.image || "")}" placeholder="https://..."></label>
    </div>
  `).join("") + (isOwner ? '<button type="button" class="btn btn-outline" id="addMenuRow">+ Tambah menu</button>' : "");

  const adminBranchSelect = $("#adminBranch");
  adminBranchSelect.innerHTML = `<option value="">Pilih cabang admin</option>` +
    adminState.branches.map(branch => `<option value="${esc(branch.id)}">${esc(branch.name)}</option>`).join("");

  $("#adminsList").innerHTML = (adminState.admins || []).map(admin => {
    const branch = adminState.branches.find(item => item.id === admin.branchId);
    if (admin.role === "owner") {
      return `<div class="admin-item"><span><b>${esc(admin.username)}</b><small>· Owner · Semua cabang</small></span></div>`;
    }
    return `<div class="admin-managed-card">
      <div><b>${esc(admin.username)}</b><small>Admin cabang</small></div>
      <label>Cabang<select data-admin-branch="${esc(admin.id)}">${adminState.branches.map(item =>
        `<option value="${esc(item.id)}" ${item.id === admin.branchId ? "selected" : ""}>${esc(item.name)}</option>`
      ).join("")}</select></label>
      <label>Nomor WhatsApp admin<input data-admin-phone="${esc(admin.id)}" value="${esc(admin.phone || "")}" inputmode="tel" placeholder="62812xxxx"></label>
      <div class="branch-edit-actions"><button class="btn btn-gold" data-save-admin="${esc(admin.id)}">Simpan admin</button><button data-del-admin="${esc(admin.id)}">Hapus</button></div>
    </div>`;
  }).join("") || '<p class="muted">Belum ada admin cabang.</p>';

  $("#branchEditor").innerHTML = adminState.branches.map(branch => `
    <div class="branch-edit-card">
      <label>Nama cabang<input data-branch-name="${esc(branch.id)}" value="${esc(branch.name)}"></label>
      <label>Nomor WhatsApp cabang<input data-branch-phone="${esc(branch.id)}" inputmode="tel" value="${esc(branch.phone || "")}" placeholder="62812xxxx"></label>
      <label>ID grup WhatsApp<input data-branch-group="${esc(branch.id)}" value="${esc(branch.whatsappGroup || "")}" placeholder="Opsional"></label>
      <label class="check-label"><input type="checkbox" data-branch-active="${esc(branch.id)}" ${branch.active !== false ? "checked" : ""}> Cabang aktif</label>
      <div class="branch-edit-actions"><button class="btn btn-gold" data-save-branch="${esc(branch.id)}">Simpan lokasi</button>
        <button class="btn btn-outline" data-delete-branch="${esc(branch.id)}">Hapus cabang</button></div>
    </div>
  `).join("");

  const settingsForm = $("#settingsForm");
  settingsForm.shopName.value = adminState.settings.shopName || "";
  settingsForm.ownerPhone.value = adminState.settings.ownerPhone || "";
  settingsForm.whatsappGroup.value = adminState.settings.whatsappGroup || "";
}

async function reloadAdmin() {
  adminState = await api("/api/admin/state");
  renderAdmin();
  await refreshPublic();
}

document.addEventListener("click", async event => {
  const saveStock = event.target.closest("[data-save-stock]");
  if (saveStock) {
    const branchId = saveStock.dataset.saveStock;
    const body = {};
    $$(`[data-stock][data-branch="${CSS.escape(branchId)}"]`).forEach(input => body[input.dataset.stock] = Number(input.value));
    try {
      await api(`/api/admin/branches/${encodeURIComponent(branchId)}/stock`, {
        method: "PUT", body: JSON.stringify(body)
      });
      toast("Stok cabang berhasil diperbarui.");
      await reloadAdmin();
    } catch (error) {
      toast(error.message);
    }
  }

  const saveAdmin = event.target.closest("[data-save-admin]");
  if (saveAdmin) {
    const id = saveAdmin.dataset.saveAdmin;
    const body = {
      branchId: $(`[data-admin-branch="${CSS.escape(id)}"]`).value,
      phone: $(`[data-admin-phone="${CSS.escape(id)}"]`).value
    };
    try {
      await api("/api/admin/admins/" + encodeURIComponent(id), { method: "PUT", body: JSON.stringify(body) });
      toast("Penempatan admin diperbarui.");
      await reloadAdmin();
    } catch (error) {
      toast(error.message);
    }
  }

  const deleteAdmin = event.target.closest("[data-del-admin]");
  if (deleteAdmin && confirm("Hapus admin ini?")) {
    try {
      await api("/api/admin/admins/" + encodeURIComponent(deleteAdmin.dataset.delAdmin), { method: "DELETE" });
      toast("Admin dihapus.");
      await reloadAdmin();
    } catch (error) {
      toast(error.message);
    }
  }

  const saveBranch = event.target.closest("[data-save-branch]");
  if (saveBranch) {
    const id = saveBranch.dataset.saveBranch;
    const body = {
      name: $(`[data-branch-name="${CSS.escape(id)}"]`).value,
      phone: $(`[data-branch-phone="${CSS.escape(id)}"]`).value,
      whatsappGroup: $(`[data-branch-group="${CSS.escape(id)}"]`).value,
      active: $(`[data-branch-active="${CSS.escape(id)}"]`).checked
    };
    try {
      await api("/api/admin/branches/" + encodeURIComponent(id), { method: "PUT", body: JSON.stringify(body) });
      toast("Data lokasi diperbarui.");
      await reloadAdmin();
    } catch (error) {
      toast(error.message);
    }
  }

  const deleteBranch = event.target.closest("[data-delete-branch]");
  if (deleteBranch && confirm("Hapus cabang ini? Cabang yang masih memiliki admin atau pesanan tidak dapat dihapus.")) {
    try {
      await api("/api/admin/branches/" + encodeURIComponent(deleteBranch.dataset.deleteBranch), { method: "DELETE" });
      toast("Cabang dihapus.");
      await reloadAdmin();
    } catch (error) {
      toast(error.message);
    }
  }

  if (event.target.id === "addMenuRow") {
    adminState.menu.push({ id: "menu-" + Date.now(), name: "Menu baru", description: "", price: 0, image: "" });
    renderAdmin();
  }
});

$$(".tab").forEach(tab => tab.onclick = () => {
  $$(".tab").forEach(item => item.classList.toggle("active", item === tab));
  $$(".tab-content").forEach(content => content.classList.toggle("hidden", content.id !== tab.dataset.tab));
});

$("#addAdmin").onsubmit = async event => {
  event.preventDefault();
  const form = new FormData(event.target);
  try {
    await api("/api/admin/admins", {
      method: "POST",
      body: JSON.stringify({
        username: form.get("username"), password: form.get("password"),
        branchId: form.get("branchId"), phone: form.get("phone")
      })
    });
    event.target.reset();
    toast("Admin cabang berhasil ditambahkan.");
    await reloadAdmin();
  } catch (error) {
    toast(error.message);
  }
};

$("#addBranch").onsubmit = async event => {
  event.preventDefault();
  const form = new FormData(event.target);
  try {
    await api("/api/admin/branches", {
      method: "POST",
      body: JSON.stringify({
        name: form.get("name"), phone: form.get("phone"), whatsappGroup: form.get("whatsappGroup")
      })
    });
    event.target.reset();
    toast("Cabang baru berhasil ditambahkan.");
    await reloadAdmin();
  } catch (error) {
    toast(error.message);
  }
};

document.addEventListener("change", async event => {
  if (event.target.matches("[data-order]")) {
    try {
      await api("/api/admin/orders/" + encodeURIComponent(event.target.dataset.order), {
        method: "PATCH", body: JSON.stringify({ status: event.target.value })
      });
      toast("Status pesanan diperbarui.");
      await reloadAdmin();
    } catch (error) {
      toast(error.message);
    }
  }
});

$("#saveMenu").onclick = async () => {
  if (adminState.currentAdmin?.role !== "owner") return toast("Hanya owner yang dapat mengubah menu.");
  const menu = adminState.menu.map((item, index) => ({
    id: item.id,
    name: $(`[data-menu-name="${index}"]`).value,
    description: $(`[data-menu-desc="${index}"]`).value,
    price: Number($(`[data-menu-price="${index}"]`).value),
    image: $(`[data-menu-image="${index}"]`).value
  }));
  try {
    await api("/api/admin/menu", { method: "PUT", body: JSON.stringify({ menu }) });
    toast("Menu berhasil disimpan.");
    await reloadAdmin();
  } catch (error) {
    toast(error.message);
  }
};

$("#settingsForm").onsubmit = async event => {
  event.preventDefault();
  const form = new FormData(event.target);
  try {
    await api("/api/admin/settings", {
      method: "PUT",
      body: JSON.stringify({
        shopName: form.get("shopName"),
        ownerPhone: form.get("ownerPhone"),
        whatsappGroup: form.get("whatsappGroup")
      })
    });
    toast("Pengaturan disimpan.");
    await reloadAdmin();
  } catch (error) {
    toast(error.message);
  }
};

$("#logout").onclick = () => {
  token = "";
  adminState = null;
  localStorage.removeItem("sf_token");
  $("#adminView").classList.add("hidden");
  $("#loginView").classList.remove("hidden");
  toast("Berhasil keluar.");
};

refreshPublic();
setInterval(refreshPublic, 15000);
setInterval(() => {
  if (token && adminState) reloadAdmin().catch(() => {});
}, 20000);
