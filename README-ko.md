# Startidy

[English](README-en.md) | 한국어 | [中文](README.md)

> 이 프로젝트가 유용하셨다면 스타를 눌러주세요! 큰 힘이 됩니다.

AI 기반 CLI 도구로 GitHub Stars를 자동으로 Markdown 카테고리로 정리합니다.

탐색 가능한 평면 Markdown 구조를 생성합니다: 목차가 담긴 인덱스 `README.md` 와 카테고리별 `<Category>.md` 파일 - "내 Stars" 저장소에 그대로 커밋할 수 있습니다.

## 주요 기능

- **교체 가능한 AI 백엔드**: Google Gemini 또는 **모든 OpenAI 호환 API** 사용 가능 (OpenAI, DeepSeek, OpenRouter, Groq, Ollama, vLLM, LM Studio 등)
- **Markdown 출력**: `stars/README.md` (인덱스) 와 카테고리별 `stars/<Category>.md` 생성
- **자동 카테고리 계획**: AI가 Star한 저장소를 분석하여 최적의 카테고리(최대 32개) 생성
- **스마트 분류**: 각 저장소의 제목, 설명, README를 분석하여 적절한 카테고리에 배치
- **중국어 · 자유 형식 네이밍**: `windows工具`, `好用软件`, `阅读/小说/epub/漫画` 처럼 짧은 중국어 이름 사용 (`Major: Minor` 형식도 가능, 최대 20자)
- **언어 카테고리 없음**: 플랫폼/용도/주제 기준으로 분류하며 `Lang: Python` 형태의 언어 카테고리는 만들지 않음
- **단계별 또는 자동화 실행**: 개별 단계 실행 또는 전체 워크플로우 한 번에 실행
- **배치 처리**: 한 번에 20개 저장소를 병렬 처리하여 빠른 분류

## 카테고리 예시

```
windows工具         Android好用软件     macOS工具
好用软件             框架/库             配置/脚本
shell相关            编辑器相关          浏览器相关
ai相关               游戏相关            音乐
阅读/小说/epub/漫画   obsidian/笔记软件   vps服务
运维                 一堆awesome         有用但不多
生活                 主题美化            电视
```

카테고리는 다음 네 가지 관점을 자유롭게 조합해 계획됩니다 (카테고리 이름은 중국어로 생성됩니다):

- **플랫폼/시스템**: `windows工具`, `Android好用软件`, `电视`
- **용도/소프트웨어 유형**: `好用软件`, `框架/库`, `配置/脚本`, `shell相关`, `编辑器相关`, `笔记软件`
- **주제/도메인**: `ai相关`, `游戏相关`, `音乐`, `阅读/小说/epub/漫画`, `vps服务`, `运维`
- **개인/기타 (최대 1-2개)**: `一堆awesome`, `有用但不多`, `生活`, `学习/大学生`

## 설치

이 저장소는 fork 버전이며 **npm에 배포하지 않습니다** — 소스에서 직접 실행합니다.

```bash
# 이 fork 저장소 클론
git clone https://github.com/LIPiston/Startidy.git
cd Startidy

# 의존성 설치
npm install

# 빌드
npm run build

# 전역 링크 (선택): startidy 명령어를 바로 사용할 수 있습니다
npm link
```

링크하면 `startidy` 를 바로 쓸 수 있고, 링크하지 않으면 `node dist/index.js` 로 대체하면 됩니다:

```bash
startidy run
# 같은 명령
node dist/index.js run
```

Bun으로 빌드 없이 소스를 바로 실행할 수도 있습니다:

```bash
npm run dev -- run
# 같은 명령
bun run src/index.ts run
```

## 설정

Startidy는 세 가지 방법으로 설정할 수 있습니다:

### 방법 1: CLI 인수 (일회성 사용에 권장)

```bash
startidy --token ghp_xxx --username your-name --gemini-key AIza_xxx run

# OpenAI 호환 엔드포인트 사용
startidy --token ghp_xxx --username your-name \
  --ai-provider openai --openai-key sk-xxx --openai-model gpt-4o-mini run
```

### 방법 2: 환경 변수

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

# 실행
startidy run
```

### 방법 3: `.env` 파일 (반복 사용에 권장)

현재 디렉토리에 `.env` 파일을 생성합니다:

```env
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
GITHUB_USERNAME=your-username

# AI 제공자: openai (기본값) 또는 gemini
AI_PROVIDER=openai

