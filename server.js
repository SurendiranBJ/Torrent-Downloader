// Use the bundled engine when Transmission is not installed locally.
require('./server-webtorrent.js.bak');
return;

const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { Server } = require('socket.io');
const Transmission = require('transmission-promise');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ============================================================
// CONFIGURATION
// ============================================================

const DOWNLOAD_DIR = process.env.DOWNLOAD_DIR || path.join(__dirname, 'downloads');
const TMP_DIR = path.join(__dirname, 'tmp');

if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

const HTTP_PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Transmission daemon RPC connection details.
// transmission-daemon must already be running (see README for setup).
const transmission = new Transmission({
  host: process.env.TRANSMISSION_HOST || 'localhost',
  port: process.env.TRANSMISSION_PORT ? parseInt(process.env.TRANSMISSION_PORT, 10) : 9091,
  username: process.env.TRANSMISSION_USER || '',
  password: process.env.TRANSMISSION_PASS || '',
  ssl: false
});

// ============================================================
// EXPRESS
// ============================================================

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/downloads', express.static(DOWNLOAD_DIR));

const upload = multer({ dest: TMP_DIR });

// ============================================================
// SERIALIZE (map Transmission's fields -> the shape our UI expects)
// ============================================================

function serializeTorrent(t) {
  const length = t.sizeWhenDone || t.totalSize || 0;
  const downloaded = t.haveValid + t.haveUnchecked || 0;
  const progress = length > 0 ? downloaded / length : 0;

  return {
    infoHash: t.hashString,
    name: t.name || 'Fetching metadata...',
    progress,
    downloadSpeed: t.rateDownload || 0,
    uploadSpeed: t.rateUpload || 0,
    numPeers: t.peersConnected || 0,
    numSeeds: t.peersSendingToUs || 0,
    length,
    downloaded,
    uploaded: t.uploadedEver || 0,
    done: t.percentDone >= 1,
    // Transmission gives seconds, our UI expects ms; -1/-2 mean unknown
    timeRemaining: t.eta > 0 ? t.eta * 1000 : Infinity,
    paused: t.status === 0,
    files: (t.files || []).map(f => ({ name: f.name, length: f.length, path: f.name }))
  };
}

const FIELDS = [
  'id', 'hashString', 'name', 'status', 'percentDone',
  'rateDownload', 'rateUpload', 'peersConnected', 'peersSendingToUs',
  'sizeWhenDone', 'totalSize', 'haveValid', 'haveUnchecked',
  'uploadedEver', 'eta', 'files'
];

// ============================================================
// BROADCAST STATUS every second
// ============================================================

setInterval(async () => {
  try {
    const res = await transmission.get(false, FIELDS);
    io.emit('torrents-list', res.torrents.map(serializeTorrent));
  } catch (err) {
    // Daemon not reachable yet / connection hiccup — don't crash the loop
    io.emit('backend-error', { message: `Cannot reach Transmission daemon: ${err.message}` });
  }
}, 1000);

// ============================================================
// ADD MAGNET
// ============================================================

app.post('/api/add-magnet', async (req, res) => {
  const magnet = req.body?.magnet?.trim();
  if (!magnet) return res.status(400).json({ error: 'Magnet link is required' });
  if (!magnet.startsWith('magnet:')) return res.status(400).json({ error: 'Invalid magnet URI' });

  try {
    const result = await transmission.addUrl(magnet, { 'download-dir': DOWNLOAD_DIR });
    const added = result['torrent-added'] || result['torrent-duplicate'];
    res.json({ ok: true, infoHash: added ? added.hashString : null });
  } catch (err) {
    console.error('Failed to add magnet:', err);
    res.status(500).json({ error: err.message || 'Failed to reach Transmission daemon' });
  }
});

// ============================================================
// ADD .TORRENT FILE
// ============================================================

app.post('/api/add-file', upload.single('torrentFile'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No torrent file uploaded' });

  try {
    const buffer = fs.readFileSync(req.file.path);
    const result = await transmission.addBase64(buffer.toString('base64'), { 'download-dir': DOWNLOAD_DIR });
    const added = result['torrent-added'] || result['torrent-duplicate'];
    fs.unlink(req.file.path, () => {});
    res.json({ ok: true, infoHash: added ? added.hashString : null });
  } catch (err) {
    console.error('Failed to add torrent file:', err);
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    res.status(500).json({ error: err.message || 'Failed to reach Transmission daemon' });
  }
});

// ============================================================
// LIST
// ============================================================

app.get('/api/torrents', async (req, res) => {
  try {
    const result = await transmission.get(false, FIELDS);
    res.json(result.torrents.map(serializeTorrent));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// PAUSE / RESUME / REMOVE
// (Transmission identifies torrents by numeric `id`, our UI uses hashString —
//  so we look up the id from the hash first.)
// ============================================================

async function findIdByHash(hash) {
  const result = await transmission.get(false, ['id', 'hashString']);
  const match = result.torrents.find(t => t.hashString === hash);
  return match ? match.id : null;
}

app.post('/api/torrents/:infoHash/pause', async (req, res) => {
  try {
    const id = await findIdByHash(req.params.infoHash);
    if (!id) return res.status(404).json({ error: 'Torrent not found' });
    await transmission.stop(id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/torrents/:infoHash/resume', async (req, res) => {
  try {
    const id = await findIdByHash(req.params.infoHash);
    if (!id) return res.status(404).json({ error: 'Torrent not found' });
    await transmission.start(id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/torrents/:infoHash', async (req, res) => {
  try {
    const id = await findIdByHash(req.params.infoHash);
    if (!id) return res.status(404).json({ error: 'Torrent not found' });
    const removeFiles = req.query.removeFiles === 'true';
    await transmission.remove(id, removeFiles);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// SOCKET.IO
// ============================================================

io.on('connection', async (socket) => {
  try {
    const result = await transmission.get(false, FIELDS);
    socket.emit('torrents-list', result.torrents.map(serializeTorrent));
  } catch (err) {
    socket.emit('backend-error', { message: `Cannot reach Transmission daemon: ${err.message}` });
  }
});

// ============================================================
// START
// ============================================================

server.listen(HTTP_PORT, async () => {
  console.log('');
  console.log('==========================================');
  console.log('       TORRENT DOWNLOADER STARTED');
  console.log('        (Transmission-backed engine)');
  console.log('==========================================');
  console.log(`Web UI:       http://localhost:${HTTP_PORT}`);
  console.log(`Downloads:    ${DOWNLOAD_DIR}`);
  console.log(`Transmission: ${process.env.TRANSMISSION_HOST || 'localhost'}:${process.env.TRANSMISSION_PORT || 9091}`);

  try {
    await transmission.get(false, ['id']);
    console.log('Connected to Transmission daemon successfully.');
  } catch (err) {
    console.log('');
    console.log('WARNING: Could not connect to Transmission daemon.');
    console.log('Make sure transmission-daemon is installed and running.');
    console.log('See README.md for setup instructions.');
  }
  console.log('==========================================');
  console.log('');
});
