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
      '分课知识梳理、高清重绘模型图解与配套自测练习体系')
    .replace(/`?\+\s*\\Delta G`?/g, '$+\\Delta G$')
    .replace(/`?(?:2026 Week[^`\n)]*\.md|lecture\/W[^`\n)]*\.md|(?:00|01|02|06|07)_[^`\n)]*\.md)`?/g, '课程讲义')
    .replace(/\[[^\]]*补图[^\]]*\]/g, '')
    .replace(/`?\[自编数字练习\]`?/g, '')
    .replace(/`?\[自编全真模拟\]`?/g, '')
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

  src = src.replace(/([ \t]*)\$\$([\s\S]+?)\$\$/g, (_, indent, tex) => {
    const token = `KATEXDISPLAYTOKEN${mathBlocks.length}END`;
    mathBlocks.push(renderTex(tex, true));
    return `${indent}<div class="katex-block">${token}</div>`;
  });

  src = src.replace(/([ \t]*)\\\[([\s\S]+?)\\\]/g, (_, indent, tex) => {
    const token = `KATEXDISPLAYTOKEN${mathBlocks.length}END`;
    mathBlocks.push(renderTex(tex, true));
    return `${indent}<div class="katex-block">${token}</div>`;
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
    { key: 'concise', regex: /\*\*(?:简明结论|考试简洁答法|参考答法|参考踩分答法|标准答案与踩分点)\*\*[：:]?/ },
    { key: 'detail', regex: /\*\*(?:完整步骤与说明|完整步骤与易错自检|解题提示|思维深挖[^*]*)\*\*[：:]?/ }
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
    title: '第 1 课：微观基础决策与市场定价',
    units: 'Units 1–8 & Unit 11',
    subtitle: 'Economic rent · 等成本线 · MRS=MRT · Gini · 劳动纪律 · 垄断 MR=MC · 税收归宿 · 45° 价格动态',
    intro: '本课涵盖第 1 至第 8 单元的微观基础分析，以及第 11 单元的价格动态模型。前半部分探讨个人与企业在约束下如何选择、博弈效率及分配不平等衡量；后半部分分析企业定价权、完全竞争税收效应，以及价格通过 45° 线收敛或演变为泡沫的机制。',
    focusCore: 'Units 2–3（经济租、等成本线与 MRS=MRT）、Units 5 & 7（Gini 与垄断利润 Profit = PS − FC）、Units 8 & 11（税收 DWL 与 45° 价格动态）',
    focusSecondary: 'Units 1 & 4（增长背景概念、囚徒困境与纳什均衡文字辨析）',
    questionUnits: ['Unit 2', 'Units 3 & 5', 'Unit 6', 'Units 7–8 & 11', 'Units 2–8 & 11'],
    diagrams: [
      { file: 'l1_fig1_u3_mrs_mrt.png', unit: 'Unit 3', title: '无差异曲线与可行边界相切（MRS = MRT）及两效应', notes: ['横轴：每日自由时间；纵轴：每日消费/收入', '均衡切点：MRS = MRT 决定最优工时', '加薪拆解：预算线外移为收入效应（Income effect）；斜率变陡为替代效应（Substitution effect）'] },
      { file: 'l1_fig2_u5_angela_bruno.png', unit: 'Unit 5', title: '权力制度与 Angela–Bruno 帕累托效率曲线', notes: ['对比技术边际线（生存约束）与帕累托效率曲线', '强制地租下劳动剩余被单方面拿走；法治谈判下的 Pareto 改善落入谈判透镜区间', '区分结果公平（Substantive）与程序公平（Procedural）'] },
      { file: 'l1_fig3_u6_labour_discipline.png', unit: 'Unit 6', title: '不完全契约与劳动纪律：效率工资均衡 w*', notes: ['工人最优反应曲线（MRT）从保留工资起步，边际努力增量递减', '最陡 Isocost 射线（MRS）与 BR 相切点即为利润最大化工资 w*', '失业救济 w_r 上升或劳动负效用 d 上升会令 BR 右移，推高均衡工资 w*'] },
      { file: 'l1_fig4_u7_ac_mc.png', unit: 'Unit 7', title: '规模经济：平均成本 AC 与边际成本 MC 关系', notes: ['固定成本被摊薄阶段呈现递增规模收益', '只要 AC > MC，AC 持续下降；MC 从下方穿过 AC 最低点', '自然垄断情形下，单家企业覆盖全市场的平均成本低于多家拆分'] },
      { file: 'l1_fig5_u7_isoprofit_mr_mc.png', unit: 'Unit 7', title: '定价企业切点 MRS=MRT 与 MR=MC 等价性', notes: ['等利润线与向下倾斜需求曲线相切于最优点 (Q*, P*)', '线性反需求 P = a − bQ 对应 MR = a − 2bQ（斜率为需求线两倍）', 'MR > 0 必处于需求富弹性区间（ε > 1），且加成比例 Markup = 1/ε'] },
      { file: 'l1_fig6_u7_cs_ps_dwl.png', unit: 'Unit 7', title: '定价垄断福利割裂：CS / PS / Profit / DWL', notes: ['消费者剩余 CS：需求线下、售价上方的面积', '生产者剩余 PS：售价与 MC 之间面积；计算利润 Profit 时需从 PS 中扣除固定成本 FC', '无谓损失 DWL：Q* 至竞争点 P = MC 之间的帕累托效率损失三角'] },
      { file: 'l1_fig7_u8_comp_tax.png', unit: 'Unit 8', title: '完全竞争从量税、DWL 与弹性归宿规律', notes: ['长期竞争均衡满足 P = MC = AC，经济租归零', '加税 t 产生政府税收 tQ_1 与 DWL = 0.5×t×(Q_0−Q_1)', '供需双方中价格弹性更小（图像更陡峭）的一方承担更多净税负'] },
      { file: 'l1_fig8_u11_price_dynamics.png', unit: 'Unit 11', title: '45° 线价格动态：稳定收敛 vs 投机性泡沫', notes: ['横轴当期 P_t，纵轴下期 P_{t+1}；45° 线为均衡不动点线', '曲线斜率 < 1 时偏离会逐步收敛；正反馈投机导致斜率 > 1 时形成价格泡沫', '区分非投机市场的租金上限 Rent ceiling（产生超额需求与配给 Rationing）'] }
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
    subtitle: '外部性 MSC & 庇古税 · Coase 区间 · 2×2 公共品与不对称信息 · 劳动三率与 WS/PS · 跨期与银行杠杆',
    intro: '本课衔接微观市场失灵与宏观金融部门。Unit 12 讨论外部性定价、科斯定理与公共品分类；Unit 9 通过 WS/PS 框架说明全经济均衡失业与实际工资；Unit 10 解释跨期消费平滑、信贷约束，以及商业银行放贷创造广义货币与高杠杆下的清偿力风险。',
    focusCore: 'Unit 12（MSC = MPC + MEC、t* = MEC(Q_B) 与 2×2 公共品矩阵）、Unit 9（劳动力三率口径与 WS/PS 移动）、Unit 10（银行资产负债表、放贷造存款与 Leverage）',
    focusSecondary: 'Coase 定理在现实中的交易成本阻碍、保险市场逆向选择与道德风险案例',
    questionUnits: ['Unit 12', 'Unit 9', 'Unit 10', 'Units 9, 10 & 12'],
    diagrams: [
      { file: 'l2_fig1_u12_neg_ext.png', unit: 'Unit 12', title: '负外部性：MSC = MPC + MEC、庇古税与 Coase 区间', notes: ['私人决策仅看 P = MPC（产量 Q_A）；社会最优均衡看 P = MSC（产量 Q_B）', '最优庇古税需在社会最优点处取 t* = MEC(Q_B)，不要误代私人点 Q_A', 'Coase 讨价还价区间净剩余恰好等于消除的无谓损失 DWL'] },
      { file: 'l2_fig2_u12_pos_ext.png', unit: 'Unit 12', title: '正外部性、2×2 公共品分类与不对称信息框架', notes: ['按“竞争性 × 排他性”定位 Common-pool / Public good / Artificially scarce', '签约前隐藏特征 → Adverse selection（逆向选择）', '签约后隐藏行动 → Moral hazard（道德风险）'] },
      { file: 'l2_fig3_u9_ws_ps_eq.png', unit: 'Unit 9', title: '全经济劳动市场：WS/PS 均衡与需求不足失业', notes: ['水平 PS 线：W/P = 生产率 λ − 企业垄断加成利润', '纳什均衡交点 X 存在均衡结构失业，用于维持工作激励', '总需求下降导致经济沿着 PS 向左停留在 B 点（周期性失业）'] },
      { file: 'l2_fig4_u9_policies_unions.png', unit: 'Unit 9', title: '劳动市场政策与工会双重效应移动对照', notes: ['WS 下移（如救济下调或工会 Voice 效应）可降低失业，长期实际工资保持在原 PS 水平', 'PS 上移（提升生产率 λ 或增强反垄断降低加成）推动真实工资与就业率同步提升', '劳动者气馁退市同时缩小失业人数 U 与劳动力 LF，需对照就业率 E/Pop_wa 核实'] },
      { file: 'l2_fig5_u10_intertemporal.png', unit: 'Unit 10', title: '跨期消费平滑：1+ρ = 1+r 与信贷配给门槛', notes: ['可行预算斜率 MRT = 1+r；时间偏好无差异斜率 MRS = 1+ρ', '委托—代理风险带来自有资本 Equity 与抵押物 Collateral 要求', '缺乏资产的群体可能陷入信贷受限或完全被排斥'] },
      { file: 'l2_fig6_u10_bank_money_sheet.png', unit: 'Unit 10', title: '商业银行资产负债表：放贷创造存款与杠杆清偿力', notes: ['银行放贷的同时在负债端记入等额存款，直接增加广义货币（Broad money）', '区分流动性风险 Liquidity risk（现金不足）与资不抵债 Insolvent（Net worth < 0）', '若资产坏账损失比例超过 1 / Leverage，银行净值转为负值'] }
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
    subtitle: 'Okun 定律 · GDP 贡献 vs 占比 · 消费平滑与协调博弈 · CPI/Deflator · 开放有税乘数 · I(r) 与紧缩政策',
    intro: '本课聚焦短期宏观经济波动与财政政策效果。Unit 13 说明 GDP 分项贡献计算、奥肯定律（Okun’s Law）、消费平滑的现实障碍以及投资协调博弈；Unit 14 推导 45° 线 Keynesian 交叉图与开放有税乘数模型，分辨利率变化与预期变化对 I(r) 的不同影响，并讨论衰退期财政紧缩的预算结果。',
    focusCore: 'Unit 13（GDP 占比与增长贡献辨析、消费平滑限制与永久冲击）、Unit 14（45° 线 Y = AD、开放有税乘数分母加 +m、I(r) 移动及财政余额变化 Δ(T−G)）',
    focusSecondary: '投资协调博弈的文字解释与美欧中三国 GDP 支出构成比较',
    questionUnits: ['Unit 13', 'Unit 14', 'Unit 14', 'Units 9, 13 & 14'],
    diagrams: [
      { file: 'l3_fig1_u13_cycle_okun.png', unit: 'Unit 13', title: '商业周期与奥肯定律（Okun’s Law）负向联动', notes: ['增长贡献 = 分项权重 × 变化率（投资 I 权重较小但波动幅度往往最大）', '实际 GDP 增速低于潜在趋势时，失业率变化 Δu 趋于上升', '区分 CPI（含进口商品消费篮子）与 GDP Deflator（纯国内生产产出价格）'] },
      { file: 'l3_fig2_u13_smoothing_limits.png', unit: 'Unit 13', title: '消费平滑机制、永久冲击调整与三大约束', notes: ['暂时冲击可依靠储蓄或借贷平滑；永久收入下降则必须下调长期消费基准', '三大现实制约：信贷限制 / 意志薄弱 / 有限共保（Limited co-insurance）', '企业投资协调博弈存在低投资 (10,10) 与高投资 (100,100) 两个纳什均衡'] },
      { file: 'l3_fig3_u14_multiplier_45.png', unit: 'Unit 14', title: '凯恩斯 45° 线 Y = AD 与闭/开经济乘数效应', notes: ['45° 线代表产出等于支出的均衡轨迹；AD 截距包含 c0+I(r)+G+X', '初始冲击 ΔA 经逐轮再消费最终收敛于 k × ΔA', '平稳收敛要求 AD 曲线斜率小于 1'] },
      { file: 'l3_fig4_u14_investment_fn.png', unit: 'Unit 14', title: '利润去向排序 (ρ, r, Π) 与投资曲线 I(r)', notes: ['资金去向排序：ρ>r≥Π 消费；r>ρ≥Π 储蓄还债；Π>ρ≥r 进行实体投资', '实际利率 r 改变表现为沿着既有 I(r) 曲线滑动', '预期利润 Π、商业信心或税负改变表现为整条 I(r) 左右平移'] },
      { file: 'l3_fig5_u14_fiscal_open.png', unit: 'Unit 14', title: '开放有税漏出、节俭悖论与衰退期财政紧缩效果', notes: ['私人储蓄 (1−c1)、税收 t 与进口 m 三条漏出渠道共同缩小乘数，开放乘数分母纳入 +m', 'Paradox of thrift：所有家庭同时提高储蓄率会压低总需求与总产出', '衰退期削减 G 导致税收 tY 同步减少，预算净改善 Δ(T−G) = tΔY − ΔG 小于节省的支出'] },
      { file: 'l3_fig6_u14_sr_mr_wsps.png', unit: 'Unit 14 + U9', title: '短期总需求 45° 线向中期 WS/PS 劳动力市场联动', notes: ['短期 45° 产出缺口通过生产函数 Y = λN 直接减少雇佣人数', '在上方劳动市场图对应偏离 X 向左落至 B 点，表现为周期性失业', '现实评估财政刺激还需考量接近满产能时的挤出效应（Crowding out）与加税预期'] }
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
    title: '第 4 课：通胀、货币政策与综合模拟',
    units: 'Unit 15 + Mock Q1–Q4',
    subtitle: '通胀 vs 通缩 · Fisher 方程 · 议价缺口与 3→5→7% 螺旋 · 供给滞胀 · 货币四渠道与 ZLB · 综合模拟 Q1–Q4',
    intro: '本课整合全学期核心模型并配齐综合演练。Unit 15 辨析通胀与通缩的不同风险，用 WS/PS 议价缺口推导出菲利普斯曲线（PC）与适应性预期螺旋，解释能源供给冲击引发的滞胀以及货币传导 4 条渠道与 ZLB 应对；随后通过 Mock Q1–Q4 进行跨单元串联练习。',
    focusCore: 'Unit 15（Fisher 方程与通胀再分配、Disinflation vs Deflation、PC 螺旋、供给冲击滞胀、货币四渠道与 ZLB）与 Mock Q1–Q4 综合演算',
    focusSecondary: '货币联盟（如欧元区）缺乏独立政策利率与汇率弹性时的调节限制',
    questionUnits: ['Unit 15', 'Units 7 & 12', 'Units 9 & 10', 'Units 13 & 14', 'Unit 15'],
    diagrams: [
      { file: 'l4_fig1_u15_inflation_deflation.png', unit: 'Unit 15', title: '通胀（Inflation）、反通胀（Disinflation）与通缩（Deflation）对比', notes: ['Disinflation 表示通胀率回落但仍为正值（物价增速放缓），Deflation 表示物价总水平绝对下跌', 'Deflation（π<0）会诱导居民推迟耐用品购买并加重固定名义债务的实际负担', 'Fisher 方程 r = i − π：未预期到的高通胀通常有利固定利率借款人、不利债权人'] },
      { file: 'l4_fig2_u15_bargaining_gap_pc.png', unit: 'Unit 15', title: '从 WS/PS 议价缺口直接推导菲利普斯曲线 PC', notes: ['上图中 WS > PS 的正向 Bargaining gap 对应下图中通胀率上升', '央行把 Phillips Curve 视作可行边界 MRT，与社会无差异曲线相切于 MRS = MRT', '仅当失业率处于唯一均衡值 u*（缺口=0）时，通胀才会保持在 π = π^e 不再加速'] },
      { file: 'l4_fig3_u15_pc_spiral_shift.png', unit: 'Unit 15', title: '适应性预期推动 3% → 5% → 7% 工资价格螺旋', notes: ['若持续将失业率压低在 u* 以下，每年的正向议价缺口都会累加进下一年预期通胀 π^e', '整条 Phillips curve 逐年向上平移：3% → 5% → 7%', '只有当总需求降温使失业回到 u* 时，通胀才会停止继续加速（稳定在既有预期水平）'] },
      { file: 'l4_fig4_u15_supply_shock.png', unit: 'Unit 15', title: '1970s 石油供给冲击：PS 下移与 Stagflation 两难', notes: ['进口能源大涨压缩企业可分配产值，使 PS 线向下移动并抬高新均衡失业率 u*', '经济体一时停留在原就业水平时会出现正议价缺口，令 PC 上移并形成高通胀与高失业并存', '常规需求管理工具此时面临两难取舍，须依靠独立央行 CBI 稳定长期预期'] },
      { file: 'l4_fig5_u15_mp_multiplier.png', unit: 'Unit 15', title: '央行政策利率驱动总需求的四条传导渠道', notes: ['① 市场贷款利率 I(r)；② 资产与房价财富效应 c0', '③ 企业盈利预期与信心；④ 本外利差推动汇率波动改变净出口 NX', '触及零利率下限 ZLB（i≈0）后需动用 QE 购入长期债券并配合财政扩张'] },
      { file: 'l4_fig6_u15_macro_quadrant.png', unit: 'U1–U15 总结', title: '全学期宏观经济状态四象限分类与政策对照', notes: ['第一象限（低失业 + 高通胀）→ 上调利率收敛总需求 AD，平抑通胀', '第四象限（高失业 + 通缩压力）→ 降息配合财政刺激；若遇 ZLB 则启用 QE', '第二象限（高失业 + 高通胀滞胀）→ 通过 CBI 稳定预期并辅以供给侧改善 PS'] }
    ],
    practiceIds: ['l4-p1', 'l4-mock-q1', 'l4-mock-q2', 'l4-mock-q3', 'l4-mock-q4'],
    practiceSeconds: [300, 360, 360, 360, 420]
  }
];

const CHM_INDEX_ENTRIES = [
  { term: '45° Line Multiplier (45° 线与乘数)', unit: 'U14', href: 'lesson-3.html#diagrams' },
  { term: '45° Price Dynamics / Bubble (泡沫判别)', unit: 'U11', href: 'lesson-1.html#diagrams' },
  { term: 'AC vs MC Cost Rules (成本均线规律)', unit: 'U7', href: 'lesson-1.html#diagrams' },
  { term: 'Adaptive Expectations (适应性预期螺旋)', unit: 'U15', href: 'lesson-4.html#diagrams' },
  { term: 'Adverse Selection (逆向选择)', unit: 'U12', href: 'lesson-2.html#diagrams' },
  { term: 'Angela–Bruno Pareto Curve', unit: 'U5', href: 'lesson-1.html#diagrams' },
  { term: 'Austerity Feedback Δ(T−G) (紧缩与预算)', unit: 'U14', href: 'lesson-3.html#practice' },
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
  { term: 'Consumption Smoothing Limits (平滑限制)', unit: 'U13', href: 'lesson-3.html#diagrams' },
  { term: 'CPI vs GDP Deflator (价格指数对照)', unit: 'U13', href: 'lesson-3.html#routes' },
  { term: 'Crowding Out & Expectations (乘数制约)', unit: 'U14', href: 'lesson-3.html#practice' },
  { term: 'Currency Union / Eurozone (货币联盟局限)', unit: 'U15', href: 'lesson-4.html#routes' },
  { term: 'Cyclical Unemployment (周期性失业)', unit: 'U9+U14', href: 'lesson-3.html#diagrams' },
  { term: 'Debt-to-GDP Three Paths (降债三路径)', unit: 'U14', href: 'lesson-3.html#routes' },
  { term: 'Disinflation vs Deflation (反通胀 vs 通缩)', unit: 'U15', href: 'lesson-4.html#routes' },
  { term: 'Discouraged Workers (气馁退出看 E/Pop)', unit: 'U9', href: 'lesson-2.html#practice' },
  { term: 'Economic Rent & Sunk Cost (经济租与沉没成本)', unit: 'U2', href: 'lesson-1.html#practice' },
  { term: 'Employment Rate vs Unemployment Rate', unit: 'U9', href: 'lesson-2.html#routes' },
  { term: 'Employment Rent Formula (就业租)', unit: 'U6', href: 'lesson-1.html#routes' },
  { term: 'Exchange Rate NX Channel (汇率净出口渠道)', unit: 'U15', href: 'lesson-4.html#diagrams' },
  { term: 'Fisher Equation r = i − π (费雪方程)', unit: 'U15', href: 'lesson-4.html#practice' },
  { term: 'Gini Coefficient 3-Person Formula (讲义口径)', unit: 'U5', href: 'lesson-1.html#examples' },
  { term: 'Growth Contribution = Weight × Rate', unit: 'U13', href: 'lesson-3.html#examples' },
  { term: 'Income vs Substitution Effect (两效应拆解)', unit: 'U3', href: 'lesson-1.html#diagrams' },
  { term: 'Investment Function I(r) 沿线 vs 平移', unit: 'U14', href: 'lesson-3.html#diagrams' },
  { term: 'Isocost Slope −w/p (等成本切换)', unit: 'U2', href: 'lesson-1.html#practice' },
  { term: 'Leverage & Insolvency (银行杠杆与清偿力)', unit: 'U10', href: 'lesson-2.html#practice' },
  { term: 'Markup = (P−MC)/P = 1/ε (加成反比)', unit: 'U7', href: 'lesson-1.html#routes' },
  { term: 'Mock Q1–Q4 (综合模拟练习)', unit: 'Mock', href: 'lesson-4.html#mock-exam' },
  { term: 'Moral Hazard (道德风险)', unit: 'U12', href: 'lesson-2.html#routes' },
  { term: 'MR = a − 2bQ = MC & Profit = PS − FC', unit: 'U7', href: 'lesson-1.html#practice' },
  { term: 'Nash Equilibrium vs Pareto Efficiency', unit: 'U4', href: 'lesson-1.html#practice' },
  { term: 'Okun’s Law (奥肯定律)', unit: 'U13', href: 'lesson-3.html#diagrams' },
  { term: 'Open Multiplier k = 1/[1−c1(1−t)+m]', unit: 'U14', href: 'lesson-3.html#routes' },
  { term: 'Paradox of Thrift (节俭悖论)', unit: 'U14', href: 'lesson-3.html#routes' },
  { term: 'Phillips Curve 3%→5%→7% Spiral', unit: 'U15', href: 'lesson-4.html#examples' },
  { term: 'Pigouvian Tax at Q_B: t* = MEC(Q_B)', unit: 'U12', href: 'lesson-2.html#routes' },
  { term: 'Rent Ceiling & Rationing (限价配给)', unit: 'U11', href: 'lesson-1.html#routes' },
  { term: 'SQ1–SQ7 Policy Connections (时事议题对照)', unit: 'SQ1–7', href: 'formula-sheet.html#sq-table' },
  { term: 'Stagflation / 1970s Supply Shock (滞胀)', unit: 'U15', href: 'lesson-4.html#diagrams' },
  { term: 'Tax Incidence & Elasticity (税负归宿)', unit: 'U8', href: 'lesson-1.html#practice' },
  { term: 'Common Exam Pitfalls (常见易错点整理)', unit: 'All', href: 'formula-sheet.html#traps-table' },
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
        <button role="tab" aria-selected="false" aria-controls="tab-calc">验算(T)</button>
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
            <span>📂 课程页面</span>
            <span class="xp-task-chevron">︽</span>
          </button>
          <div class="xp-task-body">
            <div class="xp-tree-wrap">
              <ul class="tree-view">
                <li><a href="index.html"${currentFile === 'index.html' ? ' class="active"' : ''}>🏠 首页</a></li>
                ${pageTree}
                <li><a href="formula-sheet.html"${currentFile === 'formula-sheet.html' ? ' class="active"' : ''}>Σ 公式与易错点总表</a></li>
              </ul>
            </div>
          </div>
        </div>
        <div class="xp-task-box collapsed">
          <button type="button" class="xp-task-header" aria-expanded="false">
            <span>⚡ 常用跳转</span>
            <span class="xp-task-chevron">︾</span>
          </button>
          <div class="xp-task-body">
            <ul class="xp-task-list">
              <li><a href="lesson-4.html#mock-exam">⏱ 进入 25 分钟综合模拟 Q1–Q4</a></li>
              <li><a href="formula-sheet.html#traps-table">⚠ 常见易错点整理</a></li>
              <li><a href="formula-sheet.html#sq-table">📰 时事议题 SQ1–SQ7 对照</a></li>
              <li><button type="button" class="xp-link-btn" data-open-calc>🧮 打开侧栏验算工具</button></li>
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
          <h4>🧮 1. 三人 Gini 系数验算 (U5)</h4>
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
          <h4>📈 2. 开放经济乘数与财政余额 (U14)</h4>
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
          <h4>🏦 3. 银行杠杆与清偿力验算 (U10)</h4>
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
    { href: 'index.html', label: '🏠 首页' },
    ...LESSONS_META.map((l) => ({ href: l.file, label: `📖 第 ${l.num} 课` })),
    { href: 'formula-sheet.html', label: 'Σ 公式总表' }
  ].map((tab) => {
    const active = tab.href === file;
    return `<a class="xp-lesson-tab${active ? ' current' : ''}" href="${tab.href}"${active ? ' aria-current="page"' : ''}>${escapeHtml(tab.label)}</a>`;
  }).join('');

  return `<!doctype html>
