"""
ESP32 kiosk panel (Raspberry Pi)

- Talks to the ESP32 over USB serial (115200 baud)
- Sends "ALL" so the ESP32 streams: ph,moist,temp1,temp2 every second
- Relay buttons send R1ON / R1OFF ... R6ON / R6OFF, RALLON / RALLOFF
- Serves one kiosk page at http://localhost:5000

Install (Raspberry Pi OS):
    sudo apt install python3-flask python3-serial
    sudo usermod -aG dialout $USER     # then log out / reboot once

Run:
    python3 app.py
    (optional) SERIAL_PORT=/dev/ttyUSB0 python3 app.py
"""

import glob
import os
import re
import subprocess
import threading
import time

import serial
from flask import Flask, jsonify, render_template, request

# ---------------- SETTINGS (edit these) ----------------
PROJECT_NAME = "Process monitor"

# ch = ESP32 relay number (R1..R6). pulse = seconds before auto-off (0 = stays on)
# Relay 6 is not used on the panel.
RELAYS = [
    {"ch": 1, "name": "Mixer",             "icon": "fa-sync-alt",     "pulse": 0},
    {"ch": 2, "name": "Agricultural Lime", "icon": "fa-mortar-pestle", "pulse": 3},
    {"ch": 3, "name": "Water",             "icon": "fa-tint",          "pulse": 3},
    {"ch": 4, "name": "Heater",            "icon": "fa-fire",          "pulse": 0},
    {"ch": 5, "name": "Extractor",         "icon": "fa-fan",           "pulse": 0},
]
RELAY_BY_CH = {r["ch"]: r for r in RELAYS}

MOIST_LOW, MOIST_HIGH = 40, 60     # % : below = dry, above = wet
TEMP_LOW, TEMP_HIGH = 150, 180     # °C target band
TEMP_SCALE_MAX = 250               # °C : right end of the temp bar

BAUD = 115200
SERIAL_PORT = os.environ.get("SERIAL_PORT", "")  # empty = auto-detect
STALE_AFTER = 5                    # seconds without data before re-sending ALL

# ---------------- SERIAL PARSING ----------------
NUM = r"(-?\d+(?:\.\d+)?|null|nan)"
ALL_RE = re.compile(rf"^{NUM},{NUM},{NUM},{NUM}$", re.IGNORECASE)
RELAY_RE = re.compile(r"^OK R([1-6])(ON|OFF)$")
RELAYS_RE = re.compile(r"^OK RELAYS=([01]{6})$")


def to_num(s):
    s = s.lower()
    return None if s in ("null", "nan") else float(s)


class Esp32Link:
    """Keeps a serial connection to the ESP32 open and stores the latest values."""

    def __init__(self):
        self.write_lock = threading.Lock()
        self.ser = None
        self.port = None
        self.connected = False
        self.error = "Looking for the ESP32"
        self.ph = self.moist = self.t1 = self.t2 = None
        self.relays = [False] * 6
        self.last_data = 0.0
        threading.Thread(target=self._run, daemon=True).start()

    # ---- public ----
    def send(self, cmd):
        with self.write_lock:
            if not self.ser:
                return False
            try:
                self.ser.write((cmd + "\n").encode())
                return True
            except (serial.SerialException, OSError) as e:
                self.error = str(e)
                return False

    def snapshot(self):
        age = time.time() - self.last_data if self.last_data else None
        return {
            "connected": self.connected,
            "port": self.port,
            "error": self.error,
            "age": age,
            "ph": self.ph,
            "moist": self.moist,
            "t1": self.t1,
            "t2": self.t2,
            "relays": self.relays,
        }

    # ---- internal ----
    def _find_port(self):
        if SERIAL_PORT:
            return SERIAL_PORT if os.path.exists(SERIAL_PORT) else None
        ports = sorted(glob.glob("/dev/ttyUSB*") + glob.glob("/dev/ttyACM*"))
        return ports[0] if ports else None

    def _start_session(self):
        """Ask the ESP32 to stream everything and report relay states."""
        self.send("ALL")
        for ch in range(1, 7):
            self.send(f"R{ch}")

    def _parse(self, line):
        m = ALL_RE.match(line)
        if m:
            self.ph, self.moist, self.t1, self.t2 = (to_num(g) for g in m.groups())
            self.last_data = time.time()
            return
        m = RELAY_RE.match(line)
        if m:
            self.relays[int(m.group(1)) - 1] = m.group(2) == "ON"
            return
        m = RELAYS_RE.match(line)
        if m:
            self.relays = [c == "1" for c in m.group(1)]
            return
        if line.startswith("READY"):      # ESP32 rebooted
            self._start_session()

    def _run(self):
        while True:
            port = self._find_port()
            if not port:
                self.connected = False
                self.error = "ESP32 not found"
                time.sleep(3)
                continue

            s = None
            try:
                s = serial.Serial(port, BAUD, timeout=1)
                time.sleep(2)               # ESP32 resets when the port opens
                s.reset_input_buffer()
                with self.write_lock:
                    self.ser, self.port = s, port
                self.connected, self.error = True, ""
                self._start_session()
                last_kick = time.time()

                while True:
                    raw = s.readline()
                    if raw:
                        self._parse(raw.decode(errors="ignore").strip())
                    now = time.time()
                    if now - self.last_data > STALE_AFTER and now - last_kick > STALE_AFTER:
                        self._start_session()
                        last_kick = now

            except (serial.SerialException, OSError) as e:
                self.error = str(e)
            finally:
                with self.write_lock:
                    self.ser = None
                self.connected = False
                if s:
                    try:
                        s.close()
                    except Exception:
                        pass
            time.sleep(3)


