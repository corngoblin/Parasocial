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
  _init(streamername, login, game, viewer_count, title, is_playlist=false, hideStatus=false, uptime, platformIconPath, fullStreamerId, titleMaxLen = 45, avatarSize = 20, platformIconSize = 16, menuSpacing = 8, fontSize = 14, showPlatformIcons = true, showViewerCount = true) {
    super._init();
    
    // Debug: check if the setting is being passed
    console.log(`[Parasocial] showPlatformIcons = ${showPlatformIcons}, showViewerCount = ${showViewerCount}`);

    let wrapBox = new St.BoxLayout({ vertical: false, style_class: 'streamer-menuitem-container', x_expand: true });
    wrapBox.spacing = menuSpacing;

    // 1. Avatar
    let avatarBox = new St.BoxLayout({ y_align: Clutter.ActorAlign.START, style_class: 'streamer-avatar-box' });
    let avatarIcon = Icons.get_streamericon(fullStreamerId, "streamer-icon");
    avatarIcon.set_style(`width: ${avatarSize}px; height: ${avatarSize}px;`);
    avatarBox.add_child(avatarIcon);
    wrapBox.add_child(avatarBox);

    // 2. Details
    let detailsBox = new St.BoxLayout({ vertical: true, x_expand: true, y_align: Clutter.ActorAlign.CENTER, style_class: 'streamer-details-box' });
    detailsBox.set_style(`margin-left: ${menuSpacing}px; margin-right: ${menuSpacing}px;`);
    
    let nameRow = new St.BoxLayout({ vertical: false, y_align: Clutter.ActorAlign.CENTER });
    let nameLabel = new St.Label({ text: streamername, style_class: "streamer-name" });
    nameLabel.set_style(`font-size: ${fontSize}px;`);
    nameRow.add_child(nameLabel);
    
    // Conditionally add platform icon
    if (showPlatformIcons) {
      let platformIcon = new St.Icon({
        gicon: Gio.icon_new_for_string(platformIconPath),
        style_class: 'platform-icon'
      });
      platformIcon.set_style(`height: ${platformIconSize}px;`);
      nameRow.add_child(platformIcon);
    }
    detailsBox.add_child(nameRow);

    let gameLabel = new St.Label({ text: game, style_class: "streamer-game" });
    gameLabel.set_style(`font-size: ${fontSize * 0.85}px;`);
    detailsBox.add_child(gameLabel);

    if (!hideStatus) {
      let displayTitle = (title && title.length > titleMaxLen) ? `${title.substring(0, titleMaxLen)}…` : (title || '');
      let titleLabel = new St.Label({ text: displayTitle, style_class: "streamer-title" });
      titleLabel.set_style(`font-size: ${fontSize * 0.8}px;`);
      detailsBox.add_child(titleLabel);
    }
    wrapBox.add_child(detailsBox);

    // 3. Stats (conditionally show viewer count)
    let statsBox = new St.BoxLayout({ vertical: true, y_align: Clutter.ActorAlign.CENTER, x_align: Clutter.ActorAlign.END, style_class: 'streamer-stats-box' });

    if (showViewerCount) {
      let viewersBox = new St.BoxLayout({ vertical: false, y_align: Clutter.ActorAlign.CENTER, x_align: Clutter.ActorAlign.END });
      let eyeIcon = new St.Icon({ icon_name: is_playlist ? 'media-playlist-repeat-symbolic' : 'avatar-default-symbolic', style_class: 'viewer-icon' });
      eyeIcon.set_style(`width: ${fontSize * 0.9}px; height: ${fontSize * 0.9}px;`);
      viewersBox.add_child(eyeIcon);
      let viewerLabel = new St.Label({ text: viewer_count.toString(), style_class: "streamer-viewer-count" });
      viewerLabel.set_style(`font-size: ${fontSize * 0.9}px;`);
      viewersBox.add_child(viewerLabel);
      statsBox.add_child(viewersBox);
    }

    if (uptime) {
      let uptimeBox = new St.BoxLayout({ vertical: false, y_align: Clutter.ActorAlign.CENTER, x_align: Clutter.ActorAlign.END });
      let clockIcon = new St.Icon({ icon_name: 'document-open-recent-symbolic', style_class: 'uptime-icon' });
      clockIcon.set_style(`width: ${fontSize * 0.9}px; height: ${fontSize * 0.9}px;`);
      uptimeBox.add_child(clockIcon);
      let uptimeLabel = new St.Label({ text: uptime, style_class: "streamer-uptime" });
      uptimeLabel.set_style(`font-size: ${fontSize * 0.9}px;`);
      uptimeBox.add_child(uptimeLabel);
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
