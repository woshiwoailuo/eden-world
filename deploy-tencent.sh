#!/bin/bash
set -e
APP=/opt/eden-world
sudo mkdir -p "$APP"
if [ ! -f ./server.js ]; then echo "run from source root"; exit 1; fi
sudo cp -a server.js package.json Dockerfile README.md render.yaml "$APP/" 2>/dev/null || true
sudo mkdir -p "$APP/src" "$APP/public"
sudo cp -a src/. "$APP/src/"
sudo cp -a public/. "$APP/public/"
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
sudo tee /etc/systemd/system/eden-world.service >/dev/null <<EOF
[Unit]
Description=Eden World
After=network.target
[Service]
Type=simple
WorkingDirectory=$APP
Environment=PORT=8787
ExecStart=/usr/bin/node $APP/server.js
Restart=always
RestartSec=3
[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now eden-world
echo "open security group TCP 8787 then http://PUBLIC_IP:8787"
