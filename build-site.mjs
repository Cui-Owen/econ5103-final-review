import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
import katex from 'katex';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = __dirname;
const SERIES_ROOT = path.resolve(SITE_ROOT, '..');

marked.setOptions({ gfm: true, breaks: false });

function readUtf8(filePath) {
  return fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[ch]);
}

function slugify(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'sec';
}

function stripAgencyBranding(text) {
  return String(text)
    .replace(/\[[^\]]*Final_全课程总速查\.md[^\]]*\]\([^)]+\)/g, '[期末公式总表](formula-sheet.html)')
    .replace(/（CPU 版）/g, '（学生复习版）')
    .replace(/CPU 经典学术风可编辑 PPTX（4 堂共 \*\*152 页\*\*），配套每课 `00_job_brief\.md`、`01_outline\.md`、`02_answer_key\.md`、`06_quick_reference\.md`、`07_practice_sheet\.md` 与自研高清 `\[补图\]`/g,
      '交互式帮助手册与分课讲练体系，整合 26 张高清手绘重制图 `[补图]` 与 18 组配套自测题')
    .replace(/`?\+\s*\\Delta G`?/g, '$+\\Delta G$')
    .replace(/对应课题/g, '对应课次')
    .replace(/CPU/g, '')
    .replace(/盗版必究/g, '')
    .replace(/Final_全课程总速查\.md/g, '[期末公式总表](formula-sheet.html)');
}

function renderHeadingText(text) {
  let out = escapeHtml(text || '');
  out = out.replace(/\$([^$\n]+?)\$/g, (_, tex) =>
    katex.renderToString(tex.trim(), { displayMode: false, throwOnError: true, strict: false })
  );
  return out;
}

function plainTitleText(text) {
  return String(text || '').replace(/\$([^$\n]+?)\$/g, '$1').replace(/`/g, '').trim();
}

function renderMarkdown(markdown) {
  let src = stripAgencyBranding(markdown || '');
  const codeBlocks = [];
  const inlineCodes = [];
  const mathBlocks = [];

  // 1. Protect fenced code blocks
  src = src.replace(/```([\w-]*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const token = `CODEBLOCKTOKEN${codeBlocks.length}END`;
    codeBlocks.push(`<pre><code class="language-${escapeHtml(lang)}">${escapeHtml(code)}</code></pre>`);
    return `\n\n${token}\n\n`;
  });

  // 2. Protect inline code spans
  src = src.replace(/`([^`\n]+?)`/g, (_, code) => {
    const token = `INLINECODETOKEN${inlineCodes.length}END`;
    inlineCodes.push(`<code>${escapeHtml(code)}</code>`);
    return token;
  });

  // 3. Temporarily guard escaped dollars (\$ -> token) so inline math matching never breaks at \$
  src = src.replace(/\\\$/g, 'ESCAPEDDOLLARTOKEN');

  // 4. Protect display math $$...$$ and \[...\]
  const renderTex = (tex, displayMode) => {
    const cleanTex = tex.replace(/ESCAPEDDOLLARTOKEN/g, '\\$').trim();
    return katex.renderToString(cleanTex, {
      displayMode,
      throwOnError: true,
      strict: false
    });
  };

  src = src.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => {
    const token = `KATEXDISPLAYTOKEN${mathBlocks.length}END`;
    mathBlocks.push(renderTex(tex, true));
    return `\n\n<div class="katex-block">${token}</div>\n\n`;
  });

  src = src.replace(/\\\[([\s\S]+?)\\\]/g, (_, tex) => {
    const token = `KATEXDISPLAYTOKEN${mathBlocks.length}END`;
    mathBlocks.push(renderTex(tex, true));
    return `\n\n<div class="katex-block">${token}</div>\n\n`;
  });

  // 5. Protect inline math $...$ and \(...\)
  src = src.replace(/\$([^$\n]+?)\$/g, (_, tex) => {
    const token = `KATEXINLINETOKEN${mathBlocks.length}END`;
    mathBlocks.push(renderTex(tex, false));
    return token;
  });

  src = src.replace(/\\\((.+?)\\\)/g, (_, tex) => {
    const token = `KATEXINLINETOKEN${mathBlocks.length}END`;
    mathBlocks.push(renderTex(tex, false));
    return token;
  });

  // 6. Parse markdown
  let html = marked.parse(src);

  // 7. Wrap tables cleanly
  html = html.replace(/<table>([\s\S]*?)<\/table>/g, '<div class="table-wrap"><table>$1</table></div>');

  // 8. Restore tokens
  html = html.replace(/ESCAPEDDOLLARTOKEN/g, '$');
  html = html.replace(/KATEX(?:DISPLAY|INLINE)TOKEN(\d+)END/g, (_, i) => mathBlocks[Number(i)]);
  html = html.replace(/INLINECODETOKEN(\d+)END/g, (_, i) => inlineCodes[Number(i)]);
  html = html.replace(/CODEBLOCKTOKEN(\d+)END/g, (_, i) => codeBlocks[Number(i)]);

  return html;
}

function splitMarkdownSections(md, level = 2) {
  const regex = new RegExp(`^#{${level}}\\s+(.+)$`);
  const lines = md.split('\n');
  const preamble = [];
  const sections = [];
  let current = null;

  for (const line of lines) {
    const match = line.match(regex);
    if (match) {
      if (current) sections.push({ title: current.title, body: current.lines.join('\n').trim() });
      current = { title: match[1].trim(), lines: [] };
    } else if (current) {
      current.lines.push(line);
    } else {
      preamble.push(line);
    }
  }
  if (current) sections.push({ title: current.title, body: current.lines.join('\n').trim() });
  return { preamble: preamble.join('\n').trim(), sections };
}

function splitNumberedItems(body) {
  const lines = body.split('\n');
  const items = [];
  let cur = null;
  for (const line of lines) {
    const m = line.match(/^(\d+)\.\s+\*\*(.+?)\*\*[：:]?(.*)$/);
    if (m) {
      if (cur) items.push({ heading: cur.heading, body: cur.lines.join('\n').trim() });
      const rest = m[3] ? m[3].trim() : '';
      cur = { heading: `${m[1]}. ${m[2].trim()}`, lines: rest ? [rest] : [] };
    } else if (cur) {
      cur.lines.push(line);
    }
  }
  if (cur) items.push({ heading: cur.heading, body: cur.lines.join('\n').trim() });
  return items;
}

function splitAnswerParts(answerBody) {
  const markers = [
    { key: 'concise', regex: /\*\*(?:考试简洁答法|参考答法|参考踩分答法|标准答案与踩分点)\*\*[：:]?/ },
    { key: 'detail', regex: /\*\*(?:完整步骤与易错自检|解题提示|思维深挖[^*]*)\*\*[：:]?/ }
  ];

  let promptMd = '';
  let conciseMd = '';
  let detailMd = '';

  const conciseMatch = answerBody.match(markers[0].regex);
  const detailMatch = answerBody.match(markers[1].regex);

  if (conciseMatch) {
    promptMd = answerBody.slice(0, conciseMatch.index).trim();
    const afterConcise = answerBody.slice(conciseMatch.index + conciseMatch[0].length);
    if (detailMatch && detailMatch.index > conciseMatch.index) {
      const splitOffset = detailMatch.index - conciseMatch.index - conciseMatch[0].length;
      conciseMd = afterConcise.slice(0, splitOffset).trim();
      detailMd = afterConcise.slice(splitOffset + detailMatch[0].length).trim();
    } else {
      conciseMd = afterConcise.trim();
    }
  } else {
    conciseMd = answerBody.trim();
  }

  return { promptMd, conciseMd, detailMd };
}

