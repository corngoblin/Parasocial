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
        
        if (pixbuf) {
          pixbuf.savev(finalPath, 'png', [], []);
          resolve(true);
        } else {
          resolve(false);
        }
      } catch (e) {
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

export function refresh_all_icons(session, streamers, fetchTwitchUsers, fetchKickProfilePicUrl) {
  const dir = Gio.File.new_for_path(ICONS_PATH);
  if (!dir.query_exists(null)) {
    GLib.mkdir_with_parents(ICONS_PATH, 448);
  }

  // The logic now maps through streamers and only fetches if the icon is missing[cite: 3]
  Promise.all(streamers.map(async (fullName) => {
    try {
      // Check if icon exists BEFORE doing any network work[cite: 3]
      if (has_icon(fullName)) return; 

      if (fullName.startsWith('kick:')) {
        const picUrl = await fetchKickProfilePicUrl(session, fullName.substring(5));
        if (picUrl) await trigger_download_by_url(fullName, picUrl);
      } else {
        const name = fullName.replace('twitch:', '');
        const data = await fetchTwitchUsers(session, [name]);
        if (data?.[0]?.profile_image_url) {
          await trigger_download_by_url(fullName, data[0].profile_image_url);
        }
      }
    } catch (e) { /* Ignore individual fetch failures */ }
  })).catch(() => {});
}
