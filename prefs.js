/**
  AUTHOR: Mario Wenzel
  LICENSE: GPL3.0
**/
import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import GObject from 'gi://GObject';
import Soup from 'gi://Soup?version=3.0';

import * as Config from 'resource:///org/gnome/Shell/Extensions/js/misc/config.js';
const [major] = Config.PACKAGE_VERSION.split('.');
const shellVersion = Number.parseInt(major);

import * as Icons from './icons.js';
import * as Api from './api.js';   // only for trigger_oauth

// ---- local Twitch API helpers (Soup 3) ----
const client_id = "1zat8h7je94boq5t88of6j09p41hg0";
const oauth_token_path = GLib.get_user_cache_dir() + '/parasocial-extension/oauth_token';

function get_token() {
    let tokenfile = Gio.File.new_for_path(oauth_token_path);
    if (tokenfile.query_exists(null)) {
        let [success, content, tag] = tokenfile.load_contents(null);
        return new TextDecoder().decode(content);
    }
    return undefined;
}

function _fetchJson(session, url) {
    return new Promise((resolve, reject) => {
        let message = Soup.Message.new('GET', url);
        message.request_headers.append('Client-ID', client_id);
        let token = get_token();
        if (token) message.request_headers.append('Authorization', 'Bearer ' + token);

        session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null, (session, result) => {
            try {
                let bytes = session.send_and_read_finish(result);
                let decoder = new TextDecoder('utf-8');
                let response = decoder.decode(bytes.get_data());
                let data = JSON.parse(response);
                if (data.error) reject(data);
                else resolve(data.data);
            } catch (e) {
                reject(e);
            }
        });
    });
}

function _users(session, userLogins) {
    let url = 'https://api.twitch.tv/helix/users?login=' + userLogins.join('&login=');
    return _fetchJson(session, url);
}

function _usersID(session, ids) {
    let url = 'https://api.twitch.tv/helix/users?id=' + ids.join('&id=');
    return _fetchJson(session, url);
}

function _follows(session, userId) {
    let url = 'https://api.twitch.tv/helix/channels/followed?user_id=' + encodeURIComponent(userId) + '&first=100';
    return _fetchJson(session, url);
}

// ---- Kick API helper (Soup 3) ----
function _fetchKickProfilePicUrl(session, username) {
    return new Promise((resolve, reject) => {
        let url = `https://kick.com/api/v2/channels/${encodeURIComponent(username)}`;
        let message = Soup.Message.new('GET', url);
        message.request_headers.append('User-Agent', 'Mozilla/5.0 (compatible; Parasocial/1.0)');
        message.request_headers.append('Accept', 'application/json');
        session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null, (session, result) => {
            try {
                let bytes = session.send_and_read_finish(result);
                let decoder = new TextDecoder('utf-8');
                let response = decoder.decode(bytes.get_data());
                let data = JSON.parse(response);
                if (data && data.user && data.user.profile_pic) {
                    resolve(data.user.profile_pic);
                } else {
                    resolve(null);
                }
            } catch (e) {
                resolve(null);
            }
        });
    });
}
// ---------------------------------------------

