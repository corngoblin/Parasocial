import * as Api from './providers/twitch.js';   

const GAMES_CACHE = {};

export async function getFromStreams(session, streams) {
    if (!Array.isArray(streams)) return [];
    
    const gameIds = [...new Set(streams.map(s => s.game_id).filter(id => id > 0))];
    if (!gameIds.length) return [];

    const uncachedIds = gameIds.filter(id => !GAMES_CACHE[id]);
    
    if (uncachedIds.length > 0) {
        try {
            const data = await Api.games(session, uncachedIds);
            if (Array.isArray(data)) {
                data.forEach(game => GAMES_CACHE[game.id] = game);
            }
        } catch (error) {
            console.error(`[Parasocial] Games fetch error:`, error);
            // We log but don't throw, allowing the panel to survive API outages
        }
    }
    
    return gameIds.map(id => GAMES_CACHE[id]).filter(Boolean);
}
