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
- **Chinese, Loose Naming**: Short Chinese labels like `windows工具`, `好用软件` or `阅读/小说/epub/漫画` (`Major: Minor` is still allowed; 20 char limit)
- **No Language Categories**: Repositories are grouped by platform, use case or topic - the AI never creates `Lang: Python`-style categories
- **Step-by-Step or Full Automation**: Run individual steps or execute the entire workflow at once
- **Batch Processing**: Parallel processing of 20 repositories at a time for faster classification

## Category Examples

```
windows工具         Android好用软件     macOS工具
好用软件             框架/库             配置/脚本
shell相关            编辑器相关          浏览器相关
ai相关               游戏相关            音乐
阅读/小说/epub/漫画   obsidian/笔记软件   vps服务
运维                 一堆awesome         有用但不多
生活                 主题美化            电视
```

Categories are planned along four angles, mixed freely as your Stars require:

- **Platform / system**: `windows工具`, `Android好用软件`, `电视`
- **Use case / software type**: `好用软件`, `框架/库`, `配置/脚本`, `shell相关`, `编辑器相关`, `笔记软件`
- **Topic / domain**: `ai相关`, `游戏相关`, `音乐`, `阅读/小说/epub/漫画`, `vps服务`, `运维`
- **Personal / catch-all** (at most 1-2): `一堆awesome`, `有用但不多`, `生活`, `学习/大学生`

## Installation

### Global Install via npm (Recommended)

```bash
npm install -g startidy
```

After installation, you can use the `startidy` command directly:

```bash
startidy run
```

### From Source

```bash
# Clone the repository
git clone https://github.com/hellosunghyun/startidy.git
cd startidy

# Install dependencies
npm install

# Build
npm run build

# Link globally
npm link
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
export GEMINI_API_KEY=AIzaxxxxxxxxxxxxxxxxxxxxxxxx

# Windows (PowerShell)
$env:GITHUB_TOKEN="ghp_xxxxxxxxxxxxxxxxxxxx"
$env:GITHUB_USERNAME="your-username"
$env:GEMINI_API_KEY="AIzaxxxxxxxxxxxxxxxxxxxxxxxx"

# Windows (CMD)
set GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
set GITHUB_USERNAME=your-username
set GEMINI_API_KEY=AIzaxxxxxxxxxxxxxxxxxxxxxxxx

# Then run
startidy run
```

### Option 3: `.env` File (Recommended for repeated use)

Create a `.env` file in your current directory:

```env
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
GITHUB_USERNAME=your-username

# AI provider: gemini (default) or openai
AI_PROVIDER=openai

# Gemini (required when AI_PROVIDER=gemini)
GEMINI_API_KEY=AIzaxxxxxxxxxxxxxxxxxxxxxxxx

# OpenAI-compatible (required when AI_PROVIDER=openai)
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxx
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
```

### Global CLI Options

| Option | Description |
|--------|-------------|
| `--token <token>` | GitHub Personal Access Token |
| `--username <username>` | GitHub Username |
| `--ai-provider <provider>` | AI provider: `gemini` (default) or `openai` |
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
(`POST {baseUrl}/chat/completions`). Set `AI_PROVIDER=openai` and point
`OPENAI_BASE_URL` at your provider:

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

- Category file names are derived from category names: `"阅读/小说/epub/漫画"` → `阅读-小说-epub-漫画.md`.
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
├── .env.example
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
AI_PROVIDER=gemini                    # gemini (default) or openai
GEMINI_API_KEY=AIzaxxxxxxxxxx         # Google Gemini API Key (AI_PROVIDER=gemini)
OPENAI_API_KEY=sk-xxxxxxxxxxxx        # OpenAI-compatible API Key (AI_PROVIDER=openai)
OPENAI_BASE_URL=https://api.openai.com/v1  # OpenAI-compatible base URL
OPENAI_MODEL=gpt-4o-mini              # OpenAI-compatible model
OPENAI_RESPONSE_FORMAT=json_object    # json_object | json_schema | none
OPENAI_TIMEOUT_MS=120000              # Request timeout (ms)

# Category Settings
MAX_CATEGORIES=32                     # Maximum categories
CATEGORY_NAME_MAX_LENGTH=20           # Max category name length
MAX_CATEGORIES_PER_REPO=3             # Max categories per repo
MIN_CATEGORIES_PER_REPO=1             # Min categories per repo

# Output Settings
OUTPUT_DIR=stars                      # Markdown output directory (default: stars)

# Batch Processing
CLASSIFY_BATCH_SIZE=20                # Repos per batch for classification
BATCH_DELAY=2000                      # Delay between batches (ms)

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

- Category names are limited to 20 characters by default (`CATEGORY_NAME_MAX_LENGTH`)
- Category names are generated in Chinese by default (defined in the planner prompt)
- Gemini API Free tier: 15 requests per minute
- Repositories the AI cannot match are filed into the first planned category

## License

MIT
