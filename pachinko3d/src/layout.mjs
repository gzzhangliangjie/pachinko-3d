import * as CANNON from 'cannon-es';

// ---------------------------------------------------------------------------
// 机台参数（单位：米，1 : 1 真实机台尺度）
// 盘面局部坐标系：x 右, y 上, z 朝观众（背面为 z=0）
// ---------------------------------------------------------------------------
export const CFG = {
  boardW: 1.60,
  boardH: 2.40,
  tiltDeg: 16,          // 盘面后仰角
  ballR: 0.045,
  ballMass: 0.035,
  gravity: 16,
  pegR: 0.0225,
  pegRows: 8,
  pegRowStart: 1.00,
  pegRowStep: 0.20,
  pegCols: 9,
  pegColStep: 0.19,
  pegZ: 0.045,          // 和球的静止 z 对齐，避免每次撞钉都把球往玻璃方向推（棘轮效应）
  slotCount: 8,
  dividerTop: -0.70,
  floorY: -1.08,
  restitutionBall: 0.62,
  restitutionPeg: 0.60,
  friction: 0.02,
  linearDamping: 0.02,

  // ---- 右侧弹射轨道：一条竖直的直滑道（完全没有弯）----
  railX: 0.95,          // 滑道中心 x
  railZ: 0.055,         // 与盘面碰撞平面同层
  railBottomY: -1.30,   // 滑道底部（装球处）
  railTopY: 0.78,       // 滑道上端：停在圆弧接管处之下（再高就会把球夹住）
  railChHalf: 0.075,    // 通道半宽
  railWallT: 0.015,     // 壁厚

  // ---- 顶部圆弧面板：一整条大半径圆弧，横跨整个机头上部 ----
  domeCx: 0.10,         // 圆弧圆心（内表面圆弧）
  domeCy: -0.16,         // 圆心低于盘面中线：球进弧时切向更顺
  domeR: 1.36,          // 内表面半径（越大越平缓）
  domeXRight: 1.04,     // 圆弧右端（接直滑道右壁）
  domeXLeft: -0.84,     // 圆弧左端（接左侧壁）
  domeExitX: -0.66,     // 球滚到这条 x 以左就脱离弧面，落进盘面
  domeDecel: 30.0,       // 球在弧面上的滚动阻力（m/s^2）：力道不同 → 爬的高度/脱轨点不同

  launchVMin: 9.4,      // 拉杆最轻时的初速（不足则贴弧滑回）
  launchVMax: 11.8,     // 拉杆拉满时的初速（再高就一直骑到弧顶最左端，全落 1 号口）
};

export function slotWidth(cfg = CFG) {
  return cfg.boardW / cfg.slotCount;
}

export function slotCenterX(i, cfg = CFG) {
  return -cfg.boardW / 2 + slotWidth(cfg) * (i + 0.5);
}

export function slotIndexFromX(x, cfg = CFG) {
  const i = Math.floor((x + cfg.boardW / 2) / slotWidth(cfg));
  return Math.max(0, Math.min(cfg.slotCount - 1, i));
}

export function pegPositions(cfg = CFG) {
  const out = [];
  const halfCols = (cfg.pegCols - 1) / 2;
  // 球贴着顶部圆弧滑行时，弧道半径内不能有钉子（否则会被钉子勾住减速）
  const domeLim = cfg.domeR - 2 * cfg.ballR - cfg.pegR - 0.012;
  for (let r = 0; r < cfg.pegRows; r++) {
    const y = cfg.pegRowStart - r * cfg.pegRowStep;
    const offset = r % 2 === 0 ? 0 : cfg.pegColStep / 2;
    for (let c = 0; c < cfg.pegCols; c++) {
      const x = (c - halfCols) * cfg.pegColStep + offset;
      if (Math.abs(x) > cfg.boardW / 2 - 0.055) continue;
      if (Math.hypot(x - cfg.domeCx, y - cfg.domeCy) > domeLim) continue;
      out.push({ x, y });
    }
  }
  return out;
}

/** 弹射轨道中心线：一条竖直直滑道（顶部交给圆弧面板） */
export function railPath(cfg = CFG) {
  const pts = [];
  const n1 = 14;
  for (let i = 0; i <= n1; i++) {
    const y = cfg.railBottomY + (cfg.railTopY - cfg.railBottomY) * i / n1;
    pts.push({ p: [cfg.railX, y, cfg.railZ], t: [0, 1, 0] });
  }
  return pts;
}

/** 盘面倾斜四元数（局部 -> 世界） */
export function tiltQuat(cfg = CFG) {
  const q = new CANNON.Quaternion();
  q.setFromEuler(-cfg.tiltDeg * Math.PI / 180, 0, 0);
  return q;
}

/** 局部方向 -> 世界方向 */
export function localDir(x, y, z, cfg = CFG) {
  const out = new CANNON.Vec3();
  tiltQuat(cfg).vmult(new CANNON.Vec3(x, y, z), out);
  return out;
}

