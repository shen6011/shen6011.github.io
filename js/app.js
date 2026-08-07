// 应用骨架：路由 / 底部导航 / 安装提示 / 主题 / 打开即提醒
import { renderDashboard } from './views/dashboard.js';
import { renderAdd } from './views/add.js';
import { renderList } from './views/list.js';
import { renderSettings } from './views/settings.js';
import { getSettings, setSetting, getAllRecords } from './db.js';
import { requestNotifyPermission, showExpiryNotification, registerPeriodic } from './notify.js';
import { todayYMD, toast } from './util.js';
import { stopActive } from './scan.js';

const routes = {
  dashboard: renderDashboard,
  add: renderAdd,
  list: renderList,
  settings: renderSettings
};
const titles = { dashboard: '看板', add: '录入商品', list: '商品清单', settings: '设置' };

let settingsCache = null;
export async function getAppSettings() {
  if (!settingsCache) settingsCache = await getSettings();
  return settingsCache;
}
export function setAppSettings(s) { settingsCache = { ...settingsCache, ...s }; }

export function navigate(route, params = {}) {
  const q = params.id ? '?id=' + params.id : '';
  location.hash = '#/' + route + q;
}
export function refresh() { route(); }

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'auto') {
    const mq = matchMedia('(prefers-color-scheme: light)');
    root.setAttribute('data-theme', mq.matches ? 'light' : 'dark');
  } else {
    root.setAttribute('data-theme', theme);
  }
}

export function route() {
  stopActive().catch(() => {});
  const hash = (location.hash || '').replace(/^#\//, '') || 'dashboard';
  const [routePart, query] = hash.split('?');
  const routeName = routes[routePart] ? routePart : 'dashboard';
  const params = {};
  if (query) {
    const id = new URLSearchParams(query).get('id');
    if (id) params.id = id;
  }
  document.getElementById('page-title').textContent = titles[routeName] || '保质期管家';
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.route === routeName));
  const container = document.getElementById('app');
  container.innerHTML = '';
  routes[routeName](container, params);
}

// 安装到桌面提示
let deferredPrompt = null;
export function setupInstall() {
  const btn = document.getElementById('install-btn');
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); deferredPrompt = e; if (btn) btn.hidden = false;
  });
  if (btn) btn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null; btn.hidden = true;
  });
  window.addEventListener('appinstalled', () => { if (btn) btn.hidden = true; });
}

async function maybeNotify(s) {
  if (!s.notifications) return;
  const granted = await requestNotifyPermission();
  if (!granted) return;
  const today = todayYMD();
  if (s.lastNotifyDate === today) return; // 每天最多一次
  const recs = await getAllRecords();
  showExpiryNotification(recs, s);
  await setSetting('lastNotifyDate', today);
}

export function onReady() {
  document.getElementById('bottom-nav').addEventListener('click', (e) => {
    const btn = e.target.closest('.nav-btn'); if (!btn) return;
    navigate(btn.dataset.route);
  });
  window.addEventListener('hashchange', route);
  route();

  getAppSettings().then(s => {
    applyTheme(s.theme);
    matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { if (s.theme === 'auto') applyTheme('auto'); });
    maybeNotify(s);
    if (s.notifications) registerPeriodic().catch(() => {});
  });
}
