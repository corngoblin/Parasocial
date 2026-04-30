/**
  AUTHORS: Mario Wenzel, Raphaël Rochet
  forked and heavily edited by corngoblin
  LICENSE: GPL3.0
**/
import St from 'gi://St';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Soup from 'gi://Soup';
import Clutter from 'gi://Clutter';
const Panel = Main.panel;
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Util from 'resource:///org/gnome/shell/misc/util.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import * as Config from 'resource:///org/gnome/shell/misc/config.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const [major] = Config.PACKAGE_VERSION.split('.');
const shellVersion = Number.parseInt(major);

import * as Topbar from './topbar.js';
import * as MenuItems from './menu_items.js';
import * as Icons from './icons.js';
import * as Games from './games.js';
import * as TwitchProvider from './providers/twitch.js';
import * as KickProvider from './providers/kick.js';
import * as Api from './api.js';

const viewUpdateInterval = 10*1000;

let STREAMERS = [];
let OPENCMD = "";
let KICK_OPENCMD = "";
let INTERVAL = 5*1000*60;
let HIDEPLAYLISTS = false;
let NOTIFICATIONS_ENABLED = false;
let NOTIFICATIONS_GAME_CHANGE = false;
let NOTIFICATIONS_STREAMER_ICON = false;
let HIDEEMPTY = false;
let SORTKEY = 'COUNT';
let HIDESTATUS = false;
let SHOWUPTIME = false;
let TOPBARMODE = 'all-icons';

let button;

var SeparatorMenuItem = GObject.registerClass(
class SeparatorMenuItem extends PopupMenu.PopupBaseMenuItem {
  _init() {
      super._init({ reactive: false, can_focus: false});
      this._separator = new St.Widget({ style_class: 'popup-separator-menu-item',
                                        y_expand: true,
                                        y_align: Clutter.ActorAlign.CENTER });
      this.add_child(this._separator);
  }
});