# OpenAI 호환 (AI_PROVIDER=openai 일 때 필수, 기본 제공자)
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxx
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini

# Gemini (AI_PROVIDER=gemini 일 때 필수)
# GEMINI_API_KEY=AIzaxxxxxxxxxxxxxxxxxxxxxxxx
```

저장소에는 모든 변수의 용도·허용값·기본값을 주석으로 설명한 복사용 템플릿 두 개가 있습니다:

- `.env.example` — 영어 주석
- `.env.example.zh` — 중국어 주석 (내용 동일)

```bash
cp .env.example .env        # 또는: cp .env.example.zh .env
```

### 전역 CLI 옵션

| 옵션 | 설명 |
|------|------|
| `--token <token>` | GitHub Personal Access Token |
| `--username <username>` | GitHub 사용자명 |
| `--ai-provider <provider>` | AI 제공자: `openai` (기본값) 또는 `gemini` |
| `--gemini-key <key>` | Google Gemini API 키 |
| `--openai-key <key>` | OpenAI 호환 API 키 |
| `--openai-base-url <url>` | OpenAI 호환 Base URL (기본값: `https://api.openai.com/v1`) |
| `--openai-model <model>` | OpenAI 호환 모델 (기본값: `gpt-4o-mini`) |
| `--ai-model <model>` | 선택한 제공자의 모델명 |
| `--max-categories <n>` | 최대 카테고리 수 (기본값: 32) |
| `--batch-size <n>` | 분류 배치 크기 (기본값: 20) |
| `--output-dir <dir>` | Markdown 파일 출력 디렉터리 (기본값: `stars`) |
| `--debug` | 디버그 모드 활성화 |

### GitHub Token 발급

