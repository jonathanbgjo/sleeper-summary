export function serializeWeek({
  week, leagueName, users, rosters, matchups, transactions, players, nameOfRoster, nameOfPlayer
}) {
  const byRosterId = new Map(rosters.map(r => [r.roster_id, r]));
  const userNameOf = (rid) => {
    const r = byRosterId.get(rid);
    return r ? nameOfRoster(rid) : `Team ${rid}`;
  };

  const games = new Map();
  for (const m of matchups) games.set(m.matchup_id, [...(games.get(m.matchup_id) || []), m]);

  const matchList = [];
  for (const [, teams] of games) {
    if (teams.length !== 2) continue;
    const [a, b] = teams;
    const normalize = (t) => ({
      team: userNameOf(t.roster_id),
      points: Number(t.points || 0),
      starters: (t.starters || []).map(pid => ({ id: pid, name: nameOfPlayer(pid), pts: Number(t.players_points?.[pid] || 0) })),
      bench: (t.players || []).filter(p => !(t.starters || []).includes(p))
              .map(pid => ({ id: pid, name: nameOfPlayer(pid), pts: Number(t.players_points?.[pid] || 0) })),
    });
    matchList.push({ a: normalize(a), b: normalize(b) });
  }

  const table = rosters.map(r => ({
    team: nameOfRoster(r.roster_id),
    w: r.settings?.wins ?? 0,
    l: r.settings?.losses ?? 0,
    pf: Number(r.settings?.fpts || 0) + Number(r.settings?.fpts_decimal || 0)/100
  })).sort((x,y)=> (y.w-x.w) || (y.pf-x.pf));

  const trades = transactions
    .filter(t => t.type === "trade" && t.status === "complete")
    .map(t => {
      const adds = Object.entries(t.adds || {})
        .map(([pid, rid]) => ({ to: userNameOf(rid), player: nameOfPlayer(pid), pid }));
      return { between: (t.roster_ids || []).map(userNameOf), adds };
    });

  const waivers = transactions
    .filter(t => t.type === "waiver" && t.status === "complete")
    .map(t => {
      const pid = t.adds ? Object.keys(t.adds)[0] : null;
      const rid = t.adds ? Object.values(t.adds)[0] : null;
      return pid && rid ? { to: userNameOf(rid), player: nameOfPlayer(pid), pid } : null;
    })
    .filter(Boolean);

  return { league: leagueName, week, matchups: matchList, standings: table, trades, waivers };
}
