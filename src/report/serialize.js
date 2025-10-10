// src/report/serialize.js
// Build a compact but *rich* JSON the LLM can use to write:
// - League overview
// - Per-team snippets
// - Trade analyzer (this week impact)
// - Waiver gems
// - Light power rankings

const num = (v) => Number(v || 0);

function groupGames(matchups) {
  const games = new Map();
  for (const m of matchups) games.set(m.matchup_id, [...(games.get(m.matchup_id) || []), m]);
  return games;
}

export function serializeWeek({
  week,
  leagueName,
  users,
  rosters,
  matchups,
  transactions,
  players,
  nameOfRoster,
  nameOfPlayer,
}) {
  const byRosterId = new Map(rosters.map((r) => [r.roster_id, r]));
  const byUserId = new Map(users.map((u) => [u.user_id, u]));
  const roName = (rid) => {
    const r = byRosterId.get(rid);
    if (!r) return `Team ${rid}`;
    const u = byUserId.get(r.owner_id);
    return (u?.metadata?.team_name || u?.display_name || u?.username || `Team ${rid}`);
  };

  // --- standings snapshot
  const standings = rosters
    .map((r) => ({
      roster_id: r.roster_id,
      team: roName(r.roster_id),
      w: r.settings?.wins ?? 0,
      l: r.settings?.losses ?? 0,
      pf: num(r.settings?.fpts) + num(r.settings?.fpts_decimal) / 100,
    }))
    .sort((a, b) => b.w - a.w || b.pf - a.pf);

  // --- matchups grouped
  const games = groupGames(matchups);

  // Build per-team weekly view
  const teamsWeek = new Map(); // rid -> {team, opp, points, result, topStarter, worstStarter, bestBench}
  const toTeam = (rid) => {
    if (!teamsWeek.has(rid)) teamsWeek.set(rid, { roster_id: rid, team: roName(rid) });
    return teamsWeek.get(rid);
  };

  for (const [, pair] of games) {
    if (pair.length !== 2) continue;
    const [A, B] = pair;
    const aPts = num(A.points), bPts = num(B.points);

    // Build starter/bench detail
    const detail = (t) => {
      const starters = t.starters || [];
      const ptsMap = t.players_points || {};
      const startersArr = starters.map(pid => ({ id: pid, name: nameOfPlayer(pid), pts: num(ptsMap[pid]) }));
      const benchIds = (t.players || []).filter(p => !starters.includes(p));
      const benchArr = benchIds.map(pid => ({ id: pid, name: nameOfPlayer(pid), pts: num(ptsMap[pid]) }));

      const topStarter = startersArr.slice().sort((x, y) => y.pts - x.pts)[0] || null;
      const worstStarter = startersArr.slice().sort((x, y) => x.pts - y.pts)[0] || null;
      const bestBench = benchArr.slice().sort((x, y) => y.pts - x.pts)[0] || null;

      return { starters: startersArr, bench: benchArr, topStarter, worstStarter, bestBench };
    };

    const aDet = detail(A);
    const bDet = detail(B);

    const a = toTeam(A.roster_id);
    const b = toTeam(B.roster_id);

    a.points = aPts;
    b.points = bPts;
    a.opp = roName(B.roster_id);
    b.opp = roName(A.roster_id);
    a.result = aPts === bPts ? "tie" : (aPts > bPts ? "win" : "loss");
    b.result = aPts === bPts ? "tie" : (bPts > aPts ? "win" : "loss");

    a.topStarter = aDet.topStarter;
    a.worstStarter = aDet.worstStarter;
    a.bestBench = aDet.bestBench;

    b.topStarter = bDet.topStarter;
    b.worstStarter = bDet.worstStarter;
    b.bestBench = bDet.bestBench;
  }

  // --- trades & waivers (minimal)
  const trades = transactions
    .filter(t => t.type === "trade" && t.status === "complete")
    .map(t => {
      const adds = Object.entries(t.adds || {}) // [playerId, rosterId]
        .map(([pid, rid]) => ({ to: roName(rid), pid, player: nameOfPlayer(pid) }));
      return { between: (t.roster_ids || []).map(roName), adds };
    });

  const waivers = transactions
    .filter(t => t.type === "waiver" && t.status === "complete")
    .map(t => {
      const pid = t.adds ? Object.keys(t.adds)[0] : null;
      const rid = t.adds ? Object.values(t.adds)[0] : null;
      return pid && rid ? { to: roName(rid), pid, player: nameOfPlayer(pid) } : null;
    })
    .filter(Boolean);

  // --- Trade analyzer (this week impact): sum points for acquired players by team
  // Build a quick roster_id map by display team name for reverse lookup
  const nameToRid = new Map(standings.map(s => [s.team, s.roster_id]));
  const tradeImpacts = [];
  if (trades.length) {
    // flatten all team weeks for summing player points
    const teamRows = [...games.values()].flat();

    const sumForTeamPlayers = (rid, pids) => {
      let s = 0;
      for (const row of teamRows) {
        if (row.roster_id !== rid) continue;
        for (const pid of pids) s += num(row.players_points?.[pid]);
      }
      return s;
    };

    for (const tr of trades) {
      const sides = new Map(); // team -> [pids]
      for (const add of tr.adds) {
        const rid = nameToRid.get(add.to);
        if (!rid) continue;
        if (!sides.has(add.to)) sides.set(add.to, []);
        sides.get(add.to).push(add.pid);
      }
      const scored = [...sides.entries()].map(([team, pids]) => {
        const rid = nameToRid.get(team);
        return { team, points: sumForTeamPlayers(rid, pids), players: pids };
      }).sort((a,b)=> b.points - a.points);
      if (scored.length) {
        tradeImpacts.push({
          between: tr.between,
          results: scored.map(s => ({
            team: s.team,
            pts: s.points,
            players: s.players.map(pid => nameOfPlayer(pid))
          })),
          winner: scored[0].team
        });
      }
    }
  }

  // --- Power score (simple): weekly points + 0.1 * season PF
  const power = [];
  for (const s of standings) {
    const t = teamsWeek.get(s.roster_id);
    const weekly = t?.points ?? 0;
    power.push({
      team: s.team,
      weekly,
      pf: s.pf,
      score: weekly + 0.1 * s.pf,
    });
  }
  power.sort((a,b)=> b.score - a.score);

  return {
    league: leagueName,
    week,
    standings,
    teams: [...teamsWeek.values()].map(t => ({
      team: t.team,
      opponent: t.opp,
      result: t.result,
      points: t.points,
      topStarter: t.topStarter,
      worstStarter: t.worstStarter,
      bestBench: t.bestBench,
    })),
    trades,
    tradeImpacts, // this-week trade winners
    waivers,
    power,
  };
}
