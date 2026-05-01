import { load_json_async } from '../api.js';

// Helper to handle a single stream fetch cleanly
function fetchKickStream(session, name) {
  return new Promise((resolve) => {
    const url = `https://kick.com/api/v2/channels/${encodeURIComponent(name)}`;
    const headers = { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' };

    load_json_async(session, url, headers, (data) => {
      const ls = data?.livestream;
      if (!ls) return resolve(null);

      const cat = ls.categories?.[0];
      const started_at = ls.start_time || null;

      resolve({
        streamer: ls.channel?.user?.username || name,
        login: name,
        game: cat?.name || 'Kick',
        allCategories: ls.categories?.map(c => c.name).join(', ') || 'Kick',
        tags: ls.tags || [],
        categoryTags: cat?.tags || [],
        language: ls.language || '',
        is_mature: ls.is_mature || false,
        viewer_count: ls.viewer_count || 0,
        title: ls.session_title || '',
        type: 'live',
        thumbnail_url: ls.thumbnail?.url || '',
        platform: 'kick',
        started_at
      });
    });
  });
}

// Public API
export async function streams(session, names) {
  const results = await Promise.all(names.map(name => fetchKickStream(session, name)));
  return results.filter(Boolean);
}

export const games = async () => [];
