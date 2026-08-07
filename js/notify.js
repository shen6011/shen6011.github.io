// 通知：打开即提醒 + 每日本地推送（Android 可靠；iOS 打开即提醒兜底）
import { statusOf } from './util.js';

export function notificationsSupported() { return 'Notification' in window; }

export async function requestNotifyPermission() {
  if (!notificationsSupported()) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    const r = await Notification.requestPermission();
    return r === 'granted';
  } catch (e) { return false; }
}

export function showExpiryNotification(records, settings) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  const expiring = records.filter(r => {
    const st = statusOf(r.expiryDate, settings);
    return st === 'expired' || st === 'urgent' || st === 'warning';
  });
  if (!expiring.length) return;
  const expiredN = expiring.filter(r => statusOf(r.expiryDate, settings) === 'expired').length;
  const soonN = expiring.length - expiredN;
  try {
    new Notification('保质期管家 · 每日提醒', {
      body: `过期 ${expiredN} 件，临期 ${soonN} 件，请及时整理`,
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png'
    });
  } catch (e) { /* 部分环境不支持前台 Notification */ }
}

export async function registerPeriodic() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    if ('periodicSync' in reg) {
      const status = await navigator.permissions.query({ name: 'periodic-background-sync' });
      if (status.state === 'granted') {
        await reg.periodicSync.register('expiry-daily', { minInterval: 24 * 60 * 60 * 1000 });
      }
    }
  } catch (e) { console.warn('periodic sync 注册失败', e); }
}
