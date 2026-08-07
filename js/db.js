// 数据层：Dexie (IndexedDB)。所有数据仅存本机，离线可用。
const Dexie = window.Dexie;

export const db = new Dexie('expiryKeeper');
db.version(1).stores({
  // records: 商品记录；products: 商品库(扫码学习)；settings: 键值设置
  records: 'id, barcode, expiryDate, category, location, name, createdAt',
  products: 'barcode',
  settings: 'key'
});

const DEFAULT_SETTINGS = {
  warningDays: 30,
  urgentDays: 7,
  onlineLookup: false,
  useAldiLib: true,
  notifications: true,
  theme: 'dark'
};

export async function getSettings() {
  const rows = await db.settings.toArray();
  const map = {};
  rows.forEach(r => { map[r.key] = r.value; });
  return { ...DEFAULT_SETTINGS, ...map };
}
export async function setSetting(key, value) {
  await db.settings.put({ key, value });
}
export async function saveSettings(patch) {
  for (const [k, v] of Object.entries(patch)) {
    await db.settings.put({ key: k, value: v });
  }
}

// ---- 商品记录 CRUD ----
export async function getAllRecords() {
  const list = await db.records.toArray();
  list.sort((a, b) => (a.expiryDate || '9999').localeCompare(b.expiryDate || '9999'));
  return list;
}
export async function getRecord(id) { return db.records.get(id); }

export async function addRecord(data) {
  const now = Date.now();
  const rec = { ...data, createdAt: now, updatedAt: now };
  rec.id = data.id || (crypto.randomUUID ? crypto.randomUUID() : 'id-' + now + '-' + Math.random().toString(16).slice(2));
  await db.records.put(rec);
  return rec;
}
export async function updateRecord(id, patch) {
  const existing = await db.records.get(id);
  if (!existing) return null;
  const merged = { ...existing, ...patch, updatedAt: Date.now() };
  await db.records.put(merged);
  return merged;
}
export async function deleteRecord(id) { return db.records.delete(id); }
export async function bulkDelete(ids) { return db.records.bulkDelete(ids); }

// ---- 商品库（扫码自动学习） ----
export async function findProduct(barcode) {
  if (!barcode) return null;
  return db.products.get(barcode);
}
export async function learnProduct(barcode, data) {
  if (!barcode) return;
  const existing = await db.products.get(barcode);
  const now = Date.now();
  if (existing) {
    await db.products.update(barcode, {
      usageCount: (existing.usageCount || 0) + 1,
      updatedAt: now,
      name: data.name || existing.name,
      category: data.category || existing.category,
      spec: data.spec || existing.spec,
      defaultLocation: data.defaultLocation || existing.defaultLocation,
      defaultShelfLifeValue: data.defaultShelfLifeValue ?? existing.defaultShelfLifeValue,
      defaultShelfLifeUnit: data.defaultShelfLifeUnit || existing.defaultShelfLifeUnit
    });
  } else {
    await db.products.put({ barcode, ...data, usageCount: 1, updatedAt: now });
  }
}
export async function getAllProducts() { return db.products.toArray(); }

// 首次启动把内置「奥乐齐条码库」合并进本地商品库（一次即可，离线可用）
export async function seedAldiLibrary(force = false) {
  try {
    const seeded = await db.settings.get('aldiSeeded');
    if (!force && seeded && seeded.value) return 0;
    const res = await fetch('data/aldilib.json', { cache: 'no-cache' });
    if (!res.ok) return 0;
    const list = await res.json();
    if (!Array.isArray(list) || !list.length) return 0;
    const rows = list.map(x => ({
      barcode: String(x.barcode),
      name: x.name || '',
      spec: x.spec || '',
      brand: x.brand || '',
      source: 'aldi'
    }));
    await db.products.bulkPut(rows);
    await db.settings.put({ key: 'aldiSeeded', value: true });
    return rows.length;
  } catch (e) { console.warn('奥乐齐条码库加载失败', e); return 0; }
}

// 解析简易 CSV（支持引号包裹的字段，逗号分隔）
function parseCsvLib(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else {
      if (c === '"') q = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* skip */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// 导入外部条码库（CSV/JSON），合并进本地商品库
export async function importLibraryFromFile(file) {
  const text = await file.text();
  let raw;
  if (file.name.toLowerCase().endsWith('.csv')) {
    const rows = parseCsvLib(text);
    if (!rows.length) return 0;
    const header = rows[0].map(h => h.trim());
    const idx = {
      barcode: header.findIndex(h => /条码|barcode|code/i.test(h)),
      name: header.findIndex(h => /名称|name|商品/i.test(h)),
      spec: header.findIndex(h => /规格|spec|quantity/i.test(h)),
      brand: header.findIndex(h => /品牌|brand/i.test(h))
    };
    raw = rows.slice(1).map(r => ({
      barcode: r[idx.barcode] || '',
      name: r[idx.name] || '',
      spec: r[idx.spec] || '',
      brand: r[idx.brand] ? r[idx.brand] : ''
    }));
  } else {
    const data = JSON.parse(text);
    raw = Array.isArray(data) ? data : (data.products || []);
  }
  const out = raw.filter(r => r && String(r.barcode || '').trim())
    .map(r => ({
      barcode: String(r.barcode).trim(),
      name: (r.name || '').trim(),
      spec: (r.spec || '').trim(),
      brand: (r.brand || '').trim(),
      source: 'import'
    }));
  if (!out.length) return 0;
  await db.products.bulkPut(out);
  return out.length;
}

// 整库导出 / 导入（备份）
export async function exportAll() {
  const [records, products, settingsRows] = await Promise.all([
    db.records.toArray(), db.products.toArray(), db.settings.toArray()
  ]);
  return { app: 'expiryKeeper', version: 1, exportedAt: new Date().toISOString(), records, products, settings: settingsRows };
}
export async function importAll(data) {
  if (!data || data.app !== 'expiryKeeper') throw new Error('不是有效的备份文件');
  if (Array.isArray(data.records)) await db.records.bulkPut(data.records);
  if (Array.isArray(data.products)) await db.products.bulkPut(data.products);
  if (Array.isArray(data.settings)) await db.settings.bulkPut(data.settings);
}
