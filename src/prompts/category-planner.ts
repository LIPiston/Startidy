import type { RepoSummary } from "../types";
import type { Config } from "../utils/config";

export function buildCategoryPlannerPrompt(
  repos: RepoSummary[],
  config: Config,
): string {
  const repoList = repos
    .map(
      (r) =>
        `- ${r.owner}/${r.name}: ${r.description || "No description"} [${r.language || "Unknown"}] (${r.stars} stars)`,
    )
    .join("\n");

  return `You are an expert at organizing GitHub Stars.
Below is a list of ${repos.length} starred repositories.

## Repository List:
${repoList}

## Requirements:
Plan **exactly ${config.maxCategories}** categories to effectively classify these repositories.

## Category Naming Rules (Important!):
- 用**中文**命名，简短、口语化，像给自己看的收藏夹名字（例如 "windows工具"、"好用软件"、"浏览器相关"）
- 单一主题用短名；包含多个相近主题时用 "/" 连接（例如 "阅读/小说/epub/漫画"、"obsidian/笔记软件"）
- 也可以使用 "大类: 小类" 分层写法（例如 "AI: 绘画"），但不要为了分层而强行分层
- **最多 ${config.categoryNameMaxLength} 个字符**（含空格、斜杠与冒号）
- 不要使用 emoji、序号或引号
- **绝不按编程语言分类**：不要出现 "Lang: Python"、"Language: Go"、"Python 相关"、"JS & TS" 这类以语言为划分依据的分类。仓库列表里的语言只是背景信息，不是分类维度

## Category Angle Examples (参考角度，按需组合):
- 平台/系统: windows工具、Android好用软件、macOS、电视、路由器/软路由
- 用途/软件类型: 好用软件、框架/库、配置/脚本、shell相关、主题美化、编辑器相关、浏览器相关、笔记软件
- 主题/领域: ai相关、游戏相关、音乐、阅读/小说/epub/漫画、vps服务、运维、网络代理、github相关
- 个人化/状态兜底（最多 1-2 个）: 一堆awesome、有用但不多、生活、学习/大学生
- 还有其他更贴合仓库内容的划分就自行发挥，不要生搬硬套上面的例子

## Category Planning Principles:
1. 让每个分类的仓库数量尽量均衡，避免出现只有一个仓库的分类
2. 分类之间不要重复或高度重叠
3. 覆盖所有仓库：实在无法归类的放进兜底分类（例如 "其他"、"有用但不多"）
4. 分类名要一眼看懂里面装的是什么，避免抽象的自造词
5. 如果仓库只是语言不同，按"它是做什么的"区分（例如 "配置/脚本" 而不是 "Lang: Go"）

Generate exactly ${config.maxCategories} categories. Each category name must be within ${config.categoryNameMaxLength} characters!`;
}
