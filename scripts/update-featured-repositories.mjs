import { readFile, writeFile } from "node:fs/promises";

const filename = process.env.METRICS_SVG || "github-metrics.svg";
const token = process.env.METRICS_TOKEN || process.env.GITHUB_TOKEN;
const apiRoot = "https://api.github.com";

const headers = {
  Accept: "application/vnd.github+json",
  "User-Agent": "owinnieo-featured-repository-updates",
  "X-GitHub-Api-Version": "2022-11-28",
};

if (token) headers.Authorization = `Bearer ${token}`;

function plural(value, unit) {
  return `${value} ${unit}${value === 1 ? "" : "s"} ago`;
}

function relativeAge(timestamp, now = Date.now()) {
  const seconds = Math.max(0, Math.floor((now - new Date(timestamp).getTime()) / 1000));
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return plural(minutes, "minute");

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return plural(hours, "hour");

  const days = Math.floor(hours / 24);
  if (days < 30) return plural(days, "day");

  const months = Math.floor(days / 30);
  if (days < 365) return plural(months, "month");

  return plural(Math.floor(days / 365), "year");
}

async function repository(fullName) {
  const [owner, name] = fullName.split("/");
  const response = await fetch(
    `${apiRoot}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
    { headers },
  );
  if (!response.ok) {
    throw new Error(`GitHub API request failed for ${fullName} (${response.status})`);
  }
  return response.json();
}

const source = await readFile(filename, "utf8");
const timestampPattern = /(<span>([^<]+\/[A-Za-z0-9._-]+)<\/span>\s*<span>)(?:created|updated) [^<]*(<\/span>)/g;
const names = [...new Set(
  [...source.matchAll(timestampPattern)].map((match) => match[2]),
)];

if (!names.length) {
  throw new Error(`No featured repository timestamps found in ${filename}`);
}

const updates = new Map(await Promise.all(names.map(async (fullName) => {
  const data = await repository(fullName);
  const timestamp = data.pushed_at || data.updated_at || data.created_at;
  return [fullName, `updated ${relativeAge(timestamp)}`];
})));

const output = source.replace(
  timestampPattern,
  (match, prefix, fullName, suffix) => `${prefix}${updates.get(fullName)}${suffix}`,
);

await writeFile(filename, output, "utf8");
console.log(`Updated ${updates.size} featured repository timestamps from last pushes.`);
