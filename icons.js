import Soup from 'gi://Soup';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GdkPixbuf from 'gi://GdkPixbuf';

const icons_path = GLib.get_user_cache_dir() + '/parasocial-extension';

export function get_icon_name(streamername) {
  return 'parasocial-' + streamername.toLowerCase();
}

export function get_final_icon_path(streamername) {
  return icons_path + '/' + get_icon_name(streamername) + '.png';
}

export function has_icon(streamername) {
  return GLib.file_test(get_final_icon_path(streamername), GLib.FileTest.EXISTS);
}

// Native download + conversion 
export function trigger_download_by_url(streamername, imageurl) {
  return new Promise((resolve, reject) => {
    const final = get_final_icon_path(streamername);
    if (GLib.file_test(final, GLib.FileTest.EXISTS)) {
      resolve(true);
      return;
    }

    const session = new Soup.Session();
    const message = Soup.Message.new('GET', imageurl);
    session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null, (s, r) => {
      try {
        const bytes = s.send_and_read_finish(r).get_data();
        if (!bytes || bytes.byteLength === 0) {
          resolve(false);
          return;
        }

        const gBytes = GLib.Bytes.new(bytes);
        const stream = Gio.MemoryInputStream.new_from_bytes(gBytes);
        const pixbuf = GdkPixbuf.Pixbuf.new_from_stream(stream, null);
        if (!pixbuf) {
          resolve(false);
          return;
        }

        pixbuf.savev(final, 'png', [], []);
        resolve(true);
      } catch (e) {
        resolve(false);
      }
    });
  });
}

export function get_streamericon(streamername, style_class) {
  let icon = new imports.gi.St.Icon({
    gicon: Gio.icon_new_for_string(get_final_icon_path(streamername)),
    style_class: style_class
  });
  return icon;
}

export function refresh_all_icons(session, streamers, fetchTwitchUsers, fetchKickProfilePicUrl) {
  let dir = Gio.File.new_for_path(icons_path);
  if (dir.query_exists(null)) {
    let enumerator = dir.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
    let info;
    while ((info = enumerator.next_file(null))) {
      let name = info.get_name();
      if (name.startsWith('parasocial-')) {
        GLib.unlink(GLib.build_filenamev([icons_path, name]));
      }
    }
  }

  const downloadIcon = async (fullName) => {
    if (fullName.startsWith('kick:')) {
      const name = fullName.substring(5);
      const picUrl = await fetchKickProfilePicUrl(session, name);
      if (picUrl) {
        await trigger_download_by_url(fullName, picUrl);
      }
    } else {
      const name = fullName.startsWith('twitch:') ? fullName.substring(7) : fullName;
      try {
        const data = await fetchTwitchUsers(session, [name]);
        if (data && data.length > 0 && data[0].profile_image_url) {
          await trigger_download_by_url(fullName, data[0].profile_image_url);
        }
      } catch (e) {}
    }
  };

  const promises = streamers.map(fullName => downloadIcon(fullName));
  Promise.all(promises).catch(() => {});
}
