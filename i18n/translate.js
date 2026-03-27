#!/usr/bin/env node
/**
 * translate.js — Content translation module for PM Dashboard
 *
 * Provides Chinese → English translation for all content fields.
 * Uses: exact match dictionary → pattern-based substitution → fallback to original.
 *
 * Usage:
 *   const { bilingualText, translateText } = require('../i18n/translate');
 *   const bilingual = bilingualText('测试准备');
 *   // => { zh: '测试准备', en: 'Test Preparation' }
 */

// ── Exact match dictionary (full strings) ──
const EXACT = {
  // Wave names
  '测试准备': 'Test Preparation',
  '真机验证 + Bug 修复': 'Device Testing + Bug Fixes',
  '功能补缺 + 第二轮测试': 'Feature Completion + Round 2 Testing',
  'UI 打磨 + 性能': 'UI Polish + Performance',
  '验收 + 发布': 'Acceptance + Release',
  '编译修复': 'Build Fix',

  // Track names
  '人类轨道': 'Human Track',
  '人工轨道': 'Human Track',
  'AgentH 轨道': 'AgentH Track',
  'AgentH 轨道 — 功能补缺': 'AgentH Track — Feature Completion',
  'AgentH 轨道 — T-042 失败项修复': 'AgentH Track — T-042 Failure Fixes',
  'AgentH 轨道 — L2 测试': 'AgentH Track — L2 Tests',
  'AgentPM 轨道': 'AgentPM Track',
  'AgentG 轨道': 'AgentG Track',
  'AgentA 轨道': 'AgentA Track',
  '人类轨道 — 测试执行': 'Human Track — Test Execution',

  // Section headers
  '进行中': 'In Progress',
  '待启动': 'To Do',
  '已完成': 'Done',
  '审查中': 'In Review',
  '阻塞': 'Blocked',
  '待裁决': 'Pending',
  '已裁决': 'Resolved',
  '已关闭': 'Closed',
  '当前阶段': 'Current Phase',

  // Roadmap descriptions
  '数据模型/常量/DB/DAO/偏好设置/工具': 'Data Models / Constants / DB / DAO / Preferences / Utils',
  '权限/扫描/主页/媒体页/多选': 'Permissions / Scanner / Main Page / Media Page / Multi-select',
  '图片查看/视频播放/Swiper/幻灯片/EXIF': 'Photo Viewer / Video Player / Swiper / Slideshow / EXIF',
  '搜索/设置/编辑/文件操作/分享': 'Search / Settings / Edit / File Ops / Share',
  '文件夹管理/壁纸/Widget/导航串联': 'Folder Mgmt / Wallpaper / Widget / Navigation',

  // Design Decisions
  'UI 统一设计策略': 'UI Unified Design Strategy',
  '分层策略：Android 提取 token + HarmonyOS 原生组件优先 + ArkUI 组合兜底': 'Layered strategy: Extract Android tokens + HarmonyOS native components first + ArkUI composite fallback',
  '设置页 Boolean 选项: Toggle vs Checkbox': 'Settings Page Boolean Options: Toggle vs Checkbox',
  'PM 推荐 Toggle，等待宏哥确认': 'PM recommends Toggle, awaiting confirmation',
  '设计决策': 'Design Decision',

  // Changelog auto-entries
  '任务完成': 'Task Completed',
  '任务开始': 'Task Started',
  '节点完成': 'Node Completed',
  '节点开始': 'Node Started',
  '经验库': 'Knowledge Base',

  // Playbook mottos (exact)
  '人不等机': 'Human Never Waits',
  '机不等人': 'Agent Never Idles',
  '先种后收': 'Seed Then Harvest',

  // Common phrases
  '暂无': 'None',
  '已就绪': 'Ready',
  '方案已输出': 'Plan delivered',
  '有条件 GO': 'Conditional GO',
  '不阻塞': 'Non-blocking',
  '待确认': 'Pending confirmation',
  '待设计决策': 'Pending design decision',
  '仅本地可用': 'Local only',
};

