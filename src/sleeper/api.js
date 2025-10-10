import { CONFIG } from "../config.js";
import { j } from "../utils/http.js";

const B = CONFIG.API_BASE;

export const getState         = () => j(`${B}/state/nfl`);
export const getLeague        = (leagueId)      => j(`${B}/league/${leagueId}`);
export const getLeagueUsers   = (leagueId)      => j(`${B}/league/${leagueId}/users`);
export const getRosters       = (leagueId)      => j(`${B}/league/${leagueId}/rosters`);
export const getMatchups      = (leagueId, wk)  => j(`${B}/league/${leagueId}/matchups/${wk}`);
export const getTransactions  = (leagueId, wk)  => j(`${B}/league/${leagueId}/transactions/${wk}`);
export const getPlayers       = ()              => j(`${B}/players/nfl`);
