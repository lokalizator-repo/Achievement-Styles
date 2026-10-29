export interface ToastMonitor {
  m_usable: { m_nLeft: number; m_nTop: number; m_nWidth: number; m_nHeight: number };
  m_full?: { m_nHeight: number; m_nLeft?: number; m_nTop?: number; m_nWidth?: number };
}

let desktopHeight = 0;
const monitors = new Map<number, ToastMonitor>();
const popupScales = new Map<string, number>();

export function setDesktopHeight(height: number) {
  if (Number.isFinite(height) && height > 0) desktopHeight = height;
}

export function setOverlayMonitor(appid: number, monitor: ToastMonitor) {
  if (monitor?.m_usable) monitors.set(appid, monitor);
}

export function overlayScale(appid: number) {
  const height = monitors.get(appid)?.m_full?.m_nHeight;
  if (!appid || !height || !desktopHeight) return 1;
  return Math.min(3, Math.max(0.25, height / desktopHeight));
}

export function ps4Scale(appid: number) {
  return (monitors.get(appid)?.m_full?.m_nHeight || desktopHeight || 1080) / 1080;
}

export function rememberPopupScale(key: string | undefined, scale: number) {
  if (!key) return;
  popupScales.set(key, scale);
  if (popupScales.size > 256) popupScales.delete(popupScales.keys().next().value!);
}

export function popupScale(key: string | undefined) {
  return key ? popupScales.get(key) ?? 1 : 1;
}

export function startMonitorScale() {
  let active = true;
  void window.SteamClient?.Window?.GetDefaultMonitorDimensions?.().then(monitor => {
    if (active) setDesktopHeight(monitor.nFullHeight / monitor.flVerticalScale);
  }).catch(() => {});
  return () => {
    active = false;
    desktopHeight = 0;
    monitors.clear();
    popupScales.clear();
  };
}
