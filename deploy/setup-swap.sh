#!/bin/bash
# =====================================================
# Swap File Setup for Oracle 1GB RAM VPS
# =====================================================
# Creates a 2GB swap file as a safety net to prevent
# OOM kills when the RAG model loads.
#
# Run as root: sudo bash setup-swap.sh
# =====================================================

set -e

SWAP_SIZE="2G"
SWAP_FILE="/swapfile"

echo "=== Legal Query System: Swap Setup ==="

# Check if swap already exists
if swapon --show | grep -q "$SWAP_FILE"; then
    echo "✓ Swap file already exists and is active."
    swapon --show
    exit 0
fi

# Check if file exists but isn't active
if [ -f "$SWAP_FILE" ]; then
    echo "Swap file exists but is not active. Activating..."
    chmod 600 "$SWAP_FILE"
    mkswap "$SWAP_FILE"
    swapon "$SWAP_FILE"
else
    echo "Creating ${SWAP_SIZE} swap file..."
    
    # Allocate swap file
    fallocate -l "$SWAP_SIZE" "$SWAP_FILE" 2>/dev/null || \
        dd if=/dev/zero of="$SWAP_FILE" bs=1M count=2048 status=progress
    
    # Secure permissions
    chmod 600 "$SWAP_FILE"
    
    # Format as swap
    mkswap "$SWAP_FILE"
    
    # Enable swap
    swapon "$SWAP_FILE"
    
    echo "✓ Swap file created and activated."
fi

# Make swap persistent across reboots
if ! grep -q "$SWAP_FILE" /etc/fstab; then
    echo "$SWAP_FILE none swap sw 0 0" >> /etc/fstab
    echo "✓ Added to /etc/fstab for persistence."
fi

# Set swappiness low — only use swap under pressure
echo "Setting vm.swappiness=10..."
sysctl vm.swappiness=10

if ! grep -q "vm.swappiness" /etc/sysctl.conf; then
    echo "vm.swappiness=10" >> /etc/sysctl.conf
    echo "✓ Swappiness persisted in /etc/sysctl.conf"
fi

# Also reduce cache pressure
sysctl vm.vfs_cache_pressure=50
if ! grep -q "vm.vfs_cache_pressure" /etc/sysctl.conf; then
    echo "vm.vfs_cache_pressure=50" >> /etc/sysctl.conf
fi

echo ""
echo "=== Swap Summary ==="
free -h
echo ""
swapon --show
echo ""
echo "✓ Swap setup complete!"
