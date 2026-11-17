const handler = async (m, { conn }) => {
  try {
    const base = (process.env.DASHBOARD_URL || `http://127.0.0.1:${process.env.PORT || 3000}`).replace(/\/$/, "");
    const response = await fetch(`${base}/api/public`);
    if (!response.ok) throw new Error("Dashboard tidak merespons.");
    const data = await response.json();
    const branches = (data.branches || []).map(branch => {
      const stock = branch.stock || {};
      const total = Object.values(stock).reduce((sum, value) => sum + Number(value || 0), 0);
      return `📍 *${branch.name}*\n🍗 Dada: *${stock.dada || 0}*\n🍖 Paha atas: *${stock.pahaAtas || 0}*\n🍗 Paha bawah: *${stock.pahaBawah || 0}*\n🍗 Sayap: *${stock.sayap || 0}*\n📦 Total: *${total} potong*`;
    }).join("\n\n");
    await conn.sendMessage(m.chat, {
      text: `🍗 *STOK LIVE — ${data.shopName || "Silungkang FriedChicken"}*\n\n${branches || "Belum ada cabang aktif."}\n\n_Stok setiap cabang berbeda dan diperbarui dari dashboard._`
    }, { quoted: m });
  } catch (error) {
    await m.reply(`Gagal mengambil stok: ${error.message}`);
  }
};
handler.help = ["stok"];
handler.tags = ["silungkang"];
handler.command = /^(stok|cekstok|stock)$/i;
export default handler;
