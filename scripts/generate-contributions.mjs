import { writeFileSync } from "node:fs";

const token = process.env.GITHUB_TOKEN;
const login = process.env.GITHUB_LOGIN || "alisher-ds";

if (!token) throw new Error("GITHUB_TOKEN is required");

const query = `
  query($login: String!) {
    user(login: $login) {
      contributionsCollection {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              contributionCount
              date
              weekday
            }
          }
        }
      }
    }
  }
`;

const response = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": "alisher-ds-profile",
  },
  body: JSON.stringify({ query, variables: { login } }),
});

if (!response.ok) throw new Error(`GitHub GraphQL request failed: ${response.status}`);

const payload = await response.json();
if (payload.errors?.length) throw new Error(payload.errors.map((e) => e.message).join("; "));

const calendar = payload.data?.user?.contributionsCollection?.contributionCalendar;
if (!calendar) throw new Error(`GitHub user not found: ${login}`);

const days = calendar.weeks.flatMap((week) => week.contributionDays);
const total = calendar.totalContributions;
const activeDays = days.filter((day) => day.contributionCount > 0).length;
const peak = Math.max(0, ...days.map((day) => day.contributionCount));

let longestStreak = 0;
let tempStreak = 0;
for (const day of days) {
  if (day.contributionCount > 0) {
    tempStreak += 1;
    longestStreak = Math.max(longestStreak, tempStreak);
  } else {
    tempStreak = 0;
  }
}

// Current streak calculation (accounts for today being active or yesterday active)
let currentStreak = 0;
const revDays = [...days].reverse();
let startIndex = 0;
if (revDays.length > 0 && revDays[0].contributionCount === 0) {
  startIndex = 1; // if today has no commits yet, check if yesterday's streak continues
}

for (let i = startIndex; i < revDays.length; i += 1) {
  if (revDays[i].contributionCount > 0) {
    currentStreak += 1;
  } else {
    break;
  }
}

/** Escape XML/SVG special characters */
const esc = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

/** Map contribution count to corresponding GitHub theme color hex */
const level = (count) => {
  if (count === 0) return "#161b22";
  if (count <= 2) return "#0e4429";
  if (count <= 5) return "#006d32";
  if (count <= 9) return "#26a641";
  return "#39d353";
};

const cell = 11;
const gap = 3;
const top = 82;
const left = 42;
const gridWidth = calendar.weeks.length * (cell + gap) - gap;
const width = left + gridWidth + 24;
const height = 220;

const months = [];
let previousMonth = -1;
for (let i = 0; i < calendar.weeks.length; i += 1) {
  const firstDay = calendar.weeks[i].contributionDays[0];
  if (!firstDay) continue;
  const month = Number(firstDay.date.slice(5, 7));
  if (month !== previousMonth) {
    months.push({ index: i, label: new Date(`${firstDay.date}T00:00:00Z`).toLocaleString("en-US", { month: "short", timeZone: "UTC" }) });
    previousMonth = month;
  }
}

const monthLabels = months.map(({ index, label }) =>
  `<text x="${left + index * (cell + gap)}" y="66" fill="#8b949e" font-size="10" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif">${esc(label)}</text>`,
).join("");

const weekdayLabels = [
  ["Mon", 1],
  ["Wed", 3],
  ["Fri", 5],
].map(([label, row]) => `<text x="8" y="${top + row * (cell + gap) + 9}" fill="#8b949e" font-size="9" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif">${label}</text>`).join("");

const cells = calendar.weeks.flatMap((week, column) => week.contributionDays.map((day) => {
  const x = left + column * (cell + gap);
  const y = top + day.weekday * (cell + gap);
  return `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="2.5" fill="${level(day.contributionCount)}"><title>${esc(day.date)} · ${day.contributionCount} contribution${day.contributionCount === 1 ? "" : "s"}</title></rect>`;
})).join("");

const legend = [0, 1, 3, 6, 10].map((count, index) => `<rect x="${width - 92 + index * 14}" y="188" width="10" height="10" rx="2.5" fill="${level(count)}"/>`).join("");

const contributionsSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">Alisher Tuychiyev — GitHub contribution activity</title>
  <desc id="desc">A self-hosted contribution calendar generated from GitHub's contribution data.</desc>
  <rect width="100%" height="100%" rx="12" fill="#0d1117"/>
  <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="11" fill="none" stroke="#30363d"/>
  <text x="24" y="30" fill="#f0f6fc" font-size="14" font-weight="600" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif">Engineering Activity</text>
  <text x="24" y="50" fill="#8b949e" font-size="10.5" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif">${total.toLocaleString()} contributions · ${currentStreak}d current streak · ${longestStreak}d best streak · ${activeDays} active days</text>
  ${monthLabels}
  ${weekdayLabels}
  ${cells}
  <text x="24" y="197" fill="#8b949e" font-size="9.5" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif">Less</text>
  ${legend}
  <text x="${width - 22}" y="197" text-anchor="end" fill="#8b949e" font-size="9.5" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif">More</text>
  <text x="24" y="214" fill="#58a6ff" font-size="9" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif">Updated automatically · github.com/${esc(login)}</text>
</svg>
`;

writeFileSync("assets/contributions.svg", contributionsSvg);

const engineeringPulseSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 1000 430" role="img" aria-labelledby="title desc">
  <title id="title">Alisher Tuychiyev — Engineering Pulse</title>
  <desc id="desc">Interactive GitHub profile panel with live contribution metrics and selected engineering systems.</desc>
  <defs>
    <linearGradient id="accent" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#58A6FF"/>
      <stop offset="1" stop-color="#A371F7"/>
    </linearGradient>
    <linearGradient id="line" x1="0" x2="1">
      <stop offset="0" stop-color="#58A6FF" stop-opacity="0"/>
      <stop offset="0.5" stop-color="#58A6FF" stop-opacity="0.65"/>
      <stop offset="1" stop-color="#A371F7" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <rect width="1000" height="430" rx="18" fill="#0D1117"/>
  <rect x="1" y="1" width="998" height="428" rx="17" fill="none" stroke="#30363D"/>

  <text x="34" y="42" fill="#F0F6FC" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" font-size="19" font-weight="700">Engineering Pulse</text>
  <text x="34" y="65" fill="#8B949E" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" font-size="11">Live view of contribution rhythm, streaks, momentum and production systems.</text>
  <rect x="34" y="82" width="932" height="1" fill="url(#line)"/>

  <!-- Live Metric Cards -->
  <g font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
    <a href="https://github.com/alisher-ds?tab=overview" target="_blank">
      <rect x="34" y="104" width="218" height="82" rx="12" fill="#161B22" stroke="#30363D"/>
      <text x="52" y="129" fill="#8B949E" font-size="10" font-weight="600">CONTRIBUTIONS</text>
      <text x="52" y="157" fill="#F0F6FC" font-size="25" font-weight="700">${total.toLocaleString()}</text>
      <text x="110" y="156" fill="#58A6FF" font-size="10">↗ year total</text>
    </a>
    <a href="https://github.com/alisher-ds?tab=overview" target="_blank">
      <rect x="272" y="104" width="218" height="82" rx="12" fill="#161B22" stroke="#30363D"/>
      <text x="290" y="129" fill="#8B949E" font-size="10" font-weight="600">CURRENT STREAK</text>
      <text x="290" y="157" fill="#F0F6FC" font-size="25" font-weight="700">${currentStreak}</text>
      <text x="${currentStreak >= 10 ? 335 : 315}" y="156" fill="#58A6FF" font-size="10">days ${currentStreak > 0 ? "🔥 active" : "⚡"}</text>
    </a>
    <a href="https://github.com/alisher-ds?tab=overview" target="_blank">
      <rect x="510" y="104" width="218" height="82" rx="12" fill="#161B22" stroke="#30363D"/>
      <text x="528" y="129" fill="#8B949E" font-size="10" font-weight="600">BEST STREAK</text>
      <text x="528" y="157" fill="#F0F6FC" font-size="25" font-weight="700">${longestStreak}</text>
      <text x="${longestStreak >= 10 ? 570 : 550}" y="156" fill="#A371F7" font-size="10">days 🏆</text>
    </a>
    <a href="https://github.com/alisher-ds?tab=overview" target="_blank">
      <rect x="748" y="104" width="218" height="82" rx="12" fill="#161B22" stroke="#30363D"/>
      <text x="766" y="129" fill="#8B949E" font-size="10" font-weight="600">ACTIVE DAYS</text>
      <text x="766" y="157" fill="#F0F6FC" font-size="25" font-weight="700">${activeDays}</text>
      <text x="${activeDays >= 100 ? 825 : (activeDays >= 10 ? 810 : 790)}" y="156" fill="#39D353" font-size="10">days (${peak} peak)</text>
    </a>
  </g>

  <text x="34" y="220" fill="#8B949E" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" font-size="10" font-weight="600">SELECTED SYSTEMS</text>

  <!-- Project cards -->
  <g font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
    <a href="https://github.com/alisher-ds/TG-BlogPost" target="_blank">
      <rect x="34" y="238" width="292" height="92" rx="12" fill="#161B22" stroke="#30363D"/>
      <circle cx="58" cy="263" r="6" fill="#58A6FF"/>
      <text x="74" y="268" fill="#F0F6FC" font-size="13" font-weight="700">TG-BlogPost</text>
      <text x="52" y="291" fill="#8B949E" font-size="10">Agentic content automation</text>
      <text x="52" y="310" fill="#58A6FF" font-size="9">TypeScript · Cloudflare · AI Agents   ↗</text>
    </a>
    <a href="https://github.com/alisher-ds/imkon-ai" target="_blank">
      <rect x="354" y="238" width="292" height="92" rx="12" fill="#161B22" stroke="#30363D"/>
      <circle cx="378" cy="263" r="6" fill="#A371F7"/>
      <text x="394" y="268" fill="#F0F6FC" font-size="13" font-weight="700">Imkon AI</text>
      <text x="372" y="291" fill="#8B949E" font-size="10">Opportunity discovery platform</text>
      <text x="372" y="310" fill="#58A6FF" font-size="9">Next.js · TypeScript · Supabase   ↗</text>
    </a>
    <a href="https://github.com/alisher-ds/study-mate-bot" target="_blank">
      <rect x="674" y="238" width="292" height="92" rx="12" fill="#161B22" stroke="#30363D"/>
      <circle cx="698" cy="263" r="6" fill="#39D353"/>
      <text x="714" y="268" fill="#F0F6FC" font-size="13" font-weight="700">Study Mate</text>
      <text x="692" y="291" fill="#8B949E" font-size="10">Retrieval-first learning assistant</text>
      <text x="692" y="310" fill="#58A6FF" font-size="9">Python · RAG · Embeddings   ↗</text>
    </a>
  </g>

  <rect x="34" y="353" width="932" height="1" fill="#21262D"/>
  <text x="34" y="379" fill="#8B949E" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" font-size="10">LIVE METRICS</text>
  <text x="34" y="400" fill="#F0F6FC" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" font-size="11">Metrics synchronized daily via automated GitHub Actions GraphQL pipeline.</text>
  <a href="https://github.com/alisher-ds?tab=repositories" target="_blank">
    <rect x="782" y="374" width="184" height="34" rx="9" fill="#1F6FEB"/>
    <text x="806" y="396" fill="#FFFFFF" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" font-size="10" font-weight="700">EXPLORE REPOSITORIES  ↗</text>
  </a>
</svg>
`;

writeFileSync("assets/engineering-pulse.svg", engineeringPulseSvg);

console.log(`[profile-generator] Successfully updated assets (Total: ${total}, Current Streak: ${currentStreak}d, Best Streak: ${longestStreak}d).`);

