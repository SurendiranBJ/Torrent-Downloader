# Torrent Downloader: Local Windows Architecture + AWS S3

> **Branch**: `Torrent-AWS-S3`  
> Configured with native **Amazon Web Services (AWS) S3** object storage integration, high-concurrency multipart streaming uploads, and automated pre-signed download links.

A production-grade, local Windows torrent management platform built for maximum swarm throughput, robust multi-tenant security, and automated cloud storage offloading to **AWS S3**.

Powered by **Transmission** (as the exclusive torrent engine), **Turborepo**, **Next.js 16**, **Express**, **Prisma (PostgreSQL)**, **Redis**, **BullMQ**, and **AWS S3**.

---

## 1. Architecture: Torrent + AWS S3

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
│                 Incomplete / NVMe       AWS S3 Bucket                       │
│                        │               (Multipart Upload)                   │
│                        ▼                      │                             │
│                 Completed Files               ▼                             │
│               (Immediate Local) ─────── Pre-signed S3 URL                   │
│                                        (Direct Browser Stream)              │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ Infrastructure Containers: PostgreSQL, Redis, Transmission, (Optional MinIO)│
└─────────────────────────────────────────────────────────────────────────────┘
```

### AWS S3 Key Enhancements
1. **Multipart Streaming Uploads (`@aws-sdk/lib-storage`)**:
   - Supports multi-gigabyte torrent payloads (Linux ISOs, datasets, media) up to **5 TB**.
   - Streams chunks of 10 MB with 4 concurrent part workers without exhausting host RAM.
2. **Virtual-Hosted Addressing**:
   - Uses native `bucket.s3.amazonaws.com` DNS addressing conforming to modern AWS standards.
3. **S3 Intelligent-Tiering**:
   - Automatically stores completed torrents in `INTELLIGENT_TIERING` to minimize cloud storage expenses for infrequently accessed archives.
4. **Server-Side Encryption**:
   - Automatic `AES256` encryption at rest on AWS S3.
5. **Pre-signed Download URLs**:
   - Generated dynamically with configurable expiration (1 hour to 24 hours), avoiding proxying large multi-GB transfers through the Express server.

---

## 2. AWS S3 Setup & Configuration Guide

### Step 1: Create an S3 Bucket in AWS
1. Log in to the [AWS Management Console](https://console.aws.amazon.com/s3/).
2. Click **Create bucket**.
3. Choose a unique name (e.g. `my-torrent-platform-data`).
4. Select your preferred region (e.g., `us-east-1` or `eu-west-1`).
5. Keep **Block all public access** enabled (Pre-signed URLs work securely even with public access blocked).

### Step 2: Configure Bucket CORS
To allow direct downloads from your web dashboard, add this CORS configuration in your S3 Bucket -> **Permissions** tab:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedOrigins": [
      "http://localhost:3000",
      "http://127.0.0.1:3000"
    ],
    "ExposeHeaders": [
      "ETag",
      "Content-Length",
      "Content-Disposition"
    ],
    "MaxAgeSeconds": 3600
  }
]
```

### Step 3: Create an IAM Policy
Create an IAM user with programmatic access and attach this least-privilege policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "TorrentS3Access",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:AbortMultipartUpload",
        "s3:ListMultipartUploadParts",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::my-torrent-platform-data",
        "arn:aws:s3:::my-torrent-platform-data/*"
      ]
    }
  ]
}
```

### Step 4: Configure `.env`
In `.env` (copied from `.env.example`):

```env
STORAGE_PROVIDER=s3
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...YOUR_AWS_KEY
AWS_SECRET_ACCESS_KEY=...YOUR_AWS_SECRET
AWS_S3_BUCKET=my-torrent-platform-data
AWS_S3_STORAGE_CLASS=INTELLIGENT_TIERING
```

---

## 3. Windows Setup & Peer Port Networking

Transmission requires port **51413** (TCP & UDP) to achieve uncapped swarm speeds from active seeders.

### Windows Defender Firewall Inbound Rules
Open PowerShell as **Administrator**:

```powershell
# TCP peer transfer
New-NetFirewallRule -DisplayName "Transmission Peer TCP" `
  -Direction Inbound -LocalPort 51413 -Protocol TCP -Action Allow

# UDP peer transfer (DHT & uTP)
New-NetFirewallRule -DisplayName "Transmission Peer UDP" `
  -Direction Inbound -LocalPort 51413 -Protocol UDP -Action Allow
```

### Router Port Forwarding
* **Automatic (UPnP)**: Supported out of the box via Transmission `port-forwarding-enabled: true`.
* **Manual Forwarding**: Forward **Port 51413 (TCP/UDP)** from your router's gateway to your Windows machine's IP.

---

## 4. Running the Platform

### Running with Docker Compose
```bash
docker compose up --build -d
```
Access points:
* **Web UI**: [http://localhost:3000](http://localhost:3000)
* **API Server**: [http://localhost:4000](http://localhost:4000)

### Running Locally (Bare Metal)
```bash
# 1. Install dependencies
npm install

# 2. Build shared package
npm run build --workspace=@torrent-platform/shared

# 3. Generate Prisma client & build API
npm run build --workspace=@torrent-platform/api

# 4. Build Next.js Web Frontend
npm run build --workspace=@torrent-platform/web

# 5. Run Automated Tests
npm test --workspace=@torrent-platform/api
```

---

## 5. Automated Tests

Run the test suite verifying Transmission, State Machine, S3 Worker, Metrics, and Multi-Tenant Isolation:

```bash
npm test --workspace=@torrent-platform/api
```

All test suites:
* `transmission.test.ts`: Magnet links, .torrent files, session stats, port-test mapping.
* `isolation.test.ts`: Multi-tenant user isolation.
* `storageWorker.test.ts`: Multipart S3 upload, retries, and pre-signed URL validation.
* `stateMachine.test.ts`: Status transitions (`queued` -> `downloading` -> `completed` -> `seeding` -> `uploading` -> `ready`).
* `metrics.test.ts`: Bandwidth calculations and ETA.