const LESSONS_META = [
  {
    id: 'lesson-1',
    num: 1,
    dir: 'Lesson_1_Micro_Core',
    file: 'lesson-1.html',
    navLabel: '第 1 课 · 微观核心 (U1–8, 11)',
    title: '第 1 课：微观核心重塑与跨单元计算底座',
    units: 'Units 1–8 & Unit 11',
    subtitle: 'Economic rent · 等成本线 · MRS=MRT · 博弈/Gini · 劳动纪律 · 垄断 MR=MC & Markup · 税负归宿 · 45° 泡沫',
    diagrams: [
      { file: 'l1_fig1_u3_mrs_mrt.png', unit: 'Unit 3', title: '无差异曲线与可行边界相切（MRS = MRT）及两效应', notes: ['横轴：每日自由时间；纵轴：每日消费/收入', '核心切点：MRS = MRT 决定最优工时', '加薪拆解：预算线平移 = Income Effect；变陡旋转 = Substitution Effect'] },
      { file: 'l1_fig2_u5_angela_bruno.png', unit: 'Unit 5', title: '权力制度与 Angela–Bruno 帕累托效率曲线', notes: ['技术边际线（生物生存约束）vs 帕累托效率曲线', '强制下收租 vs 法治谈判区间：Pareto 改善落入谈判透镜', '区分结果公平（Substantive）与程序公平（Procedural）'] },
      { file: 'l1_fig3_u6_labour_discipline.png', unit: 'Unit 6', title: '不完全契约与劳动纪律：效率工资均衡 w*', notes: ['Worker Best Response Curve（MRT）从保留工资起步', '最陡 Isocost 射线（MRS）与 BR 相切点即为利润最大化 w*', '失业救济 w_r↑ 或负效用 d↑ → BR 右移 → w* 上升'] },
      { file: 'l1_fig4_u7_ac_mc.png', unit: 'Unit 7', title: '规模经济：平均成本 AC 与边际成本 MC 关系', notes: ['固定成本被摊薄阶段存在递增规模收益', '只要 AC > MC，AC 必下降；MC 必穿过 AC 最低点', '自然垄断情形：单企全包成本低于多家分拆'] },
      { file: 'l1_fig5_u7_isoprofit_mr_mc.png', unit: 'Unit 7', title: '定价企业切点 MRS=MRT 与 MR=MC 等价性', notes: ['等利润线与向下倾斜需求曲线相切于最优点 (Q*, P*)', '线性反需求 P = a − bQ → MR = a − 2bQ（斜率翻倍）', 'MR > 0 必处于需求富弹性区间（ε > 1），且 Markup = 1/ε'] },
      { file: 'l1_fig6_u7_cs_ps_dwl.png', unit: 'Unit 7', title: '定价垄断福利割裂：CS / PS / Profit / DWL', notes: ['消费者剩余 CS：需求线下、售价上方三角', '生产者剩余 PS：售价与 MC 之间面积；Profit = PS − FC（切勿漏减 FC）', '无谓损失 DWL：Q* 至竞争点 P = MC 的帕累托效率损失三角'] },
      { file: 'l1_fig7_u8_comp_tax.png', unit: 'Unit 8', title: '完全竞争从量税、DWL 与弹性归宿规律', notes: ['长期竞争均衡满足 P = MC = AC，经济租归零', '加税 t 产生政府税收 tQ_1 与 DWL = 0.5×t×(Q_0−Q_1)', '谁更缺乏价格弹性（图像更陡峭），谁承担更多净税负'] },
      { file: 'l1_fig8_u11_price_dynamics.png', unit: 'Unit 11', title: '45° 线价格动态：稳定收敛 vs 投机性泡沫', notes: ['横轴当期 P_t，纵轴下期 P_{t+1}；45° 线为均衡不动点线', '斜率 < 1（比 45° 平）→ 偏离后收敛；可转售资产斜率 > 1 → 正反馈泡沫', '区分非投机限价 Rent ceiling（产生短缺与 Rationing）'] }
    ],
    practiceIds: ['l1-p1', 'l1-p2', 'l1-p3', 'l1-p4', 'l1-comp'],
    practiceSeconds: [180, 240, 300, 240, 360]
  },
  {
    id: 'lesson-2',
    num: 2,
    dir: 'Lesson_2_Failure_Labour_Credit',
    file: 'lesson-2.html',
    navLabel: '第 2 课 · 失灵/劳动/银行 (U12, 9, 10)',
    title: '第 2 课：市场失灵、劳动力市场与银行货币',
    units: 'Units 12, 9 & 10',
    subtitle: '外部性 MSC & 庇古税 · Coase 区间 · 2×2 公共品与不对称信息 · 三率与 WS/PS · 跨期与银行杠杆破产',
    diagrams: [
      { file: 'l2_fig1_u12_neg_ext.png', unit: 'Unit 12', title: '负外部性：MSC = MPC + MEC、庇古税与 Coase 区间', notes: ['私人仅看 P = MPC（产量 Q_A）；社会最优点看 P = MSC（产量 Q_B）', '庇古税必须取社会最优处 t* = MEC(Q_B)，勿代私人点 Q_A', 'Coase 讨价还价区间净剩余恰好等于消除的无谓损失 DWL'] },
      { file: 'l2_fig2_u12_pos_ext.png', unit: 'Unit 12', title: '正外部性、2×2 公共品分类与不对称信息框架', notes: ['按“竞争性 × 排他性”定位 Common pool / Public good / Artificially scarce', '签约前隐藏特征 → Adverse selection（逆向选择）', '签约后隐藏行动 → Moral hazard（道德风险）'] },
      { file: 'l2_fig3_u9_ws_ps_eq.png', unit: 'Unit 9', title: '全经济劳动市场：WS/PS 均衡与需求不足失业', notes: ['平 PS 线：W/P = 生产率 λ − 垄断加成利润', '纳什均衡交点 X 必存在均衡结构失业（维持纪律所需）', '总需求跌落导致向左滑至 B 点（Cyclical 需求不足失业）'] },
      { file: 'l2_fig4_u9_policies_unions.png', unit: 'Unit 9', title: '劳动市场政策与工会双重效应移动对照', notes: ['WS 下移（如减救济、工会 Voice effect）：失业降但平衡工资留在原 PS', 'PS 上移（提生产率 λ、加强反垄断降加成）：真实工资与就业率双升', '气馁退市同时缩小 U 与 LF，须看 E/Pop_wa 验证'] },
      { file: 'l2_fig5_u10_intertemporal.png', unit: 'Unit 10', title: '跨期消费平滑：1+ρ = 1+r 与信贷配给门槛', notes: ['可行预算斜率 MRT = 1+r；时间偏好无差异斜率 MRS = 1+ρ', '委托-代理风险催生 Equity 与 Collateral 硬门槛', '低资产群体陷入 Credit-constrained 或 Credit-excluded'] },
      { file: 'l2_fig6_u10_bank_money_sheet.png', unit: 'Unit 10', title: '商业银行 T 型账：放贷造存款与 Leverage 破产红线', notes: ['银行放贷同刻即在负债端记入存款，直接增加 Broad money', '区分流动性危机 Liquidity risk（挤兑缺现金）与 Insolvent（Equity < 0）', '破产铁律：坏账违约比例 > 1 / Leverage 瞬间资不抵债'] }
    ],
    practiceIds: ['l2-p1', 'l2-p2', 'l2-p3', 'l2-comp'],
    practiceSeconds: [300, 300, 300, 360]
  },
  {
    id: 'lesson-3',
    num: 3,
    dir: 'Lesson_3_Fluctuations_Fiscal',
    file: 'lesson-3.html',
    navLabel: '第 3 课 · 波动与财政 (U13–14)',
    title: '第 3 课：经济波动与财政乘数',
    units: 'Units 13 & 14',
    subtitle: 'Okun 定律 · GDP 贡献 vs 占比 · 平滑与协调博弈 · CPI/Deflator · 开放有税乘数 · I(r) 与紧缩反噬',
    diagrams: [
      { file: 'l3_fig1_u13_cycle_okun.png', unit: 'Unit 13', title: '商业周期与奥肯定律（Okun’s Law）负向联动', notes: ['增长 contribution = 权重 × 变化率（投资 I 份额小但跌势最猛）', '实际 GDP 增速跌破趋势时失业率 Δu 显著跳升', '分清 CPI（含进口与消费税）与 GDP Deflator（纯国内产出）'] },
      { file: 'l3_fig2_u13_smoothing_limits.png', unit: 'Unit 13', title: '消费平滑机制、永久冲击调整与三大失灵', notes: ['临时冲击可借储平滑；永久冲击必须下调长期消费基准', '三大障碍：Credit constraints / Weakness of will / Limited co-insurance', '企业投资协调博弈存在 (10,10) 与 (100,100) 双重均衡'] },
      { file: 'l3_fig3_u14_multiplier_45.png', unit: 'Unit 14', title: '凯恩斯 45° 线 Y = AD 与闭/开经济乘数效应', notes: ['45° 线为产出=支出均衡轨迹；AD 截距含 c0+I(r)+G+X', '首轮冲击 ΔA 经逐轮再消费收敛于 k × ΔA', '收敛条件：AD 斜率 < 1'] },
      { file: 'l3_fig4_u14_investment_fn.png', unit: 'Unit 14', title: '厂商利润 (ρ, r, Π) 三去向与投资曲线 I(r)', notes: ['利润优先：ρ>r≥Π 分红消费；r>ρ≥Π 存钱还债；Π>ρ≥r 投资扩产', '实际利率 r 变化 = 沿 I(r) 线滑动', '预期利润 Π、商业信心或税收成本改变 = 整条 I(r) 左右平移'] },
      { file: 'l3_fig5_u14_fiscal_open.png', unit: 'Unit 14', title: '开放有税漏出、节俭悖论与紧缩财政反噬', notes: ['三大漏出（1−c1、税率 t、进口 m）压平 AD 并缩小乘数：分母必写 +m', 'Paradox of thrift：集体节俭压缩 AD 造成合成谬误', '衰退期砍 G 令税收 tY 自动塌陷，Δ(T−G) = tΔY − ΔG 大打折扣'] },
      { file: 'l3_fig6_u14_sr_mr_wsps.png', unit: 'Unit 14 + U9', title: '短期总需求 45° 线向中期 WS/PS 劳动力市场联动', notes: ['短期 45° 产出跌落通过 Y = λN 直接决定裁员人数', '在上方劳动市场图对应偏离 X 向左落至 B 点（周期性失业）', '兼顾现实乘数制约：满产能 Crowding out 与加税预期'] }
    ],
    practiceIds: ['l3-p1', 'l3-p2', 'l3-p3', 'l3-comp'],
    practiceSeconds: [300, 300, 360, 300]
  },
  {
    id: 'lesson-4',
    num: 4,
    dir: 'Lesson_4_Inflation_Monetary_Mock',
    file: 'lesson-4.html',
    navLabel: '第 4 课 · 通胀/央行/模考 (U15)',
    title: '第 4 课：通胀、货币政策与全真冲刺',
    units: 'Unit 15 + Full Synthesis + Mock Q1–Q4',
    subtitle: '通胀 vs 通缩双杀 · Fisher 方程 · 议价缺口与 3→5→7% 螺旋 · 供给滞胀 · 央行四渠道 & ZLB · 全真模拟 Q1–Q4',
    diagrams: [
      { file: 'l4_fig1_u15_inflation_deflation.png', unit: 'Unit 15', title: 'Inflation、Disinflation 与 Deflation 双杀曲线对比', notes: ['Disinflation 是通胀率从高回落（仍 >0，物价续涨），切勿混为通缩', 'Deflation（π<0）触发推迟耐用品消费 + 真实债务加重螺旋', 'Fisher 方程 r = i − π：意外通胀有利借款方、损害债权人'] },
      { file: 'l4_fig2_u15_bargaining_gap_pc.png', unit: 'Unit 15', title: '从 WS/PS 议价缺口直接推导菲利普斯曲线 PC', notes: ['上图中 WS > PS 的正 Bargaining gap 对应下图中通胀加速', '央行把 Phillips Curve 当作可行边界 MRT，与社会无差异曲线相切（MRS=MRT）', '仅有唯一稳态 u*（缺口=0），对应 π = π^e'] },
      { file: 'l4_fig3_u15_pc_spiral_shift.png', unit: 'Unit 15', title: '适应性预期推动 3% → 5% → 7% 工资价格螺旋', notes: ['强行压低 u < u* 使每年正缺口叠加到下年预期通胀 π^e', '整条 Phillips curve 逐年向上平移：3% → 5% → 7%', '唯有回放 AD 至 u* 才能稳住当下通胀（停在非零预期未必为 0）'] },
      { file: 'l4_fig4_u15_supply_shock.png', unit: 'Unit 15', title: '1970s 石油供给冲击：PS 下移与 Stagflation 两难', notes: ['进口能源大涨挤占企业余值，直接压低 PS 线，抬高新稳态 u*', '旧就业位置暴露正缺口令 PC 剧烈上移，造成高通胀+高失业并存', '常规调 AD 左右为难，须靠独立央行 CBI 锁住长期预期'] },
      { file: 'l4_fig5_u15_mp_multiplier.png', unit: 'Unit 15', title: '央行 Cash/Policy Rate 驱动总需求的四大传导渠道', notes: ['① 市场贷款利率 I(r)；② 资产与房价净值消费 c0', '③ 企业盈利预期与信心；④ 本外利差带动汇率升贬改变净出口 NX', 'Zero Lower Bound（i≈0）改用 QE 买长债配合财政；欧元区缺自主利率与汇率阀'] },
      { file: 'l4_fig6_u15_macro_quadrant.png', unit: 'U1–U15 总图', title: '全学期宏观诊断四象限雷达与政策处方图', notes: ['第一象限（热：低u+高π）→ 升息降温 AD', '第四象限（寒：高u+通缩）→ 降息+财政或 ZLB QE', '第二象限（滞胀：高u+高π）→ CBI 稳预期 + 供给侧修复 PS'] }
    ],
    practiceIds: ['l4-p1', 'l4-mock-q1', 'l4-mock-q2', 'l4-mock-q3', 'l4-mock-q4'],
    practiceSeconds: [300, 360, 360, 360, 420]
  }
];

