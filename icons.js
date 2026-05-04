import Soup from 'gi://Soup';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GdkPixbuf from 'gi://GdkPixbuf';

const ICONS_PATH = `${GLib.get_user_cache_dir()}/parasocial-extension`;

export const get_icon_name = (streamer) => `parasocial-${streamer.toLowerCase()}`;
export const get_final_icon_path = (streamer) => `${ICONS_PATH}/${get_icon_name(streamer)}.png`;
export const has_icon = (streamer) => GLib.file_test(get_final_icon_path(streamer), GLib.FileTest.EXISTS);

export function trigger_download_by_url(streamername, imageurl) {
  return new Promise((resolve) => {
    const finalPath = get_final_icon_path(streamername);
    if (GLib.file_test(finalPath, GLib.FileTest.EXISTS)) return resolve(true);

    const session = new Soup.Session();
    const message = Soup.Message.new('GET', imageurl);
    
    session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null, (s, r) => {
      try {
        const bytes = s.send_and_read_finish(r).get_data();
        if (!bytes || bytes.byteLength === 0) return resolve(false);

        const stream = Gio.MemoryInputStream.new_from_bytes(GLib.Bytes.new(bytes));
        const pixbuf = GdkPixbuf.Pixbuf.new_from_stream(stream, null);
        
        if (!pixbuf) return resolve(false);
        
        pixbuf.savev(finalPath, 'png', [], []);
        resolve(true);
      } catch {
        resolve(false);
      }
    });
  });
}

export function get_streamericon(streamername, style_class) {
  return new imports.gi.St.Icon({
    gicon: Gio.icon_new_for_string(get_final_icon_path(streamername)),
    style_class: style_class
  });
}

export function _fetchYoutubeProfilePicUrl(session, channelHandle) {
  return new Promise((resolve) => {
    const url = `https://www.youtube.com/@${encodeURIComponent(channelHandle)}/about`;
    const msg = Soup.Message.new('GET', url);
    msg.request_headers.append('User-Agent', 'Parasocial/1.0');
    msg.request_headers.append('Accept-Language', 'en-US,en;q=0.9');

    session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null, (s, r) => {
      try {
        const bytes = s.send_and_read_finish(r).get_data();
        if (!bytes) return resolve(null);
        
        const html = new TextDecoder().decode(bytes);
        const match = html.match(/"avatar":{"thumbnails":\[{"url":"(.+?)"/);
        const fallback = html.match(/<meta property="og:image" content="(.+?)"/);
        
        resolve(match?.[1] || fallback?.[1] || null);
      } catch {
        resolve(null);
      }
    });
  });
}

export function refresh_all_icons(session, streamers, fetchTwitchUsers, fetchKickProfilePicUrl, fetchYoutubeProfilePicUrl) {
  const dir = Gio.File.new_for_path(ICONS_PATH);
  if (!dir.query_exists(null)) GLib.mkdir_with_parents(ICONS_PATH, 448);

  Promise.all(streamers.map(async (fullName) => {
    try {
      if (has_icon(fullName)) return;

      let picUrl = null;
      if (fullName.startsWith('kick:')) {
        picUrl = await fetchKickProfilePicUrl(session, fullName.substring(5));
      } else if (fullName.startsWith('youtube:')) {
        picUrl = await fetchYoutubeProfilePicUrl(session, fullName.substring(8));
      } else {
        const data = await fetchTwitchUsers(session, [fullName.replace('twitch:', '')]);
        picUrl = data?.[0]?.profile_image_url;
      }

      if (picUrl) await trigger_download_by_url(fullName, picUrl);
    } catch (e) { /* Ignore individual fetch failures */ }
  })).catch(() => {});
}
