# PixSim7 Device Agent

Connect your local Android devices to PixSim7 server remotely over ZeroTier.

## Prerequisites

- Python 3.8+
- ADB installed and in PATH
- ZeroTier installed and connected to PixSim7 network
- PixSim7 API token

## Installation

```bash
# Install required packages
pip install aiohttp

# Make agent executable (Linux/Mac)
chmod +x device_agent.py
```

## Usage

### Get Your API Token

1. Log in to PixSim7 web interface
2. Go to Settings → API Tokens
3. Create a new token or copy existing one

### Run the Agent

```bash
python device_agent.py \
  --server http://10.243.48.125:8001 \
  --token YOUR_API_TOKEN \
  --name "MyLaptop-Agent"
```

### Options

- `--server`: PixSim7 server URL (use ZeroTier IP for security)
- `--token`: Your API token for authentication
- `--name`: Friendly name for this agent (optional, defaults to hostname)
- `--heartbeat`: Heartbeat interval in seconds (default: 30)
- `--debug`: Enable debug logging

## How It Works

1. **Registration**: Agent registers with server on startup
2. **Device Discovery**: Scans local ADB devices every heartbeat
3. **Heartbeat**: Sends device list to server every 30 seconds
4. **Auto-Offline**: Server marks agent offline if no heartbeat for 2 minutes

## Security

- **Always use ZeroTier**: HTTP is safe over ZeroTier's encrypted network
- **Never expose publicly**: Agent is designed for internal network only
- **Token security**: Keep your API token private

## Troubleshooting

### ADB not found
```bash
# Windows: Add ADB to PATH or specify full path
set PATH=%PATH%;C:\path\to\platform-tools

# Linux/Mac
export PATH=$PATH:/path/to/platform-tools
```

### No devices detected
```bash
# Check ADB can see devices
adb devices

# Enable USB debugging on Android device
# Settings → Developer Options → USB Debugging
```

### Connection failed
```bash
# Check ZeroTier connection
zerotier-cli status
zerotier-cli listnetworks

# Ping server
ping 10.243.48.125

# Check server is running
curl http://10.243.48.125:8001/health
```

## Running as Service

### Windows (Task Scheduler)

1. Create batch file `start-agent.bat`:
```batch
@echo off
cd /d %~dp0
python device_agent.py --server http://10.243.48.125:8001 --token YOUR_TOKEN
```

2. Task Scheduler → Create Basic Task → Run at startup

### Linux (systemd)

Create `/etc/systemd/system/pixsim-agent.service`:
```ini
[Unit]
Description=PixSim7 Device Agent
After=network.target zerotier-one.service

[Service]
Type=simple
User=youruser
WorkingDirectory=/path/to/scripts
ExecStart=/usr/bin/python3 device_agent.py --server http://10.243.48.125:8001 --token YOUR_TOKEN
Restart=always

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable pixsim-agent
sudo systemctl start pixsim-agent
sudo systemctl status pixsim-agent
```

### macOS (LaunchAgent)

Create `~/Library/LaunchAgents/com.pixsim.agent.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.pixsim.agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/python3</string>
        <string>/path/to/device_agent.py</string>
        <string>--server</string>
        <string>http://10.243.48.125:8001</string>
        <string>--token</string>
        <string>YOUR_TOKEN</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
```

Load:
```bash
launchctl load ~/Library/LaunchAgents/com.pixsim.agent.plist
```

## Viewing Connected Devices

After agent is running, devices will appear in PixSim7 web interface:
- **Automation → Devices** - See all connected devices
- **Automation → Agents** - Manage remote agents

Remote devices will show as: `AgentName/device-serial`
