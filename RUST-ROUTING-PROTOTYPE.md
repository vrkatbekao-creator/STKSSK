# Rust／WASM 步行尋路原型

此原型以 `46a1661` 為基準，使用現有的全市 STR1 步行路網與原始 edge ID。Rust 核心提供有 AP 上限的可達格 Dijkstra，以及 A*／Dijkstra 單點查詢。搜尋以實際路網距離計價，每 1,500 加權公尺 1 AP，沿用佔格、雨天、階梯與施工規則。

Worker 初始化接收已驗證的 STR1 位元組及由現有圖資中繼資料擷取的格索引、道路錨點與階梯 way ID。Rust 驗證欄位界線、端序、索引、方向、距離及幾何偏移後，以緊湊鄰接表重建拓樸，雙向 edge ID 展開順序與 TypeScript 一致。查詢回傳有序 edge IDs 與 AP，或可達格索引／AP 配對。路線可沿用現行圖層的原始幾何；投影和經緯度輸出留在 3D 顯示層接線時處理。

Worker 傳遞 ArrayBuffer 所有權，JS／WASM 邊界仍會複製初始化資料和查詢結果。Rust 原型與正式 TypeScript 費率目前分開定義，正式切換時須確立單一權威來源。現有遊戲入口、Zustand、三槽存檔及部署版仍執行原本程式。

## 重現方法

```powershell
rustup target add wasm32-unknown-unknown
cargo test --offline --manifest-path stksst-core/Cargo.toml
cargo build --offline --release --target wasm32-unknown-unknown --manifest-path stksst-core/Cargo.toml
node design/benchmark-rust-routing.mjs
```

本機 Node 24 Worker 使用同一份 SHA 核對的台北路網，以三個起點、三組天候／施工條件比對九次可達格查詢及 108 條目的地查詢。所有可達格和 AP 一致；可走的 Dijkstra 路線逐條核對 edge IDs，A* 核對合法連續路徑、加權距離及 AP。等成本路徑可能不同。另測試截斷資料拒絕後重試、單行、佔格和 AP 邊界。

| 查詢 | 樣本 | 中位數 | p95 |
| --- | ---: | ---: | ---: |
| TypeScript 有界 Dijkstra | 9 | 352.57 ms | 504.30 ms |
| Rust／WASM Worker 有界 Dijkstra | 9 | 31.80 ms | 46.50 ms |
| Rust／WASM Worker 單點 Dijkstra | 108 | 26.83 ms | 40.27 ms |
| Rust／WASM Worker 單點 A* | 108 | 25.62 ms | 45.39 ms |

WASM 約 46 KB，初始化約 479 ms，包含本機資料讀取、解壓、SHA、WASM 編譯及 Worker 初始化。此為單機少量樣本，九次全區 p95 即最慢一次。單點 A* 中位數略快，p95 略慢。整個 AI 回合和弱裝置記憶體待量測。雙向 Dijkstra、ALT、車行轉向、正式遊戲命令及 UI 接線留待後續。

## Chrome Worker 實測（2026-11-14）

依上方指令先建置 WASM，執行 `npm run dev -- --port 5173 --strictPort`，再開啟 `/design/rust-routing-qa.html` 並按下「執行比較」。驗證頁走瀏覽器的模組 Worker，使用全市 STR1 和固定測試局。

Windows Chrome 通過四組可達格、48 組目的地（每組各跑 A* 和 Dijkstra），確認格子 AP、Dijkstra 道路 edge ID、A* 路線連續性、佔格與加權距離。截斷圖資遭拒後，完整圖資可在同一個 Worker 重新初始化，並核對傳入的 ArrayBuffer 所有權已轉移。

| 場景 | 可達格 | TypeScript | WASM Worker |
| --- | ---: | ---: | ---: |
| 晴天 | 28,566 | 788.4 ms | 107.2 ms |
| 雨天 | 27,103 | 782.0 ms | 78.7 ms |
| 雨天及施工 | 1,000 | 55.0 ms | 6.6 ms |
| 零 AP | 1 | <0.1 ms | 0.5 ms |

