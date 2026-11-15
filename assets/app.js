(function () {
  const THEME_KEY = 'econ5103_xp_theme';
  const FONT_KEY = 'econ5103_font_mode';
  const MASTERED_KEY = 'econ5103_mastered_v1';
  const TOTAL_EXERCISES = 18;

  const LESSON_QUESTION_IDS = {
    'lesson-1': ['l1-p1', 'l1-p2', 'l1-p3', 'l1-p4', 'l1-comp'],
    'lesson-2': ['l2-p1', 'l2-p2', 'l2-p3', 'l2-comp'],
    'lesson-3': ['l3-p1', 'l3-p2', 'l3-p3', 'l3-comp'],
    'lesson-4': ['l4-p1', 'l4-mock-q1', 'l4-mock-q2', 'l4-mock-q3', 'l4-mock-q4']
  };

  const CLIPPY_TIPS = {
    'index': [
      '左侧“目录 / 索引 / 验算”三个标签可以切换章节目录、英文术语索引与数值验算器。',
      '“验算”标签内置三人 Gini 系数、开放经济乘数与银行杠杆计算，做题时可用来复核结果。',
      '右上角下拉框支持切换 Windows XP 经典蓝、橄榄绿与银色主题，也支持点阵宋体或大字号阅读。'
    ],
    'lesson-1': [
      '计算经济租（Economic Rent）时，已支付且不可退回的沉没成本在比较的两个选项中都应忽略。',
      '线性反需求 P = a - bQ 对应的边际收益斜率是 2b（MR = a - 2bQ）；求垄断利润时需从生产者剩余中减去固定成本 FC。',
      '从量税归宿规律：供需双方中价格弹性更小（曲线更陡峭）的一侧承担更大比例净税负。'
    ],
    'lesson-2': [
      '最优庇古税税率需按社会最优产量 Q_B 处的边际外部成本 MEC(Q_B) 设定，不要代入私人均衡点 Q_A。',
      '判断劳动力市场变化时，若存在气馁退出（劳动力 LF 缩小），单看失业率 u 可能带来偏差，应对照就业率 E / Pop_wa。',
      '商业银行发放贷款时在负债端同步记入存款，直接增加广义货币；当坏账损失比例超过 1 / Leverage 时净值转为负值。'
    ],
    'lesson-3': [
      '开放有税乘数 k = 1 / [1 - c1(1 - t) + m] 中，进口 m 属于漏出项，分母末端需要加上 +m。',
      '投资曲线 I(r) 的变动需区分原因：实际利率 r 变化表现为沿着既有曲线滑动，预期利润 Π 或商业信心改变才导致整条曲线左右平移。',
      '衰退期削减政府购买 G 会使产出与税收 tY 同步减少，因此预算净变化 Δ(T - G) = tΔY - ΔG 的改善幅度小于削减金额本身。'
    ],
    'lesson-4': [
      '反通胀（Disinflation）指通胀率回落但仍为正值（π > 0），通缩（Deflation）则指物价绝对下跌（π < 0），会诱导推迟耐用品消费并加重实际债务。',
      '菲利普斯曲线的稳态 u* 满足议价缺口为 0，此时通胀稳定在预期水平 π^e（未必等于 0%）；持续使 u 低于 u* 会不断抬高通胀预期。',
      '阐述货币政策传导时注意覆盖四条路径：市场利率 I(r)、资产与房价财富 c0、企业盈利预期以及汇率变动对净出口 NX 的影响。'
    ],
    'formula-sheet': [
      '点击工具栏“打印 / 存 PDF”或按 Ctrl/Cmd + P 时，页面会自动隐藏侧边栏与窗口边框以便打印排版。',
      '考前对照复习时，可先浏览“沿线移动 vs 整线平移”矩阵，再回顾常见易错点与 SQ1–SQ7 对应模型。'
    ]
  };

  const root = document.documentElement;
  const pageId = document.body.dataset.page || 'index';

  // 1. Theme & Font Mode Persistence
  const themeSelect = document.getElementById('xp-theme-select');
  const fontSelect = document.getElementById('xp-font-select');

  function applyTheme(val) {
    const allowed = ['luna', 'olive', 'silver'];
    const theme = allowed.includes(val) ? val : 'luna';
    root.setAttribute('data-xp-theme', theme);
    if (themeSelect) themeSelect.value = theme;
    localStorage.setItem(THEME_KEY, theme);
  }

  function applyFontMode(val) {
    const allowed = ['clear', 'pixel', 'projector'];
    const mode = allowed.includes(val) ? val : 'clear';
    root.setAttribute('data-font-mode', mode);
    if (fontSelect) fontSelect.value = mode;
    localStorage.setItem(FONT_KEY, mode);
  }

  applyTheme(localStorage.getItem(THEME_KEY) || 'luna');
  applyFontMode(localStorage.getItem(FONT_KEY) || 'clear');

  themeSelect?.addEventListener('change', (e) => applyTheme(e.target.value));
  fontSelect?.addEventListener('change', (e) => applyFontMode(e.target.value));

  // 2. Window Titlebar Controls & Desktop Restore
  const minBtn = document.querySelector('[data-win-min]');
  const maxBtn = document.querySelector('[data-win-max]');
  const closeBtn = document.querySelector('[data-win-close]');

  minBtn?.addEventListener('click', () => {
    document.body.classList.toggle('xp-minimized');
  });

  maxBtn?.addEventListener('click', () => {
    document.body.classList.remove('xp-minimized');
    document.body.classList.toggle('xp-maximized');
  });

  closeBtn?.addEventListener('click', () => {
    document.body.classList.toggle('xp-minimized');
  });

  // 3. Toolbar Actions (Sidebar toggle, Expand/Collapse Answers, Print)
  const sidebarToggleBtn = document.querySelector('[data-toggle-sidebar]');
  const mobileDrawerBtn = document.querySelector('[data-mobile-drawer]');
  const expandAllBtn = document.querySelector('[data-expand-all]');
  const collapseAllBtn = document.querySelector('[data-collapse-all]');
  const printBtn = document.querySelector('[data-print]');

  sidebarToggleBtn?.addEventListener('click', () => {
    if (window.innerWidth <= 900) {
      document.body.classList.toggle('mobile-drawer-open');
    } else {
      const hidden = document.body.classList.toggle('sidebar-hidden');
      sidebarToggleBtn.setAttribute('aria-pressed', String(!hidden));
    }
  });

  mobileDrawerBtn?.addEventListener('click', () => {
    const open = document.body.classList.toggle('mobile-drawer-open');
    mobileDrawerBtn.setAttribute('aria-pressed', String(open));
  });

  const answerDisclosures = Array.from(document.querySelectorAll('details.xp-answer'));

  function syncAnswerSummary(det) {
    const label = det.querySelector('.xp-answer-label');
    if (label) {
      label.textContent = det.open ? '收起参考答案' : '查看参考答案';
    }
  }

  answerDisclosures.forEach((det) => {
    syncAnswerSummary(det);
    det.addEventListener('toggle', () => syncAnswerSummary(det));
  });

  expandAllBtn?.addEventListener('click', () => {
    answerDisclosures.forEach((det) => { det.open = true; });
  });

  collapseAllBtn?.addEventListener('click', () => {
    answerDisclosures.forEach((det) => { det.open = false; });
  });

  printBtn?.addEventListener('click', () => window.print());

  // 4. Sidebar Tabs (目录 / 索引 / 速算器) & Collapsible XPExplorerBar
  const tabButtons = Array.from(document.querySelectorAll('.xp-sidebar-tabs [role="tab"]'));
  const tabPanels = Array.from(document.querySelectorAll('.xp-tab-panel'));

  function activateSidebarTab(panelId) {
    tabButtons.forEach((btn) => {
      const selected = btn.getAttribute('aria-controls') === panelId;
      btn.setAttribute('aria-selected', String(selected));
    });
    tabPanels.forEach((panel) => {
      panel.classList.toggle('active', panel.id === panelId);
    });
  }

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      activateSidebarTab(btn.getAttribute('aria-controls'));
    });
  });

  document.querySelectorAll('[data-open-calc]').forEach((el) => {
    el.addEventListener('click', () => {
      if (window.innerWidth <= 900) document.body.classList.add('mobile-drawer-open');
      else document.body.classList.remove('sidebar-hidden');
      activateSidebarTab('tab-calc');
    });
  });

  document.querySelectorAll('.xp-task-header').forEach((headerBtn) => {
    headerBtn.addEventListener('click', () => {
      const box = headerBtn.closest('.xp-task-box');
      if (!box) return;
      const collapsed = box.classList.toggle('collapsed');
      headerBtn.setAttribute('aria-expanded', String(!collapsed));
      const chev = headerBtn.querySelector('.xp-task-chevron');
      if (chev) chev.textContent = collapsed ? '︾' : '︽';
    });
  });

  // 5. Scroll Spy for Right Reading Pane TOC Links
  const pane = document.getElementById('chm-pane');
  const tocLinks = Array.from(document.querySelectorAll('.xp-tree-wrap a[href^="#"]'));
  if (pane && tocLinks.length) {
    const targets = tocLinks
      .map((a) => ({ link: a, el: document.getElementById(decodeURIComponent(a.getAttribute('href').slice(1))) }))
      .filter((x) => x.el);

    const updateActiveToc = () => {
      const top = pane.getBoundingClientRect().top + 90;
      let current = targets[0];
      for (const item of targets) {
        if (item.el.getBoundingClientRect().top <= top) current = item;
      }
      tocLinks.forEach((a) => a.classList.remove('active'));
      if (current) current.link.classList.add('active');
    };

    pane.addEventListener('scroll', updateActiveToc, { passive: true });
    window.addEventListener('scroll', updateActiveToc, { passive: true });
    updateActiveToc();
  }

  // Open target disclosure when deep-linked
  function handleHashTarget() {
    if (!location.hash) return;
    const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (!target) return;
    const innerAnswer = target.matches('details.xp-answer')
      ? target
      : target.querySelector('details.xp-answer');
    const parentAnswer = target.closest('details.xp-answer');
    if (innerAnswer) innerAnswer.open = true;
    if (parentAnswer) parentAnswer.open = true;
    requestAnimationFrame(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
  handleHashTarget();
  window.addEventListener('hashchange', handleHashTarget);

  // 6. Global Search Across Search Index
  const searchInput = document.getElementById('xp-search-input');
  const searchGoBtn = document.getElementById('xp-search-go');
  const searchResults = document.getElementById('xp-search-results');

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  }

  function runSearch(query) {
    if (!searchResults) return;
    const q = (query || '').trim().toLowerCase();
    const index = Array.isArray(window.ECON5103_SEARCH_INDEX) ? window.ECON5103_SEARCH_INDEX : [];
    if (!q) {
      searchResults.classList.remove('open');
      return;
    }
    const terms = q.split(/\s+/).filter(Boolean);
    const matches = index.filter((item) => {
      const hay = `${item.title} ${item.pageLabel} ${item.keywords || ''} ${item.snippet || ''}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    }).slice(0, 14);

    if (!matches.length) {
      searchResults.innerHTML = `<div class="xp-search-head"><span>搜索 "${escapeHtml(query)}"</span><button type="button" data-close-search>关闭</button></div><div style="padding:10px;font-size:12px;">未找到匹配条目。试试关键词：<code>Gini</code>、<code>Markup</code>、<code>WS/PS</code>、<code>Leverage</code>、<code>k_open</code>、<code>Fisher</code>、<code>SQ6</code>。</div>`;
    } else {
      const rows = matches.map((m) => `
        <a class="xp-search-item" href="${escapeHtml(m.href)}">
          <div class="xp-search-title">${escapeHtml(m.title)}</div>
          <div class="xp-search-meta">[${escapeHtml(m.pageLabel)}] ${escapeHtml((m.snippet || '').slice(0, 88))}</div>
        </a>
      `).join('');
      searchResults.innerHTML = `<div class="xp-search-head"><span>找到 ${matches.length} 条相关内容</span><button type="button" data-close-search>关闭</button></div>${rows}`;
    }
    searchResults.classList.add('open');
  }

  searchInput?.addEventListener('input', () => {
    if (searchInput.value.trim().length >= 1) runSearch(searchInput.value);
    else searchResults?.classList.remove('open');
  });

  searchInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      runSearch(searchInput.value);
    } else if (e.key === 'Escape') {
      searchResults?.classList.remove('open');
    }
  });

  searchGoBtn?.addEventListener('click', () => runSearch(searchInput?.value || ''));

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-close-search]')) {
      searchResults?.classList.remove('open');
      return;
    }
    if (!e.target.closest('.xp-banner-search')) {
      searchResults?.classList.remove('open');
    }
  });

  // 7. Sidebar CHM Index Filter
  const indexFilterInput = document.getElementById('xp-index-filter');
  const indexItems = Array.from(document.querySelectorAll('#xp-index-list li'));
  indexFilterInput?.addEventListener('input', () => {
    const q = indexFilterInput.value.trim().toLowerCase();
    indexItems.forEach((li) => {
      li.style.display = !q || li.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  });

  // 8. Index Page Radar Filter
  const radarFilter = document.getElementById('radar-filter');
  const radarRows = Array.from(document.querySelectorAll('#radar-table tbody tr'));
  radarFilter?.addEventListener('input', () => {
    const q = radarFilter.value.trim().toLowerCase();
    radarRows.forEach((tr) => {
      tr.style.display = !q || tr.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  });

  // 9. Three Exam Calculators (Sidebar Tools Tab)
  function numVal(id, fallback) {
    const el = document.getElementById(id);
    if (!el) return fallback;
    const v = parseFloat(el.value);
    return Number.isFinite(v) ? v : fallback;
  }

  function calcGini() {
    const out = document.getElementById('calc-gini-out');
    if (!out) return;
    const y1 = numVal('gini-y1', 12);
    const y2 = numVal('gini-y2', 4);
    const y3 = numVal('gini-y3', 2);
    const mean = (y1 + y2 + y3) / 3;
    const d12 = Math.abs(y1 - y2);
    const d13 = Math.abs(y1 - y3);
    const d23 = Math.abs(y2 - y3);
    const avgDiff = (d12 + d13 + d23) / 3;
    const g = mean > 0 ? 0.5 * (avgDiff / mean) : 0;
    out.innerHTML = `
      <div>3对差：|${y1}-${y2}|=${d12.toFixed(2)}, |${y1}-${y3}|=${d13.toFixed(2)}, |${y2}-${y3}|=${d23.toFixed(2)}</div>
      <div>差均值 Δ = ${(avgDiff).toFixed(4)} · 均值 ȳ = ${mean.toFixed(4)}</div>
      <div><strong>G = 0.5 × Δ / ȳ = ${g.toFixed(4)}</strong>（讲义无序3对口径）</div>
    `;
  }

  function calcMultiplier() {
    const out = document.getElementById('calc-mult-out');
    if (!out) return;
    const c1 = numVal('mult-c1', 0.8);
    const t = numVal('mult-t', 0.25);
    const m = numVal('mult-m', 0.2);
    const dg = numVal('mult-dg', -200);
    const slope = c1 * (1 - t) - m;
    const denom = 1 - slope;
    if (denom <= 0) {
      out.innerHTML = `<strong style="color:#b91c1c;">分母 1 − [c1(1−t)−m] = ${denom.toFixed(3)} ≤ 0，AD 斜率 ≥ 1 不收敛！</strong>`;
      return;
    }
    const k = 1 / denom;
    const dy = k * dg;
    const dt = t * dy;
    const dbb = dt - dg;
    out.innerHTML = `
      <div>内生斜率 = ${c1}×(1−${t})−${m} = <strong>${slope.toFixed(3)}</strong></div>
      <div><strong>k_open = ${k.toFixed(3)}</strong> · ΔY = <strong>${dy.toFixed(2)}</strong></div>
      <div>税收反馈 ΔT = tΔY = <strong>${dt.toFixed(2)}</strong></div>
      <div>净预算平衡 Δ(T−G) = <strong>${dbb >= 0 ? '+' : ''}${dbb.toFixed(2)}</strong></div>
    `;
  }

  function calcBank() {
    const out = document.getElementById('calc-bank-out');
    if (!out) return;
    const res = numVal('bank-res', 30);
    const loan = numVal('bank-loan', 170);
    const dep = numVal('bank-dep', 180);
    const loss = numVal('bank-loss', 21);
    const assets = res + loan;
    const nw = assets - dep;
    const newNw = nw - loss;
    const lev = nw > 0 ? assets / nw : Infinity;
    const maxPct = assets > 0 && nw > 0 ? (nw / assets) * 100 : 0;
    const state = newNw < 0 ? '<strong style="color:#b91c1c;">Insolvent（资不抵债）</strong>' : '<strong style="color:#1e5f1e;">Solvent（仍有偿付力）</strong>';
    out.innerHTML = `
      <div>总资产=${assets.toFixed(1)} · Net worth=<strong>${nw.toFixed(1)}</strong></div>
      <div>Leverage = ${Number.isFinite(lev) ? lev.toFixed(2) + 'x' : '∞'}（破产临界坏账率 <strong>${maxPct.toFixed(2)}%</strong>）</div>
      <div>扣损 ${loss.toFixed(1)} 后净值 = <strong>${newNw.toFixed(1)}</strong> → ${state}</div>
    `;
  }

  document.getElementById('calc-gini-form')?.addEventListener('submit', (e) => { e.preventDefault(); calcGini(); });
  document.getElementById('calc-mult-form')?.addEventListener('submit', (e) => { e.preventDefault(); calcMultiplier(); });
  document.getElementById('calc-bank-form')?.addEventListener('submit', (e) => { e.preventDefault(); calcBank(); });
  ['gini-y1', 'gini-y2', 'gini-y3'].forEach((id) => document.getElementById(id)?.addEventListener('input', calcGini));
  ['mult-c1', 'mult-t', 'mult-m', 'mult-dg'].forEach((id) => document.getElementById(id)?.addEventListener('input', calcMultiplier));
  ['bank-res', 'bank-loan', 'bank-dep', 'bank-loss'].forEach((id) => document.getElementById(id)?.addEventListener('input', calcBank));
  calcGini();
  calcMultiplier();
  calcBank();

  // 10. Per-Question Countdown Timers & Lesson 4 Mock Suite 25-Min Timer
  function formatClock(sec) {
    const s = Math.max(0, Math.floor(sec));
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }

  function wireTimer(clockEl, toggleBtn, resetBtn, initialSeconds) {
    if (!clockEl || !toggleBtn || !resetBtn) return;
    let remaining = initialSeconds;
    let timerId = null;

    function render() {
      clockEl.textContent = formatClock(remaining);
      clockEl.classList.toggle('low', remaining > 0 && remaining <= 60);
      clockEl.classList.toggle('done', remaining === 0);
    }

    function stop() {
      if (timerId) {
        clearInterval(timerId);
        timerId = null;
      }
      toggleBtn.textContent = '▶ 计时';
    }

    toggleBtn.addEventListener('click', () => {
      if (timerId) {
        stop();
      } else {
        if (remaining === 0) remaining = initialSeconds;
        toggleBtn.textContent = '⏸ 暂停';
        timerId = setInterval(() => {
          remaining = Math.max(0, remaining - 1);
          render();
          if (remaining === 0) stop();
        }, 1000);
      }
    });

    resetBtn.addEventListener('click', () => {
      stop();
      remaining = initialSeconds;
      render();
    });

    render();
  }

  document.querySelectorAll('.q-timer').forEach((wrap) => {
    const secs = parseInt(wrap.dataset.seconds || '300', 10);
    wireTimer(
      wrap.querySelector('.q-timer-clock'),
      wrap.querySelector('[data-timer-toggle]'),
      wrap.querySelector('[data-timer-reset]'),
      secs
    );
  });

  const mockClock = document.getElementById('mock-suite-clock');
  if (mockClock) {
    wireTimer(
      mockClock,
      document.querySelector('[data-mock-start]'),
      document.querySelector('[data-mock-reset]'),
      1500
    );
  }

  // 11. Mastery Progress Tracking
  function loadMastered() {
    try {
      return JSON.parse(localStorage.getItem(MASTERED_KEY) || '{}') || {};
    } catch {
      return {};
    }
  }

  function saveMastered(state) {
    localStorage.setItem(MASTERED_KEY, JSON.stringify(state));
  }

  function refreshProgressUI() {
    const state = loadMastered();
    const doneCount = Object.values(state).filter(Boolean).length;
    const statusText = document.getElementById('status-progress-text');
    const statusBar = document.getElementById('status-progress-bar');
    if (statusText) statusText.textContent = `已完成 ${doneCount} / ${TOTAL_EXERCISES} 题`;
    if (statusBar) {
      statusBar.max = TOTAL_EXERCISES;
      statusBar.value = doneCount;
    }
    document.querySelectorAll('[data-lesson-progress]').forEach((badge) => {
      const key = badge.getAttribute('data-lesson-progress');
      const ids = LESSON_QUESTION_IDS[key] || [];
      const done = ids.filter((id) => state[id]).length;
      badge.textContent = `已完成 ${done} / ${ids.length}`;
    });
  }

  document.querySelectorAll('input[data-master-id]').forEach((cb) => {
    const id = cb.getAttribute('data-master-id');
    const state = loadMastered();
    cb.checked = Boolean(state[id]);
    cb.addEventListener('change', () => {
      const next = loadMastered();
      if (cb.checked) next[id] = true;
      else delete next[id];
      saveMastered(next);
      refreshProgressUI();
    });
  });

  refreshProgressUI();

  // 12. Windows Picture and Fax Viewer Lightbox
  const faxModal = document.getElementById('xp-fax-modal');
  const faxImg = document.getElementById('xp-fax-img');
  const faxCaption = document.getElementById('xp-fax-caption');
  const faxTitle = document.getElementById('xp-fax-title');
  const faxTriggers = Array.from(document.querySelectorAll('[data-fax-open]'));
  const faxMap = new Map();
  faxTriggers.forEach((btn) => {
    const src = btn.getAttribute('data-src');
    if (!faxMap.has(src)) {
      faxMap.set(src, {
        src,
        title: btn.getAttribute('data-title'),
        unit: btn.getAttribute('data-unit') || ''
      });
    }
  });
  let faxItems = Array.from(faxMap.values());
  let faxIndex = 0;
  let faxZoom = 1;

  function renderFaxImage() {
    const item = faxItems[faxIndex];
    if (!item || !faxImg) return;
    faxImg.src = item.src;
    faxImg.alt = item.title;
    faxImg.style.transform = `scale(${faxZoom})`;
    if (faxCaption) faxCaption.textContent = `${item.unit ? '[' + item.unit + '] ' : ''}${item.title} (${faxIndex + 1} / ${faxItems.length}) · 缩放 ${Math.round(faxZoom * 100)}%`;
    if (faxTitle) faxTitle.textContent = `${item.title} - Windows 图片和传真查看器`;
  }

  function openFax(idx) {
    if (!faxModal || !faxItems.length) return;
    faxIndex = Math.max(0, Math.min(idx, faxItems.length - 1));
    faxZoom = 1;
    renderFaxImage();
    faxModal.classList.add('open');
  }

  function closeFax() {
    faxModal?.classList.remove('open');
  }

  faxTriggers.forEach((btn) => {
    btn.addEventListener('click', () => {
      const src = btn.getAttribute('data-src');
      const idx = faxItems.findIndex((item) => item.src === src);
      openFax(idx >= 0 ? idx : 0);
    });
  });

  document.getElementById('xp-fax-prev')?.addEventListener('click', () => {
    if (!faxItems.length) return;
    faxIndex = (faxIndex - 1 + faxItems.length) % faxItems.length;
    faxZoom = 1;
    renderFaxImage();
  });

  document.getElementById('xp-fax-next')?.addEventListener('click', () => {
    if (!faxItems.length) return;
    faxIndex = (faxIndex + 1) % faxItems.length;
    faxZoom = 1;
    renderFaxImage();
  });

  document.getElementById('xp-fax-zoom-in')?.addEventListener('click', () => {
    faxZoom = Math.min(2.2, faxZoom + 0.2);
    renderFaxImage();
  });

  document.getElementById('xp-fax-zoom-out')?.addEventListener('click', () => {
    faxZoom = Math.max(0.6, faxZoom - 0.2);
    renderFaxImage();
  });

  document.getElementById('xp-fax-zoom-reset')?.addEventListener('click', () => {
    faxZoom = 1;
    renderFaxImage();
  });

  document.getElementById('xp-fax-close')?.addEventListener('click', closeFax);
  document.getElementById('xp-fax-title-close')?.addEventListener('click', closeFax);
  faxModal?.addEventListener('click', (e) => {
    if (e.target === faxModal) closeFax();
  });

  document.addEventListener('keydown', (e) => {
    if (!faxModal?.classList.contains('open')) return;
    if (e.key === 'Escape') closeFax();
    if (e.key === 'ArrowRight') document.getElementById('xp-fax-next')?.click();
    if (e.key === 'ArrowLeft') document.getElementById('xp-fax-prev')?.click();
  });

  // 13. Lightweight Context-Aware Clippy Coach
  const clippyWidget = document.getElementById('clippy-widget');
  const clippyText = document.getElementById('clippy-text');
  const clippyAvatarBtn = document.getElementById('clippy-avatar-btn');
  const clippyNextBtn = document.getElementById('clippy-next-btn');
  const clippyCloseBtn = document.getElementById('clippy-close-btn');
  const toolbarClippyBtn = document.querySelector('[data-toggle-clippy]');
  const tipList = CLIPPY_TIPS[pageId] || CLIPPY_TIPS['index'];
  let tipIndex = 0;

  function renderClippyTip() {
    if (clippyText) clippyText.textContent = tipList[tipIndex % tipList.length];
  }
  renderClippyTip();

  clippyAvatarBtn?.addEventListener('click', () => {
    if (!clippyWidget) return;
    const isOpen = clippyWidget.classList.toggle('bubble-open');
    if (isOpen) renderClippyTip();
  });

  clippyNextBtn?.addEventListener('click', () => {
    tipIndex = (tipIndex + 1) % tipList.length;
    renderClippyTip();
  });

  clippyCloseBtn?.addEventListener('click', () => {
    clippyWidget?.classList.remove('bubble-open');
  });

  toolbarClippyBtn?.addEventListener('click', () => {
    if (!clippyWidget) return;
    const hidden = clippyWidget.classList.toggle('hidden');
    if (!hidden) clippyWidget.classList.add('bubble-open');
    toolbarClippyBtn.setAttribute('aria-pressed', String(!hidden));
  });
})();
