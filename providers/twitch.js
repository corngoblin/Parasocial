import { load_json_async, get_token } from '../api.js';

const API_BASE = 'https://api.twitch.tv/helix/';
const CLIENT_ID = "1zat8h7je94boq5t88of6j09p41hg0";

// Array helpers
const chunkArray = (arr, size) => 
  Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, (i + 1) * size));

// Core fetcher
function _fetch(session, url) {
  return new Promise((resolve, reject) => {
    const headers = { 'Client-ID': CLIENT_ID };
    const token = get_token();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    load_json_async(session, url, headers, data => {
      data?.error ? reject(data) : resolve(data?.data || []);
    });
  });
}

// Reusable chunked request handler
async function fetchInChunks(session, items, endpoint, paramName) {
  if (!items?.length) return [];
  
  const chunks = chunkArray(items, 100);
  const results = await Promise.all(chunks.map(chunk => {
    const query = chunk.map(encodeURIComponent).join(`&${paramName}=`);
    return _fetch(session, `${API_BASE}${endpoint}?${paramName}=${query}`);
  }));
  
  return results.flat();
}

// Public API
export const streams = (session, logins) => fetchInChunks(session, logins, 'streams', 'user_login');
export const games = (session, ids) => fetchInChunks(session, ids, 'games', 'id');
export const users = (session, logins) => fetchInChunks(session, logins, 'users', 'login');
export const usersID = (session, ids) => fetchInChunks(session, ids, 'users', 'id');

export function follows(session, userId) {
  const url = `${API_BASE}channels/followed?user_id=${encodeURIComponent(userId)}&first=100`;
  return _fetch(session, url);
}
