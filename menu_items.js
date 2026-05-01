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

export const StreamerMenuItem = GObject.registerClass(
{ GTypeName: 'StreamerMenuItem' },
class StreamerMenuItem extends PopupMenu.PopupBaseMenuItem {
  _init(streamername, login, game, viewer_count, title, is_playlist=false, hideStatus=false, uptime, platformIconPath, fullStreamerId, titleMaxLen = 45) {
    super._init();
    
    let wrapBox = new St.BoxLayout({ vertical: false, style_class: 'streamer-menuitem-container', x_expand: true });

    // 1. Avatar (Left Side)
    let avatarBox = new St.BoxLayout({ y_align: Clutter.ActorAlign.START, style_class: 'streamer-avatar-box' });
    avatarBox.add_child(Icons.get_streamericon(fullStreamerId, "streamer-icon"));
    wrapBox.add_child(avatarBox);

    // 2. Details (Middle)
    let detailsBox = new St.BoxLayout({ vertical: true, x_expand: true, y_align: Clutter.ActorAlign.CENTER, style_class: 'streamer-details-box' });
    
    let nameRow = new St.BoxLayout({ vertical: false, y_align: Clutter.ActorAlign.CENTER });
    nameRow.add_child(new St.Label({ text: streamername, style_class: "streamer-name" }));
    nameRow.add_child(new St.Icon({ gicon: Gio.icon_new_for_string(platformIconPath), style_class: 'platform-icon' }));
    detailsBox.add_child(nameRow);

    detailsBox.add_child(new St.Label({ text: game, style_class: "streamer-game" }));

    if (!hideStatus) {
      let displayTitle = (title && title.length > titleMaxLen) ? `${title.substring(0, titleMaxLen)}…` : (title || '');
      detailsBox.add_child(new St.Label({ text: displayTitle, style_class: "streamer-title" }));
    }
    wrapBox.add_child(detailsBox);

    // 3. Stats (Right Side)
    let statsBox = new St.BoxLayout({ vertical: true, y_align: Clutter.ActorAlign.CENTER, x_align: Clutter.ActorAlign.END, style_class: 'streamer-stats-box' });

    let viewersBox = new St.BoxLayout({ vertical: false, y_align: Clutter.ActorAlign.CENTER, x_align: Clutter.ActorAlign.END });
    viewersBox.add_child(new St.Icon({ icon_name: is_playlist ? 'media-playlist-repeat-symbolic' : 'avatar-default-symbolic', style_class: 'viewer-icon' }));
    viewersBox.add_child(new St.Label({ text: viewer_count.toString(), style_class: "streamer-viewer-count" }));
    statsBox.add_child(viewersBox);

    if (uptime) {
      let uptimeBox = new St.BoxLayout({ vertical: false, y_align: Clutter.ActorAlign.CENTER, x_align: Clutter.ActorAlign.END });
      uptimeBox.add_child(new St.Icon({ icon_name: 'document-open-recent-symbolic', style_class: 'uptime-icon' }));
      uptimeBox.add_child(new St.Label({ text: uptime, style_class: "streamer-uptime" }));
      statsBox.add_child(uptimeBox);
    }

    wrapBox.add_child(statsBox);
    this.add_child(wrapBox);
  }
});

export const NobodyMenuItem = GObject.registerClass(
class NobodyMenuItem extends PopupMenu.PopupBaseMenuItem {
  _init(nobodytext) {
    super._init({ reactive: false, can_focus: false });
    this.add_child(new St.Label({ text: nobodytext, style_class : "nobody-menuitem"}));
  }
});