class App extends Adw.PreferencesGroup {
  static {
        GObject.registerClass(this);
  }
  constructor(extensionDir, path, settings) {
    super();
    this.settings = settings;
    this.path = path;
    this._httpSession = Soup.Session.new();

    Icons.init_icons();

    let buildable = new Gtk.Builder();
    buildable.add_from_file( extensionDir.get_path() + '/prefs.xml' );

    this._buildable = buildable;
    this.main = buildable.get_object('prefs-widget');
    this.settings.bind('interval', buildable.get_object('field_interval'), 'value', Gio.SettingsBindFlags.DEFAULT);
    this.settings.bind('opencmd', buildable.get_object('field_opencmd'), 'text', Gio.SettingsBindFlags.DEFAULT);
    this.settings.bind('kick-opencmd', buildable.get_object('field_kickopencmd'), 'text', Gio.SettingsBindFlags.DEFAULT);
    this.settings.bind('hideplaylists', buildable.get_object('field_hideplaylists'), 'active', Gio.SettingsBindFlags.DEFAULT);
    this.settings.bind('notifications-enabled', buildable.get_object('field_notifications-enabled'), 'active', Gio.SettingsBindFlags.DEFAULT);
    this.settings.bind('notifications-game-change', buildable.get_object('field_notifications-game-change'), 'active', Gio.SettingsBindFlags.DEFAULT);
    this.settings.bind('notifications-streamer-icon', buildable.get_object('field_notifications-streamer-icon'), 'active', Gio.SettingsBindFlags.DEFAULT);
    this.settings.bind('hideempty', buildable.get_object('field_hideempty'), 'active', Gio.SettingsBindFlags.DEFAULT);
    this.settings.bind('hidestatus', buildable.get_object('field_hidestatus'), 'active', Gio.SettingsBindFlags.DEFAULT);
    this.settings.bind('showuptime', buildable.get_object('field_showuptime'), 'active', Gio.SettingsBindFlags.DEFAULT);
    
    const updateNotificationOptions = () => {
      var notificationsEnabled = this.settings.get_boolean('notifications-enabled');
      buildable.get_object('obj_notifications-game-change').sensitive = notificationsEnabled;
      buildable.get_object('obj_notifications-streamer-icon').sensitive = notificationsEnabled;
    };

    updateNotificationOptions();

    buildable.get_object('field_notifications-enabled').connect('notify::active', () => updateNotificationOptions());
    buildable.get_object('add_twitch_streamer').connect('clicked', this._showTwitchDialog.bind(this));
    buildable.get_object('add_kick_streamer').connect('clicked', this._showKickDialog.bind(this));
    buildable.get_object('del_streamer').connect('clicked', this._delStreamer.bind(this));
    buildable.get_object('del_all_streamers').connect('clicked', this._delAllStreamers.bind(this));
    buildable.get_object('import_from_twitch').connect('clicked', this._importFromTwitch.bind(this));
    buildable.get_object('authenticate_oauth').connect('clicked', this._authenticateOauth.bind(this));
    buildable.get_object('refresh_icons').connect('clicked', this._refreshAllIcons.bind(this));

    this.streamersList = buildable.get_object('field_streamerslist');
    this.sortkeyStore = buildable.get_object('StreamSort_ListStore');
    this.topbardisplayStore = buildable.get_object('TopBarDisplay_ListStore');

    [
      ['empty', _('Only indicator')],
      ['text-only', _('Streamers names')],
      ['count-only', _('Number of live streams')],
      ['icon-only', _('Streamers icons')],
      ['all-icons', _('Streamers icons (all)')]
    ].forEach( function(element) {
      let iter = this.topbardisplayStore.append();
      this.topbardisplayStore.set(iter, [0, 1], element);
    }, this);
    this.settings.bind('topbarmode', buildable.get_object('field_topbarmode'), 'active-id', Gio.SettingsBindFlags.DEFAULT);

    [ ['NAME', _('Streamer name')],
      ['GAME', _('Game title')],
      ['COUNT', _('Viewers count')],
      ['UPTIME', _('Stream uptime')] ].forEach( function(element) {
      let iter = this.sortkeyStore.append();
      this.sortkeyStore.set(iter, [0, 1], element);
    }, this);
    this.settings.bind('sortkey', buildable.get_object('field_sortkey'), 'active-id', Gio.SettingsBindFlags.DEFAULT);

    this.store = new Gtk.ListStore();
    this.store.set_column_types([GObject.TYPE_STRING, GObject.TYPE_STRING]);
    this.streamersList.model = this.store;

    this.nameCol = new Gtk.TreeViewColumn( { expand: true, sort_column_id: 0, title: _("Streamer name") });
    this.iconColRenderer = new Gtk.CellRendererPixbuf( {icon_name: 'avatar-default-symbolic'} );
    this.nameCol.pack_start(this.iconColRenderer, false);
    this.nameColRenderer = new Gtk.CellRendererText( {editable: true} );
    this.nameColRenderer.connect('edited', this._cellEdited.bind(this));
    this.nameCol.pack_start(this.nameColRenderer, true);
    this.nameCol.add_attribute(this.nameColRenderer, "text", 0);
    this.nameCol.add_attribute(this.iconColRenderer, "icon-name", 1);

    this.streamersList.append_column(this.nameCol);

    this._reloadStreamersList();

    if (this.main.show_all) this.main.show_all();
  }

  _showTwitchDialog() {
    if (!this._twitchDialog) {
      this._twitchDialog = this._buildable.get_object("TwitchStreamerDialog");
      this._twitchDialog.connect('response', (dialog, response_id) => {
        const entry = this._buildable.get_object("TwitchStreamerDialog-entry");
        const username = entry.get_text().trim();
        entry.set_text('');
        dialog.hide();
        if (response_id === Gtk.ResponseType.OK && username) {
          this._appendStreamer('twitch:' + username);
          this._saveStreamersList();
          this._reloadStreamersList();
          this._retrieveStreamerIcons();
        }
      });
    }
    this._twitchDialog.present();
  }

  _showKickDialog() {
    if (!this._kickDialog) {
      this._kickDialog = this._buildable.get_object("KickStreamerDialog");
      this._kickDialog.connect('response', (dialog, response_id) => {
        const entry = this._buildable.get_object("KickStreamerDialog-entry");
        const username = entry.get_text().trim();
        entry.set_text('');
        dialog.hide();
        if (response_id === Gtk.ResponseType.OK && username) {
          this._appendStreamer('kick:' + username);
          this._saveStreamersList();
          this._reloadStreamersList();
          this._retrieveStreamerIcons();
        }
      });
    }
    this._kickDialog.present();
  }

