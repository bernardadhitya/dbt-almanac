<p align="center">
  <img src="build/icon.png" alt="Almanac" width="120" />
</p>

<h1 align="center">Almanac</h1>

<p align="center">
  A desktop app for visualizing dbt model dependency graphs with Airflow DAG integration.
</p>

<p align="center">
  Built with Electron &middot; React &middot; React Flow &middot; Dagre &middot; Tailwind CSS
</p>

---

## What is Almanac?

![Demo Screenshot](.github/assets/dbt-almanac-demo-screenshot.png)

Almanac reads your dbt project's `manifest.json` and renders an interactive dependency graph; letting you explore how models and sources connect, search through SQL code, and optionally overlay Airflow DAG ownership and schedules on top.

### Key Features

- **Interactive dependency graph**; pan, zoom, drag nodes, and explore upstream/downstream relationships with adjustable depth sliders
- **Model & source search**; fuzzy search across all models with relevance scoring, plus full-text keyword search through raw SQL code with highlighted snippets
- **Airflow DAG integration**; scan an Airflow DAGs directory to see which DAGs invoke each model, displayed as container overlays with schedule information (cron expressions converted to human-readable text)
- **AST-based selector extraction**; uses Python's `ast` module to statically evaluate dbt selectors from Airflow DAG files, handling variables, f-strings, dict lookups, list joins, and loops
- **Adaptive performance**; two-tier threshold system automatically simplifies layout and rendering for large graphs to prevent crashes while preserving the full experience for small graphs

---

## Getting Started

### Prerequisites

- **Node.js** (v18+) and **npm**
- **Python 3** (`python3` must be in your PATH)

### Install

```bash
git clone https://github.com/<your-org>/dbt-almanac.git
cd dbt-almanac
npm install
```

### Development

```bash
npm run dev
```

This starts Vite's dev server, compiles the Electron TypeScript in watch mode, and launches the app. Changes to React components hot-reload instantly.

### Production Build

```bash
npm run build              # Build React + Electron TypeScript
npm run electron:build     # Package as a native app (macOS/Windows/Linux)
```

The packaged app is output to the `release/` directory.

---

## Usage

1. **Open Settings** (gear icon, top-left) and select your dbt project directory (the folder containing `target/manifest.json`)
2. **Select a model** from the sidebar list to render its dependency graph
3. **Adjust depth** using the upstream/downstream sliders (1–5 levels)
4. **Search**; use the sidebar search to find models, or the keyword search bar to search inside SQL code
5. *(Optional)* **Add Airflow DAGs**; in Settings, select your Airflow DAGs directory. Once scanned, toggle "DAG Groups" in the sidebar to see which DAGs cover which models

---

## Project Structure

```
dbt-almanac/
├── src/                          # React frontend
│   ├── components/               # UI components (GraphCanvas, Sidebar, ModelNode, etc.)
│   ├── utils/                    # Graph layout, manifest hydration, search utilities
│   ├── App.tsx                   # Main application component
│   └── types.ts                  # TypeScript interfaces
├── electron/                     # Electron main process
│   ├── main.ts                   # Window creation, IPC handlers, Python script spawning
│   └── preload.ts                # Context-isolated API bridge
├── scripts/                      # Python backend scripts
│   ├── parse_manifest.py         # Extracts slim model data from manifest.json
│   ├── scan_airflow_dags.py      # Scans Airflow DAGs for dbt selectors (AST-based)
│   └── dbt_select.py             # dbt selector syntax resolver
├── build/                        # App icons (icns, ico, png)
├── electron-builder.yml          # Electron packaging config
├── vite.config.ts                # Vite build config
└── package.json
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Desktop shell** | Electron 34 |
| **Frontend** | React 18, TypeScript 5 |
| **Graph visualization** | React Flow (@xyflow/react) |
| **Graph layout** | Dagre (@dagrejs/dagre) |
| **Styling** | Tailwind CSS 4 |
| **Build tool** | Vite 6 |
| **Persistent storage** | electron-store |
| **Backend scripts** | Python 3 (ast, json) |
| **Packaging** | electron-builder |

---

## How It Works

### Manifest Parsing

When you select a dbt project, Almanac spawns a Python script (`parse_manifest.py`) that reads `target/manifest.json` and extracts only the fields needed for visualization; model names, schemas, materialization types, tags, descriptions, raw SQL, and dependency relationships. This slim payload is sent to the renderer via IPC.

### Graph Layout

The filtered set of nodes (based on the selected model and depth) is laid out using the Dagre algorithm (left-to-right). For small graphs (≤50 nodes) with DAG Groups enabled, a compound Dagre layout clusters DAG-grouped nodes together. Larger graphs use regular layout with DAG group containers rendered as lightweight overlays.

### Airflow DAG Scanning

The scanner walks your Airflow DAGs directory, identifies Python files containing Airflow imports, and uses Python's `ast` module to statically evaluate `dbt_selector` / `dbt_select` keyword arguments. It resolves variables, f-strings, dictionary lookups, `.join()` calls, and even for-loop unrolling to extract the final selector strings; then matches them against the dbt manifest to map each model to its Airflow DAGs.

### Performance Optimization

Almanac uses a two-tier threshold system to keep the app responsive:

| Graph Size | Layout | DAG Group Rendering | Drag Behavior |
|-----------|--------|-------------------|---------------|
| ≤50 nodes | Compound Dagre (clustered) | Synchronous | Real-time container following |
| 51–80 nodes | Regular Dagre | Synchronous | Real-time container following |
| 80+ nodes | Regular Dagre | Deferred (requestAnimationFrame) | Snap on drag end |

https://github.com/user-attachments/assets/c58a3dfd-e41c-4f1a-bd86-0d924fc307b3

---

## License

This project is proprietary. All rights reserved.
