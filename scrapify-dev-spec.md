# Scrapify — React 开发规格文档

> 本文档供 AI 编程助手（Codex / Claude Code）直接参考，用于将现有 HTML 原型转为生产级 React + Next.js 应用。请严格按照本文档的技术栈、目录结构、组件拆分和样式规范进行开发。

---

## 1. 项目背景

Scrapify 是一个 **Shopify 独立站商品数据采集 SaaS 系统**，用户可通过 Web 端管理采集任务、监控竞品价格、配置采集字段、管理代理 IP 池。

已有一份完整的 HTML 原型文件 `scrapify.html`，包含：
- 6 个功能页面的完整 UI
- 配色、字体、间距等设计规范
- 新建任务弹窗的交互逻辑
- 数据看板的折线图（Chart.js）

**开发任务：将 HTML 原型 1:1 还原为 React 组件，并搭建完整工程结构。**

---

## 2. 技术栈

| 层级 | 技术 | 版本 | 说明 |
|------|------|------|------|
| 框架 | Next.js | 14.x (App Router) | 使用 `app/` 目录结构 |
| UI 语言 | React | 18.x | 函数式组件 + Hooks |
| 样式 | Tailwind CSS | 3.x | 配合自定义 CSS 变量 |
| 组件库 | shadcn/ui | latest | 按需安装，不全量引入 |
| 图表 | Recharts | 2.x | 替代 Chart.js，React 原生 |
| 状态管理 | Zustand | 4.x | 全局任务状态、弹窗状态 |
| 数据请求 | TanStack Query | 5.x | 任务列表轮询、价格监控 |
| 表格 | TanStack Table | 8.x | 任务列表排序筛选 |
| 字体 | DM Sans + DM Mono | — | 通过 `next/font/google` 引入 |
| 图标 | lucide-react | latest | 替代 HTML 中的内联 SVG |
| 类型 | TypeScript | 5.x | 严格模式，所有组件必须有类型 |

---

## 3. 目录结构

```
scrapify/
├── app/
│   ├── layout.tsx                  # 根布局，引入字体、全局样式
│   ├── page.tsx                    # 重定向到 /dashboard/tasks
│   └── dashboard/
│       ├── layout.tsx              # 侧边栏 + 顶栏布局（所有子页面共用）
│       ├── tasks/
│       │   └── page.tsx            # 任务中心页
│       ├── schedule/
│       │   └── page.tsx            # 调度计划页
│       ├── fields/
│       │   └── page.tsx            # 字段配置页
│       ├── analytics/
│       │   └── page.tsx            # 数据看板页
│       ├── monitor/
│       │   └── page.tsx            # 价格监控页
│       └── proxy/
│           └── page.tsx            # 代理管理页
│
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx             # 左侧导航栏
│   │   ├── Topbar.tsx              # 顶部操作栏
│   │   └── DashboardShell.tsx      # 整体布局容器
│   │
│   ├── ui/                         # 基础 UI 组件（shadcn 风格）
│   │   ├── StatCard.tsx            # 统计卡片
│   │   ├── Panel.tsx               # 白色面板容器
│   │   ├── Badge.tsx               # 状态标签（运行中/完成/报错/等待）
│   │   ├── ProgressBar.tsx         # 进度条
│   │   ├── MiniBarChart.tsx        # 横向迷你条形图
│   │   ├── SparkLine.tsx           # 迷你折线图（价格监控卡片用）
│   │   └── CheckItem.tsx           # 可勾选字段项
│   │
│   ├── tasks/
│   │   ├── TaskTable.tsx           # 任务列表表格（TanStack Table）
│   │   ├── TaskRow.tsx             # 单行任务
│   │   └── NewTaskModal.tsx        # 新建任务弹窗
│   │
│   ├── monitor/
│   │   └── MonitorCard.tsx         # 价格监控卡片
│   │
│   ├── analytics/
│   │   └── TrendChart.tsx          # 采集量趋势折线图（Recharts）
│   │
│   └── proxy/
│       └── ProxyTable.tsx          # 代理 IP 列表
│
├── lib/
│   ├── store/
│   │   ├── taskStore.ts            # Zustand: 任务列表状态
│   │   └── uiStore.ts              # Zustand: 弹窗、当前页等 UI 状态
│   ├── types/
│   │   └── index.ts                # 所有 TypeScript 类型定义
│   └── utils.ts                    # cn() 工具函数、格式化函数
│
├── hooks/
│   ├── useTasks.ts                 # TanStack Query: 获取任务列表
│   ├── useMonitor.ts               # TanStack Query: 价格监控数据
│   └── usePolling.ts               # 通用轮询 Hook（进度条实时更新）
│
├── tailwind.config.ts              # 自定义 CSS 变量注入
├── globals.css                     # CSS 变量定义
└── tsconfig.json
```