  _importFromTwitch() {
    this._showUserPromptDialog( (textbox, messagedialog, response_id) => {
      let username = textbox.get_text();
      messagedialog.hide();
      if(response_id === Gtk.ResponseType.OK){
        _users(this._httpSession, [username]).then((data) => {
          if (data && data.length > 0) {
            const user = data[0];
            if (user.id) {
              _follows(this._httpSession, user.id).then((follows) => {
                var followsIDs = follows.map(x => x.broadcaster_id);
                _usersID(this._httpSession, followsIDs).then((userdata) => {
                    userdata.forEach(follow => this._appendStreamer('twitch:' + follow.login));
                    this._saveStreamersList();
                    this._reloadStreamersList();
                    this._retrieveStreamerIcons();
                });
              });
            }
          }
        });
      }
    });
  }

  _authenticateOauth() {
    Api.trigger_oauth(this.path);
  }

  _showUserPromptDialog(callback) {
    if( !this._messageDialog ) {
      this._messageDialog = this._buildable.get_object("UserPromptDialog");
      this._messageDialog.connect ('response', callback.bind(null, this._buildable.get_object("UserPromptDialog-entry")).bind(this));
    }
    if (this._messageDialog.show_all) {
      this._messageDialog.show_all();
    } else {
      this._messageDialog.show();
    }
  }

  _cellEdited(renderer, path, new_text) {
    let [ok, iter] = this.store.get_iter_from_string(path);
    if ( ok ) {
      if (new_text) {
        this.store.set(iter, [0, 1], [new_text, Icons.get_icon_name(new_text)]);
      } else {
        this._removeStreamer(iter);
      }
      this._saveStreamersList();
      this._reloadStreamersList();
      if (new_text) {
        this._retrieveStreamerIcons(new_text);
      }
    }
  }

  _removeStreamer(iter) {
    let name = this.store.get_value(iter, 0);
    this.store.remove(iter);
    let index = this.streamers.indexOf(name);
    if (index >= 0) this.streamers.splice(index, 1);
  }

  _appendStreamer(name) {
    if (!this.streamers.includes(name)) {
      this.streamers.push(name);
    }
    let iter = this.store.append();
    this.store.set(iter, [0, 1], [name, Icons.get_icon_name(name)]);
    return iter;
  }

  _delStreamer() {
    let [selection, model, iter] = this.streamersList.get_selection().get_selected();
    if (selection) {
      this._removeStreamer(iter);
      this._saveStreamersList();
    }
  }

  _delAllStreamers() {
    this.streamers = [];
    this.store.clear();
    this._saveStreamersList();
  }

  _saveStreamersList() {
    let names = [];
    this.store.foreach((model, path, iter) => {
      names.push(model.get_value(iter, 0));
    });
    let unique = names.reduce((prev, username) => {
      return prev.some(u => u.toLowerCase() === username.toLowerCase()) ?
        prev : prev.concat(username);
    }, []);
    this.settings.set_string('streamers', unique.join(','));
  }

  _reloadStreamersList() {
    let old_streamers = this.settings.get_string('streamers').split(',').sort((a,b) => a.toUpperCase() < b.toUpperCase() ? -1 : 1);
    this.streamers = [];
    this.store.clear();
    for (let i = 0; i < old_streamers.length; i++) {
      let name = old_streamers[i].trim();
      if (!name) continue;
      this._appendStreamer(name);
    }
    this._retrieveStreamerIcons();
  }

  _retrieveStreamerIcons(streamer) {
    const session = this._httpSession;
    const downloadIcon = async (fullName) => {
      if (fullName.startsWith('kick:')) {
        const name = fullName.substring(5);
        const picUrl = await _fetchKickProfilePicUrl(session, name);
        if (picUrl) {
          await Icons.trigger_download_by_url(fullName, picUrl);
        }
      } else {
        const name = fullName.startsWith('twitch:') ? fullName.substring(7) : fullName;
        try {
          const data = await _users(session, [name]);
          if (data && data.length > 0 && data[0].profile_image_url) {
            await Icons.trigger_download_by_url(fullName, data[0].profile_image_url);
          }
        } catch (e) {}
      }
    };

    if (streamer === undefined) {
      const promises = this.streamers
        .filter(s => !Icons.has_icon(s))
        .map(s => downloadIcon(s));
      Promise.all(promises).catch(() => {});
    } else {
      if (!Icons.has_icon(streamer)) {
        downloadIcon(streamer).catch(() => {});
      }
    }
  }

  _refreshAllIcons() {
    Icons.refresh_all_icons(this._httpSession, this.streamers, _users, _fetchKickProfilePicUrl);
  }
}

export default class TwitchLivePreferences extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    const page = new Adw.PreferencesPage();
    window.add(page);

    const group = new Adw.PreferencesGroup();
    page.add(group);
    
    const widget = new App(this.dir, this.path, this.getSettings());
    group.add(widget.main);
  }
}
