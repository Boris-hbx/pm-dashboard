#!/usr/bin/env node
/**
 * build.js — Unified PM Dashboard Builder
 *
 * Reads projects.json, then for each registered project:
 *   1. Parses its markdown source files (taskboard, backlog, roadmap, etc.)
 *   2. Outputs data/<project-id>.json
 *   3. Outputs data/manifest.json (project list + stats summary)
 *
 * Usage: node scripts/build.js
 */

const fs = require('fs');
const path = require('path');
const { bilingualText, bilingualFields, bilingualArray } = require('../i18n/translate');

const ROOT = path.resolve(__dirname, '..');
const PROJECTS_FILE = path.join(ROOT, 'projects.json');
const DATA_DIR = path.join(ROOT, 'data');
const DOCS_DIR = path.join(ROOT, 'docs');       // GitHub Pages publish dir
const DOCS_DATA_DIR = path.join(DOCS_DIR, 'data');

// ── Parsers (unified, compatible with both antennapod and simplegallery formats) ──

function parseTaskboard(content) {
  const sections = content.split(/^## /m).filter(Boolean);
  const result = { inProgress: [], todo: [], done: [], inReview: [], blocked: [] };

  for (const section of sections) {
    const lines = section.trim().split('\n');
    const title = lines[0].trim().toLowerCase();

    const tasks = lines.slice(1)
      .filter(l => /^- \[/.test(l.trim()))
      .map(l => {
        const isDone = /\[x\]/i.test(l);
        const text = l.replace(/^- \[.\]\s*/, '').trim();
        const dateMatch = text.match(/\s*—\s*(\d{4}-\d{2}-\d{2})\s*$/);
        const date = dateMatch ? dateMatch[1] : null;
        const cleanText = dateMatch ? text.replace(dateMatch[0], '').trim() : text;
        const tagMatch = cleanText.match(/\s*—\s*(.+)$/);
        const tagInfo = tagMatch ? tagMatch[1].trim() : '';
        const finalText = tagMatch ? cleanText.replace(tagMatch[0], '').trim() : cleanText;

        let tag = '';
        let phase = '';
        if (/spec/i.test(tagInfo)) tag = 'spec';
        else if (/adr/i.test(tagInfo)) tag = 'adr';
        else if (/analysis|分析/i.test(tagInfo) || /分析/.test(finalText)) tag = 'analysis';

        const phaseMatch = tagInfo.match(/P\d/);
        if (phaseMatch) phase = phaseMatch[0];

        const agentMatch = finalText.match(/(Agent(?:PM|A|H))/);
        const agent = agentMatch ? agentMatch[1] : '';
        const textNoAgent = finalText.replace(/\s*—?\s*Agent(?:PM|A|H)\s*执行中\s*/, '').trim();

        return { text: textNoAgent || finalText, tag, phase, date, isDone, agent };
      });

    if (/进行中|in.?progress/i.test(title)) {
      result.inProgress = tasks.map(t => ({ text: t.text, tag: t.tag, phase: t.phase, agent: t.agent }));
    } else if (/审查中|in.?review/i.test(title)) {
      result.inReview = tasks.map(t => ({ text: t.text, tag: t.tag, phase: t.phase, agent: t.agent }));
    } else if (/阻塞|blocked/i.test(title)) {
      result.blocked = tasks.map(t => ({ text: t.text, tag: t.tag, phase: t.phase, agent: t.agent }));
    } else if (/待启动|to.?do/i.test(title)) {
      result.todo = tasks.filter(t => !t.isDone).map(t => ({ text: t.text, tag: t.tag, phase: t.phase, agent: t.agent }));
      const doneInTodo = tasks.filter(t => t.isDone).map(t => ({ text: t.text, date: t.date || '' }));
      result.done = result.done.concat(doneInTodo);
    } else if (/已完成|done/i.test(title)) {
      result.done = result.done.concat(tasks.map(t => ({ text: t.text, date: t.date || '' })));
    }
  }
  return result;
}

function parseBacklog(content) {
  const sections = content.split(/^## /m).filter(Boolean);
  const result = { high: [], medium: [], low: [] };

  for (const section of sections) {
    const lines = section.trim().split('\n');
    const title = lines[0].trim().toLowerCase();

    const items = lines.slice(1)
      .filter(l => /^- \*\*/.test(l.trim()))
      .map(l => {
        const idMatch = l.match(/\*\*(.+?)\*\*/);
        const id = idMatch ? idMatch[1] : '';
        const textMatch = l.match(/\*\*.*?\*\*[：:]\s*(.+)/);
        const text = textMatch ? textMatch[1].trim() : l.replace(/^- /, '').trim();
        return { id, text };
      });

    if (/high|p-high/i.test(title)) result.high = items;
    else if (/med|p-med/i.test(title)) result.medium = items;
    else if (/low|p-low/i.test(title)) result.low = items;
  }
  return result;
}

function parseRoadmap(content) {
  const lines = content.split('\n');
  const phases = [];
  // Try "## Phase N:" format first, then "## PN:" format
  const sectionRegex = /^## (?:Phase )?(\d+|P\d+)[：:]\s*(.+)/;

  for (const line of lines) {
    const match = line.match(sectionRegex);
    if (match) {
      const rawId = match[1];
      const id = rawId.startsWith('P') ? rawId : `P${rawId}`;
      const rawName = match[2].trim();
      const idx = lines.indexOf(line);
      let desc = '';
      for (let i = idx + 1; i < Math.min(idx + 5, lines.length); i++) {
        const goalMatch = lines[i].match(/\*\*目标\*\*[：:]\s*(.+)/);
        if (goalMatch) { desc = goalMatch[1]; break; }
      }

      let status = 'waiting';
      const sectionContent = [];
      for (let i = idx + 1; i < lines.length; i++) {
        if (/^## (?:Phase )?\d|^## P\d/.test(lines[i])) break;
        sectionContent.push(lines[i]);
      }
      const checks = sectionContent.filter(l => /^- \[/.test(l.trim()));
      const checkedCount = checks.filter(l => /\[x\]/i.test(l)).length;
      if (checks.length > 0 && checkedCount === checks.length) status = 'done';
      else if (checkedCount > 0) status = 'active';
      if (/当前阶段/.test(rawName)) status = 'active';
      // Recognize ✅ in name as done
      if (/✅/.test(rawName)) status = 'done';

      phases.push({ id, name: rawName.replace(/[（(]当前阶段[）)]/g, '').replace(/\s*✅\s*/g, ' ').trim(), desc, status });
    }
  }

  // Fallback: table format
  if (phases.length === 0) {
    const tableLines = lines.filter(l => l.includes('|') && /P\d/.test(l));
    for (const l of tableLines) {
      const cells = l.split('|').map(c => c.trim()).filter(Boolean);
      if (cells.length >= 4) {
        const statusText = cells[3] || '';
        let status = 'waiting';
        if (/待启动|active/i.test(statusText)) status = 'active';
        else if (/已完成|done/i.test(statusText)) status = 'done';
        phases.push({ id: cells[0], name: cells[1], desc: cells[2], status });
      }
    }
    const firstWaiting = phases.find(p => p.status === 'waiting');
    if (firstWaiting) firstWaiting.status = 'active';
  }

  return phases;
}

function parseSyncLog(content) {
  const entries = [];
  const lines = content.split('\n');

  // Try "## YYYY-MM-DD" format first
  let currentDate = null;
  let currentEntries = [];
  let foundDateSections = false;

  for (const line of lines) {
    const dateMatch = line.match(/^## (\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      foundDateSections = true;
      if (currentDate) entries.push({ date: currentDate, entries: currentEntries });
      currentDate = dateMatch[1];
      currentEntries = [];
    } else if (currentDate && /^- /.test(line.trim())) {
      const text = line.replace(/^-\s*\*\*(.+?)\*\*[：:]\s*/, '$1: ').replace(/^- /, '').trim();
      currentEntries.push(text);
    }
  }
  if (currentDate) entries.push({ date: currentDate, entries: currentEntries });

  // Fallback: "- **YYYY-MM-DD** — text" format
  if (!foundDateSections) {
    const entryMap = {};
    for (const line of lines) {
      const match = line.match(/^-\s+\*\*(\d{4}-\d{2}-\d{2})\*\*\s*[—–-]\s*(.+)/);
      if (match) {
        const date = match[1];
        const text = match[2].trim();
        if (!entryMap[date]) entryMap[date] = [];
        entryMap[date].push(text);
      }
    }
    const fallback = Object.entries(entryMap)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, entries]) => ({ date, entries }));
    if (fallback.length > 0) return fallback;
  }

  return entries;
}

function parseKnowledgeDir(knowledgeRoot, subdir) {
  const dir = path.join(knowledgeRoot, subdir);
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.md') && !f.startsWith('_') && !f.startsWith('REVIEW'))
    .map(f => {
      const content = fs.readFileSync(path.join(dir, f), 'utf8');
      const lines = content.split('\n');

      const titleLine = lines.find(l => /^# /.test(l));
      const titleMatch = titleLine ? titleLine.match(/^# (?:\w+-\d+)[：:]\s*(.+)/) : null;
      const fullTitle = titleLine ? titleLine.replace(/^# /, '').trim() : f.replace('.md', '');

      // Prefer filename-based ID to avoid duplicates (e.g. PIT-018a vs PIT-018b)
      const fileId = f.replace('.md', '').toUpperCase();
      const idMatch = fullTitle.match(/^(\w+-\d+\w*)/);
      const id = fileId || (idMatch ? idMatch[1] : f.replace('.md', ''));
      const title = titleMatch ? titleMatch[1] : fullTitle.replace(/^\w+-\d+[：:]\s*/, '');

      const domainLine = lines.find(l => /领域/.test(l));
      const domainMatch = domainLine ? domainLine.match(/\{(.+?)\}|：\s*(.+)/) : null;
      const domain = domainMatch ? (domainMatch[1] || domainMatch[2] || '').trim() : '';

      let summary = '';
      const summaryHeaders = ['通用规律', '适用场景', '现象', '实际行为'];
      for (const header of summaryHeaders) {
        const idx = lines.findIndex(l => l.includes(header));
        if (idx !== -1 && idx + 1 < lines.length) {
          const nextLines = lines.slice(idx + 1).filter(l => l.trim() && !l.startsWith('#') && !l.startsWith('```'));
          if (nextLines.length > 0) {
            summary = nextLines[0].replace(/^[{-]\s*/, '').trim();
            if (summary.length > 80) summary = summary.slice(0, 77) + '...';
            break;
          }
        }
      }

      return { id, title, domain, summary, file: `knowledge/${subdir}/${f}` };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

function parseDesignDecisions(content) {
  const result = { pending: [], resolved: [], closed: [] };
  const sections = content.split(/^## /m).filter(Boolean);

  for (const section of sections) {
    const lines = section.trim().split('\n');
    const sectionTitle = lines[0].trim().toLowerCase();

    let target = null;
    if (/待裁决|pending/i.test(sectionTitle)) target = 'pending';
    else if (/已裁决|resolved/i.test(sectionTitle)) target = 'resolved';
    else if (/已关闭|closed/i.test(sectionTitle)) target = 'closed';
    if (!target) continue;

    let currentDR = null;
    for (const line of lines.slice(1)) {
      const drMatch = line.match(/^### (DR-\d+)[：:]\s*(.+)/);
      if (drMatch) {
        if (currentDR) result[target].push(currentDR);
        currentDR = { id: drMatch[1], title: drMatch[2].trim(), type: '', date: '', decision: '' };
      } else if (currentDR) {
        const typeMatch = line.match(/冲突类型\*\*[：:]\s*(.+)/);
        if (typeMatch) currentDR.type = typeMatch[1].trim();
        const dateMatch = line.match(/日期\*\*[：:]\s*(\d{4}-\d{2}-\d{2})/);
        if (dateMatch) currentDR.date = dateMatch[1];
        const decisionMatch = line.match(/PM 决策\*\*[：:]\s*(.+)/);
        if (decisionMatch) currentDR.decision = decisionMatch[1].trim();
      }
    }
    if (currentDR) result[target].push(currentDR);
  }
  return result;
}

function parseUIComparison(filePath, projectId, pmPath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const assetsDir = path.join(DATA_DIR, projectId, 'assets');
    fs.mkdirSync(assetsDir, { recursive: true });

    // Copy comparison images to data/<projectId>/assets/ and rewrite paths
    let imgIdx = 0;
    (data.comparisons || []).forEach(c => {
      ['android', 'harmonyos'].forEach(key => {
        if (c[key]) {
          const srcPath = path.join(pmPath, c[key]);
          if (fs.existsSync(srcPath)) {
            const ext = path.extname(srcPath);
            const destName = `cmp_${String(imgIdx++).padStart(3, '0')}${ext}`;
            fs.copyFileSync(srcPath, path.join(assetsDir, destName));
            c[key] = `data/${projectId}/assets/${destName}`;
          }
        }
      });
    });

    // Videos: use compressed version if available, else copy if <20MB
    (data.videos || []).forEach(v => {
      // Prefer pre-compressed version in assets
      if (v.compressed) {
        const compPath = path.join(ROOT, v.compressed);
        if (fs.existsSync(compPath)) {
          v.src = v.compressed;
          v.available = true;
          delete v.compressed;
          return;
        }
      }
      const srcPath = path.join(pmPath, v.src);
      if (fs.existsSync(srcPath)) {
        const stats = fs.statSync(srcPath);
        if (stats.size < 20 * 1024 * 1024) {
          const destName = path.basename(v.src);
          fs.copyFileSync(srcPath, path.join(assetsDir, destName));
          v.src = `data/${projectId}/assets/${destName}`;
          v.available = true;
        } else {
          v.available = false;
          v.sizeHuman = (stats.size / 1024 / 1024).toFixed(1) + 'MB';
        }
      } else {
        v.available = false;
      }
      delete v.compressed;
    });

    return data;
  } catch(e) { console.warn('  UI comparison parse error:', e.message); return null; }
}

function parseDailyReports(dir) {
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .sort((a, b) => b.localeCompare(a)) // newest first
    .map(f => {
      const date = f.replace('.md', '');
      const content = fs.readFileSync(path.join(dir, f), 'utf8');
      const lines = content.split('\n');

      // Extract top-3 highlights from "## 一、" section
      const highlights = [];
      let inSection1 = false;
      for (const line of lines) {
        if (/^## 一/.test(line)) { inSection1 = true; continue; }
        if (/^## /.test(line) && inSection1) break;
        if (inSection1 && /^\d+\.\s/.test(line.trim())) {
          highlights.push(line.replace(/^\d+\.\s*/, '').trim());
        }
      }

      // Extract output table from "## 三、" section
      const outputs = [];
      let inSection3 = false;
      for (const line of lines) {
        if (/^## 三/.test(line)) { inSection3 = true; continue; }
        if (/^## /.test(line) && inSection3) break;
        if (inSection3 && line.includes('|')) {
          const cells = line.split('|').map(c => c.trim()).filter(Boolean);
          if (cells.length >= 3 && !/^[-:]+$/.test(cells[0]) && !/^类型$/.test(cells[0])) {
            outputs.push({ type: cells[0], count: cells[1], desc: cells[2] });
          }
        }
      }

      // Extract tomorrow plan from "## 五、" section
      const plans = [];
      let inSection5 = false;
      for (const line of lines) {
        if (/^## 五/.test(line)) { inSection5 = true; continue; }
        if (/^## /.test(line) && inSection5) break;
        if (inSection5 && /^- \[/.test(line.trim())) {
          const done = /\[x\]/i.test(line);
          const text = line.replace(/^- \[.\]\s*/, '').trim();
          plans.push({ text, done });
        }
      }

      // Full markdown content for detail view
      return { date, highlights, outputs, plans, content };
    });
}

function parseRisks(content) {
  const risks = [];
  const lines = content.split('\n');

  // Try table format first (antennapod style)
  for (const line of lines) {
    const cells = line.split('|').map(c => c.trim()).filter(Boolean);
    if (cells.length >= 5 && /^R-\d+$/.test(cells[0])) {
      const impact = (cells[3] || '').toLowerCase();
      let level = 'medium';
      if (/high|高/i.test(impact)) level = 'high';
      else if (/low|低/i.test(impact)) level = 'low';
      risks.push({ id: cells[0], title: cells[1], level, phase: '', desc: cells[4] || '' });
    }
  }
  if (risks.length > 0) return risks;

  // Try section format (simplegallery style)
  let current = null;
  let inActive = false;
  for (const line of lines) {
    if (/^## 活跃风险|^## Active/i.test(line)) { inActive = true; continue; }
    if (/^## 已关闭|^## Closed/i.test(line)) { inActive = false; continue; }
    if (!inActive && risks.length === 0) inActive = true; // no sections = all active

    const riskMatch = line.match(/^### (RISK-\d+|R-\d+)[：:]\s*(.+)/);
    if (riskMatch) {
      if (current) risks.push(current);
      current = { id: riskMatch[1], title: riskMatch[2].trim(), level: 'medium', phase: '', desc: '' };
      continue;
    }
    if (!current) continue;

    const levelMatch = line.match(/等级\*\*[：:]\s*(.+)/);
    if (levelMatch) {
      const raw = levelMatch[1].trim();
      if (/高|high/i.test(raw)) current.level = 'high';
      else if (/低|low/i.test(raw)) current.level = 'low';
    }
    const phaseMatch = line.match(/阶段\*\*[：:]\s*(.+)/);
    if (phaseMatch) current.phase = phaseMatch[1].trim();
    const descMatch = line.match(/描述\*\*[：:]\s*(.+)/);
    if (descMatch) current.desc = descMatch[1].trim();
  }
  if (current) risks.push(current);
  return risks;
}

function readFileIfExists(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function parseWaves(taskboardContent) {
  if (!taskboardContent) return [];
  const waves = [];

  // Determine section boundaries
  const inProgressIdx = taskboardContent.indexOf('## In Progress');
  const todoIdx = taskboardContent.indexOf('## To Do');
  const doneIdx = taskboardContent.indexOf('## Done');

  // Parse ALL waves from entire taskboard (including Done section)
  // Match "### Wave X — name", "### Wave X: name", "### Wave X name" (various separators)
  // ID is a single token (letter/number like A, B, C, D, E, 1, 4b), name is everything after
  const waveRegex = /^#{3,4}\s+Wave\s+([A-Za-z0-9]+)\s*(?:[—:\-]\s*)?(.+?)(?:\s*\(\d+\/\d+\))?\s*$/gm;
  let match;
  const positions = [];
  while ((match = waveRegex.exec(taskboardContent)) !== null) {
    positions.push({ id: match[1], name: match[2].trim(), index: match.index });
  }

  for (let i = 0; i < positions.length; i++) {
    const start = positions[i].index;
    const end = i + 1 < positions.length ? positions[i + 1].index : taskboardContent.length;
    const block = taskboardContent.slice(start, end);

    const tasks = [];
    const lines = block.split('\n');
    let currentTrack = '';
    for (const line of lines) {
      // Stop at next major section header (## level)
      if (/^## /.test(line) && !line.startsWith('## ─')) break;

      // Detect track headers like "#### 人类轨道" or "#### AgentH 轨道 — xxx"
      const trackMatch = line.match(/^#{4,5}\s+(.*(?:轨道|Track|人类|AgentPM|AgentH|AgentG|AgentA|人工).*)$/i);
      if (trackMatch) { currentTrack = trackMatch[1].trim(); continue; }

      const taskMatch = line.match(/^- \[([ x])\]\s*(.+)/i);
      if (taskMatch) {
        const isDone = taskMatch[1].toLowerCase() === 'x';
        const text = taskMatch[2].trim();
        const needsHuman = /NEEDS_HUMAN|NEEDS_DEVICE|NEEDS_DECISION/.test(text);
        const needsType = text.match(/NEEDS_(\w+)/);
        const isBlocked = /阻塞|blocked/i.test(text);
        const prioMatch = text.match(/P([012])/);
        tasks.push({
          text: text.replace(/\s*\|\s*\*\*NEEDS_\w+\*\*.*$/, '').replace(/\s*\*\*NEEDS_\w+\*\*.*$/, '').trim(),
          isDone,
          track: currentTrack || '',
          needsHuman,
          needsType: needsType ? needsType[1] : '',
          isBlocked,
          priority: prioMatch ? 'P' + prioMatch[1] : '',
        });
      }
    }

    // Organize tasks by track (agent lane)
    const tracks = {};
    for (const t of tasks) {
      let lane = 'general';
      const tr = t.track.toLowerCase();
      if (/人类|human/i.test(tr)) lane = 'human';
      else if (/agentpm|pm/i.test(tr)) lane = 'agentpm';
      else if (/agenth|开发/i.test(tr)) lane = 'agenth';
      else if (/agentg|guardian/i.test(tr)) lane = 'agentg';
      else if (/agenta|分析/i.test(tr)) lane = 'agenta';
      // Also detect from task text if no track header
      else if (t.text.match(/人工|人类|NEEDS_DEVICE|NEEDS_DECISION/i)) lane = 'human';
      else if (t.text.match(/AgentPM/i)) lane = 'agentpm';
      else if (t.text.match(/AgentH/i)) lane = 'agenth';
      if (!tracks[lane]) tracks[lane] = [];
      tracks[lane].push(t);
    }

    const doneCount = tasks.filter(t => t.isDone).length;
    const totalCount = tasks.length;
    const humanItems = tasks.filter(t => t.needsHuman && !t.isDone);
    const blockers = tasks.filter(t => t.isBlocked && !t.isDone);

    // Determine status based on which section this wave header falls in
    let status = 'todo';
    if (doneIdx >= 0 && start > doneIdx) {
      status = 'done';
    } else if (inProgressIdx >= 0 && start > inProgressIdx && (todoIdx < 0 || start < todoIdx) && (doneIdx < 0 || start < doneIdx)) {
      status = 'active';
    } else if (todoIdx >= 0 && start > todoIdx && (doneIdx < 0 || start < doneIdx)) {
      status = 'todo';
    }
    // Override: if all tasks are done, mark as done regardless of section
    if (doneCount === totalCount && totalCount > 0) status = 'done';

    // Extract date from wave header line (e.g. "— 2026-03-23")
    const headerLine = taskboardContent.slice(start, start + 200).split('\n')[0];
    const dateMatch = headerLine.match(/(\d{4}-\d{2}-\d{2})/);

    waves.push({
      id: positions[i].id,
      name: positions[i].name,
      status,
      date: dateMatch ? dateMatch[1] : '',
      tasks: totalCount,
      done: doneCount,
      progress: totalCount > 0 ? Math.round(doneCount / totalCount * 100) : 0,
      humanWaiting: humanItems.length,
      blockers: blockers.length,
      humanItems: humanItems.map(t => ({ text: t.text, type: t.needsType })),
      blockerItems: blockers.map(t => t.text),
      tracks,
    });
  }

  // Merge waves with same ID (e.g. "Wave B Bug修复" + "Wave B 真机验证" → one Wave B)
  const merged = [];
  const idMap = {};
  for (const w of waves) {
    if (idMap[w.id]) {
      const existing = idMap[w.id];
      // Merge tasks
      existing.tasks += w.tasks;
      existing.done += w.done;
      existing.progress = existing.tasks > 0 ? Math.round(existing.done / existing.tasks * 100) : 0;
      existing.humanWaiting += w.humanWaiting;
      existing.blockers += w.blockers;
      existing.humanItems = existing.humanItems.concat(w.humanItems);
      existing.blockerItems = existing.blockerItems.concat(w.blockerItems);
      // Merge tracks
      for (const [lane, tasks] of Object.entries(w.tracks)) {
        if (!existing.tracks[lane]) existing.tracks[lane] = [];
        existing.tracks[lane] = existing.tracks[lane].concat(tasks);
      }
      // Append sub-wave name
      const wName = typeof w.name === 'object' ? w.name.zh || w.name.en : w.name;
      const eName = typeof existing.name === 'object' ? existing.name.zh || existing.name.en : existing.name;
      if (wName && !eName.includes(wName.split('—')[0].trim())) {
        const combined = eName + ' + ' + wName.split('—')[0].trim();
        if (typeof existing.name === 'object') { existing.name.zh = combined; existing.name.en = combined; }
        else existing.name = combined;
      }
      // Use earliest date, promote status (active > done > todo)
      if (w.date && (!existing.date || w.date < existing.date)) existing.date = w.date;
      if (w.status === 'active') existing.status = 'active';
    } else {
      idMap[w.id] = w;
      merged.push(w);
    }
  }

  // Sort waves: done first (by date), then active, then todo
  const statusOrder = { done: 0, active: 1, todo: 2 };
  merged.sort((a, b) => {
    const so = statusOrder[a.status] - statusOrder[b.status];
    if (so !== 0) return so;
    if (a.date && b.date) return a.date.localeCompare(b.date);
    return 0;
  });

  return merged;
}

function parseDeliveryCoverage(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf8');

  // Count status markers across entire file
  const implemented = (content.match(/✅/g) || []).length;
  const partial = (content.match(/⚠️/g) || []).length;
  const todo = (content.match(/❌/g) || []).length;
  const missing = (content.match(/🔲/g) || []).length;
  const total = implemented + partial + todo + missing;

  // Extract per-section stats from h2 headers
  const pages = [];
  const sections = content.split(/\n## (?=[^\n])/);
  for (const sec of sections.slice(1)) {
    const titleMatch = sec.match(/^(.+?)[\n]/);
    if (!titleMatch) continue;
    const rawTitle = titleMatch[1].replace(/→.*/, '').trim();
    // Skip summary/meta sections
    if (/汇总|状态|定义|标记/i.test(rawTitle)) continue;
    const title = rawTitle.replace(/（.*?）/g, '').replace(/\(.+?\)/g, '').trim();
    const secImpl = (sec.match(/✅/g) || []).length;
    const secPart = (sec.match(/⚠️/g) || []).length;
    const secTodo = (sec.match(/❌/g) || []).length;
    const secMiss = (sec.match(/🔲/g) || []).length;
    const secTotal = secImpl + secPart + secTodo + secMiss;
    if (secTotal > 0) {
      pages.push({ title, total: secTotal, ok: secImpl, partial: secPart, todo: secTodo + secMiss });
    }
  }

  return { total, implemented, partial, todo: todo + missing, coverage: total > 0 ? Math.round(implemented / total * 100) : 0, pages };
}

function parseFeatureTree(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  const categories = [];
  let currentCat = null;
  let currentSub = null;
  const stats = { total: 0, done: 0, fixing: 0, notMigrated: 0, blocked: 0 };

  for (const line of lines) {
    // Top-level category: ## F-1 xxx
    const catMatch = line.match(/^## (F-\d+)\s+(.+)/);
    if (catMatch) {
      currentCat = { id: catMatch[1], name: catMatch[2].trim(), subs: [], features: [] };
      categories.push(currentCat);
      currentSub = null;
      continue;
    }

    // Sub-category: ### F-2.1 xxx
    const subMatch = line.match(/^### (F-\d+\.\d+)\s+(.+)/);
    if (subMatch && currentCat) {
      currentSub = { id: subMatch[1], name: subMatch[2].trim(), features: [] };
      currentCat.subs.push(currentSub);
      continue;
    }

    // Feature row in table: | F-x.y[.z] | name | [extra cols...] | status | [notes] |
    // ID must contain at least one dot to exclude summary rows (F-1, F-2)
    // Status is the cell containing a status emoji (✅⏸🔧⛔), not necessarily the last cell
    const rowMatch = line.match(/\|\s*(F-\d+\.\d[\d.]*)\s*\|\s*(.+?)\s*\|/);
    if (rowMatch && currentCat) {
      const id = rowMatch[1].trim();
      const allCells = line.split('|').map(c => c.trim()).filter(Boolean);
      const name = allCells.length >= 2 ? allCells[1] : rowMatch[2].trim();
      // Find the cell that contains a status emoji; fall back to last cell
      let rawStatus = allCells.length >= 3 ? allCells[allCells.length - 1] : '';
      for (let ci = 2; ci < allCells.length; ci++) {
        if (/[✅⏸🔧⛔]/.test(allCells[ci])) {
          rawStatus = allCells[ci];
          break;
        }
      }

      let status = 'done';
      if (/⛔/.test(rawStatus)) status = 'blocked';
      else if (/🔧/.test(rawStatus)) status = 'fixing';
      else if (/⏸/.test(rawStatus)) status = 'notMigrated';
      else if (/✅/.test(rawStatus)) status = 'done';
      // Simple table with just status column (no emoji): check text
      else if (/未迁移|不适用/.test(rawStatus)) status = 'notMigrated';
      else if (/BUG|修复/.test(rawStatus)) status = 'fixing';

      stats.total++;
      if (status === 'done') stats.done++;
      else if (status === 'fixing') stats.fixing++;
      else if (status === 'notMigrated') stats.notMigrated++;
      else if (status === 'blocked') stats.blocked++;

      const feat = { id, name, status };
      if (currentSub) currentSub.features.push(feat);
      else currentCat.features.push(feat);
    }

    // Also match rows without sub-ID: | F-8.1 | xxx | ✅ | (direct under category)
    // Already handled above since regex works for both F-x.y and F-x.y.z
  }

  // Calculate per-category stats
  for (const cat of categories) {
    let catTotal = cat.features.length;
    let catDone = cat.features.filter(f => f.status === 'done').length;
    for (const sub of cat.subs) {
      catTotal += sub.features.length;
      catDone += sub.features.filter(f => f.status === 'done').length;
    }
    cat.total = catTotal;
    cat.done = catDone;
  }

  return { categories, stats };
}

function parsePlaybook(pmPath) {
  const docsDir = path.join(pmPath, 'docs');
  const scriptsDir = path.join(pmPath, 'scripts');
  const playbook = { methodology: null, scripts: [], templates: [], mottos: [], features: [], convergence: null };

  // Parse methodology main doc for mottos and features
  const methPath = path.join(docsDir, 'methodology-swarm-loop.md');
  if (fs.existsSync(methPath)) {
    const content = fs.readFileSync(methPath, 'utf8');
    // Extract version
    const verMatch = content.match(/\*\*版本\*\*:\s*(.+)/);
    playbook.methodology = { version: verMatch ? verMatch[1].trim() : '?', file: 'docs/methodology-swarm-loop.md' };

    // Extract mottos from the "口诀" section only
    const mottoSectionMatch = content.match(/## .*口诀.*\n([\s\S]*?)(?=\n---|\n## )/);
    if (mottoSectionMatch) {
      const mottoRegex = /\| \*\*(.+?)\*\* \| (.+?) \| (.+?) \|/g;
      let m;
      while ((m = mottoRegex.exec(mottoSectionMatch[1])) !== null) {
        const name = m[1].trim();
        const meaning = m[2].trim();
        if (name && meaning && !name.includes('口诀')) {
          playbook.mottos.push({ name, meaning });
        }
      }
    }

    // Extract features table
    const featRegex = /\| \d+ \| \*\*(.+?)\*\* \| (.+?) \| (.+?) \|/g;
    while ((m = featRegex.exec(content)) !== null) {
      playbook.features.push({ name: m[1].trim(), traditional: m[2].trim(), swarmloop: m[3].trim() });
    }
  }

  // List available scripts
  if (fs.existsSync(scriptsDir)) {
    const scriptFiles = fs.readdirSync(scriptsDir).filter(f => f.endsWith('.js'));
    for (const f of scriptFiles) {
      const content = fs.readFileSync(path.join(scriptsDir, f), 'utf8');
      const usageMatch = content.match(/\* Usage:\s*(.+)/);
      const exampleMatch = content.match(/\* Example:\s*(.+)/);
      const descMatch = content.match(/\*\s*(\w.+?)\.?\s*\n/);
      playbook.scripts.push({
        file: f,
        usage: usageMatch ? usageMatch[1].trim() : '',
        example: exampleMatch ? exampleMatch[1].trim() : '',
        desc: descMatch ? descMatch[1].trim() : f,
      });
    }
  }

  // List templates
  const templatesDir = path.join(docsDir, 'templates');
  if (fs.existsSync(templatesDir)) {
    const templateFiles = fs.readdirSync(templatesDir).filter(f => f.endsWith('.md'));
    for (const f of templateFiles) {
      const name = f.replace('-template.md', '').replace('.md', '');
      playbook.templates.push({ file: f, name });
    }
  }

  // Parse current wave convergence
  const convPath = path.join(docsDir, 'convergence', 'wave-current.md');
  if (fs.existsSync(convPath)) {
    const content = fs.readFileSync(convPath, 'utf8');
    const waveMatch = content.match(/Wave\s+(\S+)\s*[—-]\s*(.+)\]/);
    const dateMatch = content.match(/启动日期:\s*(.+)/);
    if (waveMatch) {
      playbook.convergence = { id: waveMatch[1], name: waveMatch[2].trim(), startDate: dateMatch ? dateMatch[1].trim() : '' };
    }
  }

  // Parse Guardian audit reports from docs/convergence/
  playbook.guardianAudits = [];
  const convergenceDir = path.join(docsDir, 'convergence');
  if (fs.existsSync(convergenceDir)) {
    const auditFiles = fs.readdirSync(convergenceDir).filter(f => f.includes('guardian') && f.endsWith('.md'));
    for (const f of auditFiles) {
      const content = fs.readFileSync(path.join(convergenceDir, f), 'utf8');
      const audit = { file: f, wave: '', date: '', verdict: '', findings: [], stats: {} };

      // Extract wave
      const waveM = f.match(/wave-(\w+)/i);
      if (waveM) audit.wave = waveM[1].toUpperCase();

      // Extract date
      const dateM = content.match(/审计日期:\s*(.+)/);
      if (dateM) audit.date = dateM[1].trim();

      // Extract verdict (GO / NOT-GO / CONDITIONAL-GO)
      const verdictM = content.match(/(?:裁决|Guardian 裁决)\s*\n+###?\s*(?:🔴|🟢|🟡)\s*(NOT-GO|CONDITIONAL-GO|GO)/i);
      if (verdictM) {
        audit.verdict = verdictM[1].toUpperCase();
      } else if (/NOT-GO/i.test(content)) {
        audit.verdict = 'NOT-GO';
      } else if (/CONDITIONAL-GO/i.test(content)) {
        audit.verdict = 'CONDITIONAL-GO';
      } else if (/(?:^|\s)GO(?:\s|$)/m.test(content)) {
        audit.verdict = 'GO';
      }

      // Extract findings table rows (G-001, G-002, etc.)
      const findingRegex = /\|\s*(G-\d+)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|/g;
      let fm;
      while ((fm = findingRegex.exec(content)) !== null) {
        audit.findings.push({
          id: fm[1].trim(),
          location: fm[2].trim(),
          issue: fm[3].trim(),
          status: fm[4].trim()
        });
      }

      // Extract button coverage stats
      const implMatch = content.match(/已实现.*?(\d+)/);
      const emptyMatch = content.match(/空壳.*?(\d+)/);
      const partialMatch = content.match(/部分实现.*?(\d+)/);
      if (implMatch) audit.stats.implemented = parseInt(implMatch[1]);
      if (emptyMatch) audit.stats.empty = parseInt(emptyMatch[1]);
      if (partialMatch) audit.stats.partial = parseInt(partialMatch[1]);

      // Extract pitfall compliance
      audit.pitfallCompliance = [];
      const pitRegex = /\|\s*(PIT-\d+)\s*\|\s*(.+?)\s*\|\s*(✅|⚠️|🔴)(.+?)\s*\|/g;
      while ((fm = pitRegex.exec(content)) !== null) {
        audit.pitfallCompliance.push({
          id: fm[1].trim(),
          check: fm[2].trim(),
          result: fm[3].trim(),
          detail: fm[4].trim()
        });
      }

      playbook.guardianAudits.push(audit);
    }
  }

  return playbook;
}

// ── Bilingual transformation ──

function applyBilingual(data) {
  // Roadmap: name, desc
  data.roadmap = bilingualArray(data.roadmap, ['name', 'desc']);

  // Taskboard: text for each section
  const tbSections = ['inProgress', 'todo', 'done', 'inReview', 'blocked'];
  for (const sec of tbSections) {
    if (data.taskboard[sec]) {
      data.taskboard[sec] = bilingualArray(data.taskboard[sec], ['text']);
    }
  }

  // Topology: label, desc
  if (data.topology && data.topology.nodes) {
    data.topology.nodes = bilingualArray(data.topology.nodes, ['label', 'desc']);
  }

  // Backlog: text for each priority
  for (const pri of ['high', 'medium', 'low']) {
    if (data.backlog[pri]) {
      data.backlog[pri] = bilingualArray(data.backlog[pri], ['text']);
    }
  }

  // Risks: title, desc
  data.risks = bilingualArray(data.risks, ['title', 'desc']);

  // Design Decisions: title, type, decision
  for (const sec of ['pending', 'resolved', 'closed']) {
    if (data.designDecisions[sec]) {
      data.designDecisions[sec] = bilingualArray(data.designDecisions[sec], ['title', 'type', 'decision']);
    }
  }

  // Knowledge: title, domain, summary
  for (const cat of ['pitfalls', 'patterns', 'apiNotes']) {
    if (data.knowledge[cat]) {
      data.knowledge[cat] = bilingualArray(data.knowledge[cat], ['title', 'domain', 'summary']);
    }
  }

  // Changelog: entries array within each day
  if (data.changelog) {
    data.changelog = data.changelog.map(day => ({
      ...day,
      entries: day.entries.map(e => bilingualText(e)),
    }));
  }

  // Daily Reports: highlights, plans text, outputs desc
  if (data.dailyReports) {
    data.dailyReports = data.dailyReports.map(r => ({
      ...r,
      highlights: (r.highlights || []).map(h => bilingualText(h)),
      plans: (r.plans || []).map(p => ({ ...p, text: bilingualText(p.text) })),
      outputs: (r.outputs || []).map(o => bilingualFields(o, ['type', 'desc'])),
    }));
  }

  // Waves: name, task texts, human items, blocker items
  if (data.waves) {
    data.waves = data.waves.map(w => {
      const result = { ...w, name: bilingualText(w.name) };
      if (w.humanItems) result.humanItems = bilingualArray(w.humanItems, ['text']);
      if (w.blockerItems) result.blockerItems = w.blockerItems.map(b => bilingualText(b));
      // Translate track task texts
      if (w.tracks) {
        const newTracks = {};
        for (const [lane, tasks] of Object.entries(w.tracks)) {
          newTracks[lane] = bilingualArray(tasks, ['text', 'track']);
        }
        result.tracks = newTracks;
      }
      return result;
    });
  }

  // Playbook: mottos name/meaning, features, convergence
  if (data.playbook) {
    if (data.playbook.mottos) {
      data.playbook.mottos = bilingualArray(data.playbook.mottos, ['name', 'meaning']);
    }
    if (data.playbook.features) {
      data.playbook.features = bilingualArray(data.playbook.features, ['name', 'traditional', 'swarmloop']);
    }
  }

  // Delivery coverage: page titles
  if (data.deliveryCoverage && data.deliveryCoverage.pages) {
    data.deliveryCoverage.pages = bilingualArray(data.deliveryCoverage.pages, ['title']);
  }

  // Feature tree: category names, sub names, feature names
  if (data.featureTree) {
    for (const cat of data.featureTree.categories) {
      const nameB = bilingualText(cat.name);
      cat.name = nameB;
      for (const sub of cat.subs) {
        sub.name = bilingualText(sub.name);
        sub.features = bilingualArray(sub.features, ['name']);
      }
      cat.features = bilingualArray(cat.features, ['name']);
    }
  }
}

// ── Build one project ──

function buildProject(project) {
  const pmPath = project.pmPath;
  if (!fs.existsSync(pmPath)) {
    console.warn(`  WARNING: PM path not found: ${pmPath}`);
    return null;
  }

  const docsDir = path.join(pmPath, 'docs');
  const knowledgeDir = path.join(pmPath, 'knowledge');
  const webDir = path.join(pmPath, 'web');

  const taskboardContent = readFileIfExists(path.join(docsDir, 'taskboard.md'));
  const backlogContent = readFileIfExists(path.join(docsDir, 'backlog.md'));
  const roadmapContent = readFileIfExists(path.join(docsDir, 'roadmap.md'));
  const synclogContent = readFileIfExists(path.join(pmPath, 'sync-log.md'));
  const drContent = readFileIfExists(path.join(docsDir, 'design-decisions.md'));
  const risksContent = readFileIfExists(path.join(docsDir, 'risks.md'));

  let topology = { phases: [], nodes: [], edges: [] };
  const topoPath = path.join(webDir, 'topology.json');
  if (fs.existsSync(topoPath)) {
    try { topology = JSON.parse(fs.readFileSync(topoPath, 'utf8')); } catch {}
  }

  const tb = parseTaskboard(taskboardContent);
  const roadmap = parseRoadmap(roadmapContent);

  const data = {
    generatedAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
    project: { id: project.id, name: project.name, description: project.description || '' },
    roadmap,
    taskboard: tb,
    topology,
    backlog: parseBacklog(backlogContent),
    risks: parseRisks(risksContent),
    designDecisions: parseDesignDecisions(drContent),
    knowledge: {
      pitfalls: parseKnowledgeDir(knowledgeDir, 'pitfalls'),
      patterns: parseKnowledgeDir(knowledgeDir, 'patterns'),
      apiNotes: parseKnowledgeDir(knowledgeDir, 'api-notes'),
    },
    changelog: parseSyncLog(synclogContent),
    dailyReports: parseDailyReports(path.join(pmPath, 'daily-reports')),
    uiComparison: parseUIComparison(path.join(docsDir, 'ui-comparison.json'), project.id, pmPath),
    playbook: parsePlaybook(pmPath),
    deliveryCoverage: parseDeliveryCoverage(path.join(docsDir, 'capability-map.md')) || parseDeliveryCoverage(path.join(docsDir, 'delivery-checklist.md')),
    featureTree: parseFeatureTree(path.join(docsDir, 'feature-tree.md')),
    waves: parseWaves(taskboardContent),
  };

  // ── Apply bilingual translations to all content fields ──
  applyBilingual(data);

  return data;
}

// ── Main ──

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirSync(srcPath, destPath);
    else fs.copyFileSync(srcPath, destPath);
  }
}

function main() {
  const projects = JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8'));
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(DOCS_DATA_DIR, { recursive: true });

  const manifest = [];

  for (const project of projects) {
    console.log(`Building: ${project.name} (${project.id})`);
    const data = buildProject(project);
    if (!data) continue;

    const jsonStr = JSON.stringify(data, null, 2);
    fs.writeFileSync(path.join(DATA_DIR, `${project.id}.json`), jsonStr);
    fs.writeFileSync(path.join(DOCS_DATA_DIR, `${project.id}.json`), jsonStr);

    // Copy project assets to docs/data/ as well
    const srcAssets = path.join(DATA_DIR, project.id, 'assets');
    if (fs.existsSync(srcAssets)) {
      copyDirSync(srcAssets, path.join(DOCS_DATA_DIR, project.id, 'assets'));
    }

    const tb = data.taskboard;
    const knTotal = data.knowledge.pitfalls.length + data.knowledge.patterns.length + data.knowledge.apiNotes.length;
    const totalTasks = (tb.inProgress?.length || 0) + (tb.todo?.length || 0) + (tb.done?.length || 0) +
                       (tb.inReview?.length || 0) + (tb.blocked?.length || 0);

    manifest.push({
      id: project.id,
      name: project.name,
      description: project.description || '',
      generatedAt: data.generatedAt,
      stats: {
        totalTasks,
        inProgress: tb.inProgress?.length || 0,
        todo: tb.todo?.length || 0,
        done: tb.done?.length || 0,
        inReview: tb.inReview?.length || 0,
        blocked: tb.blocked?.length || 0,
        phases: data.roadmap.length,
        phasesDone: data.roadmap.filter(p => p.status === 'done').length,
        knowledge: knTotal,
        risks: data.risks.length,
        pendingDR: data.designDecisions.pending?.length || 0,
      }
    });

    console.log(`  Tasks: ${totalTasks} (IP:${tb.inProgress.length} Todo:${tb.todo.length} Done:${tb.done.length})`);
    console.log(`  Phases: ${data.roadmap.length} | Knowledge: ${knTotal} | Risks: ${data.risks.length}`);
  }

  const manifestStr = JSON.stringify({
    generatedAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
    projects: manifest,
  }, null, 2);
  fs.writeFileSync(path.join(DATA_DIR, 'manifest.json'), manifestStr);
  fs.writeFileSync(path.join(DOCS_DATA_DIR, 'manifest.json'), manifestStr);

  // Copy web/ → docs/ (HTML + static assets for GitHub Pages)
  const webDir = path.join(ROOT, 'web');
  if (fs.existsSync(webDir)) {
    for (const f of fs.readdirSync(webDir)) {
      fs.copyFileSync(path.join(webDir, f), path.join(DOCS_DIR, f));
    }
    console.log('  Synced web/ → docs/ for GitHub Pages');
  }

  console.log(`\nBuild complete. ${manifest.length} projects built.`);
  console.log(`GitHub Pages dir: docs/`);
}

main();