---

## 4. 设计规范（Design Tokens）

将以下 CSS 变量写入 `app/globals.css`，Tailwind 通过 `tailwind.config.ts` 映射为工具类。

```css
/* app/globals.css */
:root {
  --brand:        #5B47E0;
  --brand-light:  #EDE9FC;
  --brand-mid:    #7C6AE8;
  --bg:           #F5F4F8;
  --surface:      #FFFFFF;
  --surface2:     #F8F7FB;
  --border:       rgba(0,0,0,0.08);
  --border2:      rgba(0,0,0,0.14);
  --text:         #1A1824;
  --text2:        #6B6880;
  --text3:        #A09DB8;
  --green:        #10B981;
  --green-bg:     #ECFDF5;
  --green-text:   #059669;
  --red:          #EF4444;
  --red-bg:       #FEF2F2;
  --red-text:     #DC2626;
  --amber:        #F59E0B;
  --amber-bg:     #FFFBEB;
  --amber-text:   #D97706;
  --radius:       10px;
  --radius-sm:    6px;
  --sidebar-w:    210px;
  --topbar-h:     54px;
}
```

```ts
// tailwind.config.ts
import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand:       'var(--brand)',
        'brand-light': 'var(--brand-light)',
        surface:     'var(--surface)',
        surface2:    'var(--surface2)',
        text1:       'var(--text)',
        text2:       'var(--text2)',
        text3:       'var(--text3)',
      },
      fontFamily: {
        sans: ['DM Sans', 'sans-serif'],
        mono: ['DM Mono', 'monospace'],
      },
      borderRadius: {
        DEFAULT: 'var(--radius)',
        sm:      'var(--radius-sm)',
      },
    },
  },
  plugins: [],
}

export default config
```

---

## 5. TypeScript 类型定义

```ts
// lib/types/index.ts

export type TaskStatus = 'running' | 'done' | 'error' | 'pending'

export interface Task {
  id:         string
  url:        string
  status:     TaskStatus
  progress:   number       // 0–100
  itemCount:  number
  elapsed:    string       // "4m12s"
  createdAt:  string
}

export type FieldType = 'String' | 'Number' | 'Float' | 'Array' | 'URL[]' | 'String[]' | 'HTML'

export interface FieldConfig {
  id:      string
  label:   string
  path:    string          // Shopify JSON path, e.g. "product.title"
  type:    FieldType
  enabled: boolean
}

export interface ScheduleJob {
  id:        string
  name:      string
  cron:      string        // cron 表达式
  cronLabel: string        // "每 4 小时"
  lastRun:   string
  nextRun:   string
  enabled:   boolean
}

export interface MonitorItem {
  id:        string
  site:      string
  url:       string
  price:     number
  currency:  string
  change:    number        // 正数涨价，负数降价
  status:    'up' | 'down' | 'stable' | 'outofstock'
  history:   number[]      // 最近 7 个价格点，用于 Sparkline
}

export interface ProxyItem {
  id:       string
  ip:       string
  port:     number
  country:  string
  flag:     string
  latency:  number         // ms
  traffic:  string         // "0.8 GB"
  status:   'online' | 'slow' | 'offline'
}

export interface StatCardData {
  label:  string
  value:  string
  change: string
  trend:  'up' | 'down' | 'neutral'
}

export interface NewTaskForm {
  url:         string
  mode:        'full' | 'incremental' | 'price-only'
  region:      string
  fields:      string[]
  concurrency: number
  delay:       string
}
```

