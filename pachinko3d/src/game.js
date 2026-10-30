import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

import {
  CFG, buildPhysicsWorld, createBallAt, nudge, slotCenterX, slotIndexFromX,
  railPath, localDir, localPos, domeConstrain, laneConstrain, attachPegRoughness,
} from './layout.mjs';
import { texBackplate, texMarquee, texMult, texNum, makeMaterials, NEON, neonMat } from './art.js';
import { drawRound, theoreticalRtp, SLOT_COUNT } from './rules.mjs';
import { audio } from './audio.js';

const GOLDFX = 0xffc020;   // 点亮出口统一金色
const TILT = CFG.tiltDeg * Math.PI / 180;

// ---------------------------------------------------------------------------
// 工具贴图
// ---------------------------------------------------------------------------
function makeGlowTex() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.25, 'rgba(255,255,255,.55)');
  r.addColorStop(0.6, 'rgba(255,255,255,.12)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function makeRingTex() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 320;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 320);
  g.strokeStyle = '#ffffff'; g.lineWidth = 10;
  g.beginPath(); g.roundRect(10, 10, 108, 300, 26); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const GLOW_TEX = makeGlowTex();
const RING_TEX = makeRingTex();

// ---------------------------------------------------------------------------
// 渲染基础
// ---------------------------------------------------------------------------
const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.72;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x04060b);
scene.fog = new THREE.Fog(0x04060b, 7, 18);

const camera = new THREE.PerspectiveCamera(37, window.innerWidth / window.innerHeight, 0.05, 80);
const CAM_BASE = new THREE.Vector3(0, 0.02, 5.85);
let LOOK_Y = 0.05;
camera.position.copy(CAM_BASE);
camera.lookAt(0, 0.05, 0);

const pmrem = new THREE.PMREMGenerator(renderer);
const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
const env = envRT.texture;
scene.environment = env;

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.26, 0.45, 0.9);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---------------------------------------------------------------------------
// 灯光 / 环境
// ---------------------------------------------------------------------------
scene.add(new THREE.HemisphereLight(0x7fb6ff, 0x05070c, 0.45));

const keyLight = new THREE.SpotLight(0xffffff, 6, 16, 0.7, 0.5, 1.6);
keyLight.position.set(0.4, 3.6, 4.0);
keyLight.target.position.set(0, 0.1, 0);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
keyLight.shadow.bias = -0.0006;
scene.add(keyLight, keyLight.target);

const rimCyan = new THREE.PointLight(0x2ee6ff, 4.5, 7, 2);
rimCyan.position.set(-1.6, 1.2, 1.6);
const rimPink = new THREE.PointLight(0xff2f87, 4, 7, 2);
rimPink.position.set(1.7, -0.6, 1.5);
scene.add(rimCyan, rimPink);

{
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({
    color: 0x070a10, roughness: 0.36, metalness: 0.72, envMap: env, envMapIntensity: 0.55,
  }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.86;
  floor.receiveShadow = true;
  scene.add(floor);

  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 16),
    new THREE.MeshStandardMaterial({ color: 0x060910, roughness: 0.95, metalness: 0.1 }),
  );
  wall.position.set(0, 2, -5.5);
  scene.add(wall);

  for (const [x, c] of [[-2.0, 0x2ee6ff], [2.0, 0xff2f87]]) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 6), neonMat(c, 1.6));
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(x, -1.855, 0.8);
    scene.add(strip);
  }
}

const M = makeMaterials(env);

// ---------------------------------------------------------------------------
// 机柜
// ---------------------------------------------------------------------------
const machine = new THREE.Group();
machine.rotation.x = -TILT;
scene.add(machine);

const OPEN_W = 1.70, OPEN_H = 2.50;
const COL_W = 0.17, HEADER_H = 0.62, DECK_H = 0.36;
const OUT_W = OPEN_W + COL_W * 2;
const OUT_H = OPEN_H + HEADER_H + DECK_H;
const HEADER_Y = OPEN_H / 2 + HEADER_H / 2;          // 1.56
const DECK_Y = -OPEN_H / 2 - DECK_H / 2;             // -1.43
const FRONT_Z = 0.18, BACK_Z = -0.20;

function box(w, h, d, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

{
  const g = new THREE.Group();
  machine.add(g);

  const backPanel = box(OUT_W, OUT_H, 0.05, M.body);
  backPanel.position.z = BACK_Z + 0.025;
  g.add(backPanel);

  for (const s of [-1, 1]) {
    const colX = s * (OPEN_W / 2 + COL_W / 2);
    // 立柱上的竖直霓虹条已删：右侧那条正好压在下面的弧形槽口上，会挡住露出来的弧线
    if (s > 0) {
      // 【物理 == 视觉】右立柱开一条贯通槽：球从发射到贴弧落盘，整段轨道都必须看得见。
      // 滑道 z 从 laneZ=0.245(立柱前) 斜收到 laneTopZ=0.055(钻进机身)，y>-0.59 之后就藏到
      // 立柱后面；球出滑道贴弧那段（x 0.95 -> 0.85）同样在立柱后。这里沿轨道把立柱挖开：
      //   竖槽(球道段) + 顶部弧形槽(贴弧段) 合成一个贯通的孔，弧面带整条露出来。
      // 立柱 x 位置不动、物理一行不动，只挖掉挡住轨道的机身材料。
      const cx0 = CFG.domeCx, cy0 = CFG.domeCy;
      const rO = CFG.domeR + 0.05;                    // 外弧：包住弧面带最外圈(1.406)
      const xL = OPEN_W / 2 + 0.018;                  // 槽左：留 18mm 内框条，机头仍有窗框
      const xR = 0.998;                               // 槽右：留出 22mm 宽的边框腿，
                                                      // 太窄会变成一条发亮的细白片，很扎眼
      const yBot = CFG.railBottomY - 0.06;            // 槽底：一路开到滑道装球位，整条弹射轨道都看得见
      const cl = (v) => Math.max(-1, Math.min(1, v));
      const aS = Math.acos(cl((xR - cx0) / rO));
      const aE = Math.acos(cl((xL - cx0) / rO));
      const N = 24;
      // 槽轮廓（世界坐标）：底边 -> 右侧壁 -> 顶部沿外弧 -> 左侧壁闭合
      const outline = [[xL, yBot], [xR, yBot], [xR, cy0 + rO * Math.sin(aS)]];
      for (let i = 0; i <= N; i++) {
        const a = aS + (aE - aS) * i / N;
        outline.push([cx0 + rO * Math.cos(a), cy0 + rO * Math.sin(a)]);
      }
      const shp = new THREE.Shape();
      const hw = COL_W / 2, hh = OUT_H / 2;
      shp.moveTo(-hw, -hh); shp.lineTo(hw, -hh); shp.lineTo(hw, hh); shp.lineTo(-hw, hh); shp.closePath();
      const hole = new THREE.Path();
      hole.moveTo(outline[0][0] - colX, outline[0][1]);
      for (let i = 1; i < outline.length; i++) hole.lineTo(outline[i][0] - colX, outline[i][1]);
      hole.closePath();
      shp.holes.push(hole);
      const colR = new THREE.Mesh(new THREE.ExtrudeGeometry(shp, { depth: FRONT_Z - BACK_Z, bevelEnabled: false }), M.body);
      colR.position.set(colX, 0, BACK_Z);
      colR.castShadow = true; colR.receiveShadow = true;
      g.add(colR);
      // 槽衬底：挖开后背后不能是空的，按同一轮廓铺一块深色板（在球之后，不挡球）
      const bs = new THREE.Shape();
      bs.moveTo(outline[0][0], outline[0][1]);
      for (let i = 1; i < outline.length; i++) bs.lineTo(outline[i][0], outline[i][1]);
      bs.closePath();
      const backing = new THREE.Mesh(new THREE.ShapeGeometry(bs), M.dark);
      backing.position.z = 0.005;
      machine.add(backing);
    } else {
      const col = box(COL_W, OUT_H, FRONT_Z - BACK_Z, M.body);
      col.position.set(colX, 0, (FRONT_Z + BACK_Z) / 2);
      g.add(col);
    }

    // 窗缘填缝：盘面(±0.80)到窗框之间的悬空竖缝用机身同色填实，
    // 消掉盘面两侧多出来的灰色槽；右槽(0.868 起)不受影响，球道照常可见。
    const gapW = OPEN_W / 2 + 0.018 - CFG.boardW / 2;   // 0.868 - 0.80 = 0.068
    const fill = box(gapW, OPEN_H, FRONT_Z - BACK_Z, M.body);
    fill.position.set(s * (CFG.boardW / 2 + gapW / 2), 0, (FRONT_Z + BACK_Z) / 2);
    g.add(fill);
  }

  const header = box(OUT_W, HEADER_H, FRONT_Z - BACK_Z, M.body);
  header.position.set(0, HEADER_Y, (FRONT_Z + BACK_Z) / 2);
  g.add(header);

  // 底座右端让位给弹射滑道 + 拉杆：它们现在全程在 railZ(=0.055) 平面（不斜插），
  // 若底座横贯到右缘，就会立一块板挡在 z=0.18、把滑道底和拉杆整个盖住。
  // 让位区间与右立柱的贯通槽对齐（x 0.868 起），滑道/拉杆从开口里露出来。
  {
    const deckXR = OPEN_W / 2 + 0.018;                    // 0.868
    const deckW = deckXR - (-OUT_W / 2);
    const deck = box(deckW, DECK_H, FRONT_Z - BACK_Z, M.body);
    deck.position.set((-OUT_W / 2 + deckXR) / 2, DECK_Y, (FRONT_Z + BACK_Z) / 2);
    g.add(deck);
  }

  // 招牌底板与机头面板同色同质感（M.body 那套参数），只有文字发光：
  // emissiveMap 用底板纯黑的版本，避免整块招牌被 emissive 提亮成灰白
  const marqueeMat = new THREE.MeshPhysicalMaterial({
    map: texMarquee(false), emissiveMap: texMarquee(true),
    emissive: 0xffffff, emissiveIntensity: 0.75,
    roughness: 0.28, metalness: 0.6,
    clearcoat: 1, clearcoatRoughness: 0.12, envMap: env, envMapIntensity: 0.5,
  });
  const marquee = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.26), marqueeMat);
  marquee.position.set(0, 1.715, FRONT_Z + 0.006);
  g.add(marquee);

  // 招牌上缘一排灯泡（经典机台装饰，填掉招牌上方的空带）
  {
    const bulbGeo = new THREE.SphereGeometry(0.011, 10, 8);
    for (let i = 0; i <= 14; i++) {
      const warm = i % 2 ? NEON.gold : 0xffffff;
      const bulb = new THREE.Mesh(bulbGeo, neonMat(warm, 1.5));
      bulb.position.set(-0.90 + i * (1.80 / 14), 1.857, FRONT_Z + 0.012);
      g.add(bulb);
    }
  }

  // 左右扬声器格栅：填满机头两侧剩下的空板
  // （横栅条样式，避免"黑圆+发光点"被看成一颗悬空的球）
  for (const s of [-1, 1]) {
    const gx = s * 0.92, gy = 1.41;
    const grille = new THREE.Mesh(new THREE.CircleGeometry(0.062, 32), M.dark);
    grille.position.set(gx, gy, FRONT_Z + 0.002);
    g.add(grille);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.066, 0.008, 8, 36), M.chrome);
    ring.position.set(gx, gy, FRONT_Z + 0.002);
    g.add(ring);
    for (let i = -1; i <= 1; i++) {          // 三条横栅条，明确的喇叭孔
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.098, 0.010, 0.006), M.steel);
      bar.position.set(gx, gy + i * 0.028, FRONT_Z + 0.005);
      g.add(bar);
    }
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.007, 12), neonMat(s < 0 ? NEON.cyan : NEON.magenta, 0.9));
    dot.position.set(gx, gy - 0.042, FRONT_Z + 0.004);   // 指示灯挪到格栅下缘，不再居中像球
    g.add(dot);
  }

  const bezels = [
    [CFG.boardW + 0.07, 0.035, 0, OPEN_H / 2 + 0.017],
    [CFG.boardW + 0.07, 0.035, 0, -OPEN_H / 2 - 0.017],
    [0.035, OPEN_H + 0.07, -CFG.boardW / 2 - 0.0175, 0],
    [0.035, OPEN_H + 0.07, CFG.boardW / 2 + 0.0175, 0],
  ];
  for (const [w, h, x, y] of bezels) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.035), M.chrome);
    b.position.set(x, y, FRONT_Z - 0.012);
    b.castShadow = true;
    g.add(b);
  }

  const slotPlate = box(0.34, 0.11, 0.02, M.steel);
  slotPlate.position.set(-0.58, DECK_Y, FRONT_Z + 0.006);
  g.add(slotPlate);
  const slotHole = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.02, 0.008), new THREE.MeshStandardMaterial({ color: 0x02040a, roughness: 1 }));
  slotHole.position.set(-0.58, DECK_Y + 0.004, FRONT_Z + 0.017);
  g.add(slotHole);

  [NEON.cyan, NEON.gold, NEON.magenta].forEach((c, i) => {
    const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.026, 24), neonMat(c, 1.6));
    btn.rotation.x = Math.PI / 2;
    btn.position.set(0.30 + i * 0.13, DECK_Y, FRONT_Z + 0.012);
    g.add(btn);
    const ringM = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.006, 8, 28), M.chrome);
    ringM.position.copy(btn.position);
    ringM.position.z -= 0.004;
    g.add(ringM);
  });

  const tray = box(0.66, 0.16, 0.10, M.dark);
  tray.position.set(-0.5, DECK_Y - 0.14, FRONT_Z - 0.02);
  g.add(tray);
  for (let i = 0; i < 16; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.026, 12, 10), M.ball);
    b.position.set(-0.76 + (i % 8) * 0.075, DECK_Y - 0.095 + Math.floor(i / 8) * 0.052, FRONT_Z - 0.02);
    g.add(b);
  }

  for (const s of [-1, 1]) {
    const foot = box(0.22, 0.05, 0.34, M.rubber);
    foot.position.set(s * 0.78, -OUT_H / 2 - 0.02, -0.02);
    g.add(foot);
  }

  const glass = new THREE.Mesh(new THREE.PlaneGeometry(OPEN_W - 0.02, OPEN_H - 0.02), M.glass);
  glass.position.set(0, 0, FRONT_Z - 0.03);
  glass.renderOrder = 5;
  g.add(glass);
}

