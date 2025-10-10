import fs from "fs/promises";
import { CONFIG } from "../config.js";
import { getState, getLeague, getLeagueUsers, getRosters, getMatchups, getTransactions } from "../sleeper/api.js";
import { loadPlayersCache, playerName } from "../sleeper/playersCache.js";
import { groupGames, highlights, standings, analyzeTrades, waiverGems } from "./analytics.js";
import { toMarkdown } from "./markdown.js";


export async function generateReport(weekOverride) {
const leagueId = CONFIG.LEAGUE_ID;
const state = await getState();
const week = weekOverride ?? (state.display_week ?? state.week);


const [league, users, rosters, matchups, txns, players] = await Promise.all([
getLeague(leagueId),
getLeagueUsers(leagueId),
getRosters(leagueId),
getMatchups(leagueId, week),
getTransactions(leagueId, week),
loadPlayersCache(),
]);


const byRosterId = new Map();
rosters.forEach((r) => byRosterId.set(r.roster_id, r));
const userDisplay = new Map();
users.forEach((u) => userDisplay.set(u.user_id, u?.metadata?.team_name || u?.display_name || u?.username));
const nameOf = (rid) => {
const r = byRosterId.get(rid);
return r ? userDisplay.get(r.owner_id) || `Team ${rid}` : `Team ${rid}`;
};
const nameOfPlayer = (pid) => playerName(players, pid);


const games = groupGames(matchups);
const gamesFlat = [...games.values()].flat();
const { topTeam, blowout, benchOuches: rawOuch } = highlights(games, nameOf);
const benchOuches = rawOuch.map((o) => ({ ...o, name: nameOfPlayer(o.pid) }));


const tradeNotes = analyzeTrades(txns, gamesFlat, players, nameOf, nameOfPlayer);
const gems = waiverGems(txns, gamesFlat, nameOf, nameOfPlayer, 12);
const table = standings(rosters, nameOf);


const markdown = toMarkdown({
leagueName: league.name,
week,
topTeam,
blowout,
benchOuches,
tradeNotes,
gems,
table,
});


const file = `week_${week}_report.md`;
await fs.writeFile(file, markdown);
return { file, markdown, week, leagueName: league.name };
}