const CHM_INDEX_ENTRIES = [
  { term: '45° Line Multiplier (45° 线与乘数)', unit: 'U14', href: 'lesson-3.html#diagrams' },
  { term: '45° Price Dynamics / Bubble (泡沫判别)', unit: 'U11', href: 'lesson-1.html#diagrams' },
  { term: 'AC vs MC Cost Rules (成本铁律)', unit: 'U7', href: 'lesson-1.html#diagrams' },
  { term: 'Adaptive Expectations (适应性预期螺旋)', unit: 'U15', href: 'lesson-4.html#diagrams' },
  { term: 'Adverse Selection (逆向选择)', unit: 'U12', href: 'lesson-2.html#diagrams' },
  { term: 'Angela–Bruno Pareto Curve', unit: 'U5', href: 'lesson-1.html#diagrams' },
  { term: 'Austerity Feedback Δ(T−G) (紧缩反噬)', unit: 'U14', href: 'lesson-3.html#practice' },
  { term: 'Automatic Stabilizers (自动稳定器)', unit: 'U14', href: 'lesson-3.html#routes' },
  { term: 'Bank Money Creation (放贷造存款)', unit: 'U10', href: 'lesson-2.html#examples' },
  { term: 'Bargaining Gap (议价缺口)', unit: 'U15', href: 'lesson-4.html#routes' },
  { term: 'Best Response Curve (劳动努力反应线)', unit: 'U6', href: 'lesson-1.html#diagrams' },
  { term: 'Broad Money vs Base Money', unit: 'U10', href: 'lesson-2.html#routes' },
  { term: 'Central Bank Independence (CBI)', unit: 'U15', href: 'lesson-4.html#routes' },
  { term: 'Coase Bargaining Range (科斯谈判区间)', unit: 'U12', href: 'lesson-2.html#practice' },
  { term: 'Collateral & Credit Exclusion (抵押与排斥)', unit: 'U10', href: 'lesson-2.html#routes' },
  { term: 'Common-Pool vs Public Good (2×2 矩阵)', unit: 'U12', href: 'lesson-2.html#routes' },
  { term: 'Comparative Advantage (比较优势)', unit: 'U2', href: 'lesson-1.html#practice' },
  { term: 'Consumption Smoothing Limits (平滑三障碍)', unit: 'U13', href: 'lesson-3.html#diagrams' },
  { term: 'CPI vs GDP Deflator (价格指数对照)', unit: 'U13', href: 'lesson-3.html#routes' },
  { term: 'Crowding Out & Expectations (乘数制约)', unit: 'U14', href: 'lesson-3.html#practice' },
  { term: 'Currency Union / Eurozone (货币联盟局限)', unit: 'U15', href: 'lesson-4.html#routes' },
  { term: 'Cyclical Unemployment (周期性失业)', unit: 'U9+U14', href: 'lesson-3.html#diagrams' },
  { term: 'Debt-to-GDP Three Paths (降债三路径)', unit: 'U14', href: 'lesson-3.html#routes' },
  { term: 'Disinflation vs Deflation (减速 vs 通缩)', unit: 'U15', href: 'lesson-4.html#routes' },
  { term: 'Discouraged Workers (气馁退市 看 E/Pop)', unit: 'U9', href: 'lesson-2.html#practice' },
  { term: 'Economic Rent & Sunk Cost (经济租去沉没)', unit: 'U2', href: 'lesson-1.html#practice' },
  { term: 'Employment Rate vs Unemployment Rate', unit: 'U9', href: 'lesson-2.html#routes' },
  { term: 'Employment Rent Formula (就业租)', unit: 'U6', href: 'lesson-1.html#routes' },
  { term: 'Exchange Rate NX Channel (汇率净出口渠道)', unit: 'U15', href: 'lesson-4.html#diagrams' },
  { term: 'Fisher Equation r = i − π (费雪方程)', unit: 'U15', href: 'lesson-4.html#practice' },
  { term: 'Gini Coefficient 3-Person Formula (讲义口径)', unit: 'U5', href: 'lesson-1.html#examples' },
  { term: 'Growth Contribution = Weight × Rate', unit: 'U13', href: 'lesson-3.html#examples' },
  { term: 'Income vs Substitution Effect (两效应拆解)', unit: 'U3', href: 'lesson-1.html#diagrams' },
  { term: 'Investment Function I(r) 沿线 vs 平移', unit: 'U14', href: 'lesson-3.html#diagrams' },
  { term: 'Isocost Slope −w/p (等成本切换)', unit: 'U2', href: 'lesson-1.html#practice' },
  { term: 'Leverage & Insolvency (1/Leverage 破产红线)', unit: 'U10', href: 'lesson-2.html#practice' },
  { term: 'Markup = (P−MC)/P = 1/ε (加成反比)', unit: 'U7', href: 'lesson-1.html#routes' },
  { term: 'Mock Q1–Q4 (全真限时模拟卷)', unit: 'Mock', href: 'lesson-4.html#mock-exam' },
  { term: 'Moral Hazard (道德风险)', unit: 'U12', href: 'lesson-2.html#routes' },
  { term: 'MR = a − 2bQ = MC & Profit = PS − FC', unit: 'U7', href: 'lesson-1.html#practice' },
  { term: 'Nash Equilibrium vs Pareto Efficiency', unit: 'U4', href: 'lesson-1.html#practice' },
  { term: 'Okun’s Law (奥肯定律)', unit: 'U13', href: 'lesson-3.html#diagrams' },
  { term: 'Open Multiplier k = 1/[1−c1(1−t)+m]', unit: 'U14', href: 'lesson-3.html#routes' },
  { term: 'Paradox of Thrift (节俭悖论)', unit: 'U14', href: 'lesson-3.html#routes' },
  { term: 'Phillips Curve 3%→5%→7% Spiral', unit: 'U15', href: 'lesson-4.html#examples' },
  { term: 'Pigouvian Tax at Q_B: t* = MEC(Q_B)', unit: 'U12', href: 'lesson-2.html#routes' },
  { term: 'Rent Ceiling & Rationing (限价配给)', unit: 'U11', href: 'lesson-1.html#routes' },
  { term: 'SQ1–SQ7 Policy Connections (时事挂钩)', unit: 'SQ1–7', href: 'formula-sheet.html#sq-table' },
  { term: 'Stagflation / 1970s Supply Shock (滞胀)', unit: 'U15', href: 'lesson-4.html#diagrams' },
  { term: 'Tax Incidence & Elasticity (税负归宿)', unit: 'U8', href: 'lesson-1.html#practice' },
  { term: 'Top 10 Fatal Exam Traps (十大绝杀陷阱)', unit: 'All', href: 'formula-sheet.html#traps-table' },
  { term: 'WS/PS Equilibrium & Union Voice', unit: 'U9', href: 'lesson-2.html#diagrams' },
  { term: 'Zero Lower Bound (ZLB) & QE', unit: 'U15', href: 'lesson-4.html#routes' }
];

