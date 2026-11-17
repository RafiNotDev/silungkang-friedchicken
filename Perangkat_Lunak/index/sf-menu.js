const handler = async (m, { conn }) => {
  try {
    const base = (process.env.DASHBOARD_URL || `http://127.0.0.1:${process.env.PORT || 3000}`).replace(/\/$/, "");
    const response = await fetch(`${base}/api/public`);
    if (!response.ok) throw new Error("Dashboard tidak merespons.");
    const data = await response.json();
    const menu = (data.menu || []).map((item, index) =>
      `${index + 1}. *${item.name}* — Rp${Number(item.price || 0).toLocaleString("id-ID")}\n   ${item.description || ""}`
    ).join("\n\n");
    const branches = (data.branches || []).map(branch =>
      `📍 *${branch.name}* — stok ${branch.ready ?? 0} potong\n   Kode cabang: \`${branch.id}\``
    ).join("\n");
    const text = `🍗 *${data.shopName || "Silungkang FriedChicken"}*\n\nHalo! Ini menu kami:\n\n${menu || "Menu belum tersedia."}\n\n📍 *PILIH LOKASI PEMESANAN*\n${branches || "Lokasi belum tersedia."}\n\nKetik *.stok* untuk melihat stok setiap lokasi.\nUntuk pesan: *.pesan kodeCabang|nomorMenu|jumlah|nama|alamat*\nContoh: *.pesan sawahlunto|1|2|Rina|Jl. Melati No. 5*`;
    await conn.sendMessage(m.chat, { text }, { quoted: m });
  } catch (error) {
    await m.reply(`Maaf, menu belum bisa dimuat: ${error.message}`);
  }
};
handler.help = ["menu"];
handler.tags = ["silungkang"];
handler.command = /^(menu|daftarmenu)$/i;
export default handler;