測試頁觀察到的 Worker 初始化為 315.1 ms，含圖資讀取、解壓、SHA 驗證、WASM 編譯、截斷檔測試與重試，遊戲模組載入在計時之前。每場景為單次量測。正式遊戲命令、完整 AI 回合、其他瀏覽器及低階設備仍待驗證。

## 移動、續玩與 AI 回合比對（2026-11-14）

重建 WASM 後執行 `node design/benchmark-rust-campaign.mjs`。兩個獨立 Node Worker 從同一種子開局，各自跑兩次步行命令及三次完整夜間結算。Rust 組僅在測試 Worker 內替換道路搜尋，沿用現行遊戲命令、AI、足跡及存檔程式；Rust 同步回傳可達格、前驅 edge ID 和精確加權距離。這條測試路徑有轉回 Map 的成本，正式瀏覽器遊戲尚未切換至 Rust。

兩次步行後，第 3 槽的記憶體測試存檔均可經現行 Store 續玩，原始存檔字串維持一致。兩組的移動與每日結算存檔逐字一致，包含 AP、足跡與 AI 結算結果。

| 夜間結算 | TypeScript | Rust／WASM |
| --- | ---: | ---: |
| 第 1 夜 | 10,740 ms | 2,787 ms |
| 第 2 夜 | 14,253 ms | 5,444 ms |
| 第 3 夜 | 7,637 ms | 1,929 ms |

此批約快 2.6–4.0 倍。每組各一次，部分執行期間另有測試工作。兩組初始化成本分開計時，分別約 1.4 秒和 2.6 秒。Rust 共處理 57 次實際搜尋，合計約 7.3 秒，包含結果轉回現行資料結構。Chrome 複測也通過四組完整搜尋樹及 48 組目的地，逐節點核對前驅道路和加權距離；Chrome 驗證頁的效能欄仍量測只回傳可達格的查詢。完整 28 天、正式瀏覽器遊戲回合與低階裝置未驗證。

## 單核心資源壓力測試（2026-11-14）

Windows／Intel Core i5-1235U 上將 Node 24 行程及其 Workers 綁至同一邏輯 CPU，先測無額外負載，再以同核心的背景 Worker 持續運算。每組查詢暖機一次後各執行 30 次，計時包含 Worker 往返及輸出轉移。兩種負載下的輸出摘要一致，所有 180 次查詢均與各自的暖機結果逐項一致。

| 查詢 | 單核心中位數／p95 | 同核心有競爭中位數／p95 | 回傳大小 |
| --- | ---: | ---: | ---: |
| 晴天全區可達格 | 76／147 ms | 150／372 ms | 223 KiB |
| 雨天完整搜尋樹 | 115／226 ms | 364／1,383 ms | 3.68 MiB |
| 中正區至信義區單點 | 10／30 ms | 38／437 ms | 876 bytes |

初始化分別約 0.86 秒及 18.26 秒，包含圖資讀取、SHA 驗證、解壓、WASM 編譯及 Worker 初始化。全程採樣最高 Node 行程 RSS 約 329 MiB，含主行程、Worker、圖資、暫存與輸出，不能當成手機端遊戲峰值。兩種負載依序在同一行程執行，分組 RSS 不適合直接比較。

測試未包含瀏覽器繪圖、低記憶體限制、行動裝置溫控或完整夜間回合，低階 Android 實機仍待驗證。就這批壓力樣本，UI 預覽優先使用單點或僅可達格的查詢，完整搜尋樹適合留在運算端或等正式 AI 接線時再量測傳輸成本。

建置 WASM 後，在獨立的 PowerShell 工作階段重現。關閉該工作階段即可結束 affinity 變更。

```powershell
$process = [Diagnostics.Process]::GetCurrentProcess()
$mask = $process.ProcessorAffinity.ToInt64()
$process.ProcessorAffinity = [IntPtr]($mask -band (-$mask))
node design/benchmark-rust-low-resource.mjs
```

