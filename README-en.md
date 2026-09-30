# Startidy

English | [한국어](README-ko.md) | [中文](README.md)

> If you find this project useful, please consider giving it a star! Your support means a lot.

AI-powered CLI tool to automatically organize your GitHub Stars into Markdown categories.

It writes a browsable flat Markdown layout: an index `README.md` with a table of contents, plus one `<Category>.md` file per category - ready to commit to a "my stars" repository.

## Features

- **Pluggable AI Backend**: Works with Google Gemini or **any OpenAI-compatible API** (OpenAI, DeepSeek, OpenRouter, Groq, Ollama, vLLM, LM Studio, ...)
- **Markdown Output**: Writes `stars/README.md` (index) and one `stars/<Category>.md` per category
- **Automatic Category Planning**: The AI analyzes your starred repositories and creates up to 32 optimal categories
- **Smart Classification**: Analyzes each repository's title, description, and README to place them in appropriate categories
- **Chinese, Loose Naming**: Short Chinese labels like `windows工具`, `好用软件` or `阅读-小说-epub-漫画`; use `Major-Minor` for hierarchy (e.g. `游戏-Minecraft`)
- **No Language Categories**: Repositories are grouped by platform, use case or topic - the AI never creates `Lang: Python`-style categories
- **Step-by-Step or Full Automation**: Run individual steps or execute the entire workflow at once
- **Batch Processing**: Parallel processing of 20 repositories at a time for faster classification
- **Resumable Runs**: Every finished batch is written to disk with its progress; re-run the same command after an interruption and it continues where it stopped (the progress file is deleted on completion)
- **Taxonomy Agent**: After every batch it takes a second look at whether the classification still holds — it embeds that batch of repositories and compares them against each category's **previous** vector centroid, then lets the AI decide whether to add a new category for repositories that fit nowhere, or to split a large category whose members have drifted into two clusters into `Parent-Child` subcategories (e.g. `Game-Minecraft`); affected repositories are automatically re-queued and classified again under the new categories. Skipped automatically when embedding is not configured, without affecting the normal workflow

## Category Examples

```
windows工具           Android好用软件     macOS工具
好用软件              框架-库             配置-脚本
shell相关             编辑器相关          浏览器相关
ai相关                游戏-Minecraft      音乐
阅读-小说-epub-漫画   obsidian-笔记软件   vps服务
运维                  一堆awesome         有用但不多
生活                  主题美化            电视
```

Categories are planned along four angles, mixed freely as your Stars require:

- **Platform / system**: `windows工具`, `Android好用软件`, `电视`
- **Use case / software type**: `好用软件`, `框架-库`, `配置-脚本`, `shell相关`, `编辑器相关`, `笔记软件`
- **Topic / domain**: `ai相关`, `游戏-Minecraft`, `音乐`, `阅读-小说-epub-漫画`, `vps服务`, `运维`
- **Personal / catch-all** (at most 1-2): `一堆awesome`, `有用但不多`, `生活`, `学习-大学生`

## Installation

This repository is a fork and is **not published to npm** — run it from source.

```bash
# Clone this fork
git clone https://github.com/LIPiston/Startidy.git
cd Startidy

# Install dependencies
npm install

# Build
npm run build

# Link globally (optional): makes the `startidy` command available
npm link
```

Once linked you can call `startidy` directly; without linking, use `node dist/index.js` instead:

```bash
startidy run
# same as
node dist/index.js run
```

You can also run the TypeScript source directly with Bun (no build step):

```bash
npm run dev -- run
# same as
bun run src/index.ts run
```

## Configuration

You can configure Startidy in three ways:

### Option 1: CLI Arguments (Recommended for one-time use)

```bash
startidy --token ghp_xxx --username your-name --gemini-key AIza_xxx run

# Or with an OpenAI-compatible endpoint
startidy --token ghp_xxx --username your-name \
  --ai-provider openai --openai-key sk-xxx --openai-model gpt-4o-mini run
```

