# Yeecord — Self-hosted Discord Voice Recorder

Yeecord is a self-hosted fork of [Craig](https://github.com/CraigChat/craig), a multi-track voice recorder for Discord. It records each speaker in a voice channel onto a separate audio track — useful for podcasts, meetings, and similar projects.

This fork unlocks all features (cloud backup, mix downloads, FLAC, MP3, 24h recording, etc.) for self-hosted use without requiring a Patreon subscription.

## Architecture

```
┌──────────────────────────────────────────────────┐
│  yeecord container                               │
│                                                  │
│  ┌──────────┐  ┌───────────┐  ┌────────────────┐ │
│  │   Bot    │  │ Dashboard │  │  Download API  │ │
│  │ (Discord │  │  (Next.js │  │  (Recording    │ │
│  │  gateway │  │ port 3000)│  │   downloads    │ │
│  │  + voice │  │           │  │   port 5029)   │ │
│  │  via WS) │  │           │  │                │ │
│  └────┬─────┘  └─────┬─────┘  └───────┬────────┘ │
│       │              │                │          │
│       ▼              │                │          │
│  Discord API         │                │          │
│  (outbound only)     │                │          │
├──────────────────────┼────────────────┼──────────┤
│                      ▼                ▼          │
│            Caddy (yeecord.1337413.xyz)           │
│              /rec/* → :5029                      │
│              everything else → :3000             │
├──────────────────────────────────────────────────┤
│  yeecord-db (PostgreSQL) │ yeecord-redis (Redis) │
└──────────────────────────────────────────────────┘
```

## Setup Instructions

### Step 1: Create a Discord Bot Application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **New Application**, name it (e.g. `Yeecord`), and click **Create**
3. Under **General Information**, copy the **Application ID** → `DISCORD_APP_ID`
4. Under **Bot**, copy the **Token** → `DISCORD_BOT_TOKEN`
5. Under **OAuth2 → General**, copy **Client ID** → `CLIENT_ID` and **Client Secret** → `CLIENT_SECRET`
6. Under **OAuth2 → General**, click **Add Redirect** and enter:
   ```
   https://yeecord.1337413.xyz/api/login
   ```
7. Go to **OAuth2 → URL Generator**, select `bot` + `applications.commands`, then select permissions:
   - Change Nickname, View Channels, Send Messages, Embed Links, Attach Files, Use External Emojis, Connect, Speak
8. Copy the generated **invite URL** for Step 5

### Step 2: Configure install.config

```bash
cp install.config.example install.config
# Edit install.config and fill in the four Discord credentials from Step 1
```

### Step 2.5: Google Drive Cloud Backup (Optional)

To enable automatic upload of recordings to Google Drive:

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select an existing one)
3. Go to **APIs & Services → Library**, search for **Google Drive API**, and enable it
4. Go to **APIs & Services → Credentials**, click **Create Credentials → OAuth client ID**
5. Set **Application type** to **Web application**
6. Under **Authorized redirect URIs**, add:
   ```
   https://yeecord.1337413.xyz/api/google/oauth
   ```
7. Copy the **Client ID** → `GOOGLE_CLIENT_ID` in `install.config`
8. Copy the **Client Secret** → `GOOGLE_CLIENT_SECRET` in `install.config`
9. Go to **APIs & Services → OAuth consent screen**:
   - Set **User Type** to **External** (or Internal if using Google Workspace)
   - Fill in the required fields (app name, support email)
   - Add the scope: `https://www.googleapis.com/auth/drive.file`
   - Add yourself as a test user (if in Testing mode)

> **Note:** While the app is in "Testing" mode on Google Cloud, only test users can link their Drive. To allow anyone, submit the app for verification.

After configuring, users can link their Google Drive from the Yeecord dashboard.

### Step 3: Build and Start

```bash
docker compose up -d --build
```

> **Note:** The first build takes several minutes.

### Step 4: Invite the Bot and Test

1. Open the invite URL from Step 1, authorize the bot to your server
2. Join a voice channel and use `/join` to start recording
3. Use `/stop` to end — visit `https://yeecord.1337413.xyz` for the dashboard

## Updating from Upstream

```bash
# Add upstream remote (one-time)
git remote add upstream https://github.com/CraigChat/craig.git

# Fetch and rebase your patches on top of upstream
git fetch upstream
git rebase upstream/master
# Resolve any conflicts, then:
git push --force-with-lease

# Rebuild
docker compose up -d --build
```

## Process Architecture

Inside the Docker container, PM2 manages 4 Node.js processes:

| Process | Config | Purpose |
|---------|--------|---------|
| **Craig** (bot) | `apps/bot/ecosystem.config.js` | Discord gateway connection, slash commands (`/join`, `/stop`), voice recording via WebSocket. Records each speaker to a separate Ogg/Opus track in `/app/rec/`. |
| **Craig Dashboard** | `apps/dashboard/ecosystem.config.js` | Next.js web app (port 3000). User login via Discord OAuth, Google Drive linking, cloud backup settings, recordings list. |
| **craig.horse** (download API) | `apps/download/ecosystem.config.js` | Fastify server (port 5029). Serves the recording download page, triggers `cook` (audio format conversion via ffmpeg), and streams downloads. |
| **Craig Tasks** | `apps/tasks/ecosystem.config.js` | Cron jobs: `cleanRecordings` (deletes expired recordings from disk + DB), `cleanDownloads` (removes processed download files), `refreshPatrons` (syncs Patreon tiers — not needed for self-hosted). |

### Recording Flow

