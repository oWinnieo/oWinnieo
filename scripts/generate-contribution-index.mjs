import { readFile, writeFile } from "node:fs/promises";

const username = process.env.PROFILE_USERNAME || "oWinnieo";
const token = process.env.METRICS_TOKEN || process.env.GITHUB_TOKEN;
const weeksToShow = Number(process.env.CONTRIBUTION_WEEKS || 8);
const calendarWeeks = 53;
const apiRoot = "https://api.github.com";

const headers = {
  Accept: "application/vnd.github+json",
  "User-Agent": "owinnieo-contribution-metrics",
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

async function paged(path, maximumPages = 30) {
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

function startOfUtcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function startOfUtcWeek(date) {
  const result = startOfUtcDay(date);
  const day = result.getUTCDay();
  result.setUTCDate(result.getUTCDate() - (day === 0 ? 6 : day - 1));
  return result;
}

function startOfUtcSunday(date) {
  const result = startOfUtcDay(date);
  result.setUTCDate(result.getUTCDate() - result.getUTCDay());
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

function privateHeatpoint(count) {
  const symbols = ["·", "▫️", "▪️", "◼️", "⬛"];
  return symbols[contributionLevel(count)];
}

function shade(hex, factor) {
  const value = hex.replace("#", "");
  const channels = [0, 2, 4].map((offset) =>
    Math.round(Number.parseInt(value.slice(offset, offset + 2), 16) * factor)
      .toString(16)
      .padStart(2, "0"),
  );
  return `#${channels.join("")}`;
}

const messages = {
  zh: {
    heading: `#### 提交索引 · 最近 ${weeksToShow} 周`,
    note: "每个绿色方块代表该仓库当周由 @oWinnieo 创作、且可从默认分支追溯到的提交；颜色由浅到深表示提交数量。公开仓库方块可点击；私有仓库只显示 `private repo`，不暴露名称与链接。",
    repository: "仓库",
    private: "private repo",
    empty: `这 ${weeksToShow} 周暂无可索引的提交。`,
    commits: "次提交",
    updated: "自动更新",
  },
  en: {
    heading: `#### Commit index · last ${weeksToShow} weeks`,
    note: "Each green square represents commits authored by @oWinnieo in that repository during the week and reachable from its default branch; darker shades indicate more commits. Public squares are clickable, while private work is anonymized as `private repo` without a link.",
    repository: "Repository",
    private: "private repo",
    empty: `No indexable commits in the last ${weeksToShow} weeks.`,
    commits: "commits",
    updated: "auto-updated",
  },
  ja: {
    heading: `#### コミット索引 · 直近${weeksToShow}週間`,
    note: "各緑色のマスは、その週に @oWinnieo が作成し、既定ブランチから追跡できるコミットを表す。色が濃いほどコミット数が多い。公開リポジトリのマスはクリック可能で、非公開の活動はリンクなしの `private repo` として匿名化する。",
    repository: "リポジトリ",
    private: "private repo",
    empty: `直近${weeksToShow}週間に索引可能なコミットはありません。`,
    commits: "件のコミット",
    updated: "自動更新",
  },
};

const today = startOfUtcDay(new Date());
const calendarStart = startOfUtcSunday(today);
calendarStart.setUTCDate(calendarStart.getUTCDate() - (calendarWeeks - 1) * 7);
const calendarGridEnd = new Date(calendarStart);
calendarGridEnd.setUTCDate(calendarGridEnd.getUTCDate() + calendarWeeks * 7);

const thisWeek = startOfUtcWeek(today);
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
  let viewer = null;
  try {
    viewer = await github("/user", { allowMissing: true });
  } catch (error) {
    // The repository-scoped GITHUB_TOKEN cannot read /user. Public scanning
    // must still work; a user PAT in METRICS_TOKEN enables the private path.
    if (!String(error.message).includes("(403)")) throw error;
  }
  if (viewer?.login?.toLowerCase() === username.toLowerCase()) {
    accessibleRepositories = await paged(
      "/user/repos?affiliation=owner,collaborator,organization_member&sort=pushed",
    );
  }
}

const repositoryMap = new Map();
for (const repository of [...publicRepositories, ...accessibleRepositories]) {
  if (!repository.archived && new Date(repository.pushed_at) >= calendarStart) {
    repositoryMap.set(repository.full_name, repository);
  }
}

const repositoryRows = [];
const uniqueCalendarCommits = new Map();
for (const repository of repositoryMap.values()) {
  const commits = await paged(
    `/repos/${encodeURIComponent(repository.owner.login)}/${encodeURIComponent(repository.name)}/commits?author=${encodeURIComponent(username)}&since=${encodeURIComponent(calendarStart.toISOString())}&until=${encodeURIComponent(rangeEnd.toISOString())}`,
  );
  if (commits.length === 0) continue;

  const counts = Array.from({ length: weeksToShow }, () => 0);
  for (const commit of commits) {
    const timestamp = commit.commit?.author?.date || commit.commit?.committer?.date;
    if (!timestamp) continue;
    const authoredAt = new Date(timestamp);

    const week = Math.floor((authoredAt - rangeStart) / (7 * 24 * 60 * 60 * 1000));
    if (week >= 0 && week < counts.length) counts[week] += 1;

    if (authoredAt >= calendarStart && authoredAt < calendarGridEnd && !uniqueCalendarCommits.has(commit.sha)) {
      uniqueCalendarCommits.set(commit.sha, {
        date: iso(authoredAt),
        fork: Boolean(repository.fork),
      });
    }
  }
  if (counts.some(Boolean)) repositoryRows.push({ repository, counts });
}

repositoryRows.sort((left, right) => {
  const leftTotal = left.counts.reduce((sum, count) => sum + count, 0);
  const rightTotal = right.counts.reduce((sum, count) => sum + count, 0);
  return rightTotal - leftTotal;
});

function renderIndex(locale) {
  const copy = messages[locale];
  const publicRows = repositoryRows.filter(({ repository }) => !repository.private);
  const privateRows = repositoryRows.filter(({ repository }) => repository.private);
  const rows = [...publicRows];
  if (privateRows.length) {
    rows.push({
      repository: { full_name: copy.private, private: true },
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
      : `<a href="https://github.com/${escapeHtml(repository.full_name)}"><code>${escapeHtml(repository.full_name)}</code></a>`;
    const cells = counts.map((count, index) => {
      const weekStart = weekStarts[index];
      const weekEnd = new Date(weekStart);
      weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
      const title = `${iso(weekStart)} — ${iso(weekEnd)} · ${count} ${copy.commits}`;
      if (repository.private) {
        return `<td align="center"><span title="${escapeHtml(title)}">${privateHeatpoint(count)}</span></td>`;
      }
      if (!count) return `<td align="center"><span title="${escapeHtml(title)}">·</span></td>`;
      const image = `<img src="./assets/heatmap/level-${contributionLevel(count)}.svg" width="12" height="12" alt="${escapeHtml(title)}" title="${escapeHtml(title)}" />`;
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
    `<sub>${copy.updated}: ${iso(today)} UTC · 0 / 1 / 2–3 / 4–7 / 8+ commits</sub>`,
  ].join("\n");
}

function renderCalendar() {
  const colors = ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"];
  const dailyCounts = new Map();
  for (const { date } of uniqueCalendarCommits.values()) {
    dailyCounts.set(date, (dailyCounts.get(date) || 0) + 1);
  }

  const days = Array.from({ length: calendarWeeks * 7 }, (_, index) => {
    const date = new Date(calendarStart);
    date.setUTCDate(date.getUTCDate() + index);
    return {
      count: dailyCounts.get(iso(date)) || 0,
      date,
      day: index % 7,
      week: Math.floor(index / 7),
    };
  });

  const total = days.reduce((sum, day) => sum + day.count, 0);
  const activeDays = days.filter(({ count }) => count > 0).length;
  const max = Math.max(0, ...days.map(({ count }) => count));
  const cubes = days
    .sort((left, right) => (left.week + left.day) - (right.week + right.day) || left.week - right.week)
    .map(({ count, date, day, week }) => {
      const level = contributionLevel(count);
      const color = colors[level];
      const halfWidth = 7.35;
      const halfHeight = 3.45;
      const x = 54 + (week - day) * halfWidth;
      const y = 48 + (week + day) * halfHeight;
      const height = count ? Math.min(18, 2.5 + Math.log2(count + 1) * 3.1) : 0;
      const topY = y - height;
      const top = `${x},${topY} ${x + halfWidth},${topY + halfHeight} ${x},${topY + halfHeight * 2} ${x - halfWidth},${topY + halfHeight}`;
      const left = `${x - halfWidth},${topY + halfHeight} ${x},${topY + halfHeight * 2} ${x},${y + halfHeight * 2} ${x - halfWidth},${y + halfHeight}`;
      const right = `${x},${topY + halfHeight * 2} ${x + halfWidth},${topY + halfHeight} ${x + halfWidth},${y + halfHeight} ${x},${y + halfHeight * 2}`;
      const title = `${iso(date)} · ${count} commit${count === 1 ? "" : "s"}`;
      return [
        `<g><title>${escapeHtml(title)}</title>`,
        height ? `<polygon points="${left}" fill="${shade(color, 0.72)}" />` : "",
        height ? `<polygon points="${right}" fill="${shade(color, 0.52)}" />` : "",
        `<polygon points="${top}" fill="${color}" />`,
        "</g>",
      ].join("");
    }).join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="292" viewBox="0 0 480 292" role="img" aria-labelledby="title description">',
    '<title id="title">Yearly contribution terrain</title>',
    `<desc id="description">${total} commits across ${activeDays} active days, updated ${iso(today)} UTC.</desc>`,
    '<style>text{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;fill:#57606a}.heading{font-size:16px;font-weight:600}.summary{font-size:11px}</style>',
    '<text class="heading" x="18" y="24">Contributions calendar</text>',
    cubes,
    `<text class="summary" x="18" y="282">${total} commits · ${activeDays} active days · peak ${max}/day · updated ${iso(today)} UTC</text>`,
    "</svg>",
    "",
  ].join("\n");
}

const files = [
  ["README.md", "zh"],
  ["README.en.md", "en"],
  ["README.ja.md", "ja"],
];

for (const [filename, locale] of files) {
  const source = await readFile(filename, "utf8");
  const markers = /<!-- contribution-index:start -->[\s\S]*?<!-- contribution-index:end -->/;
  if (!markers.test(source)) throw new Error(`Contribution markers missing in ${filename}`);
  const output = source.replace(
    markers,
    `<!-- contribution-index:start -->\n${renderIndex(locale)}\n<!-- contribution-index:end -->`,
  );
  if (source !== output) await writeFile(filename, output, "utf8");
}

await writeFile("github-metrics-calendar.svg", renderCalendar(), "utf8");

const publicCount = repositoryRows.filter(({ repository }) => !repository.private).length;
const privateCount = repositoryRows.length - publicCount;
const forkCommitCount = [...uniqueCalendarCommits.values()].filter(({ fork }) => fork).length;
console.log(`Updated contribution index with ${publicCount} public rows and ${privateCount} masked private rows.`);
console.log(`Rendered ${uniqueCalendarCommits.size} unique yearly commits, including ${forkCommitCount} discovered in forks.`);
