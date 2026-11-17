const handler = async (m, { conn, text }) => {
  if (!text) return m.reply(
    "Format: *.pesan kodeCabang|nomorMenu|jumlah|nama|alamat*\n" +
    "Contoh: *.pesan sawahlunto|1|2|Rina|Jl. Melati No. 5*\n\n" +
    "Ketik *.menu* untuk melihat kode cabang dan daftar menu."
  );

  const parts = text.split("|").map(value => value.trim());
  if (parts.length < 5) return m.reply("Format belum lengkap. Contoh: *.pesan sijunjung|1|2|Rina|Jl. Melati No. 5*");

  const [branchInput, indexRaw, qtyRaw, nameRaw, ...addressParts] = parts;
  const addressRaw = addressParts.join("|").trim();
  const index = Number(indexRaw), qty = Number(qtyRaw);
  if (!Number.isInteger(index) || !Number.isInteger(qty) || qty < 1 || qty > 50 || !nameRaw || !addressRaw) {
    return m.reply("Format belum benar. Contoh: *.pesan sawahlunto|1|2|Rina|Jl. Melati No. 5*");
  }

  try {
    const base = (process.env.DASHBOARD_URL || `http://127.0.0.1:${process.env.PORT || 3000}`).replace(/\/$/, "");
    const publicResponse = await fetch(`${base}/api/public`);
    if (!publicResponse.ok) throw new Error("Dashboard tidak merespons.");
    const publicData = await publicResponse.json();
    const branchKey = branchInput.toLowerCase().replace(/\s+/g, "-");
    const branch = (publicData.branches || []).find(item =>
      item.id.toLowerCase() === branchKey || item.name.toLowerCase() === branchInput.toLowerCase()
    );
    if (!branch) {
      const available = (publicData.branches || []).map(item => `${item.name} (\`${item.id}\`)`).join(", ");
      return m.reply(`Lokasi tidak ditemukan. Pilih salah satu: ${available || "belum ada cabang aktif"}.`);
    }

    const menu = (publicData.menu || [])[index - 1];
    if (!menu) return m.reply("Nomor menu tidak ditemukan. Ketik *.menu* untuk melihat daftar.");
    const senderJid = conn.getJid?.(m.sender) || m.sender || "";
    const senderPhone = String(senderJid).endsWith("@s.whatsapp.net") ? String(senderJid).split("@")[0] : "";

    const response = await fetch(`${base}/api/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        branchId: branch.id,
        items: [{ id: menu.id, qty }],
        customerName: nameRaw,
        phone: senderPhone,
        address: addressRaw,
        note: "Pesanan dibuat melalui WhatsApp"
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Pesanan gagal disimpan.");

    await conn.sendMessage(m.chat, {
      text: `✅ *PESANAN BERHASIL DICATAT!*\n\nID: *${result.orderId}*\nLokasi: *${branch.name}*\nMenu: ${menu.name} × ${qty}\nTotal: *Rp${(menu.price * qty).toLocaleString("id-ID")}*\n\nPesanan sudah diteruskan ke admin *${branch.name}*. Admin cabang akan segera menghubungi kamu.`
    }, { quoted: m });
  } catch (error) {
    await m.reply(`Maaf, pesanan belum berhasil: ${error.message}`);
  }
};
handler.help = ["pesan <kodeCabang>|<nomorMenu>|<jumlah>|<nama>|<alamat>"];
handler.tags = ["silungkang"];
handler.command = /^(pesan|order)$/i;
export default handler;
