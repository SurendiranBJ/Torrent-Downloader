# Torrent Downloader: Local Windows Architecture

A production-grade, local Windows torrent management platform built for maximum swarm throughput, robust multi-tenant security, and automated cloud/object storage offloading.

Powered by **Transmission** (as the exclusive torrent engine), **Turborepo**, **Next.js 16**, **Express**, **Prisma (PostgreSQL)**, **Redis**, **BullMQ**, and **MinIO/S3**.

---

## 1. Architecture Overview

```text
                                WINDOWS PC (Local)
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│                               Browser UI                                    │
│                     (Next.js App Router + React + Tailwind)                  │
│                                   │                                         │
│                      HTTP / REST  │  Socket.IO (Authenticated user rooms)   │
│                                   ▼                                         │
│                         Express API Server                                  │
│             (JWT Auth, Multi-tenant DB, Diagnostics, Polling Cache)         │
│                        │                      │                             │
│       Transmission RPC │                      │ Enqueue completed jobs      │
│                        ▼                      ▼                             │
│              Transmission Daemon        Redis + BullMQ                      │
│             (Peer Port 51413 TCP/UDP)         │                             │
│                        │                      ▼                             │
│                  Torrent Swarm          Storage Worker                      │
│                 (DHT, PEX, Trackers)          │                             │
│                        │                      ▼                             │
│                 Incomplete / NVMe       MinIO / S3 / R2                     │
│                        │                      │                             │
│                        ▼                      ▼                             │
│                 Completed Files ──────── Presigned URL / Local Download     │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ Infrastructure Containers: PostgreSQL, Redis, Transmission, MinIO           │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Core Architecture Highlights
1. **Transmission Exclusive Engine**: WebTorrent has been eliminated from production execution. Transmission daemon handles all piece verification, DHT, PEX, and peer transport.
2. **Immediate Local Access**: When a torrent completes (100%), local file streaming is instantly available. Background upload to object storage (MinIO/S3) is asynchronous and never blocks local access.
3. **Multi-Tenant Isolation**: Users have isolated accounts with bcrypt-hashed passwords and JWT sessions. Socket.IO broadcasts torrent states only into private `user:<userId>` rooms.
4. **Heuristic Diagnostics**: Automated bottleneck detection categorizes throughput limits into *Network Limited*, *Peer Connectivity Limited*, *Torrent Swarm Limited*, *Transmission Limited*, or *Disk Limited*.

---

## 2. Monorepo Structure

```text
Torrent-Downloader/
├── apps/
│   ├── web/                     # Next.js 16 App Router UI
│   │   ├── app/                 # Routes: /, /login, /register, /dashboard
│   │   ├── components/          # AddTorrentModal, DiagnosticsModal, TorrentCard, Navbar
│   │   ├── lib/                 # Socket.IO & API clients
│   │   └── package.json
│   │
│   └── api/                     # Express & Socket.IO backend
│       ├── prisma/              # PostgreSQL Prisma Schema
│       ├── src/
│       │   ├── cache/           # In-memory Transmission status cache
│       │   ├── db/              # Prisma client
│       │   ├── middleware/      # JWT authentication middleware
│       │   ├── queues/          # BullMQ upload queue
│       │   ├── routes/          # Auth & Torrent REST endpoints
│       │   ├── services/        # Transmission, Storage, Diagnostics, Perf Logger
│       │   ├── sockets/         # Authenticated Socket.IO rooms
│       │   ├── workers/         # BullMQ S3 Storage Worker
│       │   └── __tests__/       # Comprehensive Jest test suites
│       └── package.json
│
├── packages/
│   └── shared/                  # TypeScript types & domain models
│       ├── src/index.ts         # Synchronized types (TorrentInfo, User, etc.)
│       └── package.json
│
├── data/
│   └── transmission/
│       ├── downloads/           # Completed downloads directory
│       └── incomplete/          # Active downloading pieces (NVMe / SSD)
│
├── docker-compose.yml           # Full infrastructure orchestration
├── turbo.json                   # Turborepo task pipelines
├── package.json                 # Root npm workspaces configuration
├── .env.example                 # Environment variables specification
└── README.md
```

---

## 3. Windows Setup Guide (Windows 10/11)

### Prerequisites
* **Docker Desktop for Windows** with WSL2 backend enabled.
* **Node.js**: v20 or v22.
* **Git for Windows**.

### WSL2 Backend Configuration
1. Open PowerShell as Administrator and ensure WSL2 is up to date:
   ```powershell
   wsl --update
   ```
2. In **Docker Desktop Settings** -> **General**, check:
   * *Use the WSL 2 based engine*
3. In **Docker Desktop Settings** -> **Resources** -> **WSL Integration**, enable your default Linux distribution.

---

## 4. Peer Port Networking & Windows Firewall

Transmission uses port **51413** (TCP and UDP) to accept incoming connections from peers across the global BitTorrent swarm. Accepting incoming connections is crucial to achieving maximum download speeds.

### Windows Defender Firewall Inbound Rules
Open PowerShell as **Administrator** and run:

```powershell
# Allow Transmission TCP peer connections
New-NetFirewallRule -DisplayName "Transmission BitTorrent Peer TCP" `
  -Direction Inbound `
  -LocalPort 51413 `
  -Protocol TCP `
  -Action Allow

