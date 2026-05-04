/**
  AUTHORS: Mario Wenzel, Raphaël Rochet
  forked and heavily edited by corngoblin
  LICENSE: GPL3.0
**/
import St from 'gi://St';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Util from 'resource:///org/gnome/shell/misc/util.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import * as Topbar from './topbar.js';
import * as MenuItems from './menu_items.js';
import * as Icons from './icons.js';
import * as Games from './games.js';
import * as TwitchProvider from './providers/twitch.js';
import * as KickProvider from './providers/kick.js';
import * as YoutubeProvider from './providers/youtube.js';

// Translation helper using GLib.dgettext
const _ = (str) => GLib.dgettext('parasocial', str);

const VIEW_UPDATE_INTERVAL = 10 * 1000;
let button;

const SeparatorMenuItem = GObject.registerClass(
class SeparatorMenuItem extends PopupMenu.PopupBaseMenuItem {
  _init() {
      super._init({ reactive: false, can_focus: false });
      this._separator = new St.Widget({ style_class: 'popup-separator-menu-item', y_expand: true, y_align: Clutter.ActorAlign.CENTER });
      this.add_child(this._separator);
  }
});

const normalizeStream = (s, platform, gameOverride) => ({
  streamer: s.streamer || s.user_name || 'Unknown',
  login: s.login || s.user_login || '',
  game: gameOverride !== undefined ? gameOverride : (s.game || 'n/a'),
  viewer_count: parseInt(s.viewer_count || s.viewers || 0, 10) || 0,
  title: s.title || '',
  type: s.type || 'live',
  thumbnail_url: s.thumbnail_url || '',
  platform,
  started_at: s.started_at || null,
  fullId: `${platform}:${s.login || s.user_login}`,
  profileImage: s.profileImage || ''
});

