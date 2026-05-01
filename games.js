import * as Api from './providers/twitch.js';   
const GAMES_CACHE = {};

async function get(session, gameIds) {
    if (!gameIds.length) return [];

    const uncachedIds = gameIds.filter(id => !GAMES_CACHE[id]);
    
    if (uncachedIds.length > 0) {
        try {
            const data = await Api.games(session, uncachedIds);
            data.forEach(game => GAMES_CACHE[game.id] = game);
        } catch (error) {
            log(`TwitchLive: games fetch error: ${error}`);
            throw error;
        }
    }
    
    return gameIds.map(id => GAMES_CACHE[id]).filter(Boolean);
}

export async function getFromStreams(session, streams) {
    const gameIds = [...new Set(streams.map(s => s.game_id).filter(id => id > 0))];
    return get(session, gameIds);
}
