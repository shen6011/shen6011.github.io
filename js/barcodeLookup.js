// 可选在线条码查询（Open Food Facts）。需联网，默认关闭；结果仅在本地使用。
export async function lookupBarcode(barcode) {
  if (!barcode) return null;
  const url = `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(barcode)}.json`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 1) return null;
    const p = data.product || {};
    const name = p.product_name_zh || p.product_name || p.product_name_en || '';
    const brand = p.brands ? p.brands.split(',')[0].trim() : '';
    return { name: brand ? `${brand} ${name}`.trim() : name };
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
