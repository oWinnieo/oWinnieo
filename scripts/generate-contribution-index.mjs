import { readFile, writeFile } from "node:fs/promises";

const username = process.env.PROFILE_USERNAME || "oWinnieo";
const token = process.env.METRICS_TOKEN || process.env.GITHUB_TOKEN;
const weeksToShow = Number(process.env.CONTRIBUTION_WEEKS || 16);
const apiRoot = "https://api.github.com";

const headers = {
  Accept: "application/vnd.github+json",
  "User-Agent": "owinnieo-fork-aware-contribution-index",
  "X-GitHub-Api-Version": "2022-11-28",
};

if (token) headers.Authorization = `Bearer ${token}`;

async function github(path, { allowMissing = false } = {}) {
  const response = await fetch(apiRoot + path, { headers });
  if (allowMissing && [404, 409].includes(response.status)) return null;
  if (!response.ok) {
    throw new Error(`GitHub API request failed (${response.status})`);
  }
  return response.json();
}

async function paged(path, maximumPages = 10) {
  const separator = path.includes("?") ? "&" : "?";
  const output = [];
  for (let page = 1; page <= maximumPages; page += 1) {
    const batch = await github(`${path}${separator}per_page=100&page=${page}`, {
      allowMissing: true,
    });
    if (!batch) return output;
    output.push(...batch);
    if (batch.length < 100) break;
  }
  return output;
}

function startOfUtcWeek(date) {
  const result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = result.getUTCDay();
  result.setUTCDate(result.getUTCDate() - (day === 0 ? 6 : day - 1));
  return result;
}

