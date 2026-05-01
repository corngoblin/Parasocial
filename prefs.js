/**
  Parasocial – GNOME Shell Extension
  LICENSE: GPL3.0
**/
import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import Adw from 'gi://Adw';
import GObject from 'gi://GObject';
import Soup from 'gi://Soup?version=3.0';

import * as Icons from './icons.js';
import * as Api from './api.js';

const CLIENT_ID = "1zat8h7je94boq5t88of6j09p41hg0";
const TOKEN_PATH = `${GLib.get_user_cache_dir()}/parasocial-extension/oauth_token`;

// --- API Helpers ---
function get_token() {
    const file = Gio.File.new_for_path(TOKEN_PATH);
    if (!file.query_exists(null)) return null;
    return new TextDecoder().decode(file.load_contents(null)[1]);
}

function _fetchJson(session, url) {
    return new Promise((resolve, reject) => {
        const msg = Soup.Message.new('GET', url);
        msg.request_headers.append('Client-ID', CLIENT_ID);
        
        const token = get_token();
        if (token) msg.request_headers.append('Authorization', `Bearer ${token}`);
        
        session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null, (s, r) => {
            try {
                const data = JSON.parse(new TextDecoder().decode(s.send_and_read_finish(r).get_data()));
                data.error ? reject(data.error) : resolve(data.data || data);
            } catch (e) { reject(e); }
        });
    });
}

const _users = (s, logins) => _fetchJson(s, `https://api.twitch.tv/helix/users?login=${logins.join('&login=')}`);
const _usersID = (s, ids) => _fetchJson(s, `https://api.twitch.tv/helix/users?id=${ids.join('&id=')}`);
const _follows = (s, userId) => _fetchJson(s, `https://api.twitch.tv/helix/channels/followed?user_id=${userId}&first=100`);

function _fetchKickProfilePicUrl(session, username) {
    return new Promise((resolve) => {
        const msg = Soup.Message.new('GET', `https://kick.com/api/v2/channels/${encodeURIComponent(username)}`);
        msg.request_headers.append('User-Agent', 'Parasocial/1.0');
        session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null, (s, r) => {
            try {
                const data = JSON.parse(new TextDecoder().decode(s.send_and_read_finish(r).get_data()));
                resolve(data?.user?.profile_pic || null);
            } catch { resolve(null); }
        });
    });
}

