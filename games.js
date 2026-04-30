import * as Api from './providers/twitch.js';   
const GAMES_CACHE = {};

function get(session, gameIds) {
    const results = [];
    return new Promise((resolve, reject) => {
        if (gameIds.length === 0) {
            return resolve(results);
        }

        let uncachedIds = [];
        for (let gameId of gameIds) {
            if (GAMES_CACHE[gameId]) {
                results.push(GAMES_CACHE[gameId]);
            } else {
                uncachedIds.push(gameId);
            }
        }

        if (uncachedIds.length === 0) {
            return resolve(results);
        }

        Api.games(session, uncachedIds).then(data => {
            data.forEach(game => {
                results.push(game);
                GAMES_CACHE[game.id] = game;
            });
            resolve(results);
        }).catch(error => {
            log("TwitchLive: games fetch error: " + error);
            reject(error);
        });
    });
}

export function getFromStreams(session, streams) {
    let gameIds = streams
        .filter(stream => stream.game_id && stream.game_id > 0)
        .map(stream => stream.game_id);
    gameIds = [...new Set(gameIds)];
    return get(session, gameIds);
}
