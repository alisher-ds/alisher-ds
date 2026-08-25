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
let currentStreak = 0;
for (const day of days) {
  if (day.contributionCount > 0) {
    currentStreak += 1;
    longestStreak = Math.max(longestStreak, currentStreak);
  } else {
    currentStreak = 0;
  }
}

const esc = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
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

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">Alisher Tuychiyev — GitHub contribution activity</title>
  <desc id="desc">A self-hosted contribution calendar generated from GitHub's contribution data.</desc>
  <rect width="100%" height="100%" rx="12" fill="#0d1117"/>
  <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="11" fill="none" stroke="#30363d"/>
  <text x="24" y="30" fill="#f0f6fc" font-size="14" font-weight="600" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif">Engineering Activity</text>
  <text x="24" y="50" fill="#8b949e" font-size="10.5" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif">${total.toLocaleString()} contributions · ${activeDays} active days · ${longestStreak} day best streak · ${peak} peak day</text>
  ${monthLabels}
  ${weekdayLabels}
  ${cells}
  <text x="24" y="197" fill="#8b949e" font-size="9.5" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif">Less</text>
  ${legend}
  <text x="${width - 22}" y="197" text-anchor="end" fill="#8b949e" font-size="9.5" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif">More</text>
  <text x="24" y="214" fill="#58a6ff" font-size="9" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif">Updated automatically · github.com/${esc(login)}</text>
</svg>
`;

writeFileSync("assets/contributions.svg", svg);