---

## 6. 状态管理（Zustand）

```ts
// lib/store/uiStore.ts
import { create } from 'zustand'

interface UIState {
  isNewTaskModalOpen: boolean
  openNewTaskModal:   () => void
  closeNewTaskModal:  () => void
}

export const useUIStore = create<UIState>((set) => ({
  isNewTaskModalOpen: false,
  openNewTaskModal:  () => set({ isNewTaskModalOpen: true }),
  closeNewTaskModal: () => set({ isNewTaskModalOpen: false }),
}))
```

```ts
// lib/store/taskStore.ts
import { create } from 'zustand'
import type { Task } from '@/lib/types'

interface TaskState {
  tasks:     Task[]
  setTasks:  (tasks: Task[]) => void
  addTask:   (task: Task) => void
  updateTask:(id: string, patch: Partial<Task>) => void
}

export const useTaskStore = create<TaskState>((set) => ({
  tasks: [],
  setTasks:   (tasks) => set({ tasks }),
  addTask:    (task)  => set((s) => ({ tasks: [task, ...s.tasks] })),
  updateTask: (id, patch) => set((s) => ({
    tasks: s.tasks.map((t) => t.id === id ? { ...t, ...patch } : t)
  })),
}))
```

---

## 7. 核心组件规格

### 7.1 Sidebar.tsx

- 固定宽度 `210px`，高度 `100vh`，白色背景
- 顶部 Logo 区：图标 + "Scrapify" + "Pro" badge
- 导航分三个 section：采集 / 数据 / 系统
- 使用 Next.js `<Link>` + `usePathname()` 判断 active 状态
- 底部用户卡片：头像圆圈（取姓名首字）+ 用户名 + 套餐天数
- 运行中任务的导航项右侧显示绿色脉冲动画圆点

```tsx
// 导航项数据结构
const navItems = [
  { section: '采集', items: [
    { label: '任务中心', href: '/dashboard/tasks',    icon: ListIcon,   pulse: true  },
    { label: '调度计划', href: '/dashboard/schedule', icon: ClockIcon               },
    { label: '字段配置', href: '/dashboard/fields',   icon: TableIcon               },
  ]},
  { section: '数据', items: [
    { label: '数据看板', href: '/dashboard/analytics', icon: TrendingUpIcon         },
    { label: '价格监控', href: '/dashboard/monitor',   icon: ActivityIcon, badge: 3 },
    { label: '代理管理', href: '/dashboard/proxy',     icon: GlobeIcon              },
  ]},
]
```

### 7.2 Topbar.tsx

- 高度 `54px`，白色背景，底部边框
- 接收 `title` 和 `subtitle` props
- 右侧插槽 `actions`（ReactNode），由各页面传入不同按钮
- "新建任务"按钮调用 `useUIStore().openNewTaskModal()`

### 7.3 StatCard.tsx

```tsx
interface StatCardProps {
  label:  string
  value:  string
  change: string
  trend:  'up' | 'down' | 'neutral'
}
// trend='up' → 绿色；trend='down' → 红色；trend='neutral' → 灰色
```

### 7.4 Badge.tsx（任务状态标签）

```tsx
type BadgeVariant = 'running' | 'done' | 'error' | 'pending'

// running → 绿底绿字 "运行中"
// done    → 紫底紫字 "完成"
// error   → 红底红字 "报错"
// pending → 黄底黄字 "等待中"
```