<html lang="zh-CN" data-xp-theme="luna" data-font-mode="clear">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(pageTitle)} - ECON5103 期末复习参考</title>
  <meta name="description" content="ECON5103 Business Economics 期末复习参考站：涵盖 Units 1–15 核心公式、模型图解、练习题与综合模拟。">
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
            <h1>ECON5103 Business Economics</h1>
            <p>期末复习参考</p>
          </div>
        </div>
        <div class="xp-banner-search">
          <label for="xp-search-input">搜索(S):</label>
          <input id="xp-search-input" class="xp-search-input" type="text" placeholder="搜索公式或概念：Gini、+m、WS/PS、SQ6...">
          <button id="xp-search-go" type="button" class="xp-go-btn">转到</button>
          <div id="xp-search-results" class="xp-search-results" aria-live="polite"></div>
        </div>
      </header>

      <div class="xp-toolbar" role="toolbar" aria-label="文档工具栏">
        <div class="xp-toolbar-group">
          <button type="button" class="xp-tool-btn xp-mobile-drawer-btn" data-mobile-drawer aria-pressed="false">📑 目录 / 索引 / 验算</button>
          <button type="button" class="xp-tool-btn" data-toggle-sidebar aria-pressed="true">◧ 切换侧边栏</button>
          <a class="xp-tool-btn" href="index.html" style="text-decoration:none;color:inherit;">🏠 首页</a>
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
        <p class="status-bar-field">就绪</p>
        <p class="status-bar-field" id="status-progress-text">已完成 0 / 18 题</p>
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
    <button type="button" id="clippy-avatar-btn" class="clippy-avatar-btn" title="打开或收起复习提示助手">
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
      title: d.title,
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
          <span class="xp-badge">${escapeHtml(d.unit)}</span>
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
    <h2>模型图解</h2>
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
  const badgeClass = isMock ? 'xp-badge mock' : 'xp-badge';

  return `
  <section class="q-card" id="${escapeHtml(anchorId)}">
    <header class="q-card-header">
      <div class="q-card-title-row">
        <span class="${badgeClass}">${escapeHtml(badgeText)}</span>
        <h3>${renderHeadingText(title)}</h3>
      </div>
      <div class="q-card-controls">
        <div class="q-timer" data-seconds="${timeSeconds}" title="独立计时器">
          <span>⏱</span>
          <span class="q-timer-clock">${String(mins).padStart(2, '0')}:00</span>
          <button type="button" class="q-timer-btn" data-timer-toggle>▶ 计时</button>
          <button type="button" class="q-timer-btn" data-timer-reset>↺</button>
        </div>
        <div class="q-mastered-wrap">
          <input type="checkbox" id="chk-${escapeHtml(masterId)}" data-master-id="${escapeHtml(masterId)}">
          <label for="chk-${escapeHtml(masterId)}">已掌握</label>
        </div>
      </div>
    </header>
    <div class="q-card-body">
      ${renderMarkdown(questionMd)}
    </div>
    <details class="xp-answer" id="ans-${escapeHtml(masterId)}">
      <summary><span class="xp-answer-label">查看参考答案</span><span>⌄</span></summary>
      <div class="xp-answer-body">
        ${parts.conciseMd ? `<div class="score-ready-box"><h4>简明结论</h4>${renderMarkdown(parts.conciseMd)}</div>` : ''}
        ${parts.detailMd ? `<div class="step-detail-box"><h4>推导步骤与说明</h4>${renderMarkdown(parts.detailMd)}</div>` : ''}
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

  const glossarySec = outlineSec.sections.find((s) => s.title.includes('中英术语'));

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
    ? `<section id="examples"><h2>讲义算例核对</h2><div class="xp-lecture-example">${renderMarkdown(lectureExSec.body)}</div></section>`
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
        badgeText: lessonMeta.questionUnits[i] || lessonMeta.units,
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
      badgeText: lessonMeta.questionUnits[0] || 'Unit 15',
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
          <strong style="font-size:15px;color:#8c3c00;">⏱ 综合模拟练习：Mock Q1–Q4（建议 25 分钟）</strong>
          <div style="font-size:12.5px;color:#5a4620;">覆盖 U7+U12 垄断与外部性 · U9+U10 劳动与银行 · U13+U14 开放经济与财政 · U15 货币滞胀，建议先独立完成再展开核对步骤。</div>
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
        pageLabel: '第 4 课 · 综合模拟',
        href: `lesson-4.html#${anchorId}`,
        keywords: `mock exam ${cleanTitle} Q${idx + 1}`,
        snippet: pm.body.replace(/[#*$`>]/g, ' ').replace(/\s+/g, ' ').trim()
      });
      qCardsHtmlList.push(renderQuestionCard({
        masterId,
        title: cleanTitle,
        badgeText: lessonMeta.questionUnits[idx + 1] || 'Mock',
        timeSeconds: lessonMeta.practiceSeconds[idx + 1] || 360,
        questionMd: pm.body,
        answerMd: aMocks[idx].body,
        anchorId,
        isMock: true
      }));
    });
  }

  const tocSections = [
    { id: 'overview', label: '1. 课程内容概述' },
    { id: 'routes', label: '2. 核心公式与解题步骤', children: routeItems.map((rt, i) => ({ id: `route-${lessonMeta.num}-${i + 1}`, label: plainTitleText(rt.heading) })) },
    { id: 'diagrams', label: '3. 模型图解' },
    ...(lectureExSec ? [{ id: 'examples', label: '4. 讲义算例核对' }] : []),
    { id: 'practice', label: `${lectureExSec ? 5 : 4}. 练习题与参考答案`, children: qTocChildren },
    { id: 'pitfalls', label: `${lectureExSec ? 6 : 5}. 常见易错点与术语` }
  ];

  const pitfallsTitle = pitfallsSec ? pitfallsSec.title.replace(/^二、\s*/, '') : '常见易错点整理';
  const glossaryHtml = glossarySec ? `<h3>核心中英术语对照</h3>${renderMarkdown(glossarySec.body)}` : '';

  const contentHtml = `
    <div class="chm-breadcrumb">
      <a href="index.html">首页</a> › <span>第 ${lessonMeta.num} 课</span>
    </div>
    <h1 id="overview">${escapeHtml(lessonMeta.title)}</h1>
    <p>${escapeHtml(lessonMeta.intro)}</p>
    <table>
      <thead><tr><th>复习层次</th><th>涉及单元与内容</th></tr></thead>
      <tbody>
        <tr><td><strong>核心重点</strong></td><td>${escapeHtml(lessonMeta.focusCore)}</td></tr>
        <tr><td><strong>背景与次要概念</strong></td><td>${escapeHtml(lessonMeta.focusSecondary)}</td></tr>
      </tbody>
    </table>

    <section id="routes">
      <h2>核心公式与解题步骤</h2>
      ${routeCardsHtml}
    </section>

    ${renderDiagramSection(lessonMeta, searchIndex)}

    ${lectureExampleHtml}

    <section id="practice">
      <h2>练习题与参考答案 <span class="xp-badge" data-lesson-progress="${escapeHtml(lessonMeta.id)}">已完成 0 / ${lessonMeta.practiceIds.length}</span></h2>
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
    windowTitle: `ECON5103 期末复习参考 - 第 ${lessonMeta.num} 课 (${lessonMeta.units})`,
    bannerSub: '',
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

  const cheatSecs = splitMarkdownSections(cheatMd, 2).sections;
  const radarSec = cheatSecs.find((s) => s.title.includes('题干关键词'));

  let radarHtml = renderMarkdown(radarSec?.body || '');
  radarHtml = radarHtml.replace('<table>', '<table id="radar-table">');

  const topicCardsHtml = LESSONS_META.map((l) => `
    <a class="xp-topic-card" href="${l.file}">
      <div class="xp-topic-top">
        <span class="xp-topic-title">第 ${l.num} 课：${escapeHtml(l.title.replace(/^第 \d 课：/, ''))}</span>
        <span class="xp-badge" data-lesson-progress="${escapeHtml(l.id)}">已完成 0 / ${l.practiceIds.length}</span>
      </div>
      <div class="xp-topic-desc">${escapeHtml(l.units)} · ${escapeHtml(l.subtitle)}</div>
    </a>
  `).join('');

  searchIndex.push({
    title: '题干关键词与模型对照表 (U1–U15 关键词直达)',
    pageLabel: '首页',
    href: 'index.html#radar',
    keywords: 'radar quadrant keywords formula diagnostic 题干关键词 对照表',
    snippet: '按题干中的英文概念与关键词对应到微观基础、市场失灵、财政乘数与货币通胀模型'
  });

  const contentHtml = `
    <h1 id="welcome">ECON5103 Business Economics 期末复习参考</h1>

    <div class="xp-callout warn">
      <div class="xp-callout-icon">ℹ️</div>
      <div class="xp-callout-body">
        <strong>课程与资料说明：</strong>
        <ul style="margin:4px 0 0 18px;">
          <li>依据课程行政通知，<strong>Final Exam 占总评 50%</strong>，考查范围覆盖 <strong>Weeks 1–10 全部内容</strong>，整体<strong>相对偏重宏观部分</strong>。</li>
          <li>课程资料包中不包含官方往年真题或评分细则（Rubric），本页不推测具体原题题型或分值分布。</li>
          <li>网站中的模型示意图为配合理解重绘，课后练习与第 4 课 Mock Q1–Q4 均为遵循讲义模型自编数值的练习题。</li>
        </ul>
      </div>
    </div>

    <section class="xp-home-grid" id="topics">
      <div>
        <h2 style="margin-top:0;">课程章节入口</h2>
        <div class="xp-topic-grid">
          ${topicCardsHtml}
          <a class="xp-topic-card" href="formula-sheet.html" style="border-color:#2b7a2b;background:#f4fbf4;">
            <div class="xp-topic-top">
              <span class="xp-topic-title" style="color:#1c5f22;">Σ 期末公式与易错点总表</span>
            </div>
            <div class="xp-topic-desc">汇集全学期 16 组核心方程、核心曲线“沿线移动 vs 整线平移”对照表、常见易错点与时事议题 SQ1–SQ7 对照，支持页面直接打印。</div>
          </a>
        </div>
      </div>

      <div class="xp-task-panel-card">
        <h3>复习顺序建议</h3>
        <ul class="xp-task-list" style="margin-bottom:12px;">
          <li><a href="index.html#radar">1. 题干关键词与模型对照表</a></li>
          <li><a href="lesson-1.html#practice">2. 第 1 课：微观决策、垄断与税收</a></li>
          <li><a href="lesson-2.html#practice">3. 第 2 课：庇古税 Q_B、WS/PS 与银行破产</a></li>
          <li><a href="lesson-3.html#practice">4. 第 3 课：开放经济乘数与财政紧缩</a></li>
          <li><a href="lesson-4.html#mock-exam">5. 第 4 课：综合模拟练习 Mock Q1–Q4</a></li>
          <li><a href="formula-sheet.html#traps-table">6. 常见易错点整理</a></li>
          <li><button type="button" class="xp-link-btn" data-open-calc>7. 打开侧栏数值验算工具</button></li>
        </ul>
        <div style="border-top:1px solid #b8c8e8;padding-top:8px;font-size:12.5px;">
          <p style="margin:0 0 5px;"><strong>建议复习节奏：</strong></p>
          <ol style="margin:0 0 0 18px;">
            <li>先按课次阅读核心公式与解题步骤，结合模型图解理顺变量因果与曲线移动。</li>
            <li>合上参考答案并利用题卡计时器独立练习，完成后对照步骤查漏补缺。</li>
            <li>最后通过第 4 课 Mock Q1–Q4 串联微宏观知识点，并用<a href="formula-sheet.html">公式与易错点总表</a>查漏。</li>
          </ol>
        </div>
      </div>
    </section>

    <section id="radar">
      <h2>题干关键词与模型对照表</h2>
      <p>读题时先关注英文核心术语与数量关系，可在下方输入关键词快速筛选对应单元与切入步骤：</p>
      <input type="text" id="radar-filter" class="xp-radar-filter" placeholder="输入关键词筛选：例如 Gini / WS / +m / Fisher / Markup / Q_B...">
      ${radarHtml}
    </section>

    <section id="bridges">
      <h2>微宏观四条贯通主线</h2>
      <p>课程虽涵盖 15 个单元，底层分析逻辑主要围绕以下四条主线展开：</p>
      ${renderMarkdown(bridgesSec?.body || '')}
    </section>
  `;

  return wrapPageHtml({
    pageId: 'index',
    file: 'index.html',
    pageTitle: '首页',
    windowTitle: 'ECON5103 Business Economics - 期末复习参考',
    bannerSub: '',
    hasPractice: false,
    tocSections: [
      { id: 'welcome', label: '课程与资料说明' },
      { id: 'topics', label: '四堂课与公式总表入口' },
      { id: 'radar', label: '题干关键词与模型对照表' },
      { id: 'bridges', label: '微宏观四条贯通主线' }
    ],
    contentHtml
  });
}

function buildFormulaSheetPage(searchIndex) {
  const cheatMd = readUtf8(path.join(SERIES_ROOT, 'Final_全课程总速查.md'));
  const secs = splitMarkdownSections(cheatMd, 2).sections;
  const formulasSec = secs.find((s) => s.title.includes('核心公式'));
  const trapsSec = secs.find((s) => s.title.includes('常见易错点'));
  const sqSec = secs.find((s) => s.title.includes('时事议题'));

  searchIndex.push(
    {
      title: 'U1–U15 核心方程与曲线移动矩阵',
      pageLabel: '公式总表',
      href: 'formula-sheet.html#formulas',
      keywords: 'formula equation sheet matrix MRS MRT Gini WS PS k_open Fisher PC',
      snippet: '汇总全学期 16 组核心方程与主要曲线沿线移动及整线平移条件'
    },
    {
      title: '全学期常见易错点整理',
      pageLabel: '公式总表',
      href: 'formula-sheet.html#traps-table',
      keywords: 'pitfalls mistakes sunk cost Gini PS-FC Q_B E/Pop +m Disinflation NX',
      snippet: '梳理全学期最易混淆的 10 个计算口径与概念分辨细节'
    },
    {
      title: '课程时事议题（SQ1–SQ7）与教材模型对照',
      pageLabel: '公式总表',
      href: 'formula-sheet.html#sq-table',
      keywords: 'SQ1 SQ2 SQ3 SQ4 SQ5 SQ6 SQ7 GDP superannuation underemployment housing debt RBA AI',
      snippet: '梳理澳洲与全球现实讨论材料（SQ1–SQ7）对应的教材核心模型'
    }
  );

  const curveMatrixMd = `