const ExtensionLayout = GObject.registerClass(
  class ExtensionLayout extends PanelMenu.Button {
    _init(path, uuid, settings) {
      super._init(0.0);

      this.path = path;
      this.uuid = uuid;
      this.streamertext = null;
      this.topbar_mode = '';
      this.text = null;
      this.icon = null;
      this.online = [];
      this.firstRun = true;
      this.timer = { view: 0, update: 0, settings: 0 };
      this.settings = settings;
      this._httpSession = Soup.Session.new();
      this.layoutChanged = false;
      this.streamer_rotation = 0;

      this._box = new St.BoxLayout();
      this.add_child(this._box);
      // panel default icon → para.svg
      this.icon = new St.Icon({ gicon: Gio.icon_new_for_string(this.path + "/livestreamer-icons/para.svg"),
                              style_class: 'system-status-icon' });
      this._box.add_child(this.icon);

      this.streamersMenu = new PopupMenu.PopupMenuSection();
      this.streamersMenuContainer = new PopupMenu.PopupMenuSection();
      let scrollView = new St.ScrollView({ overlay_scrollbars: true , hscrollbar_policy: St.PolicyType.NEVER });
      scrollView.add_child(this.streamersMenu.actor);
      this.streamersMenuContainer.actor.add_child(scrollView);
      this.menu.addMenuItem(this.streamersMenuContainer);

      this.spacer = new SeparatorMenuItem();
      this.menu.addMenuItem(this.spacer);

      let settingsMenuItem = new PopupMenu.PopupMenuItem(_('Settings'));
      this.menu.addMenuItem(settingsMenuItem);
      settingsMenuItem.connect('activate', this._openSettings.bind(this));

      this.updateMenuItem = new PopupMenu.PopupMenuItem(_('Update now'));
      this.updateMenuContainer = new PopupMenu.PopupMenuSection();
      this.updateMenuContainer.actor.add_child(this.updateMenuItem.actor);
      this.menu.addMenuItem(this.updateMenuContainer);
      this.updateMenuItem.connect('activate', this.updateData.bind(this));
      this._applySettings();
      // STORE the handler ID so it can be disconnected later
      this._settingsChangedId = this.settings.connect('changed', this._applySettings.bind(this));
      this.menu.connect('open-state-changed', this._onMenuOpened.bind(this));

      this.messageTray = new MessageTray.MessageTray();
      this.notification_source = new MessageTray.Source({title: _('Parasocial'), iconName: _('parasocial')});
      this.notification_source.policy = new MessageTray.NotificationApplicationPolicy(_('parasocial'));
      this.notification_source.connect('destroy', () => {this.notification_source = null;});
      this.messageTray.add(this.notification_source);
    }

    _applySettings() {
      STREAMERS = this.settings.get_string('streamers').split(',');
      OPENCMD = this.settings.get_string('opencmd');
      KICK_OPENCMD = this.settings.get_string('kick-opencmd');
      INTERVAL = this.settings.get_int('interval')*1000*60;
      HIDEPLAYLISTS = this.settings.get_boolean('hideplaylists');
      NOTIFICATIONS_ENABLED = this.settings.get_boolean('notifications-enabled');
      NOTIFICATIONS_GAME_CHANGE = this.settings.get_boolean('notifications-game-change');
      NOTIFICATIONS_STREAMER_ICON = this.settings.get_boolean('notifications-streamer-icon');
      HIDEEMPTY = this.settings.get_boolean('hideempty');
      SORTKEY = this.settings.get_string('sortkey');
      HIDESTATUS = this.settings.get_boolean('hidestatus');
      SHOWUPTIME = this.settings.get_boolean('showuptime');
      TOPBARMODE = this.settings.get_string('topbarmode');

      if (this.topbar_mode != TOPBARMODE) {
          if (this.streamertext) this._box.remove_child(this.streamertext.box);
          this.streamertext = {
            "empty": Topbar.empty,
            "text-only": Topbar.text_only,
            "count-only": Topbar.count_only,
            "all-icons": Topbar.all_icons,
            "icon-only": Topbar.icon_only
          }[TOPBARMODE]();
          this._box.add_child(this.streamertext.box);
          this.topbar_mode = TOPBARMODE;
      }

      if (this.timer.settings != 0) GLib.source_remove(this.timer.settings);
      this.timer.settings = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
        this.timer.settings = 0;
        this.updateData();
        return GLib.SOURCE_REMOVE;
      });
    }

    destroy() {
      if (this.timer.settings != 0) GLib.source_remove(this.timer.settings);
      if (this.timer.update != 0) GLib.source_remove(this.timer.update);
      if (this.timer.view != 0) GLib.source_remove(this.timer.view);
      this.timer = { view: 0, update: 0, settings: 0 };

      // DISCONNECT the settings changed signal (Rule 4)
      if (this._settingsChangedId) {
        this.settings.disconnect(this._settingsChangedId);
        this._settingsChangedId = null;
      }
      super.destroy();
    }

    // (no changes below – all methods remain identical)
    _openSettings() {
        Util.spawn([
            "gnome-extensions", "prefs",
            this.uuid
        ]);
    }

    _execCmd(streamer) {
      this.menu.close();
      let entry = this.online.find(e => e.login === streamer);
      let cmdTemplate;
      if (entry && entry.platform === 'kick') {
        cmdTemplate = KICK_OPENCMD;
      } else {
        cmdTemplate = OPENCMD;
      }
      let cmd = cmdTemplate.replaceAll('%streamer%', streamer);
      GLib.spawn_command_line_async(cmd);
    }

    _findNewStreamerEntries(lastList, currentList, detectGameChange) {
      detectGameChange = detectGameChange || false;
      if (lastList.length == 0) return currentList;

      let streamers = new Map();
      lastList.forEach(({streamer, game}) => streamers.set(streamer, game));

      return currentList.filter(({streamer, game}) => {
          if (!streamers.has(streamer)) return true;
          if (detectGameChange && game != streamers.get(streamer)) return true;
          return false;
      });
    }

    _streamerOnlineNotification(streamer) {
      let notification = new MessageTray.Notification({
        source: this.notification_source,
        title: _("%streamer% is live!").replace(/%streamer%/, streamer.streamer),
        body: _("Playing %game%").replace(/%game%/, streamer.game)
      });

      notification.addAction(_("Watch!"), () => {
        let cmdTemplate = streamer.platform === 'kick' ? KICK_OPENCMD : OPENCMD;
        let cmd = cmdTemplate.replaceAll('%streamer%', streamer.login);
        GLib.spawn_command_line_async(cmd);
      });

      // notification fallback icon → para.svg
      let icon = NOTIFICATIONS_STREAMER_ICON ?
        Icons.get_streamericon(streamer.fullId, "notifications-icon") :
        new St.Icon({
          gicon: Gio.icon_new_for_string(this.path + "/livestreamer-icons/para.svg"),
          style_class: "notifications-icon"
        });
      this.notification_source.createIcon = () => icon;

      this.notification_source.addNotification(notification);
    }

    _parseStreamers() {
      const twitch = [];
      const kick = [];
      STREAMERS.forEach(s => {
        s = s.trim();
        if (!s) return;
        if (s.startsWith('kick:')) {
          kick.push(s.substring(5).trim());
        } else if (s.startsWith('twitch:')) {
          twitch.push(s.substring(7).trim());
        } else {
          twitch.push(s);
        }
      });
      return { twitch, kick };
    }

    updateData() {
      if (this.timer.update != 0) GLib.source_remove(this.timer.update);
      this.updateMenuItem.actor.reactive = false;
      this.updateMenuItem.label.set_text(_("Updating ..."));

      this.disable_view_update();

      const { twitch, kick } = this._parseStreamers();
      let new_online = [];

      const kickPromise = kick.length > 0
        ? KickProvider.streams(this._httpSession, kick).then(streams => {
            streams.forEach(s => new_online.push({
              streamer: s.streamer,
              login: s.login,
              game: s.game || 'Kick',
              viewer_count: s.viewer_count,
              title: s.title || '',
              type: 'live',
              thumbnail_url: s.thumbnail_url,
              platform: 'kick',
              started_at: s.started_at || null,
              fullId: 'kick:' + s.login
            }));
          })
        : Promise.resolve();

      const twitchPromise = twitch.length > 0
        ? TwitchProvider.streams(this._httpSession, twitch).then(streams => {
            return Games.getFromStreams(this._httpSession, streams).then(games => {
              streams.forEach(stream => {
                if (stream.type !== 'live' && HIDEPLAYLISTS) return;
                const loginName = stream.thumbnail_url.slice(52, -21);
                const game = games.find(g => g.id === stream.game_id);
                const gameName = game ? game.name : 'n/a';
                const uptime = SHOWUPTIME ? format_uptime((new Date() - new Date(stream.started_at)) / 1000) : false;
                new_online.push({
                  streamer: stream.user_name,
                  login: loginName,
                  game: gameName,
                  viewer_count: stream.viewer_count,
                  title: stream.title,
                  type: stream.type,
                  thumbnail_url: stream.thumbnail_url,
                  platform: 'twitch',
                  started_at: stream.started_at,
                  uptime: uptime,
                  fullId: 'twitch:' + loginName
                });
              });
            });
          })
        : Promise.resolve();

      Promise.all([twitchPromise, kickPromise]).then(() => {
        let titleMaxLen = this.settings.get_int('title-length');
        new_online.forEach(entry => {
          const isPlaylist = (entry.platform === 'twitch' && entry.type !== 'live');
          const hideStatus = HIDESTATUS;
          // platform icon → .svg
          const platformIconPath = this.path + '/livestreamer-icons/' + entry.platform + '.svg';
          const item = new MenuItems.StreamerMenuItem(
            entry.streamer,
            entry.login,
            entry.game,
            entry.viewer_count,
            entry.title,
            isPlaylist,
            hideStatus,
            entry.uptime || false,
            platformIconPath,
            entry.fullId,
            titleMaxLen
          );
          item.connect("activate", () => this._execCmd(entry.login));
          entry.item = item;
        });

        if (NOTIFICATIONS_ENABLED) {
          if (!this.firstRun) {
            this._findNewStreamerEntries(this.online, new_online, NOTIFICATIONS_GAME_CHANGE)
              .forEach(s => this._streamerOnlineNotification(s));
          } else {
            this.firstRun = false;
          }
        }

        this.online = new_online;
        this.streamertext.update(new_online);

        this.streamersMenu.removeAll();
        this.spacer.actor.hide();
        this.layoutChanged = true;
        if (this.menu.isOpen) this.updateMenuLayout();

        this.updateMenuItem.actor.reactive = true;
        this.updateMenuItem.label.set_text(_("Update now"));
        this.enable_view_update();
        this.visible = !(HIDEEMPTY && this.online.length === 0);
      }).catch(d => this.errorHandler(d));

      this.timer.update = GLib.timeout_add(GLib.PRIORITY_DEFAULT, INTERVAL, () => {
        this.updateData();
        return GLib.SOURCE_REMOVE;
      });
    }

    errorHandler(data) {
      this.updateMenuItem.actor.reactive = true;
      this.updateMenuItem.label.set_text(data.error + " (" + data.message + ")");
    }

    updateMenuLayout() {
      this.streamersMenu.removeAll();

      let online = this.online.slice();
      let sortfunc;
      if (SORTKEY == 'NAME') {
        sortfunc = (a,b) => a.streamer.toUpperCase() > b.streamer.toUpperCase() ? 1 : -1;
      } else if (SORTKEY == 'GAME') {
        sortfunc = (a,b) => a.game.toUpperCase() > b.game.toUpperCase() ? 1 : -1;
      } else if (SORTKEY == 'UPTIME') {
        sortfunc = (a,b) => (a.started_at || 0) < (b.started_at || 0) ? 1 : -1;
      } else {
        sortfunc = (a,b) => a.viewer_count < b.viewer_count ? 1 : -1;
      }
      online.sort(sortfunc);

      if (online.length === 0) {
        this.streamersMenu.addMenuItem(new MenuItems.NobodyMenuItem(_("Nobody is streaming")));
        this.spacer.actor.hide();
        this.layoutChanged = false;
        return;
      }

      this.spacer.actor.show();
      online.forEach(entry => this.streamersMenu.addMenuItem(entry.item));

      this.layoutChanged = false;
    }

    _onMenuOpened() {
      if (this.menu.isOpen && this.layoutChanged == true) {
        this.updateMenuLayout();
      }
    }

    disable_view_update() {
      if (this.timer.view != 0) GLib.source_remove(this.timer.view);
      this.timer.view = 0;
    }

    enable_view_update() {
      this.interval();
      this.timer.view = GLib.timeout_add(GLib.PRIORITY_DEFAULT, viewUpdateInterval, () => {
        this.interval();
        return GLib.SOURCE_CONTINUE;
      });
    }

    interval() {
      let _online = this.online;
      if (_online.length > 0) {
        // live icon → para_on.svg
        this.icon.set_gicon(Gio.icon_new_for_string(this.path + "/livestreamer-icons/para_on.svg"));
        this.streamertext.interval();
        this.streamertext.box.show();
      }
      else {
        // offline icon → para_off.svg
        this.icon.set_gicon(Gio.icon_new_for_string(this.path + "/livestreamer-icons/para_off.svg"));
        this.streamertext.box.hide();
      }
      return true;
    }
  }
);

