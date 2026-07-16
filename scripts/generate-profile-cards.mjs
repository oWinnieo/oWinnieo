import { mkdir, writeFile } from "node:fs/promises";

const username = process.env.PROFILE_USERNAME || "oWinnieo";
const outputDir = process.env.OUTPUT_DIR || "dist-profile-cards";
const utcOffset = Number(process.env.UTC_OFFSET || 8);
const token = process.env.GITHUB_TOKEN;

const headers = {
  Accept: "application/vnd.github+json",
  "User-Agent": "owinnieo-profile-card-generator",
  "X-GitHub-Api-Version": "2022-11-28",
};

if (token) {
  headers.Authorization = "Bearer " + token;
}

async function github(path) {
  const response = await fetch("https://api.github.com" + path, { headers });

  if (!response.ok) {
    const remaining = response.headers.get("x-ratelimit-remaining");
    throw new Error(
      "GitHub API request failed (" +
        response.status +
        ") for " +
        path +
        (remaining === null ? "" : "; rate limit remaining: " + remaining),
    );
  }

  return response.json();
}

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&apos;",
    };
    return entities[character];
  });
}

function compactNumber(value) {
  return new Intl.NumberFormat("en", {
    notation: value >= 1000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

function svg(width, height, content) {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="',
    width,
    '" height="',
    height,
    '" viewBox="0 0 ',
    width,
    " ",
    height,
    '" role="img">',
    "<defs>",
    '<linearGradient id="background" x1="0" y1="0" x2="1" y2="1">',
    '<stop offset="0%" stop-color="#111629"/>',
    '<stop offset="58%" stop-color="#171a2b"/>',
    '<stop offset="100%" stop-color="#251b3f"/>',
    "</linearGradient>",
    '<linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">',
    '<stop offset="0%" stop-color="#8bd5ff"/>',
    '<stop offset="55%" stop-color="#a98cff"/>',
    '<stop offset="100%" stop-color="#ff8ec7"/>',
    "</linearGradient>",
    "</defs>",
    '<rect width="100%" height="100%" rx="18" fill="url(#background)"/>',
    '<rect x="1" y="1" width="',
    width - 2,
    '" height="',
    height - 2,
    '" rx="17" fill="none" stroke="#343a5b"/>',
    '<g font-family="Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif">',
    content,
    "</g>",
    "</svg>",
  ].join("");
}

function metricBox(x, label, value) {
  return [
    '<rect x="',
    x,
    '" y="128" width="252" height="82" rx="13" fill="#20253b" stroke="#3a4265"/>',
    '<text x="',
    x + 20,
    '" y="158" fill="#aeb7d4" font-size="14">',
    escapeXml(label),
    "</text>",
    '<text x="',
    x + 20,
    '" y="191" fill="#f5f7ff" font-size="27" font-weight="700">',
    escapeXml(value),
    "</text>",
  ].join("");
}

function profileCard(profile, repositories) {
  const stars = repositories.reduce(
    (total, repository) => total + repository.stargazers_count,
    0,
  );
  const codingSince = new Date(profile.created_at).getUTCFullYear();
  const metrics = [
    ["Public repositories", compactNumber(profile.public_repos)],
    ["Stars earned", compactNumber(stars)],
    ["Followers", compactNumber(profile.followers)],
    ["Coding since", String(codingSince)],
  ];

  const metricMarkup = metrics
    .map((metric, index) => metricBox(42 + index * 284, metric[0], metric[1]))
    .join("");

  return svg(
    1180,
    240,
    [
      '<circle cx="64" cy="62" r="23" fill="#252c48" stroke="#8bd5ff"/>',
      '<text x="64" y="70" text-anchor="middle" fill="#ff8ec7" font-size="22">✦</text>',
      '<text x="104" y="58" fill="#f5f7ff" font-size="28" font-weight="700">',
      escapeXml(username + "'s GitHub universe"),
      "</text>",
      '<text x="104" y="87" fill="#aeb7d4" font-size="16">',
      escapeXml("AI Agents • Interactive Worlds • Game & Web"),
      "</text>",
      '<rect x="42" y="108" width="1096" height="3" rx="2" fill="url(#accent)"/>',
      metricMarkup,
    ].join(""),
  );
}

const languageColors = {
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  Python: "#3572a5",
  GDScript: "#355570",
  HTML: "#e34c26",
  CSS: "#663399",
  Shell: "#89e051",
  Vue: "#41b883",
  C: "#555555",
  "C++": "#f34b7d",
};

function languagesCard(languages) {
  const total = languages.reduce((sum, language) => sum + language[1], 0) || 1;
  const rows = languages.slice(0, 5).map((language, index) => {
    const name = language[0];
    const bytes = language[1];
    const percentage = (bytes / total) * 100;
    const y = 94 + index * 38;
    const color = languageColors[name] || ["#8bd5ff", "#a98cff", "#ff8ec7"][index % 3];
    const barWidth = Math.max(4, Math.round((percentage / 100) * 300));

    return [
      '<circle cx="30" cy="',
      y - 5,
      '" r="5" fill="',
      color,
      '"/>',
      '<text x="44" y="',
      y,
      '" fill="#e9ecf7" font-size="14">',
      escapeXml(name),
      "</text>",
      '<rect x="178" y="',
      y - 17,
      '" width="300" height="12" rx="6" fill="#2a304a"/>',
      '<rect x="178" y="',
      y - 17,
      '" width="',
      barWidth,
      '" height="12" rx="6" fill="',
      color,
      '"/>',
      '<text x="548" y="',
      y,
      '" text-anchor="end" fill="#aeb7d4" font-size="13">',
      percentage.toFixed(1),
      "%</text>",
    ].join("");
  });

  return svg(
    580,
    300,
    [
      '<text x="28" y="40" fill="#f5f7ff" font-size="20" font-weight="700">Languages across original repositories</text>',
      '<text x="28" y="65" fill="#929dbd" font-size="13">Measured from public, non-fork repositories</text>',
      rows.join(""),
    ].join(""),
  );
}

const timePeriods = [
  ["Night", "00–05", 0, 5],
  ["Morning", "06–11", 6, 11],
  ["Afternoon", "12–17", 12, 17],
  ["Evening", "18–23", 18, 23],
];

function productiveTimeCard(events) {
  const counts = timePeriods.map(() => 0);

  for (const event of events) {
    const shifted = new Date(
      new Date(event.created_at).getTime() + utcOffset * 60 * 60 * 1000,
    );
    const hour = shifted.getUTCHours();
    const periodIndex = timePeriods.findIndex(
      (period) => hour >= period[2] && hour <= period[3],
    );
    if (periodIndex >= 0) counts[periodIndex] += 1;
  }

  const maxCount = Math.max(...counts, 1);
  const colors = ["#7868d8", "#8bd5ff", "#a98cff", "#ff8ec7"];
  const rows = timePeriods.map((period, index) => {
    const y = 101 + index * 44;
    const barWidth = Math.max(
      counts[index] === 0 ? 0 : 5,
      Math.round((counts[index] / maxCount) * 270),
    );

    return [
      '<text x="28" y="',
      y,
      '" fill="#e9ecf7" font-size="14">',
      period[0],
      "</text>",
      '<text x="112" y="',
      y,
      '" fill="#7783a7" font-size="12">',
      period[1],
      "</text>",
      '<rect x="170" y="',
      y - 14,
      '" width="270" height="12" rx="6" fill="#2a304a"/>',
      '<rect x="170" y="',
      y - 14,
      '" width="',
      barWidth,
      '" height="12" rx="6" fill="',
      colors[index],
      '"/>',
      '<text x="548" y="',
      y,
      '" text-anchor="end" fill="#aeb7d4" font-size="13">',
      counts[index],
      " events</text>",
    ].join("");
  });

  const offsetLabel = "UTC" + (utcOffset >= 0 ? "+" : "") + utcOffset;
  return svg(
    580,
    300,
    [
      '<text x="28" y="40" fill="#f5f7ff" font-size="20" font-weight="700">When the workshop comes alive</text>',
      '<text x="28" y="65" fill="#929dbd" font-size="13">',
      escapeXml("Based on recent public activity • " + offsetLabel),
      "</text>",
      rows.join(""),
    ].join(""),
  );
}

const [profile, allRepositories, events] = await Promise.all([
  github("/users/" + encodeURIComponent(username)),
  github(
    "/users/" +
      encodeURIComponent(username) +
      "/repos?per_page=100&type=owner&sort=updated",
  ),
  github("/users/" + encodeURIComponent(username) + "/events/public?per_page=100"),
]);

const repositories = allRepositories.filter(
  (repository) => !repository.fork && !repository.archived,
);

const languageResponses = await Promise.all(
  repositories.map(async (repository) => {
    return github(
      "/repos/" +
        encodeURIComponent(repository.owner.login) +
        "/" +
        encodeURIComponent(repository.name) +
        "/languages",
    );
  }),
);

const languageTotals = new Map();
for (const languages of languageResponses) {
  for (const [language, bytes] of Object.entries(languages)) {
    languageTotals.set(language, (languageTotals.get(language) || 0) + bytes);
  }
}

let languages = [...languageTotals.entries()].sort((left, right) => right[1] - left[1]);
if (languages.length === 0) languages = [["No language data yet", 1]];

await mkdir(outputDir, { recursive: true });

const cards = {
  "profile-details.svg": profileCard(profile, repositories),
  "repos-per-language.svg": languagesCard(languages),
  "productive-time.svg": productiveTimeCard(events),
};

await Promise.all(
  Object.entries(cards).map(([filename, content]) =>
    writeFile(outputDir + "/" + filename, content + String.fromCharCode(10), "utf8"),
  ),
);

console.log("Generated " + Object.keys(cards).join(", ") + " for @" + username);
