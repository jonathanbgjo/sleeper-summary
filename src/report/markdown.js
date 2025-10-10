import { nowStamp } from "../utils/time.js";
import { fmt } from "./analytics.js";


export function toMarkdown({ leagueName, week, topTeam, blowout, benchOuches, tradeNotes, gems, table }) {
let md = `# ${leagueName} – Week ${week} Report\n`;
md += `_Generated ${nowStamp()}._\n\n`;
md += `**Team of the Week:** ${topTeam.name} (${fmt(topTeam.pts)} pts)\n`;
if (blowout) md += `**Blowout of the Week:** ${blowout.winner} over ${blowout.loser} by ${fmt(blowout.margin)} pts\n`;
md += `\n`;


if (benchOuches?.length) {
md += `## Bench Ouch\n`;
for (const b of benchOuches) md += `- ${b.team}: Benched **${b.name}** (${fmt(b.pts)}), which outscored a starter by ${fmt(b.delta)}.\n`;
md += `\n`;
}


if (tradeNotes?.length) {
md += `## Trades\n`;
for (const t of tradeNotes) {
md += `**${t.title}**\n${t.lines.join("\n")}\n`;
if (t.winner) md += `${t.winner}\n`;
md += `\n`;
}
}


if (gems?.length) {
md += `## Waiver Gems (≥ 12 pts)\n`;
for (const g of gems) md += `- **${g.name}** to ${g.team}: ${fmt(g.pts)} pts\n`;
md += `\n`;
}


md += `## Standings (snapshot)\n`;
for (const t of table) md += `- ${t.name}: ${t.w}-${t.l} (PF ${fmt(t.pf)})\n`;
return md;
}