function buildSidebarHtml(currentFile, tocSections) {
  const treeBranches = tocSections.map((sec) => {
    if (sec.children && sec.children.length) {
      const subLinks = sec.children.map((ch) => `<li><a href="#${escapeHtml(ch.id)}">${escapeHtml(ch.label)}</a></li>`).join('');
      return `<li><details open><summary><a href="#${escapeHtml(sec.id)}">${escapeHtml(sec.label)}</a></summary><ul>${subLinks}</ul></details></li>`;
    }
    return `<li><a href="#${escapeHtml(sec.id)}">${escapeHtml(sec.label)}</a></li>`;
  }).join('');

  const pageTree = LESSONS_META.map((l) => {
    const isCurrent = l.file === currentFile;
    return `<li><a href="${l.file}"${isCurrent ? ' class="active"' : ''}>📄 ${escapeHtml(l.navLabel)}</a></li>`;
  }).join('');

  const indexItemsHtml = CHM_INDEX_ENTRIES.map((item) => `
    <li><a href="${escapeHtml(item.href)}"><span>${escapeHtml(item.term)}</span><span class="xp-index-unit">${escapeHtml(item.unit)}</span></a></li>
  `).join('');

  return `
  <aside class="chm-sidebar" aria-label="帮助中心导航栏">
    <div class="xp-sidebar-tabs">
      <menu role="tablist">
        <button role="tab" aria-selected="true" aria-controls="tab-contents">目录(C)</button>
        <button role="tab" aria-selected="false" aria-controls="tab-index">索引(N)</button>
        <button role="tab" aria-selected="false" aria-controls="tab-calc">速算器(T)</button>
      </menu>
    </div>
    <div class="xp-sidebar-panels">
      <section class="xp-tab-panel active" id="tab-contents" role="tabpanel">
        <div class="xp-task-box">
          <button type="button" class="xp-task-header" aria-expanded="true">
            <span>📘 本页章节目录</span>
            <span class="xp-task-chevron">︽</span>
          </button>
          <div class="xp-task-body">
            <div class="xp-tree-wrap">
              <ul class="tree-view">${treeBranches}</ul>
            </div>
          </div>
        </div>
        <div class="xp-task-box">
          <button type="button" class="xp-task-header" aria-expanded="true">
            <span>📂 全部复习页面 (CHM 卷宗)</span>
            <span class="xp-task-chevron">︽</span>
          </button>
          <div class="xp-task-body">
            <div class="xp-tree-wrap">
              <ul class="tree-view">
                <li><a href="index.html"${currentFile === 'index.html' ? ' class="active"' : ''}>🏠 帮助中心首页 · 四象限雷达</a></li>
                ${pageTree}
                <li><a href="formula-sheet.html"${currentFile === 'formula-sheet.html' ? ' class="active"' : ''}>Σ 期末公式总表 · 十大陷阱 · SQ1–7</a></li>
              </ul>
            </div>
          </div>
        </div>
        <div class="xp-task-box collapsed">
          <button type="button" class="xp-task-header" aria-expanded="false">
            <span>⚡ 考前高频快捷任务</span>
            <span class="xp-task-chevron">︾</span>
          </button>
          <div class="xp-task-body">
            <ul class="xp-task-list">
              <li><a href="lesson-4.html#mock-exam">⏱ 进入 25 分钟全真模考 Q1–Q4</a></li>
              <li><a href="formula-sheet.html#traps-table">⚠ 扫雷：十大考场绝杀陷阱榜</a></li>
              <li><a href="formula-sheet.html#sq-table">📰 SQ1–SQ7 时事大题术语对照</a></li>
              <li><button type="button" class="xp-link-btn" data-open-calc>🧮 打开侧栏三合一考场速算器</button></li>
            </ul>
          </div>
        </div>
      </section>

      <section class="xp-tab-panel" id="tab-index" role="tabpanel">
        <div class="xp-task-box">
          <button type="button" class="xp-task-header" aria-expanded="true">
            <span>🔎 概念关键词索引 (A–Z)</span>
            <span class="xp-task-chevron">︽</span>
          </button>
          <div class="xp-task-body">
            <input type="text" id="xp-index-filter" class="xp-index-filter" placeholder="输入关键词过滤：Gini / WS / +m / SQ6...">
            <ul id="xp-index-list" class="xp-index-list">${indexItemsHtml}</ul>
          </div>
        </div>
      </section>

      <section class="xp-tab-panel" id="tab-calc" role="tabpanel">
        <div class="xp-calc-box">
          <h4>🧮 1. 三人 Gini 核对器 (U5 无序3对)</h4>
          <form id="calc-gini-form">
            <div class="xp-calc-grid">
              <div class="xp-calc-field"><label for="gini-y1">y1</label><input id="gini-y1" type="number" step="any" value="12"></div>
              <div class="xp-calc-field"><label for="gini-y2">y2</label><input id="gini-y2" type="number" step="any" value="4"></div>
              <div class="xp-calc-field"><label for="gini-y3">y3</label><input id="gini-y3" type="number" step="any" value="2"></div>
            </div>
            <button type="submit" class="xp-tool-btn">计算 G = 0.5×Δ/ȳ</button>
            <div id="calc-gini-out" class="xp-calc-out"></div>
          </form>
        </div>

        <div class="xp-calc-box">
          <h4>📈 2. 开放有税乘数 & 紧缩反噬 (U14)</h4>
          <form id="calc-mult-form">
            <div class="xp-calc-grid">
              <div class="xp-calc-field"><label for="mult-c1">c1 (MPC)</label><input id="mult-c1" type="number" step="0.01" value="0.8"></div>
              <div class="xp-calc-field"><label for="mult-t">税率 t</label><input id="mult-t" type="number" step="0.01" value="0.25"></div>
              <div class="xp-calc-field"><label for="mult-m">进口 m</label><input id="mult-m" type="number" step="0.01" value="0.2"></div>
              <div class="xp-calc-field"><label for="mult-dg">财政 ΔG</label><input id="mult-dg" type="number" step="any" value="-200"></div>
            </div>
            <button type="submit" class="xp-tool-btn">计算 k_open 与 Δ(T−G)</button>
            <div id="calc-mult-out" class="xp-calc-out"></div>
          </form>
        </div>

        <div class="xp-calc-box">
          <h4>🏦 3. 银行杠杆与破产测试 (U10)</h4>
          <form id="calc-bank-form">
            <div class="xp-calc-grid">
              <div class="xp-calc-field"><label for="bank-res">准备金 Res</label><input id="bank-res" type="number" step="any" value="30"></div>
              <div class="xp-calc-field"><label for="bank-loan">贷款 Loans</label><input id="bank-loan" type="number" step="any" value="170"></div>
              <div class="xp-calc-field"><label for="bank-dep">存款 Dep</label><input id="bank-dep" type="number" step="any" value="180"></div>
              <div class="xp-calc-field"><label for="bank-loss">贷款坏账</label><input id="bank-loss" type="number" step="any" value="21"></div>
            </div>
            <button type="submit" class="xp-tool-btn">检测 Insolvency</button>
            <div id="calc-bank-out" class="xp-calc-out"></div>
          </form>
        </div>
      </section>
    </div>
  </aside>`;
}

function wrapPageHtml({ pageId, file, pageTitle, windowTitle, bannerSub, hasPractice, tocSections, contentHtml }) {
  const navTabs = [
    { href: 'index.html', label: '🏠 首页总览' },
    ...LESSONS_META.map((l) => ({ href: l.file, label: `📖 第 ${l.num} 课` })),
    { href: 'formula-sheet.html', label: 'Σ 公式与陷阱总表' }
  ].map((tab) => {
    const active = tab.href === file;
    return `<a class="xp-lesson-tab${active ? ' current' : ''}" href="${tab.href}"${active ? ' aria-current="page"' : ''}>${escapeHtml(tab.label)}</a>`;
  }).join('');

  return `<!doctype html>
<html lang="zh-CN" data-xp-theme="luna" data-font-mode="clear">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(pageTitle)} - ECON5103 帮助与支持中心</title>
  <meta name="description" content="ECON5103 Business Economics 期末冲刺学生参考站（Windows XP Help Center 风格）：涵盖 Units 1–15 核心路由、26 张模型图、18 组自测题与公式总表。">
  <link rel="stylesheet" href="assets/xp.css">
  <link rel="stylesheet" href="assets/katex/katex.min.css">
  <link rel="stylesheet" href="assets/style.css">
</head>
<body data-page="${escapeHtml(pageId)}">
  <div class="window xp-shell">
    <div class="title-bar">
      <div class="title-bar-text">
        <svg class="xp-title-icon" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="7" fill="#3fa9f5" stroke="#ffffff" stroke-width="1.2"/>
          <text x="8" y="11.5" text-anchor="middle" font-size="10" font-weight="bold" fill="#ffffff" font-family="Tahoma,sans-serif">?</text>
        </svg>
        <span>${escapeHtml(windowTitle)}</span>
      </div>
      <div class="title-bar-controls">
        <button type="button" aria-label="Minimize" data-win-min title="最小化 / 还原窗口"></button>
        <button type="button" aria-label="Maximize" data-win-max title="最大化 / 还原窗口"></button>
        <button type="button" aria-label="Close" data-win-close title="收起窗口"></button>
      </div>
    </div>

    <div class="window-body xp-shell-body">
      <header class="xp-help-banner">
        <div class="xp-banner-brand">
          <div class="xp-orb" aria-hidden="true">?</div>
          <div class="xp-banner-copy">
            <h1>ECON5103 · 期末复习帮助与支持中心 (Help &amp; Support Center)</h1>
            <p>${escapeHtml(bannerSub)}</p>
          </div>
        </div>
        <div class="xp-banner-search">
          <label for="xp-search-input">搜索(S):</label>
          <input id="xp-search-input" class="xp-search-input" type="text" placeholder="搜公式/概念：Gini、+m、WS/PS、SQ6...">
          <button id="xp-search-go" type="button" class="xp-go-btn">转到</button>
          <div id="xp-search-results" class="xp-search-results" aria-live="polite"></div>
        </div>
      </header>

      <div class="xp-toolbar" role="toolbar" aria-label="文档工具栏">
        <div class="xp-toolbar-group">
          <button type="button" class="xp-tool-btn xp-mobile-drawer-btn" data-mobile-drawer aria-pressed="false">📑 目录 / 索引 / 速算器</button>
          <button type="button" class="xp-tool-btn" data-toggle-sidebar aria-pressed="true">◧ 切换侧边栏</button>
          <a class="xp-tool-btn" href="index.html" style="text-decoration:none;color:inherit;">🏠 主页</a>
          <span class="xp-sep" aria-hidden="true"></span>
          ${hasPractice ? `
          <button type="button" class="xp-tool-btn" data-expand-all>📂 展开全部答案</button>
          <button type="button" class="xp-tool-btn" data-collapse-all>📁 收起全部答案</button>
          <span class="xp-sep" aria-hidden="true"></span>` : ''}
          <button type="button" class="xp-tool-btn" data-print>🖨 打印 / 存 PDF</button>
          <button type="button" class="xp-tool-btn" data-toggle-clippy aria-pressed="true">📎 复习小助手</button>
        </div>

        <div class="xp-toolbar-group">
          <label for="xp-theme-select">XP 主题:</label>
          <select id="xp-theme-select" class="xp-select" aria-label="切换 Windows XP 官方主题">
            <option value="luna">经典蓝 (Luna Blue)</option>
            <option value="olive">橄榄绿 (Olive Green)</option>
            <option value="silver">优雅银 (Silver)</option>
          </select>
          <label for="xp-font-select">字体:</label>
          <select id="xp-font-select" class="xp-select" aria-label="切换字体显示模式">
            <option value="clear">清晰黑体 (推荐阅读)</option>
            <option value="pixel">2000s 点阵宋 (复古)</option>
            <option value="projector">投影大字号</option>
          </select>
        </div>
      </div>

      <nav class="xp-lesson-strip" aria-label="课程章节切换">
        <span class="xp-strip-label">当前路径 C:\\ECON5103\\Final\\</span>
        ${navTabs}
      </nav>

      <div class="chm-workspace">
        ${buildSidebarHtml(file, tocSections)}
        <main class="chm-pane" id="chm-pane" tabindex="0">
          <article class="chm-doc">
            ${contentHtml}
          </article>
        </main>
      </div>

      <footer class="status-bar xp-status-bar">
        <p class="status-bar-field">完成 · ECON5103 Units 1–15 &amp; SQ1–SQ7 离线/在线纯静态查阅</p>
        <p class="status-bar-field" id="status-progress-text">已掌握 0 / 18 题</p>
        <div class="status-bar-field status-progress-wrap">
          <progress id="status-progress-bar" max="18" value="0"></progress>
        </div>
      </footer>
    </div>
  </div>

  <!-- Windows Picture and Fax Viewer Modal -->
  <div id="xp-fax-modal" class="xp-fax-modal" role="dialog" aria-modal="true" aria-labelledby="xp-fax-title">
    <div class="window xp-fax-window">
      <div class="title-bar">
        <div class="title-bar-text" id="xp-fax-title">Windows 图片和传真查看器</div>
        <div class="title-bar-controls">
          <button type="button" aria-label="Close" id="xp-fax-title-close"></button>
        </div>
      </div>
      <div class="xp-fax-stage">
        <img id="xp-fax-img" src="assets/diagrams/l1_fig1_u3_mrs_mrt.png" alt="模型放大视图">
      </div>
      <div class="xp-fax-footer">
        <div id="xp-fax-caption" class="xp-fax-caption"></div>
        <div class="xp-fax-btns">
          <button type="button" id="xp-fax-prev">◀ 上一张</button>
          <button type="button" id="xp-fax-next">下一张 ▶</button>
          <button type="button" id="xp-fax-zoom-out">🔍 缩小 -</button>
          <button type="button" id="xp-fax-zoom-reset">1:1 原比例</button>
          <button type="button" id="xp-fax-zoom-in">🔍 放大 +</button>
          <button type="button" id="xp-fax-close">关闭(Esc)</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Lightweight Context-Aware Clippy Assistant -->
  <aside id="clippy-widget" class="clippy-widget" aria-label="复习提示助手">
    <div class="clippy-bubble" role="status">
      <div id="clippy-text"></div>
      <div class="clippy-bubble-actions">
        <button type="button" id="clippy-next-btn">💡 下一条提醒</button>
        <button type="button" id="clippy-close-btn">收起</button>
      </div>
    </div>
    <button type="button" id="clippy-avatar-btn" class="clippy-avatar-btn" title="点击打开 / 收起考场防坑提示（大眼夹助手）">
      <svg width="34" height="34" viewBox="0 0 48 48" aria-hidden="true">
        <path d="M17 34V14c0-5 3.5-8 8-8s8 3 8 8v19c0 6.5-5 11-11.5 11S10 40.5 10 34V17" fill="none" stroke="#4a5568" stroke-width="3.6" stroke-linecap="round"/>
        <ellipse cx="19" cy="18" rx="4.2" ry="5" fill="#ffffff" stroke="#1a202c" stroke-width="1.4"/>
        <ellipse cx="29" cy="18" rx="4.2" ry="5" fill="#ffffff" stroke="#1a202c" stroke-width="1.4"/>
        <circle cx="20" cy="18.5" r="2" fill="#111827"/>
        <circle cx="30" cy="18.5" r="2" fill="#111827"/>
        <path d="M15 12 Q19 9 23 12" fill="none" stroke="#1a202c" stroke-width="1.8" stroke-linecap="round"/>
        <path d="M25 12 Q29 9 33 12" fill="none" stroke="#1a202c" stroke-width="1.8" stroke-linecap="round"/>
      </svg>
    </button>
  </aside>

  <script src="assets/search-index.js"></script>
  <script src="assets/app.js"></script>
</body>
</html>`;
}

