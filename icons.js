import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Gdk from 'gi://Gdk';

const icons_path = GLib.get_user_cache_dir() + '/parasocial-extension';

export function init_icons() {
  GLib.mkdir_with_parents(icons_path, 448);

  var display = Gdk.Display.get_default();
  if (display == null) return;

  var icon_theme = Gtk.IconTheme.get_for_display(display);
  if (icon_theme == null) return;

  icon_theme.add_search_path(icons_path);
}

function curl_available() {
  return GLib.find_program_in_path('curl');
}

function mogrify_available() {
  return GLib.find_program_in_path('mogrify');
}

export function get_final_icon_path(streamername) {
  return icons_path + '/' + get_icon_name(streamername) + '.png';
}

export function has_icon(streamername) {
  return GLib.file_test(get_final_icon_path(streamername), GLib.FileTest.EXISTS);
}

export function trigger_download_by_url(streamername, imageurl) {
  return new Promise((resolve, reject) => {
    if (!curl_available()) {
      resolve(false);
      return;
    }

    const final = get_final_icon_path(streamername);
    if (GLib.file_test(final, GLib.FileTest.EXISTS)) {
      resolve(true);
      return;
    }

    let ext = imageurl.split('.').pop().split('?')[0].toLowerCase();
    if (ext.length > 4) ext = 'png';

    const temp = GLib.build_filenamev([icons_path, 'tmp_' + new Date().getTime() + '.' + ext]);

    let curlCmd = ['curl', '-s', imageurl, '-o', temp];
    let proc = Gio.Subprocess.new(
      curlCmd,
      Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE
    );

    proc.wait_async(null, (proc, result) => {
      try {
        proc.wait_finish(result);
        if (!proc.get_successful()) {
          GLib.unlink(temp);
          resolve(false);
          return;
        }

        let fileInfo = Gio.File.new_for_path(temp).query_info('standard::size', Gio.FileQueryInfoFlags.NONE, null);
        if (fileInfo.get_size() === 0) {
          GLib.unlink(temp);
          resolve(false);
          return;
        }

        if (ext === 'png') {
          Gio.File.new_for_path(temp).move(Gio.File.new_for_path(final), Gio.FileCopyFlags.OVERWRITE, null, null);
          resolve(true);
        } else if (mogrify_available()) {
          let convCmd = ['mogrify', '-format', 'png', temp];
          let convProc = Gio.Subprocess.new(
            convCmd,
            Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE
          );
          convProc.wait_async(null, (convProc, res) => {
            try {
              convProc.wait_finish(res);
              let pngTemp = temp.replace(/\.[^.]+$/, '.png');
              if (GLib.file_test(pngTemp, GLib.FileTest.EXISTS)) {
                Gio.File.new_for_path(pngTemp).move(Gio.File.new_for_path(final), Gio.FileCopyFlags.OVERWRITE, null, null);
                if (GLib.file_test(temp, GLib.FileTest.EXISTS)) GLib.unlink(temp);
                resolve(true);
              } else {
                resolve(false);
              }
            } catch (e) {
              resolve(false);
            }
          });
        } else {
          GLib.unlink(temp);
          resolve(false);
        }
      } catch (e) {
        resolve(false);
      }
    });
  });
}

export function get_icon_name(streamername) {
  return 'parasocial-' + streamername.toLowerCase();
}

export function get_streamericon(streamername, style_class) {
  let icon = new imports.gi.St.Icon({
    gicon: Gio.icon_new_for_string(get_final_icon_path(streamername)),
    style_class: style_class
  });
  if (icon.set_fallback_icon_name) {
    icon.set_fallback_icon_name('parasocial');
  }
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
