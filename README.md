# Pachinko Drop · 3D 柏青哥（弹珠机）

网页 3D 弹珠机：three.js 渲染 + cannon-es 物理仿真，单文件产物 `pachinko-drop.html`，双击即可玩（无需服务器）。

## 玩法

1. **开奖先行**：每局开始时机头大屏先公布本局点亮哪几个出口、基础倍率，然后玩家再决定投注。
2. **投币**：筹码 0 枚起步，点左下角「投币 +10」（或按 `C` 键，或**直接点机台上的 3D 投币口**）每次获得 10 枚筹码，按钮上会累计投币次数，投币口同步播放吞币动画与音效。筹码以钢球形式从机台底部逐颗落进下方的金属受皿筐（真物理），看得见球越堆越多。
3. **下注**：选筹码（最少 8 枚，每 8 枚 = 1 枚筹码球），筹码球从玻璃面沿斜坡滚入中央洞完成装填；投注扣掉的球会从受皿筐里被吸上去，筐内同步减少。
4. **发射**：抓住右下角拉杆往下拖（弹簧真实拉伸），松手弹出，力道决定钢珠爬升高度。
5. **中奖**：钢珠落入点亮的出口即赢 `投注 × 倍数`。

## 倍率表

| 点亮出口 | 概率 | 倍率 |
| --- | --- | --- |
| 4 个 | 46% | 2×（偶尔 4×） |
| 3 个 | 22% | 2×（有时 4×） |
| 2 个 | 21% | 4×（偶尔 6×） |
| 1 个 | 11% | 6× / 8× / 10× |

倍率下限按命中率定：点亮 n 个出口命中率 = n/8，公平倍数 = 8/n，所以 4 口保底 2×、2 口保底 4×。理论 RTP ≈ 96.8%。

## 开发

```bash
cd pachinko3d
npm install
node build.mjs     # esbuild 打包为 ../pachinko-drop.html
```

物理参数与机台几何在 `pachinko3d/src/layout.mjs`，赔率模型在 `src/rules.mjs`（游戏与仿真共用）。

调试参数（URL hash）：`#simtest` 同步快进 6 局、`#auto` 自动试玩、`#chipdbg` 装填动画调试、`#lit` 摆拍点亮状态、`cam=` / `camy=` / `camx=` / `lookx=` 调相机。

验证脚本：`node src/t_track.mjs`（弹射轨道逐档测试）、`node src/t_mc.mjs 200`（蒙特卡洛落点分布）。

### 导出 GLB（给 Unity / UE 用）

```bash
node build_export.mjs                     # 打包 export.html（= 游戏 + GLTFExporter）
node tools/export_glb.mjs machine 2048    # 导整台机器（不带地面/墙）
node tools/export_glb.mjs scene 2048      # 导整场景
```

产物落在仓库根 `models/`：`pachinko_machine.glb` / `pachinko_scene.glb`。第二个参数是贴图边长上限，贴图偏大时调小（如 `1024`）能显著减小体积。实现上是在 `export.html?export=machine` 里调 `GLTFExporter`，用无头 Edge 触发下载再落到 `models/`，`export.html`、`models/`、`.edgeprof_export/` 都是生成物，不入库。

导出后可回读校验（用 three 重新加载 glb 渲染一张图到 `models/preview_machine.png`）：

```bash
node build_verify.mjs                     # 打包 verify.html（GLTFLoader 回读页）
node tools/verify_glb.mjs                 # 默认校验 models/pachinko_machine.glb
```

导入引擎注意：导出时默认把 InstancedMesh 摊平成普通 Mesh（避免 `EXT_mesh_gpu_instancing` 这个硬依赖扩展，部分导入器不认）；要保留实例化加 `&inst=keep`。Unity 用 glTFast / UnityGLTF 导入，UE5 直接拖入即可（glTF 是 Y-up、米制，UE 会自动转 Z-up/厘米）；`.glb` 里 PBR 材质和 PNG 贴图齐全，霓虹自发光走 emissive。

## 版本历史

完整说明见 [CHANGELOG.md](CHANGELOG.md)，发版约定也写在那个文件的末尾。

| 版本 | 主题 |
| --- | --- |
| `v1.4` | 筹码受皿筐（真物理）+ 点投币口投币 |
| `v1.3` | 投币系统 + 投注面板按钮尺寸统一 |
| `v1.2` | 去分片拼接、回球槽不被玻璃洗白 |
| `v1.1` | 弧带端头收口 + 窗缘填缝 + 整体压暗打光 |
| `v1.0` | 首个可玩版本 |

发版三件套：改代码 → `node build.mjs` 重打包 → 提交并打 **annotated** tag（`git tag -a vX.Y -m "vX.Y: 主题"`）→ 在 CHANGELOG 顶部补一段。轻量标签不写说明，禁止使用。

## 后续

同一套参数可移植 Unity / Godot。
