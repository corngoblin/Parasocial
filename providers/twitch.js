import Soup from 'gi://Soup';
import { load_json_async, get_token } from '../api.js';

const api_base = 'https://api.twitch.tv/helix/';
const client_id = "1zat8h7je94boq5t88of6j09p41hg0";

function chunk(arr, len) {
  let chunks = [], i = 0, n = arr.length;
  while (i < n) chunks.push(arr.slice(i, i += len));
  return chunks;
}

function promiseAllMerge(promises) {
  return Promise.all(promises).then(data => [].concat.apply([], data));
}

function _fetch(session, url) {
  return new Promise((resolve, reject) => {
    let headers = { 'Client-ID': client_id };
    let token = get_token();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    load_json_async(session, url, headers, data => {
      if (!data.error) resolve(data.data);
      else reject(data);
    });
  });
}

// Public functions that match the old api.js interface
export function streams(session, userLogins) {
  const chunks = chunk(userLogins, 100);
  const promises = chunks.map(chunk => {
    let url = api_base + 'streams?user_login=' + chunk.map(encodeURI).join('&user_login=');
    return _fetch(session, url);
  });
  return promiseAllMerge(promises);
}

export function games(session, gameIds) {
  const chunks = chunk(gameIds, 100);
  const promises = chunks.map(chunk => {
    if (chunk.length === 0) return Promise.resolve([]);
    let url = api_base + 'games?id=' + chunk.join('&id=');
    return _fetch(session, url);
  });
  return promiseAllMerge(promises);
}

export function users(session, userLogins) {
  const chunks = chunk(userLogins, 100);
  const promises = chunks.map(chunk => {
    let url = api_base + 'users?login=' + chunk.join('&login=');
    return _fetch(session, url);
  });
  return promiseAllMerge(promises);
}

export function usersID(session, ids) {
  const chunks = chunk(ids, 100);
  const promises = chunks.map(chunk => {
    let url = api_base + 'users?id=' + chunk.join('&id=');
    return _fetch(session, url);
  });
  return promiseAllMerge(promises);
}

export function follows(session, userId) {
  return new Promise((resolve, reject) => {
    let url = api_base + 'channels/followed?user_id=' + encodeURIComponent(userId) + '&first=100';
    _fetch(session, url).then(resolve).catch(reject);
  });
}
