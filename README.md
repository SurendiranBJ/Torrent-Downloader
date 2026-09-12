# AWS EC2 Torrent Downloader (Ubuntu 24.04 LTS)

> **Cloud-Native Architecture**: Runs 100% inside **Amazon Web Services (AWS) EC2**, downloading torrents directly from the swarm using AWS network capacity and dedicated EBS storage. The user's home computer is **never** part of the BitTorrent swarm—it is only used to open the web dashboard (`http://EC2_PUBLIC_IP/`) and download completed files via Amazon S3.

Built with **Transmission** (exclusive torrent engine), **Next.js 16 App Router**, **Express API**, **Prisma (PostgreSQL)**, **Redis**, **BullMQ**, and **Amazon S3**.

---

## 1. Cloud Architecture Overview

```text
                           INTERNET / USER BROWSER
                                      │
                                      │ HTTP :80 (No Nginx)
                                      ▼
                    ┌───────────────────────────────────┐
                    │      AWS EC2 (Ubuntu 24.04)       │
                    │                                   │
                    │   Node Application Gateway (:80)  │
                    │   ├── Next.js App Router (UI)     │
                    │   ├── Express API (/api/*)        │
                    │   └── Socket.IO (/socket.io/*)    │
                    │                   │               │
                    │  Transmission RPC │ (Private)     │
                    │                   ▼               │
                    │         Transmission Daemon       │
                    │     (Peer Port 51413 TCP/UDP)     │
                    │                   │               │
                    │                   ▼               │
                    │             Torrent Swarm         │
                    │                   │               │
                    │                   ▼               │
                    │          EBS Volume Storage       │
                    │   ├── /incomplete                 │
                    │   └── /downloads ─────────────────┼───> Immediate HTTP Download
                    │                   │               │     (/api/torrents/:id/download-local)
                    │                   ▼               │
                    │             BullMQ Worker         │
                    └───────────────────┬───────────────┘
                                        │ (EC2 IAM Role - Zero keys in .env)
                                        ▼
                                    Amazon S3
                                        │
                                        ▼
                                 Pre-signed URL
                                        │
                                        ▼
                                  User Browser
```

### Core Architecture Highlights
* **Zero Local Swarm Traffic**: All torrent chunk discovery, DHT, PEX, and peer transport run exclusively inside AWS EC2.
* **Direct Port 80 Serving (NO NGINX)**: Next.js pages, Express REST endpoints (`/api/*`), and Socket.IO WebSockets are served directly through a single Node.js gateway on Port 80 with native WebSocket upgrade handling.
* **EC2 IAM Role Authentication**: Zero long-lived AWS credentials in `.env`. The AWS SDK Default Credential Provider Chain uses the EC2 instance profile directly.
* **EBS Storage Isolation**: Active downloading pieces are stored on `/data/transmission/incomplete` and completed files on `/data/transmission/downloads`.
* **Immediate Local Access**: Completed files can be downloaded immediately from EC2 over HTTP while background BullMQ workers upload to Amazon S3 asynchronously.
* **Private S3 Objects & Pre-Signed URLs**: S3 objects remain private. Users receive short-lived (15-minute) pre-signed GET URLs for direct cloud downloads.

---

## 2. Public Port & Security Group Rules

Configure your EC2 Security Group with only the minimum required ports:

| Port | Protocol | Source | Purpose |
| :--- | :--- | :--- | :--- |
| **22** | TCP | `My IP` (Recommended) | Secure SSH access |
| **80** | TCP | `0.0.0.0/0` | Public Web Dashboard & API Gateway |
| **51413** | TCP | `0.0.0.0/0` | BitTorrent swarm peer connections |
| **51413** | UDP | `0.0.0.0/0` | BitTorrent DHT and uTP connections |

> [!CAUTION]
> **Never publicly expose internal service ports**:
> * `5432` (PostgreSQL) — Internal Docker network only
> * `6379` (Redis) — Internal Docker network only
> * `9091` (Transmission RPC) — Internal Docker network only
> * `3000` (Next.js internal) — Proxied through Port 80 Gateway only

---

## 3. Step-by-Step AWS EC2 Deployment Guide

### Step 1: Launch EC2 Instance
* **OS**: Ubuntu Server 24.04 LTS (64-bit x86 or ARM64).
* **Instance Type**: `t3.medium` or higher recommended for high-bandwidth swarms (`t3.micro`/`t3.small` can be used for initial testing).
* **Security Group**: Assign rules for ports `22`, `80`, `51413/tcp`, and `51413/udp`.

### Step 2: Attach & Mount Dedicated EBS Volume
Attach an Amazon EBS volume (gp3 recommended) to your EC2 instance for torrent payload storage.