// ── Pattern substitution dictionary (Chinese fragment → English) ──
const PATTERNS = [
  // Playbook motto meanings
  ['人类永远有可审/可决的事做，Agent 在后台并行', 'Human always has items to review/decide while Agents run in parallel'],
  ['Agent 被阻塞时切换任务，不空转等决策', 'When blocked, Agent switches tasks instead of idling for decisions'],
  ['每个项目开始前先播种知识，结束时收割', 'Seed knowledge before each project starts, harvest when it ends'],
  ['每个任务完成都要反哺知识库', 'Every task completion must feed back to knowledge base'],
  ['关键决策前触发对抗性仪式', 'Trigger adversarial ritual before key decisions'],
  ['UI 功能锚定到 Android 录屏帧', 'UI features anchored to Android recording frames'],
  ['不看时间看条件，条件满足才进下一 Wave', 'Progress by conditions, not time — next Wave only when ready'],
  ['每个任务都要有 Guardian 约束', 'Every task must have Guardian constraints'],
  ['每个重要操作都要记录到 sync-log', 'Every important operation must be logged to sync-log'],
  ['任务板是任务状态的唯一真相源', 'Taskboard is the single source of truth for task status'],
  ['偏离 Spec 前必须发起设计评审', 'Must initiate design review before deviating from Spec'],
  ['编码前必须检查知识库', 'Must check knowledge base before coding'],
  ['没有签署的 Spec 就不实现', 'No implementation without signed Spec'],

  // Sync-log / daily report specific
  ['方案已输出', 'Plan delivered'],
  ['日报更新', 'Daily report update'],
  ['日报全量更新', 'Daily report full update'],
  ['日报输出', 'Daily report output'],
  ['看板数据重建', 'Dashboard data rebuild'],
  ['远程部署', 'Remote deployment'],
  ['旅程', 'Journey'],
  ['功能', 'Feature'],
  ['社区', 'Community'],
  ['边界', 'Edge case'],
  ['测试用例', 'Test cases'],
  ['收敛报告', 'Convergence report'],
  ['为 Wave', 'For Wave'],
  ['所有任务注入', 'all tasks, inject'],
  ['所有任务', 'all tasks'],
  ['等价方案', 'equivalent solution'],
  ['20步', '20-step'],
  ['步A-B脚本', '-step A-B script'],
  ['文件夹视图', 'folder view'],

  // Task-related
  ['真机验证', 'Device Test'],
  ['功能矩阵测试', 'Feature Matrix Test'],
  ['边界场景测试', 'Edge Case Test'],
  ['单元测试', 'Unit Tests'],
  ['集成测试', 'Integration Tests'],
  ['测试体系设计', 'Test Architecture Design'],
  ['测试框架', 'Test Framework'],
  ['用例文档展开', 'Test Case Document Expansion'],

  // Wave / track
  ['功能补缺', 'Feature Completion'],
  ['真机验证', 'Device Testing'],
  ['测试准备', 'Test Preparation'],
  ['编译修复', 'Build Fix'],
  ['Bug 修复', 'Bug Fix'],
  ['Bug修复', 'Bug Fix'],

  // UI tasks
  ['逐像素对比', 'Pixel-by-pixel Comparison'],
  ['应用图标', 'App Icon'],
  ['启动页', 'Splash Screen'],
  ['列表滚动性能', 'List Scroll Performance'],
  ['内存与资源泄漏检查', 'Memory & Resource Leak Check'],
  ['应用签名配置', 'App Signing Config'],
  ['应用商店元数据', 'App Store Metadata'],
  ['基准截图采集', 'Baseline Screenshot Capture'],
  ['帧对比审查', 'Frame Comparison Review'],
  ['差异分类', 'Difference Classification'],
  ['收敛报告', 'Convergence Report'],

  // Feature tasks
  ['清除缓存', 'Clear Cache'],
  ['关于页面', 'About Page'],
  ['设置页复选框样式', 'Settings Page Checkbox Style'],
  ['长按多选重新设计', 'Long Press Multi-select Redesign'],
  ['分享功能修复', 'Share Function Fix'],
  ['视频缩略图修复', 'Video Thumbnail Fix'],
  ['文件夹卡片样式重构', 'Folder Card Style Refactor'],
  ['查看页底部操作栏', 'Viewer Bottom Action Bar'],
  ['时间线视图', 'Timeline View'],
  ['导出/导入设置', 'Export/Import Settings'],
  ['导出/导入收藏', 'Export/Import Favorites'],
  ['文件夹管理', 'Folder Management'],
  ['壁纸', 'Wallpaper'],
  ['全应用导航串联', 'Full App Navigation Wiring'],
  ['方法论设计', 'Methodology Design'],
  ['脚手架搭建', 'Scaffold Setup'],

  // BUG descriptions
  ['视频播放根本性修复', 'Video Playback Fundamental Fix'],
  ['双击缩放', 'Double-tap Zoom'],
  ['视频缩略图', 'Video Thumbnails'],
  ['删除按钮', 'Delete Button'],
  ['左右滑动', 'Left/Right Swipe'],
  ['图片文字叠加', 'Image Text Overlay'],
  ['视频无法播放', 'Video Cannot Play'],
  ['图片全屏后左右滑动无法切换', 'Cannot Switch Images by Swiping in Fullscreen'],
  ['双击缩放行为', 'Double-tap Zoom Behavior'],
  ['视频播放 + 手势缩放', 'Video Playback + Gesture Zoom'],

  // Monitoring / QA
  ['监控', 'Monitor'],
  ['修复质量', 'Fix Quality'],
  ['每个修复关联回归用例', 'Each fix linked to regression test'],
  ['回归用例', 'Regression Tests'],
  ['回归确认', 'Regression Confirmation'],
  ['预埋', 'Pre-embed'],
  ['注入', 'Inject'],
  ['清单', 'Checklist'],
  ['准出检查', 'Release Readiness Check'],
  ['灾难推演仪式', 'Disaster Drill Ceremony'],
  ['最终准出检查', 'Final Release Readiness Check'],
  ['发布准出标准全项', 'All Release Criteria'],
  ['全量回归', 'Full Regression'],
  ['验收测试', 'Acceptance Test'],

  // Phase names
  ['基础设施', 'Infrastructure'],
  ['核心浏览', 'Core Browsing'],
  ['查看体验', 'Viewing Experience'],
  ['国际化', 'Internationalization (i18n)'],

  // Knowledge domains
  ['领域', 'Domain'],
  ['通用规律', 'General Rule'],
  ['适用场景', 'Applicable Scenarios'],
  ['现象', 'Symptom'],
  ['实际行为', 'Actual Behavior'],

  // Sync log specific
  ['模块深度分析完成', 'Module Deep Analysis Completed'],
  ['编写完成', 'Writing Completed'],
  ['任务分解完成', 'Task Decomposition Completed'],
  ['全部完成', 'All Completed'],
  ['项目主体迁移完成', 'Main Project Migration Completed'],
  ['产出', 'Output'],
  ['并行', 'Parallel'],
  ['波并行执行', 'Wave Parallel Execution'],
  ['代码审查全部通过', 'All Code Reviews Passed'],
  ['新增', 'Added'],
  ['58条', '58 items'],
  ['88条', '88 items'],
  ['24条', '24 items'],
  ['12条', '12 items'],
  ['50条', '50 items'],
  ['包含', 'Including'],
  ['已决策', 'Decided'],

  // General terms
  ['执行中', 'In Progress'],
  ['通过', 'Passed'],
  ['失败项修复', 'Failed Item Fix'],
  ['脚本已就绪', 'Script Ready'],
  ['指南已就绪', 'Guide Ready'],
  ['人工', 'Manual'],
  ['人类', 'Human'],
  ['轨道', 'Track'],
  ['数据模型', 'Data Models'],
  ['常量', 'Constants'],
  ['偏好设置', 'Preferences'],
  ['工具函数', 'Utility Functions'],
  ['工具', 'Utils'],
  ['权限请求', 'Permission Request'],
  ['权限', 'Permissions'],
  ['扫描', 'Scan'],
  ['过滤', 'Filter'],
  ['缓存', 'Cache'],
  ['排序', 'Sort'],
  ['导航', 'Navigation'],
  ['分组', 'Grouping'],
  ['多选组件', 'Multi-select Component'],
  ['多选', 'Multi-select'],
  ['手势缩放', 'Gesture Zoom'],
  ['手势', 'Gesture'],
  ['平移', 'Pan'],
  ['旋转', 'Rotation'],
  ['翻转', 'Flip'],
  ['画笔', 'Brush'],
  ['亮度', 'Brightness'],
  ['音量', 'Volume'],
  ['全局搜索', 'Global Search'],
  ['去抖', 'Debounce'],
  ['裁剪', 'Crop'],
  ['开关', 'Toggle'],
  ['复制', 'Copy'],
  ['移动', 'Move'],
  ['删除', 'Delete'],
  ['重命名', 'Rename'],
  ['收藏', 'Favorites'],
  ['回收站', 'Recycle Bin'],
  ['分享', 'Share'],
  ['搜索', 'Search'],
  ['设置', 'Settings'],
  ['编辑', 'Edit'],
  ['文件操作', 'File Operations'],
  ['幻灯片', 'Slideshow'],
  ['图片查看', 'Photo View'],
  ['视频播放', 'Video Playback'],
  ['媒体扫描', 'Media Scan'],
  ['媒体列表', 'Media List'],
  ['目录显示', 'Directory Display'],
  ['数据库', 'Database'],
  ['文件夹', 'Folder'],
  ['文件', 'File'],
  ['网格', 'Grid'],
  ['日期分组', 'Date Grouping'],
  ['点击', 'Click'],
  ['跳转', 'Navigate'],
  ['状态持久化', 'State Persistence'],
  ['支持', 'Support'],
  ['返回', 'Return'],
  ['视图', 'View'],

  // Risk descriptions
  ['等级', 'Level'],
  ['阶段', 'Phase'],
  ['描述', 'Description'],
  ['冲突类型', 'Conflict Type'],
  ['日期', 'Date'],
  ['决策', 'Decision'],

  // Methodology
  ['方法论', 'Methodology'],
  ['口诀', 'Motto'],
  ['模板', 'Template'],
  ['脚本', 'Script'],

  // Playbook mottos
  ['Spec 先行', 'Spec First'],
  ['没有签署的 Spec 就不实现', 'No implementation without signed Spec'],
  ['先读后写', 'Read Before Write'],
  ['编码前必须检查知识库', 'Must check knowledge base before coding'],
  ['偏离先 DR', 'DR Before Deviation'],
  ['偏离 Spec 前必须发起设计评审', 'Must initiate design review before deviating from Spec'],
  ['看板为准', 'Board is Truth'],
  ['任务板是任务状态的唯一真相源', 'Taskboard is the single source of truth for task status'],
  ['逢动必记', 'Log Every Action'],
  ['每个重要操作都要记录到 sync-log', 'Every important operation must be logged to sync-log'],
  ['逢做必沉淀', 'Capture After Every Task'],
  ['每次任务完成都要反哺知识库', 'Contribute to knowledge base after every task completion'],
  ['收敛驱动', 'Convergence Driven'],
  ['不看时间看条件，条件满足才进下一 Wave', 'Progress by conditions met, not time elapsed — advance to next Wave only when ready'],
  ['守护贯穿', 'Guardian Throughout'],
  ['每个任务都要有 Guardian 约束', 'Every task must have Guardian constraints'],
  ['大事问鬼', 'Devil\'s Advocate for Big Decisions'],
  ['关键决策前触发对抗性仪式', 'Trigger adversarial ritual before critical decisions'],
  ['帧帧有据', 'Frame by Frame Evidence'],
  ['UI 功能锚定到 Android 录屏帧', 'UI features anchored to Android recording frames'],

  // Status markers
  ['已完成', 'Done'],
  ['进行中', 'In Progress'],
  ['待启动', 'To Do'],
  ['当前 Wave', 'Current Wave'],

  // Misc
  ['语言包转换', 'Language Pack Conversion'],
  ['硬编码替换', 'Hardcoded String Replacement'],
  ['编译警告分类清理', 'Build Warning Classification & Cleanup'],
  ['系统资源名验证', 'System Resource Name Verification'],
  ['编译验证', 'Build Verification'],
  ['重新编译验证', 'Recompile Verification'],
  ['保持', 'Keep'],
  ['符合', 'Compliant with'],
  ['设计规范', 'Design Guidelines'],
  ['从', 'From'],
  ['移入', 'Moved to'],
  ['步', 'Steps'],
  ['个', '',],
  ['份报告', 'reports'],
  ['行', 'lines'],
  ['难度分布', 'Difficulty Distribution'],
];

