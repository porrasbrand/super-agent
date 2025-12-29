#!/bin/bash
#
# Start Notification Server with Cloudflare Tunnel
#
# This script:
# 1. Starts the notification server on port 9000
# 2. Creates a cloudflare tunnel to expose it publicly
# 3. Displays the public URL for remote webhook configuration
#

set -e

PORT=9000
TUNNEL_LOG="/tmp/cloudflared.log"

echo "=========================================="
echo "Super-Agent Notification Server + Tunnel"
echo "=========================================="
echo ""

# Start notification server in background
echo "Starting notification server on port $PORT..."
node src/notification-server-standalone.js &
SERVER_PID=$!

# Wait for server to start
sleep 2

# Check if server is running
if ! curl -s http://localhost:$PORT/health > /dev/null; then
    echo "❌ Failed to start notification server"
    exit 1
fi

echo "✅ Notification server running (PID: $SERVER_PID)"
echo ""

# Start cloudflare tunnel
echo "Starting Cloudflare Tunnel..."
echo "(This may take 10-15 seconds to establish connection)"
echo ""

./cloudflared tunnel --url http://localhost:$PORT > $TUNNEL_LOG 2>&1 &
TUNNEL_PID=$!

# Wait for tunnel to be ready and extract URL
sleep 5

# Try to extract URL from log
TUNNEL_URL=$(grep -oP 'https://[a-z0-9-]+\.trycloudflare\.com' $TUNNEL_LOG | head -1)

if [ -z "$TUNNEL_URL" ]; then
    echo "⚠️  Waiting for tunnel URL..."
    sleep 5
    TUNNEL_URL=$(grep -oP 'https://[a-z0-9-]+\.trycloudflare\.com' $TUNNEL_LOG | head -1)
fi

if [ -z "$TUNNEL_URL" ]; then
    echo "❌ Failed to get tunnel URL. Check $TUNNEL_LOG for details."
    kill $SERVER_PID $TUNNEL_PID 2>/dev/null
    exit 1
fi

echo "=========================================="
echo "✅ READY!"
echo "=========================================="
echo ""
echo "📍 Local Server:  http://localhost:$PORT"
echo "🌍 Public URL:    $TUNNEL_URL"
echo ""
echo "Webhook Endpoint: $TUNNEL_URL/notify"
echo ""
echo "=========================================="
echo ""
echo "Copy this webhook URL to your remote .env:"
echo ""
echo "SUPER_AGENT_WEBHOOK=$TUNNEL_URL/notify"
echo ""
echo "=========================================="
echo ""
echo "Press Ctrl+C to stop both server and tunnel"
echo ""

# Save webhook URL to file for later use
echo "$TUNNEL_URL/notify" > .webhook-url
echo "✅ Webhook URL saved to .webhook-url"
echo ""

# Cleanup function
cleanup() {
    echo ""
    echo "Shutting down..."
    kill $SERVER_PID $TUNNEL_PID 2>/dev/null
    echo "✅ Stopped"
    exit 0
}

trap cleanup SIGINT SIGTERM

# Keep script running
wait $SERVER_PID
