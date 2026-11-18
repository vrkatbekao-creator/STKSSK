# 選戰騎士團 高雄篇 全市掃街 · v0.1.0

**Election Knights: Kaohsiung — 3D Citywide Canvassing (`v0.1.0`)**

一款以高雄 12 大生活圈（鹽埕、鼓山、左營、三民、苓雅、前鎮、旗津、小港、鳳山、岡山、美濃、大樹）為舞台的單機 **3D 選戰戰棋遊戲**。帶領三個虛構喜感陣營之一，在 28 天日夜賽局中運用高機動 AP、跨區宣傳車掃、在地舞台與政論辯論爭取支持；第 15 天起進入封關民調盲打，直到第 28 天夜間開票結算。

A single-player **3D turn-based campaign tactics game** set across **12 Kaohsiung zones** on a **300 m hex grid** (`SIZE = 150 m`). Lead one of three comedic fictional factions across 28 days of high-mobility neighborhood outreach, cross-district motorcades, community stages, and live debates. Polling goes dark on day 15 until final night tallying concludes on day 28.

| 版本 / Edition | 線上試玩與程式碼 / Play & Source |
| --- | --- |
| **v0.1.0 · 3D 高雄主線（預設）／ 3D Kaohsiung Preview** | [開啟 3D 線上試玩 / Play 3D Edition](https://vrkatbekao-creator.github.io/STKSSK/) |
| **2D 切換模式 / 2D View Fallback** | [開啟 2D 視圖 / Open 2D View](https://vrkatbekao-creator.github.io/STKSSK/?view=2d) |
| **程式碼倉庫 / Repository** | [github.com/vrkatbekao-creator/STKSSK](https://github.com/vrkatbekao-creator/STKSSK) |
| **回報問題 / Issues** | [提交問題 / Report an issue](https://github.com/vrkatbekao-creator/STKSSK/issues/new?template=bug_report.yml) |

> 改編自原作台北首都篇 [`vrkatbekao-creator/STKSST`](https://github.com/vrkatbekao-creator/STKSST) 並針對高雄尺度、2026 高雄視覺色彩與高機動 AP 規則重製。<br>
> Built on the [`STKSST`](https://github.com/vrkatbekao-creator/STKSST) engine, rebuilt for Kaohsiung’s geography, 2026 Kaohsiung visual themes, and expanded AP tactical pacing.

---

## 核心特色 / Key Features

### 1. 高雄 3D 地圖與 Rust/WASM 路網尋路 · 3D Map & Rust/WASM Routing
- **MapLibre GL 3D 渲染**：預設即為 3D 視角，整合高雄 12 大戰區輪廓、真實 OpenStreetMap 道路、3D 建物擠出輪廓，以及本機打包的高雄 Copernicus GLO-30 3D 地形圖磚（無需外部地圖金鑰）。
- **Rust + WebAssembly 高速演算**：車行跨區尋路（含單行道與轉彎限制）與夜間對手 AI 均在背景 Worker 中由 `stksst_core.wasm` 執行。
- **300 公尺街區尺度**：全高雄共 13,785 格六角格（半徑 150 m / 直徑 300 m），涵蓋 172 處傳統市場／夜市／捷運輕軌站點、26,751 筆建物輪廓與 12 座高雄地標奇觀（大港橋與駁二、85 大樓與流行音樂中心、蓮池潭龍虎塔、衛武營、旗津燈塔等）。

*Powered by MapLibre GL (pitched 3D Copernicus GLO-30 terrain, extruded OSM buildings, road layers) and a Rust/WebAssembly worker (`stksst_core.wasm`) for turn-restricted vehicle routing and rival AI turns.*

### 2. AP 增加與五大活用機制 · High-Mobility AP Economy
- **基礎 AP 提升**：一般職位 **15 AP**、斥候／外送線 **19 AP**（原台北版為 7 / 9 AP）。
- **每日步行免扣額度**：每名隊員每日享有 **1,800 公尺**加權路程免扣 AP 額度（支援同商圈連續趕攤），並支援上車點附近 `< 300 m` 路邊零額外扣稅。
- **夜間衝刺津貼**：進入夜間階段，場上可用單位自動補充 **+4 AP**。
- **總部應援令（HQ Tokens）**：各陣營開局獲得 **2 枚總部應援令**（可於回合中補 **+1 AP**，並透過成長／事件補給）。
- **輕量化駐點行動**：一般拜訪與掃街統一降至 **1 AP**，鼓勵「長途車掃＋下車深度經營」。

*Higher base AP (15 / 19), +4 AP nightfall recharge, 1,800 m daily free walking pool, HQ +1 AP tokens, and 1 AP canvass/visit actions keep both wide motorcades and local street loops fast and rewarding.*

### 3. 三大虛構喜感陣營與 2026 高雄視覺色 · Factions & 2026 Kaohsiung Palette
- **暖港接棒軍・賴水龍**（`green`／`jiang`）：參考 2026 高雄南方崛起主視覺採 **南方桃紅**（`#F5659B` / `#C41D63`），主將技「南方強打・港都全壘打」（護盾＋南方熱點＋8 km 車掃里程＋下次拜訪 0 AP）。
- **陽光外景軍・柯知恩**（`blue`／`shen`）：參考 2026 高雄雙主色看板採 **港灣科技藍 ＋ 豐收陽光黃**（`#0E62A8` / `#FFD23F`），主將技「繞著港都跑・外景直球點名」（壓制對手宣講＋熱點＋+4 AP＋3.6 km 步行額度）。
- **白草奇兵團・白阿草**（`white`／`huang`）：採 **輕軌潔白 ＋ 薄荷青**（`#F7FAFF` / `#1B7A72`），主將技「關鍵搖擺・棄保槓桿」（抽走對手 AP＋停火談判區＋下次掃街無視街區飽和）。
- 內建三套獨立原創 RGBA 角色立繪與 18 項高雄在地職務（三山鐵票里長、外景大聲公助教、大港護航樁腳、前鎮漁港直送員、園區鍵盤工程師、丹丹漢堡急救員等）。

---

## 本機開發與建置 / Local Development & Build

### 需求環境 / Prerequisites
- Node.js `>= 22.12.0`
- Rust toolchain（含 `wasm32-unknown-unknown` target，僅重建 WASM 時需要）
- Python 3 + Pillow / NumPy（僅重產 `public/alpha-data/` 3D 地形圖磚時需要）

### 快速啟動 / Quick Start

```sh
# 1. 安裝套件 / Install dependencies
npm ci

# 2. 打包 WASM 與 3D 地形／車行資產（首次或更新地圖後執行）
#    Build Rust WASM core & package Kaohsiung 3D terrain/vehicle assets
npm run alpha:assets

# 3. 執行型別檢查與單元測試 / Type-check and run unit tests (270 tests)
npm run check
npm test

# 4. 建置正式版並本機預覽 / Production build & preview
npm run build
npm run preview -- --host 127.0.0.1 --port 4179
```

開啟瀏覽器前往 `http://127.0.0.1:4179/` 即可遊玩 3D 版（若需 2D 檢視可加上 `?view=2d`）。

### GitHub Pages 部署 / Publishing to GitHub Pages

```sh
# 驗證測試、檢查套件並打包以 /STKSSK/ 為基底的 3D 靜態網站，再推送到 gh-pages 分支
npm run deploy:pages
```

---

## 授權與資料歸屬 / License & Data Credits

- **程式碼與本專案文件**：採 [MIT License](LICENSE)，使用或改作請保留授權聲明並標註作者 `vrkatbekao-creator` 與本專案／上游專案來源（[STKSST](https://github.com/vrkatbekao-creator/STKSST)）。
- **第三方開源軟體與公開圖資**：地圖路網與建物採 OpenStreetMap（ODbL-1.0），地表高程採 Copernicus GLO-30 DSM，詳細署名與條款見 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) 與 [public/data/GAME-DATA-CREDITS.txt](public/data/GAME-DATA-CREDITS.txt)。
