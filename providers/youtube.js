import Soup from 'gi://Soup';
import GLib from 'gi://GLib';

const extractJson = (html, regex) => {
  const match = html.match(regex);
  return match ? JSON.parse(match[1]) : null;
};

function _fetchYoutubeLive(session, channelHandle) {
  return new Promise((resolve) => {
    const url = `https://www.youtube.com/@${encodeURIComponent(channelHandle)}/live`;
    const msg = Soup.Message.new('GET', url);
    msg.request_headers.append('User-Agent', 'Parasocial/1.0');
    msg.request_headers.append('Accept-Language', 'en-US,en;q=0.9');

    session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null, (s, r) => {
      try {
        const bytes = s.send_and_read_finish(r).get_data();
        if (!bytes || msg.status_code !== 200) return resolve(null);

        const html = new TextDecoder().decode(bytes);
        
        // Extract player data
        const player = extractJson(html, /var ytInitialPlayerResponse\s*=\s*({[\s\S]*?});\s*<\/script>/);
        const videoDetails = player?.videoDetails;
        
        if (!videoDetails?.isLive) return resolve(null);

        // Extract channel data
        const ytData = extractJson(html, /var ytInitialData\s*=\s*({[\s\S]*?});\s*<\/script>/);
        const header = ytData?.header?.c4TabbedHeaderRenderer;
        
        const channelName = header?.title || videoDetails.author || channelHandle;
        const profileImageUrl = header?.avatar?.thumbnails?.[0]?.url || '';
        const startTs = player?.microformat?.playerMicroformatRenderer?.liveBroadcastDetails?.startTimestamp;

        resolve({
          streamer: channelName,
          login: channelHandle,
          game: videoDetails.title || 'YouTube',
          viewer_count: videoDetails.viewCount || 0,
          title: videoDetails.title || '',
          type: 'live',
          thumbnail_url: videoDetails.thumbnail?.thumbnails?.pop()?.url || '',
          platform: 'youtube',
          started_at: startTs ? new Date(startTs).getTime() : null,
          fullId: `youtube:${channelHandle}`,
          profileImage: profileImageUrl
        });
      } catch (e) {
        log(`[Parasocial] YouTube fetch/parse error for ${channelHandle}: ${e.message}`);
        resolve(null);
      }
    });
  });
}

export const streams = async (session, names) => 
  (await Promise.all(names.map(name => _fetchYoutubeLive(session, name)))).filter(Boolean);

export const games = async () => [];
