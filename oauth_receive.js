#!@GJS@ -m
/*
  Parasocial — OAuth callback receiver.

  Twitch's implicit grant flow returns the token in the URL fragment, so the
  browser never sends it to a server. This script serves a tiny page that reads
  the fragment in JavaScript and forwards it to /tokens as a query string, then
  writes the access token to the file given on the command line and exits.

  Usage: gjs -m oauth_receive.js <token-file>

  AUTHOR: Mario Wenzel (original Python implementation)
  LICENSE: GPL3.0
*/
import Soup from 'gi://Soup?version=3.0';
import GLib from 'gi://GLib';
import System from 'system';

const PORT = 8877;
const IDLE_TIMEOUT_SECONDS = 300;

const tokenPath = ARGV[0];
if (!tokenPath) {
    printerr('usage: gjs -m oauth_receive.js <token-file>');
    System.exit(1);
}

const page = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Parasocial — Twitch authorization</title>
<style>
  body { font-family: sans-serif; margin: 3em; line-height: 1.5; }
  a { color: #9147ff; }
</style></head>
<body>
<h1>Finishing authorization…</h1>
<p>If this page does not move on by itself, <a id="link" href="/">click here</a>.</p>
<script>
  const tokens = window.location.hash.substring(1);
  const link = document.getElementById('link');
  if (tokens.length) {
    link.href = '/tokens?' + tokens;
    window.setTimeout(() => { window.location.replace(link.href); }, 300);
  } else {
    link.href = '/';
  }
</script>
</body>
</html>
`;

function respond(message, status, contentType, body) {
    const bytes = new TextEncoder().encode(body);
    message.set_status(status, null);
    message.set_response(contentType, Soup.MemoryUse.COPY, bytes);
}

const server = new Soup.Server();

server.add_handler('/', (srv, message) => {
    respond(message, Soup.Status.OK, 'text/html; charset=utf-8', page);
});

server.add_handler('/tokens', (srv, message) => {
    const query = message.get_uri().get_query() ?? '';
    const params = GLib.Uri.parse_params(query, -1, '&', GLib.UriFlags.NONE);
    const token = params['access_token'];

    if (!token) {
        respond(message, Soup.Status.BAD_REQUEST, 'text/plain; charset=utf-8',
            'No access token in the callback. Please try again from the extension preferences.');
        return;
    }

    if (!GLib.file_set_contents(tokenPath, token)) {
        respond(message, Soup.Status.INTERNAL_SERVER_ERROR, 'text/plain; charset=utf-8',
            `Could not write the token to ${tokenPath}.`);
        return;
    }

    respond(message, Soup.Status.OK, 'text/plain; charset=utf-8',
        'Thank you. You can close this page and return to the extension preferences.');
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
        loop.quit();
        return GLib.SOURCE_REMOVE;
    });
});

const loop = new GLib.MainLoop(null, false);

try {
    server.listen_local(PORT, Soup.ServerListenOptions.IPV4_ONLY);
} catch (e) {
    printerr(`Could not listen on 127.0.0.1:${PORT}: ${e.message}`);
    System.exit(1);
}

// Don't leave the process behind if the authorization is never completed.
GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, IDLE_TIMEOUT_SECONDS, () => {
    loop.quit();
    return GLib.SOURCE_REMOVE;
});

loop.run();
server.disconnect();
