# ECON5103 Business Economics · 期末复习帮助与支持中心

面向 ECON5103 *Business Economics* 期末冲刺的学生参考网页（2000 年代初 Windows XP「帮助与支持中心 / `.chm`」双栏文档风格）。全站为纯静态 HTML + 本地 `XP.css` + 编译期预渲染 `KaTeX`，可直接离线双击或通过 GitHub Pages 访问。

## 页面结构

- `index.html`：帮助中心首页（考情声明、4 堂课与公式总表入口、四象限一秒定模型雷达、微宏观四座桥梁）
- `lesson-1.html`：第 1 课 · 微观核心（Units 1–8 & Unit 11，8 张 `[补图]` + 5 组练习）
- `lesson-2.html`：第 2 课 · 市场失灵、劳动与银行货币（Units 12, 9 & 10，6 张 `[补图]` + 4 组练习）
- `lesson-3.html`：第 3 课 · 经济波动与财政乘数（Units 13 & 14，6 张 `[补图]` + 4 组练习）
- `lesson-4.html`：第 4 课 · 通胀、央行政策与 25 分钟全真模考（Unit 15 + Mock Q1–Q4，6 张 `[补图]` + 5 组题）
- `formula-sheet.html`：考前终极速查手册（十大公式、16 组方程详注、曲线沿线 vs 平移矩阵、十大绝杀陷阱、SQ1–SQ7 挂钩表，支持 A4 打印）

## 核心交互功能

- **Windows XP 官方三主题切换**：Classic Luna Blue（经典蓝）/ Olive Green（橄榄绿）/ Silver（银色）
- **三种阅读字体模式**：清晰黑体（默认长时间阅读）/ 2000s 点阵宋（Zpix + SimSun 复古模式）/ 投影大字号
- **左侧 `.chm` 三标签导航**：`目录(C)` 树形跟随目录、`索引(N)` 关键词 A–Z 过滤、`速算器(T)` 内置 3 人 Gini / 开放有税乘数 / 银行杠杆破产三合一自检计算器
- **顶部全局搜索 (`搜索(S)`)**：实时检索全站公式、概念、图表与 SQ1–SQ7 条目
- **Windows 图片和传真查看器**：26 张 `[补图]` 支持弹窗放大、1:1 原比例与前后翻页
- **限时练习与打卡进度**：每道练习配独立倒计时器，第 4 课附 25 分钟全真模考计时器，`已掌握本题` 状态保存至浏览器本地存储

## 重新生成与本地验证

```bash
npm install
npm run build
npm run verify
npm run serve
```

浏览器打开 <http://localhost:4173> 进行预览。
