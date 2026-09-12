# Torrent Downloader

Local web app for downloading torrents with a live progress dashboard.

**This version uses `transmission-daemon` as the download engine** (instead of the JS `webtorrent` library) because it's dramatically faster — it's the same native C engine used by the Transmission desktop app, not a single-threaded JS reimplementation. Your existing web UI talks to it over Transmission's RPC API.

## Setup

### 1. Install and start transmission-daemon

**macOS (Homebrew):**
```bash
brew install transmission-cli
transmission-daemon --allowed "127.0.0.1,localhost" --rpc-auth-required false
```

**Linux (Debian/Ubuntu):**
```bash
sudo apt install transmission-daemon
sudo systemctl start transmission-daemon
```
By default the Linux package runs as user `debian-transmission` and locks RPC to localhost — edit `/etc/transmission-daemon/settings.json` if you need to change the download folder or open RPC to your LAN, then `sudo systemctl restart transmission-daemon`.

**Windows:**
Download the Transmission daemon build, or run it via WSL using the Linux instructions above.

Verify it's running:
```bash
curl http://localhost:9091/transmission/rpc
```
A `409` response with a session-id header means it's up and reachable (that's normal — Transmission's RPC always 409s on a bare GET).

### 2. Run the web app

```bash
cd torrent-app
npm install
node server.js
```

Then open **http://localhost:3000**.

If the daemon's download directory differs from this app's `downloads/` folder, files will still show up correctly — the app tells Transmission to use `torrent-app/downloads` via `download-dir` when adding torrents.

### Configuration (environment variables, all optional)

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Web UI port |
| `TRANSMISSION_HOST` | `localhost` | Where transmission-daemon's RPC is listening |
| `TRANSMISSION_PORT` | `9091` | Transmission's RPC port |
| `TRANSMISSION_USER` / `TRANSMISSION_PASS` | (blank) | If you set `rpc-authentication-required` in Transmission's settings |
| `DOWNLOAD_DIR` | `torrent-app/downloads` | Where files are saved |

## Features

- Add downloads via magnet link or `.torrent` file upload
- Live progress bar, download/upload speed, peer/seed count, ETA (updates every second via WebSocket)
- Pause / resume / remove torrents
- Remove with or without deleting downloaded files

## Why this is faster than the previous WebTorrent version

The old version (`server-webtorrent.js.bak`, kept for reference) used the `webtorrent` npm package, a pure-JavaScript torrent implementation. It's convenient because it needs no external daemon, but it's inherently slower:

- Runs single-threaded in Node — piece hashing and disk I/O compete with your web server for the same event loop.
- Its networking stack is JS-level, not OS-optimized like the C libtorrent engine Transmission/qBittorrent use.
- Conservative default request pipelining per peer.

If you ever want to go back to the no-daemon version, restore `server-webtorrent.js.bak` as `server.js` and `npm install webtorrent@1.9.7`.

## Speed notes

- Speed is still ultimately capped by the swarm's seeder health — even the fastest client can't exceed what peers are willing/able to upload.
- Port forward Transmission's peer port (default `51413`, TCP+UDP) on your router for the biggest speed improvement on top of the daemon swap.

## Notes

- This app only implements the torrent protocol — you're responsible for what you download and for complying with copyright law in your jurisdiction.
