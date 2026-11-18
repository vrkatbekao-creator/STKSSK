# 原始台北篇遺留資料集中區（供確認後決定保留或刪除）

本資料夾集中存放已不再被高雄篇程式（`v0.1.0`）、建置流程或自動化測試讀取的「原始台北篇」圖資來源、建置／驗證腳本、舊版 QA 截圖與前期研究檔，共 **82 個檔案、約 29.52 MB（30,953,757 bytes）**。

若確認不需要留作歷史對照或重跑台北資料建置，**可直接刪除整個 `legacy-taipei-archive/` 資料夾**（建議使用 `git rm -r legacy-taipei-archive` 或直接刪除資料夾後提交）。

---

## 一、已集中至此資料夾的項目（共 82 檔 / 29.52 MB）

### 1. `design/assets/`（15 檔，25.66 MB）
原始臺北市空間圖資、遙測高程與場所 CSV 快照（高雄版已改用 `kaohsiung-*` 來源）：
- `taipei-bridges-source.json`（臺北市橋梁 JSON）
- `taipei-buildings-source.json.gz`（臺北市建物 OSM 萃取，10.5 MB）
- `taipei-copdem-30m.tif`（台北裁切 Copernicus 30m DEM）
- `taipei-districts-source.zip` / `taipei-districts.geojson`（臺北市 12 區輪廓）
- `taipei-rivers-source.kml`（臺北市河川 KML）
- `taipei-roads-osm-source.json.gz` / `taipei-roads-source-metadata.json`（臺北市道路 OSM 來源與詮釋資料）
- `taipei-surface-source-metadata.json`（台北地表高程詮釋資料）
- `taipei-walk-source.json.gz`（臺北市步行路網來源，7.88 MB）
- `taipei-wonders.geojson`（台北 12 地標幾何）
- `places-source/`（`markets.csv`、`mrt-exits.csv`、`night-markets.csv`、`corrections.json` — 臺北市公有市場、台北捷運出口與夜市資料）

### 2. `design/scripts/`（16 檔，0.08 MB）
僅讀寫上述台北來源檔的早期建置與驗證 Python 腳本：
- `build_campaign_map.py`, `build_city_places.py`, `build_street_tactics.py`, `build_taipei_buildings.py`, `build_taipei_roads.py`, `build_taipei_surface.py`, `build_wonder_catalog.py`, `convert_districts.py`, `extract_taipei_buildings.py`, `extract_walk_network.py`, `extract_vehicle_network.py`, `fetch_taipei_roads.py`, `validate_taipei_roads.py`, `validate_landscape.py`, `validate_street_tactics.py`, `audit_vehicle_source.py`

### 3. `design/qa/`（49 檔，3.77 MB）
- `city-outreach/`, `movement/`, `pages/`, `v08/`, `v09/`, `v10/`, `v12/`, `v14/`, `v15/`, `v16/`：台北篇 v0.8–v16 開發期間拍攝的舊版瀏覽器 QA 截圖與除錯圖檔。

### 4. `design/research/`（2 檔，0.01 MB）
- `campaign-color-evidence.json`（2026-10-31 台北候選人色票查證紀錄）
- `wonder-source-extract.json`（北投等台北觀光署景點擷取）

---

## 二、特別提醒：下列「檔名仍叫 `taipei-*`」但內容已替換為【高雄資料】— 請勿刪除！

為維持 `src/`、`public/data/` 與現有 270 項單元測試的引用路徑相容，以下檔案雖仍沿用 `taipei-*` 舊檔名，**實際內容已經全數是高雄 300 公尺六角格資料（`origin: [180000, 2505000]`）**：
- `src/data/taipei-map.json`（實際為 `kaohsiung-hex-v1`）
- `src/data/taipei-places.json`（實際為 `kaohsiung-places-v1`）
- `src/data/taipei-street-map-v2.json` / `.js` / `.d.ts`（實際為 `kaohsiung-street-hex-v1`）
- `src/data/taipei-wonders.json`（實際為 `kaohsiung_v0.18_300m`）
- `public/data/taipei-buildings-v1.json.gz`（實際為 `kaohsiung-buildings-v1`）
- `public/data/taipei-places-v1.json`（實際為 `kaohsiung-places-v1`）
- `public/data/taipei-roads-v1.json.gz`（實際為 `kaohsiung-osm-roads-v1`）
- `public/data/taipei-surface-v1.json.gz` & `public/data/taipei-surface-hillshade.png`（實際為 `kaohsiung-surface-v1`）
- `public/data/taipei-walk-network-v2.json.gz`（實際為 `kaohsiung-street-hex-v1`）
- `src/TaipeiWarmup.tsx`（實際顯示駁二、大港橋、衛武營等高雄暖身問答）
