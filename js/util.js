// 通用工具：日期计算、状态判定、DOM 辅助
export function parseYMD(s) {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function fmtYMD(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
export function todayYMD() { return fmtYMD(new Date()); }

export function addDaysYMD(s, n) {
  const dt = parseYMD(s);
  if (!dt) return null;
  dt.setDate(dt.getDate() + n);
  return fmtYMD(dt);
}
export function diffDays(aYMD, bYMD) {
  const a = parseYMD(aYMD), b = parseYMD(bYMD);
  if (!a || !b) return null;
  return Math.round((b - a) / 86400000);
}
export function daysLeft(expiryYMD) { return diffDays(todayYMD(), expiryYMD); }

function addMonthsYMD(s, months) {
  const d = parseYMD(s); if (!d) return null;
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return fmtYMD(d);
}

export function computeExpiry(rec) {
  if (rec.expiryDate) return rec.expiryDate;
  if (rec.productionDate && rec.shelfLifeValue != null && rec.shelfLifeValue !== '') {
    const v = Number(rec.shelfLifeValue);
    const u = rec.shelfLifeUnit || 'day';
    if (u === 'day') return addDaysYMD(rec.productionDate, v);
    if (u === 'month') return addMonthsYMD(rec.productionDate, v);
    if (u === 'year') return addMonthsYMD(rec.productionDate, v * 12);
  }
  return null;
}

export function statusOf(expiryYMD, settings) {
  if (!expiryYMD) return 'unknown';
  const d = daysLeft(expiryYMD);
  if (d < 0) return 'expired';
  if (d <= (settings.urgentDays ?? 7)) return 'urgent';
  if (d <= (settings.warningDays ?? 30)) return 'warning';
  return 'ok';
}

export const STATUS_TEXT = {
  expired: '已过期', urgent: '紧急', warning: '临期', ok: '正常', unknown: '未设日期'
};

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function formatDateTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// 轻量 toast
let toastTimer = null;
export function toast(msg, ms = 1800) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

// 确认对话框（用原生 confirm 以保证可靠）
export function confirmDialog(msg) { return window.confirm(msg); }
