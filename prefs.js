/**
  Parasocial – GNOME Shell Extension
  LICENSE: GPL3.0
**/
import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import Adw from 'gi://Adw';
import GObject from 'gi://GObject';
import Soup from 'gi://Soup?version=3.0';

import * as Icons from './icons.js';
import * as Api from './api.js';

const client_id = "1zat8h7je94boq5t88of6j09p41hg0";
const oauth_token_path = GLib.get_user_cache_dir() + '/parasocial-extension/oauth_token';

// ---------------- TOKEN ----------------
function get_token() {
    let file = Gio.File.new_for_path(oauth_token_path);
    if (file.query_exists(null)) {
        let [, content] = file.load_contents(null);
        return new TextDecoder().decode(content);
    }
    return null;
}

// ---------------- TWITCH API ----------------
function _fetchJson(session, url) {
    return new Promise((resolve, reject) => {
        let msg = Soup.Message.new('GET', url);
        msg.request_headers.append('Client-ID', client_id);
        let token = get_token();
        if (token) msg.request_headers.append('Authorization', 'Bearer ' + token);
        session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null, (s, r) => {
            try {
                let bytes = s.send_and_read_finish(r);
                let data = JSON.parse(new TextDecoder().decode(bytes.get_data()));
                if (data.error) reject(data.error);
                else resolve(data.data);
            } catch (e) { reject(e); }
        });
    });
}

function _users(session, logins) {
    return _fetchJson(session, `https://api.twitch.tv/helix/users?login=${logins.join('&login=')}`);
}
function _usersID(session, ids) {
    return _fetchJson(session, `https://api.twitch.tv/helix/users?id=${ids.join('&id=')}`);
}
function _follows(session, userId) {
    return _fetchJson(session, `https://api.twitch.tv/helix/channels/followed?user_id=${userId}&first=100`);
}

// ---------------- KICK ----------------
function _fetchKickProfilePicUrl(session, username) {
    return new Promise((resolve) => {
        let msg = Soup.Message.new('GET', `https://kick.com/api/v2/channels/${encodeURIComponent(username)}`);
        msg.request_headers.append('User-Agent', 'Parasocial/1.0');
        session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null, (s, r) => {
            try {
                let data = JSON.parse(new TextDecoder().decode(s.send_and_read_finish(r).get_data()));
                resolve(data?.user?.profile_pic || null);
            } catch { resolve(null); }
        });
    });
}

