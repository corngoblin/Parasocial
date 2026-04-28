import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';

import * as Icons from './icons.js';

export function empty() {
  return {
    box: new St.Label({text: "", y_align: Clutter.ActorAlign.CENTER}),
    update: function() { },
    interval: function() { }
  };
}

export function text_only() {
  let rotation = 0,
      online = [];
  return {
    box: new St.Label({text: "", y_align: Clutter.ActorAlign.CENTER}),
    update: function(_online) { online = _online; },
    interval: function() { this.box.set_text(online[rotation++ % online.length].streamer); }
  };
}

export function icon_only() {
  let icon = new St.Icon({ style_class: 'streamer-icon system-status-icon' });
  icon.visible = false;
  let box = new St.BoxLayout();
  box.add_child(icon);
  let rotation = 0,
      online = [];
  return {
    box,
    update: function(_online) {
      online = _online;
      if (online.length === 0) icon.visible = false;
    },
    interval: function() {
      if (online.length === 0) {
        icon.visible = false;
        return;
      }
      icon.visible = true;
      let streamer = online[rotation % online.length];
      rotation = (rotation + 1) % online.length;
      // use fullId to get the correct cached icon
      icon.gicon = Gio.icon_new_for_string(Icons.get_final_icon_path(streamer.fullId));
    }
  };
}

export function count_only() {
  return {
    box: new St.Label({text: "", y_align: Clutter.ActorAlign.CENTER}),
    update: function(online) { this.box.set_text(online.length.toString()); },
    interval: function() { }
  };
}

export function all_icons() {
  let actors = [];
  return {
    box: new St.BoxLayout(),
    update: function(online) {
      actors.forEach((actor) => actor.destroy());
      actors = online.map((streamer) =>
        Icons.get_streamericon(streamer.fullId, "streamer-icon system-status-icon")
      );
      actors.forEach((icon) => this.box.add_child(icon));
    },
    interval: function() { }
  };
}
