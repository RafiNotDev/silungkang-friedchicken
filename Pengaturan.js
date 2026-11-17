import fs from 'fs';
import path from 'path';

const botId = process.env.BOT_ID || 'primary';
const dbPath = path.resolve('./Cache/Database/dashboard.json');
let record = {};
try {
  const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  record = db.bots?.[botId] || {};
} catch (error) {
  console.warn('[Rafibot] Pengaturan database belum tersedia, memakai nilai aman.', error.message);
}
const cfg = { prefix: '.', namabot: 'Silungkang FriedChicken', namaowner: process.env.OWNER_NAME || 'Silungkang', bot: process.env.BOT_PHONE || '', owner: process.env.OWNER_WHATSAPP || '',
  tampilan: '', sound: '', video: '', fotopp: '', idch: '', namach: '', linkch: '', linkgc: '', whatsappGroup: process.env.WHATSAPP_GROUP_ID || '',
  instagram: '', tiktok: '', website: '', ...(record.settings || {}) };

global.daerah = cfg.daerah || 'Jakarta';
global.owner = cfg.owner ? [[String(cfg.owner).replace(/\D/g, ''), cfg.namaowner, true]] : [];
global.setting = cfg;
// Credentials from the supplied legacy settings were embedded in source. They are intentionally
// blank here; rotate any previously exposed API/payment keys before configuring integrations.
global.nodev = process.env.DEVELOPER_NUMBER || ""
global.TokenVercel = '';
global.domain = '';
global.ptla = '';
global.ptlc = '';
global.linkgroup = '';
global.akhiran = '';
global.wm = `Dibuat Oleh: ${cfg.namaowner}`;
global.author = `${cfg.namaowner}`;
global.stickpack = 'Dibuat Oleh';
global.stickauth = `${cfg.namaowner}`;
global.payment = { qris: '', dana: '', ovo: '', gopay: '' };
global.pakasir = { project: '', apikey: '' };
