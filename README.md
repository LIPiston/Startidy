# Startidy

[English](README-en.md) | [한국어](README-ko.md) | 中文

> 如果这个项目对你有帮助，欢迎点个 Star！你的支持很重要。

用 AI 自动把你的 GitHub Stars 整理成 Markdown 分类的 CLI 工具。

它会生成一套扁平、方便浏览的 Markdown 文件：一个带目录的 `README.md` 索引，加上每个分类一个 `<分类名>.md` 文件 —— 可以直接提交到你的 "my stars" 仓库。

## 功能特性

- **可插拔的 AI 后端**：支持 Google Gemini，也支持**任何 OpenAI 兼容 API**（OpenAI、DeepSeek、OpenRouter、Groq、Ollama、vLLM、LM Studio 等）
- **Markdown 输出**：生成 `stars/README.md`（索引）以及每个分类一个 `stars/<分类名>.md`
- **自动规划分类**：AI 分析你 Star 的仓库，最多生成 32 个合适的分类
- **智能归类**：分析每个仓库的标题、描述和 README，把它们放进合适的分类
- **中文、自由命名**：像 `windows工具`、`好用软件`、`阅读-小说-epub-漫画` 这样的简短中文名；需要分层时用 `大类-小类` 写法（例如 `游戏-Minecraft`）
- **不按语言分类**：按平台、用途或主题分组，AI 永远不会生成 `Lang: Python` 这类语言分类
- **分步执行或全自动**：既可以单独运行每一步，也可以一次性跑完整流程
- **批量处理**：每次并行处理 20 个仓库，分类更快
- **断点续传**：每批分类完成后立刻写出 Markdown 并记录进度；中断后重新运行同一条命令会从断点继续，全部完成后进度文件自动删除
- **分类智能体**：每批分类完成后自动回头看一遍分类是否还合适——把这一批仓库向量化，和每个分类**此前**的向量中心比较，让 AI 决定要不要给「哪儿都放不进去」的仓库新增分类，或者把成员已经裂成两簇的大分类拆成 `大类-小类`；受影响的仓库会自动重新排队、用新分类再分一次。没有配置 embedding 就自动跳过，不影响正常流程

## 分类示例

```
windows工具           Android好用软件     macOS工具
好用软件              框架-库             配置-脚本
shell相关             编辑器相关          浏览器相关
ai相关                游戏-Minecraft      音乐
阅读-小说-epub-漫画   obsidian-笔记软件   vps服务
运维                  一堆awesome         有用但不多
生活                  主题美化            电视
```

分类会从四个角度灵活组合，根据你 Stars 的实际情况自由取舍：

- **平台 / 系统**：`windows工具`、`Android好用软件`、`电视`
- **用途 / 软件类型**：`好用软件`、`框架-库`、`配置-脚本`、`shell相关`、`编辑器相关`、`笔记软件`
- **主题 / 领域**：`ai相关`、`游戏-Minecraft`、`音乐`、`阅读-小说-epub-漫画`、`vps服务`、`运维`
- **个人化 / 兜底**（最多 1-2 个）：`一堆awesome`、`有用但不多`、`生活`、`学习-大学生`

## 安装

本项目是 fork 版本，**不发布到 npm**，只支持从源码运行。

```bash
# 克隆本仓库（fork）
git clone https://github.com/LIPiston/Startidy.git
cd Startidy

# 安装依赖
npm install

# 构建
npm run build

# 全局链接（可选）：链接后可以直接使用 startidy 命令
npm link
```

链接后即可直接使用 `startidy`；没有链接时，用 `node dist/index.js` 代替即可：

```bash
startidy run
# 等价于
node dist/index.js run
```

也可以用 Bun 直接运行源码（跳过构建步骤）：

```bash
npm run dev -- run
# 等价于
bun run src/index.ts run
```

## 配置

有三种方式配置 Startidy：

### 方式 1：命令行参数（适合一次性使用）

```bash
startidy --token ghp_xxx --username your-name --gemini-key AIza_xxx run

# 或者使用 OpenAI 兼容接口
startidy --token ghp_xxx --username your-name \
  --ai-provider openai --openai-key sk-xxx --openai-model gpt-4o-mini run
```

### 方式 2：环境变量

```bash
# Linux/macOS
export GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
export GITHUB_USERNAME=your-username
export OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxx

# Windows (PowerShell)
$env:GITHUB_TOKEN="ghp_xxxxxxxxxxxxxxxxxxxx"
$env:GITHUB_USERNAME="your-username"
$env:OPENAI_API_KEY="sk-xxxxxxxxxxxxxxxxxxxx"

# Windows (CMD)
set GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
set GITHUB_USERNAME=your-username
set OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxx

# 然后运行
startidy run
```