// ---------------------------------------------------------------------------
// 投币显示窗（玻璃板 + 左右斜坡 + 中央洞 + 计数屏）
// ---------------------------------------------------------------------------
const CHIP_WINDOW = { cx: -0.25, w: 1.18, top: 1.58, bot: 1.27, holeHalf: 0.062 };
const chipReadout = { tex: null, ctx: null };
const chipBalls = [];
let chipSpawnT = 0;
let chipQueue = 0;
let chipLoaded = 0;

function drawReadout(cur, total) {
  if (!chipReadout.ctx) return;
  const g = chipReadout.ctx;
  g.clearRect(0, 0, 256, 64);
  g.fillStyle = 'rgba(4,8,14,.88)';
  g.beginPath(); g.roundRect(2, 2, 252, 60, 12); g.fill();
  g.strokeStyle = 'rgba(255,204,69,.7)'; g.lineWidth = 3;
  g.beginPath(); g.roundRect(2, 2, 252, 60, 12); g.stroke();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#ffd76a';
  g.font = '700 34px "PingFang SC",system-ui,sans-serif';
  g.fillText(`装填 ${cur} / ${total}`, 128, 34);
  chipReadout.tex.needsUpdate = true;
}

const RAMP = (() => {
  const { cx, w, top, bot, holeHalf } = CHIP_WINDOW;
  const run = w / 2 - 0.055 - holeHalf;
  const rise = (top - 0.045) - (bot + 0.075);
  return { cx, run, rise, len: Math.hypot(run, rise), ang: Math.atan2(rise, run) };
})();

/** 导条上表面的高度（ax = 距洞中心线的水平距离） */
function rampYAt(ax) {
  const { holeHalf, bot, top } = CHIP_WINDOW;
  const t = Math.min(1, Math.max(0, (ax - holeHalf) / RAMP.run));
  const yLow = bot + 0.075, yHigh = top - 0.045;
  return yLow + (yHigh - yLow) * t;
}

{
  const { cx, w, top, bot, holeHalf } = CHIP_WINDOW;
  const hgt = top - bot;
  const WIN_BACK_Z = 0.186;     // 窗底板（紧贴机头前脸 0.180 前面）
  const GS_Z = 0.214;           // 玻璃板（在机头前脸之外，所以真的看得见）
  const g = new THREE.Group();
  machine.add(g);

  // 窗底：暗色亚光背板
  const back = new THREE.Mesh(new THREE.PlaneGeometry(w, hgt), new THREE.MeshStandardMaterial({
    color: 0x070c14, roughness: 0.88, metalness: 0.3,
  }));
  back.position.set(cx, (top + bot) / 2, WIN_BACK_Z);
  g.add(back);

  // 外框：厚钢框，让它看起来是嵌在机头上的一块独立窗
  const fr = 0.036;
  const frameParts = [
    [w + fr * 2, fr, cx, top + fr / 2],
    [w + fr * 2, fr, cx, bot - fr / 2],
    [fr, hgt + fr * 2, cx - w / 2 - fr / 2, (top + bot) / 2],
    [fr, hgt + fr * 2, cx + w / 2 + fr / 2, (top + bot) / 2],
  ];
  for (const [fw, fh, fx, fy] of frameParts) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(fw, fh, 0.062), M.chrome);
    m.position.set(fx, fy, WIN_BACK_Z + 0.014);
    m.castShadow = true;
    g.add(m);
  }

  // 装填计数屏：做成贴在玻璃外侧的显示模块（背板 + 屏面）。
  // 之前挂在窗内（z=0.196），而斜坡金边在玻璃外（z≈0.236）更靠近相机，
  // 透视投影 + bloom 光晕会把「装填 x/x」盖住；现在模块在所有灯管之前，永远可读。
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  chipReadout.ctx = c.getContext('2d');
  chipReadout.tex = new THREE.CanvasTexture(c);
  chipReadout.tex.colorSpace = THREE.SRGBColorSpace;
  const MOD_Z = GS_Z + 0.034;                 // 模块背板：在斜坡金边前表面(≈0.241)之外
  const modBack = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.135, 0.008), new THREE.MeshStandardMaterial({
    color: 0x0a0f18, roughness: 0.55, metalness: 0.45,
  }));
  modBack.position.set(cx, top - 0.075, MOD_Z);
  g.add(modBack);
  const ro = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.11), new THREE.MeshBasicMaterial({ map: chipReadout.tex, transparent: true }));
  ro.position.set(cx, top - 0.075, MOD_Z + 0.005);
  g.add(ro);
  drawReadout(0, 0);

  // ---- 左右斜坡板：高出玻璃的实体斜板，筹码球在玻璃上滑下来撞到板后，顺着板面滚进中间的洞 ----
  const RAMP_Z = GS_Z + 0.016;
  const BOARD_H = 0.052;                       // 斜板的板面宽度（看出是块板，不是一根线）
  for (const s of [-1, 1]) {
    const len = Math.hypot(RAMP.run, RAMP.rise);
    const midX = cx + s * (holeHalf + RAMP.run / 2);
    const midY = (top - 0.045 + bot + 0.075) / 2;
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(len, BOARD_H, 0.030), M.steel);
    ramp.position.set(midX, midY - BOARD_H * 0.30, RAMP_Z);
    ramp.rotation.z = -s * RAMP.ang;
    ramp.castShadow = true;
    g.add(ramp);
    // 板的上缘一道金边：强调"高出玻璃的斜面"
    const shine = new THREE.Mesh(new THREE.BoxGeometry(len * 0.99, 0.005, 0.010), neonMat(NEON.gold, 1.1));
    shine.position.set(midX, midY + BOARD_H * 0.16, RAMP_Z + 0.006);
    shine.rotation.z = ramp.rotation.z;
    g.add(shine);
    // 板的上端立柱（板搭在窗口上沿的支点）
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.030, 0.062, 0.030), M.chrome);
    post.position.set(cx + s * (holeHalf + RAMP.run), top - 0.058, RAMP_Z);
    g.add(post);
    // 板的下端支脚（伸到洞口边缘）
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.045, 0.030), M.chrome);
    foot.position.set(cx + s * (holeHalf + 0.012), bot + 0.085, RAMP_Z);
    g.add(foot);
  }

  // ---- 中间的洞：明确的漏斗口（暗腔 + 镀铬口沿 + 金色洞口灯）----
  const holeW = holeHalf * 2 + 0.020, holeH = 0.145;
  const holeCavity = new THREE.Mesh(new THREE.BoxGeometry(holeW, holeH, 0.022), new THREE.MeshStandardMaterial({
    color: 0x01030a, roughness: 1, metalness: 0,
  }));
  holeCavity.position.set(cx, bot + 0.045, WIN_BACK_Z + 0.004);
  g.add(holeCavity);
  for (const s of [-1, 1]) {
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.016, holeH + 0.02, 0.030), M.chrome);
    jamb.position.set(cx + s * (holeW / 2 + 0.008), bot + 0.045, GS_Z - 0.004);
    g.add(jamb);
  }
  const holeSill = new THREE.Mesh(new THREE.BoxGeometry(holeW + 0.036, 0.014, 0.030), M.chrome);
  holeSill.position.set(cx, bot + 0.032 - holeH / 2 + 0.018, GS_Z - 0.004);
  g.add(holeSill);
  const holeGlow = new THREE.Mesh(new THREE.BoxGeometry(holeW + 0.010, 0.010, 0.012), neonMat(NEON.gold, 2.2));
  holeGlow.position.set(cx, bot + 0.045, GS_Z + 0.004);
  g.add(holeGlow);

  // ---- 玻璃板 ----
  const wglass = new THREE.Mesh(new THREE.PlaneGeometry(w, hgt), M.glass);
  wglass.position.set(cx, (top + bot) / 2, GS_Z);
  wglass.renderOrder = 6;
  g.add(wglass);
  chipBalls.glassZ = GS_Z;
  chipBalls.surfaceZ = GS_Z + 0.050;

  const chipGeo = new THREE.SphereGeometry(0.030, 18, 14);
  const chipMat = new THREE.MeshStandardMaterial({
    color: 0xf7c74f, metalness: 1, roughness: 0.2, envMap: env, envMapIntensity: 1.5,
    emissive: 0x6a4308, emissiveIntensity: 0.55,
  });
  for (let i = 0; i < 150; i++) {
    const m = new THREE.Mesh(chipGeo, chipMat);
    m.visible = false;
    machine.add(m);
    chipBalls.push({ mesh: m, active: false, phase: 0, side: 1, s: 0, v: 0, t: 0 });
  }
}

