# ECON5103 Business Economics · 期末复习参考网站

面向 ECON5103 *Business Economics* 期末复习的静态参考网站，采用 2000 年代初 Windows XP「帮助与支持中心（`.chm`）」双栏布局。全站由纯静态 HTML + 本地 `XP.css` + 编译期预渲染 `KaTeX` 组成，支持本地离线打开与 GitHub Pages 部署。

## 页面结构

- `index.html`：首页（课程与资料说明、分课与公式总表入口、题干关键词与模型对照表、微宏观四条贯通主线）
- `lesson-1.html`：第 1 课 · 微观基础决策与市场定价（Units 1–8 & Unit 11）
- `lesson-2.html`：第 2 课 · 市场失灵、劳动力市场与银行货币（Units 12, 9 & 10）
- `lesson-3.html`：第 3 课 · 经济波动与财政乘数（Units 13 & 14）
- `lesson-4.html`：第 4 课 · 通胀、货币政策与综合模拟（Unit 15 + Mock Q1–Q4）
- `formula-sheet.html`：期末公式、曲线移动对照表、常见易错点与 SQ1–SQ7 对照

## 主要功能

- **Windows XP 主题切换**：支持 Classic Luna Blue（经典蓝）、Olive Green（橄榄绿）与 Silver（银色）三种配色
- **字体模式切换**：清晰黑体（默认阅读）、2000s 点阵宋（Zpix + SimSun）与投影大字号
- **左侧三标签导航**：`目录(C)` 章节导航、`索引(N)` 概念过滤、`验算(T)` 内置三人 Gini / 开放乘数 / 银行杠杆验算工具
- **全站检索 (`搜索(S)`)**：即时筛选公式、概念、图表与时事议题条目
- **图片查看器弹窗**：所有模型示意图均支持弹窗放大、原比例查看与上一张/下一张切换
- **练习计时与完成记录**：每道练习题配备独立计时器，第 4 课提供 25 分钟综合模拟计时，完成状态保存在浏览器本地存储中

## 本地构建与验证

```bash
npm install
npm run build
npm run verify
npm run serve
```

浏览器访问 <http://localhost:4173> 预览页面。
