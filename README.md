# HireHop plugins

Small plugins for the [HireHop](https://hirehop.com) equipment rental web app.

## kyoto-inverted-qr.js

HireHop's camera scanner (Scanning page) does not read QR codes printed white on black.
While the built-in camera scanner is running, this plugin inverts frames from the same video,
decodes them, and hands any result to HireHop's own scan handler. It does nothing on other pages,
stores nothing and sends nothing anywhere.

Install: HireHop > Settings > Company settings > Plugins > Add plugin, using a URL pinned to a commit, e.g.

    https://cdn.jsdelivr.net/gh/<user>/hirehop-plugins@<commit>/kyoto-inverted-qr.js

Not affiliated with HireHop.
