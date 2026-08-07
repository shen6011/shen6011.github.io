// 导出：Excel (xlsx) 与 JSON 备份（均在本机生成，不外传）
import { daysLeft, statusOf, STATUS_TEXT, formatDateTime, todayYMD } from './util.js';
import { exportAll, importAll } from './db.js';

const XLSX = window.XLSX;
const UNIT_LABEL = { day: '天', month: '个月', year: '年' };

function buildRows(records, settings) {
  return records.map(r => {
    const exp = r.expiryDate;
    const dl = exp ? daysLeft(exp) : null;
    const st = statusOf(exp, settings);
    const shelf = (r.shelfLifeValue != null && r.shelfLifeValue !== '')
      ? `${r.shelfLifeValue}${UNIT_LABEL[r.shelfLifeUnit] || ''}` : '';
    return {
      '条码': r.barcode || '',
      '商品名称': r.name || '',
      '规格': r.spec || '',
      '数量': r.quantity ?? '',
      '单位': r.unit || '',
      '生产日期': r.productionDate || '',
      '保质期': shelf,
      '到期日': exp || '',
      '剩余天数': dl == null ? '' : dl,
      '状态': STATUS_TEXT[st],
      '录入时间': formatDateTime(r.createdAt)
    };
  });
}

export function exportXlsx(records, settings, { onlyExpiring = false } = {}) {
  let list = records;
  if (onlyExpiring) {
    list = records.filter(r => {
      const st = statusOf(r.expiryDate, settings);
      return st === 'expired' || st === 'urgent' || st === 'warning';
    });
  }
  const rows = buildRows(list, settings);
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '保质期清单');
  XLSX.writeFile(wb, `保质期清单_${todayYMD()}.xlsx`);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function exportJson() {
  const data = await exportAll();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `保质期备份_${todayYMD()}.json`);
}

export async function importJsonFile(file) {
  const text = await file.text();
  const data = JSON.parse(text);
  await importAll(data);
}
