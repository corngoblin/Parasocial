/**
  AUTHOR: Mario Wenzel
  forked and heavily edited by corngoblin
  LICENSE: GPL3.0
**/
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import St from 'gi://St';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';

import * as Icons from './icons.js';

export var StreamerMenuItem = GObject.registerClass(
{GTypeName: 'StreamerMenuItem'},
class StreamerMenuItem extends PopupMenu.PopupBaseMenuItem {
  _init(streamername, login, game, viewer_count, title, is_playlist=false, HIDESTATUS=false, uptime, platformIconPath, fullStreamerId, titleMaxLen = 45) {
    super._init();
    this._streamer = streamername;

    this._layout = {};
    
    // Main Container
    this._wrapBox = new St.BoxLayout({ vertical: false, style_class: 'streamer-menuitem-container', x_expand: true });

    // 1. Avatar (Left Side)
    let avatarBox = new St.BoxLayout({ y_align: Clutter.ActorAlign.START, style_class: 'streamer-avatar-box' });
    this._layout.streamer_icon = Icons.get_streamericon(fullStreamerId, "streamer-icon");
    avatarBox.add_child(this._layout.streamer_icon);
    this._wrapBox.add_child(avatarBox);

    // 2. Details (Middle)
    // By using x_expand: true, this middle box pushes the stats box all the way to the right
    let detailsBox = new St.BoxLayout({ vertical: true, x_expand: true, y_align: Clutter.ActorAlign.CENTER, style_class: 'streamer-details-box' });
    
    // Name + Platform Icon row
    let nameRow = new St.BoxLayout({ vertical: false, y_align: Clutter.ActorAlign.CENTER });
    this._layout.name = new St.Label({ text: streamername, style_class: "streamer-name" });
    nameRow.add_child(this._layout.name);
    
    this._layout.platform_icon = new St.Icon({
      gicon: Gio.icon_new_for_string(platformIconPath),
      style_class: 'platform-icon'
    });
    nameRow.add_child(this._layout.platform_icon);
    detailsBox.add_child(nameRow);

    // Game row
    this._layout.game = new St.Label({ text: game, style_class: "streamer-game" });
    detailsBox.add_child(this._layout.game);

    // Title row
    if (!HIDESTATUS) {
      const maxLen = titleMaxLen || 45;
      let displayTitle = title || '';
      if (displayTitle.length > maxLen) {
        displayTitle = displayTitle.substring(0, maxLen) + '…';
      }
      this._layout.title = new St.Label({ text: displayTitle, style_class: "streamer-title" });
      detailsBox.add_child(this._layout.title);
    }
    this._wrapBox.add_child(detailsBox);

    // 3. Stats (Right Side)
    let statsBox = new St.BoxLayout({ vertical: true, y_align: Clutter.ActorAlign.CENTER, x_align: Clutter.ActorAlign.END, style_class: 'streamer-stats-box' });

    // Viewers
    let viewersBox = new St.BoxLayout({ vertical: false, y_align: Clutter.ActorAlign.CENTER, x_align: Clutter.ActorAlign.END });
    let info_icon = is_playlist ? 'media-playlist-repeat-symbolic' : 'avatar-default-symbolic';
    this._layout.viewer_icon = new St.Icon({ icon_name: info_icon, style_class: 'viewer-icon' });
    viewersBox.add_child(this._layout.viewer_icon);
    
    this._layout.viewer_count = new St.Label({ text: viewer_count.toString(), style_class: "streamer-viewer-count" });
    viewersBox.add_child(this._layout.viewer_count);
    statsBox.add_child(viewersBox);

    // Uptime
    if (uptime) {
      let uptimeBox = new St.BoxLayout({ vertical: false, y_align: Clutter.ActorAlign.CENTER, x_align: Clutter.ActorAlign.END });
      
      // Document open recent is a nice clock face standard symbol in Gnome Shell
      this._layout.clock_icon = new St.Icon({ icon_name: 'document-open-recent-symbolic', style_class: 'uptime-icon' });
      uptimeBox.add_child(this._layout.clock_icon);

      this._layout.uptime = new St.Label({ text: uptime, style_class: "streamer-uptime" });
      uptimeBox.add_child(this._layout.uptime);
      statsBox.add_child(uptimeBox);
    }

    this._wrapBox.add_child(statsBox);

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