/** 局部坐标 -> 世界坐标 */
export function localPos(lx, ly, lz, cfg = CFG) {
  const out = new CANNON.Vec3();
  tiltQuat(cfg).vmult(new CANNON.Vec3(lx, ly, lz), out);
  return out;
}

/**
 * 构建整台机器的静态碰撞体。
 */
export function buildPhysicsWorld(cfg = CFG) {
  const world = new CANNON.World({
    gravity: new CANNON.Vec3(0, -cfg.gravity, 0),
  });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.allowSleep = true;
  world.solver.iterations = 14;
  world.solver.tolerance = 0.001;
  world.defaultContactMaterial.friction = cfg.friction;
  world.defaultContactMaterial.restitution = 0.2;

  const matPeg = new CANNON.Material('peg');
  const matBoard = new CANNON.Material('board');
  const matRail = new CANNON.Material('rail');
  const matBumper = new CANNON.Material('bumper');
  const matWall = new CANNON.Material('wall');
  const matBall = new CANNON.Material('ball');
  world.addContactMaterial(new CANNON.ContactMaterial(matBall, matPeg, {
    friction: cfg.friction, restitution: cfg.restitutionPeg,
  }));
  world.addContactMaterial(new CANNON.ContactMaterial(matBall, matBoard, {
    friction: cfg.friction, restitution: cfg.restitutionBall * 0.6,
  }));
  world.addContactMaterial(new CANNON.ContactMaterial(matBall, matRail, {
    // 轨道只做导流：摩擦 0（否则贴后挡板滑动会被制动），弹性 0（球贴着弧面滑而不是弹跳）
    friction: 0, restitution: 0,
  }));
  world.addContactMaterial(new CANNON.ContactMaterial(matBall, matWall, {
    friction: 0.02, restitution: 0.86,   // 侧壁弹一点：球从弧上甩下来撞到左壁，能被弹回盘面中间
  }));
  world.addContactMaterial(new CANNON.ContactMaterial(matBall, matBumper, {
    friction: 0.05, restitution: 0.82,   // 偏转板像胶面：把上冲的力尽量转成水平飞出
  }));

  const q = tiltQuat(cfg);
  const toWorld = (lx, ly, lz) => localPos(lx, ly, lz, cfg);

  function addBox(hx, hy, hz, lx, ly, lz, material, extraQuat = null) {
    const b = new CANNON.Body({ mass: 0, material });
    b.addShape(new CANNON.Box(new CANNON.Vec3(hx, hy, hz)));
    b.position.copy(toWorld(lx, ly, lz));
    b.quaternion.copy(extraQuat ? q.mult(extraQuat) : q);
    world.addBody(b);
    return b;
  }

  const W = cfg.boardW, H = cfg.boardH, t = 0.04;

  // 背板
  addBox(W / 2 + t, H / 2 + t, 0.02, 0, 0, -0.02, matBoard);
  // 左侧壁（整高）
  addBox(t / 2, H / 2, 0.075, -(W / 2 + t / 2), 0, 0.055, matWall);
  // 右侧壁：上沿必须低于弧面上的球道，否则从弧顶滑回来的球会被这块墙的顶角顶停
  {
    const yTop = 0.84, yBot = -H / 2;
    addBox(t / 2, (yTop - yBot) / 2, 0.075, (W / 2 + t / 2), (yTop + yBot) / 2, 0.055, matWall);
    const cap = new CANNON.Body({ mass: 0, material: matWall });
    cap.addShape(new CANNON.Sphere(t / 2));
    cap.position.copy(toWorld(W / 2 + t / 2, yTop, 0.055));
    world.addBody(cap);
  }

  // 底部地面
  addBox(W / 2 + t, 0.02, 0.09, 0, cfg.floorY - 0.02, 0.055, matBoard);

  // 盘面正面玻璃：把球管在 z 方向（否则个别情况会被钉子挤到机台外面去）
  addBox(W / 2 + t, H / 2, 0.008, 0, 0, 0.125, matRail);

  // 钉子
  const pegs = pegPositions(cfg);
  for (const p of pegs) {
    const b = new CANNON.Body({ mass: 0, material: matPeg });
    b.addShape(new CANNON.Sphere(cfg.pegR));
    b.position.copy(toWorld(p.x, p.y, cfg.pegZ));
    b.isPeg = true;
    world.addBody(b);
  }

  // 出口隔板
  const sw = slotWidth(cfg);
  const dividers = [];
  for (let i = 0; i <= cfg.slotCount; i++) {
    const x = -W / 2 + sw * i;
    const h = (cfg.dividerTop - cfg.floorY) / 2;
    const y = (cfg.dividerTop + cfg.floorY) / 2;
    addBox(0.006, h, 0.045, x, y, 0.05, matBoard);
    dividers.push({ x, y, h });
  }

  // ---- 弹射轨道：一条竖直直滑道 + 顶部一整条圆弧面板 ----
  {
    const ch = cfg.railChHalf, wt = cfg.railWallT, zH = 0.06;
    const rx = cfg.railX, zb = cfg.railBottomY, rz = cfg.railZ;
    const bot = zb - 0.03;

    // 直滑道两侧壁：一整块长盒，从底到顶，完全没有弯
    // 顶端必须停在球道之下（否则球沿弧面回来时会被墙顶直角顶住），顶端加圆头
    for (const s of [-1, 1]) {
      const wx = rx + s * (ch + wt);
      addBox(wt, (cfg.railTopY - bot) / 2, zH, wx, (cfg.railTopY + bot) / 2, rz, matRail);
      const cap = new CANNON.Body({ mass: 0, material: matRail });
      cap.addShape(new CANNON.Sphere(wt));
      cap.position.copy(toWorld(wx, cfg.railTopY, rz));
      world.addBody(cap);
    }
    // 滑道底（弱弹滚回后的停球位）
    addBox(ch + wt, 0.015, zH, rx, zb - 0.015, rz, matRail);

    // 顶部圆弧面板不做盒子碰撞（分段盒子的棱角会把球顶停），
    // 改用 domeConstrain() 的解析弧面约束：球贴着一整条光滑的圆弧滑过去

    // 滑道前后封挡（玻璃罩）：后挡板 + 前玻璃，管住 z 方向不飞出
    addBox(0.34, 1.42, 0.012, 0.78, 0.02, -0.008, matRail);
    addBox(0.34, 1.42, 0.008, 0.78, 0.02, 0.135, matRail);
  }

  // 弹射轨道采用真物理碰撞体，无需路径引导
  const railPts = railPath(cfg);
  return { world, pegs, dividers, railPts, matBall, matPeg, matBoard, matRail, toWorld };
}

