#!/bin/bash
# ================================================================
# Legal Query System — Full Deployment Script for Oracle 1GB VPS
# ================================================================
#
# This script sets up everything on a fresh Oracle Linux / Ubuntu
# server with 1GB RAM.
#
# Prerequisites:
#   - SSH access to your server as root or sudo user
#   - Project files uploaded to /tmp/Legal_Query_System/ (or git cloned)
#
# Usage:
#   sudo bash deploy.sh
#
# ================================================================

set -e

# === Configuration ===
APP_DIR="/opt/legal-query"
APP_USER="legal"
DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$DEPLOY_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }
info() { echo -e "${CYAN}[i]${NC} $1"; }

echo ""
echo "=================================================="
echo "  Legal Query System — Oracle VPS Deployment"
echo "  Optimized for 1GB RAM"
echo "=================================================="
echo ""

# === Step 0: Detect OS ===
info "Detecting operating system..."
if [ -f /etc/oracle-release ] || [ -f /etc/redhat-release ]; then
    PKG_MANAGER="dnf"
    OS_FAMILY="rhel"
    log "Detected: Oracle Linux / RHEL family (using dnf)"
elif [ -f /etc/debian_version ]; then
    PKG_MANAGER="apt-get"
    OS_FAMILY="debian"
    log "Detected: Ubuntu / Debian family (using apt-get)"
else
    warn "Unknown OS. Assuming apt-get. If commands fail, adjust manually."
    PKG_MANAGER="apt-get"
    OS_FAMILY="debian"
fi

# === Step 1: Setup Swap ===
echo ""
info "Step 1/8: Setting up swap..."
bash "$DEPLOY_DIR/setup-swap.sh"
log "Swap ready."

# === Step 2: Install System Dependencies ===
echo ""
info "Step 2/8: Installing system packages..."

if [ "$OS_FAMILY" = "rhel" ]; then
    dnf update -y -q
    dnf install -y -q nginx git python3.11 python3.11-pip python3.11-devel gcc
    
    # Node.js 18 LTS via NodeSource
    if ! command -v node &> /dev/null; then
        curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -
        dnf install -y -q nodejs
    fi
    
    # Enable and start nginx
    systemctl enable nginx
    
elif [ "$OS_FAMILY" = "debian" ]; then
    apt-get update -qq
    apt-get install -y -qq nginx git python3 python3-pip python3-venv python3-dev gcc
    
    # Node.js 18 LTS via NodeSource
    if ! command -v node &> /dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
        apt-get install -y -qq nodejs
    fi
fi

log "System packages installed."
node --version 2>/dev/null && log "Node.js: $(node --version)"
python3 --version 2>/dev/null && log "Python: $(python3 --version)"

# === Step 3: Create App User ===
echo ""
info "Step 3/8: Creating application user..."

if id "$APP_USER" &>/dev/null; then
    log "User '$APP_USER' already exists."
else
    useradd --system --shell /bin/false --home-dir "$APP_DIR" "$APP_USER"
    log "Created system user: $APP_USER"
fi

# === Step 4: Copy Project Files ===
echo ""
info "Step 4/8: Setting up application directory..."

mkdir -p "$APP_DIR"
mkdir -p /var/log/legal-query

# Copy project files (excluding node_modules, venv, .git)
rsync -a --exclude='node_modules' \
         --exclude='venv' \
         --exclude='__pycache__' \
         --exclude='.git' \
         --exclude='*.pdf' \
         --exclude='deploy/' \
         "$PROJECT_ROOT/" "$APP_DIR/"

# Copy deploy configs separately
cp -r "$DEPLOY_DIR" "$APP_DIR/deploy"

log "Project files copied to $APP_DIR"

# === Step 5: Install Dependencies ===
echo ""
info "Step 5/8: Installing application dependencies..."

# --- Node.js Backend ---
info "  Installing Node.js dependencies..."
cd "$APP_DIR/backend/server"
npm ci --production --quiet 2>/dev/null || npm install --production --quiet
log "  Node.js dependencies installed."

# --- Python RAG Pipeline ---
info "  Setting up Python virtual environment..."
cd "$APP_DIR/backend/rag_model"

if [ ! -d "venv" ]; then
    python3 -m venv venv
fi

source venv/bin/activate
pip install --quiet --upgrade pip
pip install --quiet gunicorn
pip install --quiet -r requirements.txt
deactivate

log "  Python dependencies installed."

# --- Frontend Build ---
info "  Building React frontend..."
cd "$APP_DIR/frontend"
npm ci --quiet 2>/dev/null || npm install --quiet
npx vite build
log "  Frontend built to dist/"

# === Step 6: Setup Environment Files ===
echo ""
info "Step 6/8: Configuring environment..."

# Check if .env files exist, if not create from template
if [ ! -f "$APP_DIR/backend/server/.env" ]; then
    warn "  No .env found for Node.js backend. Creating template..."
    cat > "$APP_DIR/backend/server/.env" << 'ENVEOF'
PORT=3001
MONGODB_URI="REPLACE_WITH_YOUR_MONGODB_ATLAS_URI"
JWT_SECRET="REPLACE_WITH_A_STRONG_SECRET"
RAG_API_URL=http://127.0.0.1:5000
NODE_ENV=production
ENVEOF
    warn "  ⚠ EDIT: $APP_DIR/backend/server/.env — fill in your MongoDB URI and JWT secret!"
