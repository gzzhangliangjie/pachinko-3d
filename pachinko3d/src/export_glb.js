// ---------------------------------------------------------------------------
// GLB 导出入口（给 Unity / UE 用）
// 构建：node build_export.mjs  ->  export.html
// 用法：export.html?export=machine  （=scene 导整场景，含地面/墙）
//       可选 &maxtex=1024  限制贴图边长；&name=xxx 指定文件名
// ---------------------------------------------------------------------------
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import './game.js';

function boot() {
  const q = new URLSearchParams(location.search);
  if (!q.get('export')) return;

  const target = q.get('export') === 'scene' ? 'scene' : 'machine';
  const maxTex = parseInt(q.get('maxtex') || '2048', 10);
  const flatten = q.get('inst') !== 'keep';
  const name = q.get('name') || (target === 'scene' ? 'pachinko_scene' : 'pachinko_machine');

  // 等模型/贴图都建好再导（首帧之后 + 一点余量）
  let frames = 0;
  const waitReady = () => {
    if (!window.__PACHINKO || ++frames < 3) return requestAnimationFrame(waitReady);
    setTimeout(() => doExport(target, maxTex, name, flatten), 300);
  };
  requestAnimationFrame(waitReady);
}

function collectStats(root) {
  let meshes = 0, tris = 0, inst = 0, mats = new Set(), texs = new Set();
  root.traverse((o) => {
    if (!o.isMesh) return;
    meshes++;
    const g = o.geometry;
    const count = g.index ? g.index.count : (g.attributes.position ? g.attributes.position.count : 0);
    const mult = o.isInstancedMesh ? o.count : 1;
    if (o.isInstancedMesh) inst++;
    tris += (count / 3) * mult;
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    ms.forEach((m) => {
      if (!m) return;
      mats.add(m.uuid);
      ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'alphaMap'].forEach((k) => {
        if (m[k]) texs.add(m[k].uuid);
      });
    });
  });
  return { meshes, instanced: inst, triangles: Math.round(tris), materials: mats.size, textures: texs.size };
}

// 导出前处理：
// 1) 给没名字的网格补名字（Unity/UE 里层级可读）
// 2) 把 InstancedMesh 摊平成普通 Mesh（EXT_mesh_gpu_instancing 是硬依赖，
//    部分导入器（尤其 UE 的 Interchange）不认，摊平后最稳）
function prepare(root, flattenInstances) {
  const doomed = [];
  let i = 0;
  root.traverse((o) => {
    if (o.isMesh && !o.name) {
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      const mname = (m && (m.name || m.type)) || 'mat';
      o.name = `${o.geometry ? o.geometry.type : 'mesh'}_${mname}_${i++}`;
    }
    if (flattenInstances && o.isInstancedMesh) doomed.push(o);
  });
  doomed.forEach((im) => {
    const parent = im.parent;
    const m4 = new window.__PACHINKO.THREE.Matrix4();
    for (let k = 0; k < im.count; k++) {
      const m = new window.__PACHINKO.THREE.Mesh(im.geometry, im.material);
      im.getMatrixAt(k, m4);
      m.applyMatrix4(m4);
      m.name = `${im.name || 'inst'}_${k}`;
      m.castShadow = im.castShadow;
      m.receiveShadow = im.receiveShadow;
      parent.add(m);
    }
    parent.remove(im);
  });
}

function doExport(target, maxTex, name, flattenInstances) {
  const { scene, machine } = window.__PACHINKO;
  const root = target === 'scene' ? scene : machine;
  prepare(root, flattenInstances);
  const stats = collectStats(root);
  stats.instancedFlattened = flattenInstances;
  window.__EXPORT_INFO = { target, ...stats };

  new GLTFExporter().parse(
    root,
    (buf) => {
      const bytes = buf.byteLength;
      const blob = new Blob([buf], { type: 'model/gltf-binary' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name + '.glb';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);

      // 给自动化/调试用：同时把 base64 挂到 window 上（按需取）
      window.__EXPORT_INFO.bytes = bytes;
      window.__EXPORT_INFO.file = name + '.glb';
      window.__EXPORT_GLB_B64 = () => btoa(String.fromCharCode.apply(null, new Uint8Array(buf)));
      window.__EXPORT_DONE = true;
      console.log('[export]', name + '.glb', (bytes / 1024 / 1024).toFixed(2), 'MB', JSON.stringify(stats));
    },
    (err) => {
      window.__EXPORT_ERROR = String(err && err.message || err);
      console.error('[export] failed', err);
    },
    { binary: true, onlyVisible: true, maxTextureSize: maxTex, includeCustomExtensions: false },
  );
}

boot();