function iso(date) {
  return date.toISOString().slice(0, 10);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function contributionLevel(count) {
  if (count === 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  if (count <= 7) return 3;
  return 4;
}

const messages = {
  zh: {
    heading: "#### Fork-aware 提交索引 · 最近 16 周",
    note: "每个亮起的方块代表该仓库当周由 @oWinnieo 创作、且可从默认分支追溯到的提交。公开仓库方块可点击；私有仓库只显示 `private repo`，不暴露名称与链接。带 `fork` 标记的行会被完整计入。",
    repository: "仓库",
    fork: "fork",
    private: "private repo",
    empty: "这 16 周暂无可索引的提交。",
    commits: "次提交",
    updated: "自动更新",
  },
  en: {
    heading: "#### Fork-aware commit index · last 16 weeks",
    note: "Each lit square represents commits authored by @oWinnieo in that repository during the week and reachable from its default branch. Public squares are clickable; private work is anonymized as `private repo` without a link. Rows marked `fork` are included in full.",
    repository: "Repository",
    fork: "fork",
    private: "private repo",
    empty: "No indexable commits in the last 16 weeks.",
    commits: "commits",
    updated: "auto-updated",
  },
  ja: {
    heading: "#### Fork対応コミット索引 · 直近16週間",
    note: "点灯した各マスは、その週に @oWinnieo が作成し、既定ブランチから追跡できるコミットを表す。公開リポジトリのマスはクリック可能。非公開の活動はリンクなしの `private repo` として匿名化する。`fork` 行もすべて集計対象。",
    repository: "リポジトリ",
    fork: "fork",
    private: "private repo",
    empty: "直近16週間に索引可能なコミットはありません。",
    commits: "件のコミット",
    updated: "自動更新",
  },
};

const thisWeek = startOfUtcWeek(new Date());
const rangeEnd = new Date(thisWeek);
rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 7);
const rangeStart = new Date(rangeEnd);
rangeStart.setUTCDate(rangeStart.getUTCDate() - weeksToShow * 7);
const weekStarts = Array.from({ length: weeksToShow }, (_, index) => {
  const date = new Date(rangeStart);
  date.setUTCDate(date.getUTCDate() + index * 7);
  return date;
});

const publicRepositories = await paged(
  `/users/${encodeURIComponent(username)}/repos?type=owner&sort=pushed`,
);

let accessibleRepositories = [];
if (token) {
  const viewer = await github("/user", { allowMissing: true });
  if (viewer?.login?.toLowerCase() === username.toLowerCase()) {
    accessibleRepositories = await paged(
      "/user/repos?affiliation=owner,collaborator,organization_member&sort=pushed",
    );
  }
}

const repositoryMap = new Map();
for (const repository of [...publicRepositories, ...accessibleRepositories]) {
  if (!repository.archived && new Date(repository.pushed_at) >= rangeStart) {
    repositoryMap.set(repository.full_name, repository);
  }
}

const repositoryRows = [];
for (const repository of repositoryMap.values()) {
  const commits = await paged(
    `/repos/${encodeURIComponent(repository.owner.login)}/${encodeURIComponent(repository.name)}/commits?author=${encodeURIComponent(username)}&since=${encodeURIComponent(rangeStart.toISOString())}&until=${encodeURIComponent(rangeEnd.toISOString())}`,
  );
  if (commits.length === 0) continue;

  const counts = Array.from({ length: weeksToShow }, () => 0);
  for (const commit of commits) {
    const timestamp = commit.commit?.author?.date || commit.commit?.committer?.date;
    if (!timestamp) continue;
    const week = Math.floor((new Date(timestamp) - rangeStart) / (7 * 24 * 60 * 60 * 1000));
    if (week >= 0 && week < counts.length) counts[week] += 1;
  }
  if (counts.some(Boolean)) repositoryRows.push({ repository, counts });
}

repositoryRows.sort((left, right) => {
  const leftTotal = left.counts.reduce((sum, count) => sum + count, 0);
  const rightTotal = right.counts.reduce((sum, count) => sum + count, 0);
  return rightTotal - leftTotal;
});

function render(locale) {
  const copy = messages[locale];
  const publicRows = repositoryRows.filter(({ repository }) => !repository.private);
  const privateRows = repositoryRows.filter(({ repository }) => repository.private);
  const rows = [...publicRows];
  if (privateRows.length) {
    rows.push({
      repository: { full_name: copy.private, private: true, fork: false },
      counts: weekStarts.map((_, index) =>
        privateRows.reduce((sum, row) => sum + row.counts[index], 0),
      ),
    });
  }

  const headerCells = weekStarts.map((week) => {
    const label = `${week.getUTCMonth() + 1}/${week.getUTCDate()}`;
    return `<th align="center"><sub>${label}</sub></th>`;
  }).join("");

  const bodyRows = rows.map(({ repository, counts }) => {
    const label = repository.private
      ? `<code>${copy.private}</code>`
      : `<a href="https://github.com/${escapeHtml(repository.full_name)}"><code>${escapeHtml(repository.full_name)}</code></a>${repository.fork ? ` <sub>${copy.fork}</sub>` : ""}`;
    const cells = counts.map((count, index) => {
      const weekStart = weekStarts[index];
      const weekEnd = new Date(weekStart);
      weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
      const title = `${iso(weekStart)} — ${iso(weekEnd)} · ${count} ${copy.commits}`;
      const image = `<img src="./assets/heatmap/level-${contributionLevel(count)}.svg" width="12" height="12" alt="${escapeHtml(title)}" title="${escapeHtml(title)}" />`;
      if (!count || repository.private) return `<td align="center">${image}</td>`;
      const branch = repository.default_branch || "main";
      const href = `https://github.com/${repository.full_name}/commits/${encodeURIComponent(branch)}?author=${encodeURIComponent(username)}&since=${iso(weekStart)}&until=${iso(weekEnd)}`;
      return `<td align="center"><a href="${escapeHtml(href)}">${image}</a></td>`;
    }).join("");
    return `<tr><td>${label}</td>${cells}</tr>`;
  }).join("\n");

  const table = rows.length
    ? `<table>\n<thead><tr><th align="left">${copy.repository}</th>${headerCells}</tr></thead>\n<tbody>\n${bodyRows}\n</tbody>\n</table>`
    : `_${copy.empty}_`;

  return [
    copy.heading,
    "",
    copy.note,
    "",
    table,
    "",
    `<sub>${copy.updated}: ${new Date().toISOString().slice(0, 10)} UTC · 0 / 1 / 2–3 / 4–7 / 8+ commits</sub>`,
  ].join("\n");
}

const files = [
  ["README.md", "zh"],
  ["README.en.md", "en"],
  ["README.ja.md", "ja"],
];

for (const [filename, locale] of files) {
  const source = await readFile(filename, "utf8");
  const output = source.replace(
    /<!-- contribution-index:start -->[\s\S]*?<!-- contribution-index:end -->/,
    `<!-- contribution-index:start -->\n${render(locale)}\n<!-- contribution-index:end -->`,
  );
  if (source === output) throw new Error(`Contribution markers missing in ${filename}`);
  await writeFile(filename, output, "utf8");
}

const publicCount = repositoryRows.filter(({ repository }) => !repository.private).length;
const privateCount = repositoryRows.length - publicCount;
console.log(`Updated contribution index with ${publicCount} public rows and ${privateCount} masked private rows.`);
