// Pure utilities to compute highlights from Sleeper data

const num = (v) => Number(v || 0);
const fmt = (n) => (typeof n === "number" ? n : 0).toFixed(2);

export function groupGames(matchups) {
  const games = new Map();
  for (const m of matchups) {
    games.set(m.matchup_id, [...(games.get(m.matchup_id) || []), m]);
  }
  return games;
}

export function standings(rosters, nameOf) {
  return rosters
    .map((r) => ({
      name: nameOf(r.roster_id),
      w: r.settings?.wins ?? 0,
      l: r.settings?.losses ?? 0,
      pf: num(r.settings?.fpts) + num(r.settings?.fpts_decimal) / 100,
    }))
    .sort((a, b) => b.w - a.w || b.pf - a.pf);
}

export function highlights(games, nameOf) {
  let topTeam = { name: "", pts: -1 };
  let blowout = null; // { winner, loser, margin }
  const benchOuches = [];

  for (const [, teams] of games) {
    if (teams.length !== 2) continue;
    const [a, b] = teams;
    const aName = nameOf(a.roster_id);
    const bName = nameOf(b.roster_id);

    for (const t of teams) {
      const pts = num(t.points);
      if (pts > topTeam.pts) topTeam = { name: nameOf(t.roster_id), pts };
    }

    const margin = Math.abs(num(a.points) - num(b.points));
    if (!blowout || margin > blowout.margin) {
      const winner = num(a.points) >= num(b.points) ? aName : bName;
      const loser = num(a.points) >= num(b.points) ? bName : aName;
      blowout = { winner, loser, margin };
    }

    const checkTeam = (t) => {
      const starters = t.starters || [];
      const ptsMap = t.players_points || {};
      if (!starters.length) return;
      const minStarter = Math.min(...starters.map((p) => num(ptsMap[p])));
      const bench = (t.players || []).filter((p) => !starters.includes(p));
      const bestBench = bench
        .map((p) => ({ pid: p, pts: num(ptsMap[p]) }))
        .sort((x, y) => y.pts - x.pts)[0];
      if (bestBench && bestBench.pts - minStarter >= 10) {
        benchOuches.push({
          team: nameOf(t.roster_id),
          pid: bestBench.pid,
          pts: bestBench.pts,
          delta: bestBench.pts - minStarter,
        });
      }
    };
    checkTeam(a);
    checkTeam(b);
  }
  return { topTeam, blowout, benchOuches };
}

export function analyzeTrades(txns, gamesFlat, players, nameOf, nameOfPlayer) {
  const trades = txns.filter(
    (t) => t.type === "trade" && t.status === "complete"
  );
  const results = [];

  const sumForRosterPlayers = (rosterId, pids) => {
    const rows = gamesFlat.filter((t) => t.roster_id === rosterId);
    let s = 0;
    for (const row of rows)
      for (const pid of pids) s += Number(row.players_points?.[pid] || 0);
    return s;
  };

  for (const t of trades) {
    const adds = t.adds || {}; // { player_id: roster_id }
    const rosterIds = t.roster_ids || [];
    const sideMap = new Map(rosterIds.map((rid) => [rid, []]));
    for (const [pid, rid] of Object.entries(adds))
      if (sideMap.has(rid)) sideMap.get(rid).push(pid);

    const sides = [];
    for (const rid of rosterIds) {
      const received = sideMap.get(rid) || [];
      const pts = sumForRosterPlayers(rid, received);
      sides.push({ rid, name: nameOf(rid), received, pts });
    }
    sides.sort((a, b) => b.pts - a.pts);
    const winner = sides[0];

    const lines = sides.map(
      (s) =>
        `- **${s.name}** received: ${
          s.received.length
            ? s.received.map(nameOfPlayer).join(", ")
            : "picks/FAAB only"
        } (${s.pts.toFixed(2)} pts this week)`
    );

    results.push({
      title: sides.map((s) => s.name).join(" ↔ "),
      lines,
      winner: winner.received.length
        ? `**Trade Winner (this week): ${winner.name}**`
        : null,
    });
  }
  return results;
}

export function waiverGems(
  txns,
  gamesFlat,
  nameOf,
  nameOfPlayer,
  threshold = 12
) {
  const adds = txns.filter(
    (t) => t.type === "waiver" && t.status === "complete"
  );
  const out = [];
  for (const w of adds) {
    const toRid = w.adds ? Object.values(w.adds)[0] : null;
    const pid = w.adds ? Object.keys(w.adds)[0] : null;
    if (!toRid || !pid) continue;
    const rows = gamesFlat.filter((t) => t.roster_id === toRid);
    const pts = rows.reduce(
      (acc, row) => acc + Number(row.players_points?.[pid] || 0),
      0
    );
    if (pts >= threshold)
      out.push({ team: nameOf(toRid), pid, pts, name: nameOfPlayer(pid) });
  }
  return out;
}

export { fmt };
