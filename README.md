# 選戰騎士團：首都篇 / Campaign Knights: Capital Edition

台北 12 行政區、三個虛構陣營、28 天日夜競選。這是一款繁體中文／英文的單機戰棋。玩家可步行拜訪、跨區車掃、經營社群舞台，並透過政見發表會及辯論爭取支持。

A bilingual, single-player campaign tactics game across Taipei’s 12 districts. Lead one of three fictional factions through 28 days of street visits, motorcades, community stages, policy presentations, and debates.

| 版本 / Version | 取得方式 / How to play |
| --- | --- |
| **v0.18.0 Beta 1 · 3D** | 本 repo 的 `main` 原始碼，請依 [Beta 建置與驗收說明](BETA-REVIEW.md) 在本機試玩。 Build and play locally using the [Beta guide](BETA-REVIEW.md). |
| **v0.17.0 · 2D 公開原型 / Public prototype** | [GitHub Pages 試玩 / Play in your browser](https://vrkatbekao-creator.github.io/STKSST/) |

[回報問題 / Report an issue](https://github.com/vrkatbekao-creator/STKSST/issues/new?template=bug_report.yml)

## 3D Beta 1

- **地圖與移動 / Map and travel** — MapLibre 3D 地圖保留六角格、台北區界、道路、建物與衛星地表。點選地圖或活動點可查看步行、開車或車掃的 AP 和物資，確認抵達後選擇現場行動。 Select a destination to review walking, driving, or motorcade costs, then choose what to do on arrival.
- **尋路與兩方 AI / Routing and opposing AI** — Rust／WebAssembly 在背景處理道路尋路與夜間對手行動。Beta 改善車行尋路。七組對照快照的路線、費用及結算狀態一致。 Beta accelerates vehicle routing while preserving routes, costs, and outcomes in seven matched scenarios. [效能與驗收紀錄 / Benchmark and QA](BETA-REVIEW.md)
- **競選與存檔 / Campaign and saves** — 每隊最多七人，保有隊員技能、染色拜訪紀錄、治疏嶼（Governance Isle）及恰恰肥皂箱（Cha-Cha Soapbox）。第 2–14 天偶數日公布民調，第 15–28 天封關，最後一晚結算後開票。 Three browser-local save slots, teams of up to seven, and a polling blackout from day 15 until the final night concludes.

Beta 步行以每 1.5 公里加權路程 1 AP 計算，實際費用以移動確認卡為準。Beta 與同一瀏覽器、同一網址的 3D Alpha 共用存檔，公開 2D 原型的瀏覽器存檔另存。

In Beta, walking costs 1 AP per 1.5 km of weighted distance. The confirmation card shows the actual cost. The 3D Alpha and Beta share saves on the same browser and URL. The public 2D prototype stores its saves separately.

## 本機建置 / Local build

```sh
npm ci
npm run build:beta
npm run preview -- --port 4173 --strictPort
```

開啟 [本機 Beta / Local Beta](http://127.0.0.1:4173/)。需要 Node.js、Rust 的 `wasm32-unknown-unknown` 目標、Python 的 NumPy／Pillow，以及已凍結的車網來源或封包。依 [Beta guide](BETA-REVIEW.md) 及 [車網重建步驟 / Vehicle network setup](ALPHA-REVIEW.md#開啟與存檔) 準備。Beta 已驗證本機建置及瀏覽器續玩，實體手機與完整 Beta 瀏覽器對局仍待驗收。

## 創作緣起 / Why I made this

這是在研究 A* 搜尋時，無聊之餘做出來的 side project。看到自己的學弟，以及同學的同學，竟然在同一場台北市長選戰中競爭，覺得既感慨又有趣，於是有感而作。歡迎取用、修改與改善，請記得標註原作者及本專案來源。

This started as a side project I put together for fun while studying A* search. Seeing a junior from my school and a classmate's classmate competing in the same Taipei mayoral election felt both surreal and thought-provoking, and inspired me to make this game. You're welcome to use, modify, and improve it; please credit the original author and link back to this project.

## 授權 / License

程式碼與文件採 [MIT 授權](LICENSE)。使用或修改時請保留版權與授權文字，並標註作者 `vrkatbekao-creator` 和 [本 repo](https://github.com/vrkatbekao-creator/STKSST)。第三方圖資與素材依各自原授權，詳見 [第三方授權 / Third-party notices](THIRD-PARTY-NOTICES.md)。

Code and documentation are released under the [MIT License](LICENSE). Please retain the copyright and license notice, credit `vrkatbekao-creator`, and link to this repository. Map data and third-party assets retain their original terms.

## 開發資料 / Development notes

[3D 介面與車掃 / 3D interface and motorcades](CAMPAIGN-3D-INTERFACE-SPEC.md) · [Alpha 對局驗收 / Alpha playthrough](ALPHA-REVIEW.md) · [道路移動 / Road movement](ROAD-MOVEMENT-SPEC.md) · [全市掃街 / Citywide outreach](CITY-OUTREACH-SPEC.md) · [建置筆記 / Build notes](GAME-BUILD-NOTES.md) · [靜態網站 / Static hosting](STATIC-HOSTING.md)

[v0.17.0 公開原型說明與歷史沿革 / Public prototype guide and version history](https://github.com/vrkatbekao-creator/STKSST/blob/fdc90d1dc394e681bb9a9b296679fd23edc5fbb8/README.md)
