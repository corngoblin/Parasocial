import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import * as Icons from './icons.js';

export const empty = () => ({
  box: new St.Label({ text: "", y_align: Clutter.ActorAlign.CENTER }),
  update: () => {}, interval: () => {}
});

export const text_only = () => {
  let rotation = 0, online = [];
  return {
    box: new St.Label({ text: "", y_align: Clutter.ActorAlign.CENTER }),
    update: (data) => { online = data; },
    interval() { if (online.length) this.box.set_text(online[rotation++ % online.length].streamer); }
  };
};

export const icon_only = () => {
  const icon = new St.Icon({ style_class: 'streamer-icon system-status-icon', visible: false });
  const box = new St.BoxLayout();
  box.add_child(icon);
  
  let rotation = 0, online = [];
  return {
    box,
    update: (data) => {
      online = data;
      if (!online.length) icon.visible = false;
    },
    interval() {
      icon.visible = online.length > 0;
      if (!online.length) return;
      const streamer = online[rotation % online.length];
      rotation = (rotation + 1) % online.length;
      icon.gicon = Gio.icon_new_for_string(Icons.get_final_icon_path(streamer.fullId));
    }
  };
};

export const count_only = () => ({
  box: new St.Label({ text: "", y_align: Clutter.ActorAlign.CENTER }),
  update(online) { this.box.set_text(online.length.toString()); },
  interval: () => {}
});

export const all_icons = () => {
  let actors = [];
  return {
    box: new St.BoxLayout(),
    update(online) {
      actors.forEach(actor => actor.destroy());
      actors = online.map(streamer => Icons.get_streamericon(streamer.fullId, "streamer-icon system-status-icon"));
      actors.forEach(icon => this.box.add_child(icon));
    },
    interval: () => {}
  };
};
