/**
  AUTHOR: Mario Wenzel
  LICENSE: GPL3.0
**/
import Soup from 'gi://Soup'
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

const api_base = 'https://api.twitch.tv/helix/';
const client_id = "1zat8h7je94boq5t88of6j09p41hg0";
const oauth_token_path = GLib.get_user_cache_dir() + '/parasocial-extension/oauth_token';

/* OAuth */

export function trigger_oauth(extension_path) {
  const url = "https://id.twitch.tv/oauth2/authorize?response_type=token&client_id=" + client_id + "&redirect_uri=http://localhost:8877&scope=user%3Aread%3Afollows";
  const oauth_receiver = GLib.build_filenamev([extension_path, 'oauth_receive.js']);

  // The receiver is a GJS script: gjs is always present on a GNOME desktop, so
  // this needs no interpreter from PATH beyond the one the Shell itself needs.
  let success = false;
  try {
    [success] = GLib.spawn_async(
      null,
      ['gjs', '-m', oauth_receiver, oauth_token_path],
      null,
      GLib.SpawnFlags.SEARCH_PATH,
      null
    );
  } catch (e) {
    log(`Parasocial: failed to start the OAuth receiver: ${e.message}`);
  }

  if (!success) {
    log("Parasocial: Failed to launch OAuth receiver script.");
    return;
  }

  GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
    Gio.AppInfo.launch_default_for_uri(url, null);
    return GLib.SOURCE_REMOVE;
  });
}

export function get_token() {
  let tokenfile = Gio.File.new_for_path(oauth_token_path);
  if (tokenfile.query_exists(null)) {
    let [success, content, tag] = tokenfile.load_contents(null);
    return new TextDecoder().decode(content);
  }
  return undefined;
}

export function load_json_async(httpSession, url, headers, callback) {
  let message = Soup.Message.new('GET', url);
  if (headers) {
    for (let [key, value] of Object.entries(headers)) {
      message.requestHeaders.append(key, value);
    }
  }

  httpSession.send_and_read_async(
    message,
    GLib.PRIORITY_DEFAULT,
    null,
    (session, result) => {
      let bytes = session.send_and_read_finish(result);
      let decoder = new TextDecoder('utf-8');
      let response = decoder.decode(bytes.get_data());
      let data = JSON.parse(response);
      callback(data);
    }
  );
}