1. User runs `/join` → bot connects to the voice channel via Discord gateway WebSocket
2. Discord sends individual Opus audio packets per speaker — the bot receives them via Eris's `VoiceDataStream`
3. Each unique speaker is assigned a **separate numbered track** (track 1, 2, 3, …)
4. Audio packets are written in real-time to files in `/app/rec/` (inside the container)
5. User runs `/stop` → bot flushes remaining packets, finalizes files, and sends a download link
6. User opens the link → the download API's `cook` binary (ffmpeg-based) converts raw tracks to the chosen format
7. If Google Drive backup is enabled, the result is also uploaded to Drive

### Recording Format (Raw Files on Disk)

Each recording produces multiple files in `/app/rec/`, all prefixed with the recording ID:

| File | Contents |
|------|----------|
| `{id}.ogg.data` | Multi-track **Ogg container** with raw **Opus** audio packets (48 kHz, stereo). Each speaker is a separate Ogg logical stream identified by track number. |
| `{id}.ogg.header1` | Ogg stream headers (page 1) — contains codec identification for each track (Opus or FLAC headers). |
| `{id}.ogg.header2` | Ogg stream headers (page 2) — contains codec comment/tag headers for each track. |
| `{id}.ogg.users` | JSON-lines file mapping track numbers to user metadata: `"1":{"id":"discord_user_id","username":"Name","discriminator":"0","bot":false,...}` |
| `{id}.ogg.info` | JSON metadata: guild/channel info, requester, start time, access/delete keys, enabled features, expiry. |
| `{id}.ogg.log` | Debug log: connection events, user joins, activity timestamps. |

#### Per-User Tracks

Each person who speaks is recorded onto their own separate audio track within the Ogg container.

- Track assignment happens on first audio packet from that user, via `getOrCreateRecordingUser()`
- Track numbers start at 1 and increment; track 65536 is reserved for text notes
- Users who join the voice channel but never speak are not assigned a track

#### Timestamps & Synchronization

- Each audio chunk stores **two timestamps**:
  1. **Granule position** (`process.hrtime()` since recording start, in 48 kHz samples) — this is the precise wall-clock time offset
  2. **RTP timestamp** from Discord's voice server — used for packet ordering within a user's stream
- The granule position lets the `cook` binary align all tracks to a common timeline, so all speakers are properly synchronized
- **Precision**: timestamps are at 48,000 samples/second resolution (~20.8 μs per tick)

#### Audio Quality

- **Codec**: Opus (Discord's native voice codec)
- **Sample rate**: 48 kHz
- **Channels**: Stereo (per track)
- **Bitrate**: Whatever Discord sends (typically 64–128 kbps Opus per user)
- Raw data is lossless capture of Discord's voice stream — no re-encoding during recording

### Download Formats

The `cook` binary converts raw multi-track Ogg/Opus into user-friendly formats:

| Format | Description | Best For |
|--------|-------------|----------|
| **Multi-track FLAC** | Lossless, one FLAC file per speaker | Archival, professional audio editing |
| **Multi-track AAC** | Lossy, one AAC file per speaker | AI transcription, compact storage |
| **Single-mix FLAC/AAC** | All speakers mixed into one file | Quick playback |
| **Multi-track Audacity** | `.aup3` project file | Professional audio editing |
| **MP3** | Lossy single mix | Sharing |

> **For AI transcription**: Use **multi-track AAC**. Each speaker becomes a separate file with no cross-talk, which is ideal for speech-to-text. The source audio from Discord is already lossy Opus, so FLAC only preserves that lossy stream — AAC is ~5× smaller with no measurable difference in transcription accuracy. Reserve FLAC for archival or professional audio editing.

### Recording Expiry

Recordings are configured to **never expire** (expiry set to ~100 years). The `cleanRecordings` cron job is also disabled (`skipAll: true`). Raw recording files will remain on disk indefinitely.

> **Disk usage note**: A 1-hour recording with 5 speakers uses roughly 30–60 MB of raw Ogg/Opus data. Monitor `/app/rec/` if disk space becomes a concern.

### Memory Tuning

For single-server self-hosted use, default values have been optimized:
- **craig.horse**: 1 instance (upstream default: 8 cluster instances)
- **Bot sharding**: 1 shard (upstream default: 2; sharding only needed at 2,500+ servers)

Expected idle memory: ~400 MB total for all processes + PostgreSQL + Redis.

## Useful Commands

```bash
# View container logs
docker logs yeecord

# Monitor internal processes (pm2)
docker exec -it yeecord bash -c "source ~/.nvm/nvm.sh && nvm use node && pm2 monit"

# View pm2 process logs
docker exec -it yeecord bash -c "source ~/.nvm/nvm.sh && nvm use node && pm2 logs"
```

## Fork Changes from Upstream

This fork makes the following changes:

- **`apps/bot/config/_default.js`** — Default tier unlocked with all features (24h recording, drive, mix, FLAC, MP3)
- **`apps/dashboard/pages/index.tsx`** — Removed Patreon, OneDrive, Dropbox; only Google Drive for cloud backup; rebranded to Yeecord
- **`apps/dashboard/pages/recordings.tsx`** — New recordings list page with download links and batch download
- **`docker-compose.yml`** — Pinned to `postgres:16-alpine`, added `caddynet` network, removed exposed ports, added healthcheck tuning
- **`install.config.example`** — Docker-appropriate defaults (API_HOST, REDIS_HOST, DATABASE_URL)

## Original Project

Craig is maintained at [CraigChat/craig](https://github.com/CraigChat/craig). See [SELFHOST.md](SELFHOST.md) for upstream self-hosting docs.