| 模型 / 曲线 | **沿着曲线移动（Move along）的原因** | **整条曲线平移 / 旋转（Shift）的原因** | 关键判别点 |
|---|---|---|---|
| **Isocost 等成本线 (U2)** | —（给定 $w, p$ 固定斜率 $-w/p$，成本变则平行移） | 相对要素价格 $w/p$ 变化 → 斜率旋转变陡或变平；总支出 $C$ 变 → 平行移 | $w/p$ 上升使等成本线变陡，诱发节省 $L$ 的技术切换 |
| **个人劳动供给 (U3)** | 在不同约束下挑选的最优切点对应不同 $(t, c)$ | 非劳动收入增加 → 预算线平行外移（Income effect）；时薪 $w$ 涨 → 预算线以闲暇上限为轴变陡（SE + IE） | 净工时增减取决于替代效应与收入效应相对大小 |
| **劳动纪律 Best Response (U6)** | 雇主提高工资 $w$ → 工人沿 BR 向右上方提高努力 $e$ | 失业救济 $w_r\\uparrow$、负效用 $d\\uparrow$ 或失业风险变化 → 整条 BR 左右平移 | BR 右移（如救济上涨）迫使企业支付更高 $w^*$ |
| **全经济 WS/PS 模型 (U9)** | 周期性需求冲击使经济短暂偏离均衡（$B \\leftrightarrow X$） | **WS 移**：失业救济、托育/移民、工会发声（Voice↓，Strike↑）；**PS 移**：生产率 $\\lambda$ 变化、反垄断降加成、能源冲击 | 水平 PS 下只移 WS 不改变长期均衡实际工资 $W/P$ |
| **厂商投资函数 $I(r)$ (U14)** | 真实利率 $r$ 变化 → 沿着既有 $I(r)$ 曲线滑动改变投资量 | 预期利润率 $\\Pi$、商业信心或税收变化 → 整条 $I(r)$ 左右平移 | 预期转弱 $\\Pi\\downarrow$ 令 $I(r)$ 左移时，降息刺激可能收效甚微 |
| **凯恩斯 45° 线 $AD$ (U14)** | 收入 $Y$ 变动经 $c_1(1-t)-m$ 沿 $AD$ 线循环收敛至 $Y^*$ | 自发消费 $c_0$、投资 $I(r)$、政府支出 $G$、出口 $X$ 变动 → 整条 $AD$ 上下平移；改 $c_1, t, m$ → 改变 $AD$ 斜率 | 分母 $1 - c_1(1-t) + m$ 越大，乘数越小 |
| **菲利普斯曲线 PC (U15)** | 预期 $\\pi^e$ 不变下，政策调节总需求让失业 $u$ 沿同一条 PC 滑动 | 适应性预期 $\\pi^e$ 调整或 $PS$ 供给冲击（如油价上涨）→ 整条 PC 上下平移 | 持续停留在 $u < u^*$ 会引发 $3\\%\\to 5\\%\\to 7\\%$ 工资—物价螺旋上升 |
`;

  const top10ChecklistMd = `