function renderDiagramSection(lessonMeta, searchIndex) {
  const cardsHtml = lessonMeta.diagrams.map((d, i) => {
    const id = `fig-${lessonMeta.num}-${i + 1}`;
    searchIndex.push({
      title: `[补图] ${d.title}`,
      pageLabel: `第 ${lessonMeta.num} 课`,
      href: `${lessonMeta.file}#${id}`,
      keywords: `${d.unit} diagram graph figure ${d.title} ${d.notes.join(' ')}`,
      snippet: d.notes.join(' · ')
    });
    const notesHtml = d.notes.map((n) => `<li>${renderInlineLite(n)}</li>`).join('');
    return `
      <div class="diagram-card" id="${id}">
        <div class="diagram-head">
          <div class="diagram-title">${escapeHtml(d.title)}</div>
          <span class="xp-badge">${escapeHtml(d.unit)} · [补图]</span>
        </div>
        <button type="button" class="diagram-thumb-btn" data-fax-open data-src="assets/diagrams/${escapeHtml(d.file)}" data-title="${escapeHtml(d.title)}" data-unit="${escapeHtml(d.unit)}">
          <img src="assets/diagrams/${escapeHtml(d.file)}" alt="${escapeHtml(d.title)}" loading="lazy">
        </button>
        <ul class="diagram-notes" style="margin:0 0 0 18px;">${notesHtml}</ul>
        <div class="diagram-actions">
          <button type="button" class="xp-tool-btn" data-fax-open data-src="assets/diagrams/${escapeHtml(d.file)}" data-title="${escapeHtml(d.title)}" data-unit="${escapeHtml(d.unit)}">🔍 在图片查看器中放大</button>
        </div>
      </div>`;
  }).join('');

  return `<section id="diagrams">
    <h2>模型图像图库（共 ${lessonMeta.diagrams.length} 张 · 高清重绘 [补图]）</h2>
    <div class="xp-callout info">
      <div class="xp-callout-icon">🖼️</div>
      <div class="xp-callout-body">点击任意图像可在经典 <strong>Windows 图片和传真查看器</strong> 中自由缩放与前后翻页；全部图像均标注 <code>[补图]</code>，与公式和讲义机制一一对应。</div>
    </div>
    <div class="diagram-grid">${cardsHtml}</div>
  </section>`;
}

function renderInlineLite(text) {
  let out = escapeHtml(text).replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/π\^e/g, 'π<sup>e</sup>');
  out = out.replace(/([A-Za-zπ])_\{([^}]+)\}/g, '$1<sub>$2</sub>');
  out = out.replace(/([A-Za-zπ])_([A-Za-z0-9]+)/g, '$1<sub>$2</sub>');
  return out;
}

function renderQuestionCard({ masterId, title, badgeText, timeSeconds, questionMd, answerMd, anchorId, isMock }) {
  const parts = splitAnswerParts(answerMd);
  const mins = Math.round(timeSeconds / 60);
  const badgeClass = isMock ? 'xp-badge mock' : 'xp-badge warn';

  return `
  <section class="q-card" id="${escapeHtml(anchorId)}">
    <header class="q-card-header">
      <div class="q-card-title-row">
        <span class="${badgeClass}">${escapeHtml(badgeText)}</span>
        <h3>${renderHeadingText(title)}</h3>
      </div>
      <div class="q-card-controls">
        <div class="q-timer" data-seconds="${timeSeconds}" title="独立限时计时器（建议 ${mins} 分钟）">
          <span>⏱</span>
          <span class="q-timer-clock">${String(mins).padStart(2, '0')}:00</span>
          <button type="button" class="q-timer-btn" data-timer-toggle>▶ 计时</button>
          <button type="button" class="q-timer-btn" data-timer-reset>↺</button>
        </div>
        <div class="q-mastered-wrap">
          <input type="checkbox" id="chk-${escapeHtml(masterId)}" data-master-id="${escapeHtml(masterId)}">
          <label for="chk-${escapeHtml(masterId)}">已掌握本题</label>
        </div>
      </div>
    </header>
    <div class="q-card-body">
      ${renderMarkdown(questionMd)}
    </div>
    <details class="xp-answer" id="ans-${escapeHtml(masterId)}">
      <summary><span class="xp-answer-label">📁 查看参考答案与踩分点</span><span>⌄</span></summary>
      <div class="xp-answer-body">
        ${parts.conciseMd ? `<div class="score-ready-box"><h4>✅ 考试简洁答法（Score-ready）</h4>${renderMarkdown(parts.conciseMd)}</div>` : ''}
        ${parts.detailMd ? `<div class="step-detail-box"><h4>📝 完整推演步骤与易错自检</h4>${renderMarkdown(parts.detailMd)}</div>` : ''}
      </div>
    </details>
  </section>`;
}

