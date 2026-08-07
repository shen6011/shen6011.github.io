// 录入/编辑视图：扫码 + 表单 + 商品库自动带出
import { getAppSettings, navigate } from '../app.js';
import { addRecord, updateRecord, getRecord, findProduct, learnProduct } from '../db.js';
import { todayYMD, toast, confirmDialog, computeExpiry, daysLeft } from '../util.js';
import { startCameraScanner, scanImageFile, stopActive } from '../scan.js';
import { lookupBarcode } from '../barcodeLookup.js';

let scannerCtl = null;
const escAttr = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function applyBarcode(barcode, container, settings) {
  const bcEl = container.querySelector('#f-barcode');
  bcEl.value = barcode;
  const p = await findProduct(barcode);
  if (p) {
    container.querySelector('#f-name').value = p.name || '';
    container.querySelector('#f-spec').value = p.spec || '';
    if (p.defaultShelfLifeValue != null) container.querySelector('#f-shelf').value = p.defaultShelfLifeValue;
    if (p.defaultShelfLifeUnit) container.querySelector('#f-shelfunit').value = p.defaultShelfLifeUnit;
    toast('已自动带出商品信息');
    return;
  }
  if (settings.onlineLookup) {
    toast('在线查询中…');
    const r = await lookupBarcode(barcode);
    if (r && r.name) {
      container.querySelector('#f-name').value = r.name;
      await learnProduct(barcode, { name: r.name });
      toast('在线识别成功');
      return;
    }
  }
  toast('未匹配到商品库，请手动填写');
}

