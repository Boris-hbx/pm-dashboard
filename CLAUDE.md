# PM Dashboard Hub

> Unified web dashboard for all Android -> HarmonyOS migration PM centers.
> Deployed on Fly.io as a single app serving all projects.

---

## For New Projects: How to Register

When a new migration PM project is created, it must register itself here to appear on the dashboard.

### Step 1: Add entry to `projects.json`

File: `C:/Project/pm-dashboard/projects.json`

Add a JSON object to the array:

```json
{
  "id": "your-app-id",
  "name": "Your App Name",
  "pmPath": "C:/Project/yourAppPM",
  "description": "Your App Android -> HarmonyOS Migration"
}
```

Rules:
- `id`: lowercase, no spaces, used as filename (`data/<id>.json`) and URL parameter
- `name`: display name shown in the dashboard UI
- `pmPath`: absolute path to the PM center directory on the build machine
- `description`: one-line description shown in project cards

### Step 2: Ensure PM Center has required files

The build script reads these files from your PM center. All are optional (missing = empty section) but recommended:

| File | Content | Required? |
|------|---------|-----------|
| `docs/taskboard.md` | Task kanban (## In Progress / To Do / Done) | Recommended |
| `docs/roadmap.md` | Phase definitions (## Phase N: Name or ## PN: Name) | Recommended |
| `docs/backlog.md` | Priority backlog (## High / Medium / Low) | Optional |
| `docs/risks.md` | Risk register | Optional |
| `docs/design-decisions.md` | DR registry (## Pending / Resolved) | Optional |
| `sync-log.md` | Activity changelog | Optional |
| `web/topology.json` | Node/edge dependency graph | Optional |
| `knowledge/pitfalls/*.md` | Pitfall entries | Optional |
| `knowledge/patterns/*.md` | Pattern entries | Optional |
| `knowledge/api-notes/*.md` | API note entries | Optional |
| `daily-reports/YYYY-MM-DD.md` | Daily work reports (five-section format) | Optional |

### Step 3: Build and verify

```bash
cd C:/Project/pm-dashboard
node scripts/build.js
node server.js
# Open http://localhost:8080
```

### Step 4: Deploy

```bash
npm run deploy
# Or: npm run build && flyctl deploy
```

---

## Data Format Contracts

### Taskboard sections (docs/taskboard.md)

```markdown
## In Progress / 进行中
- [ ] Task text — Agent info

## To Do / 待启动
- [ ] Task text

## Done / 已完成
- [x] Task text — 2026-03-20
```

### Roadmap phases (docs/roadmap.md)

```markdown
## Phase 1: Discovery & Analysis
**目标**: Analyze all source modules
- [x] Step 1 done
- [ ] Step 2 pending
```

Or table format:
```markdown
| P1 | Discovery | Analyze source | Active |
```

### Knowledge entries (knowledge/pitfalls/*.md)

```markdown
# PIT-001: Title here
**领域**: {domain}
## 现象
Description of the issue...
## 通用规律
General rule to follow...
```

### Daily reports (daily-reports/YYYY-MM-DD.md)

Five-section format (五段式). Template at `daily-reports/TEMPLATE.md`:

```markdown
# 日报 — 2026-03-21

## 一、整体开发进展（Top 3）
1. 【完成】xxx — quantified results
2. 【进行中】xxx
3. 【启动】xxx

## 二、多Agent范式探索（SynergyHarness）
1. xxx

## 三、产出明细
| 类型 | 数量 | 说明 |
|------|------|------|
| 新增代码 | x 个文件 | xxx |
| Spec | x 份 | xxx |

## 四、风险与阻塞
- 🔴 xxx（高风险）
- 🟡 xxx（中风险）

## 五、明日计划
- [ ] xxx
- [ ] xxx
```

Status tags in highlights: 【完成/进行中/启动/完结/解决】

---

## Architecture

```
pm-dashboard/
├── projects.json          # Project registry (edit this to add projects)
├── scripts/build.js       # Reads all PM centers, outputs JSON
├── data/                  # Built data (git-ignored in production)
│   ├── manifest.json      # Project list + stats summary
│   ├── antennapod.json    # Per-project dashboard data
│   └── simplegallery.json
├── web/index.html         # SPA with project switcher
├── server.js              # Production HTTP server
├── Dockerfile             # Container image
└── fly.toml               # Fly.io config
```

## Commands

```bash
npm run build    # Rebuild all project data
npm run serve    # Start local server (port 8080)
npm run deploy   # Build + deploy to Fly.io
```
