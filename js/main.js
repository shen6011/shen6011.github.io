// 启动入口
import { db, seedAldiLibrary } from './db.js';
import { setupInstall, onReady } from './app.js';

async function boot() {
  try { await db.open(); } catch (e) { console.error('数据库打开失败', e); }
  // 首次启动把内置奥乐齐条码库合并进本地商品库（离线可用）
  seedAldiLibrary().catch(() => {});
  setupInstall();
  onReady();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW 注册失败', e));
  }
}
boot();