// ---------------------------------------------------------------------------
// 弹射轨道（可视化）+ 弹射杆
// ---------------------------------------------------------------------------
let plunger = null;
let plungerKnob = null;
let plungerHit = null;
let springMesh = null;
// 滑道视觉路径：直段之后沿顶部圆弧顺势上延一段，让墙壁/玻璃和弧面板接成一体
// （只用于可视化；物理墙和运动学引导仍用 railPath，不改变已调好的弹射参数）
function railVisualPath(cfg = CFG) {
  const pts = [];
  const n1 = 14;
  const zBot = cfg.laneZ ?? cfg.railZ;
  const zTop = cfg.laneTopZ ?? cfg.railZ;
  // 直段：z 从 laneZ 渐变到 laneTopZ（与 laneConstrain 的插值一致，消除扭折）
  for (let i = 0; i <= n1; i++) {
    const f = i / n1;
    const y = cfg.railBottomY + (cfg.railTopY - cfg.railBottomY) * f;
    pts.push({ p: [cfg.railX, y, zBot + (zTop - zBot) * f], t: [0, 1, 0], arc: false });
  }
  // 弧段：外壁沿顶部圆弧面板的镀铬棱线顺势上延 —— 滑道在这里明显汇入圆弧
  const cx = cfg.domeCx, cy = cfg.domeCy;
  const last = pts[pts.length - 1];
  const a0 = Math.atan2(last.p[1] - cy, last.p[0] - cx);
  const r0 = Math.hypot(last.p[0] - cx, last.p[1] - cy);
  const rT = cfg.domeR + 0.014 - 0.0825;      // 外壁（偏移 0.0825）正好落在镀铬棱线半径上
  const aEnd = Math.PI / 2 + 0.22;            // 一路延伸到接近拱顶
  const n2 = 20;
  for (let i = 1; i <= n2; i++) {
    const f = i / n2;
    const ang = a0 + (aEnd - a0) * f;
    const r = r0 + (rT - r0) * Math.min(1, f * 3);
    const x = cx + r * Math.cos(ang), y = cy + r * Math.sin(ang);
    pts.push({ p: [x, y, zTop], t: [-Math.sin(ang), Math.cos(ang), 0], arc: true });
  }
  return pts;
}

const SPRING_LEN = 0.17;                 // 弹簧自然长度
// z 固定在机身前脸(0.18)之外：拉杆是外露的操作部件，必须待在机身外面。
// 不跟随 laneZ —— 滑道已挪回 railZ 平面去掉斜插，拉杆若跟着缩进机身就会被底座挡住。
// 球的位置另用 CFG.laneZ 定位（见 armed 段），与拉杆 z 无关。
const PLUNGE = { x: CFG.railX, y: CFG.railBottomY + 0.005, z: 0.245, travel: 0.15 };
const BALL_SINK_MAX = 0.11;              // 球随拉杆下沉的最大量
{
  const pts = railVisualPath(CFG);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const mx = (a.p[0] + b.p[0]) / 2, my = (a.p[1] + b.p[1]) / 2, mz = (a.p[2] + b.p[2]) / 2;
    const len = Math.hypot(b.p[0] - a.p[0], b.p[1] - a.p[1]) + 0.03;
    const ang = Math.atan2(a.t[1], a.t[0]);
    const lx = a.t[1], ly = -a.t[0];
    if (a.arc) {
      // 弧段：只有外侧壁（镀铬），贴着弧面板棱线顺势上延；一条品红霓虹
      // 描边跟着走（与右侧立柱霓虹条同色），滑道汇入圆弧一目了然
      const ow = new THREE.Mesh(new THREE.BoxGeometry(len, 0.014, 0.075), M.chrome);
      ow.position.set(mx + lx * 0.0825, my + ly * 0.0825, mz);
      ow.rotation.z = ang;
      machine.add(ow);
      const acc = new THREE.Mesh(new THREE.BoxGeometry(len, 0.009, 0.010), neonMat(NEON.magenta, 1.8));
      acc.position.set(mx + lx * 0.088, my + ly * 0.088, mz + 0.042);
      acc.rotation.z = ang;
      machine.add(acc);
      continue;
    }
    const back = new THREE.Mesh(new THREE.BoxGeometry(len, 0.10, 0.012), M.dark);
    back.position.set(mx, my, mz - 0.062);
    back.rotation.z = ang;
    machine.add(back);
    for (const s of [-1, 1]) {
      const wallV = new THREE.Mesh(new THREE.BoxGeometry(len, 0.014, 0.075), M.steel);
      wallV.position.set(mx + lx * s * 0.0825, my + ly * s * 0.0825, mz);
      wallV.rotation.z = ang;
      machine.add(wallV);
    }
  }
  const stop = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.03, 0.075), M.chrome);
  stop.position.set(CFG.railX, CFG.railBottomY - 0.015, CFG.laneZ);
  machine.add(stop);

  // ---- 弹射杆：竖直杆从通道底部伸下来，弹簧套在杆上 ----
  // 机台上固定的套筒（拉杆从这里面滑）
  {
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.054, 0.062, 0.06, 22), M.dark);
    collar.position.set(PLUNGE.x, PLUNGE.y - 0.03, PLUNGE.z);
    machine.add(collar);
    const collarRing = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.007, 8, 26), M.chrome);
    collarRing.rotation.x = Math.PI / 2;
    collarRing.position.set(PLUNGE.x, PLUNGE.y - 0.058, PLUNGE.z);
    machine.add(collarRing);
    // 套筒背面贴在机台立面上
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.16, 0.03), M.dark);
    bracket.position.set(PLUNGE.x, PLUNGE.y - 0.06, PLUNGE.z - 0.045);
    machine.add(bracket);
  }

  plunger = new THREE.Group();
  plunger.position.set(PLUNGE.x, PLUNGE.y, PLUNGE.z);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.34, 14), M.steel);
  rod.position.y = -0.17;
  plunger.add(rod);
  plungerKnob = new THREE.Mesh(new THREE.CylinderGeometry(0.064, 0.052, 0.052, 26), neonMat(NEON.magenta, 1.5));
  plungerKnob.position.y = -0.32;
  plunger.add(plungerKnob);
  const knobRing = new THREE.Mesh(new THREE.TorusGeometry(0.068, 0.008, 8, 30), M.chrome);
  knobRing.rotation.x = Math.PI / 2;
  knobRing.position.y = -0.294;
  plunger.add(knobRing);
  // 加大点击区（拖拽入口）
  plungerHit = new THREE.Mesh(new THREE.SphereGeometry(0.115, 10, 8), new THREE.MeshBasicMaterial({ visible: false }));
  plungerHit.position.y = -0.30;
  plunger.add(plungerHit);
  machine.add(plunger);

  // 固定底座（拉杆头下方，挡住行程）
  {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.02, 0.10), M.dark);
    seat.position.set(PLUNGE.x, PLUNGE.y - 0.30, PLUNGE.z);
    machine.add(seat);
  }

  // ---- 真螺旋弹簧：绕在拉杆上，压缩/拉长用 scale.y 实现 ----
  {
    const ptsH = [];
    const coils = 7, N = coils * 20, R = 0.038;
    for (let i = 0; i <= N; i++) {
      const f = i / N, a = f * coils * Math.PI * 2;
      ptsH.push(new THREE.Vector3(Math.cos(a) * R, -f * SPRING_LEN, Math.sin(a) * R));
    }
    const curve = new THREE.CatmullRomCurve3(ptsH);
    springMesh = new THREE.Mesh(new THREE.TubeGeometry(curve, N, 0.0062, 6, false), M.chrome);
    springMesh.position.set(PLUNGE.x, PLUNGE.y - 0.058, PLUNGE.z);
    machine.add(springMesh);
  }

  // ---- 顶部圆弧面板：一整条大半径圆弧横跨机头上部（与物理弧完全重合）----
  {
    const { domeCx, domeCy, domeR } = CFG;
    const clamp = (v) => Math.max(-1, Math.min(1, v));
    // 【物理 == 视觉】弧面带两端严格对齐球真正滚过的那一段：
    //   球心贴弧半径 lim = domeR - ballR，圆心 (domeCx, domeCy)
    //   右端 = 球出滑道贴弧处   x = railX      极角 acos(railX / lim)
    //   左端 = 球脱离弧面落盘处 x = domeExitX  极角 acos(domeExitX / lim)
    // 画出来的弧 = 球真正滚过的范围，不多也不少（此前两端是按机身轮廓硬收的，与物理不符）
    const lim = domeR - CFG.ballR;
    const aR = Math.acos(clamp((CFG.railX - domeCx) / lim));
    const aL = Math.acos(clamp((CFG.domeExitX - domeCx) / lim));

    // 端头收口：面板/灯线/镀铬线/导轨面是四层不同半径的板，若在端点各自径向平切，
    // 切口会落在不同半径上，侧面看就是一排阶梯锯齿（弧顶衔接显生硬的原因）。
    // 两端都让四层一起向同一条中心半径 RC 收拢、截面同步变薄，收成一个圆滑的尖端。
    // 右端收口必须极短：弧带右端已经贴到机身边缘，多延伸一点尖端就会从
    // 立柱槽里探出去，变成一块悬空的白色亮片。
    const RC = domeR + 0.025;                // 收口汇聚的中心半径（各层向它叠合）
    const CAP_R = 0.020, CAP_L = 0.072;      // 收口角长：右端极短，只够把切口收拢
    const NCAP = 9, NMID = 54;
    const slices = [];
    for (let i = 0; i < NCAP; i++) {         // 右端收口（滑道出口侧）
      const u = (i + 0.5) / NCAP;
      slices.push({ a: aR - CAP_R * (1 - u), k: Math.sqrt(Math.max(0, 1 - (1 - u) ** 2)), step: CAP_R / NCAP, cap: true });
    }
    for (let i = 0; i < NMID; i++) {         // 中段 + 右端：球真正滚过的弧，全高
      slices.push({ a: aR + (aL - aR) * (i + 0.5) / NMID, k: 1, step: (aL - aR) / NMID });
    }
    for (let i = 0; i < NCAP; i++) {         // 左端收口（朝机头左缘，圆滑收尖）
      const u = (i + 0.5) / NCAP;
      slices.push({ a: aL + CAP_L * (1 - u), k: Math.sqrt(Math.max(0, 1 - (1 - u) ** 2)), step: CAP_L / NCAP, cap: true });
    }
    // 收口尖端必须留在机身轮廓之内，不许从机台侧边探出去变成悬空碎片
    const X_LIMIT = OUT_W / 2 - 0.012;
    for (const s of slices) {
      const a = s.a, k = s.k;
      const len = s.step * RC * 1.7;         // 相邻板搭接，弧面没有断缝
      const q = a + Math.PI / 2;
      // 半径和厚度同时按 k 向 RC 收拢：端头各层叠合成一个薄尖，不再各切一刀
      const put = (r0, h0, depth, mat) => {
        const rr = RC + (r0 - RC) * k;
        if (s.cap && Math.abs(domeCx + rr * Math.cos(a)) > X_LIMIT) return null;  // 顶出机身的尖不出图
        const m = new THREE.Mesh(new THREE.BoxGeometry(len, h0 * k, depth), mat);
        m.position.set(domeCx + rr * Math.cos(a), domeCy + rr * Math.sin(a), CFG.railZ);
        m.rotation.z = q;
        machine.add(m);
        return m;
      };
      const body = put(domeR + 0.020, 0.040, 0.150, M.body);   // 面板本体
      if (body) body.castShadow = true;
      put(domeR + 0.046, 0.010, 0.140, neonMat(NEON.cyan, 1.1)); // 灯线
      put(domeR + 0.004, 0.010, 0.126, M.steel);                 // 钢导轨面（球在这上面滚）
      put(domeR + 0.014, 0.012, 0.136, M.chrome);                // 镀铬棱线
    }

    // 拱肩填充：把弧面板与机头横梁之间的月牙空档填实（机身同色，不再露出背板的坑）
    // 左右铺到机身边缘：弧面带本身只画到物理端点，两侧剩下的角落由这块机身色填实
    {
      const topY = HEADER_Y - HEADER_H / 2;              // 机头横梁下缘 1.25
      const XFR = OUT_W / 2, XFL = -OUT_W / 2;
      const shp = new THREE.Shape();
      shp.moveTo(XFR, topY);
      const steps = 40;
      for (let i = 0; i <= steps; i++) {
        const x = XFR - (XFR - XFL) * i / steps;
        const y = domeCy + Math.sqrt(Math.max(0, (domeR + 0.028) ** 2 - x * x));  // 贴着弧面板外缘
        shp.lineTo(x, Math.min(topY, y));
      }
      shp.lineTo(XFL, topY);
      shp.closePath();
      const filler = new THREE.Mesh(new THREE.ShapeGeometry(shp), M.body);
      filler.position.z = 0.040;                          // 在钉子/弧面板之后、背板之前
      machine.add(filler);
    }

    // 【物理 == 视觉】槽内球道底板：右立柱开槽后，球沿弧面滚动的那一段背后要有板衬着，
    // 否则槽里露出来的是背板黑洞。板画在球的后面（z 偏后），不遮挡球。
    {
      const cx0 = CFG.domeCx, cy0 = CFG.domeCy;
      const rI = domeR - 0.10, rO2 = domeR;              // 径向 1.26 -> 1.36（覆盖球所在半径）
      const a0 = aR;
      const a1 = Math.acos(clamp((OPEN_W / 2 - cx0) / rO2));
      const segs3 = 10;
      for (let i = 0; i < segs3; i++) {
        const am = a0 + (a1 - a0) * (i + 0.5) / segs3;
        const step = (a1 - a0) * domeR / segs3;
        const len = step * 1.7;
        const q = am + Math.PI / 2;
        const rm = (rI + rO2) / 2;
        const plate = new THREE.Mesh(new THREE.BoxGeometry(len, (rO2 - rI), 0.05), M.dark);
        plate.position.set(cx0 + rm * Math.cos(am), cy0 + rm * Math.sin(am), CFG.railZ - 0.07);
        plate.rotation.z = q;
        machine.add(plate);
      }
    }
  }

  // 轨道玻璃罩（只铺直滑道段；弧段由弧面板本体承担）
  {
    const pts = railVisualPath(CFG);
    for (let i = 0; i < pts.length - 1; i++) {
      if (pts[i].arc) continue;
      const a = pts[i], b = pts[i + 1];
      const mx = (a.p[0] + b.p[0]) / 2, my = (a.p[1] + b.p[1]) / 2, mz = (a.p[2] + b.p[2]) / 2;
      const len = Math.hypot(b.p[0] - a.p[0], b.p[1] - a.p[1]) + 0.03;
      const ang = Math.atan2(a.t[1], a.t[0]);
      const lx = a.t[1], ly = -a.t[0];
      const cover = new THREE.Mesh(new THREE.BoxGeometry(len, 0.15, 0.006), M.glass);
      cover.position.set(mx, my, mz + 0.055);
      cover.rotation.z = ang;
      cover.renderOrder = 7;
      machine.add(cover);
      for (const sd of [-1, 1]) {
        const frame = new THREE.Mesh(new THREE.BoxGeometry(len, 0.012, 0.014), M.steel);
        frame.position.set(mx + lx * sd * 0.082, my + ly * sd * 0.082, mz + 0.058);
        frame.rotation.z = ang;
        machine.add(frame);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 回球槽：出口落下的球沿这条槽滚回右侧弹射位
// ---------------------------------------------------------------------------
const RETURN_TROUGH = [
  [-0.84, -1.170, 0.075],
  [-0.20, -1.170, 0.085],
  [0.40, -1.170, 0.105],
  [0.76, -1.175, 0.160],
  [0.88, -1.185, 0.232],
  [CFG.railX, CFG.railBottomY + CFG.ballR + 0.01, CFG.laneZ],
];
{
  const pv = (a) => new THREE.Vector3(a[0], a[1], a[2]);
  for (let i = 0; i < RETURN_TROUGH.length - 1; i++) {
    const a = pv(RETURN_TROUGH[i]), b = pv(RETURN_TROUGH[i + 1]);
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, mz = (a.z + b.z) / 2;
    const len = Math.hypot(b.x - a.x, b.y - a.y) + 0.02;
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(len, 0.014, 0.115), M.dark);
    floor.position.set(mx, my - 0.052, mz);
    floor.rotation.z = ang;
    machine.add(floor);
    for (const s of [-1, 1]) {
      const lip = new THREE.Mesh(new THREE.BoxGeometry(len, 0.038, 0.010), s < 0 ? M.steel : M.dark);
      lip.position.set(mx, my - 0.028, mz + s * 0.058);
      lip.rotation.z = ang;
      machine.add(lip);
    }
  }
  // 槽后裙板：把出口下方到机台底沿之间的空档补成机身
  const apron = new THREE.Mesh(new THREE.BoxGeometry(1.90, 0.20, 0.02), M.body);
  apron.position.set(0, -1.175, 0.045);
  machine.add(apron);
}

// 球沿槽滚动的自转轴（绕机台局部 x 轴反向滚）
const RETURN_AXLE = (() => {
  const v = localDir(-1, 0, 0);
  return new THREE.Vector3(v.x, v.y, v.z).normalize();
})();
function makeReturnPath(slotIdx) {
  const sx = slotCenterX(slotIdx);
  const pts = [
    new THREE.Vector3(sx, CFG.floorY + 0.055, 0.055),
    new THREE.Vector3(sx, -1.130, 0.070),
  ];
  for (const t of RETURN_TROUGH) {
    if (t[0] > sx + 0.05) pts.push(new THREE.Vector3(t[0], t[1], t[2]));
  }
  const last = pts[pts.length - 1];
  if (last.x < CFG.railX - 0.01) {
    pts.push(new THREE.Vector3(CFG.railX, CFG.railBottomY + CFG.ballR + 0.01, CFG.laneZ));
  }
  // 局部坐标 -> 世界坐标（球 mesh 挂在 scene 上）
  machine.updateMatrixWorld(true);
  for (const p of pts) p.applyMatrix4(machine.matrixWorld);
  return new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.4);
}

// ---------------------------------------------------------------------------
// 轨道运动学引导（世界坐标路径）
// ---------------------------------------------------------------------------
const v3 = (c) => new THREE.Vector3(c.x, c.y, c.z);
const railPtsW = (() => {
  const pts = railPath(CFG);
  const out = [];
  let acc = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = v3(localPos(pts[i].p[0], pts[i].p[1], pts[i].p[2]));
    const tv = v3(localDir(pts[i].t[0], pts[i].t[1], pts[i].t[2]));
    if (i > 0) acc += p.distanceTo(out[i - 1].p);
    out.push({ p, t: tv, s: acc });
  }
  return out;
})();
const RAIL_LEN = railPtsW[railPtsW.length - 1].s;
function railPointAt(s) {
  const cl = Math.max(0, Math.min(RAIL_LEN, s));
  for (let i = 1; i < railPtsW.length; i++) {
    if (railPtsW[i].s >= cl) {
      const a = railPtsW[i - 1], b = railPtsW[i];
      const f = (cl - a.s) / Math.max(1e-6, b.s - a.s);
      return { p: new THREE.Vector3().lerpVectors(a.p, b.p, f), t: new THREE.Vector3().lerpVectors(a.t, b.t, f).normalize() };
    }
  }
  const e = railPtsW[railPtsW.length - 1];
  return { p: e.p.clone(), t: e.t.clone() };
}

