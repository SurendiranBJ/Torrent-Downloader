const socket = io();

// Tabs
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

const statusMsg = document.getElementById('statusMsg');
function showStatus(msg, isError = false) {
  statusMsg.textContent = msg;
  statusMsg.style.color = isError ? '#ff5b6e' : '#8b93a7';
  setTimeout(() => { statusMsg.textContent = ''; }, 4000);
}

// Magnet form
document.getElementById('magnetForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('magnetInput');
  const magnet = input.value.trim();
  if (!magnet) return;
  try {
    const res = await fetch('/api/add-magnet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ magnet })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to add magnet');
    input.value = '';
    showStatus('Torrent added, fetching metadata...');
  } catch (err) {
    showStatus(err.message, true);
  }
});

// File form
document.getElementById('fileForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fileInput = document.getElementById('fileInput');
  if (!fileInput.files.length) return;
  const formData = new FormData();
  formData.append('torrentFile', fileInput.files[0]);
  try {
    const res = await fetch('/api/add-file', { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to add file');
    fileInput.value = '';
    showStatus('Torrent file added, fetching metadata...');
  } catch (err) {
    showStatus(err.message, true);
  }
});

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) { bytes /= 1024; i++; }
  return bytes.toFixed(1) + ' ' + units[i];
}

function formatSpeed(bps) {
  return formatBytes(bps) + '/s';
}

function formatTime(ms) {
  if (!ms || ms === Infinity) return '—';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

const listEl = document.getElementById('torrentList');

function render(torrents) {
  if (!torrents.length) {
    listEl.innerHTML = '<p class="empty">No downloads yet. Add a magnet link or .torrent file above.</p>';
    return;
  }
  listEl.innerHTML = torrents.map(t => {
    const pct = Math.round(t.progress * 100);
    return `
      <div class="torrent-card" data-hash="${t.infoHash}">
        <div class="torrent-name">${t.name}${t.done ? '<span class="badge-done">Done</span>' : ''}${t.paused && !t.done ? '<span class="badge-done" style="background:rgba(139,147,167,0.15);color:#8b93a7;">Paused</span>' : ''}</div>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill" style="width:${pct}%"></div>
        </div>
        <div class="meta-row">
          <span>${pct}% · ${formatBytes(t.downloaded)} / ${formatBytes(t.length)}</span>
          <span>↓ ${formatSpeed(t.downloadSpeed)} · ↑ ${formatSpeed(t.uploadSpeed)} · ${t.numPeers} peers (${t.numSeeds || 0} seeds)</span>
        </div>
        <div class="meta-row">
          <span>ETA: ${formatTime(t.timeRemaining)}</span>
        </div>
        <div class="actions">
          <button onclick="pauseTorrent('${t.infoHash}')">Pause</button>
          <button onclick="resumeTorrent('${t.infoHash}')">Resume</button>
          <button class="danger" onclick="removeTorrent('${t.infoHash}', false)">Remove</button>
          <button class="danger" onclick="removeTorrent('${t.infoHash}', true)">Remove + Delete Files</button>
        </div>
      </div>
    `;
  }).join('');
}

socket.on('torrents-list', render);

socket.on('backend-error', (err) => {
  showStatus(err.message, true);
});

async function pauseTorrent(hash) {
  await fetch(`/api/torrents/${hash}/pause`, { method: 'POST' });
}
async function resumeTorrent(hash) {
  await fetch(`/api/torrents/${hash}/resume`, { method: 'POST' });
}
async function removeTorrent(hash, removeFiles) {
  await fetch(`/api/torrents/${hash}?removeFiles=${removeFiles}`, { method: 'DELETE' });
}