### 方式 3：`.env` 文件（适合反复使用）

在当前目录创建 `.env` 文件：

```env
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
GITHUB_USERNAME=your-username

# AI 提供方：openai（默认）或 gemini
AI_PROVIDER=openai

# OpenAI 兼容接口（AI_PROVIDER=openai 时必填，默认提供方）
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxx
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini

# Gemini（AI_PROVIDER=gemini 时必填）
# GEMINI_API_KEY=AIzaxxxxxxxxxxxxxxxxxxxxxxxx
```

仓库里还提供了两份可直接复制、逐项注释的模板：

- `.env.example` —— 英文注释版，每个变量的作用、取值范围、默认值都有说明
- `.env.example.zh` —— 中文注释版，内容与英文版一一对应

```bash
cp .env.example .env        # 或 cp .env.example.zh .env
```

### 全局命令行参数

| 参数                         | 说明                                                       |
| ---------------------------- | ---------------------------------------------------------- |
| `--token <token>`          | GitHub Personal Access Token                               |
| `--username <username>`    | GitHub 用户名                                              |
| `--ai-provider <provider>` | AI 提供方：`openai`（默认）或 `gemini`                 |
| `--gemini-key <key>`       | Google Gemini API Key                                      |
| `--openai-key <key>`       | OpenAI 兼容 API Key                                        |
| `--openai-base-url <url>`  | OpenAI 兼容接口地址（默认：`https://api.openai.com/v1`） |
| `--openai-model <model>`   | OpenAI 兼容模型（默认：`gpt-4o-mini`）                   |
| `--ai-model <model>`       | 当前提供方使用的模型名                                     |
| `--max-categories <n>`     | 最大分类数（默认：32）                                     |
| `--batch-size <n>`         | 分类批大小（默认：20）                                     |
| `--output-dir <dir>`       | Markdown 文件输出目录（默认：`stars`）                   |
| `--debug`                  | 开启调试模式                                               |

### 获取 GitHub Token