// ---------------------------------------------------------------------------
// 盘面
// ---------------------------------------------------------------------------
const board = new THREE.Group();
machine.add(board);

{
  const bpTex = texBackplate();
  const bp = new THREE.Mesh(
    new THREE.PlaneGeometry(CFG.boardW, CFG.boardH),
    new THREE.MeshStandardMaterial({
      map: bpTex, color: 0x8f99a8, emissiveMap: bpTex, emissive: 0xffffff, emissiveIntensity: 0.05,
      roughness: 0.75, metalness: 0.15,
    }),
  );
  bp.position.z = 0.001;
  board.add(bp);
}

{
  const pegGeo = new THREE.CylinderGeometry(CFG.pegR, CFG.pegR, 0.075, 18, 1, false);
  pegGeo.rotateX(Math.PI / 2);
  const capGeo = new THREE.SphereGeometry(CFG.pegR * 0.98, 12, 10);
  const halfCols = (CFG.pegCols - 1) / 2;
  for (let r = 0; r < CFG.pegRows; r++) {
    const y = CFG.pegRowStart - r * CFG.pegRowStep;
    const offset = r % 2 === 0 ? 0 : CFG.pegColStep / 2;
    for (let c = 0; c < CFG.pegCols; c++) {
      const x = (c - halfCols) * CFG.pegColStep + offset;
      if (Math.abs(x) > CFG.boardW / 2 - 0.055) continue;
      const m = new THREE.Mesh(pegGeo, M.chrome);
      m.position.set(x, y, CFG.pegZ);
      m.castShadow = true;
      board.add(m);
      const cap = new THREE.Mesh(capGeo, M.chrome);
      cap.position.set(x, y, CFG.pegZ + 0.036);
      board.add(cap);
    }
  }
}

// 实体出口（洞腔 + 口沿 + LED 环框 + 光柱 + 倍率牌）
const slots = [];
{
  const sw = CFG.boardW / CFG.slotCount;
  const slotTop = CFG.dividerTop, slotBot = CFG.floorY;
  const h = slotTop - slotBot;
  const midY = (slotTop + slotBot) / 2;
  const iw = sw - 0.024;

  for (let i = 0; i < CFG.slotCount; i++) {
    const cx = slotCenterX(i);

    // 洞腔：三面围合的实体暗道（伸手进去那种深）
    const cavMat = new THREE.MeshStandardMaterial({ color: 0x04070d, roughness: 0.95, metalness: 0.1, emissive: 0x000000 });
    const cav = new THREE.Mesh(new THREE.BoxGeometry(iw, h, 0.08), cavMat);
    cav.position.set(cx, midY, 0.008);
    board.add(cav);

    // 出口轨道：向前伸出的 U 形槽（底板 + 两侧导轨 + 前唇），球从上方掉进这条槽
    const troughD = 0.185;
    const troughZ = 0.072;
    const floorPl = new THREE.Mesh(new THREE.BoxGeometry(iw, 0.020, troughD), M.dark);
    floorPl.position.set(cx, slotBot + 0.010, troughZ);
    floorPl.castShadow = true;
    board.add(floorPl);
    for (const s of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.062, troughD), M.dark);
      rail.position.set(cx + s * (iw / 2 + 0.008), slotBot + 0.031, troughZ);
      rail.castShadow = true;
      board.add(rail);
    }
    // 槽底暗口（球落进去就消失在里面）
    const gap = new THREE.Mesh(new THREE.PlaneGeometry(iw * 0.62, 0.026), new THREE.MeshBasicMaterial({ color: 0x01020a }));
    gap.position.set(cx, slotBot + 0.021, troughZ + troughD / 2 - 0.004);
    board.add(gap);
    // 前唇：一道镀铬压边，把"这是条轨道"做实
    const lip = new THREE.Mesh(new THREE.BoxGeometry(iw + 0.02, 0.014, 0.016), M.dark);
    lip.position.set(cx, slotBot + 0.062, troughZ + troughD / 2);
    board.add(lip);

    // 口沿 LED 灯带（平时暗，点亮时变成倍率色）
    const ledMat = new THREE.MeshStandardMaterial({
      color: 0x0a121c, emissive: 0x0a121c, emissiveIntensity: 1.2, metalness: 0.3, roughness: 0.35,
    });
    const led = new THREE.Mesh(new THREE.BoxGeometry(iw * 0.94, 0.013, 0.014), ledMat);
    led.position.set(cx, slotBot + 0.050, troughZ + troughD / 2 - 0.002);
    board.add(led);

    // 洞口发光环（点亮特效，不再贴倍率牌）
    const ringMat = new THREE.MeshBasicMaterial({ map: RING_TEX, transparent: true, color: 0x1c2a3c, opacity: 0.85, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(iw + 0.006, h - 0.01), ringMat);
    ring.position.set(cx, midY + 0.012, 0.099);
    ring.renderOrder = 3;
    board.add(ring);

    // 光柱：两片交叉，点亮时从出口往上打一道金色光
    const beamMat = new THREE.MeshBasicMaterial({
      color: GOLDFX, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
      depthWrite: false, map: GLOW_TEX, side: THREE.DoubleSide,
    });
    const beam = new THREE.Group();
    {
      const b1 = new THREE.Mesh(new THREE.PlaneGeometry(0.20, 0.78), beamMat);
      const b2 = new THREE.Mesh(new THREE.PlaneGeometry(0.20, 0.78), beamMat);
      b2.rotation.y = Math.PI / 2;
      beam.add(b1, b2);
    }
    beam.position.set(cx, CFG.dividerTop + 0.34, 0.075);
    beam.visible = false;
    board.add(beam);

    // 出口编号 1~8：数字直接印在背板上（不再垫一块小钢片），点亮时转成金色
    const plateMat = new THREE.MeshBasicMaterial({
      map: texNum(i), transparent: true, opacity: 0.85, depthWrite: false, color: 0x93a3b4,
    });
    const numPlate = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.13), plateMat);
    numPlate.position.set(cx, CFG.dividerTop + 0.085, 0.118);
    numPlate.renderOrder = 4;
    board.add(numPlate);
    // 出口上方的点亮金晕（配合底部光池，点亮时洞口整体泛金）
    const haloMat = new THREE.SpriteMaterial({
      map: GLOW_TEX, color: GOLDFX, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const halo = new THREE.Sprite(haloMat);
    halo.scale.setScalar(0.20);
    halo.position.set(cx, CFG.dividerTop + 0.085, 0.112);
    board.add(halo);
    // 出口底部的金色光池
    const poolMat = new THREE.MeshBasicMaterial({
      color: GOLDFX, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
      depthWrite: false, map: GLOW_TEX, side: THREE.DoubleSide,
    });
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(iw + 0.05, 0.26), poolMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(cx, slotBot + 0.026, troughZ + 0.03);
    board.add(pool);

    slots.push({ ring, ringMat, beam, beamMat, ledMat, cavMat, plateMat, halo, haloMat, poolMat, lit: false, mult: 0, cx });
  }

  // 隔板：实心钢墙 + 圆头，把 8 条出口轨道真正分开
  for (let i = 0; i <= CFG.slotCount; i++) {
    const x = -CFG.boardW / 2 + sw * i;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.018, h + 0.026, 0.125), M.dark);
    wall.position.set(x, midY, 0.040);
    wall.castShadow = true;
    board.add(wall);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0095, 0.0095, 0.125, 10), M.dark);
    cap.rotation.x = Math.PI / 2;
    cap.position.set(x, slotTop + 0.013, 0.040);
    board.add(cap);
  }
}

