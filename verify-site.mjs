import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML_FILES = [
  'index.html',
  'lesson-1.html',
  'lesson-2.html',
  'lesson-3.html',
  'lesson-4.html',
  'formula-sheet.html'
];

function fail(msg) {
  console.error(`[FAIL] ${msg}`);
  process.exitCode = 1;
}

function runVerify() {
  const htmlByFile = new Map();
  const idsByFile = new Map();
  let totalKatex = 0;
  let totalQuestions = 0;
  let totalAnswers = 0;
  const referencedDiagrams = new Set();

  for (const file of HTML_FILES) {
    const full = path.join(__dirname, file);
    if (!fs.existsSync(full)) {
      fail(`Missing generated HTML file: ${file}`);
      continue;
    }
    const html = fs.readFileSync(full, 'utf8');
    htmlByFile.set(file, html);

    const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
    idsByFile.set(file, ids);

    // Check leaked placeholder tokens
    const tokenLeaks = html.match(/(?:KATEX(?:DISPLAY|INLINE)TOKEN|ESCAPEDDOLLARTOKEN|INLINECODETOKEN|CODEBLOCKTOKEN)/g);
    if (tokenLeaks) {
      fail(`${file}: leaked template placeholder token (${tokenLeaks[0]})`);
    }

    // Check leaked branding
    const brandLeaks = html.match(/(?:CPU|盗版必究|内部资料)/g);
    if (brandLeaks) {
      fail(`${file}: found prohibited branding token "${brandLeaks[0]}"`);
    }

    // Check KaTeX errors or unrendered raw LaTeX
    if (html.includes('katex-error')) {
      fail(`${file}: contains katex-error element`);
    }
    if (html.includes('<pre><code>')) {
      fail(`${file}: accidental indented <pre><code> block (check list indentation around display math)`);
    }
    if (html.includes('file://')) {
      fail(`${file}: leaked local file:// path`);
    }
    const htmlWithoutKatex = html.replace(/<span class="katex-mathml">[\s\S]*?<\/math><\/span>/g, '');

    // Check banned hype wording, cram-school clichés, and unwanted meta-annotations
    const hypeRegex = /(?:\[补图\]|\[自编数字练习\]|\[自编全真模拟\]|离线\/在线|支持 A4 打印|考前必熟|考试高性价比|官方课件忠实对照|终极能力终点|(?:00|01|02|06|07)_[^"<\s]*\.md|lecture\/W|Week2 Friday\.md|核武级|扫雷榜|排雷|绝杀|一秒定|一秒直达|一秒对齐|铁律|杀招|终极|通关|保命|红线|必熟|必背|必核|必查|必写|严禁|切勿|千万别|硬核|全真冲刺|全真模考|全真模拟|全真限时|总冲刺|终局|双杀|神图|核心钉|防错钉|防坑|避坑|八大坑|高性价比|底座|重塑|顶配|真刀真枪|胸有成竹|暴跌|元凶|头号|出头鸟|纹丝不动|记死|写死|踩分|Score-ready|口诀|炸药|深水|崩盘|塌陷|硬压|吃下|砸垮|反噬|飙升|飙向|崩塌|雷达)/g;
    const hypeMatches = htmlWithoutKatex.match(hypeRegex);
    if (hypeMatches) {
      fail(`${file}: found banned hype/meta-annotation token -> "${[...new Set(hypeMatches)].join('", "')}"`);
    }
    const rawLatex = htmlWithoutKatex.match(/\$[a-zA-Z(][^<\n]{0,40}\$|\\(?:frac|text|Rightarrow|implies|Delta|pi|rho|lambda)\b/);
    if (rawLatex) {
      fail(`${file}: suspected unrendered LaTeX outside KaTeX -> "${rawLatex[0].slice(0, 80)}"`);
    }

    const katexMatches = html.match(/class="katex"/g) || [];
    totalKatex += katexMatches.length;

    totalQuestions += (html.match(/data-master-id="/g) || []).length;
    totalAnswers += (html.match(/class="xp-answer"/g) || []).length;

    // Collect local src/href
    for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
      const ref = m[1];
      if (/^(?:https?:|mailto:|tel:|javascript:)/.test(ref)) continue;
      if (ref.startsWith('#')) {
        const targetId = decodeURIComponent(ref.slice(1));
        if (!ids.has(targetId)) {
          fail(`${file}: broken in-page anchor #${targetId}`);
        }
        continue;
      }
      const [filePart, hashPart] = ref.split('#');
      const assetPath = path.join(__dirname, filePart);
      if (!fs.existsSync(assetPath)) {
        fail(`${file}: missing referenced local asset/page "${filePart}"`);
        continue;
      }
      if (filePart.startsWith('assets/diagrams/')) {
        referencedDiagrams.add(path.basename(filePart));
      }
      if (hashPart && htmlByFile.has(filePart)) {
        // verify cross-page anchors in second pass
      }
    }
  }

  // Second pass: cross-page anchor verification + search-index check
  for (const file of HTML_FILES) {
    const html = htmlByFile.get(file);
    if (!html) continue;
    for (const m of html.matchAll(/href="([^"#]+)#([^"]+)"/g)) {
      const targetFile = m[1];
      const targetId = decodeURIComponent(m[2]);
      const targetIds = idsByFile.get(targetFile);
      if (!targetIds || !targetIds.has(targetId)) {
        fail(`${file}: broken cross-page anchor "${targetFile}#${targetId}"`);
      }
    }
  }

  const diagramFiles = fs.readdirSync(path.join(__dirname, 'assets', 'diagrams')).filter((f) => f.endsWith('.png'));
  for (const df of diagramFiles) {
    if (!referencedDiagrams.has(df)) {
      fail(`Unreferenced diagram PNG in assets/diagrams/: ${df}`);
    }
  }

  // Check search-index.js syntax & anchors & banned hype tokens
  const searchJs = fs.readFileSync(path.join(__dirname, 'assets', 'search-index.js'), 'utf8');
  const appJs = fs.readFileSync(path.join(__dirname, 'assets', 'app.js'), 'utf8');
  const assetHypeRegex = /(?:\[补图\]|\[自编数字练习\]|\[自编全真模拟\]|核武级|扫雷榜|排雷|绝杀|一秒定|一秒直达|一秒对齐|铁律|杀招|终极|通关|保命|红线|必熟|必背|必核|必查|必写|严禁|切勿|千万别|硬核|全真冲刺|全真模考|全真模拟|全真限时|总冲刺|终局|双杀|神图|核心钉|防错钉|防坑|避坑|八大坑|高性价比|底座|重塑|顶配|真刀真枪|胸有成竹|暴跌|元凶|头号|出头鸟|纹丝不动|记死|写死|踩分|Score-ready|口诀|炸药|深水|崩盘|塌陷|硬压|吃下|砸垮|反噬|飙升|飙向|崩塌|雷达)/g;
  for (const [assetName, assetBody] of [['assets/search-index.js', searchJs], ['assets/app.js', appJs]]) {
    const m = assetBody.match(assetHypeRegex);
    if (m) {
      fail(`${assetName}: found banned hype/meta-annotation token -> "${[...new Set(m)].join('", "')}"`);
    }
  }
  const jsonText = searchJs.replace(/^window\.ECON5103_SEARCH_INDEX\s*=\s*/, '').replace(/;\s*$/, '');
  const searchEntries = JSON.parse(jsonText);
  for (const entry of searchEntries) {
    const [targetFile, hashPart] = entry.href.split('#');
    if (!idsByFile.has(targetFile)) fail(`search-index.js: invalid file ${targetFile}`);
    else if (hashPart && !idsByFile.get(targetFile).has(decodeURIComponent(hashPart))) {
      fail(`search-index.js: invalid anchor ${entry.href}`);
    }
  }

  if (totalKatex < 100) fail(`Expected >= 100 rendered KaTeX spans across site, found ${totalKatex}`);
  if (totalQuestions !== 18) fail(`Expected 18 exercise/mock cards across site, found ${totalQuestions}`);
  if (totalAnswers !== 18) fail(`Expected 18 answer disclosures across site, found ${totalAnswers}`);
  if (diagramFiles.length !== 26) fail(`Expected 26 diagram PNGs, found ${diagramFiles.length}`);

  if (process.exitCode) {
    console.error('[ERROR] Site verification failed.');
    process.exit(1);
  }
  console.log(`[OK] Verified 6 HTML pages | KaTeX spans: ${totalKatex} | Diagrams: ${diagramFiles.length} | Exercises+Mocks: ${totalQuestions}/${totalAnswers} | Search entries: ${searchEntries.length} | Zero leaks.`);
}

runVerify();