const format_uptime = (seconds) => {
  if (isNaN(seconds) || seconds < 0) return "0:00";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}:${minutes.toString().padStart(2, '0')}`;
};

const ExtensionLayout = GObject.registerClass(
  class ExtensionLayout extends PanelMenu.Button {
    _init(path, uuid, settings) {
      super._init(0.0);
      this.path = path;
      this.uuid = uuid;
      this.settings = settings;
      
      this.config = {};
      this.online = [];
      this.firstRun = true;
      this.layoutChanged = false;
      this.timer = { view: 0, update: 0, settings: 0 };
      this._httpSession = Soup.Session.new();

      this._box = new St.BoxLayout();
      this.icon = new St.Icon({ gicon: Gio.icon_new_for_string(`${this.path}/livestreamer-icons/para.svg`), style_class: 'parasocial-panel-icon system-status-icon' });
      this._box.add_child(this.icon);
      this.add_child(this._box);

      this.streamersMenu = new PopupMenu.PopupMenuSection();
      this.streamersMenuContainer = new PopupMenu.PopupMenuSection();
      
      const scrollView = new St.ScrollView({ overlay_scrollbars: true, hscrollbar_policy: St.PolicyType.NEVER });
      scrollView.add_child(this.streamersMenu.actor);
      this.streamersMenuContainer.actor.add_child(scrollView);
      
      this.spacer = new SeparatorMenuItem();
      const settingsMenuItem = new PopupMenu.PopupMenuItem(_("Settings"));
      settingsMenuItem.connect('activate', () => Util.spawn(["gnome-extensions", "prefs", this.uuid]));
      
      this.updateMenuItem = new PopupMenu.PopupMenuItem(_("Update now"));
      this.updateMenuContainer = new PopupMenu.PopupMenuSection();
      this.updateMenuContainer.actor.add_child(this.updateMenuItem.actor);
      this.updateMenuItem.connect('activate', this.updateData.bind(this));

      [this.streamersMenuContainer, this.spacer, settingsMenuItem, this.updateMenuContainer].forEach(i => this.menu.addMenuItem(i));

      this._applySettings();
      this._settingsChangedId = this.settings.connect('changed', this._applySettings.bind(this));
      this.menu.connect('open-state-changed', this._onMenuOpened.bind(this));

      this.messageTray = new MessageTray.MessageTray();
      this.notification_source = new MessageTray.Source({ title: _("Parasocial"), iconName: _("parasocial") });
      this.notification_source.policy = new MessageTray.NotificationApplicationPolicy(_("parasocial"));
      this.notification_source.connect('destroy', () => { this.notification_source = null; });
      this.messageTray.add(this.notification_source);
    }

    _safeGetSetting(key, type, fallback) {
        try {
            if (type === 'b') return this.settings.get_boolean(key);
            if (type === 'i') return this.settings.get_int(key);
            if (type === 's') return this.settings.get_string(key);
        } catch (e) {
            return fallback;
        }
        return fallback;
    }

    _applySettings() {
      this.config = {
        streamers: (this._safeGetSetting('streamers', 's', '')).split(',').map(s => s.trim()).filter(Boolean),
        opencmd: this._safeGetSetting('opencmd', 's', 'xdg-open https://twitch.tv/%streamer%'),
        kickOpencmd: this._safeGetSetting('kick-opencmd', 's', 'xdg-open https://kick.com/%streamer%'),
        youtubeOpenCmd: this._safeGetSetting('youtube-opencmd', 's', 'xdg-open https://www.youtube.com/@%streamer%'),
        interval: this._safeGetSetting('interval', 'i', 5) * 60000,
        hideplaylists: this._safeGetSetting('hideplaylists', 'b', false),
        notificationsEnabled: this._safeGetSetting('notifications-enabled', 'b', true),
        notificationsGameChange: this._safeGetSetting('notifications-game-change', 'b', false),
        notificationsStreamerIcon: this._safeGetSetting('notifications-streamer-icon', 'b', true),
        hideempty: this._safeGetSetting('hideempty', 'b', false),
        sortkey: this._safeGetSetting('sortkey', 's', 'COUNT'),
        hidestatus: this._safeGetSetting('hidestatus', 'b', false),
        showuptime: this._safeGetSetting('showuptime', 'b', true),
        topbarmode: this._safeGetSetting('topbarmode', 's', 'text-only'),
        titleLength: this._safeGetSetting('title-length', 'i', 45),
        avatarSize: this._safeGetSetting('avatar-size', 'i', 20),
        platformIconSize: this._safeGetSetting('platform-icon-size', 'i', 16),
        menuSpacing: this._safeGetSetting('menu-spacing', 'i', 8),
        fontSize: this._safeGetSetting('font-size', 'i', 14),
        showPlatformIcons: this._safeGetSetting('show-platform-icons', 'b', true),
        showViewerCount: this._safeGetSetting('show-viewer-count', 'b', true)
      };

      if (this.topbar_mode !== this.config.topbarmode) {
          if (this.streamertext) this._box.remove_child(this.streamertext.box);
          const modes = { "empty": Topbar.empty, "text-only": Topbar.text_only, "count-only": Topbar.count_only, "all-icons": Topbar.all_icons, "icon-only": Topbar.icon_only };
          this.streamertext = (modes[this.config.topbarmode] || modes["text-only"])();
          this._box.add_child(this.streamertext.box);
          this.topbar_mode = this.config.topbarmode;
      }

      if (this.timer.settings) GLib.source_remove(this.timer.settings);
      this.timer.settings = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
        this.timer.settings = 0;
        this.updateData();
        return GLib.SOURCE_REMOVE;
      });
    }

    destroy() {
      Object.values(this.timer).forEach(t => t && GLib.source_remove(t));
      if (this._settingsChangedId) this.settings.disconnect(this._settingsChangedId);
      super.destroy();
    }

    _execCmd(streamer, platform) {
      this.menu.close();
      const templates = { 'kick': this.config.kickOpencmd, 'youtube': this.config.youtubeOpenCmd };
      const template = templates[platform] || this.config.opencmd;
      GLib.spawn_command_line_async(template.replaceAll('%streamer%', streamer));
    }

    _streamerOnlineNotification(streamer) {
      const title = _("%streamer% is live!").replace(/%streamer%/, streamer.streamer);
      const body = streamer.game && streamer.game.trim() ? _("Playing %game%").replace(/%game%/, streamer.game) : null;
      const notification = new MessageTray.Notification({ source: this.notification_source, title, body });

      notification.addAction(_("Watch!"), () => this._execCmd(streamer.login, streamer.platform));
      const icon = this.config.notificationsStreamerIcon 
        ? Icons.get_streamericon(streamer.fullId, "notifications-icon") 
        : new St.Icon({ gicon: Gio.icon_new_for_string(`${this.path}/livestreamer-icons/para.svg`), style_class: "notifications-icon" });
      
      this.notification_source.createIcon = () => icon;
      this.notification_source.addNotification(notification);
    }

    async updateData() {
      if (this.timer.update) GLib.source_remove(this.timer.update);
      this.updateMenuItem.actor.reactive = false;
      this.updateMenuItem.label.set_text(_("Updating ..."));
      this.disable_view_update();

      const lists = { kick: [], youtube: [], twitch: [] };
      this.config.streamers.forEach(s => {
        if (s.startsWith('kick:')) lists.kick.push(s.substring(5));
        else if (s.startsWith('youtube:')) lists.youtube.push(s.substring(8));
        else lists.twitch.push(s.replace('twitch:', ''));
      });

      let newOnline = [];

      // Fetch all three platforms in parallel with allSettled for independent error handling
      const [kickResult, ytResult, twitchResult] = await Promise.allSettled([
        lists.kick.length ? KickProvider.streams(this._httpSession, lists.kick) : Promise.resolve([]),
        lists.youtube.length ? YoutubeProvider.streams(this._httpSession, lists.youtube) : Promise.resolve([]),
        lists.twitch.length ? TwitchProvider.streams(this._httpSession, lists.twitch) : Promise.resolve([])
      ]);

      // Process Kick
      const kickStreams = kickResult.status === 'fulfilled' ? kickResult.value : (log(`[Parasocial] Kick error: ${kickResult.reason}`), []);
      if (Array.isArray(kickStreams)) newOnline.push(...kickStreams.map(s => normalizeStream(s, 'kick', s.game || 'Kick')));

      // Process YouTube – empty game to hide category line
      const ytStreams = ytResult.status === 'fulfilled' ? ytResult.value : (log(`[Parasocial] YouTube error: ${ytResult.reason}`), []);
      if (Array.isArray(ytStreams)) newOnline.push(...ytStreams.map(s => normalizeStream(s, 'youtube', '')));

      // Process Twitch – needs game details
      const twitchStreams = twitchResult.status === 'fulfilled' ? twitchResult.value : (log(`[Parasocial] Twitch error: ${twitchResult.reason}`), []);
      if (Array.isArray(twitchStreams) && twitchStreams.length) {
        try {
          const liveOnly = twitchStreams.filter(s => !(s.type !== 'live' && this.config.hideplaylists));
          const games = await Games.getFromStreams(this._httpSession, liveOnly).catch(() => []);
          newOnline.push(...liveOnly.map(s => {
            const game = Array.isArray(games) ? games.find(g => g.id === s.game_id) : null;
            return normalizeStream(s, 'twitch', game ? game.name : 'n/a');
          }));
        } catch (e) { log(`[Parasocial] Twitch games error: ${e}`); }
      }

      // Build UI
      try {
        newOnline.forEach(entry => {
          const uptime = this.config.showuptime && entry.started_at ? format_uptime((Date.now() - new Date(entry.started_at).getTime()) / 1000) : false;
          entry.item = new MenuItems.StreamerMenuItem(
            entry.streamer, entry.login, entry.game, entry.viewer_count, entry.title,
            (entry.platform === 'twitch' && entry.type !== 'live'), 
            this.config.hidestatus, uptime, `${this.path}/livestreamer-icons/${entry.platform}.svg`, 
            entry.fullId, this.config.titleLength, this.config.avatarSize, this.config.platformIconSize, 
            this.config.menuSpacing, this.config.fontSize, this.config.showPlatformIcons, this.config.showViewerCount
          );
          entry.item.connect("activate", () => this._execCmd(entry.login, entry.platform));
        });

        if (this.config.notificationsEnabled && !this.firstRun) {
            const cached = new Map(this.online.map(s => [s.streamer, s.game]));
            newOnline.filter(s => !cached.has(s.streamer) || (this.config.notificationsGameChange && s.game !== cached.get(s.streamer)))
                     .forEach(s => this._streamerOnlineNotification(s));
        }

        this.firstRun = false;
        this.online = newOnline;
        this.streamertext.update(newOnline);
        this.layoutChanged = true;
        if (this.menu.isOpen) this.updateMenuLayout();

        this.updateMenuItem.actor.reactive = true;
        this.updateMenuItem.label.set_text(_("Update now"));
        this.enable_view_update();
        this.visible = !(this.config.hideempty && this.online.length === 0);
      } catch (err) {
        log(`[Parasocial] UI Build Error: ${err}`);
        this.updateMenuItem.label.set_text(_("Update Failed"));
      }

      this.timer.update = GLib.timeout_add(GLib.PRIORITY_DEFAULT, this.config.interval, () => {
        this.updateData();
        return GLib.SOURCE_REMOVE;
      });
    }

    updateMenuLayout() {
      this.streamersMenu.removeAll();
      if (this.online.length === 0) {
        this.streamersMenu.addMenuItem(new MenuItems.NobodyMenuItem(_("Nobody is streaming")));
        this.spacer.actor.hide();
        return;
      }

      const sorters = {
        'NAME': (a, b) => a.streamer.localeCompare(b.streamer),
        'GAME': (a, b) => a.game.localeCompare(b.game),
        'UPTIME': (a, b) => (b.started_at ? new Date(b.started_at).getTime() : 0) - (a.started_at ? new Date(a.started_at).getTime() : 0),
        'COUNT': (a, b) => b.viewer_count - a.viewer_count
      };
      
      [...this.online].sort(sorters[this.config.sortkey] || sorters['COUNT']).forEach(e => this.streamersMenu.addMenuItem(e.item));
      this.spacer.actor.show();
      this.layoutChanged = false;
    }

    _onMenuOpened() { if (this.menu.isOpen && this.layoutChanged) this.updateMenuLayout(); }
    disable_view_update() { if (this.timer.view) GLib.source_remove(this.timer.view); this.timer.view = 0; }
    
    enable_view_update() {
      this.interval();
      this.timer.view = GLib.timeout_add(GLib.PRIORITY_DEFAULT, VIEW_UPDATE_INTERVAL, () => {
        this.interval();
        return GLib.SOURCE_CONTINUE;
      });
    }

    interval() {
      const state = this.online.length > 0;
      this.icon.set_gicon(Gio.icon_new_for_string(`${this.path}/livestreamer-icons/para_${state ? 'on' : 'off'}.svg`));
      state ? (this.streamertext.interval(), this.streamertext.box.show()) : this.streamertext.box.hide();
      return true;
    }
  }
);

export default class TwitchLiveExtension extends Extension {
  enable() {
    button = new ExtensionLayout(this.path, this.uuid, this.getSettings()); 
    Main.panel.addToStatusArea('parasocial', button, 0); 
  }
  disable() {
    if (button) { button.destroy(); button = null; }
  }
}