// 点亮出口的上升粒子特效
const sparkles = [];
{
  for (let i = 0; i < 24; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: GLOW_TEX, color: 0x2ee6ff, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    s.scale.setScalar(0.03);
    board.add(s);
    sparkles.push({ sprite: s, life: 0, max: 1, slot: -1, vy: 0.3, wob: Math.random() * 6 });
  }
}

// ---------------------------------------------------------------------------
// 机头倍率大屏（统一倍率显示在上方，出口只负责发光特效）
// ---------------------------------------------------------------------------
const multPanel = { tex: null, ctx: null };
{
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  multPanel.ctx = c.getContext('2d');
  multPanel.tex = new THREE.CanvasTexture(c);
  multPanel.tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: multPanel.tex, transparent: true });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.22), mat);
  m.position.set(0.60, 1.45, 0.192);
  machine.add(m);
  // 大屏外框
  const fw = 0.46, fh = 0.24, t = 0.016;
  for (const [w2, h2, x2, y2] of [
    [fw, t, 0.60, 1.45 + fh / 2], [fw, t, 0.60, 1.45 - fh / 2],
    [t, fh, 0.60 - fw / 2, 1.45], [t, fh, 0.60 + fw / 2, 1.45],
  ]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w2, h2, 0.03), M.chrome);
    b.position.set(x2, y2, 0.186);
    machine.add(b);
  }
}

function drawMultPanel(mult, litCount, on) {
  const g = multPanel.ctx;
  if (!g) return;
  const W = 512, H = 256;
  g.clearRect(0, 0, W, H);
  const col = !on ? '#3a4a5e' : mult >= 10 ? '#ff2f87' : mult >= 6 ? '#ffcc45' : '#2ee6ff';
  const txt = !on ? '#8fa4b8' : mult >= 10 ? '#ffd7e8' : mult >= 6 ? '#fff3c4' : '#dcfbff';

  g.beginPath(); g.roundRect(6, 6, W - 12, H - 12, 34);
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, 'rgba(6,14,24,.96)');
  bg.addColorStop(1, 'rgba(8,20,32,.92)');
  g.fillStyle = bg; g.fill();
  g.lineWidth = 7; g.strokeStyle = col;
  g.shadowColor = col; g.shadowBlur = on ? 26 : 8; g.stroke();
  g.shadowBlur = 0;

  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = col;
  g.font = '700 34px "PingFang SC",system-ui,sans-serif';
  g.fillText(on ? `点亮 ${litCount} 个出口` : '等待投币', W / 2, 48);

  g.fillStyle = txt;
  g.font = '900 132px "PingFang SC",system-ui,sans-serif';
  if (on) { g.shadowColor = col; g.shadowBlur = 30; }
  g.fillText(on ? '×' + mult : '× ?', W / 2, 150);
  g.shadowBlur = 0;
  multPanel.tex.needsUpdate = true;
}
drawMultPanel(0, 0, false);

// ---------------------------------------------------------------------------
// 物理 & 球
// ---------------------------------------------------------------------------
const { world, matBall } = buildPhysicsWorld(CFG);
const trail = [];
{
  for (let i = 0; i < 9; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: GLOW_TEX, color: 0x9fe9ff, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    s.scale.setScalar(0.1);
    scene.add(s);
    trail.push(s);
  }
}

let ballBody = null;
let ballMesh = null;
let dyingBall = null;

function spawnRailBall() {
  if (dyingBall) { scene.remove(dyingBall.mesh); dyingBall.mesh.geometry.dispose(); dyingBall.mesh.material.dispose(); dyingBall = null; }
  removeBall();
  const y0 = CFG.railBottomY + CFG.ballR + 0.01;
  ballBody = createBallAt(world, CFG, matBall, CFG.railX, y0, CFG.laneZ, 0, 0, 0);
  ballBody.type = CANNON.Body.KINEMATIC;
  ballBody.addEventListener('collide', (e) => {
    const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
    if (v > 0.35 && ballMesh) onPegHit(v, ballMesh.position);
  });
  attachPegRoughness(ballBody, Math.random, 0.4);
  ballMesh = new THREE.Mesh(new THREE.SphereGeometry(CFG.ballR, 26, 20), M.ball.clone());
  ballMesh.material.transparent = true;
  ballMesh.castShadow = true;
  scene.add(ballMesh);
  for (const s of trail) s.material.opacity = 0;
}

function removeBall() {
  if (ballBody) { world.removeBody(ballBody); ballBody = null; }
  if (ballMesh) { scene.remove(ballMesh); ballMesh.geometry.dispose(); ballMesh.material.dispose(); ballMesh = null; }
}

function onPegHit(vel, pos) {
  audio.peg(vel);
  if (pos && vel > 0.8) burst(pos, 0xbfefff, 2, Math.min(1, vel / 3) * 0.4);
}

const sparks = [];
{
  for (let i = 0; i < 30; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: GLOW_TEX, color: 0xbfefff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    s.scale.setScalar(0.06);
    scene.add(s);
    sparks.push({ sprite: s, life: 0, max: 0.2, vx: 0, vy: 0 });
  }
}

function burst(pos, color = 0xbfefff, count = 5, power = 0.5) {
  let n = 0;
  for (const p of sparks) {
    if (p.life > 0) continue;
    p.life = 0.18 + Math.random() * 0.16;
    p.max = p.life;
    p.sprite.position.copy(pos);
    p.sprite.material.color.setHex(color);
    p.sprite.scale.setScalar(0.035 + Math.random() * 0.03);
    const a = Math.random() * Math.PI * 2;
    p.vx = Math.cos(a) * power * (0.3 + Math.random());
    p.vy = Math.sin(a) * power * (0.3 + Math.random());
    if (++n >= count) break;
  }
}

const ringMat = new THREE.MeshBasicMaterial({
  color: 0xffcc45, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false,
});
const winRing = new THREE.Mesh(new THREE.RingGeometry(0.10, 0.13, 48), ringMat);
winRing.visible = false;
scene.add(winRing);
let ringLife = 0;

// ---------------------------------------------------------------------------
// 音效：全部实现在 audio.js（Web Audio 合成，无音频资源文件）
// 浏览器要求音频必须由用户手势激活，所以所有输入事件都先 ensureAudio()
// ---------------------------------------------------------------------------
function ensureAudio() { audio.unlock(); }

// ---------------------------------------------------------------------------
// 状态 / UI
// ---------------------------------------------------------------------------
const BET_LEVELS = [8, 16, 24, 32, 48, 64, 96, 128];
const CHIP_PER_BALL = 1;   // 1 筹码 = 1 颗筹码球

const state = {
  chips: 1000,
  stake: 8,
  rounds: 0,
  totalBet: 0,
  totalWin: 0,
  phase: 'idle',        // idle | loading | armed | dropping | resolve
  round: null,          // {slots, mult, litCount}
  history: [],
  landings: [],
  auto: 0,
  charging: false,
  dragMode: false,
  power: 0,
  chargeDir: 1,
  boost: null,          // 弹簧释放时的加速过程
};

const ui = {
  credits: document.getElementById('credits'),
  stakeView: document.getElementById('stakeView'),
  multView: document.getElementById('multView'),
  litView: document.getElementById('litView'),
  rounds: document.getElementById('rounds'),
  betGrid: document.getElementById('betGrid'),
  fireBtn: document.getElementById('fireBtn'),
  fireLabel: document.getElementById('fireLabel'),
  fireSub: document.getElementById('fireSub'),
  autoBtn: document.getElementById('autoBtn'),
  sfxBtn: document.getElementById('sfxBtn'),
  helpBtn: document.getElementById('helpBtn'),
  closeSheet: document.getElementById('closeSheet'),
  sheet: document.getElementById('sheet'),
  histList: document.getElementById('histList'),
  winFx: document.getElementById('winFx'),
  winMult: document.getElementById('winMult'),
  winGain: document.getElementById('winGain'),
  winSub: document.getElementById('winSub'),
  toast: document.getElementById('toast'),
  powerWrap: document.getElementById('powerWrap'),
  powerFill: document.getElementById('powerFill'),
};

function toast(msg) {
  ui.toast.textContent = msg;
  ui.toast.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => ui.toast.classList.remove('show'), 1600);
}
function fmt(n) { return n.toLocaleString('zh-CN'); }
function setBtnLabel(main, sub) { ui.fireLabel.textContent = main; ui.fireSub.textContent = sub; }

function refreshHud() {
  ui.credits.textContent = fmt(state.chips);
  ui.rounds.textContent = state.rounds;
  ui.litView.textContent = state.round ? state.round.litCount : '--';
  ui.fireBtn.disabled = state.phase === 'loading' || state.phase === 'dropping' || state.phase === 'resolve';
  switch (state.phase) {
    case 'idle': setBtnLabel('下注', 'SPACE'); break;
    case 'loading': setBtnLabel('装填中…', '请稍候'); break;
    case 'armed': setBtnLabel('拉杆', '往下拖再松手'); break;
    case 'dropping': setBtnLabel('下落中…', '---'); break;
    case 'resolve': setBtnLabel('结算中…', '---'); break;
  }
  ui.powerWrap.style.visibility = state.charging ? 'visible' : 'hidden';
}

function buildBetButtons() {
  ui.betGrid.innerHTML = '';
  for (const v of BET_LEVELS) {
    const b = document.createElement('button');
    b.className = 'chip-btn' + (v === state.stake ? ' on' : '');
    b.textContent = v;
    b.onclick = () => {
      ensureAudio();
      audio.click();
      if (state.phase !== 'idle') return;
      state.stake = v;
      buildBetButtons();
    };
    ui.betGrid.appendChild(b);
  }
}

function multColor(mult) {
  return mult >= 10 ? NEON.magenta : mult >= 6 ? NEON.gold : NEON.cyan;
}
function multTier(mult) {
  return mult >= 10 ? 'pink' : mult >= 6 ? 'gold' : 'cyan';
}