# Allow Transmission UDP peer connections (DHT and uTP)
New-NetFirewallRule -DisplayName "Transmission BitTorrent Peer UDP" `
  -Direction Inbound `
  -LocalPort 51413 `
  -Protocol UDP `
  -Action Allow
```

### Router Port Forwarding

```text
Internet ──> Router (NAT) ──> Windows PC (Firewall) ──> Docker / Transmission
```

#### Option A: UPnP / NAT-PMP (Automatic)
The application automatically requests UPnP port mapping via Transmission's `port-forwarding-enabled: true`. If your home router has UPnP enabled, incoming ports will be forwarded automatically.

#### Option B: Manual Port Forwarding
If UPnP is disabled on your router:
1. Log in to your home router's admin panel (usually `192.168.1.1` or `192.168.0.1`).
2. Navigate to **Port Forwarding** / **Virtual Servers**.
3. Create a rule forwarding **Port 51413 (TCP & UDP)** to your Windows PC's local LAN IP (e.g. `192.168.1.150`).

The **Diagnostics Modal** inside the dashboard tests this port in real time and reports `OPEN`, `CLOSED`, or `UNKNOWN`.

---

## 5. Storage Configuration (NVMe / SSD)

For optimal I/O throughput during multi-gigabit downloads:
* **Active Incomplete Pieces**: Keep `INCOMPLETE_DIR` on your fastest local NVMe SSD (e.g. `C:\Users\<user>\Documents\Torrent\data\incomplete`).
* **Completed Downloads**: Stored under `DOWNLOAD_DIR`. Once complete, pieces are assembled and verified.

---

## 6. Environment Variables

Create `.env` from `.env.example`:

```bash
cp .env.example .env
```

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `PORT` / `API_PORT` | `4000` | Express API HTTP port |
| `WEB_PORT` | `3000` | Next.js frontend port |
| `DATABASE_URL` | `postgresql://...` | PostgreSQL connection string |
| `REDIS_URL` | `redis://...` | Redis connection for BullMQ & caching |
| `JWT_SECRET` | `min-32-chars` | Signing key for user access tokens |
| `JWT_REFRESH_SECRET`| `min-32-chars` | Signing key for refresh tokens |
| `TRANSMISSION_HOST` | `transmission` | Transmission daemon hostname |
| `TRANSMISSION_RPC_PORT` | `9091` | Transmission RPC port |
| `TRANSMISSION_PEER_PORT`| `51413` | Swarm peer port (TCP & UDP) |
| `TRANSMISSION_DOWNLOAD_LIMIT` | `0` | `0` = Unlimited download bandwidth |
| `TRANSMISSION_UPLOAD_LIMIT` | `0` | `0` = Unlimited upload bandwidth |
| `STORAGE_ENDPOINT` | `http://localhost:9000` | S3 endpoint (MinIO / AWS S3 / R2) |
| `STORAGE_BUCKET` | `torrent-completed` | Destination bucket for completed files |
| `STORAGE_ACCESS_KEY` | `minioadmin` | S3 Access Key |
| `STORAGE_SECRET_KEY` | `minioadmin` | S3 Secret Key |