### 7.5 TaskTable.tsx

- 使用 TanStack Table 实现
- 列：URL（`font-mono`）、状态 Badge、进度条、商品数、耗时
- 支持按状态筛选（顶部 Select）
- 支持按商品数排序
- 每行 hover 变浅灰背景
- 进度条使用 CSS transition 动画

### 7.6 NewTaskModal.tsx

使用 shadcn/ui 的 `Dialog` 组件。表单字段：

| 字段 | 组件 | 说明 |
|------|------|------|
| 目标 URL | `Input` | 必填，placeholder 示例 URL |
| 采集模式 | `Select` | 全量/增量/仅价格 |
| 代理区域 | `Select` | 自动/美国/英国/德国 |
| 采集字段 | 自定义 `CheckItem` 网格 | 6 个字段，默认勾选前 4 个 |
| 并发数 | `Select` | 3/5/10 |
| 请求延迟 | `Select` | 1-3s/0.5s/5s |

提交时：
1. 前端校验 URL 非空
2. 调用 `useTaskStore().addTask()` 添加一条 pending 任务
3. 关闭弹窗
4. （生产环境）POST 到 `/api/tasks`

### 7.7 TrendChart.tsx（数据看板折线图）

```tsx
// 使用 Recharts LineChart
// 数据格式
interface ChartPoint {
  date:  string   // "4/22"
  count: number   // 采集商品数
}

// 配置
// - 线条颜色 #5B47E0
// - 填充区域透明度 0.07
// - Tooltip 深色背景 #1A1824
// - Y轴单位：k（千）
// - 无 Legend
```

### 7.8 MonitorCard.tsx

```tsx
interface MonitorCardProps {
  item: MonitorItem
}
// 展示：站点名、URL、当前价格、涨跌幅、状态 Badge、Sparkline
// Sparkline 用 Recharts ResponsiveContainer + LineChart（无坐标轴）
// 涨价 → 红色箭头；降价 → 绿色箭头；稳定 → 灰色
```

### 7.9 SparkLine.tsx

```tsx
interface SparkLineProps {
  data:   number[]
  color:  string    // "#EF4444" | "#10B981" | "#A09DB8"
  height?: number   // 默认 40
}
// 使用 Recharts LineChart，隐藏所有坐标轴和网格
```

---

## 8. 页面路由与布局

### 8.1 根布局 `app/layout.tsx`

```tsx
import { DM_Sans, DM_Mono } from 'next/font/google'

const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-sans' })
const dmMono = DM_Mono({ subsets: ['latin'], weight: ['400','500'], variable: '--font-mono' })

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body className={`${dmSans.variable} ${dmMono.variable}`}>
        {children}
      </body>
    </html>
  )
}
```

### 8.2 Dashboard 布局 `app/dashboard/layout.tsx`

```tsx
// 左侧 Sidebar（固定）+ 右侧 main（flex-1，包含 Topbar + 滚动内容区）
export default function DashboardLayout({ children }) {
  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg)]">
      <Sidebar />
      <main className="flex flex-1 flex-col min-w-0">
        {children}  {/* 每个子页面自己渲染 Topbar + 内容 */}
      </main>
    </div>
  )
}
```

### 8.3 各页面 Topbar actions 插槽示例

```tsx
// app/dashboard/tasks/page.tsx
export default function TasksPage() {
  const openModal = useUIStore((s) => s.openNewTaskModal)
  return (
    <>
      <Topbar
        title="任务中心"
        subtitle="管理与追踪所有采集任务"
        actions={
          <div className="flex gap-2">
            <Button variant="outline">导出数据</Button>
            <Button onClick={openModal}>+ 新建任务</Button>
          </div>
        }
      />
      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
        {/* 统计卡片 */}
        {/* 任务列表 Panel */}
        {/* 底部双列 */}
      </div>
      <NewTaskModal />
    </>
  )
}
```

---

## 9. API 路由（Next.js Route Handlers）