function buildLessonPage(lessonMeta, searchIndex) {
  const lessonDir = path.join(SERIES_ROOT, lessonMeta.dir);
  const outlineMd = readUtf8(path.join(lessonDir, '01_outline.md'));
  const quickRefMd = readUtf8(path.join(lessonDir, '06_quick_reference.md'));
  const practiceMd = readUtf8(path.join(lessonDir, '07_practice_sheet.md'));
  const answerMd = readUtf8(path.join(lessonDir, '02_answer_key.md'));

  const outlineSec = splitMarkdownSections(outlineMd, 2);
  const quickSec = splitMarkdownSections(quickRefMd, 2);
  const practiceSec = splitMarkdownSections(practiceMd, 2);
  const answerSec = splitMarkdownSections(answerMd, 2);

  // Build Overview + Priority Table + Glossary from 01_outline.md
  const goalSec = outlineSec.sections.find((s) => s.title.includes('终点目标'));
  const prioritySec = outlineSec.sections.find((s) => s.title.includes('优先级'));
  const roadmapSec = outlineSec.sections.find((s) => s.title.includes('核心教学主线'));
  const glossarySec = outlineSec.sections.find((s) => s.title.includes('中英术语'));

  let overviewGoalMd = (goalSec?.body || '').replace(/-\s+\*\*时间预算\*\*.*\n?/, '');

  // Quick Reference routes & pitfalls
  const routesRaw = quickSec.sections[0]?.body || '';
  const routeItems = splitNumberedItems(routesRaw);
  const pitfallsSec = quickSec.sections[1];

  const routeCardsHtml = routeItems.length
    ? routeItems.map((rt, idx) => {
        const rid = `route-${lessonMeta.num}-${idx + 1}`;
        searchIndex.push({
          title: plainTitleText(rt.heading),
          pageLabel: `第 ${lessonMeta.num} 课`,
          href: `${lessonMeta.file}#${rid}`,
          keywords: `${lessonMeta.units} route formula ${plainTitleText(rt.heading)}`,
          snippet: rt.body.replace(/[#*$`>]/g, ' ').replace(/\s+/g, ' ').trim()
        });
        return `<div class="route-card" id="${rid}"><h3>${renderHeadingText(rt.heading)}</h3>${renderMarkdown(rt.body)}</div>`;
      }).join('')
    : renderMarkdown(routesRaw);

  // Worked lecture examples from 02_answer_key.md
  const lectureExSec = answerSec.sections.find((s) => s.title.includes('讲义'));
  const lectureExampleHtml = lectureExSec
    ? `<section id="examples"><h2>讲义原数字核对算例（官方课件忠实对照）</h2><div class="xp-lecture-example">${renderMarkdown(lectureExSec.body)}</div></section>`
    : '';

  if (lectureExSec) {
    searchIndex.push({
      title: lectureExSec.title,
      pageLabel: `第 ${lessonMeta.num} 课`,
      href: `${lessonMeta.file}#examples`,
      keywords: `worked example Gini OrderBook Julia BonusBank 2009 GDP Phillips`,
      snippet: lectureExSec.body.replace(/[#*$`>]/g, ' ').replace(/\s+/g, ' ').trim()
    });
  }

  // Pair Practice Questions + Answers (and Mock Q1-Q4 in Lesson 4)
  const qCardsHtmlList = [];
  const qTocChildren = [];

  if (lessonMeta.num < 4) {
    const pSections = practiceSec.sections;
    const aSections = answerSec.sections.filter((s) => !s.title.includes('讲义'));
    if (pSections.length !== aSections.length) {
      throw new Error(`${lessonMeta.dir}: practice sections (${pSections.length}) != answer sections (${aSections.length})`);
    }
    pSections.forEach((ps, i) => {
      const masterId = lessonMeta.practiceIds[i];
      const anchorId = `q-${masterId}`;
      const cleanTitle = ps.title.replace(/`?\[自编数字练习\]`?/g, '').trim();
      const plainQTitle = plainTitleText(cleanTitle);
      qTocChildren.push({ id: anchorId, label: plainQTitle.replace(/（.*?）/, '') });
      searchIndex.push({
        title: plainQTitle,
        pageLabel: `第 ${lessonMeta.num} 课`,
        href: `${lessonMeta.file}#${anchorId}`,
        keywords: `practice question ${plainQTitle} ${lessonMeta.units}`,
        snippet: ps.body.replace(/[#*$`>]/g, ' ').replace(/\s+/g, ' ').trim()
      });
      qCardsHtmlList.push(renderQuestionCard({
        masterId,
        title: cleanTitle,
        badgeText: '[自编数字练习]',
        timeSeconds: lessonMeta.practiceSeconds[i] || 300,
        questionMd: ps.body,
        answerMd: aSections[i].body,
        anchorId,
        isMock: false
      }));
    });
  } else {
    // Lesson 4: Section 0 is 单元练习; Section 1 has ### Mock Q1..Q4
    const pUnit = practiceSec.sections[0];
    const aUnit = answerSec.sections[1];
    qTocChildren.push({ id: 'q-l4-p1', label: 'Unit 15 单元练习' });
    qCardsHtmlList.push(renderQuestionCard({
      masterId: 'l4-p1',
      title: pUnit.title.replace(/`?\[自编数字练习\]`?/g, '').trim(),
      badgeText: '[自编数字练习]',
      timeSeconds: lessonMeta.practiceSeconds[0],
      questionMd: pUnit.body,
      answerMd: aUnit.body,
      anchorId: 'q-l4-p1',
      isMock: false
    }));

    const pMocks = splitMarkdownSections(practiceSec.sections[1].body, 3).sections;
    const aMocks = splitMarkdownSections(answerSec.sections[2].body, 3).sections;
    if (pMocks.length !== 4 || aMocks.length !== 4) {
      throw new Error(`Lesson 4 mock mismatch: p=${pMocks.length}, a=${aMocks.length}`);
    }

    qCardsHtmlList.push(`
      <div class="mock-suite-bar" id="mock-exam">
        <div>
          <strong style="font-size:15px;color:#8c3c00;">⏱ 限时全真模拟考场：Mock Q1–Q4（建议 25 分钟连做）</strong>
          <div style="font-size:12.5px;color:#5a4620;">覆盖 U7+U12 垄断污染 · U9+U10 劳动杠杆 · U13+U14 开放紧缩 · U15 货币滞胀（先闭卷演算再逐题对核踩分点）</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span id="mock-suite-clock" class="mock-big-clock">25:00</span>
          <button type="button" class="xp-go-btn" data-mock-start>▶ 计时</button>
          <button type="button" class="xp-tool-btn" data-mock-reset>↺ 重置 25 分钟</button>
        </div>
      </div>
    `);

    pMocks.forEach((pm, idx) => {
      const masterId = lessonMeta.practiceIds[idx + 1];
      const anchorId = `q-${masterId}`;
      const cleanTitle = pm.title.trim();
      qTocChildren.push({ id: anchorId, label: cleanTitle.replace(/（.*?）/, '') });
      searchIndex.push({
        title: cleanTitle,
        pageLabel: '第 4 课 · 模考',
        href: `lesson-4.html#${anchorId}`,
        keywords: `mock exam ${cleanTitle} Q${idx + 1}`,
        snippet: pm.body.replace(/[#*$`>]/g, ' ').replace(/\s+/g, ' ').trim()
      });
      qCardsHtmlList.push(renderQuestionCard({
        masterId,
        title: cleanTitle,
        badgeText: '[自编全真模拟]',
        timeSeconds: lessonMeta.practiceSeconds[idx + 1] || 360,
        questionMd: pm.body,
        answerMd: aMocks[idx].body,
        anchorId,
        isMock: true
      }));
    });
  }

  const tocSections = [
    { id: 'overview', label: '1. 课程目标与优先级' },
    { id: 'routes', label: '2. 核心公式与决策路由', children: routeItems.map((rt, i) => ({ id: `route-${lessonMeta.num}-${i + 1}`, label: plainTitleText(rt.heading) })) },
    { id: 'diagrams', label: `3. 模型图库 (${lessonMeta.diagrams.length} 张 [补图])` },
    ...(lectureExSec ? [{ id: 'examples', label: '4. 讲义原例数字核对' }] : []),
    { id: 'practice', label: `${lectureExSec ? 5 : 4}. 限时练习与踩分答案`, children: qTocChildren },
    { id: 'pitfalls', label: `${lectureExSec ? 6 : 5}. 高频坑排雷与术语` }
  ];

  const pitfallsTitle = pitfallsSec ? pitfallsSec.title.replace(/^二、\s*/, '') : '高频考场陷阱排查';
  const glossaryHtml = glossarySec ? `<h3>核心中英术语对照（考试识别词）</h3>${renderMarkdown(glossarySec.body)}` : '';

  const contentHtml = `
    <div class="chm-breadcrumb">
      <a href="index.html">首页</a> › <span>第 ${lessonMeta.num} 课</span> › <span class="xp-badge">${escapeHtml(lessonMeta.units)}</span>
    </div>
    <h1 id="overview">${escapeHtml(lessonMeta.title)}</h1>
    <div class="xp-callout tip">
      <div class="xp-callout-icon">💡</div>
      <div class="xp-callout-body">
        <strong>本课重点定位（${escapeHtml(lessonMeta.units)}）：</strong>${escapeHtml(lessonMeta.subtitle)}
        <div style="margin-top:4px;"><span class="xp-badge must" data-lesson-progress="${escapeHtml(lessonMeta.id)}">练习进度 0/${lessonMeta.practiceIds.length}</span> &nbsp; 所有带 <code>[自编数字练习]</code> / <code>[自编全真模拟]</code> 均为按官方讲义模型重写数值的训练题，点击题卡右上角即可限时与打卡。</div>
      </div>
    </div>

    ${overviewGoalMd ? renderMarkdown(overviewGoalMd) : ''}
    ${prioritySec ? `<h3>教学优先级取舍（考试高性价比顺序）</h3>${renderMarkdown(prioritySec.body)}` : ''}
    ${roadmapSec ? `<details class="route-card"><summary style="cursor:pointer;font-weight:700;color:#103a8a;">🧭 展开：本课五步机制推演路线图（为什么这样串）</summary><div style="margin-top:8px;">${renderMarkdown(roadmapSec.body)}</div></details>` : ''}

    <section id="routes">
      <h2>核心公式与计算决策路由（考前必熟）</h2>
      ${routeCardsHtml}
    </section>

    ${renderDiagramSection(lessonMeta, searchIndex)}

    ${lectureExampleHtml}

    <section id="practice">
      <h2>限时独立练习与逐步参考答案（建议先做再展开）</h2>
      ${qCardsHtmlList.join('\n')}
    </section>

    <section id="pitfalls">
      <h2>${escapeHtml(pitfallsTitle)}</h2>
      ${pitfallsSec ? renderMarkdown(pitfallsSec.body) : ''}
      ${glossaryHtml}
    </section>
  `;

  return wrapPageHtml({
    pageId: lessonMeta.id,
    file: lessonMeta.file,
    pageTitle: `第 ${lessonMeta.num} 课：${lessonMeta.units}`,
    windowTitle: `ECON5103 Final 帮助中心 - 第 ${lessonMeta.num} 课 (${lessonMeta.units})`,
    bannerSub: `第 ${lessonMeta.num} 课 · ${lessonMeta.units} · ${lessonMeta.diagrams.length} 张模型图 + ${lessonMeta.practiceIds.length} 组限时精练与逐步答案`,
    hasPractice: true,
    tocSections,
    contentHtml
  });
}

function buildIndexPage(searchIndex) {
  const overviewMd = readUtf8(path.join(SERIES_ROOT, '00_系列总纲与规划.md'));
  const cheatMd = readUtf8(path.join(SERIES_ROOT, 'Final_全课程总速查.md'));

  const overviewSecs = splitMarkdownSections(overviewMd, 2).sections;
  const bridgesSec = overviewSecs.find((s) => s.title.includes('贯通主线'));
  const studyFlowSec = overviewSecs.find((s) => s.title.includes('学习执行建议'));

  const cheatSecs = splitMarkdownSections(cheatMd, 2).sections;
  const radarSec = cheatSecs.find((s) => s.title.includes('一秒定模型雷达'));

  let radarHtml = renderMarkdown(radarSec?.body || '');
  radarHtml = radarHtml.replace('<table>', '<table id="radar-table">');

  const topicCardsHtml = LESSONS_META.map((l) => `
    <a class="xp-topic-card" href="${l.file}">
      <div class="xp-topic-top">
        <span class="xp-topic-title">第 ${l.num} 课：${escapeHtml(l.title.replace(/^第 \d 课：/, ''))}</span>
        <span class="xp-badge must" data-lesson-progress="${escapeHtml(l.id)}">练习进度 0/${l.practiceIds.length}</span>
      </div>
      <div class="xp-topic-desc">${escapeHtml(l.subtitle)}</div>
      <div class="xp-topic-meta">
        <span>📘 单元：<strong>${escapeHtml(l.units)}</strong></span>
        <span>🖼 模型图：<strong>${l.diagrams.length} 张 [补图]</strong></span>
        <span>📝 精练：<strong>${l.practiceIds.length} 组含逐问解析</strong></span>
      </div>
    </a>
  `).join('');

  searchIndex.push({
    title: '考场四象限一秒定模型雷达 (U1–U15 关键词直达)',
    pageLabel: '首页',
    href: 'index.html#radar',
    keywords: 'radar quadrant keywords formula diagnostic 雷达 四象限',
    snippet: '按题干关键词快速锁定微观底座、市场失灵银行、财政乘数与通胀货币央行对应模型'
  });

  const contentHtml = `
    <div class="chm-breadcrumb">
      <span>帮助中心主页</span> › <span class="xp-badge">ECON5103 Business Economics · 4 堂 × 2 小时 Final 总复习</span>
    </div>
    <h1 id="welcome">欢迎使用 ECON5103 Business Economics 期末复习帮助与支持中心</h1>

    <div class="xp-callout warn">
      <div class="xp-callout-icon">⚠️</div>
      <div class="xp-callout-body">
        <strong>考情边界与诚信说明（严格依据课程文件核对）：</strong>
        <ul style="margin:4px 0 0 18px;">
          <li>据课程资料 <code>2026 Week1 Admin issues</code>：<strong>Final Exam 占总评 50%</strong>，覆盖 <strong>Weeks 1–10 全部内容</strong>，且整体<strong>偏重宏观部分</strong>。</li>
          <li>原始课程包中<strong>不含官方历年真题或官方评分细则（Rubric）</strong>，本站不虚构官方题号与分值占比。</li>
          <li>所有课内练习与第 4 课 Q1–Q4 均严格遵循讲义模型重新设计数字，并明确标注 <code>[自编数字练习]</code> / <code>[自编全真模拟]</code>；26 张曲线示意图均标注 <code>[补图]</code>。</li>
        </ul>
      </div>
    </div>

    <section class="xp-home-grid" id="topics">
      <div>
        <h2 style="margin-top:0;">选择一个复习课题（Pick a Help Topic）</h2>
        <div class="xp-topic-grid">
          ${topicCardsHtml}
          <a class="xp-topic-card" href="formula-sheet.html" style="border-color:#2b7a2b;background:#f4fbf4;">
            <div class="xp-topic-top">
              <span class="xp-topic-title" style="color:#1c5f22;">Σ 考前终极速查手册（U1–U15 公式 + 十大陷阱 + SQ1–SQ7）</span>
              <span class="xp-badge must">支持 A4 打印</span>
            </div>
            <div class="xp-topic-desc">考前一晚只需打开这一页：汇集 16 组核心方程、核心曲线“沿线滑 vs 整线移”矩阵、十大绝杀排雷表与 SQ1–SQ7 论述关键词卡。</div>
            <div class="xp-topic-meta">
              <span>🖨 一键干净打印</span>
              <span>🔍 全文支持顶部搜索与 A–Z 索引</span>
            </div>
          </a>
        </div>
      </div>

      <div class="xp-task-panel-card">
        <h3>考前 72 小时通关任务</h3>
        <ul class="xp-task-list" style="margin-bottom:12px;">
          <li><a href="index.html#radar">🎯 1. 用“四象限雷达”练就读题一秒选模型</a></li>
          <li><a href="lesson-1.html#practice">📐 2. 打通第 1 课微观切点、垄断与税收计算</a></li>
          <li><a href="lesson-2.html#practice">🏦 3. 攻克第 2 课庇古税 Q_B、WS/PS 与银行破产</a></li>
          <li><a href="lesson-3.html#practice">📊 4. 练熟第 3 课开放乘数 +m 与紧缩反噬</a></li>
          <li><a href="lesson-4.html#mock-exam">⏱ 5. 在第 4 课完成 25 分钟全真模考 Q1–Q4</a></li>
          <li><a href="formula-sheet.html#traps-table">⚠ 6. 考前十分钟复查“十大绝杀陷阱榜”</a></li>
          <li><button type="button" class="xp-link-btn" data-open-calc>🧮 7. 启动左侧 3 合 1 算式自检速算器</button></li>
        </ul>
        <div style="border-top:1px solid #b8c8e8;padding-top:8px;font-size:12.5px;">
          <p style="margin:0 0 5px;"><strong>考前 3 天标准复习流：</strong></p>
          <ol style="margin:0 0 0 18px;">
            <li>先过一遍每课 <strong>优先级表</strong> 与 <strong>核心计算路由</strong>，结合高清 <code>[补图]</code> 建立模型直觉。</li>
            <li>遮盖解析并使用题卡右上角 <strong>计时器</strong> 独立做完各课练习，展开逐步解析查漏并勾选 <code>已掌握本题</code>。</li>
            <li>考前一天集中攻克第 4 课 <strong>25 分钟全真模考</strong> 与 <a href="formula-sheet.html">期末公式与陷阱总表</a>。</li>
          </ol>
        </div>
      </div>
    </section>

    <section id="radar">
      <h2>考场四象限一秒定模型雷达（输入关键词实时筛选）</h2>
      <p>读到大题先扫题干里的英文关键词，下方输入框可即时筛选对应模块与第一步起手公式：</p>
      <input type="text" id="radar-filter" class="xp-radar-filter" placeholder="过滤关键词：例如 Gini / WS / +m / Fisher / Markup / Q_B...">
      ${radarHtml}
    </section>

    <section id="bridges">
      <h2>全学期知识贯通主线：微宏观四座核心桥梁</h2>
      <p>ECON5103 看似跨度 15 个单元，底层其实只复用四套核心分析框架。考场遇到微宏交叉综合题时直接套用以下主线：</p>
      ${renderMarkdown(bridgesSec?.body || '')}
    </section>
  `;

  return wrapPageHtml({
    pageId: 'index',
    file: 'index.html',
    pageTitle: '首页总览',
    windowTitle: 'ECON5103 Business Economics - Windows XP 帮助与支持中心',
    bannerSub: '覆盖 Units 1–15 & SQ1–SQ7 · Windows XP CHM 帮助样式学生离线/在线复习网站',
    hasPractice: false,
    tocSections: [
      { id: 'welcome', label: '考情边界与使用声明' },
      { id: 'topics', label: '四堂课与公式总表入口' },
      { id: 'radar', label: '四象限一秒定模型雷达' },
      { id: 'bridges', label: '微宏观四座贯通桥梁' }
    ],
    contentHtml
  });
}

function buildFormulaSheetPage(searchIndex) {
  const cheatMd = readUtf8(path.join(SERIES_ROOT, 'Final_全课程总速查.md'));
  const secs = splitMarkdownSections(cheatMd, 2).sections;
  const formulasSec = secs.find((s) => s.title.includes('高频核心公式'));
  const trapsSec = secs.find((s) => s.title.includes('绝杀陷阱'));
  const sqSec = secs.find((s) => s.title.includes('时事话题'));

  searchIndex.push(
    {
      title: 'U1–U15 全套高频核心公式 16 组与曲线移动矩阵',
      pageLabel: '公式总表',
      href: 'formula-sheet.html#formulas',
      keywords: 'formula equation sheet matrix MRS MRT Gini WS PS k_open Fisher PC',
      snippet: '一页汇集全学期 16 组必备计算式及各曲线沿线滑行 vs 整线平移辨析表'
    },
    {
      title: '全学期（U1–U15）考场十大绝杀陷阱终极扫雷榜',
      pageLabel: '公式总表',
      href: 'formula-sheet.html#traps-table',
      keywords: 'traps mistakes sunk cost Gini PS-FC Q_B E/Pop +m Disinflation NX',
      snippet: '逐一列出考场最易失分的 10 个计算与概念坑及保命纠偏口诀'
    },
    {
      title: '课程配套时事讨论 SQ1–SQ7 答题术语挂钩表',
      pageLabel: '公式总表',
      href: 'formula-sheet.html#sq-table',
      keywords: 'SQ1 SQ2 SQ3 SQ4 SQ5 SQ6 SQ7 GDP superannuation underemployment housing debt RBA AI',
      snippet: '若大题考察澳洲政策与现实案例材料，一秒对齐教材原生理论得分术语'
    }
  );

  const curveMatrixMd = `
| 模型 / 曲线 | **沿着曲线移动（Move along）的原因** | **整条曲线平移 / 旋转（Shift）的原因** | 考场必查核对点 |
|---|---|---|---|
| **Isocost 等成本线 (U2)** | —（给定 $w, p$ 固定斜率 $-w/p$，成本变则平行移） | 相对要素价格 $w/p$ 变化 → 斜率旋转变陡或变平；总支出 $C$ 变 → 平行移 | $w/p$ 上升变陡，诱发节省 $L$ 技术切换 |
| **个人劳动供给 (U3)** | 每选不同可行边界切点对应不同 $(t, c)$ | 固定 $w$ 白得钱 → 仅平行外移（Income effect）；时薪 $w$ 涨 → 预算线以闲暇上限为轴**变陡**（SE + IE） | 净工时增减看两效应相对幅度 |
| **劳动纪律 Best Response (U6)** | 雇主提高工资 $w$ → 工人**沿 BR** 向右上方提高努力 $e$ | 失业救济 $w_r\\uparrow$、工作负效用 $d\\uparrow$ 或失业概率变化 → **整条 BR 左右平移** | BR 右移（救济涨）迫使企业付更高 $w^*$ |
| **全经济 WS/PS 模型 (U9)** | 通胀周期缺口短暂偏离均衡（$B \\leftrightarrow X$）；沿固定 WS 调失业与真实工资 | **WS 移**：失业救济、移民/托育、工会发声（Voice↓，Strike↑）；**PS 移**：劳动生产率 $\\lambda$ 变化、反垄断改 Markup、油价供给冲击 | 平 PS 下只移 WS 不改均衡真实工资 $W/P$ |
| **厂商投资函数 $I(r)$ (U14)** | **真实借款利率 $r$** 变化 → **沿着 $I(r)$** 曲线滑动改变投资量 | 预期利润率 $\\Pi$、商业信心、税负成本变化 → **整条 $I(r)$ 左右平移** | 信心崩盘 $\\Pi\\downarrow$ 左移可令降息完全失效 |
| **凯恩斯 45° 线 $AD$ (U14)** | 收入 $Y$ 变动经 $c_1(1-t)-m$ **沿 $AD$ 线**传导收敛至 $Y^*$ | 自发消费 $c_0$、投资 $I(r)$、政府支出 $G$、出口 $X$ 变动 → **整条 $AD$ 上下平移**；改 $c_1, t, m$ → **改变 $AD$ 斜率** | 分母 $1 - c_1(1-t) + m$ 越大人为乘数越小 |
| **菲利普斯曲线 PC (U15)** | **预期 $\\pi^e$ 不变下**，央行调节总需求让失业 $u$ **沿同一条 PC** 滑动 | **适应性预期 $\\pi^e$ 调整** 或 **PS 上下供给冲击（如油价翻倍）** → **整条 PC 上下平移** | 在 $u < u^*$ 硬压不止会掀起 $3\\%\\to 5\\%\\to 7\\%$ 螺旋 |
`;

  const top10ChecklistMd = `
| # | 所属单元 | 考场核心公式 | 一句话防错钉 |
|---|---|---|---|
| **1** | **U2 经济租** | $\\text{Rent} = \\text{Net(chosen)} - \\text{Net(next-best)}$ | 两头全部剔除已支付 Sunk cost |
| **2** | **U5 基尼** | $G = 0.5 \\times \\frac{\\text{两两绝对差均值}}{\\bar{y}}$ | 3 人例分母取 $n(n-1)/2 = 3$ 无序对，讲义得 $0.56$ |
| **3** | **U6 就业租** | $\\text{Rent/h} = w - w_r - d$ | 留意题目保留工资是否已扣除努力负效用 $d$ |
| **4** | **U7 垄断利润** | $MR = a - 2bQ = MC, \\quad \\text{Profit} = PS - FC$ | 线性需求 $MR$ 斜率永远是 $2b$；千万别漏减固定成本 $FC$ |
| **5** | **U8 税负与 DWL** | $DWL = \\frac{1}{2}t(Q_0 - Q_1)$，缺乏弹性方负担重 | 图像更陡峭（价格弹性更小）的一侧吃下更多净税负 |
| **6** | **U9 劳动三率** | $u=\\frac{U}{\\text{LF}}, \\quad \\text{参与}=\\frac{\\text{LF}}{\\text{Pop}_{wa}}, \\quad \\text{就业}=\\frac{E}{\\text{Pop}_{wa}}$ | $u$ 看劳动力分母，参与与就业看适龄人口；防气馁退市假象 |
| **7** | **U10 银行破产** | $\\text{Assets} = \\text{Liab} + \\text{NW}, \\quad \\text{Lev} = \\frac{\\text{Assets}}{\\text{NW}}$ | 放贷同刻造存款；坏账损失率 $> 1/\\text{Lev}$ 立刻 Insolvent |
| **8** | **U12 庇古税** | $MSC = MPC + MEC, \\quad t^* = MEC(Q_B)$ | 必代社会最优点 $Q_B$，严禁代私人点 $Q_A$；税收≠总伤害 |
| **9** | **U14 开放紧缩** | $k = \\frac{1}{1-c_1(1-t)+m}, \\quad \\Delta(T-G) = t\\Delta Y - \\Delta G$ | 进口是漏出项，分母必写 **+m**；紧缩压垮税基反噬预算 |
| **10** | **U15 费雪与 PC** | $r = i - \\pi, \\quad \\pi_t = \\pi^e + \\text{Bargaining gap}$ | 高通胀降实利率利好借方；4 传导渠道必含汇率 NX |
`;

  const contentHtml = `
    <div class="chm-breadcrumb">
      <a href="index.html">首页</a> › <span class="xp-badge must">期末全课程终极速查手册（A4 打印优化）</span>
    </div>
    <h1>ECON5103 Business Economics 期末公式、曲线矩阵与陷阱总表</h1>

    <div class="xp-callout tip">
      <div class="xp-callout-icon">🖨</div>
      <div class="xp-callout-body">
        <strong>考前一晚单页印刷版：</strong>按工具栏 <strong>「打印 / 存 PDF」</strong>（或键盘 <code>Ctrl/Cmd + P</code>）会自动剥离导航栏与窗口壳体，生成纯净可携带 A4 白底速查表；下方所有板块也均支持页面内搜索与索引直达。
      </div>
    </div>

    <section id="ten-equations">
      <h2>一、考前十分钟必核：全课程十大核武级公式总表</h2>
      ${renderMarkdown(top10ChecklistMd)}
    </section>

    <section id="formulas">
      <h2>二、U1–U15 分课核心方程详注（16 组方程与操作规则）</h2>
      ${renderMarkdown(formulasSec?.body || '')}
    </section>

    <section id="curve-matrix">
      <h2>三、微宏观核心曲线“沿线移动 vs 整线平移”总对照矩阵</h2>
      ${renderMarkdown(curveMatrixMd)}
    </section>

    <section id="traps-table">
      <h2>四、全学期（U1–U15）考场十大绝杀陷阱终极扫雷榜</h2>
      <div class="xp-callout warn">
        <div class="xp-callout-icon">⚠️</div>
        <div class="xp-callout-body">考试交卷前请最后默扫这 10 条：80% 丢分都集中在“沉没成本、<code>FC</code> 漏减、<code>Q_A</code> 误代、分母少 <code>+m</code> 与稳态混淆”。</div>
      </div>
      ${renderMarkdown(trapsSec?.body || '')}
    </section>

    <section id="sq-table">
      <h2>五、课程配套时事讨论 SQ1–SQ7 答题挂钩总表</h2>
      ${renderMarkdown(sqSec?.body || '')}
    </section>
  `;

  return wrapPageHtml({
    pageId: 'formula-sheet',
    file: 'formula-sheet.html',
    pageTitle: '期末公式与陷阱总表',
    windowTitle: 'ECON5103 Final 帮助中心 - 公式 · 曲线 · 陷阱 · SQ1–SQ7 总表',
    bannerSub: 'U1–U15 全套公式 + 曲线移动辨析矩阵 + 十大陷阱 + SQ1–SQ7 论述关键词（支持 A4 排版打印）',
    hasPractice: false,
    tocSections: [
      { id: 'ten-equations', label: '1. 十大核武级公式清单' },
      { id: 'formulas', label: '2. 分课 16 组方程全注' },
      { id: 'curve-matrix', label: '3. 曲线沿线 vs 平移矩阵' },
      { id: 'traps-table', label: '4. 十大绝杀陷阱扫雷榜' },
      { id: 'sq-table', label: '5. 时事话题 SQ1–SQ7 挂钩' }
    ],
    contentHtml
  });
}

function buildAll() {
  const searchIndex = [];

  for (const lMeta of LESSONS_META) {
    const html = buildLessonPage(lMeta, searchIndex);
    fs.writeFileSync(path.join(SITE_ROOT, lMeta.file), html, 'utf8');
  }

  const indexHtml = buildIndexPage(searchIndex);
  fs.writeFileSync(path.join(SITE_ROOT, 'index.html'), indexHtml, 'utf8');

  const formulaHtml = buildFormulaSheetPage(searchIndex);
  fs.writeFileSync(path.join(SITE_ROOT, 'formula-sheet.html'), formulaHtml, 'utf8');

  // Add A-Z index entries to global search as well if not duplicated
  for (const item of CHM_INDEX_ENTRIES) {
    if (!searchIndex.some((s) => s.title === item.term)) {
      searchIndex.push({
        title: item.term,
        pageLabel: `索引 · ${item.unit}`,
        href: item.href,
        keywords: `${item.term} ${item.unit}`,
        snippet: `快速定位至 ${item.unit} 相关章节与例题`
      });
    }
  }

  const searchJs = `window.ECON5103_SEARCH_INDEX = ${JSON.stringify(searchIndex, null, 2)};\n`;
  fs.writeFileSync(path.join(SITE_ROOT, 'assets', 'search-index.js'), searchJs, 'utf8');

  console.log(`[OK] Built 6 HTML pages + assets/search-index.js (${searchIndex.length} searchable entries) in ${SITE_ROOT}`);
}

buildAll();