// Sort patterns by length descending so longer matches are tried first
PATTERNS.sort((a, b) => b[0].length - a[0].length);

/**
 * Translate a Chinese text string to English.
 * Strategy: exact match → pattern substitution → return original.
 */
function translateText(zhText) {
  if (!zhText || typeof zhText !== 'string') return zhText || '';

  // 1. Exact match
  const trimmed = zhText.trim();
  if (EXACT[trimmed]) return EXACT[trimmed];

  // 2. Pattern-based substitution
  let result = trimmed;
  for (const [zh, en] of PATTERNS) {
    if (result.includes(zh)) {
      result = result.split(zh).join(en);
    }
  }

  // 3. Insert spaces between English words and remaining Chinese characters
  // But do NOT split CamelCase identifiers (MainPage, FileProvider, DoD, etc.)
  result = result.replace(/([a-zA-Z])([^\x00-\x7F])/g, '$1 $2');
  result = result.replace(/([^\x00-\x7F])([a-zA-Z])/g, '$1 $2');

  // 4. Clean up artifacts (double spaces, leading/trailing separators)
  result = result.replace(/\s{2,}/g, ' ').trim();

  return result;
}

/**
 * Create a bilingual text object { zh, en }.
 * If input is already bilingual, return as-is.
 */
function bilingualText(text) {
  if (!text) return { zh: '', en: '' };
  if (typeof text === 'object' && text.zh !== undefined) return text;
  const zh = String(text);
  const en = translateText(zh);
  return { zh, en };
}

/**
 * Apply bilingual translation to a specific field of an object.
 * Returns new object with field replaced by {zh, en}.
 */
function bilingualField(obj, field) {
  if (!obj || !obj[field]) return obj;
  return { ...obj, [field]: bilingualText(obj[field]) };
}

/**
 * Apply bilingual translation to multiple fields of an object.
 */
function bilingualFields(obj, fields) {
  if (!obj) return obj;
  const result = { ...obj };
  for (const f of fields) {
    if (result[f] && typeof result[f] === 'string') {
      result[f] = bilingualText(result[f]);
    }
  }
  return result;
}

/**
 * Apply bilingual translation to an array of objects on specified fields.
 */
function bilingualArray(arr, fields) {
  if (!Array.isArray(arr)) return arr;
  return arr.map(item => bilingualFields(item, fields));
}

module.exports = { translateText, bilingualText, bilingualField, bilingualFields, bilingualArray };