// ---------------- PREFS ----------------
export default class TwitchLivePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        window.set_search_enabled(true);
        window.set_default_size(600, 880);

        // Icon theme setup – allowed in preferences process
        const iconsPath = GLib.get_user_cache_dir() + '/parasocial-extension';
        GLib.mkdir_with_parents(iconsPath, 448);
        const display = Gdk.Display.get_default();
        if (display) {
            const iconTheme = Gtk.IconTheme.get_for_display(display);
            if (iconTheme) iconTheme.add_search_path(iconsPath);
        }

        GLib.setenv('GSETTINGS_SCHEMA_DIR', this.dir.get_child('schemas').get_path(), true);

        const builder = new Gtk.Builder();
        builder.add_from_file(this.dir.get_path() + '/prefs.xml');

        window.add(builder.get_object('streamers_page'));
        window.add(builder.get_object('panel_page'));
        window.add(builder.get_object('commands_page'));

        const settings = this.getSettings();

        // ── 1. FILL COMBOBOX STORES (fixes the empty Appearance settings) ──
        const topbarStore = builder.get_object('TopBarDisplay_ListStore');
        [
            ['empty', _('Only indicator')],
            ['text-only', _('Streamers names')],
            ['count-only', _('Number of live streams')],
            ['icon-only', _('Streamers icons')],
            ['all-icons', _('Streamers icons (all)')]
        ].forEach(([id, label]) => {
            let iter = topbarStore.append();
            topbarStore.set(iter, [0, 1], [id, label]);
        });

        const sortStore = builder.get_object('StreamSort_ListStore');
        [
            ['NAME', _('Streamer name')],
            ['GAME', _('Game title')],
            ['COUNT', _('Viewers count')],
            ['UPTIME', _('Stream uptime')]
        ].forEach(([id, label]) => {
            let iter = sortStore.append();
            sortStore.set(iter, [0, 1], [id, label]);
        });

        // ── 2. SETTINGS BINDINGS ──
        settings.bind('interval', builder.get_object('field_interval'), 'value', Gio.SettingsBindFlags.DEFAULT);
        settings.bind('title-length', builder.get_object('field_title_length'), 'value', Gio.SettingsBindFlags.DEFAULT);
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

        const updateNotifSensitivity = () => {
            let enabled = settings.get_boolean('notifications-enabled');
            builder.get_object('field_notifications-game-change').sensitive = enabled;
            builder.get_object('field_notifications-streamer-icon').sensitive = enabled;
        };
        updateNotifSensitivity();
        builder.get_object('field_notifications-enabled').connect('notify::active', updateNotifSensitivity);

        // ── 3. STREAMER LIST (your working code) ──
        const store = new Gtk.ListStore();
        store.set_column_types([GObject.TYPE_STRING, GObject.TYPE_STRING]);
        const view = builder.get_object('field_streamerslist');
        view.set_model(store);

        const session = Soup.Session.new();
        const streamers = new Set();

        function refreshView() {
            view.queue_draw();
            view.queue_resize();
        }

        function appendStreamer(name) {
            if (streamers.has(name)) return;
            streamers.add(name);
            let iter = store.append();
            store.set(iter, [0, 1], [name, Icons.get_icon_name(name)]);
            refreshView();
        }

        function saveStreamers() {
            let list = [];
            store.foreach((model, path, iter) => {
                list.push(model.get_value(iter, 0));
                return false;
            });
            settings.set_string('streamers', list.join(','));
        }

        function loadStreamers() {
            streamers.clear();
            store.clear();
            let raw = settings.get_string('streamers').split(',').map(s => s.trim()).filter(Boolean);
            raw.forEach(appendStreamer);
            refreshIcons();
        }

        function refreshIcons(one = null) {
            const run = async (full) => {
                if (full.startsWith('kick:')) {
                    let pic = await _fetchKickProfilePicUrl(session, full.slice(5));
                    if (pic) await Icons.trigger_download_by_url(full, pic);
                } else {
                    let name = full.replace(/^twitch:/, '');
                    try {
                        let data = await _users(session, [name]);
                        if (data?.[0]?.profile_image_url)
                            await Icons.trigger_download_by_url(full, data[0].profile_image_url);
                    } catch {}
                }
            };
            (one ? [one] : [...streamers]).forEach(s => run(s));
        }

        const col = new Gtk.TreeViewColumn({ title: _('Streamer name'), expand: true });
        const iconRenderer = new Gtk.CellRendererPixbuf();
        col.pack_start(iconRenderer, false);
        col.add_attribute(iconRenderer, 'icon-name', 1);
        const textRenderer = new Gtk.CellRendererText({ editable: true });
        col.pack_start(textRenderer, true);
        col.add_attribute(textRenderer, 'text', 0);
        textRenderer.connect('edited', (r, path, newText) => {
            let [ok, iter] = store.get_iter_from_string(path);
            if (!ok) return;
            newText = newText.trim();
            if (!newText) {
                store.remove(iter);
                saveStreamers();
                refreshView();
                return;
            }
            store.set(iter, [0, 1], [newText, Icons.get_icon_name(newText)]);
            saveStreamers();
            refreshView();
        });
        view.append_column(col);

        // ── 4. DIALOGS (your proven pattern) ──
        function createDialog(title, body, placeholder) {
            const entry = new Gtk.Entry({ placeholder_text: placeholder, activates_default: true });
            const dialog = new Adw.MessageDialog({
                transient_for: window,
                heading: title,
                body,
                default_response: 'ok',
                close_response: 'cancel'
            });
            dialog.set_extra_child(entry);
            dialog.add_response('cancel', _('Cancel'));
            dialog.add_response('ok', _('Add'));
            dialog.set_response_appearance('ok', Adw.ResponseAppearance.SUGGESTED);
            return { dialog, entry };
        }

        builder.get_object('add_twitch_streamer').connect('clicked', () => {
            const { dialog, entry } = createDialog(_('Add Twitch Streamer'), _('Enter Twitch username'), 'username');
            dialog.connect('response', (dlg, resp) => {
                if (resp === 'ok') {
                    const name = entry.get_text().trim();
                    if (name) {
                        appendStreamer('twitch:' + name);
                        saveStreamers();
                        refreshIcons('twitch:' + name);
                    }
                }
                dlg.destroy();
            });
            dialog.present();
        });

        builder.get_object('add_kick_streamer').connect('clicked', () => {
            const { dialog, entry } = createDialog(_('Add Kick Streamer'), _('Enter Kick username'), 'username');
            dialog.connect('response', (dlg, resp) => {
                if (resp === 'ok') {
                    const name = entry.get_text().trim();
                    if (name) {
                        appendStreamer('kick:' + name);
                        saveStreamers();
                        refreshIcons('kick:' + name);
                    }
                }
                dlg.destroy();
            });
            dialog.present();
        });

        builder.get_object('del_streamer').connect('clicked', () => {
            let [ok, model, iter] = view.get_selection().get_selected();
            if (ok) {
                let name = model.get_value(iter, 0);
                streamers.delete(name);
                model.remove(iter);
                saveStreamers();
                refreshView();
            }
        });

        builder.get_object('del_all_streamers').connect('clicked', () => {
            streamers.clear();
            store.clear();
            saveStreamers();
            refreshView();
        });

        let importing = false;
        const importBtn = builder.get_object('import_from_twitch');
        importBtn.connect('clicked', () => {
            if (importing) return;
            const { dialog, entry } = createDialog(_('Import Twitch Follows'), _('Enter Twitch username'), 'username');
            dialog.connect('response', async (dlg, resp) => {
                if (resp !== 'ok') { dlg.destroy(); return; }
                const username = entry.get_text().trim();
                dlg.destroy();
                if (!username) return;
                importing = true;
                importBtn.label = _('Importing...');
                try {
                    let user = await _users(session, [username]);
                    let follows = await _follows(session, user[0].id);
                    let ids = follows.map(f => f.broadcaster_id);
                    let users = await _usersID(session, ids);
                    users.forEach(u => appendStreamer('twitch:' + u.login));
                    saveStreamers();
                    refreshIcons();
                } catch (e) {
                    console.error('[Parasocial import]', e);
                }
                importing = false;
                importBtn.label = _('Import from Twitch');
            });
            dialog.present();
        });

        builder.get_object('authenticate_oauth').connect('clicked', () => {
            Api.trigger_oauth(this.dir.get_path());
        });

        builder.get_object('refresh_icons').connect('clicked', () => {
            Icons.refresh_all_icons(session, [...streamers], _users, _fetchKickProfilePicUrl);
        });

        loadStreamers();
    }
}