## 正式遊戲步行命令測試

建置 WASM 並啟動 Vite 後，開啟 `http://127.0.0.1:5173/?routing=wasm`。此開發模式使用同一套遊戲 UI、Zustand、移動命令與三槽讀寫流程，測試槽保存在記憶體，關閉或重新整理即清除。地圖預覽沿用 TypeScript，按下「確認移動」時由 Rust Worker 計算單點 Dijkstra，現行命令重新驗證連續道路、當前佔格、目的地和 AP，再更新狀態與存檔。回傳前若遊戲、槽位或所選角色已不同，結果捨棄。Worker 啟動或執行失敗時使用既有步行命令。

Chrome 英文遊戲介面在第 3 槽開局，選擇南門市場、預覽並確認移動。頁面記錄的成功引擎為 WASM，藍方主將 AP 14→13，新增一段當日步行。存檔回首頁再續玩第 3 槽，保留 13 AP 及當日步行。自動化另核對一次成功命令只寫入一次、無效路段不寫入、換至夜間後的過期回覆不扣點，以及 Worker 故障時回退。

這一輪首先接上單一步行確認。遊戲實測另外發現雨天提示與地形說明仍顯示歷史的 200 公尺費率，已修正為現行 1.5 加權公里。

## 車行掃街與 AI 夜間結算

重建 WASM，從專案啟動 Vite 後開啟 `http://127.0.0.1:5173/?routing=wasm-vehicle`。此模式使用 `.tools` 的 VGP3 車網、轉向限制與步行接駁，三個套件經固定 SHA 校驗。選擇地圖上的格子或活動點，即可從行動區執行「開車前往」或「車行掃街」。`?routing=wasm` 也啟用 AI 步行尋路。兩種開發模式的三槽均使用記憶體，關閉或重新整理後清除。

Rust 車行搜尋在 Web Worker 內比較上下車步行 AP、車行 AP 和總距離，保留可合法轉向且符合預付額度的路徑。步行接駁候選、車網通行規則、掃街覆蓋／收益及存檔驗證沿用既有 TypeScript。夜間兩方 AI 共用車行搜尋，步行部分使用 WASM 搜尋樹。Worker 只傳回結算結果，遊戲狀態由原本的 Store 保存。Worker 若啟動或執行失敗，從原始狀態重跑 TypeScript；已過期的結果不寫入存檔。此原型以單段車行命令為範圍。公開版未加入測試車網套件。

`node design/audit-rust-motorcade.mjs` 使用完整台北路網與固定雨天局。藍方 AP 14→10、取得 3 次車掃接觸。第 1 夜橙方完成車掃，白方開車拜訪。兩方合計執行 2 次 WASM 車行搜尋及 18 次 WASM 步行搜尋。整個夜間結算與既有 TypeScript 路徑的遊戲狀態一致。車掃後和隔日各驗證第 3 槽續玩，重複按夜間結算只提交一次。此為功能比對，低階裝置效能仍待驗證。

Windows Chrome 以真實遊戲按鈕執行信義區台北 101 車掃。首次冷啟動曾回退，重載後確認 Worker 回報 WASM，藍方 AP 14→10 並保存第 1 槽。另以新局執行「進入夜間」和「結算夜間」，完成第 2 天白天，頁面確認 19 次 WASM 搜尋。

命令層回歸另驗證兩種操作衝突。玩家在夜間的步行尚未完成時，結算按鈕會等待步行結果。玩家若在結算期間存檔回首頁，延遲回覆會被捨棄，續玩仍回到原夜間狀態。

2026-11-14 驗證結果為 `npm run check`、`npm run build`、`npm test`（252 項）、Rust 測試（3 項）及 WASM 發行建置通過。28 天回歸覆蓋既有車掃存檔與道路規則，實際 WASM 車掃及 AI 的全市路網整合覆蓋第 1 天至第 2 天。