function setSlotLed(i, lit, mult) {
  const s = slots[i];
  s.lit = lit;
  s.mult = mult;
  if (!lit) {
    // 没被选中的出口：全灭，只留一点点冷色反光，和金色拉开最大对比
    s.beam.visible = false;
    s.ringMat.color.setHex(0x121c28);
    s.ringMat.opacity = 0.7;
    s.cavMat.emissive.setHex(0x000000);
    s.cavMat.emissiveIntensity = 0;
    s.ledMat.emissive.setHex(0x04070c);
    s.ledMat.emissiveIntensity = 0.25;
    s.ledMat.color.setHex(0x0a121c);
    s.plateMat.color.setHex(0x8a99aa);
    s.plateMat.opacity = 0.8;
    s.haloMat.opacity = 0;
    s.poolMat.opacity = 0;
    return;
  }
  // 被指定的出口：整条轨道刷成金色并发光
  const g = GOLDFX;
  s.ringMat.color.setHex(g);
  s.ringMat.opacity = 1;
  // 洞腔保持暗底：点亮只靠描边 + 光柱 + 光晕，不要整块纯色面
  s.cavMat.emissive.setHex(0x000000);
  s.cavMat.emissiveIntensity = 0;
  s.beam.visible = true;
  s.beamMat.color.setHex(g);
  s.ledMat.color.setHex(g);
  s.ledMat.emissive.setHex(g);
  s.ledMat.emissiveIntensity = 5.0;
  s.plateMat.color.setHex(0xfff0b8);
  s.plateMat.opacity = 1;
  s.haloMat.opacity = 1;
  s.poolMat.opacity = 0.55;
}

function lightRound() {
  for (let i = 0; i < slots.length; i++) setSlotLed(i, false, 0);
  const r = state.round;
  for (const i of r.slots) setSlotLed(i, true, r.mult);
  ui.multView.textContent = `×${r.mult}`;
  ui.multView.style.fontSize = '';
  drawMultPanel(r.mult, r.litCount, true);
}

// ---- 开局：先把本局的倍率和点亮出口定下来，玩家看到倍数再决定投多少 ----
function newRound() {
  state.round = drawRound();
  lightRound();
  audio.round(state.round.litCount);
  refreshHud();
}

// ---- 投币（筹码球装填）----
function insertChips(instant = false) {
  ensureAudio();
  if (state.phase !== 'idle') return;
  if (state.chips < state.stake) { toast('筹码不足，请降低投注'); return; }

  state.chips -= state.stake;
  state.totalBet += state.stake;
  if (!state.round) state.round = drawRound();   // 正常情况已有本局结果，这里只兜底
  chipLoaded = 0;
  spawnRailBall();
  refreshHud();

  if (instant) {
    chipLoaded = state.stake;
    drawReadout(chipLoaded, state.stake);
    ui.stakeView.textContent = fmt(chipLoaded);
    armRound();
    return;
  }

  state.phase = 'loading';
  chipQueue = state.stake;
  chipSpawnT = Math.min(0.14, Math.max(0.028, 2.2 / state.stake));
  drawReadout(0, state.stake);
  ui.stakeView.textContent = '0';
  refreshHud();
}

function armRound() {
  state.phase = 'armed';
  state.boost = null;
  lightRound();
  refreshHud();
}

function startCharge() {
  if (state.phase !== 'armed') return;
  state.charging = true;
  state.dragMode = false;
  state.power = 0;
  state.chargeDir = 1;
  refreshHud();
}

// ---- 拖拽拉杆：按住拉杆头（或机台任意处）往下拖，拖得越深劲越大 ----
let dragCharge = null;
function beginDrag(clientY) {
  if (state.phase !== 'armed') return false;
  state.charging = true;
  state.dragMode = true;
  state.power = 0;
  dragCharge = { y0: clientY };
  refreshHud();
  return true;
}

function launch(instant = false) {
  if (!state.charging || state.phase !== 'armed' || !ballBody) return;
  state.charging = false;
  state.dragMode = false;
  dropT = 0;
  pendingLaunch = null;
  // 拉杆力道 -> 初速，全部交给物理：够力才爬得上弯道，不够力自然滚回
  const v0 = CFG.launchVMin + (CFG.launchVMax - CFG.launchVMin) * state.power;
  const up = localDir(0, 1, 0);
  const jit = (Math.random() * 2 - 1) * 0.25;
  const side = localDir(jit, 0, 0);
  ballBody.type = CANNON.Body.DYNAMIC;
  ballBody.wakeUp();
  if (instant) {
    ballBody.velocity.set(up.x * v0 + side.x, up.y * v0 + side.y, up.z * v0 + side.z);
  } else {
    // 弹簧释放：球在若干帧内被推着加速，视觉上是"弹"出去而不是瞬移
    state.boost = { t: 0, dur: 0.07, v0, up };
    ballBody.velocity.set(up.x * v0 * 0.3, up.y * v0 * 0.3, up.z * v0 * 0.3);
  }
  ballBody.angularVelocity.set(0, 0, -v0 / CFG.ballR * 0.2);
  state.phase = 'dropping';
  audio.launch(state.power);
  refreshHud();
}

// 点按钮 / 敲空格：先让弹簧拉杆真的被拉下去，再弹出去（可见动作）
function requestLaunch() {
  if (!state.charging || state.phase !== 'armed') return;
  if (plungerPull < Math.max(0.25, state.power * 0.75)) {
    pendingLaunch = { t: 0, dur: 0.14 };
    return;
  }
  launch();
}

function resolveSlot(idx) {
  state.phase = 'resolve';
  state.rounds++;
  state.landings.push(idx);
  audio.land(ballBody ? ballBody.velocity.length() : 1);

  const r = state.round;
  const hit = r && r.slots.includes(idx);
  const gain = hit ? state.stake * r.mult : 0;
  state.totalWin += gain;
  state.chips += gain;

  if (hit) {
    audio.win(r.mult);
    ui.winMult.textContent = '×' + r.mult;
    ui.winGain.textContent = '+' + fmt(gain);
    ui.winSub.textContent = `第 ${idx + 1} 号出口 · 投注 ${state.stake}`;
    ui.winFx.classList.add('show');
    setTimeout(() => ui.winFx.classList.remove('show'), 1250);

    const local = new THREE.Vector3(slotCenterX(idx), CFG.dividerTop + 0.1, 0.12);
    local.applyMatrix4(machine.matrixWorld);
    winRing.position.copy(local);
    winRing.visible = true;
    ringLife = 0.7;
    ringMat.opacity = 0.9;
    ringMat.color.setHex(multColor(r.mult));
    burst(local, 0xffe1a0, 14, 1.1);
    shake = 0.055;
    flash = 0.5;
  } else {
    audio.lose();
    shake = 0.018;
  }

  if (ballBody) { world.removeBody(ballBody); ballBody = null; }
  if (ballMesh) {
    const curve = makeReturnPath(idx);
    const len = curve.getLength();
    dyingBall = { mesh: ballMesh, t: 0, u: 0, len, curve, dur: Math.max(0.45, Math.min(0.85, len / 2.8)) };
    ballMesh = null;
  }

  state.history.unshift({ idx, mult: hit ? r.mult : 0, gain, stake: state.stake });
  state.history = state.history.slice(0, 8);
  renderHistory();
  refreshHud();

  setTimeout(() => {
    state.phase = 'idle';
    newRound();                     // 立刻摇下一局：倍数先出，再投注
    if (state.auto > 0) {
      state.auto--;
      if (state.auto === 0) ui.autoBtn.classList.remove('on');
      setTimeout(autoStep, 420);
    }
  }, 900);
}

function autoStep() {
  if (state.phase !== 'idle') return;
  insertChips();                       // 自动试玩也走完整的筹码装填动画
  const tryFire = () => {
    if (state.phase === 'armed') { state.charging = true; state.power = 0.35 + Math.random() * 0.5; requestLaunch(); return; }
    if (state.phase === 'loading') setTimeout(tryFire, 220);
  };
  setTimeout(tryFire, 400);
}

function renderHistory() {
  ui.histList.innerHTML = '';
  for (const h of state.history) {
    const d = document.createElement('div');
    if (h.gain > 0) {
      d.className = 'hrow ' + (h.mult >= 6 ? 'big' : 'win');
      d.innerHTML = `<span>#${h.idx + 1} ×${h.mult}</span><span>+${fmt(h.gain)}</span>`;
    } else {
      d.className = 'hrow lose';
      d.innerHTML = `<span>#${h.idx + 1} 未中</span><span>-${fmt(h.stake)}</span>`;
    }
    ui.histList.appendChild(d);
  }
  if (!state.history.length) {
    ui.histList.innerHTML = '<div class="hrow lose"><span>暂无记录</span><span></span></div>';
  }
}

// ---------------------------------------------------------------------------
// 输入
// ---------------------------------------------------------------------------
ui.fireBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  ensureAudio();
  if (state.phase === 'idle') insertChips();
  else if (state.phase === 'armed') beginDrag(e.clientY);
});

// 直接抓住机台右下角的拉杆头拖：往下拉 → 弹簧拉长 → 松手弹出
stage.addEventListener('pointerdown', (e) => {
  if (e.target !== renderer.domElement) return;
  ensureAudio();
  if (state.phase === 'idle') { insertChips(); return; }
  if (state.phase === 'armed') beginDrag(e.clientY);
});

window.addEventListener('pointermove', (e) => {
  if (!dragCharge) return;
  state.power = Math.max(0, Math.min(1, (e.clientY - dragCharge.y0) / 150));
});

window.addEventListener('pointerup', () => {
  if (dragCharge) {
    dragCharge = null;
    state.dragMode = false;
    if (state.power < 0.06) state.power = 0.62;   // 只是点了一下：给一个稳稳能出去的中等力道
  }
  if (state.charging) requestLaunch();
});

ui.autoBtn.onclick = () => {
  ensureAudio();
  audio.click();
  if (state.auto > 0) { state.auto = 0; ui.autoBtn.classList.remove('on'); return; }
  state.auto = 10;
  ui.autoBtn.classList.add('on');
  autoStep();
};
ui.helpBtn.onclick = () => { audio.click(); ui.sheet.classList.add('show'); };
ui.closeSheet.onclick = () => { audio.click(); ui.sheet.classList.remove('show'); };

// ---- 音效开关（记忆到 localStorage，也可以按 M）----
function syncSfxBtn() {
  const off = audio.isMuted();
  if (ui.sfxBtn) {
    ui.sfxBtn.textContent = off ? '音效 关' : '音效 开';
    ui.sfxBtn.classList.toggle('on', off);
  }
}
if (ui.sfxBtn) {
  ui.sfxBtn.onclick = () => {
    ensureAudio();
    audio.toggle();
    syncSfxBtn();
    audio.click();
  };
}
syncSfxBtn();
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    if (e.repeat) return;
    ensureAudio();
    if (state.phase === 'idle') insertChips();
    else if (state.phase === 'armed') startCharge();
  }
  if (e.code === 'KeyM') { ensureAudio(); audio.toggle(); syncSfxBtn(); audio.click(); }
  if (e.code === 'Escape') ui.sheet.classList.remove('show');
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space' && state.charging) { e.preventDefault(); requestLaunch(); }
});
window.addEventListener('pointerdown', () => ensureAudio(), { once: true });

const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
window.addEventListener('pointermove', (e) => {
  pointer.tx = (e.clientX / window.innerWidth - 0.5) * 2;
  pointer.ty = (e.clientY / window.innerHeight - 0.5) * 2;
});

// ---------------------------------------------------------------------------
// 主循环
// ---------------------------------------------------------------------------
let last = performance.now();
let shake = 0;
let flash = 0;
let t = 0;
let ballStuckT = 0;
let dropT = 0;
let pendingLaunch = null;
let ballSlowT = 0;
let ballEnteredField = false;
let plungerPull = 0;
let knobVel = 0;

