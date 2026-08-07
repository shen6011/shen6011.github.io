// 看板：打开即提醒（临期/过期）+ 概览 + 快捷导出
import { getAppSettings, navigate } from '../app.js';
import { getAllRecords } from '../db.js';
import { statusOf, STATUS_TEXT, daysLeft, escapeHtml } from '../util.js';
import { exportXlsx } from '../export.js';

function itemRow(r, settings) {
  const st = statusOf(r.expiryDate, settings);
  const dl = r.expiryDate ? daysLeft(r.expiryDate) : null;
  const dlText = dl == null ? '无日期' : (dl < 0 ? `已过期 ${-dl} 天` : `剩 ${dl} 天`);
  return `
    <div class="card item" data-id="${r.id}" style="cursor:pointer;margin-bottom:8px">
      <div class="thumb">📦</div>
      <div class="info">
        <div class="name">${escapeHtml(r.name)}</div>
        <div class="sub">${escapeHtml(r.spec || '')} · ${dlText} · 到期 ${escapeHtml(r.expiryDate || '-')}</div>
      </div>
      <span class="badge ${st}">${STATUS_TEXT[st]}</span>
    </div>`;
}

export async function renderDashboard(container) {
  const [records, settings] = await Promise.all([getAllRecords(), getAppSettings()]);
  const withExp = records.filter(r => r.expiryDate);
  const expired = withExp.filter(r => statusOf(r.expiryDate, settings) === 'expired');
  const urgent = withExp.filter(r => statusOf(r.expiryDate, settings) === 'urgent');
  const warning = withExp.filter(r => statusOf(r.expiryDate, settings) === 'warning');
  const ok = withExp.filter(r => statusOf(r.expiryDate, settings) === 'ok');
  const expiring = [...expired, ...urgent, ...warning].slice(0, 30);

  let banner = '';
  if (expired.length) banner = `<div class="alert-banner expired">⚠️ 有 ${expired.length} 件商品已过期，请尽快处理</div>`;
  else if (urgent.length) banner = `<div class="alert-banner urgent">🔥 有 ${urgent.length} 件商品即将到期（${settings.urgentDays} 天内）</div>`;

  container.innerHTML = `
    ${banner}
    <div class="stat-grid">
      <div class="stat"><div class="num">${records.length}</div><div class="lbl">总品项</div></div>
      <div class="stat"><div class="num" style="color:var(--danger)">${expired.length}</div><div class="lbl">已过期</div></div>
      <div class="stat"><div class="num" style="color:var(--urgent)">${urgent.length + warning.length}</div><div class="lbl">临期</div></div>
      <div class="stat"><div class="num" style="color:var(--ok)">${ok.length}</div><div class="lbl">正常</div></div>
    </div>

    <div class="row spread mt16">
      <strong>临期 / 过期（${expiring.length}）</strong>
      <button id="exp-xlsx" class="btn sm primary" style="width:auto;padding:7px 12px">导出临期清单</button>
    </div>
    <div id="exp-list" class="mt8">
      ${expiring.length ? expiring.map(r => itemRow(r, settings)).join('') : '<div class="empty"><div class="big">🎉</div>暂无临期商品，棒！</div>'}
    </div>
  `;

  container.querySelectorAll('.item[data-id]').forEach(el => {
    el.addEventListener('click', () => navigate('add', { id: el.dataset.id }));
  });
  container.querySelector('#exp-xlsx').addEventListener('click', () => {
    exportXlsx(records, settings, { onlyExpiring: true });
  });
}