# ---------------- FLASK ----------------
app = Flask(__name__)
esp = Esp32Link()

# ---------------- RELAY CONTROL + AUTO-OFF ----------------
pulse_lock = threading.Lock()
pulse_timers = {}   # ch -> threading.Timer
pulse_ends = {}     # ch -> time when it switches off


def _cancel_pulse(ch):
    t = pulse_timers.pop(ch, None)
    if t:
        t.cancel()
    pulse_ends.pop(ch, None)


def _auto_off(ch):
    with pulse_lock:
        pulse_timers.pop(ch, None)
        pulse_ends.pop(ch, None)
    esp.send(f"R{ch}OFF")


def set_relay(ch, on):
    """Switch one relay. Relays with a pulse time switch themselves off."""
    relay = RELAY_BY_CH[ch]
    with pulse_lock:
        _cancel_pulse(ch)
        ok = esp.send(f"R{ch}{'ON' if on else 'OFF'}")
        if ok and on and relay["pulse"] > 0:
            t = threading.Timer(relay["pulse"], _auto_off, args=(ch,))
            t.daemon = True
            pulse_timers[ch] = t
            pulse_ends[ch] = time.time() + relay["pulse"]
            t.start()
    return ok


@app.route("/")
def index():
    cfg = {
        "relays": RELAYS,
        "moist_low": MOIST_LOW,
        "moist_high": MOIST_HIGH,
        "temp_low": TEMP_LOW,
        "temp_high": TEMP_HIGH,
        "temp_max": TEMP_SCALE_MAX,
        "stale_after": STALE_AFTER,
    }
    return render_template("index.html", project_name=PROJECT_NAME, cfg=cfg)


@app.route("/api/state")
def api_state():
    state = esp.snapshot()
    now = time.time()
    with pulse_lock:
        state["pulse_left"] = {ch: max(0.0, end - now) for ch, end in pulse_ends.items()}
    return jsonify(state)


@app.route("/api/relay", methods=["POST"])
def api_relay():
    data = request.get_json(silent=True) or {}
    ch, on = data.get("ch"), bool(data.get("on"))
    if ch == "all":
        # "All on" skips the timed relays (lime, water); "All off" stops everything
        ok = True
        for r in RELAYS:
            if on and r["pulse"] > 0:
                continue
            ok = set_relay(r["ch"], on) and ok
    elif ch in RELAY_BY_CH:
        ok = set_relay(ch, on)
    else:
        return jsonify({"ok": False, "error": "unknown relay"}), 400
    return jsonify({"ok": ok})


# ---------------- EXIT APP / SHUT DOWN PI ----------------
def all_relays_off():
    """Safety: switch every relay off before leaving."""
    with pulse_lock:
        for ch in list(pulse_timers):
            _cancel_pulse(ch)
    esp.send("RALLOFF")


def _exit_app():
    subprocess.run(["pkill", "-f", "chromium"])   # closes the kiosk browser
    os._exit(0)                                     # stops this server


def _shutdown_pi():
    subprocess.run(["sudo", "-n", "shutdown", "-h", "now"])


@app.route("/api/power", methods=["POST"])
def api_power():
    action = (request.get_json(silent=True) or {}).get("action")

    if action == "exit":
        all_relays_off()
        threading.Timer(1.0, _exit_app).start()
        return jsonify({"ok": True})

    if action == "shutdown":
        # sudo -n = never ask for a password; fails if not allowed
        if subprocess.run(["sudo", "-n", "true"]).returncode != 0:
            return jsonify({"ok": False,
                            "error": "This user can't shut down without a password. See the setup notes."}), 403
        all_relays_off()
        threading.Timer(1.0, _shutdown_pi).start()
        return jsonify({"ok": True})

    return jsonify({"ok": False, "error": "action must be 'exit' or 'shutdown'"}), 400


if __name__ == "__main__":
    # use_reloader=False so only one serial thread is started
    app.run(host="0.0.0.0", port=5000, threaded=True, use_reloader=False)