1. 打开 [GitHub Settings &gt; Developer settings &gt; Personal access tokens](https://github.com/settings/tokens)
2. 点击 "Generate new token (classic)"
3. 勾选权限：`repo`、`read:user`
4. 生成并复制 token

### 获取 Gemini API Key

1. 打开 [Google AI Studio](https://aistudio.google.com/app/apikey)
2. 点击 "Create API Key"
3. 复制 API Key

### 使用 OpenAI 兼容 API

Startidy 可以对接任何实现了 OpenAI Chat Completions API 的服务
（`POST {baseUrl}/chat/completions`）。OpenAI 兼容是默认提供方
（不设置 `AI_PROVIDER` 时即为 `openai`），只需把 `OPENAI_BASE_URL` 指向你的提供方：

| 提供方            | `OPENAI_BASE_URL`                | `OPENAI_MODEL` 示例       |
| ----------------- | ---------------------------------- | --------------------------- |
| OpenAI            | `https://api.openai.com/v1`      | `gpt-4o-mini`             |
| DeepSeek          | `https://api.deepseek.com/v1`    | `deepseek-chat`           |
| OpenRouter        | `https://openrouter.ai/api/v1`   | `openai/gpt-4o-mini`      |
| Groq              | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |
| Ollama（本地）    | `http://localhost:11434/v1`      | `llama3.1`                |
| LM Studio（本地） | `http://localhost:1234/v1`       | `local-model`             |
| vLLM（本地）      | `http://localhost:8000/v1`       | 你部署的模型                |

本地服务通常会忽略 API Key，但 `OPENAI_API_KEY` 仍必须设置为非空值
（随便填一个字符串即可，例如 `ollama`）。

```bash
AI_PROVIDER=openai
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxx
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
```

说明：

- 默认以 JSON 模式请求（`OPENAI_RESPONSE_FORMAT=json_object`）。如果提供方不支持
  `response_format`，会自动去掉该参数重试，并对返回的原始文本做容错解析。
- 支持结构化输出的提供方可以设置 `OPENAI_RESPONSE_FORMAT=json_schema`，
  设为 `none` 则完全关闭 JSON 模式。
- 限流（`429`）和服务端（`5xx`）错误会按指数退避重试；如果响应里带
  `Retry-After`，会优先遵守。

## 使用方式

### 全自动（`run` 命令）

```bash
# 运行完整流程（规划 → 分类 → 写出 Markdown）
startidy run

# 直接带上凭据
startidy --token ghp_xxx --username myname --gemini-key AIza_xxx run

# 只处理新 Star 的仓库（保留已有的 Markdown 文件）
startidy run --only-new

# 模拟运行（只预览分类）
startidy run --dry-run

# 中断后重新运行同一条命令即可续传：已完成的批次会被自动跳过
startidy run
```

### 分步执行

#### 1. 规划分类（`plan`）

```bash
# 分析 Stars 并规划分类（会保存到文件）
startidy plan

# 查看已保存的分类方案
startidy plan --show

# 删除已保存的分类方案
startidy plan --delete
```

#### 2. 分类并写出 Markdown（`classify`）

```bash
# 对 Stars 分类并写出 Markdown 文件（使用已保存的方案）
startidy classify

# 只处理还没有出现在 Markdown 里的 Stars（保留已有文件）
startidy classify --only-new

# 直接以现有的 Markdown 文件作为分类（无需方案文件）
startidy classify --use-existing

# 把新 Star 的仓库并入已有分类
startidy classify --use-existing --only-new

# 重置：删除输出目录里由 Startidy 生成的全部内容
startidy classify --reset
```

#### 3. 输出结构

`classify` 会写入 `OUTPUT_DIR`（默认 `stars`）：

```
stars/
├── README.md                 # 索引：链接到每个分类的目录表
├── windows工具.md            # 每个分类一个 Markdown 文件
├── ai相关.md
└── 阅读-小说-epub-漫画.md
```

- 分类名与文件名完全一致：分层分隔符统一为 `-`，所以 `游戏-Minecraft` 写成 `游戏-Minecraft.md`。模型如果返回 `游戏/Minecraft`、`AI: 绘画` 这类写法，会被自动规整为 `游戏-Minecraft`、`AI-绘画`。
- 不保留空泛大类：如果方案里已经有 `游戏-Minecraft`、`游戏-CSGO` 这样的小类，`游戏` 这个大类会被丢掉，它的仓库会被拆进各个小类，而不是留在一个大桶里。
- **断点续传**：每批分类完成后都会写出一次 Markdown，并把进度记录到 `OUTPUT_DIR/.startidy-state.json`；中途中断后重新运行同一命令会自动从断点继续（不再重复询问是否覆盖），全部完成后该进度文件会被自动删除。想从头开始就运行 `startidy classify --reset`。
- 不会生成编程语言分类（`Lang: Python`、`Lang: Go` 等）：AI 会按用途和领域分组。如果模型仍然返回了这类分类，会在规划阶段被剔除并给出警告。
- 每个生成的文件都带有 HTML 注释标记，因此 `--reset` 和过期文件清理只会动 Startidy 自己生成的文件。
- 可以放心把 `OUTPUT_DIR` 指向你同时在手工维护的仓库 —— 没有标记的文件永远不会被修改或删除。

### 命令参数一览

| 命令         | 参数               | 说明                         |
| ------------ | ------------------ | ---------------------------- |
| `run`      | （无）             | 全自动执行                   |
| `run`      | `--only-new`     | 只处理新的 Stars             |
| `run`      | `--dry-run`      | 模拟运行                     |
| `plan`     | （无）             | 规划分类                     |
| `plan`     | `--show`         | 查看已保存的方案             |
| `plan`     | `--delete`       | 删除已保存的方案             |
| `classify` | （无）             | 分类 Stars 并写出 Markdown   |
| `classify` | `--only-new`     | 只处理未分类的（合并）       |
| `classify` | `--use-existing` | 以现有 Markdown 输出作为分类 |
| `classify` | `--reset`        | 删除生成的 Markdown 文件     |

### 手动工作流示例

```bash
# 1. 规划分类
startidy plan

# 2. 检查分类方案
startidy plan --show

# 3. 分类 Stars 并写出 Markdown 文件
startidy classify

# 4. 之后：追加新 Star 的仓库
startidy classify --only-new
```

## 分类智能体（embedding）

分类是一次性做出来的，批次之间不会互相参考，所以「一个分类悄悄变得太杂」或者「一批仓库被硬塞进某个分类」都不容易被发现。智能体就是补上这一环：**每批分类完成后看一次全局**，用向量相似度找出问题，再让 AI 确认。

一轮检查做两件事：

1. **发现「无处可归」**：把这一批仓库向量化，和每个分类的向量中心比较。注意比较的是这批仓库**进来之前**的分类中心——否则刚塞进去的仓库会把自己「认证」成合理成员。相似度低于 `AGENT_SIMILARITY_THRESHOLD` 的仓库会被聚成候选组，足够大（≥ `AGENT_MIN_NEW_MEMBERS`）就交给 AI 决定要不要建一个新分类。
2. **发现「该拆了」**：对成员足够多的分类（≥ `AGENT_MIN_SPLIT_MEMBERS × 2`）做一次二聚类，如果两簇内部很像、彼此不像（差距 ≥ `AGENT_SPLIT_GAP`），就交给 AI 决定要不要拆成 `大类-小类`，比如把 `游戏` 拆成 `游戏-Minecraft`、`游戏-CSGO`。

AI 确认后，受影响的仓库会被**重新排队**，用新分类再分一次；新的分类也会写进进度文件，所以中断续传时用的是最新的分类，而不是最初的方案。

一个实际例子：

```
🤖 split 「游戏」 into 「游戏-Minecraft」, 「游戏-CSGO」 (18 repositories) - members drifted into separate clusters
🔁 18 repositories queued for re-classification
```

### 需要什么

只需要一个 embedding 接口。默认跟随当前的 AI 提供方，直接复用 `OPENAI_BASE_URL` / `OPENAI_API_KEY`（或 `GEMINI_API_KEY`），所以接本地服务通常只要几行：

```env
# Ollama 本地 embedding
EMBEDDING_PROVIDER=openai
EMBEDDING_BASE_URL=http://localhost:11434/v1
EMBEDDING_API_KEY=ollama
EMBEDDING_MODEL=nomic-embed-text
```

```env
# OpenAI
EMBEDDING_MODEL=text-embedding-3-small
```

```env
# Gemini
EMBEDDING_PROVIDER=gemini
EMBEDDING_MODEL=text-embedding-004
```

**没有配置 embedding 时智能体会被自动跳过**，只打印一行提示，分类照常跑完——embedding 从来不是必须的。embedding 接口或模型临时报错也只影响当前这一批的检查，不会中断整个运行。

### 安全边界

- 只会创建或拆分类，**不会删除**分类；拆分类必须正好取代原来那一个
- 语言分类（`Lang-Python`、`Python` 之类）一律拒绝，和规划阶段同一条规则
- 新分类和拆分后的每个子分类都必须达到最少成员数，且不能与现有分类重名
- 每批最多生效 `AGENT_MAX_DECISIONS` 个决定；同一个仓库最多被重新排队 2 次，避免来回摇摆
- 智能体改过的分类集会随进度一起保存，续传时以它为准（比最初的方案更新）

## 运行示例

```
🚀 Starting GitHub Stars auto-organization.

✔ Fetched 523 starred repositories.
✔ 32 categories have been planned.

📂 Classifying 523 repositories in batches of 20...

── Batch 1/27 (1-20) ──
✔ README fetched
✔ Classification complete
  ✅ facebook/react → 框架-库
  ✅ tensorflow/tensorflow → ai相关
  ...

📊 Results:
  ✅ Classified: 520
  ❌ Failed: 3

✔ Markdown written (33 files)

📁 Output: stars
  - Categories: 32
  - Repositories: 520

✅ Done! Stars have been organized into Markdown categories.
```

## 项目结构

```
startidy/
├── package.json
├── tsconfig.json
├── .env.example            # 环境变量模板（英文注释）
├── .env.example.zh         # 环境变量模板（中文注释）
├── README.md               # 中文说明（本文件）
├── README-en.md            # 英文说明
├── README-ko.md            # 韩文说明
└── src/
    ├── index.ts              # CLI 入口
    ├── types.ts              # 类型定义
    ├── api/
    │   ├── index.ts          # API 导出
    │   ├── client.ts         # GitHub API 客户端
    │   ├── types.ts          # API 类型
    │   ├── repos.ts          # 仓库查询
    │   └── readme.ts         # README 获取
    ├── commands/
    │   ├── plan.ts           # plan 命令
    │   ├── classify.ts       # classify 命令（写出 Markdown）
    │   └── run.ts            # run 命令（全自动）
    ├── services/
    │   ├── index.ts          # services 导出
    │   ├── ai.ts             # AIService 接口 + 提供方工厂
    │   ├── gemini.ts         # Google Gemini 服务
    │   ├── openai.ts         # OpenAI 兼容服务
    │   ├── response-parser.ts # 共用的 JSON 响应解析/修复
    │   ├── markdown.ts       # Markdown 文件渲染 / 清理
    │   └── classifier.ts     # 分类服务
    ├── prompts/
    │   ├── category-planner.ts
    │   └── classifier.ts
    └── utils/
        ├── config.ts         # 环境配置
        ├── rate-limiter.ts   # 限流
        └── plan-storage.ts   # 方案保存/读取
```

## 环境变量参考

全部可用的环境变量：

```env
# 必填
GITHUB_TOKEN=ghp_xxxxxxxxxxxx        # GitHub Personal Access Token
GITHUB_USERNAME=your-username         # 你的 GitHub 用户名

# AI 提供方
AI_PROVIDER=openai                    # openai（默认）或 gemini
OPENAI_API_KEY=sk-xxxxxxxxxxxx        # OpenAI 兼容 API Key（AI_PROVIDER=openai）
OPENAI_BASE_URL=https://api.openai.com/v1  # OpenAI 兼容接口地址
OPENAI_MODEL=gpt-4o-mini              # OpenAI 兼容模型
OPENAI_RESPONSE_FORMAT=json_object    # json_object | json_schema | none
OPENAI_TIMEOUT_MS=120000              # 请求超时（毫秒）
GEMINI_API_KEY=AIzaxxxxxxxxxx         # Google Gemini API Key（AI_PROVIDER=gemini）
AI_RPM=15                             # 每分钟最多 AI 请求数（0=不限；两个提供方通用）

# 分类设置
MAX_CATEGORIES=32                     # 最大分类数
MAX_CATEGORIES_PER_REPO=3             # 每个仓库最多归入几个分类
MIN_CATEGORIES_PER_REPO=1             # 每个仓库至少归入几个分类

# 输出设置
OUTPUT_DIR=stars                      # Markdown 输出目录（默认：stars）

# 批处理
CLASSIFY_BATCH_SIZE=20                # 分类时每批处理的仓库数
BATCH_DELAY=2000                      # 批次之间的延迟（毫秒）

# 分类智能体（embedding）
AGENT_ENABLED=true                    # 是否让智能体盯住分类过程
EMBEDDING_PROVIDER=openai             # openai（默认）或 gemini
EMBEDDING_BASE_URL=https://api.openai.com/v1  # embedding 接口地址
EMBEDDING_API_KEY=sk-xxxxxxxxxxxx     # embedding 接口 Key
EMBEDDING_MODEL=text-embedding-3-small        # embedding 模型
AGENT_SIMILARITY_THRESHOLD=0.35       # 低于该相似度算「不属于任何分类」
AGENT_CLUSTER_SIMILARITY=0.72         # 把「无处可归」聚成候选分类所需相似度
AGENT_SPLIT_GAP=0.18                  # 拆分类所需的两簇差距
AGENT_MIN_SPLIT_MEMBERS=6             # 分类至少多少成员才考虑拆分
AGENT_MIN_NEW_MEMBERS=4               # 新分类/拆分后每个子分类至少多少成员
AGENT_MAX_DECISIONS=2                 # 每批最多生效几个决定

# 模型设置
GEMINI_MODEL=gemini-2.5-flash         # Gemini 模型
GEMINI_RPM=15                         # Gemini 每分钟请求数（免费额度）
AI_TEMPERATURE_PLANNING=0.7           # 规划分类的温度
AI_TEMPERATURE_CLASSIFY=0.3           # 分类的温度
AI_MAX_TOKENS_PLANNING=8192           # 规划的最大输出 token
AI_MAX_TOKENS_CLASSIFY=8192           # 分类的最大输出 token

# 调试
DEBUG=false                           # 开启调试输出
LOG_API_RESPONSES=false               # 打印原始 API 响应
```

> `GEMINI_TEMPERATURE_*` / `GEMINI_MAX_TOKENS_*` 仍可作为旧版别名使用；
> 两者同时存在时，通用的 `AI_*` 变量优先。

## 技术栈

- **运行时**：Node.js / [Bun](https://bun.sh/)
- **语言**：TypeScript
- **AI**：Google Gemini（gemini-2.5-flash）或任何 OpenAI 兼容的 Chat Completions API
- **CLI**：Commander.js、@inquirer/prompts、ora

## 已知限制

- AI 无法归类的仓库会单独写进 `无法分类.md`，并在索引中单独列出
- 分类智能体需要 embedding 接口，并且会额外产生 embedding 请求和少量 AI 请求；被判定受影响的仓库会再分一次，所以运行时间会比纯分类略长
- Gemini API 免费额度：每分钟 15 次请求（可用 `AI_RPM` 调整，对两个提供方都生效）
- OpenAI 兼容模型需要支持 JSON 输出，否则会退化为文本解析

## License

MIT