```bash
# 1. List block devices to identify the newly attached volume
lsblk

# Example output:
# NAME         MAJ:MIN RM   SIZE RO TYPE MOUNTPOINTS
# nvme0n1      259:0    0    30G  0 disk /
# nvme1n1      259:1    0   100G  0 disk   <--- Unformatted EBS volume

# 2. Format the EBS volume with ext4 (replace /dev/nvme1n1 with your disk device)
sudo mkfs.ext4 -m 1 /dev/nvme1n1

# 3. Retrieve the unique filesystem UUID (Do NOT hardcode device paths)
sudo blkid /dev/nvme1n1
# Example output: /dev/nvme1n1: UUID="3fa2b189-93e1-4822-b529-6cf6b17c2f0d" TYPE="ext4"

# 4. Create mount directory
sudo mkdir -p /data

# 5. Add persistent mount entry to /etc/fstab using UUID
echo "UUID=3fa2b189-93e1-4822-b529-6cf6b17c2f0d /data ext4 defaults,nofail 0 2" | sudo tee -a /etc/fstab

# 6. Mount volume and verify
sudo mount -a
df -h /data

# 7. Create Transmission directories with proper permissions
sudo mkdir -p /data/transmission/{incomplete,downloads,config}
sudo chown -R 1000:1000 /data/transmission
```

### Step 3: Attach IAM Instance Role for S3 Access
Create an IAM Role with the following least-privilege policy and attach it to your EC2 instance:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "TorrentS3Permissions",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:AbortMultipartUpload",
        "s3:ListMultipartUploadParts",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::your-torrent-s3-bucket",
        "arn:aws:s3:::your-torrent-s3-bucket/*"
      ]
    }
  ]
}
```

> [!NOTE]
> **S3 CORS**: For standard pre-signed URL downloads (where the browser navigates directly to the link), S3 CORS is **not required**. Configure S3 CORS only if your frontend performs in-browser cross-origin fetch/XHR requests to S3.

### Step 4: Install Docker Engine & Compose on Ubuntu 24.04
```bash
# Update package lists
sudo apt update && sudo apt install -y ca-certificates curl gnupg git

# Install Docker
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update && sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Enable Docker for current user
sudo usermod -aG docker $USER
newgrp docker
```

### Step 5: Clone Repository & Configure Environment
```bash
git clone https://github.com/SurendiranBJ/Torrent-Downloader.git
cd Torrent-Downloader

# Copy environment template
cp .env.example .env
```

Generate secure production secrets on your EC2 host:
```bash
# Generate strong 32-byte hex secrets
openssl rand -hex 32
openssl rand -hex 32
```

Edit `.env`:
```env
PORT=80
DATABASE_URL=postgresql://postgres:YOUR_DB_PASSWORD@postgres:5432/torrent_db?schema=public
REDIS_URL=redis://redis:6379

JWT_SECRET=<output from openssl rand>
JWT_REFRESH_SECRET=<output from openssl rand>

STORAGE_PROVIDER=s3
AWS_REGION=us-east-1
S3_BUCKET=your-torrent-s3-bucket
S3_PREFIX=users/
AWS_S3_STORAGE_CLASS=INTELLIGENT_TIERING
```

### Step 6: Launch the Platform
```bash
docker compose up -d --build
```

### Step 7: Verify Running Services
```bash
# Verify container health
docker compose ps

# Check API gateway and Transmission connection
curl http://localhost/health
```

Now, open your browser and navigate directly to:
```text
http://<EC2_PUBLIC_IP>/
```

---

## 4. Transmission Swarm Verification & Diagnostics

Inside the web dashboard, click **Diagnostics** to review live status:
* **Peer Port Status**: Confirms whether port `51413` is reachable (`OPEN`, `CLOSED`, or `UNKNOWN`).
* **Swarm Protocol Discovery**: Displays DHT, PEX, LPD, and uTP status.
* **Bottleneck Heuristics**: Dynamically categorizes throughput constraints (`NETWORK_LIMITED`, `PEER_CONNECTIVITY_LIMITED`, `TORRENT_SWARM_LIMITED`, `TRANSMISSION_LIMITED`, or `DISK_LIMITED`).

---

## 5. Benchmarking & Speed Principles

To verify that downloads run strictly inside AWS:
1. Open the dashboard at `http://<EC2_PUBLIC_IP>/`.
2. Add an official legal Linux torrent (e.g. Ubuntu Desktop ISO):
   ```text
   magnet:?xt=urn:btih:e6bb925d2b7c4a17ab8cf8073fa8ff4d34eb5de0
   ```
3. Observe live network traffic:
   * **Your Local Windows PC**: Network monitor will show near **0 KB/s** BitTorrent traffic.
   * **AWS EC2**: Downloads at multi-megabyte/gigabit speeds directly from the swarm to the attached EBS storage.
4. When download reaches **100%**:
   * Click **Download File** to immediately stream the completed file from EC2/EBS over HTTP.
   * In the background, BullMQ asynchronously offloads the file to Amazon S3. Once ready, clicking download generates a 15-minute pre-signed S3 URL.

---

## 6. AWS Cost Awareness

Running cloud infrastructure on AWS can incur charges. Be aware of the following:
* **EC2 Compute**: Billed per hour/second depending on the instance size.
* **EBS Volume**: Billed per GB-month of provisioned storage (gp3).
* **Amazon S3 Storage**: Billed per GB-month. Using `INTELLIGENT_TIERING` reduces long-term archive costs.
* **Data Transfer (Egress)**: Inbound data transfer from the torrent swarm to EC2 is **free**. Outbound data transfer from EC2/S3 to your browser incurs standard AWS egress charges.

---

## 7. Local Testing & Verification

Run all test suites locally:
```bash
npm install
npm run build --workspace=@torrent-platform/shared
npm run build --workspace=@torrent-platform/api
npm run build --workspace=@torrent-platform/web
npm test --workspace=@torrent-platform/api
```