function max_size_info(size_info1, size_info2) {
  return [
    Math.max(size_info1[0], size_info2[0]),
    Math.max(size_info1[1], size_info2[1]),
    Math.max(size_info1[2], size_info2[2]),
    Math.max(size_info1[3], size_info2[3])
  ];
}

function get_size_info(item) {
  return [
    item._layout.name.get_allocation_box().get_width(),
    item._layout.game.get_allocation_box().get_width(),
    item._layout.viewer_count.get_allocation_box().get_width(),
    item._layout.uptime ? item._layout.uptime.get_allocation_box().get_width() : 0
  ];
}

function apply_size_info(item, size_info) {
  let viewer_count_size_diff = size_info[2] - item._layout.viewer_count.get_allocation_box().get_width();
  item._layout.name.set_width(size_info[0]);
  item._layout.game.set_width(size_info[1] + viewer_count_size_diff);
  item._layout.viewer_count.set_width(size_info[2] - viewer_count_size_diff);
  if (item._layout.uptime) {
    item._layout.uptime.set_width(size_info[3]);
  }
  if ( item._layout.title ) {
    item._layout.title.set_width(size_info[0] + size_info[1] + size_info[2] + size_info[3]);
  }
}

function format_uptime(seconds) {
  const hours   = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  return [hours, minutes > 9 ? minutes : '0' + minutes].join(':');
}

export default class TwitchLiveExtension extends Extension {
  constructor(metadata) {
    super(metadata);
    // No GObject creation, no Gtk/Gdk imports – everything happens in enable()
  }

  enable() {
    button = new ExtensionLayout(this.path, this.uuid, this.getSettings());
    Panel.addToStatusArea('parasocial', button, 0);
  }

  disable() {
    if (button) {
      button.destroy();
      button = null;
    }
    // CLEAR module-scope variables (Rule 5)
    STREAMERS = [];
    OPENCMD = "";
    KICK_OPENCMD = "";
    INTERVAL = 5*1000*60;
    HIDEPLAYLISTS = false;
    NOTIFICATIONS_ENABLED = false;
    NOTIFICATIONS_GAME_CHANGE = false;
    NOTIFICATIONS_STREAMER_ICON = false;
    HIDEEMPTY = false;
    SORTKEY = 'COUNT';
    HIDESTATUS = false;
    SHOWUPTIME = false;
    TOPBARMODE = 'all-icons';
  }
}
