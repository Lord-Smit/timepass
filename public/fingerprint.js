async function getFingerprint() {
  const fp = {};

  fp.screen = `${screen.width}x${screen.height}x${screen.colorDepth}`;
  fp.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  fp.language = navigator.language;
  fp.languages = navigator.languages?.join(',') || '';
  fp.cores = navigator.hardwareConcurrency || 'unknown';
  fp.platform = navigator.platform || '';
  fp.cookiesEnabled = navigator.cookieEnabled;
  fp.doNotTrack = navigator.doNotTrack || 'unspecified';
  fp.online = navigator.onLine;
  fp.touchPoints = navigator.maxTouchPoints || 0;

  try {
    if (navigator.mediaDevices?.enumerateDevices) {
      const devices = await navigator.mediaDevices.enumerateDevices();
      fp.devices = devices.map(d => d.kind).join(',');
    }
  } catch {}

  if (navigator.connection) {
    fp.connectionType = navigator.connection.effectiveType || '';
    fp.downlink = navigator.connection.downlink || '';
  }

  try {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#f60';
    ctx.fillRect(0, 0, 100, 50);
    ctx.fillStyle = '#069';
    ctx.font = '14px Arial';
    ctx.fillText('PhishingDemoFP', 2, 15);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.font = '18px Times New Roman';
    ctx.fillText('CVE-2024', 4, 45);
    fp.canvas = canvas.toDataURL().substring(0, 100);
  } catch {}

  try {
    const gl = document.createElement('canvas').getContext('webgl');
    if (gl) {
      fp.webglVendor = gl.getParameter(gl.VENDOR);
      fp.webglRenderer = gl.getParameter(gl.RENDERER);
    }
  } catch {}

  try {
    const div = document.createElement('div');
    div.style.fontFamily = 'monospace';
    const baseWidth = div.offsetWidth;
    const fonts = ['Arial', 'Helvetica', 'Times New Roman', 'Courier New', 'Verdana', 'Georgia', 'Comic Sans MS', 'Impact', 'Trebuchet MS', 'Palatino'];
    fp.fonts = fonts.filter(f => {
      div.style.fontFamily = `"${f}", monospace`;
      return div.offsetWidth !== baseWidth;
    });
  } catch {}

  try {
    const mem = navigator.deviceMemory;
    if (mem) fp.deviceMemory = mem + 'GB';
  } catch {}

  try {
    if (navigator.getBattery) {
      const battery = await navigator.getBattery();
      fp.batteryLevel = battery.level * 100 + '%';
      fp.batteryCharging = battery.charging;
    }
  } catch {}

  try {
    fp.referrer = document.referrer || 'direct';
    fp.pageLoad = Math.round(performance.now()) + 'ms';
    fp.visibilityState = document.visibilityState;
  } catch {}

  return fp;
}
