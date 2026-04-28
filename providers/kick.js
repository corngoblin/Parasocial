// providers/kick.js (improved)
import { load_json_async } from '../api.js';

export function streams(session, names) {
  return Promise.all(names.map(name => {
    return new Promise((resolve, reject) => {
      let url = `https://kick.com/api/v2/channels/${encodeURIComponent(name)}`;
      let headers = {
        'User-Agent': 'Mozilla/5.0 …',
        'Accept': 'application/json'
      };
      load_json_async(session, url, headers, data => {
        if (data && data.livestream) {
          const ls = data.livestream;
          // ---- extract new fields ----
          // category name (first one)
          const categoryName = ls.categories?.[0]?.name || 'Kick';
          // comma‑separated list of all category names
          const allCategories = ls.categories?.map(c => c.name).join(', ') || 'Kick';
          // category tags
          const categoryTags = ls.categories?.[0]?.tags || [];
          // language
          const language = ls.language || '';
          // stream tags
          const tags = ls.tags || [];
          // uptime from start_time
          const started_at = ls.start_time || null;
          const uptimeSeconds = started_at
            ? (Date.now() - new Date(started_at).getTime()) / 1000
            : null;
          // mature flag
          const is_mature = ls.is_mature || false;

          resolve({
            streamer: ls.channel?.user?.username || name,
            login: name,
            // ---- provide richer data ----
            game: categoryName,               // “Just Chatting”, “Fortnite”, …
            allCategories: allCategories,     // e.g. “Just Chatting, IRL”
            tags: tags,                       // global stream tags
            categoryTags: categoryTags,       // category‑specific tags
            language: language,               // “en”, “es”, …
            is_mature: is_mature,
            viewer_count: ls.viewer_count || 0,
            title: ls.session_title || '',
            type: 'live',
            thumbnail_url: ls.thumbnail?.url || '',
            platform: 'kick',
            started_at: started_at            // for uptime calculation
          });
        } else {
          resolve(null);
        }
      });
    });
  })).then(results => results.filter(s => s !== null));
}

export function games() {
  return Promise.resolve([]);   // no separate game fetch needed
}
