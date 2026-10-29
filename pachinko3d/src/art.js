import * as THREE from 'three';

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function texBackplate() {
  return canvasTex(1024, 1536, (g, w, h) => {
    const bg = g.createRadialGradient(w * 0.5, h * 0.35, 40, w * 0.5, h * 0.5, h * 0.78);
    bg.addColorStop(0, '#16233a');
    bg.addColorStop(0.45, '#0b1322');
    bg.addColorStop(1, '#04070d');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);

    // 同心圆弧
    g.lineWidth = 2;
    for (let i = 0; i < 9; i++) {
      g.strokeStyle = `rgba(70,190,255,${0.10 - i * 0.008})`;
      g.beginPath();
      g.arc(w * 0.5, h * 0.34, 120 + i * 82, Math.PI * 0.12, Math.PI * 0.88);
      g.stroke();
    }
    // 斜向条纹
    g.save();
    g.globalAlpha = 0.05;
    for (let i = -h; i < w + h; i += 26) {
      g.strokeStyle = i % 52 === 0 ? '#7fe9ff' : '#ff4f96';
      g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i - h, h); g.stroke();
    }
    g.restore();

    // 中央徽记
    g.save();
    g.translate(w * 0.5, h * 0.30);
    g.globalAlpha = 0.13;
    g.strokeStyle = '#8ef0ff'; g.lineWidth = 7;
    g.beginPath(); g.arc(0, 0, 150, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(0, 0, 110, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#9df3ff';
    g.font = '900 190px "PingFang SC",system-ui,sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('P', 0, 8);
    g.restore();

    // 竖排小字
    g.save();
    g.globalAlpha = 0.16;
    g.fillStyle = '#9be6ff';
    g.font = '600 26px "PingFang SC",system-ui,sans-serif';
    g.textAlign = 'center';
    g.fillText('NEON DROP', w * 0.5, h * 0.545);
    g.font = '600 18px system-ui,sans-serif';
    g.fillStyle = '#ff86b8';
    g.fillText('PACHINKO · 3D PHYSICS', w * 0.5, h * 0.575);
    g.restore();

    // 底部槽区装饰
    const grad = g.createLinearGradient(0, h * 0.72, 0, h);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,.85)');
    g.fillStyle = grad; g.fillRect(0, h * 0.72, w, h * 0.28);

    // 细网格
    g.strokeStyle = 'rgba(90,160,220,.05)'; g.lineWidth = 1;
    for (let x = 0; x < w; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 0; y < h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  });
}

export function texMarquee() {
  return canvasTex(1600, 208, (g, w, h) => {
    g.fillStyle = '#05070c'; g.fillRect(0, 0, w, h);
    const lg = g.createLinearGradient(0, 0, w, 0);
    lg.addColorStop(0, 'rgba(46,230,255,.20)');
    lg.addColorStop(0.5, 'rgba(255,47,135,.20)');
    lg.addColorStop(1, 'rgba(46,230,255,.20)');
    g.fillStyle = lg; g.fillRect(0, 0, w, h);

    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = '#2ee6ff'; g.shadowBlur = 38;
    g.fillStyle = '#dffaff';
    g.font = '900 108px "PingFang SC",system-ui,sans-serif';
    g.fillText('PACHINKO', w / 2, h / 2 + 2);
    g.shadowBlur = 0;

    g.strokeStyle = 'rgba(46,230,255,.55)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(40, h - 8); g.lineTo(w - 40, h - 8); g.stroke();
  });
}

export function texGlow() {
  return canvasTex(256, 256, (g, w, h) => {
    const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.25, 'rgba(255,255,255,.55)');
    r.addColorStop(0.6, 'rgba(255,255,255,.12)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, w, h);
  });
}

export function texMult(mult, hue = 'cyan') {
  const col = hue === 'gold' ? ['#fff3c4', '#ffcc45'] : hue === 'pink' ? ['#ffd7e8', '#ff2f87'] : ['#dcfbff', '#2ee6ff'];
  return canvasTex(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const r = 40;
    g.beginPath();
    g.roundRect(14, 14, w - 28, h - 28, r);
    const bg = g.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, 'rgba(6,14,22,.92)');
    bg.addColorStop(1, 'rgba(10,26,38,.86)');
    g.fillStyle = bg; g.fill();
    g.lineWidth = 5; g.strokeStyle = col[1]; g.shadowColor = col[1]; g.shadowBlur = 22; g.stroke();
    g.shadowBlur = 0;

    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = col[0];
    g.font = '900 118px "PingFang SC",system-ui,sans-serif';
    g.fillText('×' + mult, w / 2, h / 2 + 4);
  });
}

/** 出口编号 1~8：只有数字本身（无底板），带霓虹描边 */
export function texNum(n) {
  return canvasTex(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = 'rgba(120,210,255,.85)'; g.shadowBlur = 18;
    g.fillStyle = 'rgba(222,244,255,.96)';
    g.font = '800 68px system-ui,sans-serif';
    g.fillText(String(n + 1), w / 2, h / 2);
    g.shadowBlur = 0;
  });
}

export function makeMaterials(env) {
  return {
    body: new THREE.MeshPhysicalMaterial({
      color: 0x0e131c, metalness: 0.72, roughness: 0.28,
      clearcoat: 1, clearcoatRoughness: 0.12, envMap: env, envMapIntensity: 0.55,
    }),
    chrome: new THREE.MeshStandardMaterial({
      color: 0xaebbc9, metalness: 1, roughness: 0.18, envMap: env, envMapIntensity: 0.9,
    }),
    steel: new THREE.MeshStandardMaterial({
      color: 0x9fb0c2, metalness: 0.95, roughness: 0.28, envMap: env, envMapIntensity: 1.5,
    }),
    dark: new THREE.MeshStandardMaterial({
      color: 0x141a24, metalness: 0.6, roughness: 0.45, envMap: env, envMapIntensity: 0.8,
    }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x080a0e, metalness: 0.1, roughness: 0.85 }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0xbfe9ff, metalness: 0, roughness: 0.03, transparent: true, opacity: 0.035,
      envMap: env, envMapIntensity: 0.45, side: THREE.FrontSide, depthWrite: false,
      clearcoat: 1, clearcoatRoughness: 0.02,
    }),
    ball: new THREE.MeshStandardMaterial({
      color: 0xe8eef8, metalness: 1, roughness: 0.08, envMap: env, envMapIntensity: 1.6,
    }),
  };
}

export const NEON = {
  cyan: 0x2ee6ff,
  magenta: 0xff2f87,
  gold: 0xffcc45,
  green: 0x3ef0a8,
  off: 0x1a2231,
};

export function neonMat(color, intensity = 2.4) {
  return new THREE.MeshStandardMaterial({
    color: 0x081018, emissive: color, emissiveIntensity: intensity,
    metalness: 0.2, roughness: 0.4,
  });
}