### Option 2: Environment Variables

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

# Then run
startidy run
```

### Option 3: `.env` File (Recommended for repeated use)

Create a `.env` file in your current directory:

```env
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
GITHUB_USERNAME=your-username

# AI provider: openai (default) or gemini
AI_PROVIDER=openai

# OpenAI-compatible (required when AI_PROVIDER=openai, the default provider)
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxx
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini

# Gemini (required when AI_PROVIDER=gemini)
# GEMINI_API_KEY=AIzaxxxxxxxxxxxxxxxxxxxxxxxx
```

The repository ships two copy-ready templates with a comment for every variable
(what it does, its accepted values and its default):

- `.env.example` — English comments
- `.env.example.zh` — Chinese comments, same content

```bash
cp .env.example .env        # or: cp .env.example.zh .env
```

### Global CLI Options

| Option | Description |
|--------|-------------|
| `--token <token>` | GitHub Personal Access Token |
| `--username <username>` | GitHub Username |
| `--ai-provider <provider>` | AI provider: `openai` (default) or `gemini` |
| `--gemini-key <key>` | Google Gemini API Key |
| `--openai-key <key>` | OpenAI-compatible API Key |
| `--openai-base-url <url>` | OpenAI-compatible base URL (default: `https://api.openai.com/v1`) |
| `--openai-model <model>` | OpenAI-compatible model (default: `gpt-4o-mini`) |
| `--ai-model <model>` | Model name for the selected provider |
| `--max-categories <n>` | Maximum categories (default: 32) |
| `--batch-size <n>` | Batch size for classification (default: 20) |
| `--output-dir <dir>` | Output directory for the Markdown files (default: `stars`) |
| `--debug` | Enable debug mode |

### Getting a GitHub Token

