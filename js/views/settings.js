// 设置：外观 / 预警阈值 / 在线查询 / 通知 / 导出与备份 / 清空
import { applyTheme, getAppSettings, setAppSettings, navigate } from '../app.js';
import { saveSettings, setSetting, db, getAllRecords, seedAldiLibrary, importLibraryFromFile, getAllProducts } from '../db.js';
import { exportXlsx } from '../export.js';
import { exportJson, importJsonFile } from '../export.js';
import { requestNotifyPermission, notificationsSupported } from '../notify.js';
import { toast, confirmDialog } from '../util.js';

function switchHtml(id, checked) {
  return `<label class="switch"><input type="checkbox" id="${id}" ${checked ? 'checked' : ''}/><span class="slider"></span></label>`;
}

export async function renderSettings(container) {
  const settings = await getAppSettings();

  container.innerHTML = `
    <div class="card">
      <strong>外观</strong>
      <label class="field mt12"><span>主题</span>
        <select id="theme">
          <option value="dark" ${settings.theme === 'dark' ? 'selected' : ''}>深色</option>
          <option value="light" ${settings.theme === 'light' ? 'selected' : ''}>浅色</option>
          <option value="auto" ${settings.theme === 'auto' ? 'selected' : ''}>跟随系统</option>
        </select>
      </label>
    </div>

    <div class="card">
      <strong>预警阈值</strong>
      <div class="grid2 mt12">
        <label class="field"><span>临期提醒（天内）</span>
          <input id="warningDays" type="number" min="1" value="${settings.warningDays}" /></label>
        <label class="field"><span>紧急提醒（天内）</span>
          <input id="urgentDays" type="number" min="1" value="${settings.urgentDays}" /></label>
      </div>
      <p class="muted">剩余天数 ≤ 紧急值显示“紧急”，≤ 临期值显示“临期”。</p>
    </div>

    <div class="card">
      <div class="row spread"><span>在线条码库（需联网）</span>${switchHtml('onlineLookup', settings.onlineLookup)}</div>
      <div class="row spread mt12"><span>每日到期通知</span>${switchHtml('notifications', settings.notifications && notificationsSupported())}</div>
      <p class="muted">${notificationsSupported() ? '开启后可在手机上接收每日临期提醒（Android 支持后台推送，iOS 打开即提醒）。' : '当前浏览器不支持系统通知，将以“打开即提醒”方式提示。'}</p>
    </div>

    <div class="card">
      <strong>商品条码库</strong>
      <div class="row spread mt12"><span>使用内置奥乐齐条码库</span>${switchHtml('useAldiLib', settings.useAldiLib)}</div>
      <p class="muted">内置约 100+ 条奥乐齐/ALDI 商品条码（来自公开商品库），扫码即可直接显示名称，离线可用。覆盖有限，扫到未收录的可手动补录，之后会自动记住。</p>
      <div class="row mt8" style="gap:8px;flex-wrap:wrap">
        <button id="lib-reload" class="btn sm ghost" style="width:auto">重新载入内置库</button>
        <label class="btn sm ghost" style="width:auto;display:inline-flex">导入条码库(CSV/JSON)
          <input id="lib-in" type="file" accept=".csv,application/json" hidden /></label>
        <button id="lib-count" class="btn sm ghost" style="width:auto">查看数量</button>
      </div>
      <p class="muted">导入格式：CSV 含表头「条码,商品名称,规格,品牌」或 JSON 数组，将合并进本地商品库。</p>
    </div>

    <div class="card">
      <strong>数据</strong>
      <div class="row mt12" style="gap:8px;flex-wrap:wrap">
        <button id="exp-all" class="btn sm ghost" style="width:auto">导出Excel(全部)</button>
        <button id="exp-exp" class="btn sm ghost" style="width:auto">导出Excel(临期)</button>
      </div>
      <div class="row mt8" style="gap:8px;flex-wrap:wrap">
        <button id="bk-up" class="btn sm ghost" style="width:auto">备份到JSON</button>
        <label class="btn sm ghost" style="width:auto;display:inline-flex">恢复JSON
          <input id="bk-in" type="file" accept="application/json" hidden /></label>
      </div>
      <p class="muted">所有数据仅存本机；Excel/JSON 导出文件也在本机生成，不会上传。</p>
    </div>

    <div class="card">
      <strong style="color:var(--danger)">危险操作</strong>
      <button id="clear-all" class="btn danger mt12" type="button">清空所有数据</button>
    </div>

    <p class="muted" style="text-align:center">保质期管家 · 本地化运行 · v1.2</p>
  `;

  const $ = (id) => container.querySelector(id);

  $('#theme').addEventListener('change', (e) => {
    const v = e.target.value;
    setSetting('theme', v);
    applyTheme(v);
    setAppSettings({ ...settings, theme: v });
  });

  const saveThresholds = async () => {
    const w = Math.max(1, Number($('#warningDays').value) || 30);
    const u = Math.max(1, Number($('#urgentDays').value) || 7);
    if (u > w) { toast('紧急天数应 ≤ 临期天数'); return; }
    await saveSettings({ warningDays: w, urgentDays: u });
    setAppSettings({ warningDays: w, urgentDays: u });
    toast('已保存阈值');
  };
  $('#warningDays').addEventListener('change', saveThresholds);
  $('#urgentDays').addEventListener('change', saveThresholds);

  $('#onlineLookup').addEventListener('change', async (e) => {
    await setSetting('onlineLookup', e.target.checked);
    setAppSettings({ onlineLookup: e.target.checked });
  });

  $('#useAldiLib').addEventListener('change', async (e) => {
    await setSetting('useAldiLib', e.target.checked);
    setAppSettings({ useAldiLib: e.target.checked });
    if (e.target.checked) {
      const n = await seedAldiLibrary(true);
      toast(n ? `已载入奥乐齐条码库 ${n} 条` : '奥乐齐条码库已是最新');
    }
  });
  $('#lib-reload').addEventListener('click', async () => {
    const n = await seedAldiLibrary(true);
    toast(n ? `已重新载入 ${n} 条` : '载入失败（文件缺失？）');
  });
  $('#lib-in').addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const n = await importLibraryFromFile(file);
      toast(n ? `已导入 ${n} 条到商品库` : '未解析到有效条码');
    } catch (err) { toast('导入失败：' + (err.message || err)); }
    e.target.value = '';
  });
  $('#lib-count').addEventListener('click', async () => {
    const n = (await getAllProducts()).length;
    toast(`本地商品库共 ${n} 条`);
  });

  $('#notifications').addEventListener('change', async (e) => {
    if (e.target.checked) {
      const ok = await requestNotifyPermission();
      if (!ok) { e.target.checked = false; toast('未获得通知权限'); return; }
    }
    await setSetting('notifications', e.target.checked);
    setAppSettings({ notifications: e.target.checked });
  });

  $('#exp-all').addEventListener('click', async () => {
    const recs = await getAllRecords();
    exportXlsx(recs, await getAppSettings(), { onlyExpiring: false });
  });
  $('#exp-exp').addEventListener('click', async () => {
    const recs = await getAllRecords();
    exportXlsx(recs, await getAppSettings(), { onlyExpiring: true });
  });
  $('#bk-up').addEventListener('click', () => exportJson());
  $('#bk-in').addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try { await importJsonFile(file); toast('恢复成功，即将刷新'); setTimeout(() => navigate('dashboard'), 800); }
    catch (err) { toast('恢复失败：' + err.message); }
    e.target.value = '';
  });

  $('#clear-all').addEventListener('click', async () => {
    if (!confirmDialog('将删除全部商品记录、商品库与设置，且不可恢复。确定清空？')) return;
    if (!confirmDialog('再次确认：真的要清空所有数据吗？')) return;
    await db.records.clear();
    await db.products.clear();
    await db.settings.clear();
    toast('已清空');
    navigate('dashboard');
  });
}
