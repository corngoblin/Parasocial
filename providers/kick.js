import Soup from 'gi://Soup';
import GLib from 'gi://GLib';

// Helper to handle a single stream fetch cleanly
function fetchKickStream(session, name) {
  return new Promise((resolve) => {
    const msg = Soup.Message.new('GET', `https://kick.com/api/v2/channels/${encodeURIComponent(name)}`);

    // Use the Parasocial User-Agent to bypass Cloudflare 403 blocks
    msg.request_headers.append('User-Agent', 'Parasocial/1.0');
    msg.request_headers.append('Accept', 'application/json');

    session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null, (s, r) => {
      try {
        const bytes = s.send_and_read_finish(r).get_data();
        if (!bytes) return resolve(null);

        const data = JSON.parse(new TextDecoder().decode(bytes));
        const ls = data?.livestream;

        // If 'ls' is null/undefined, they are offline
        if (!ls) return resolve(null);

        const cat = ls.categories?.[0];

        // ---------- UTC TIME ----------
        let rawTime = ls.created_at;
        if (rawTime) {
          // Check if it already has a timezone designator (Z, +, or a hyphen at position 10+)
          if (!rawTime.endsWith('Z') && !rawTime.includes('+') && !rawTime.includes('-', 10)) {
            rawTime += 'Z';
          }
        }
        const started_at = rawTime || null;
        // ----------------------------------

        resolve({
          streamer: data.user?.username || name, // FIXED: User is at the root level
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
      } catch (e) {
        resolve(null);
      }
    });
  });
}

// Public API
export async function streams(session, names) {
  const results = await Promise.all(names.map(name => fetchKickStream(session, name)));
  return results.filter(Boolean);
}

export const games = async () => [];