| # | 所属单元 | 核心公式 | 一句说明 |
|---|---|---|---|
| **1** | **U2 经济租** | $\\text{Rent} = \\text{Net(chosen)} - \\text{Net(next-best)}$ | 两端计算净收益时均应剔除已发生的沉没成本（Sunk cost） |
| **2** | **U5 基尼** | $G = 0.5 \\times \\frac{\\text{两两绝对差均值}}{\\bar{y}}$ | 3 人例分母取 $n(n-1)/2 = 3$ 组无序对，讲义算得 $0.56$ |
| **3** | **U6 就业租** | $\\text{Rent/h} = w - w_r - d$ | 注意核对题目中的保留工资是否已预先扣除了负效用 $d$ |
| **4** | **U7 垄断利润** | $MR = a - 2bQ = MC, \\quad \\text{Profit} = PS - FC$ | 线性反需求对应的 $MR$ 斜率为 $2b$；求利润时须从 $PS$ 扣除固定成本 $FC$ |
| **5** | **U8 税负与 DWL** | $DWL = \\frac{1}{2}t(Q_0 - Q_1)$，弹性小一方承担多 | 供需双方中曲线更陡峭（价格弹性更小）的一侧承担更大比例净税负 |
| **6** | **U9 劳动三率** | $u=\\frac{U}{\\text{LF}}, \\quad \\text{参与}=\\frac{\\text{LF}}{\\text{Pop}_{wa}}, \\quad \\text{就业}=\\frac{E}{\\text{Pop}_{wa}}$ | 失业率分母为劳动力 $\\text{LF}$；参与率与就业率分母均为适龄劳动人口 |
| **7** | **U10 银行净值** | $\\text{Assets} = \\text{Liab} + \\text{NW}, \\quad \\text{Lev} = \\frac{\\text{Assets}}{\\text{NW}}$ | 放贷同步记入存款增加广义货币；坏账率 $> 1/\\text{Lev}$ 时所有者净值转负（Insolvent） |
| **8** | **U12 庇古税** | $MSC = MPC + MEC, \\quad t^* = MEC(Q_B)$ | 最优税率须按社会最优产量 $Q_B$ 计算，不能直接代入私人均衡点 $Q_A$ |
| **9** | **U14 开放财政** | $k = \\frac{1}{1-c_1(1-t)+m}, \\quad \\Delta(T-G) = t\\Delta Y - \\Delta G$ | 进口是漏出项，分母纳入 **+m**；衰退期削减 $G$ 会同步压低税收 $tY$ |
| **10** | **U15 费雪与 PC** | $r = i - \\pi, \\quad \\pi_t = \\pi^e + \\text{Bargaining gap}$ | 未预期高通胀下实际利率下降；货币传导到 $AD$ 包含汇率与净出口 $NX$ 渠道 |
`;

  const contentHtml = `
    <div class="chm-breadcrumb">
      <a href="index.html">首页</a> › <span>公式与易错点总表</span>
    </div>
    <h1>ECON5103 Business Economics 期末公式、曲线矩阵与易错点总表</h1>

    <section id="ten-equations">
      <h2>一、高频基础公式十条汇总</h2>
      ${renderMarkdown(top10ChecklistMd)}
    </section>

    <section id="formulas">
      <h2>二、U1–U15 分课核心方程汇总</h2>
      ${renderMarkdown(formulasSec?.body || '')}
    </section>

    <section id="curve-matrix">
      <h2>三、核心曲线“沿线移动 vs 整线平移”对照表</h2>
      ${renderMarkdown(curveMatrixMd)}
    </section>

    <section id="traps-table">
      <h2>四、全学期常见易错点整理</h2>
      ${renderMarkdown(trapsSec?.body || '')}
    </section>

    <section id="sq-table">
      <h2>五、课程时事议题（SQ1–SQ7）与教材模型对照</h2>
      ${renderMarkdown(sqSec?.body || '')}
    </section>
  `;

  return wrapPageHtml({
    pageId: 'formula-sheet',
    file: 'formula-sheet.html',
    pageTitle: '公式与易错点总表',
    windowTitle: 'ECON5103 期末复习参考 - 公式与易错点总表',
    bannerSub: '',
    hasPractice: false,
    tocSections: [
      { id: 'ten-equations', label: '1. 高频基础公式汇总' },
      { id: 'formulas', label: '2. 分课核心方程详注' },
      { id: 'curve-matrix', label: '3. 曲线沿线 vs 平移对照' },
      { id: 'traps-table', label: '4. 常见易错点整理' },
      { id: 'sq-table', label: '5. 时事议题 SQ1–SQ7 对照' }
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
