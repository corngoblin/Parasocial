/**
  Parasocial — streamer icons for the GNOME Shell process.

  This module imports St, so it must only be imported from code that runs
  inside GNOME Shell (extension.js and the modules it loads). The preferences
  process must use ./icons.js instead, which stays free of Shell libraries.
**/
import St from 'gi://St';
import Gio from 'gi://Gio';

import * as Icons from './icons.js';

export function get_streamericon(streamername, styleClass) {
  return new St.Icon({
    gicon: Gio.icon_new_for_string(Icons.get_final_icon_path(streamername)),
    style_class: styleClass
  });
}
