/**
  AUTHOR: Mario Wenzel
  LICENSE: GPL3.0
**/
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import St from 'gi://St';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';

import * as Icons from './icons.js';

export var StreamerMenuItem = GObject.registerClass(
{GTypeName: 'StreamerMenuItem'},
class StreamerMenuItem extends PopupMenu.PopupBaseMenuItem {
  _init(streamername, login, game, viewer_count, title, is_playlist=false, HIDESTATUS=false, uptime, platformIconPath, fullStreamerId, titleMaxLen = 45) {
    super._init();
    this._streamer = streamername;

    this._layout = {};
    this._wrapBox = new St.BoxLayout({ vertical: true });
    this._firstLine = new St.BoxLayout();

    // 1. Streamer avatar
    this._layout.streamer_icon = Icons.get_streamericon(fullStreamerId, "streamer-icon streamer-menuitem");
    this._firstLine.add_child(this._layout.streamer_icon);

    // 2. Streamer name
    this._layout.name = new St.Label({ text: streamername, style_class : "name streamer-menuitem"});
    this._firstLine.add_child(this._layout.name);

    // 3. Game
    this._layout.game = new St.Label({ text: game, style_class : "game streamer-menuitem"});
    this._firstLine.add_child(this._layout.game);

    // 4. Viewer count
    this._layout.viewer_count = new St.Label({ text: viewer_count.toString(), style_class : "viewer-count streamer-menuitem"});
    this._firstLine.add_child(this._layout.viewer_count);

    // 5. Viewer icon (eye or playlist)
    let info_icon = 'avatar-default-symbolic';
    if (is_playlist) {
      info_icon = 'media-playlist-repeat-symbolic';
    }
    this._layout.viewer_icon = new St.Icon({ icon_name: info_icon, style_class: 'viewer-icon streamer-menuitem' });
    this._firstLine.add_child(this._layout.viewer_icon);

    // 6. Platform indicator (Twitch/Kick logo) – after viewer icon
    this._layout.platform_icon = new St.Icon({
      gicon: Gio.icon_new_for_string(platformIconPath),
      style_class: 'platform-icon streamer-menuitem'
    });
    this._firstLine.add_child(this._layout.platform_icon);

    if (uptime) {
      this._layout.uptime = new St.Label({ text: uptime, style_class : "uptime streamer-menuitem"});
      this._firstLine.add_child(this._layout.uptime);
    }

    this._wrapBox.add_child(this._firstLine);

    if (!HIDESTATUS) {
      const maxLen = titleMaxLen || 45;
      let displayTitle = title || '';
      if (displayTitle.length > maxLen) {
        displayTitle = displayTitle.substring(0, maxLen) + '…';
      }
      this._layout.title = new St.Label({ text: displayTitle, style_class : "title streamer-menuitem"});
      this._wrapBox.add_child(this._layout.title);
    }

    this.add_child(this._wrapBox);
  }
});

export const NobodyMenuItem = GObject.registerClass(
class NobodyMenuItem extends PopupMenu.PopupBaseMenuItem {
  _init(nobodytext) {
    super._init({ reactive: false, can_focus: false });
    this.add_child(new St.Label({ text: nobodytext, style_class : "nobody-menuitem"}));
  }
});
