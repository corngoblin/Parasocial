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
    
    // Fix: Removed 'spacing' property from constructor as it doesn't exist in St.BoxLayout
    const wrapBox = new St.BoxLayout({ vertical: false, style_class: 'streamer-menuitem-container', x_expand: true });
    wrapBox.set_style(`spacing: ${menuSpacing}px;`);

    // 1. Avatar
    const avatarBox = new St.BoxLayout({ y_align: Clutter.ActorAlign.START, style_class: 'streamer-avatar-box' });
    const avatarIcon = Icons.get_streamericon(fullStreamerId, "streamer-icon");
    avatarIcon.set_style(`width: ${avatarSize}px; height: ${avatarSize}px;`);
    avatarBox.add_child(avatarIcon);
    wrapBox.add_child(avatarBox);

    // 2. Details
    const detailsBox = new St.BoxLayout({ vertical: true, x_expand: true, y_align: Clutter.ActorAlign.CENTER, style_class: 'streamer-details-box' });
    detailsBox.set_style(`margin-left: ${menuSpacing}px; margin-right: ${menuSpacing}px; spacing: 2px;`);
    
    const nameRow = new St.BoxLayout({ vertical: false, y_align: Clutter.ActorAlign.CENTER });
    nameRow.set_style(`spacing: ${menuSpacing / 2}px;`);
    
    const nameLabel = new St.Label({ text: streamername || 'Unknown', style_class: "streamer-name" });
    nameLabel.set_style(`font-size: ${fontSize}px;`);
    nameRow.add_child(nameLabel);
    
    if (showPlatformIcons) {
      const platformIcon = new St.Icon({ gicon: Gio.icon_new_for_string(platformIconPath), style_class: 'platform-icon' });
      platformIcon.set_style(`height: ${platformIconSize}px; width: ${platformIconSize}px;`);
      nameRow.add_child(platformIcon);
    }
    detailsBox.add_child(nameRow);

    if (game && game.trim()) {
      const gameLabel = new St.Label({ text: game, style_class: "streamer-game" });
      gameLabel.set_style(`font-size: ${fontSize * 0.85}px;`);
      detailsBox.add_child(gameLabel);
    }

    if (!hideStatus) {
      const displayTitle = (title && title.length > titleMaxLen) ? `${title.substring(0, titleMaxLen)}…` : (title || '');
      const titleLabel = new St.Label({ text: displayTitle, style_class: "streamer-title" });
      titleLabel.set_style(`font-size: ${fontSize * 0.8}px;`);
      detailsBox.add_child(titleLabel);
    }
    wrapBox.add_child(detailsBox);

    // 3. Stats
    const statsBox = new St.BoxLayout({ vertical: true, y_align: Clutter.ActorAlign.CENTER, x_align: Clutter.ActorAlign.END, style_class: 'streamer-stats-box' });
    statsBox.set_style(`spacing: 2px;`);

    if (showViewerCount) {
      const viewersBox = new St.BoxLayout({ vertical: false, y_align: Clutter.ActorAlign.CENTER, x_align: Clutter.ActorAlign.END });
      viewersBox.set_style(`spacing: 4px;`);
      
      const eyeIcon = new St.Icon({ icon_name: is_playlist ? 'media-playlist-repeat-symbolic' : 'avatar-default-symbolic', style_class: 'viewer-icon' });
      eyeIcon.set_style(`width: ${fontSize * 0.9}px; height: ${fontSize * 0.9}px;`);
      
      const viewerLabel = new St.Label({ text: String(viewer_count || 0), style_class: "streamer-viewer-count" });
      viewerLabel.set_style(`font-size: ${fontSize * 0.9}px;`);
      
      viewersBox.add_child(eyeIcon);
      viewersBox.add_child(viewerLabel);
      statsBox.add_child(viewersBox);
    }

    if (uptime) {
      const uptimeBox = new St.BoxLayout({ vertical: false, y_align: Clutter.ActorAlign.CENTER, x_align: Clutter.ActorAlign.END });
      uptimeBox.set_style(`spacing: 4px;`);
      
      const clockIcon = new St.Icon({ icon_name: 'document-open-recent-symbolic', style_class: 'uptime-icon' });
      clockIcon.set_style(`width: ${fontSize * 0.9}px; height: ${fontSize * 0.9}px;`);
      
      const uptimeLabel = new St.Label({ text: String(uptime), style_class: "streamer-uptime" });
      uptimeLabel.set_style(`font-size: ${fontSize * 0.9}px;`);
      
      uptimeBox.add_child(clockIcon);
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