1. Go to [GitHub Settings > Developer settings > Personal access tokens](https://github.com/settings/tokens)
2. Click "Generate new token (classic)"
3. Select scopes: `repo`, `read:user`
4. Generate and copy the token

### Getting a Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Click "Create API Key"
3. Copy the API key

### Using an OpenAI-Compatible API

Startidy talks to any endpoint that implements the OpenAI Chat Completions API
(`POST {baseUrl}/chat/completions`). This is the default provider (used whenever
`AI_PROVIDER` is unset); just point `OPENAI_BASE_URL` at your provider:

| Provider | `OPENAI_BASE_URL` | Example `OPENAI_MODEL` |
|----------|-------------------|------------------------|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| OpenRouter | `https://openrouter.ai/api/v1` | `openai/gpt-4o-mini` |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |
| Ollama (local) | `http://localhost:11434/v1` | `llama3.1` |
| LM Studio (local) | `http://localhost:1234/v1` | `local-model` |
| vLLM (local) | `http://localhost:8000/v1` | your served model |

Local servers usually ignore the API key, but `OPENAI_API_KEY` must still be
set to a non-empty value (any string works, e.g. `ollama`).

```bash
AI_PROVIDER=openai
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxx
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
```

Notes:

- Responses are requested as JSON (`OPENAI_RESPONSE_FORMAT=json_object` by
  default). Providers that reject `response_format` are retried automatically
  without it, and the raw text is parsed defensively.
- Use `OPENAI_RESPONSE_FORMAT=json_schema` for strict structured output on
  providers that support it, or `none` to disable JSON mode entirely.
- Rate-limit (`429`) and server (`5xx`) errors are retried with exponential
  backoff, honoring `Retry-After` when present.

## Usage

### Full Automation (`run` command)

```bash
# Run the full workflow (plan → classify → write Markdown)
startidy run

# With inline credentials
startidy --token ghp_xxx --username myname --gemini-key AIza_xxx run

# Process only newly starred repositories (keep the existing Markdown files)
startidy run --only-new

# Simulation mode (preview categories only)
startidy run --dry-run

# After an interruption, just run the same command again:
# finished batches are skipped automatically
startidy run
```

### Step-by-Step Execution

#### 1. Plan Categories (`plan`)

```bash
# Analyze Stars and plan categories (saved to file)
startidy plan

# View saved plan
startidy plan --show

# Delete saved plan
startidy plan --delete
```

#### 2. Classify & Write Markdown (`classify`)

```bash
# Classify Stars and write the Markdown files (uses the saved plan)
startidy classify

# Process only Stars missing from the Markdown files (keeps existing files)
startidy classify --only-new

# Use the existing Markdown files as categories (no plan file needed)
startidy classify --use-existing

# Classify new Stars into the existing tree
startidy classify --use-existing --only-new

# Reset: delete everything Startidy generated in the output directory
startidy classify --reset
```

#### 3. Output Layout

`classify` writes to `OUTPUT_DIR` (default `stars`):

```
stars/
├── README.md                 # index: table of contents linking to every category
├── Data-Pipeline.md          # one Markdown file per category
├── AI-LLM & Chatbot.md
└── Web-Frontend.md
```

- Category names and file names are identical: the hierarchy separator is always `-`, so `游戏-Minecraft` becomes `游戏-Minecraft.md`. A model returning `游戏/Minecraft` or `AI: 绘画` has it normalized to `游戏-Minecraft` / `AI-绘画`.
- Empty umbrella categories are dropped: when a plan already contains subcategories like `游戏-Minecraft` and `游戏-CSGO`, the broad `游戏` category is removed and its repositories are filed into the subcategories instead.
- **Resumable runs**: every finished batch writes the Markdown output and records progress in `OUTPUT_DIR/.startidy-state.json`. Re-running the same command after an interruption resumes automatically (no overwrite prompt), and the progress file is deleted once the run completes. Use `startidy classify --reset` to start over.
- Programming-language categories (`Lang: Python`, `Lang: Go`, ...) are never planned: the AI groups repositories by purpose and domain instead. If a model returns one anyway, it is dropped from the plan with a warning.
- Every generated file carries an HTML comment marker, so `--reset` and stale-file cleanup only ever touch Startidy-generated files.
- Safe to point `OUTPUT_DIR` at a repository you also edit by hand - files without the marker are never modified or deleted.

### Command Options Summary

| Command | Option | Description |
|---------|--------|-------------|
| `run` | (none) | Full automation |
| `run` | `--only-new` | Process new Stars only |
| `run` | `--dry-run` | Simulation mode |
| `plan` | (none) | Plan categories |
| `plan` | `--show` | View saved plan |
| `plan` | `--delete` | Delete saved plan |
| `classify` | (none) | Classify Stars and write Markdown |
| `classify` | `--only-new` | Process unclassified only (merge) |
| `classify` | `--use-existing` | Use the existing Markdown output as categories |
| `classify` | `--reset` | Delete generated Markdown files |

### Manual Workflow Example

```bash
# 1. Plan categories
startidy plan

# 2. Review the plan
startidy plan --show

# 3. Classify Stars and write the Markdown files
startidy classify

# 4. Later: append newly starred repositories
startidy classify --only-new
```

## Taxonomy Agent (Embeddings)

Categories are planned in one shot and batches never reference each other, so it is easy to miss the fact that "a category has quietly become too broad" or that "a batch of repositories was forced into some category". The agent closes exactly that gap: **after every batch it takes one global look**, uses vector similarity to surface the problem, and lets the AI confirm it.

One review round does two things:

1. **Spot the "homeless"**: embed the repositories of this batch and compare them against each category's vector centroid. Note that the comparison uses the centroids from **before** this batch arrived — otherwise the repositories just filed in would "certify" themselves as legitimate members. Repositories whose similarity falls below `AGENT_SIMILARITY_THRESHOLD` are grouped into candidate clusters, and if a cluster is large enough (≥ `AGENT_MIN_NEW_MEMBERS`) the AI decides whether to create a new category for it.
2. **Spot the "should be split"**: for categories with enough members (≥ `AGENT_MIN_SPLIT_MEMBERS × 2`), run a two-way clustering; if the two clusters are internally similar and dissimilar to each other (gap ≥ `AGENT_SPLIT_GAP`), the AI decides whether to split the category into `Parent-Child` subcategories, e.g. splitting `游戏` into `游戏-Minecraft` and `游戏-CSGO`.

Once the AI confirms, the affected repositories are **re-queued** and classified again under the new categories; the new categories are also written to the progress file, so a resumed run uses the latest taxonomy instead of the original plan.

A real example:

```
🤖 split 「游戏」 into 「游戏-Minecraft」, 「游戏-CSGO」 (18 repositories) - members drifted into separate clusters
🔁 18 repositories queued for re-classification
```

### What It Needs

It only needs an embedding endpoint. By default it follows the current AI provider and reuses `OPENAI_BASE_URL` / `OPENAI_API_KEY` (or `GEMINI_API_KEY`), so pointing it at a local server is usually just a few lines:

```env
# Ollama local embeddings
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

**When embedding is not configured the agent is skipped automatically**, printing a single notice, and classification runs to completion as usual — embedding is never required. A transient error from the embedding endpoint or model only affects the current batch's review; it never aborts the whole run.

### Safety Boundaries

- It only creates or splits categories and **never deletes** one; a split must replace exactly the original category
- Language categories (`Lang-Python`, `Python` and the like) are always rejected, by the same rule as the planning stage
- A new category and every subcategory produced by a split must reach the minimum member count, and must not collide with an existing category name
- At most `AGENT_MAX_DECISIONS` decisions take effect per batch; the same repository can be re-queued at most twice, to avoid back-and-forth churn
- The agent's modified category set is saved with the progress, and a resumed run takes it as the source of truth (newer than the original plan)

## Execution Example

```
🚀 Starting GitHub Stars auto-organization.

✔ Fetched 523 starred repositories.
✔ 32 categories have been planned.

📂 Classifying 523 repositories in batches of 20...

── Batch 1/27 (1-20) ──
✔ README fetched
✔ Classification complete
  ✅ facebook/react → Web: Frontend
  ✅ tensorflow/tensorflow → AI: Data & ML
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

## Project Structure

```
startidy/
├── package.json
├── tsconfig.json
├── .env.example            # Environment template (English comments)
├── .env.example.zh         # Environment template (Chinese comments)
├── README.md               # Chinese documentation (default)
├── README-en.md            # English documentation (this file)
├── README-ko.md            # Korean documentation
└── src/
    ├── index.ts              # CLI entry point
    ├── types.ts              # Type definitions
    ├── api/
    │   ├── index.ts          # API exports
    │   ├── client.ts         # GitHub API client
    │   ├── types.ts          # API types
    │   ├── repos.ts          # Repository queries
    │   └── readme.ts         # README fetching
    ├── commands/
    │   ├── plan.ts           # plan command
    │   ├── classify.ts       # classify command (writes Markdown)
    │   └── run.ts            # run command (full automation)
    ├── services/
    │   ├── index.ts          # Services exports
    │   ├── ai.ts             # AIService interface + provider factory
    │   ├── gemini.ts         # Google Gemini service
    │   ├── openai.ts         # OpenAI-compatible service
    │   ├── response-parser.ts # Shared JSON response parsing/repair
    │   ├── markdown.ts       # Markdown file rendering / cleanup
    │   └── classifier.ts     # Classification service
    ├── prompts/
    │   ├── category-planner.ts
    │   └── classifier.ts
    └── utils/
        ├── config.ts         # Environment config
        ├── rate-limiter.ts   # Rate limiting
        └── plan-storage.ts   # Plan save/load
```

## Environment Variables Reference

All available environment variables:

```env
# Required
GITHUB_TOKEN=ghp_xxxxxxxxxxxx        # GitHub Personal Access Token
GITHUB_USERNAME=your-username         # Your GitHub username

# AI Provider
AI_PROVIDER=openai                    # openai (default) or gemini
OPENAI_API_KEY=sk-xxxxxxxxxxxx        # OpenAI-compatible API Key (AI_PROVIDER=openai)
OPENAI_BASE_URL=https://api.openai.com/v1  # OpenAI-compatible base URL
OPENAI_MODEL=gpt-4o-mini              # OpenAI-compatible model
OPENAI_RESPONSE_FORMAT=json_object    # json_object | json_schema | none
OPENAI_TIMEOUT_MS=120000              # Request timeout (ms)
GEMINI_API_KEY=AIzaxxxxxxxxxx         # Google Gemini API Key (AI_PROVIDER=gemini)
AI_RPM=15                             # Max AI requests per minute (0 = unlimited; both providers)

# Category Settings
MAX_CATEGORIES=32                     # Maximum categories
MAX_CATEGORIES_PER_REPO=3             # Max categories per repo
MIN_CATEGORIES_PER_REPO=1             # Min categories per repo

# Output Settings
OUTPUT_DIR=stars                      # Markdown output directory (default: stars)

# Batch Processing
CLASSIFY_BATCH_SIZE=20                # Repos per batch for classification
BATCH_DELAY=2000                      # Delay between batches (ms)

# Taxonomy Agent (Embeddings)
AGENT_ENABLED=true                    # let the agent supervise the classification run
EMBEDDING_PROVIDER=openai             # openai (default) or gemini
EMBEDDING_BASE_URL=https://api.openai.com/v1  # embedding endpoint
EMBEDDING_API_KEY=sk-xxxxxxxxxxxx     # embedding endpoint key
EMBEDDING_MODEL=text-embedding-3-small        # embedding model
AGENT_SIMILARITY_THRESHOLD=0.35       # below this similarity a repo fits no category
AGENT_CLUSTER_SIMILARITY=0.72         # similarity needed to group homeless repos
AGENT_SPLIT_GAP=0.18                  # cluster gap required to split a category
AGENT_MIN_SPLIT_MEMBERS=6             # members a category needs before a split is considered
AGENT_MIN_NEW_MEMBERS=4               # members each new or split category needs
AGENT_MAX_DECISIONS=2                 # decisions applied per batch

# Model Settings
GEMINI_MODEL=gemini-2.5-flash         # Gemini model
GEMINI_RPM=15                         # Gemini requests per minute (Free tier)
AI_TEMPERATURE_PLANNING=0.7           # Category planning temperature
AI_TEMPERATURE_CLASSIFY=0.3           # Classification temperature
AI_MAX_TOKENS_PLANNING=8192           # Planning max output tokens
AI_MAX_TOKENS_CLASSIFY=8192           # Classification max output tokens

# Debug
DEBUG=false                           # Enable debug output
LOG_API_RESPONSES=false               # Log raw API responses
```

> `GEMINI_TEMPERATURE_*` / `GEMINI_MAX_TOKENS_*` still work as legacy aliases;
> the generic `AI_*` variables win when both are set.

## Tech Stack

- **Runtime**: Node.js / [Bun](https://bun.sh/)
- **Language**: TypeScript
- **AI**: Google Gemini (gemini-2.5-flash) or any OpenAI-compatible Chat Completions API
- **CLI**: Commander.js, @inquirer/prompts, ora

## Limitations

- Repositories the AI cannot place are written to a separate `无法分类.md` (uncategorized) file and listed in the index
- The taxonomy agent needs an embedding endpoint and produces extra embedding requests plus a small number of AI requests; repositories judged to be affected are classified a second time, so a run takes slightly longer than plain classification
- Gemini API free tier: 15 requests per minute (tune with `AI_RPM`, which applies to both providers)
- OpenAI-compatible models should support JSON output; plain-text parsing is used as a fallback

## License

MIT