开发阶段使用 mock 数据，生产环境对接真实后端。

```
app/api/
├── tasks/
│   ├── route.ts          # GET /api/tasks        返回任务列表
│   └── [id]/
│       └── route.ts      # PATCH /api/tasks/:id  更新任务状态
├── monitor/
│   └── route.ts          # GET /api/monitor      返回价格监控数据
├── proxy/
│   └── route.ts          # GET /api/proxy        返回代理列表
└── fields/
    └── route.ts          # GET/PUT /api/fields   字段配置读写
```

Mock 数据放在 `lib/mock/` 目录，结构与 TypeScript 类型完全对应。

---

## 10. 实时更新策略

```ts
// hooks/useTasks.ts
import { useQuery } from '@tanstack/react-query'

export function useTasks() {
  return useQuery({
    queryKey: ['tasks'],
    queryFn:  () => fetch('/api/tasks').then(r => r.json()),
    refetchInterval: 3000,   // 每 3 秒轮询，更新进度条
    staleTime: 1000,
  })
}
```

运行中任务的进度条更新：从 API 拿到最新 `progress` 值后，CSS transition 自动动画过渡（`transition: width 0.8s ease`）。

---

## 11. 初始化命令

```bash
# 1. 创建项目
npx create-next-app@latest scrapify \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*"

cd scrapify

# 2. 安装依赖
npm install \
  zustand \
  @tanstack/react-query \
  @tanstack/react-table \
  recharts \
  lucide-react \
  clsx \
  tailwind-merge

# 3. 安装 shadcn/ui（按需选择组件）
npx shadcn-ui@latest init
npx shadcn-ui@latest add dialog button input select

# 4. 安装字体（已通过 next/font/google 引入，无需 npm 安装）

# 5. 启动开发服务器
npm run dev
```

---

## 12. 开发优先级

按以下顺序开发，优先让核心流程跑通：

1. **[P0] 基础骨架** — `DashboardLayout` + `Sidebar` + `Topbar`，路由切换正常
2. **[P0] 任务中心页** — `StatCard` × 4、`TaskTable`、`FieldConfig` 面板、`MiniBarChart`
3. **[P0] 新建任务弹窗** — `NewTaskModal`，表单提交写入 Zustand
4. **[P1] 数据看板页** — `TrendChart`（Recharts 折线图）
5. **[P1] 价格监控页** — `MonitorCard` × 6，含 `SparkLine`
6. **[P2] 调度计划页** — 计划列表表格
7. **[P2] 字段配置页** — 可勾选字段网格
8. **[P2] 代理管理页** — 代理列表 + 延迟状态点
9. **[P3] API Route Handlers** — 接入真实后端或替换 mock

---

## 13. 代码规范

- 所有组件使用**函数式组件 + TypeScript**，禁止 `any`
- 组件文件名使用 **PascalCase**（`TaskTable.tsx`）
- 工具函数、hooks 使用 **camelCase**（`useTasks.ts`）
- 使用 `cn()` 合并 Tailwind 类名（`clsx` + `tailwind-merge`）
- 不使用内联 `style=`（除非 CSS 变量引用），全部用 Tailwind 类
- 图标统一使用 `lucide-react`，size 默认 `16`
- 禁止在组件内写业务逻辑，数据获取放在 hooks，UI 逻辑放在组件
- 每个页面组件顶部写注释说明页面功能

---

## 14. 参考原型

原型文件 `scrapify.html` 已包含完整 UI，开发时以该文件为视觉基准：

- 所有颜色、字号、间距从该文件提取（已在第 4 节归纳为 CSS 变量）
- 6 个页面的内容结构和 mock 数据参照 HTML 中对应的 `page-*` div
- 弹窗交互逻辑参照 HTML 中的 `openModal()` / `closeModal()` / `toggleCheck()` 函数
- 图表数据参照 HTML `dashChart` 的 labels 和 data 数组
