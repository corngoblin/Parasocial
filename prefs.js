/**
  Parasocial – GNOME Shell Extension
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
import * as Api from './api.js';

// ---- Twitch API helpers (Soup 3) ----
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
                let response = JSON.parse(new TextDecoder().decode(bytes.get_data()));
                if (response.error) reject(response.error);
                else resolve(response.data);
            } catch (e) { reject(e); }
        });
    });
}

function _users(session, logins) {
    return _fetchJson(session, 'https://api.twitch.tv/helix/users?login=' + logins.join('&login='));
}
function _usersID(session, ids) {
    return _fetchJson(session, 'https://api.twitch.tv/helix/users?id=' + ids.join('&id='));
}
function _follows(session, userId) {
    return _fetchJson(session, 'https://api.twitch.tv/helix/channels/followed?user_id=' + encodeURIComponent(userId) + '&first=100');
}

// ---- Kick profile pic helper ----
function _fetchKickProfilePicUrl(session, username) {
    return new Promise((resolve) => {
        let url = `https://kick.com/api/v2/channels/${encodeURIComponent(username)}`;
        let message = Soup.Message.new('GET', url);
        message.request_headers.append('User-Agent', 'Mozilla/5.0 (compatible; Parasocial/1.0)');
        message.request_headers.append('Accept', 'application/json');
        session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null, (session, result) => {
            try {
                let data = JSON.parse(new TextDecoder().decode(session.send_and_read_finish(result).get_data()));
                resolve(data?.user?.profile_pic || null);
            } catch (e) { resolve(null); }
        });
    });
}

// ---- Prefs window ----
export default class TwitchLivePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        window.set_search_enabled(true);

        // Build all widgets once
        let builder = new Gtk.Builder();
        builder.add_from_file(this.dir.get_path() + '/prefs.xml');

        // Add pages
        window.add(builder.get_object('streamers_page'));
        window.add(builder.get_object('panel_page'));
        window.add(builder.get_object('commands_page'));

        // --- Bind settings ---
        const settings = this.getSettings();
        settings.bind('interval', builder.get_object('field_interval'), 'value', Gio.SettingsBindFlags.DEFAULT);
        settings.bind('opencmd', builder.get_object('field_opencmd'), 'text', Gio.SettingsBindFlags.DEFAULT);
        settings.bind('kick-opencmd', builder.get_object('field_kickopencmd'), 'text', Gio.SettingsBindFlags.DEFAULT);
        settings.bind('hideplaylists', builder.get_object('field_hideplaylists'), 'active', Gio.SettingsBindFlags.DEFAULT);
        settings.bind('notifications-enabled', builder.get_object('field_notifications-enabled'), 'active', Gio.SettingsBindFlags.DEFAULT);
        settings.bind('notifications-game-change', builder.get_object('field_notifications-game-change'), 'active', Gio.SettingsBindFlags.DEFAULT);
        settings.bind('notifications-streamer-icon', builder.get_object('field_notifications-streamer-icon'), 'active', Gio.SettingsBindFlags.DEFAULT);
        settings.bind('hideempty', builder.get_object('field_hideempty'), 'active', Gio.SettingsBindFlags.DEFAULT);
        settings.bind('hidestatus', builder.get_object('field_hidestatus'), 'active', Gio.SettingsBindFlags.DEFAULT);
        settings.bind('showuptime', builder.get_object('field_showuptime'), 'active', Gio.SettingsBindFlags.DEFAULT);
        settings.bind('topbarmode', builder.get_object('field_topbarmode'), 'active-id', Gio.SettingsBindFlags.DEFAULT);
        settings.bind('sortkey', builder.get_object('field_sortkey'), 'active-id', Gio.SettingsBindFlags.DEFAULT);

        // Notification sub‑options sensitivity
        const updateNotifSensitivity = () => {
            let enabled = settings.get_boolean('notifications-enabled');
            builder.get_object('field_notifications-game-change').sensitive = enabled;
            builder.get_object('field_notifications-streamer-icon').sensitive = enabled;
        };
        updateNotifSensitivity();
        builder.get_object('field_notifications-enabled').connect('notify::active', updateNotifSensitivity);

        // --- Streamer list ---
        const store = new Gtk.ListStore();
        store.set_column_types([GObject.TYPE_STRING, GObject.TYPE_STRING]);
        const view = builder.get_object('field_streamerslist');
        view.model = store;

        const col = new Gtk.TreeViewColumn({ expand: true, sort_column_id: 0, title: _('Streamer name') });
        const iconRenderer = new Gtk.CellRendererPixbuf({ icon_name: 'avatar-default-symbolic' });
        col.pack_start(iconRenderer, false);
        const textRenderer = new Gtk.CellRendererText({ editable: true });
        textRenderer.connect('edited', (renderer, path, newText) => {
            let [ok, iter] = store.get_iter_from_string(path);
            if (ok) {
                if (newText.trim()) {
                    store.set(iter, [0, 1], [newText, Icons.get_icon_name(newText)]);
                } else {
                    let name = store.get_value(iter, 0);
                    store.remove(iter);
                    let idx = streamersList.indexOf(name);
                    if (idx >= 0) streamersList.splice(idx, 1);
                }
                saveStreamersList();
                reloadStreamersList();
                if (newText.trim()) retrieveIcons(newText.trim());
            }
        });
        col.pack_start(textRenderer, true);
        col.add_attribute(textRenderer, 'text', 0);
        col.add_attribute(iconRenderer, 'icon-name', 1);
        view.append_column(col);

        let streamersList = [];

        const appendStreamer = (fullName) => {
            if (!streamersList.includes(fullName)) streamersList.push(fullName);
            let iter = store.append();
            store.set(iter, [0, 1], [fullName, Icons.get_icon_name(fullName)]);
            return iter;
        };

        const reloadStreamersList = () => {
            let raw = settings.get_string('streamers').split(',').map(s => s.trim()).filter(Boolean);
            streamersList = [];
            store.clear();
            raw.forEach(name => appendStreamer(name));
            retrieveIcons();
        };

        const saveStreamersList = () => {
            let names = [];
            store.foreach((model, path, iter) => names.push(model.get_value(iter, 0)));
            let unique = names.reduce((prev, cur) =>
                prev.some(u => u.toLowerCase() === cur.toLowerCase()) ? prev : prev.concat(cur), []);
            settings.set_string('streamers', unique.join(','));
        };

        // --- Icon helpers ---
        const session = Soup.Session.new();
        Icons.init_icons();

        const retrieveIcons = (oneStreamer = null) => {
            const download = async (fullName) => {
                if (fullName.startsWith('kick:')) {
                    const pic = await _fetchKickProfilePicUrl(session, fullName.substring(5));
                    if (pic) await Icons.trigger_download_by_url(fullName, pic);
                } else {
                    const name = fullName.startsWith('twitch:') ? fullName.substring(7) : fullName;
                    try {
                        const data = await _users(session, [name]);
                        if (data?.[0]?.profile_image_url) await Icons.trigger_download_by_url(fullName, data[0].profile_image_url);
                    } catch (e) {}
                }
            };
            if (oneStreamer) {
                if (!Icons.has_icon(oneStreamer)) download(oneStreamer).catch(() => {});
            } else {
                streamersList.filter(s => !Icons.has_icon(s)).forEach(s => download(s).catch(() => {}));
            }
        };

        // --- Event Listeners and Dialog Setup ---
        
        // Twitch Add Dialog
        let twitchDlg = builder.get_object('TwitchStreamerDialog');
        twitchDlg.connect('response', (dialog, response) => {
            if (response === 'ok') {
                let entry = builder.get_object('TwitchStreamerDialog-entry');
                let name = entry.get_text().trim();
                entry.set_text('');
                if (name) {
                    appendStreamer('twitch:' + name);
                    saveStreamersList();
                    reloadStreamersList();
                    retrieveIcons('twitch:' + name);
                }
            }
        });
        builder.get_object('add_twitch_streamer').connect('clicked', () => twitchDlg.present());

        // Kick Add Dialog
        let kickDlg = builder.get_object('KickStreamerDialog');
        kickDlg.connect('response', (dialog, response) => {
            if (response === 'ok') {
                let entry = builder.get_object('KickStreamerDialog-entry');
                let name = entry.get_text().trim();
                entry.set_text('');
                if (name) {
                    appendStreamer('kick:' + name);
                    saveStreamersList();
                    reloadStreamersList();
                    retrieveIcons('kick:' + name);
                }
            }
        });
        builder.get_object('add_kick_streamer').connect('clicked', () => kickDlg.present());

        // Streamer Removal
        builder.get_object('del_streamer').connect('clicked', () => {
            let [sel, model, iter] = view.get_selection().get_selected();
            if (sel) {
                let name = model.get_value(iter, 0);
                model.remove(iter);
                let idx = streamersList.indexOf(name);
                if (idx >= 0) streamersList.splice(idx, 1);
                saveStreamersList();
            }
        });

        builder.get_object('del_all_streamers').connect('clicked', () => {
            streamersList = [];
            store.clear();
            saveStreamersList();
        });

        // Twitch Import Dialog
        let importDlg = builder.get_object('UserPromptDialog');
        importDlg.connect('response', (dialog, response) => {
            if (response === 'ok') {
                let entry = builder.get_object('UserPromptDialog-entry');
                let username = entry.get_text().trim();
                entry.set_text('');
                if (username) {
                    _users(session, [username]).then(data => {
                        if (data?.length > 0 && data[0].id) {
                            _follows(session, data[0].id).then(follows => {
                                let ids = follows.map(f => f.broadcaster_id);
                                _usersID(session, ids).then(users => {
                                    users.forEach(u => appendStreamer('twitch:' + u.login));
                                    saveStreamersList();
                                    reloadStreamersList();
                                });
                            });
                        }
                    }).catch(() => {});
                }
            }
        });
        builder.get_object('import_from_twitch').connect('clicked', () => importDlg.present());

        // Utilities
        builder.get_object('authenticate_oauth').connect('clicked', () => {
            Api.trigger_oauth(this.dir.get_path());
        });

        builder.get_object('refresh_icons').connect('clicked', () => {
            Icons.refresh_all_icons(session, streamersList, _users, _fetchKickProfilePicUrl);
        });

        // Initial load
        reloadStreamersList();
    }
}