// --- Preferences Class ---
export default class TwitchLivePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        window.set_search_enabled(true);
        window.set_default_size(600, 880);

        // Icon Theme Setup
        const iconsPath = `${GLib.get_user_cache_dir()}/parasocial-extension`;
        GLib.mkdir_with_parents(iconsPath, 448);
        const display = Gdk.Display.get_default();
        if (display) {
        Gtk.IconTheme.get_for_display(display)?.add_search_path(iconsPath);
        }

        GLib.setenv('GSETTINGS_SCHEMA_DIR', this.dir.get_child('schemas').get_path(), true);

        const builder = new Gtk.Builder();
        builder.add_from_file(`${this.dir.get_path()}/prefs.xml`);

        ['streamers_page', 'panel_page', 'commands_page'].forEach(p => window.add(builder.get_object(p)));

        const settings = this.getSettings();

        // 1. Populate Comboboxes
        const populateStore = (storeId, items) => {
            const store = builder.get_object(storeId);
            items.forEach(([id, label]) => store.set(store.append(), [0, 1], [id, label]));
        };

        populateStore('TopBarDisplay_ListStore', [
            ['empty', _('Only indicator')], ['text-only', _('Streamers names')],
            ['count-only', _('Number of live streams')], ['icon-only', _('Streamers icons')],
            ['all-icons', _('Streamers icons (all)')]
        ]);

        populateStore('StreamSort_ListStore', [
            ['NAME', _('Streamer name')], ['GAME', _('Game title')],
            ['COUNT', _('Viewers count')], ['UPTIME', _('Stream uptime')]
        ]);

        // 2. Settings Bindings
        const bindings = [
            ['interval', 'field_interval', 'value'], ['title-length', 'field_title_length', 'value'],
            ['opencmd', 'field_opencmd', 'text'], ['kick-opencmd', 'field_kickopencmd', 'text'],
            ['hideplaylists', 'field_hideplaylists', 'active'], ['notifications-enabled', 'field_notifications-enabled', 'active'],
            ['notifications-game-change', 'field_notifications-game-change', 'active'], ['notifications-streamer-icon', 'field_notifications-streamer-icon', 'active'],
            ['hideempty', 'field_hideempty', 'active'], ['hidestatus', 'field_hidestatus', 'active'],
            ['showuptime', 'field_showuptime', 'active'], ['topbarmode', 'field_topbarmode', 'active-id'],
            ['sortkey', 'field_sortkey', 'active-id']
        ];
        
        bindings.forEach(([key, objId, prop]) => settings.bind(key, builder.get_object(objId), prop, Gio.SettingsBindFlags.DEFAULT));

        const updateNotifSensitivity = () => {
            const enabled = settings.get_boolean('notifications-enabled');
            builder.get_object('field_notifications-game-change').sensitive = enabled;
            builder.get_object('field_notifications-streamer-icon').sensitive = enabled;
        };
        updateNotifSensitivity();
        builder.get_object('field_notifications-enabled').connect('notify::active', updateNotifSensitivity);

        // 3. Streamer List Management
        const store = new Gtk.ListStore();
        store.set_column_types([GObject.TYPE_STRING, GObject.TYPE_STRING]);
        
        const view = builder.get_object('field_streamerslist');
        view.set_model(store);

        const session = Soup.Session.new();
        const streamers = new Set();
        const refreshView = () => { view.queue_draw(); view.queue_resize(); };

        const appendStreamer = (name) => {
            if (streamers.has(name)) return;
            streamers.add(name);
            store.set(store.append(), [0, 1], [name, Icons.get_icon_name(name)]);
            refreshView();
        };

        const saveStreamers = () => {
            const list = [];
            store.foreach((model, path, iter) => { list.push(model.get_value(iter, 0)); return false; });
            settings.set_string('streamers', list.join(','));
        };

        const refreshIcons = (one = null) => {
            Icons.refresh_all_icons(session, one ? [one] : [...streamers], _users, _fetchKickProfilePicUrl);
        };

        // UI Columns
        const col = new Gtk.TreeViewColumn({ title: _('Streamer name'), expand: true });
        const iconRenderer = new Gtk.CellRendererPixbuf();
        const textRenderer = new Gtk.CellRendererText({ editable: true });
        
        col.pack_start(iconRenderer, false); col.add_attribute(iconRenderer, 'icon-name', 1);
        col.pack_start(textRenderer, true); col.add_attribute(textRenderer, 'text', 0);
        
        textRenderer.connect('edited', (_, path, newText) => {
            const [ok, iter] = store.get_iter_from_string(path);
            if (!ok) return;
            
            newText = newText.trim();
            if (!newText) {
                store.remove(iter);
            } else {
                store.set(iter, [0, 1], [newText, Icons.get_icon_name(newText)]);
            }
            saveStreamers();
            refreshView();
        });
        view.append_column(col);

        // Load Initial State
        settings.get_string('streamers').split(',').map(s => s.trim()).filter(Boolean).forEach(appendStreamer);
        
        if ([...streamers].some(name => !Icons.has_icon(name))) {
            refreshIcons();
        }

        // 4. Dialog Builders & Actions
        const createDialog = (title, body, placeholder) => {
            const entry = new Gtk.Entry({ placeholder_text: placeholder, activates_default: true });
            const dialog = new Adw.MessageDialog({ transient_for: window, heading: title, body, default_response: 'ok', close_response: 'cancel' });
            
            dialog.set_extra_child(entry);
            dialog.add_response('cancel', _('Cancel'));
            dialog.add_response('ok', _('Add'));
            dialog.set_response_appearance('ok', Adw.ResponseAppearance.SUGGESTED);
            
            return { dialog, entry };
        };

        const handleAdd = (platformId, title, body) => {
            const { dialog, entry } = createDialog(title, body, 'username');
            dialog.connect('response', (dlg, resp) => {
                if (resp === 'ok' && entry.get_text().trim()) {
                    const fullId = `${platformId}:${entry.get_text().trim()}`;
                    appendStreamer(fullId);
                    saveStreamers();
                    refreshIcons(fullId);
                }
                dlg.destroy();
            });
            dialog.present();
        };

        builder.get_object('add_twitch_streamer').connect('clicked', () => handleAdd('twitch', _('Add Twitch Streamer'), _('Enter Twitch username')));
        builder.get_object('add_kick_streamer').connect('clicked', () => handleAdd('kick', _('Add Kick Streamer'), _('Enter Kick username')));

        builder.get_object('del_streamer').connect('clicked', () => {
            const [ok, model, iter] = view.get_selection().get_selected();
            if (ok) {
                streamers.delete(model.get_value(iter, 0));
                model.remove(iter);
                saveStreamers();
                refreshView();
            }
        });

        builder.get_object('del_all_streamers').connect('clicked', () => {
            streamers.clear(); store.clear(); saveStreamers(); refreshView();
        });

        // --- Twitch Import ---
        const importBtn = builder.get_object('import_from_twitch');
        let importing = false;
        
        importBtn.connect('clicked', () => {
            if (importing) return;
            const { dialog, entry } = createDialog(_('Import Twitch Follows'), _('Enter Twitch username'), 'username');
            
            dialog.connect('response', async (dlg, resp) => {
                const username = entry.get_text().trim();
                dlg.destroy();
                if (resp !== 'ok' || !username) return;
                
                importing = true;
                importBtn.label = _('Importing...');
                try {
                    const user = await _users(session, [username]);
                    const follows = await _follows(session, user[0].id);
                    const users = await _usersID(session, follows.map(f => f.broadcaster_id));
                    
                    users.forEach(u => appendStreamer(`twitch:${u.login}`));
                    saveStreamers();
                    refreshIcons();
                } catch (e) { console.error('[Parasocial import]', e); }
                
                importing = false;
                importBtn.label = _('Import from Twitch');
            });
            dialog.present();
        });

        // --- Auth & Refresh Actions ---
        builder.get_object('authenticate_oauth').connect('clicked', () => Api.trigger_oauth(this.dir.get_path()));
        builder.get_object('refresh_icons').connect('clicked', () => refreshIcons());
    }
}