else
    # Ensure production settings are present
    grep -q "RAG_API_URL" "$APP_DIR/backend/server/.env" || \
        echo 'RAG_API_URL=http://127.0.0.1:5000' >> "$APP_DIR/backend/server/.env"
    grep -q "NODE_ENV" "$APP_DIR/backend/server/.env" || \
        echo 'NODE_ENV=production' >> "$APP_DIR/backend/server/.env"
    log "  Node.js .env exists."
fi

if [ ! -f "$APP_DIR/backend/rag_model/.env" ]; then
    warn "  No .env found for RAG pipeline. Creating template..."
    cat > "$APP_DIR/backend/rag_model/.env" << 'ENVEOF'
GROQ_API_KEY=REPLACE_WITH_YOUR_GROQ_API_KEY
GROQ_MODEL=llama-3.3-70b-versatile
EMBEDDING_MODEL=all-MiniLM-L6-v2
ENVEOF
    warn "  ⚠ EDIT: $APP_DIR/backend/rag_model/.env — fill in your Groq API key!"
else
    # Ensure embedding model is set to lightweight version
    if grep -q "InLegalBERT" "$APP_DIR/backend/rag_model/.env"; then
        sed -i 's/EMBEDDING_MODEL=.*/EMBEDDING_MODEL=all-MiniLM-L6-v2/' "$APP_DIR/backend/rag_model/.env"
        log "  Updated embedding model to all-MiniLM-L6-v2"
    fi
    grep -q "EMBEDDING_MODEL" "$APP_DIR/backend/rag_model/.env" || \
        echo 'EMBEDDING_MODEL=all-MiniLM-L6-v2' >> "$APP_DIR/backend/rag_model/.env"
    log "  RAG .env exists."
fi

# === Step 7: Install Services ===
echo ""
info "Step 7/8: Installing systemd services..."

cp "$APP_DIR/deploy/legal-node.service" /etc/systemd/system/
cp "$APP_DIR/deploy/legal-rag.service" /etc/systemd/system/

# Set correct ownership
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
chown -R "$APP_USER:$APP_USER" /var/log/legal-query

systemctl daemon-reload
systemctl enable legal-node legal-rag
systemctl start legal-rag   # Start RAG first (Node.js depends on it)

info "  Waiting for RAG model to load (this takes 30-60s on first start)..."
sleep 10

systemctl start legal-node
log "  Services started."

# === Step 8: Configure Nginx ===
echo ""
info "Step 8/8: Configuring Nginx..."

# Copy nginx config
if [ "$OS_FAMILY" = "rhel" ]; then
    cp "$APP_DIR/deploy/nginx.conf" /etc/nginx/conf.d/legal-query.conf
    # Remove default config if present
    rm -f /etc/nginx/conf.d/default.conf
elif [ "$OS_FAMILY" = "debian" ]; then
    cp "$APP_DIR/deploy/nginx.conf" /etc/nginx/sites-available/legal-query
    ln -sf /etc/nginx/sites-available/legal-query /etc/nginx/sites-enabled/legal-query
    # Remove default site
    rm -f /etc/nginx/sites-enabled/default
fi

# Test config
nginx -t && log "Nginx config valid." || err "Nginx config test failed!"

systemctl restart nginx
log "Nginx restarted."

# === Step 9: Firewall ===
echo ""
info "Configuring firewall..."

if command -v firewall-cmd &>/dev/null; then
    firewall-cmd --permanent --add-service=http 2>/dev/null || true
    firewall-cmd --permanent --add-service=https 2>/dev/null || true
    firewall-cmd --reload 2>/dev/null || true
    log "Firewall: HTTP/HTTPS allowed (firewalld)"
elif command -v ufw &>/dev/null; then
    ufw allow 'Nginx Full' 2>/dev/null || true
    log "Firewall: HTTP/HTTPS allowed (ufw)"
fi

# === Done ===
echo ""
echo "=================================================="
echo -e "  ${GREEN}✓ DEPLOYMENT COMPLETE!${NC}"
echo "=================================================="
echo ""
echo "  Services:"
echo "    systemctl status legal-node"
echo "    systemctl status legal-rag"
echo ""
echo "  Logs:"
echo "    journalctl -u legal-node -f"
echo "    journalctl -u legal-rag -f"
echo ""
echo "  Test:"
echo "    curl http://localhost/api/health"
echo ""
echo "  Memory:"
echo "    free -h"
echo "    ps aux --sort=-%mem | head -10"
echo ""

# Show current memory usage
echo "=== Current Memory Usage ==="
free -h
echo ""

# Show service status
echo "=== Service Status ==="
systemctl status legal-node --no-pager -l 2>/dev/null || warn "legal-node not yet running"
echo ""
systemctl status legal-rag --no-pager -l 2>/dev/null || warn "legal-rag not yet running"
echo ""

# Reminders
warn "IMPORTANT REMINDERS:"
echo "  1. Edit .env files if not already done:"
echo "     $APP_DIR/backend/server/.env"
echo "     $APP_DIR/backend/rag_model/.env"
echo ""
echo "  2. If you changed the embedding model, re-ingest your data:"
echo "     cd $APP_DIR/backend/rag_model"
echo "     source venv/bin/activate"
echo "     python ingest.py"
echo ""
echo "  3. For HTTPS/SSL, install certbot:"
echo "     sudo certbot --nginx -d yourdomain.com"
echo ""
echo "  4. To update later:"
echo "     Upload new files → sudo bash $APP_DIR/deploy/deploy.sh"
echo ""
