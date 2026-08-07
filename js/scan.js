// 扫码封装：摄像头实时扫码 + 相册图片扫码，基于 html5-qrcode（已本地化）
const Html5Qrcode = window.Html5Qrcode;
let active = null;

function ensureHidden(id) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    el.style.display = 'none';
    document.body.appendChild(el);
  }
  return id;
}

export async function startCameraScanner(containerId, onResult) {
  await stopActive();
  const html5Qr = new Html5Qrcode(containerId);
  active = html5Qr;
  // 仅扫描常见商品条码格式，缩小识别范围以显著提升速度
  const F = window.Html5QrcodeSupportedFormats;
  const formats = F ? [
    F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39
  ] : undefined;
  const config = {
    fps: 25,
    qrbox: { width: 260, height: 160 },
    aspectRatio: 1.777,
    disableFlip: false,
    useBarCodeDetectorIfSupported: true, // 优先使用系统原生条码识别（更快）
    videoConstraints: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
  };
  if (formats) config.formatsToSupport = formats;
  try {
    await html5Qr.start({ facingMode: 'environment' }, config,
      (decodedText) => { onResult(decodedText); },
      () => { /* 忽略逐帧失败 */ });
    return { stop: stopActive };
  } catch (e) {
    active = null;
    throw e;
  }
}

export async function scanImageFile(file) {
  const id = ensureHidden('__scanfile__');
  const html5Qr = new Html5Qrcode(id);
  const result = await html5Qr.scanFile(file, false);
  return result;
}

export async function stopActive() {
  if (active && active.isScanning) {
    try { await active.stop(); } catch (e) { /* noop */ }
  }
  active = null;
}
