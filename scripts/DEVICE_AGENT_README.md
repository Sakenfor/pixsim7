# PixSim7 Device Agent

Connect your local Android devices to PixSim7 server remotely over ZeroTier.

## Prerequisites

- Python 3.8+
- `aiohttp` package
- ADB installed and in PATH
- ZeroTier installed and connected to PixSim7 network

## Installation

```bash
# Install required packages
pip install aiohttp

# Make agent executable (Linux/Mac)
chmod +x device_agent.py
```

## Quick Start

```bash
python device_agent.py --server http://10.243.48.125:8001
```

The agent will:
1. Display a pairing code (e.g., `A1B2-C3D4`)
2. Wait for you to enter the code in the web UI
3. Start syncing devices after pairing completes

## Usage

### Run the Agent

```bash
python device_agent.py --server http://10.243.48.125:8001
```

You'll see:
```
╔═══════════════════════════════════════════════════════════════╗
║                   PixSim7 Device Agent                        ║
╚═══════════════════════════════════════════════════════════════╝

┌───────────────────────────────────────────────────────────────┐
│                                                               │
│                    Your Pairing Code:                         │
│                                                               │
│                      [ A1B2-C3D4 ]                            │
│                                                               │
│        Enter this code in PixSim web interface                │
│        Automation → Devices → "Add Remote Agent"              │
│                                                               │
└───────────────────────────────────────────────────────────────┘

  Status: ⏳ WAITING - Waiting for you to enter code in web UI...
```

### Complete Pairing

1. Open PixSim7 web interface
2. Go to **Automation → Devices**
3. Click **"Add Remote Agent"**
4. Enter the pairing code shown in the terminal
5. Agent will automatically start syncing

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `--server` | PixSim7 server URL (required) | - |
| `--name` | Custom agent name | `hostname-agent` |
| `--heartbeat` | Heartbeat interval in seconds | 30 |
| `--debug` | Enable debug logging | off |

### Examples

```bash
# Basic usage
python device_agent.py --server http://10.243.48.125:8001

# Custom name
python device_agent.py --server http://10.243.48.125:8001 --name "LivingRoom-PC"

# Longer heartbeat interval
python device_agent.py --server http://10.243.48.125:8001 --heartbeat 60

# Debug mode
python device_agent.py --server http://10.243.48.125:8001 --debug
```

## How It Works

```
┌─────────────────┐                      ┌─────────────────┐
│  Device Agent   │                      │     Server      │
└────────┬────────┘                      └────────┬────────┘
         │                                        │
         │ 1. POST /request-pairing               │
         │───────────────────────────────────────>│
         │                                        │
         │    Returns: pairing_code "A1B2-C3D4"   │
         │<───────────────────────────────────────│
         │                                        │
         │    [Agent displays code to user]       │
         │                                        │
         │ 2. GET /pairing-status (polling)       │
         │───────────────────────────────────────>│
         │                                        │
         │    [User enters code in web UI]        │
         │                                        │
         │    Returns: status="paired"            │
         │<───────────────────────────────────────│
         │                                        │
         │ 3. POST /heartbeat (every 30s)         │
         │───────────────────────────────────────>│
         │    (includes device list)              │
         └────────────────────────────────────────┘
```

## Security

- **No tokens required**: Pairing code flow is secure and time-limited
- **Always use ZeroTier**: HTTP is safe over ZeroTier's encrypted network
- **Never expose publicly**: Agent is designed for internal network only
- **Codes expire**: Pairing codes have a short TTL (typically 5 minutes)

## Troubleshooting

### Cannot connect to server

```bash
# Check network connectivity
ping 10.243.48.125

# Check ZeroTier
zerotier-cli status
zerotier-cli listnetworks

# Check server is running
curl http://10.243.48.125:8001/health
```

### ADB not found

```bash
# Windows: Add ADB to PATH
set PATH=%PATH%;C:\path\to\platform-tools

# Linux/Mac
export PATH=$PATH:/path/to/platform-tools

# Verify ADB works
adb devices
```

### No devices detected

```bash
# Check ADB can see devices
adb devices

# If device shows as "unauthorized":
# 1. Check device screen for USB debugging prompt
# 2. Accept the connection on the device

# If no devices at all:
# 1. Enable USB debugging on Android device
#    Settings → Developer Options → USB Debugging
# 2. Try different USB cable (some are charge-only)
```

### Pairing code expired

The agent automatically requests a new code if the current one expires. If you see this message, simply enter the new code shown.

## Running as Service

### Windows (Task Scheduler)

Create `start-agent.bat`:
```batch
@echo off
cd /d %~dp0
python device_agent.py --server http://10.243.48.125:8001
```

Then: Task Scheduler → Create Basic Task → Run at startup

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
ExecStart=/usr/bin/python3 device_agent.py --server http://10.243.48.125:8001
Restart=always

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable pixsim-agent
sudo systemctl start pixsim-agent
```

**Note**: For service mode, the first run requires manual pairing. After initial pairing, the agent ID is stored and subsequent runs will reconnect automatically (future enhancement).

## Viewing Connected Devices

After pairing, devices appear in PixSim7 web interface:
- **Automation → Devices** - See all connected devices
- **Automation → Agents** - Manage remote agents

Remote devices show with agent prefix: `AgentName/device-serial`
