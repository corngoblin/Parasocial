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

const VIEW_UPDATE_INTERVAL = 10 * 1000;
let button;

const SeparatorMenuItem = GObject.registerClass(
class SeparatorMenuItem extends PopupMenu.PopupBaseMenuItem {
  _init() {
      super._init({ reactive: false, can_focus: false });
      this._separator = new St.Widget({ 
          style_class: 'popup-separator-menu-item',
          y_expand: true,
          y_align: Clutter.ActorAlign.CENTER 
      });
      this.add_child(this._separator);
  }
});

const ExtensionLayout = GObject.registerClass(
  class ExtensionLayout extends PanelMenu.Button {
    _init(path, uuid, settings) {
      super._init(0.0);
      this.path = path;
      this.uuid = uuid;
      this.settings = settings;
      
      this.config = {};
      this.streamertext = null;
      this.online = [];
      this.firstRun = true;
      this.layoutChanged = false;
      this.timer = { view: 0, update: 0, settings: 0 };
      this._httpSession = Soup.Session.new();

      this._box = new St.BoxLayout();
      this.add_child(this._box);

      this.icon = new St.Icon({ 
          gicon: Gio.icon_new_for_string(`${this.path}/livestreamer-icons/para.svg`),
          style_class: 'parasocial-panel-icon system-status-icon' 
      });
      this._box.add_child(this.icon);

      this.streamersMenu = new PopupMenu.PopupMenuSection();
      this.streamersMenuContainer = new PopupMenu.PopupMenuSection();
      let scrollView = new St.ScrollView({ overlay_scrollbars: true, hscrollbar_policy: St.PolicyType.NEVER });
      scrollView.add_child(this.streamersMenu.actor);
      this.streamersMenuContainer.actor.add_child(scrollView);
      this.menu.addMenuItem(this.streamersMenuContainer);

      this.spacer = new SeparatorMenuItem();
      this.menu.addMenuItem(this.spacer);

      let settingsMenuItem = new PopupMenu.PopupMenuItem(_('Settings'));
      settingsMenuItem.connect('activate', () => Util.spawn(["gnome-extensions", "prefs", this.uuid]));
      this.menu.addMenuItem(settingsMenuItem);

      this.updateMenuItem = new PopupMenu.PopupMenuItem(_('Update now'));
      this.updateMenuContainer = new PopupMenu.PopupMenuSection();
      this.updateMenuContainer.actor.add_child(this.updateMenuItem.actor);
      this.menu.addMenuItem(this.updateMenuContainer);
      this.updateMenuItem.connect('activate', this.updateData.bind(this));

      this._applySettings();
      this._settingsChangedId = this.settings.connect('changed', this._applySettings.bind(this));
      this.menu.connect('open-state-changed', this._onMenuOpened.bind(this));

      this.messageTray = new MessageTray.MessageTray();
      this.notification_source = new MessageTray.Source({ title: _('Parasocial'), iconName: _('parasocial') });
      this.notification_source.policy = new MessageTray.NotificationApplicationPolicy(_('parasocial'));
      this.notification_source.connect('destroy', () => { this.notification_source = null; });
      this.messageTray.add(this.notification_source);
    }

    _applySettings() {
      this.config = {
        streamers: this.settings.get_string('streamers').split(',').map(s => s.trim()).filter(Boolean),
        openCmd: this.settings.get_string('opencmd'),
        kickOpenCmd: this.settings.get_string('kick-opencmd'),
        interval: this.settings.get_int('interval') * 1000 * 60,
        hidePlaylists: this.settings.get_boolean('hideplaylists'),
        notifsEnabled: this.settings.get_boolean('notifications-enabled'),
        notifsGameChange: this.settings.get_boolean('notifications-game-change'),
        notifsStreamerIcon: this.settings.get_boolean('notifications-streamer-icon'),
        hideEmpty: this.settings.get_boolean('hideempty'),
        sortKey: this.settings.get_string('sortkey'),
        hideStatus: this.settings.get_boolean('hidestatus'),
        showUptime: this.settings.get_boolean('showuptime'),
        topbarMode: this.settings.get_string('topbarmode'),
        titleLen: this.settings.get_int('title-length'),
        avatarSize: this.settings.get_int('avatar-size'),
        platformIconSize: this.settings.get_int('platform-icon-size'),
        menuSpacing: this.settings.get_int('menu-spacing'),
        fontSize: this.settings.get_int('font-size'),
        showPlatformIcons: this.settings.get_boolean('show-platform-icons'),
        showViewerCount: this.settings.get_boolean('show-viewer-count')
      };

      if (this.topbar_mode !== this.config.topbarMode) {
          if (this.streamertext) this._box.remove_child(this.streamertext.box);
          const modes = {
            "empty": Topbar.empty, "text-only": Topbar.text_only,
            "count-only": Topbar.count_only, "all-icons": Topbar.all_icons,
            "icon-only": Topbar.icon_only
          };
          this.streamertext = modes[this.config.topbarMode]();
          this._box.add_child(this.streamertext.box);
          this.topbar_mode = this.config.topbarMode;
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
      this.timer = { view: 0, update: 0, settings: 0 };
      if (this._settingsChangedId) this.settings.disconnect(this._settingsChangedId);
      super.destroy();
    }

    _execCmd(streamer, platform) {
      this.menu.close();
      const template = platform === 'kick' ? this.config.kickOpenCmd : this.config.openCmd;
      GLib.spawn_command_line_async(template.replaceAll('%streamer%', streamer));
    }

    _findNewStreamerEntries(lastList, currentList, detectGameChange = false) {
      if (!lastList.length) return currentList;
      const cached = new Map(lastList.map(s => [s.streamer, s.game]));
      return currentList.filter(s => !cached.has(s.streamer) || (detectGameChange && s.game !== cached.get(s.streamer)));
    }

    _streamerOnlineNotification(streamer) {
      const title = _("%streamer% is live!").replace(/%streamer%/, streamer.streamer);
      const body = _("Playing %game%").replace(/%game%/, streamer.game);

      // Use streamer icon if it exists, otherwise fall back to default extension icon
      let gicon;
      if (this.config.notifsStreamerIcon && Icons.has_icon(streamer.fullId)) {
        gicon = Gio.icon_new_for_string(Icons.get_final_icon_path(streamer.fullId));
      } else {
        gicon = Gio.icon_new_for_string(`${this.path}/livestreamer-icons/para.svg`);
      }

      const notification = new MessageTray.Notification({
        source: this.notification_source,
        title,
        body,
        gicon
      });

      notification.addAction(_("Watch!"), () => this._execCmd(streamer.login, streamer.platform));
      this.notification_source.addNotification(notification);
    }

    async updateData() {
      if (this.timer.update) GLib.source_remove(this.timer.update);
      this.updateMenuItem.actor.reactive = false;
      this.updateMenuItem.label.set_text(_("Updating ..."));
      this.disable_view_update();

      const kickList = this.config.streamers.filter(s => s.startsWith('kick:')).map(s => s.substring(5));
      const twitchList = this.config.streamers.filter(s => !s.startsWith('kick:')).map(s => s.replace('twitch:', ''));

      let newOnline = [];

      try {
        const [kickStreams, twitchStreams] = await Promise.all([
          kickList.length ? KickProvider.streams(this._httpSession, kickList) : [],
          twitchList.length ? TwitchProvider.streams(this._httpSession, twitchList) : []
        ]);

        kickStreams.forEach(s => newOnline.push({
          streamer: s.streamer, login: s.login, game: s.game || 'Kick',
          viewer_count: s.viewer_count, title: s.title || '', type: 'live',
          thumbnail_url: s.thumbnail_url, platform: 'kick', started_at: s.started_at,
          fullId: `kick:${s.login}`
        }));

        if (twitchStreams.length) {
          const games = await Games.getFromStreams(this._httpSession, twitchStreams);
          twitchStreams.forEach(s => {
            if (s.type !== 'live' && this.config.hidePlaylists) return;
            const game = games.find(g => g.id === s.game_id);
            newOnline.push({
              streamer: s.user_name, login: s.user_login, game: game ? game.name : 'n/a',
              viewer_count: s.viewer_count, title: s.title, type: s.type,
              thumbnail_url: s.thumbnail_url, platform: 'twitch', started_at: s.started_at,
              fullId: `twitch:${s.user_login}`
            });
          });
        }

        newOnline.forEach(entry => {
          const uptime = this.config.showUptime && entry.started_at 
            ? format_uptime((Date.now() - new Date(entry.started_at).getTime()) / 1000) : false;

          entry.item = new MenuItems.StreamerMenuItem(
            entry.streamer, entry.login, entry.game, entry.viewer_count, entry.title,
            (entry.platform === 'twitch' && entry.type !== 'live'), 
            this.config.hideStatus, uptime, `${this.path}/livestreamer-icons/${entry.platform}.svg`, 
            entry.fullId, this.config.titleLen,
            this.config.avatarSize, this.config.platformIconSize, this.config.menuSpacing, this.config.fontSize,
            this.config.showPlatformIcons,
            this.config.showViewerCount
          );
          entry.item.connect("activate", () => this._execCmd(entry.login, entry.platform));
        });

        if (this.config.notifsEnabled) {
          if (!this.firstRun) {
            this._findNewStreamerEntries(this.online, newOnline, this.config.notifsGameChange)
              .forEach(s => this._streamerOnlineNotification(s));
          }
          this.firstRun = false;
        }

        this.online = newOnline;
        this.streamertext.update(newOnline);
        this.streamersMenu.removeAll();
        this.spacer.actor.hide();
        this.layoutChanged = true;
        
        if (this.menu.isOpen) this.updateMenuLayout();

        this.updateMenuItem.actor.reactive = true;
        this.updateMenuItem.label.set_text(_("Update now"));
        this.enable_view_update();
        this.visible = !(this.config.hideEmpty && this.online.length === 0);

      } catch (err) {
        this.updateMenuItem.actor.reactive = true;
        this.updateMenuItem.label.set_text(err.error ? `${err.error} (${err.message})` : "Update Failed");
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
        this.layoutChanged = false;
        return;
      }

      const sorters = {
        'NAME': (a, b) => a.streamer.localeCompare(b.streamer),
        'GAME': (a, b) => a.game.localeCompare(b.game),
        'UPTIME': (a, b) => {
            const timeA = a.started_at ? new Date(a.started_at).getTime() : 0;
            const timeB = b.started_at ? new Date(b.started_at).getTime() : 0;
            return timeB - timeA;
        },
        'COUNT': (a, b) => b.viewer_count - a.viewer_count
      };
      
      let onlineSorted = [...this.online].sort(sorters[this.config.sortKey] || sorters['COUNT']);
      this.spacer.actor.show();
      onlineSorted.forEach(entry => this.streamersMenu.addMenuItem(entry.item));
      this.layoutChanged = false;
    }

    _onMenuOpened() {
      if (this.menu.isOpen && this.layoutChanged) this.updateMenuLayout();
    }

    disable_view_update() {
      if (this.timer.view) GLib.source_remove(this.timer.view);
      this.timer.view = 0;
    }

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
      if (state) {
        this.streamertext.interval();
        this.streamertext.box.show();
      } else {
        this.streamertext.box.hide();
      }
      return true;
    }
  }
);

function format_uptime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}:${minutes.toString().padStart(2, '0')}`;
}

export default class TwitchLiveExtension extends Extension {
  enable() {
    button = new ExtensionLayout(this.path, this.uuid, this.getSettings()); 
    Main.panel.addToStatusArea('parasocial', button, 0); 
  }
  disable() {
    if (button) {
      button.destroy();
      button = null;
    }
  }
}