/** 在指定局部位置生成球（供弹射轨道使用） */
export function createBallAt(world, cfg, matBall, lx, ly, lz, vx = 0, vy = 0, vz = 0) {
  const b = new CANNON.Body({
    mass: cfg.ballMass,
    material: matBall,
    shape: new CANNON.Sphere(cfg.ballR),
  });
  b.position.copy(localPos(lx, ly, lz, cfg));
  b.linearDamping = cfg.linearDamping;
  b.angularDamping = 0.1;
  const v = localDir(vx, vy, vz, cfg);
  b.velocity.set(v.x, v.y, v.z);
  b.allowSleep = false;
  world.addBody(b);
  return b;
}

/** 球贴着一整条光滑圆弧内表面滑动（解析约束，替代分段盒子的棱角碰撞） */
export function domeConstrain(ball, cfg = CFG, dt = 1 / 300) {
  const q = tiltQuat(cfg);
  const qi = new CANNON.Quaternion(-q.x, -q.y, -q.z, q.w);   // 逆旋转（world -> local）
  const p = new CANNON.Vec3();
  qi.vmult(ball.position, p);
  const { domeCx, domeCy, domeR, domeXRight, domeExitX } = cfg;
  // 只在这段圆弧的范围内生效；越过出口就交还给自由物理
  if (p.x > domeXRight || p.x < domeExitX) return;
  const dx = p.x - domeCx, dy = p.y - domeCy;
  const d = Math.hypot(dx, dy);
  const lim = domeR - cfg.ballR;
  if (d <= lim || dy <= 0) return;          // 只约束圆顶上半部分
  const nx = dx / d, ny = dy / d;
  // 位置贴回内表面
  p.x = domeCx + nx * lim;
  p.y = domeCy + ny * lim;
  q.vmult(p, ball.position);
  // 光滑无摩擦弧面：把速度完全投影到切向（法向分量全部吃掉）
  const vl = new CANNON.Vec3();
  qi.vmult(ball.velocity, vl);
  const vn = vl.x * nx + vl.y * ny;
  if (vn > 0) {
    vl.x -= vn * nx;
    vl.y -= vn * ny;
  }
  // 弧面上的滚动阻力：沿切向减速，让球在力道不同时停在圆弧的不同位置
  const sp = Math.hypot(vl.x, vl.y);
  if (sp > 1e-4) {
    const dv = Math.min(sp, (cfg.domeDecel ?? 0) * dt);
    vl.x -= (vl.x / sp) * dv;
    vl.y -= (vl.y / sp) * dv;
  }
  q.vmult(vl, ball.velocity);
}

/**
 * 钉子表面不完美：每次撞钉给球一个很小的随机横向扰动。
 * 真实弹珠机的钉子/盘面 都有微小误差，球不会每次都走同一条确定轨迹。
 */
export function attachPegRoughness(ball, rng = Math.random, dv = 0.4) {
  const onHit = (e) => {
    if (!e.body || !e.body.isPeg) return;
    ball.velocity.x += (rng() * 2 - 1) * dv;
    ball.velocity.z += (rng() * 2 - 1) * dv * 0.15;
  };
  ball.addEventListener('collide', onHit);
  return () => ball.removeEventListener('collide', onHit);
}

export function nudge(ball, rng = Math.random) {
  ball.applyImpulse(
    new CANNON.Vec3((rng() * 2 - 1) * 0.00045, 0, 0),
    ball.position,
  );
}