---

## 7. Running with Docker Compose (Recommended)

To launch all infrastructure services (Web, API, Transmission, PostgreSQL, Redis, MinIO):

```bash
docker compose up --build -d
```

### Service Access:
* **Web UI**: [http://localhost:3000](http://localhost:3000)
* **API Server**: [http://localhost:4000](http://localhost:4000)
* **MinIO Console**: [http://localhost:9001](http://localhost:9001) (User: `minioadmin`, Pass: `minioadmin`)

---

## 8. Running Locally for Development

### 1. Install Dependencies
```bash
npm install
```

### 2. Build Shared Package
```bash
npm run build --workspace=@torrent-platform/shared
```

### 3. Initialize Prisma & Build API
```bash
npm run prisma:generate --workspace=@torrent-platform/api
npm run build --workspace=@torrent-platform/api
```

### 4. Build Next.js Web Frontend
```bash
npm run build --workspace=@torrent-platform/web
```

### 5. Run Automated Test Suite
```bash
npm test --workspace=@torrent-platform/api
```

---

## 9. Benchmarking Guide

To evaluate the speed of this platform compared to standard desktop clients (such as qBittorrent):
1. Use an official, legally permissible test torrent, such as the latest **Ubuntu Desktop ISO** or **Debian Netinst ISO**:
   * Example Ubuntu Magnet: `magnet:?xt=urn:btih:e6bb925d2b7c4a17ab8cf8073fa8ff4d34eb5de0`
2. Record:
   * **Peak Download Speed** (MB/s)
   * **Average Download Speed** (MB/s)
   * **Connected Peers** & **Active Seeds**
   * **Time to 100% Completion**
3. Note: The application cannot exceed the physical bandwidth of your ISP or the aggregate upload bandwidth of available peers in the swarm.

---

## 10. Troubleshooting: Why Torrent Speeds May Be Slow

If download speeds are lower than expected, review the following factors:

1. **Swarm Seed Availability**: If the torrent has few seeders or seeders with throttled upload limits, download speeds will be capped by the swarm.
2. **Peer Port Reachability**: If port `51413` is reported as `CLOSED` in Diagnostics, your client cannot accept inbound connections from passive peers (NAT traversal limitation). Ensure Windows Firewall rules and router port forwarding are applied.
3. **ISP Throttling & Shaping**: Some ISPs identify and throttle BitTorrent traffic. Enabling protocol encryption in Transmission settings mitigates this.
4. **Disk I/O Bottlenecks**: Writing multi-gigabyte files to slow mechanical hard drives or USB 2.0 drives causes disk write queues to stall download buffers. Use an NVMe or SATA SSD.
5. **Configured Speed Limits**: Verify that `TRANSMISSION_DOWNLOAD_LIMIT` and `TRANSMISSION_UPLOAD_LIMIT` are set to `0` (unlimited).

---

## 11. Security & Isolation Guarantee

* **Authentication**: Passwords are encrypted using salted bcrypt hashes.
* **Token Security**: Tokens are stored in HttpOnly, SameSite cookies and bearer headers.
* **Tenant Isolation**: Torrents and file downloads are strictly filtered by `userId`. User A can never inspect, pause, delete, or download User B's torrents.
* **Path Traversal Protection**: Local file downloads strictly sanitize file paths against `DOWNLOAD_DIR`.