1. [GitHub Settings > Developer settings > Personal access tokens](https://github.com/settings/tokens) 이동
2. "Generate new token (classic)" 클릭
3. 스코프 선택: `repo`, `read:user`
4. 토큰 생성 및 복사

### Gemini API 키 발급

1. [Google AI Studio](https://aistudio.google.com/app/apikey) 이동
2. "API 키 만들기" 클릭
3. API 키 복사

### OpenAI 호환 API 사용

Startidy는 OpenAI Chat Completions API(`POST {baseUrl}/chat/completions`)를
구현한 모든 엔드포인트와 동작합니다. 이것이 기본 제공자이며(`AI_PROVIDER` 를
설정하지 않으면 openai), `OPENAI_BASE_URL` 만 사용할 제공자에 맞게 지정하면 됩니다.

| 제공자 | `OPENAI_BASE_URL` | `OPENAI_MODEL` 예시 |
|--------|-------------------|----------------------|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| OpenRouter | `https://openrouter.ai/api/v1` | `openai/gpt-4o-mini` |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |
| Ollama (로컬) | `http://localhost:11434/v1` | `llama3.1` |
| LM Studio (로컬) | `http://localhost:1234/v1` | `local-model` |
| vLLM (로컬) | `http://localhost:8000/v1` | 서빙 중인 모델 |

로컬 서버는 보통 API 키를 검사하지 않지만, `OPENAI_API_KEY` 는 비어 있으면
안 되므로 아무 문자열(예: `ollama`)이나 넣으면 됩니다.

```bash
AI_PROVIDER=openai
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxx
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
```

참고:

- 기본적으로 JSON 응답(`OPENAI_RESPONSE_FORMAT=json_object`)을 요청합니다.
  `response_format` 을 지원하지 않는 서버는 자동으로 해당 옵션 없이 재시도하며,
  응답 텍스트는 관대하게 파싱됩니다.
- `OPENAI_RESPONSE_FORMAT=json_schema` 는 구조화 출력을 지원하는 제공자에서
  엄격한 스키마 검증을 사용합니다. `none` 은 JSON 모드를 끕니다.
- `429` 및 `5xx` 오류는 `Retry-After` 를 존중하며 지수 백오프로 재시도합니다.

## 사용법

### 전체 자동화 (`run` 명령)

```bash
# 전체 워크플로우 실행 (계획 → 분류 → Markdown 작성)
startidy run

# 인라인 인증 정보 사용
startidy --token ghp_xxx --username myname --gemini-key AIza_xxx run

# 새로 Star한 저장소만 처리 (기존 Markdown 파일 유지)
startidy run --only-new

# 시뮬레이션 모드 (카테고리 계획만 미리보기)
startidy run --dry-run
```

### 단계별 실행

#### 1. 카테고리 계획 (`plan`)

```bash
# Stars 분석 및 카테고리 계획 (파일에 저장)
startidy plan

# 저장된 계획 보기
startidy plan --show

# 저장된 계획 삭제
startidy plan --delete
```

#### 2. 분류 및 Markdown 작성 (`classify`)

```bash
# Stars를 분류하고 Markdown 파일 작성 (저장된 계획 사용)
startidy classify

# Markdown 파일에 없는 Stars만 처리 (기존 파일 유지)
startidy classify --only-new

# 기존 Markdown 파일을 카테고리로 사용 (계획 파일 불필요)
startidy classify --use-existing

# 기존 트리에 새 Stars만 분류
startidy classify --use-existing --only-new

# 초기화: 출력 디렉터리에서 Startidy가 생성한 파일 삭제
startidy classify --reset
```

#### 3. 출력 구조

`classify` 는 `OUTPUT_DIR` (기본값 `stars`) 에 다음과 같이 작성합니다:

```
stars/
├── README.md                 # 인덱스: 모든 카테고리로 연결되는 목차
├── Data-Pipeline.md          # 카테고리별 Markdown 파일
├── AI-LLM & Chatbot.md
└── Web-Frontend.md
```

- 카테고리 파일명은 카테고리 이름에서 만들어집니다: `"阅读/小说/epub/漫画"` → `阅读-小说-epub-漫画.md`
- 프로그래밍 언어 카테고리 (`Lang: Python`, `Lang: Go` 등) 는 계획 단계에서 생성되지 않습니다: 목적과 도메인 기준으로 분류합니다. 모델이 반환하더라도 경고와 함께 계획에서 제거됩니다
- 생성된 모든 파일에는 HTML 주석 마커가 있어서 `--reset` 과 오래된 파일 정리가 Startidy가 만든 파일만 건드립니다
- 직접 편집하는 저장소를 `OUTPUT_DIR` 로 지정해도 안전합니다 - 마커가 없는 파일은 절대 수정/삭제되지 않습니다

### 명령 옵션 요약

| 명령 | 옵션 | 설명 |
|------|------|------|
| `run` | (없음) | 전체 자동화 |
| `run` | `--only-new` | 새 Stars만 처리 |
| `run` | `--dry-run` | 시뮬레이션 모드 |
| `plan` | (없음) | 카테고리 계획 |
| `plan` | `--show` | 저장된 계획 보기 |
| `plan` | `--delete` | 저장된 계획 삭제 |
| `classify` | (없음) | Stars 분류 및 Markdown 작성 |
| `classify` | `--only-new` | 미분류만 처리 (기존 출력에 병합) |
| `classify` | `--use-existing` | 기존 Markdown 출력을 카테고리로 사용 |
| `classify` | `--reset` | 생성된 Markdown 파일 삭제 |

### 수동 워크플로우 예시

```bash
# 1. 카테고리 계획
startidy plan

# 2. 계획 검토
startidy plan --show

# 3. Stars 분류 및 Markdown 파일 작성
startidy classify

# 4. 이후: 새로 Star한 저장소 추가
startidy classify --only-new
```

## 실행 예시

```
🚀 Starting GitHub Stars auto-organization.

✔ Fetched 523 starred repositories.
✔ 32 categories have been planned.

📊 Results:
  ✅ Classified: 520
  ❌ Failed: 3

✔ Markdown written (33 files)

📁 Output: stars
  - Categories: 32
  - Repositories: 520

✅ Done! Stars have been organized into Markdown categories.
```

## 프로젝트 구조

```
startidy/
├── package.json
├── tsconfig.json
├── .env.example            # 환경 변수 템플릿 (영어 주석)
├── .env.example.zh         # 환경 변수 템플릿 (중국어 주석)
├── README.md               # 중국어 설명 (기본)
├── README-en.md            # 영어 설명
├── README-ko.md            # 한국어 설명 (이 파일)
└── src/
    ├── index.ts              # CLI 진입점
    ├── types.ts              # 타입 정의
    ├── api/
    │   ├── index.ts          # API exports
    │   ├── client.ts         # GitHub API 클라이언트
    │   ├── types.ts          # API 타입
    │   ├── repos.ts          # 저장소 쿼리
    │   └── readme.ts         # README 조회
    ├── commands/
    │   ├── plan.ts           # plan 명령
    │   ├── classify.ts       # classify 명령 (Markdown 작성)
    │   └── run.ts            # run 명령 (전체 자동화)
    ├── services/
    │   ├── index.ts          # Services exports
    │   ├── ai.ts             # AIService 인터페이스 + 제공자 팩토리
    │   ├── gemini.ts         # Google Gemini 서비스
    │   ├── openai.ts         # OpenAI 호환 서비스
    │   ├── response-parser.ts # 공통 JSON 응답 파싱/복구
    │   ├── markdown.ts       # Markdown 파일 렌더링 / 정리
    │   └── classifier.ts     # 분류 서비스
    ├── prompts/
    │   ├── category-planner.ts
    │   └── classifier.ts
    └── utils/
        ├── config.ts         # 환경 설정
        ├── rate-limiter.ts   # Rate limiting
        └── plan-storage.ts   # 계획 저장/로드
```

## 환경 변수 참조

사용 가능한 모든 환경 변수:

```env
# 필수
GITHUB_TOKEN=ghp_xxxxxxxxxxxx        # GitHub Personal Access Token
GITHUB_USERNAME=your-username         # GitHub 사용자명

# AI 제공자
AI_PROVIDER=openai                    # openai (기본값) 또는 gemini
OPENAI_API_KEY=sk-xxxxxxxxxxxx        # OpenAI 호환 API 키 (AI_PROVIDER=openai)
OPENAI_BASE_URL=https://api.openai.com/v1  # OpenAI 호환 Base URL
OPENAI_MODEL=gpt-4o-mini              # OpenAI 호환 모델
OPENAI_RESPONSE_FORMAT=json_object    # json_object | json_schema | none
OPENAI_TIMEOUT_MS=120000              # 요청 타임아웃 (ms)
GEMINI_API_KEY=AIzaxxxxxxxxxx         # Google Gemini API 키 (AI_PROVIDER=gemini)
AI_RPM=15                             # 분당 최대 AI 요청 수 (0=무제한, 두 제공자 공통)

# 카테고리 설정
MAX_CATEGORIES=32                     # 최대 카테고리 수
MAX_CATEGORIES_PER_REPO=3             # 저장소당 최대 카테고리 수
MIN_CATEGORIES_PER_REPO=1             # 저장소당 최소 카테고리 수

# 출력 설정
OUTPUT_DIR=stars                      # Markdown 출력 디렉터리 (기본값: stars)

# 배치 처리
CLASSIFY_BATCH_SIZE=20                # 분류당 배치 저장소 수
BATCH_DELAY=2000                      # 배치 간 딜레이 (ms)

# 모델 설정
GEMINI_MODEL=gemini-2.5-flash         # Gemini 모델
GEMINI_RPM=15                         # 분당 요청 수 (무료 티어)
AI_TEMPERATURE_PLANNING=0.7           # 카테고리 기획 temperature
AI_TEMPERATURE_CLASSIFY=0.3           # 분류 temperature
AI_MAX_TOKENS_PLANNING=8192           # 기획 최대 출력 토큰
AI_MAX_TOKENS_CLASSIFY=8192           # 분류 최대 출력 토큰

# 디버그
DEBUG=false                           # 디버그 출력 활성화
LOG_API_RESPONSES=false               # 원시 API 응답 로깅
```

> `GEMINI_TEMPERATURE_*` / `GEMINI_MAX_TOKENS_*` 는 레거시 별칭으로 계속
> 동작합니다. 두 값이 모두 있으면 `AI_*` 변수가 우선합니다.

## 기술 스택

- **런타임**: Node.js / [Bun](https://bun.sh/)
- **언어**: TypeScript
- **AI**: Google Gemini (gemini-2.5-flash) 또는 모든 OpenAI 호환 Chat Completions API
- **CLI**: Commander.js, @inquirer/prompts, ora

## 제한 사항

- AI가 분류하지 못한 저장소는 별도의 `无法分类.md`(미분류) 파일로 기록되고 인덱스에 표시됩니다
- Gemini API 무료 티어: 분당 15 요청 (`AI_RPM` 으로 조정 가능하며 두 제공자 모두에 적용됩니다)
- OpenAI 호환 모델은 JSON 출력을 지원해야 원활하게 동작 (미지원 시 텍스트 파싱 폴백)

## 라이선스

MIT
