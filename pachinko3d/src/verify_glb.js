// GLB 回读校验页：用 three 重新加载导出的 glb 并渲染一张图（验范 normals/贴图/层级是否正常）
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const q = new URLSearchParams(location.search);
const url = q.get('glb') || '../dist/pachinko_machine.glb';

const W = 900, H = 900;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d1219);
scene.add(new THREE.HemisphereLight(0xcfe4ff, 0x1a2430, 2.0));
const d1 = new THREE.DirectionalLight(0xffffff, 2.6); d1.position.set(3, 5, 6); scene.add(d1);
const d2 = new THREE.DirectionalLight(0x66ccff, 1.2); d2.position.set(-5, 2, -3); scene.add(d2);

const camera = new THREE.PerspectiveCamera(35, W / H, 0.01, 200);
const sheet = document.createElement('div');
sheet.style.cssText = 'position:fixed;left:8px;bottom:8px;color:#9fd;font:12px monospace;white-space:pre';
document.body.appendChild(sheet);

new GLTFLoader().load(
  url,
  (gltf) => {
    scene.add(gltf.scene);
    const bb = new THREE.Box3().setFromObject(gltf.scene);
    const size = bb.getSize(new THREE.Vector3());
    const c = bb.getCenter(new THREE.Vector3());
    const r = Math.max(size.x, size.y, size.z);
    camera.position.set(c.x + r * 0.45, c.y + r * 0.25, c.z + r * 1.35);
    camera.lookAt(c);
    renderer.render(scene, camera);
    let meshes = 0, tris = 0;
    const names = [];
    gltf.scene.traverse((o) => {
      if (o.isMesh) {
        meshes++;
        const g = o.geometry;
        tris += (g.index ? g.index.count : (g.attributes.position ? g.attributes.position.count : 0)) / 3;
        if (names.length < 6) names.push(o.name);
      }
    });
    window.__INFO = {
      size: size.toArray().map((v) => +v.toFixed(3)),
      meshes, tris: Math.round(tris),
      sampleNames: names,
      animations: gltf.animations.length,
    };
    sheet.textContent = JSON.stringify(window.__INFO);
    window.__OK = true;
  },
  undefined,
  (err) => { window.__ERR = String(err && err.message || err); sheet.textContent = 'ERR ' + window.__ERR; },
);
