// 清单：搜索 / 筛选 / 排序 / 编辑 / 删除 / 批量删除 / 导出
import { getAppSettings, navigate } from '../app.js';
import { getAllRecords, deleteRecord, bulkDelete } from '../db.js';
import { statusOf, STATUS_TEXT, daysLeft, escapeHtml, confirmDialog, toast } from '../util.js';
import { exportXlsx } from '../export.js';
import { startCameraScanner, scanImageFile, stopActive } from '../scan.js';

export async function renderList(container) {
  const [allRecords, settings] = await Promise.all([getAllRecords(), getAppSettings()]);
  let records = allRecords.slice();
  let search = '';
  let statusFilter = 'all';
  let sortBy = 'expiry';
  let selecting = false;
  const selected = new Set();

  container.innerHTML = `
    <div class="card">
      <input id="search" placeholder="🔍 搜索名称或条码" />
      <div class="seg mt8" id="filter-seg">
        <button type="button" data-f="all" class="active">全部</button>
        <button type="button" data-f="expired">已过期</button>
        <button type="button" data-f="expiring">临期</button>
        <button type="button" data-f="ok">正常</button>
      </div>
      <div class="row spread mt8">
        <label class="muted" style="display:flex;align-items:center;gap:6px">排序
          <select id="sort" style="width:auto">
            <option value="expiry" selected>按到期日</option>
            <option value="created">按录入时间</option>
            <option value="name">按名称</option>
          </select>
        </label>
        <div class="row" style="gap:8px">
          <button id="scan-find" class="btn sm primary" style="width:auto">📷 扫码查</button>
          <button id="export-all" class="btn sm ghost" style="width:auto">导出Excel</button>
          <button id="batch-toggle" class="btn sm ghost" style="width:auto">✓ 选择</button>
        </div>
      </div>
      <div id="scan-area" class="scan-overlay hide">
        <button id="scan-close" class="scan-close" type="button" aria-label="关闭">✕</button>
        <div class="scan-frame">
          <div id="scanner"></div>
          <span class="corner c-tl"></span><span class="corner c-tr"></span>
          <span class="corner c-bl"></span><span class="corner c-br"></span>
        </div>
        <p class="scan-hint">将条码对准取景框，自动按条码筛选</p>
        <label class="btn ghost scan-album" style="width:auto;display:inline-flex">🖼️ 从相册选择
          <input id="f-file" type="file" accept="image/*" hidden />
        </label>
      </div>
    </div>
    <div id="list"></div>
    <div id="batch-bar" class="card row spread hide">
      <span id="sel-count" class="muted">已选 0 项</span>
      <div class="row" style="gap:8px">
        <button id="batch-cancel" class="btn sm ghost" style="width:auto">取消</button>
        <button id="batch-del" class="btn sm danger" style="width:auto">删除选中</button>
      </div>
    </div>
  `;

  const $ = (id) => container.querySelector(id);
  const listEl = $('#list');

  function matchFilter(st) {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'expired') return st === 'expired';
    if (statusFilter === 'expiring') return st === 'urgent' || st === 'warning';
    if (statusFilter === 'ok') return st === 'ok';
    return true;
  }

  function renderItems() {
    const q = search.trim().toLowerCase();
    let list = records.filter(r => {
      const st = statusOf(r.expiryDate, settings);
      if (!matchFilter(st)) return false;
      if (q && !(r.name || '').toLowerCase().includes(q) && !(r.barcode || '').toLowerCase().includes(q)) return false;
      return true;
    });
    if (sortBy === 'expiry') list.sort((a, b) => (a.expiryDate || '9999').localeCompare(b.expiryDate || '9999'));
    else if (sortBy === 'created') list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    else list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    if (!list.length) { listEl.innerHTML = '<div class="empty"><div class="big">🗂️</div>没有匹配的商品</div>'; return; }

    listEl.innerHTML = list.map(r => {
      const st = statusOf(r.expiryDate, settings);
      const dl = r.expiryDate ? daysLeft(r.expiryDate) : null;
      const dlText = dl == null ? '无日期' : (dl < 0 ? `已过期 ${-dl} 天` : `剩 ${dl} 天`);
      const cb = selecting ? `<input class="sel-cb" type="checkbox" data-id="${r.id}" ${selected.has(r.id) ? 'checked' : ''} style="width:18px;height:18px;flex:0 0 auto" />` : '';
      return `
        <div class="card item" data-id="${r.id}" style="margin-bottom:8px;${selecting ? 'cursor:default' : 'cursor:pointer'}">
          ${cb}
          <div class="thumb">📦</div>
          <div class="info" data-edit="${r.id}">
            <div class="name">${escapeHtml(r.name)}</div>
            <div class="sub">${escapeHtml(r.spec || '')} · ${dlText} · 到期 ${escapeHtml(r.expiryDate || '-')}</div>
          </div>
          <span class="badge ${st}">${STATUS_TEXT[st]}</span>
          <button class="btn sm ghost del-btn" data-id="${r.id}" style="width:auto;padding:6px 9px">🗑️</button>
        </div>`;
    }).join('');

    listEl.querySelectorAll('[data-edit]').forEach(el => {
      el.addEventListener('click', () => { if (!selecting) navigate('add', { id: el.dataset.edit }); });
    });
    listEl.querySelectorAll('.del-btn').forEach(el => {
      el.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = el.dataset.id;
        if (!confirmDialog('确定删除该商品记录？')) return;
        await deleteRecord(id);
        records = records.filter(x => x.id !== id);
        selected.delete(id);
        toast('已删除');
        renderItems();
      });
    });
    listEl.querySelectorAll('.sel-cb').forEach(cb => {
      cb.addEventListener('change', () => {
        if (cb.checked) selected.add(cb.dataset.id); else selected.delete(cb.dataset.id);
        $('#sel-count').textContent = `已选 ${selected.size} 项`;
      });
    });
  }

  $('#search').addEventListener('input', (e) => { search = e.target.value; renderItems(); });
  $('#filter-seg').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-f]'); if (!b) return;
    statusFilter = b.dataset.f;
    container.querySelectorAll('#filter-seg button').forEach(x => x.classList.toggle('active', x === b));
    renderItems();
  });
  $('#sort').addEventListener('change', (e) => { sortBy = e.target.value; renderItems(); });
  $('#export-all').addEventListener('click', () => exportXlsx(records, settings, { onlyExpiring: false }));

  // 扫码快速查找：扫到条码即按条码筛选
  let scanCtl = null;
  const startScanFind = async () => {
    const area = $('#scan-area');
    area.classList.remove('hide');
    try {
      scanCtl = await startCameraScanner('scanner', async (code) => {
        await stopActive(); scanCtl = null; area.classList.add('hide');
        search = code;
        const sEl = $('#search'); if (sEl) sEl.value = code;
        renderItems();
        toast('已按条码筛选');
      });
    } catch (e) {
      area.classList.add('hide');
      toast('无法启动摄像头，请手动输入条码搜索');
    }
  };
  $('#scan-find').addEventListener('click', startScanFind);
  const closeScanFind = async () => {
    await stopActive(); scanCtl = null; $('#scan-area').classList.add('hide');
  };
  $('#scan-close').addEventListener('click', closeScanFind);
  $('#scan-area').addEventListener('click', async (e) => {
    if (e.target.id === 'scan-area') await closeScanFind();
  });
  $('#f-file').addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const code = await scanImageFile(file);
      search = code; const sEl = $('#search'); if (sEl) sEl.value = code; renderItems();
      toast('已按条码筛选');
    } catch (err) { toast('未识别到条码，请重试'); }
    e.target.value = '';
  });
  $('#batch-toggle').addEventListener('click', () => {
    selecting = !selecting;
    $('#batch-toggle').textContent = selecting ? '完成' : '✓ 选择';
    $('#batch-bar').classList.toggle('hide', !selecting);
    renderItems();
  });
  $('#batch-cancel').addEventListener('click', () => {
    selecting = false; selected.clear();
    $('#batch-toggle').textContent = '✓ 选择';
    $('#batch-bar').classList.add('hide');
    renderItems();
  });
  $('#batch-del').addEventListener('click', async () => {
    if (!selected.size) { toast('请先选择'); return; }
    if (!confirmDialog(`确定删除选中的 ${selected.size} 项？`)) return;
    await bulkDelete([...selected]);
    records = records.filter(x => !selected.has(x.id));
    selected.clear();
    selecting = false;
    $('#batch-toggle').textContent = '✓ 选择';
    $('#batch-bar').classList.add('hide');
    toast('已删除选中项');
    renderItems();
  });

  renderItems();
}