function animate(now) {
  requestAnimationFrame(animate);       // 先续帧：下面任何提前 return 都不会把主循环弄死
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  t += dt;

  world.step(1 / 300, dt, 12);
  if (ballBody && state.phase === 'dropping') {
    laneConstrain(ballBody, CFG, 1 / 300);
    domeConstrain(ballBody, CFG, 1 / 300);
  }

  // ---- 筹码球装填动画：先在玻璃板面上滑落，再被高出玻璃的导条送进中间的洞 ----
  if (state.phase === 'loading') {
    chipSpawnT -= dt;
    if (chipSpawnT <= 0 && chipQueue > 0) {
      const b = chipBalls.find((x) => !x.active);
      if (b) {
        chipQueue--;
        b.active = true;
        b.mode = 0;
        const { cx, w } = CHIP_WINDOW;
        const span = w / 2 - 0.075;
        b.x = cx + (chipQueue % 2 === 0 ? 1 : -1) * (0.16 + Math.random() * (span - 0.16));
        b.y = CHIP_WINDOW.top - 0.03;
        b.v = 0.2;
        b.mesh.visible = true;
        b.mesh.position.set(b.x, b.y, chipBalls.surfaceZ);
      }
      chipSpawnT = Math.min(0.14, Math.max(0.028, 2.2 / state.stake));
    }
  }
  for (const b of chipBalls) {
    if (!b.active) continue;
    if (b.mode === 0) {
      // 玻璃面上自由下滑（机台后仰，球顺着玻璃往下走）
      b.v = Math.min(2.8, b.v + 7.0 * dt);
      b.y -= b.v * dt;
      b.mesh.rotation.z -= b.v * dt / 0.026;
      const ax = Math.abs(b.x - RAMP.cx);
      if (ax <= CHIP_WINDOW.holeHalf && b.y <= CHIP_WINDOW.bot + 0.075) {
        b.mode = 2;
      } else if (ax > CHIP_WINDOW.holeHalf && b.y <= rampYAt(ax) + 0.026) {
        b.mode = 1;                      // 撞到导条，开始沿导条滑向洞口
        b.v = Math.max(0.9, b.v * 0.75);
      }
      b.mesh.position.set(b.x, b.y, chipBalls.surfaceZ);
    } else if (b.mode === 1) {
      const dir = Math.sign(b.x - RAMP.cx) || 1;
      const ax = Math.max(CHIP_WINDOW.holeHalf, Math.abs(b.x - RAMP.cx) - b.v * 1.25 * dt);
      b.x = RAMP.cx + dir * ax;
      b.y = rampYAt(ax) + 0.026;
      b.mesh.rotation.z -= dir * (b.v * dt) / 0.026;
      b.mesh.position.set(b.x, b.y, chipBalls.surfaceZ);
      if (ax <= CHIP_WINDOW.holeHalf + 0.001) b.mode = 2;
    } else {
      // 掉进洞里
      b.v += 6 * dt;
      b.mesh.position.y -= b.v * dt;
      if (b.mesh.position.y < CHIP_WINDOW.bot + 0.005) {
        b.active = false;
        b.mesh.visible = false;
        chipLoaded += CHIP_PER_BALL;
        drawReadout(chipLoaded, state.stake);
        ui.stakeView.textContent = fmt(chipLoaded);
        audio.chip(chipLoaded);
        burst(localPos(RAMP.cx, CHIP_WINDOW.bot + 0.09, chipBalls.glassZ), 0xffd76a, 3, 0.4);
        if (chipLoaded >= state.stake) armRound();
      }
    }
  }

  // ---- 弹射杆（往后拉 → 弹簧拉长；松手 → 弹簧把杆弹回，钢珠被顶出去）----
  if (pendingLaunch && state.charging) {
    pendingLaunch.t += dt;
    const k = Math.min(1, pendingLaunch.t / pendingLaunch.dur);
    plungerPull = k * Math.max(0.55, state.power);
    knobVel = 0;
    if (k >= 1) launch();
  } else if (state.charging) {
    if (!state.dragMode) {
      state.power += state.chargeDir * dt / 0.55;
      if (state.power >= 1) { state.power = 1; state.chargeDir = -1; }
      if (state.power <= 0) { state.power = 0; state.chargeDir = 1; }
    }
    ui.powerFill.style.height = (state.power * 100).toFixed(0) + '%';
    ui.powerFill.style.background = state.power > 0.75 ? 'linear-gradient(180deg,#ff7bbe,#ff2f87)' : 'linear-gradient(180deg,#aef4ff,#2ee6ff)';
    audio.dragTick(state.power);
    plungerPull = state.power;
    knobVel = 0;
  } else if (plungerPull > -0.24) {
    // 松手回弹：弹簧把拉杆猛推回去，带一点过冲
    knobVel += (-520 * plungerPull - 15 * knobVel) * dt;
    plungerPull += knobVel * dt;
    if (plungerPull < -0.24) { plungerPull = -0.24; knobVel *= -0.35; }
  }
  if (plunger) plunger.position.y = PLUNGE.y - plungerPull * PLUNGE.travel;
  if (springMesh) springMesh.scale.y = Math.max(0.3, (SPRING_LEN + plungerPull * PLUNGE.travel) / SPRING_LEN);

  // 待发时球就坐在拉杆头上：拉杆往下拉，球跟着一起沉下去
  // 下沉量要限制住：沉太深会被压进滑道底板，球瞬间被弹飞/穿出世界（打不出去）
  if (ballBody && state.phase === 'armed' && ballBody.type === CANNON.Body.KINEMATIC) {
    const py = CFG.railBottomY + CFG.ballR + 0.01 - Math.min(BALL_SINK_MAX, plungerPull * PLUNGE.travel);
    const p0 = localPos(CFG.railX, py, CFG.laneZ);
    ballBody.position.set(p0.x, p0.y, p0.z);
    ballBody.velocity.set(0, 0, 0);
    ballBody.angularVelocity.set(0, 0, 0);
  }

  // ---- 球 ----
  if (ballBody && ballMesh) {
    // 弹簧释放：前 70ms 里持续把球往上顶，形成可见的加速过程
    if (state.boost) {
      state.boost.t += dt;
      const k = Math.min(1, state.boost.t / state.boost.dur);
      const sp = state.boost.v0 * (0.3 + 0.7 * k);
      const u = state.boost.up;
      ballBody.velocity.set(u.x * sp, u.y * sp, u.z * sp);
      if (k >= 1) state.boost = null;
    }
    ballMesh.position.set(ballBody.position.x, ballBody.position.y, ballBody.position.z);
    ballMesh.quaternion.set(ballBody.quaternion.x, ballBody.quaternion.y, ballBody.quaternion.z, ballBody.quaternion.w);

    for (let i = trail.length - 1; i > 0; i--) {
      trail[i].position.copy(trail[i - 1].position);
      trail[i].material.opacity = trail[i - 1].material.opacity * 0.86;
    }
    trail[0].position.copy(ballMesh.position);
    trail[0].material.opacity = state.phase === 'dropping' ? 0.5 : 0;
    trail[0].scale.setScalar(0.075);

    const local = ballMesh.position.clone();
    machine.worldToLocal(local);

    if (state.phase === 'dropping') {
      dropT += dt;
      // 兜底：球飞出台面/卡死就收回弹射位，别一直挂着"下落中"
      const lost = Math.abs(local.x) > 1.18 || local.y < -1.5 || local.z > 0.6 || local.z < -0.4;
      if (lost || dropT > 12) {
        if (ballBody) { world.removeBody(ballBody); ballBody = null; }
        if (ballMesh) { scene.remove(ballMesh); ballMesh.geometry.dispose(); ballMesh.material.dispose(); ballMesh = null; }
        dropT = 0;
        spawnRailBall();
        state.phase = 'armed';
        state.boost = null;
        refreshHud();
        return;
      }
      // 力度不足：钢珠没爬上弯道又滚回底部 -> 回到待发状态重新蓄力
      const inRailBottom = local.x > CFG.railX - 0.12 && local.y < CFG.railBottomY + 0.5;
      const fellOut = local.y < CFG.railBottomY - 0.10;      // 兜底：掉到滑道底以下直接收回
      if (fellOut || (inRailBottom && ballBody.velocity.length() < 0.45)) {
        ballBody.type = CANNON.Body.KINEMATIC;
        ballBody.velocity.set(0, 0, 0);
        ballBody.angularVelocity.set(0, 0, 0);
        const p0 = localPos(CFG.railX, CFG.railBottomY + CFG.ballR + 0.01, CFG.laneZ);
        ballBody.position.set(p0.x, p0.y, p0.z);
        state.phase = 'armed';
        state.boost = null;
        dropT = 0;
        refreshHud();
        return;
      }

      ballStuckT += dt;
      if (ballStuckT > 0.26) { nudge(ballBody); ballStuckT = 0; }
      if (ballBody.velocity.length() < 0.15 && local.y > -0.9) {
        ballSlowT += dt;
        if (ballSlowT > 2.0) {
          ballBody.applyImpulse(new CANNON.Vec3((Math.random() < 0.5 ? -1 : 1) * 0.0022, 0.0012, 0), ballBody.position);
          ballSlowT = 0;
        }
      } else ballSlowT = 0;

      if (local.y > 0.9) ballEnteredField = true;

      const inField = Math.abs(local.x) < CFG.boardW / 2 - 0.02;
      if (local.y < -0.97 && inField) {
        resolveSlot(slotIndexFromX(local.x));
      }
    }
  } else {
    for (const s of trail) s.material.opacity *= 0.9;
  }

  // 回球：入口落下的球沿回球槽滚回弹射位（滚到位后就停在那儿，等下一局）
  if (dyingBall && !dyingBall.done) {
    dyingBall.t += dt;
    const k = Math.min(1, dyingBall.t / dyingBall.dur);
    const u = 1 - Math.pow(1 - k, 1.7);
    const prev = dyingBall.u;
    dyingBall.u = u;
    dyingBall.mesh.position.copy(dyingBall.curve.getPointAt(u));
    const ds = (u - prev) * dyingBall.len;
    if (ds > 0) dyingBall.mesh.rotateOnWorldAxis(RETURN_AXLE, ds / CFG.ballR);
    if (k >= 1) {
      dyingBall.done = true;
      audio.chip(0);
    }
  }

  // ---- 点亮出口呼吸灯 + 上升粒子 ----
  const litIdx = state.round ? state.round.slots : [];
  for (const s of slots) {
    if (!s.lit) continue;
    const pulse = 0.5 + 0.5 * Math.sin(t * 5.0 + s.cx * 7);
    const live = state.phase !== 'resolve';
    s.ringMat.opacity = 0.72 + 0.28 * pulse;
    s.ring.scale.set(1 + 0.05 * pulse, 1 + 0.03 * pulse, 1);
    s.beamMat.opacity = (live ? 0.42 : 0.22) * (0.6 + 0.8 * pulse);
    s.beam.scale.set(1 + 0.10 * pulse, 0.9 + 0.22 * pulse, 1);
    s.ledMat.emissiveIntensity = 2.6 + 3.2 * pulse;
    s.haloMat.opacity = 0.55 + 0.45 * pulse;
    s.halo.scale.setScalar(0.20 + 0.12 * pulse);
    s.poolMat.opacity = 0.35 + 0.35 * pulse;
  }
  for (const sp of sparkles) {
    if (sp.life > 0) {
      sp.life -= dt;
      sp.sprite.position.y += sp.vy * dt;
      sp.sprite.position.x += Math.sin(t * 5 + sp.wob) * 0.0004;
      sp.sprite.material.opacity = Math.max(0, sp.life / sp.max) * 0.85;
    } else if (litIdx.length) {
      const slotI = litIdx[Math.floor(Math.random() * litIdx.length)];
      const s = slots[slotI];
      sp.slot = slotI;
      sp.max = sp.life = 0.5 + Math.random() * 0.6;
      sp.vy = 0.18 + Math.random() * 0.22;
      sp.sprite.position.set(
        s.cx + (Math.random() - 0.5) * 0.13,
        CFG.dividerTop - 0.05 + Math.random() * 0.1,
        0.11,
      );
      sp.sprite.material.color.setHex(GOLDFX);
      sp.sprite.scale.setScalar(0.02 + Math.random() * 0.025);
      sp.sprite.material.opacity = 0;
    }
  }

  // ---- 火花 / 冲击环 ----
  for (const p of sparks) {
    if (p.life <= 0) continue;
    p.life -= dt;
    p.sprite.position.x += p.vx * dt * 0.4;
    p.sprite.position.y += p.vy * dt * 0.4;
    p.vy -= 1.6 * dt;
    p.sprite.material.opacity = Math.max(0, p.life / p.max) * 0.9;
  }
  if (ringLife > 0) {
    ringLife -= dt;
    const k = 1 - ringLife / 0.7;
    winRing.scale.setScalar(1 + k * 9);
    ringMat.opacity = Math.max(0, (1 - k) * 0.9);
    if (ringLife <= 0) winRing.visible = false;
  }

  // ---- 相机 ----
  pointer.x += (pointer.tx - pointer.x) * Math.min(1, dt * 4);
  pointer.y += (pointer.ty - pointer.y) * Math.min(1, dt * 4);
  shake *= Math.pow(0.0015, dt);
  camera.position.set(
    CAM_BASE.x + pointer.x * 0.16 + (Math.random() - 0.5) * shake,
    CAM_BASE.y - pointer.y * 0.10 + (Math.random() - 0.5) * shake,
    CAM_BASE.z,
  );
  camera.lookAt(pointer.x * 0.04, LOOK_Y - pointer.y * 0.02, 0);

  bloom.strength = 0.26 + flash;
  flash *= Math.pow(0.02, dt);

  composer.render();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  bloom.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------------------
// 调试 / 启动
// ---------------------------------------------------------------------------
machine.updateMatrixWorld(true);
buildBetButtons();
renderHistory();
refreshHud();
drawReadout(0, 0);

function showDebug(title, lines) {
  const d = document.getElementById('err');
  d.style.display = 'block';
  d.style.background = title.includes('FAIL') ? '#8b0020' : '#0b3a20';
  d.textContent = title + '\n' + lines.join('\n');
}

if (location.hash.includes('simtest')) {
  for (const k of Object.keys(audio)) if (typeof audio[k] === 'function') audio[k] = () => {};  // 无头环境 Web Audio 会让渲染进程崩
  setTimeout(() => {
    const log = [];
    try {
      for (let r = 0; r < 6; r++) {
        insertChips(true);
        state.charging = true;
        state.power = 0.45 + Math.random() * 0.55;
        launch(true);
        let guard = 0;
        while (state.phase === 'dropping' && guard++ < 300 * 15 && ballBody && ballMesh) {
          world.step(1 / 300);
          laneConstrain(ballBody, CFG, 1 / 300);
          domeConstrain(ballBody, CFG, 1 / 300);
          ballStuckT += 1 / 300;
          if (ballStuckT > 0.26) { nudge(ballBody); ballStuckT = 0; }
          ballMesh.position.set(ballBody.position.x, ballBody.position.y, ballBody.position.z);
          const local = ballMesh.position.clone();
          machine.worldToLocal(local);
          if (local.y < -0.97 && Math.abs(local.x) < CFG.boardW / 2 - 0.02) {
            resolveSlot(slotIndexFromX(local.x));
            break;
          }
        }
        if (state.phase === 'dropping') log.push(`round ${r + 1}: STUCK (guard=${guard})`);
        log.push(`round ${r + 1}: lit=${state.round ? state.round.litCount : '?'} mult=${state.round ? state.round.mult : '?'} chips=${state.chips}`);
        if (ballBody) { world.removeBody(ballBody); ballBody = null; }
        if (ballMesh) { scene.remove(ballMesh); ballMesh = null; }
        if (dyingBall) { scene.remove(dyingBall.mesh); dyingBall = null; }
        state.phase = 'idle';
        newRound();
      }
      log.push(`rounds=${state.rounds} bet=${state.totalBet} win=${state.totalWin} RTP=${(state.totalWin / state.totalBet * 100).toFixed(1)}%`);
      log.push('landings=' + state.landings.join(','));
      showDebug('SIMTEST OK', log);
    } catch (e) { showDebug('SIMTEST FAIL: ' + e.message + '\n' + e.stack, []); }
  }, 800);
}
if (location.hash.includes('auto')) {
  state.auto = 10;
  setTimeout(autoStep, 600);
  if (location.hash.includes('chipdbg')) {
    setTimeout(() => {
      const act = chipBalls.filter((b) => b.active).length;
      const p = chipBalls.find((b) => b.active);
      showDebug('CHIPDBG', [
        `queue=${chipQueue} loaded=${chipLoaded} active=${act} stake=${state.stake} per=${CHIP_PER_BALL}`,
        p ? `first x=${p.x.toFixed(2)} y=${p.y.toFixed(2)} mode=${p.mode} surfZ=${chipBalls.surfaceZ}` : 'none active',
        `phase=${state.phase} err=${window.__err || '-'}`,
        `win=${JSON.stringify(CHIP_WINDOW)} rampMid=${rampYAt(0).toFixed(2)} rampEdge=${rampYAt(CHIP_WINDOW.w/2-0.075).toFixed(2)}`,
      ]);
    }, 2600);
  }
}
if (location.hash.includes('launchdbg')) {   // 调试：满力弹射并记录轨迹
  setTimeout(() => insertChips(true), 400);
  setTimeout(() => { state.power = 1; state.charging = true; launch(true); }, 700);
  const traj = [];
  const t0 = performance.now();
  const tick = setInterval(() => {
    if (!ballBody) return;
    const l = new THREE.Vector3().copy(ballBody.position);
    machine.worldToLocal(l);
    traj.push(`${((performance.now() - t0) / 1000).toFixed(2)}s x=${l.x.toFixed(2)} y=${l.y.toFixed(2)} z=${l.z.toFixed(2)} v=${ballBody.velocity.length().toFixed(1)}`);
    if (traj.length > 22) clearInterval(tick);
  }, 60);
  setTimeout(() => showDebug('LAUNCHDBG', traj.slice(-14)), 2200);
}
if (location.hash.includes('btndbg')) {      // 调试：模拟"按按钮下注 + 再按按钮拉杆"
  const say = (s) => console.log('[BTNDBG]', s);
  setTimeout(() => { insertChips(true); say('inserted phase=' + state.phase + ' ball=' + !!ballBody); }, 400);
  setTimeout(() => { state.charging = true; state.power = 0.34; requestLaunch(); say('pressed phase=' + state.phase); }, 1000);
  for (const ms of [1400, 1800, 2400, 3200, 4200, 5200]) {
    setTimeout(() => {
      const dp = dyingBall ? [dyingBall.mesh.position.x, dyingBall.mesh.position.y, dyingBall.mesh.position.z].map((v) => v.toFixed(2)).join(',') : '-';
      say(`t=${ms} phase=${state.phase} ball=${!!ballBody} dying=${!!dyingBall} done=${dyingBall ? !!dyingBall.done : '-'} dpos=${dp}`);
    }, ms);
  }
}
if (location.hash.includes('uidbg')) {       // 调试：走真实 DOM 按钮事件，逐帧记录
  const log = [];
  const say = (s) => { log.push(s); if (log.length > 16) log.shift(); showDebug('UIDBG', log); console.log('[U]', s); };
  for (const k of Object.keys(audio)) if (typeof audio[k] === 'function') audio[k] = () => {};  // 无头环境 Web Audio 会让渲染进程崩
  const fire = () => {
    const r = ui.fireBtn.getBoundingClientRect();
    const o = { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true, pointerId: 1 };
    ui.fireBtn.dispatchEvent(new PointerEvent('pointerdown', o));
    setTimeout(() => window.dispatchEvent(new PointerEvent('pointerup', o)), 110);
  };
  setTimeout(() => { insertChips(true); say('armed? ' + state.phase + ' ball=' + !!ballBody); }, 300);
  setTimeout(() => { fire(); say('press armed=' + state.phase); }, 600);
  let n = 0;
  const tick = setInterval(() => {
    if (!ballBody) { say('[' + (n++) + '] no ball'); return; }
    const l = new THREE.Vector3().copy(ballBody.position); machine.worldToLocal(l);
    say(`[${n++}] ${state.phase} chg=${state.charging ? 1 : 0} pend=${pendingLaunch ? 1 : 0} pull=${plungerPull.toFixed(2)} v=${ballBody.velocity.length().toFixed(2)} y=${l.y.toFixed(2)}`);
  }, 120);
  setTimeout(() => { clearInterval(tick); say('END ' + state.phase); }, 2600);
}
if (location.hash.includes('lit')) {         // 截图用：直接摆到已点亮状态
  setTimeout(() => { insertChips(true); }, 500);
}
if (location.hash.includes('returndbg')) {   // 截图用：摆一颗球在回球槽中段
  setTimeout(() => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(CFG.ballR, 26, 20), M.ball.clone());
    scene.add(mesh);
    if (!location.hash.includes('nopatch')) {
      const curve = makeReturnPath(3);
      dyingBall = { mesh, t: parseFloat(new URLSearchParams(location.hash.replace('#', '&')).get('rt') || '0'), u: 0, len: curve.getLength(), curve, dur: 0.8 };
    } else {
      const sx = slotCenterX(3);
      mesh.position.copy(localPos(sx, -1.15, 0.09));
    }
  }, 600);
}
// 调试镜头：#...&cam=3.2 把相机拉近（截图用）
{
  const m = location.hash.match(/cam=([\d.]+)/);
  const my = location.hash.match(/camy=(-?[\d.]+)/);
  const mx = location.hash.match(/camx=(-?[\d.]+)/);
  if (m) CAM_BASE.z = parseFloat(m[1]);
  if (my) { CAM_BASE.y = parseFloat(my[1]); LOOK_Y = CAM_BASE.y - 0.05; }
  if (mx) CAM_BASE.x = parseFloat(mx[1]);
}

