# Legal Query System — Oracle VPS Deployment Guide

> Deploying to an Oracle Cloud Always-Free VPS with 1GB RAM.

## Prerequisites

- Oracle Cloud VPS (1 GB RAM, 1 OCPU, Oracle Linux or Ubuntu)
- SSH access to the server
- MongoDB Atlas account (free tier — already set up)
- Groq API key

---

## Quick Start (One Command)

Once you've uploaded the project to your server:

```bash
# SSH into your server
ssh opc@YOUR_SERVER_IP

# Upload the project (from your local machine)
# Option A: scp
scp -r ./Legal_Query_System opc@YOUR_SERVER_IP:/tmp/

# Option B: git clone (if repo is on GitHub)
cd /tmp && git clone https://github.com/SUJALKR18/Legal_Query_System.git

# Run the deployment script
cd /tmp/Legal_Query_System/deploy
sudo bash deploy.sh
```

That's it! The script handles everything:
1. Creates 2 GB swap file
2. Installs Nginx, Node.js 18, Python 3
3. Creates a `legal` system user
4. Copies files to `/opt/legal-query/`
5. Installs dependencies (npm + pip)
6. Builds React frontend
7. Configures systemd services
8. Sets up Nginx reverse proxy
9. Opens firewall ports

---

## Post-Deployment Checklist

### 1. Configure Environment Variables

```bash
# Edit Node.js backend env
sudo nano /opt/legal-query/backend/server/.env
```
Fill in:
```
PORT=3001
MONGODB_URI="your-mongodb-atlas-uri"
JWT_SECRET="a-random-secret-string-change-this"
RAG_API_URL=http://127.0.0.1:5000
NODE_ENV=production
```

```bash
# Edit RAG pipeline env
sudo nano /opt/legal-query/backend/rag_model/.env
```
Fill in:
```
GROQ_API_KEY=your-groq-api-key
GROQ_MODEL=llama-3.3-70b-versatile
EMBEDDING_MODEL=all-MiniLM-L6-v2
```

### 2. Re-ingest Data (REQUIRED — embedding model changed)

Since we switched from `InLegalBERT` to `all-MiniLM-L6-v2`, the vector dimensions changed. You must re-ingest:

```bash
cd /opt/legal-query/backend/rag_model
sudo -u legal bash -c 'source venv/bin/activate && python ingest.py'
```

This rebuilds the ChromaDB vector store with the new 384-dimensional embeddings.

### 3. Restart Services

```bash
sudo systemctl restart legal-rag
sudo systemctl restart legal-node
```

### 4. Verify Everything Works

```bash
# Check services
systemctl status legal-node
systemctl status legal-rag

# Test API
curl http://localhost/api/health

# Check memory
free -h

# Watch logs
journalctl -u legal-node -f    # Node.js logs
journalctl -u legal-rag -f     # RAG pipeline logs
```

### 5. Setup HTTPS (Optional but Recommended)

If you have a domain name pointing to your server:

```bash
# Install certbot
sudo dnf install certbot python3-certbot-nginx   # Oracle Linux
# OR
sudo apt install certbot python3-certbot-nginx     # Ubuntu

# Get SSL certificate
sudo certbot --nginx -d yourdomain.com

# Auto-renewal is set up automatically by certbot
```

---

## Architecture Overview

```
Internet
    │
    ▼
┌─────────────────────────────┐
│  Nginx (port 80/443)        │  ~5 MB RAM
│  ├── Static files (React)   │
│  └── /api/* → reverse proxy │
└─────────┬───────────────────┘
          │
          ▼
┌─────────────────────────────┐
│  Node.js Express (port 3001)│  ~60-80 MB RAM
│  ├── /api/auth/* (JWT auth) │
│  └── /api/chat/* (sessions) │
│       └── proxies queries → │──────┐
└─────────────────────────────┘      │
                                     ▼
┌─────────────────────────────┐  ┌──────────────┐
│  Flask/Gunicorn (port 5000) │  │ MongoDB Atlas│
│  ├── Embedding model (~90MB)│  │ (cloud, free)│
│  ├── ChromaDB vector store  │  └──────────────┘
│  └── Groq API calls (cloud) │
│       ~300-400 MB RAM       │
└─────────────────────────────┘
```

---

## Memory Management

### Monitoring

```bash
# Real-time memory watch
watch -n 2 free -h

# Per-process memory usage
ps aux --sort=-%mem | head -10

# Per-service memory
systemctl status legal-node | grep Memory
systemctl status legal-rag | grep Memory
```

### If You Run Out of Memory

1. **Increase swap:**
   ```bash
   sudo swapoff /swapfile
   sudo fallocate -l 4G /swapfile
   sudo mkswap /swapfile
   sudo swapon /swapfile
   ```

2. **Reduce Node.js memory:**
   Edit `/etc/systemd/system/legal-node.service` and lower `MemoryMax`.

3. **Switch back to InLegalBERT later** (if you upgrade RAM):
   ```bash
   # Edit .env
   sudo nano /opt/legal-query/backend/rag_model/.env
   # Change to: EMBEDDING_MODEL=law-ai/InLegalBERT
   
   # Re-ingest
   cd /opt/legal-query/backend/rag_model
   sudo -u legal bash -c 'source venv/bin/activate && python ingest.py'
   
   # Restart
   sudo systemctl restart legal-rag
   ```

---

## Common Operations

### Update the Application

```bash
# Upload new code to /tmp/Legal_Query_System
# Then:
sudo bash /opt/legal-query/deploy/deploy.sh
```

### View Logs

```bash
journalctl -u legal-node -f --since "1 hour ago"
journalctl -u legal-rag -f --since "1 hour ago"
tail -f /var/log/nginx/legal-query-error.log
```

### Restart Services

```bash
sudo systemctl restart legal-rag legal-node nginx
```

### Stop Everything

```bash
sudo systemctl stop legal-node legal-rag nginx
```

---

## File Locations on Server

| File | Location |
|---|---|
| Project root | `/opt/legal-query/` |
| Frontend build | `/opt/legal-query/frontend/dist/` |
| Node.js backend | `/opt/legal-query/backend/server/` |
| RAG pipeline | `/opt/legal-query/backend/rag_model/` |
| Vector database | `/opt/legal-query/data/vector_db/` |
| Nginx config | `/etc/nginx/sites-available/legal-query` |
| Node service | `/etc/systemd/system/legal-node.service` |
| RAG service | `/etc/systemd/system/legal-rag.service` |
| Swap file | `/swapfile` |
| App logs | `journalctl -u legal-node` / `journalctl -u legal-rag` |
| Nginx logs | `/var/log/nginx/legal-query-*.log` |