export async function renderAdd(container, params) {
  await stopActive();
  scannerCtl = null;
  const editing = params && params.id;
  let rec = null;
  if (editing) rec = await getRecord(params.id);

  const settings = await getAppSettings();
  const initialMode = (rec && rec.expiryDate && !rec.productionDate) ? 'expiry' : 'shelf';

  container.innerHTML = `
    <div class="card">
      <div class="row spread" style="margin-bottom:10px">
        <strong>${editing ? '编辑商品' : '录入商品'}</strong>
        <span class="muted">${editing ? '编号 ' + String(rec.id).slice(-4) : '扫码或手填'}</span>
      </div>

      <label class="field">
        <span>商品条码</span>
        <div class="row">
          <input id="f-barcode" inputmode="numeric" placeholder="扫码自动填入，也可手动输入" value="${rec ? escAttr(rec.barcode) : ''}" />
          <button id="scan-btn" class="btn sm primary" type="button" style="width:auto">📷 扫码</button>
        </div>
      </label>

      <div id="scan-area" class="scan-overlay hide">
        <button id="scan-close" class="scan-close" type="button" aria-label="关闭">✕</button>
        <div class="scan-frame">
          <div id="scanner"></div>
          <span class="corner c-tl"></span><span class="corner c-tr"></span>
          <span class="corner c-bl"></span><span class="corner c-br"></span>
        </div>
        <p class="scan-hint">将条码对准取景框，自动识别</p>
        <label class="btn ghost scan-album" style="width:auto;display:inline-flex">🖼️ 从相册选择
          <input id="f-file" type="file" accept="image/*" hidden />
        </label>
      </div>

      <label class="field">
        <span>商品名称 *</span>
        <input id="f-name" placeholder="如：纯牛奶" value="${rec ? (rec.name || '') : ''}" />
      </label>

      <label class="field">
        <span>规格</span>
        <input id="f-spec" placeholder="如 250ml" value="${rec ? escAttr(rec.spec) : ''}" />
      </label>

      <div class="grid2">
        <label class="field">
          <span>数量</span>
          <input id="f-qty" type="number" min="0" step="1" value="${rec && rec.quantity != null ? rec.quantity : 1}" />
        </label>
        <label class="field">
          <span>单位</span>
          <input id="f-unit" placeholder="盒/瓶/袋" value="${rec ? (rec.unit || '') : ''}" />
        </label>
      </div>

      <div class="field">
        <span>录入方式</span>
        <div class="seg" id="mode-seg">
          <button type="button" data-mode="shelf" class="${initialMode === 'shelf' ? 'active' : ''}">生产日期+保质期</button>
          <button type="button" data-mode="expiry" class="${initialMode === 'expiry' ? 'active' : ''}">直接填到期日</button>
        </div>
      </div>

      <div id="mode-shelf" class="${initialMode === 'shelf' ? '' : 'hide'}">
        <div class="grid2">
          <label class="field">
            <span>生产日期</span>
            <input id="f-prod" type="date" value="${rec ? escAttr(rec.productionDate) : ''}" />
          </label>
          <label class="field">
            <span>保质期</span>
            <div class="row">
              <input id="f-shelf" type="number" min="0" placeholder="如 180" value="${rec && rec.shelfLifeValue != null ? rec.shelfLifeValue : ''}" />
              <select id="f-shelfunit" style="width:auto">
                <option value="day" ${!rec || rec.shelfLifeUnit === 'day' ? 'selected' : ''}>天</option>
                <option value="month" ${rec && rec.shelfLifeUnit === 'month' ? 'selected' : ''}>个月</option>
                <option value="year" ${rec && rec.shelfLifeUnit === 'year' ? 'selected' : ''}>年</option>
              </select>
            </div>
          </label>
        </div>
      </div>

      <div id="mode-expiry" class="${initialMode === 'expiry' ? '' : 'hide'}">
        <label class="field">
          <span>到期日</span>
          <input id="f-expiry" type="date" value="${rec ? (rec.expiryDate || '') : ''}" />
        </label>
      </div>

      <div class="row" style="gap:10px">
        <button id="save-btn" class="btn primary" type="button">${editing ? '保存修改' : '保存'}</button>
        <button id="cancel-btn" class="btn ghost" type="button" style="width:auto">取消</button>
      </div>
    </div>
  `;

  const $ = (id) => container.querySelector(id);

  // 录入方式切换
  container.querySelector('#mode-seg').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-mode]'); if (!b) return;
    const mode = b.dataset.mode;
    container.querySelectorAll('#mode-seg button').forEach(x => x.classList.toggle('active', x === b));
    $('#mode-shelf').classList.toggle('hide', mode !== 'shelf');
    $('#mode-expiry').classList.toggle('hide', mode !== 'expiry');
  });

  // 扫码
  $('#scan-btn').addEventListener('click', async () => {
    const area = $('#scan-area');
    area.classList.remove('hide');
    try {
      scannerCtl = await startCameraScanner('scanner', async (code) => {
        await stopActive(); scannerCtl = null; area.classList.add('hide');
        await applyBarcode(code, container, settings);
      });
    } catch (e) {
      area.classList.add('hide');
      toast('无法启动摄像头，请手动输入或选相册');
    }
  });
  const closeScan = async () => {
    await stopActive(); scannerCtl = null; $('#scan-area').classList.add('hide');
  };
  $('#scan-close').addEventListener('click', closeScan);
  $('#scan-area').addEventListener('click', async (e) => {
    if (e.target.id === 'scan-area') await closeScan();
  });
  $('#f-file').addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const code = await scanImageFile(file);
      await applyBarcode(code, container, settings);
    } catch (err) {
      toast('未识别到条码，请重试');
    }
    e.target.value = '';
  });

  // 保存
  $('#save-btn').addEventListener('click', async () => {
    const name = $('#f-name').value.trim();
    if (!name) { toast('请填写商品名称'); $('#f-name').focus(); return; }

    const mode = container.querySelector('#mode-seg button.active').dataset.mode;
    let productionDate = '', shelfLifeValue = '', shelfLifeUnit = 'day', expiryDate = '';
    if (mode === 'shelf') {
      productionDate = $('#f-prod').value;
      shelfLifeValue = $('#f-shelf').value;
      shelfLifeUnit = $('#f-shelfunit').value;
      if (!productionDate && !shelfLifeValue) { toast('请填写生产日期或保质期'); return; }
    } else {
      expiryDate = $('#f-expiry').value;
      if (!expiryDate) { toast('请填写到期日'); return; }
    }

    const barcode = $('#f-barcode').value.trim();
    const data = {
      barcode,
      name,
      spec: $('#f-spec').value.trim(),
      quantity: Number($('#f-qty').value) || 1,
      unit: $('#f-unit').value.trim(),
      productionDate,
      shelfLifeValue,
      shelfLifeUnit,
      expiryDate
    };

    if (barcode) {
      await learnProduct(barcode, {
        name, spec: data.spec,
        defaultShelfLifeValue: shelfLifeValue, defaultShelfLifeUnit: shelfLifeUnit
      });
    }

    const saved = editing ? await updateRecord(rec.id, data) : await addRecord(data);
    const expiry = computeExpiry(data) || (saved && computeExpiry(saved));
    if (expiry) {
      const dl = daysLeft(expiry);
      const when = dl < 0 ? `已过期 ${-dl} 天` : (dl === 0 ? '今天到期' : `剩余 ${dl} 天`);
      toast(`已${editing ? '保存' : '添加'}：${name} · ${when}（到期 ${expiry}）`, 3200);
    } else {
      toast(`已${editing ? '保存' : '添加'}：${name}`);
    }

    await stopActive();
    navigate('dashboard');
  });

  $('#cancel-btn').addEventListener('click', async () => { await stopActive(); navigate('dashboard'); });
}