newRound();                         // 进场就先亮出本局倍率
spawnRailBall();                    // 进场球就坐在拉杆上（之后每局由回球槽滚回来）
console.log(`理论 RTP ${(theoreticalRtp() * 100).toFixed(2)}%  出口数 ${SLOT_COUNT}`);

// 调试：#probe=x,y （屏幕归一化坐标）射线拾取，把命中的模型名/材质/位置打到页面上
if (location.hash.includes('probe')) {
  const pm = location.hash.match(/probe=([\d.]+),([\d.]+)/);
  const nx0 = pm ? parseFloat(pm[1]) : 0.9, ny = pm ? parseFloat(pm[2]) : 0.62;
  setTimeout(() => {
    const rc = new THREE.Raycaster();
    const scan = [];
    const N = 30;
    for (let i = 0; i <= N; i++) {
      const nx = nx0 + (0.57 - nx0) * i / N;
      rc.setFromCamera(new THREE.Vector2(nx * 2 - 1, -(ny * 2 - 1)), camera);
      const h = rc.intersectObjects(scene.children, true)[0];
      if (!h) { scan.push(`${nx.toFixed(3)} miss`); continue; }
      const o = h.object, mt = o.material || {};
      const pp = o.geometry && o.geometry.parameters ? JSON.stringify(o.geometry.parameters) : '';
      scan.push(`${nx.toFixed(3)} d${h.distance.toFixed(2)} ${o.geometry.type} #${mt.color ? mt.color.getHexString() : '??'} p(${h.point.x.toFixed(2)},${h.point.y.toFixed(2)},${h.point.z.toFixed(2)}) ${pp.slice(0, 60)}`);
    }
    const pre = document.createElement('pre');
    pre.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;color:#0f0;background:#000c;font:12px monospace;padding:8px;margin:0;white-space:pre';
    pre.textContent = scan.join('\n');
    document.body.appendChild(pre);
  }, 8000);
}
requestAnimationFrame(animate);
