import glob
import os
import re
import subprocess
import threading
import time
import serial
from flask import Flask, jsonify, render_template, request

# --- FIREBASE IMPORT ---
import firebase_admin
from firebase_admin import credentials, firestore

# --- FIREBASE SETUP ---
# REPLACE THIS STRING WITH YOUR EXACT JSON FILENAME
FIREBASE_KEY_FILE = "cashewtracker-app-firebase-adminsdk-fbsvc-b003a27606.json" 

try:
    cred = credentials.Certificate(FIREBASE_KEY_FILE)
    firebase_admin.initialize_app(cred)
    db = firestore.client()
    print("✅ Successfully connected to Firebase!")
except Exception as e:
    print(f"❌ Firebase connection failed: {e}")
    db = None

# ---------------- SETTINGS ----------------
PROJECT_NAME = "Process monitor"

RELAYS = [
    {"ch": 1, "name": "Mixer",             "icon": "fa-sync-alt",      "pulse": 0},
    {"ch": 2, "name": "Agricultural Lime", "icon": "fa-mortar-pestle", "pulse": 3},
    {"ch": 3, "name": "Water",             "icon": "fa-tint",          "pulse": 3},
    {"ch": 4, "name": "Heater",            "icon": "fa-fire",          "pulse": 0},
    {"ch": 5, "name": "Extractor",         "icon": "fa-fan",           "pulse": 0},
]
RELAY_BY_CH = {r["ch"]: r for r in RELAYS}

MOIST_LOW, MOIST_HIGH = 40, 60     
TEMP_LOW, TEMP_HIGH = 150, 180     
TEMP_SCALE_MAX = 250               

BAUD = 115200
SERIAL_PORT = os.environ.get("SERIAL_PORT", "")  
STALE_AFTER = 5                    

# ---------------- SERIAL PARSING ----------------
NUM = r"(-?\d+(?:\.\d+)?|null|nan)"
ALL_RE = re.compile(rf"^{NUM},{NUM},{NUM},{NUM}$", re.IGNORECASE)
RELAY_RE = re.compile(r"^OK R([1-6])(ON|OFF)$")
RELAYS_RE = re.compile(r"^OK RELAYS=([01]{6})$")

def to_num(s):
    s = s.lower()
    return None if s in ("null", "nan") else float(s)

class Esp32Link:
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

    def send(self, cmd):
        with self.write_lock:
            if not self.ser: return False
            try:
                self.ser.write((cmd + "\n").encode())
                return True
            except (serial.SerialException, OSError) as e:
                self.error = str(e)
                return False

    def snapshot(self):
        age = time.time() - self.last_data if self.last_data else None
        return {
            "connected": self.connected, "port": self.port, "error": self.error, "age": age,
            "ph": self.ph, "moist": self.moist, "t1": self.t1, "t2": self.t2, "relays": self.relays,
        }

    def _find_port(self):
        if SERIAL_PORT: return SERIAL_PORT if os.path.exists(SERIAL_PORT) else None
        ports = sorted(glob.glob("/dev/ttyUSB*") + glob.glob("/dev/ttyACM*"))
        return ports[0] if ports else None

    def _start_session(self):
        self.send("ALL")
        for ch in range(1, 7): self.send(f"R{ch}")

    def _parse(self, line):
        m = ALL_RE.match(line)
        if m:
            self.ph, self.moist, self.t1, self.t2 = (to_num(g) for g in m.groups())
            self.last_data = time.time()
            
            # --- FIREBASE UPLOAD: PUSH SENSOR DATA TO CLOUD ---
            if db:
                current_time = time.strftime("%I:%M:%S %p")
                try:
                    # Upload Temperature
                    if self.t1 is not None:
                        db.collection('temperatureLogs').add({
                            'time': current_time, 'temp': self.t1, 'timestamp': firestore.SERVER_TIMESTAMP
                        })
                    # Upload Regulation Status
                    if self.moist is not None and self.ph is not None:
                        db.collection('regulationLogs').add({
                            'time': current_time, 'moisture': self.moist, 'ph': self.ph, 'temp': self.t1, 'timestamp': firestore.SERVER_TIMESTAMP
                        })
                except Exception as e:
                    pass # Ignore upload errors to prevent crashing the hardware loop
            return

        m = RELAY_RE.match(line)
        if m:
            self.relays[int(m.group(1)) - 1] = m.group(2) == "ON"
            return
        m = RELAYS_RE.match(line)
        if m:
            self.relays = [c == "1" for c in m.group(1)]
            return
        if line.startswith("READY"):
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
                time.sleep(2)               
                s.reset_input_buffer()
                with self.write_lock:
                    self.ser, self.port = s, port
                self.connected, self.error = True, ""
                self._start_session()
                last_kick = time.time()
                while True:
                    raw = s.readline()
                    if raw: self._parse(raw.decode(errors="ignore").strip())
                    now = time.time()
                    if now - self.last_data > STALE_AFTER and now - last_kick > STALE_AFTER:
                        self._start_session()
                        last_kick = now
            except (serial.SerialException, OSError) as e:
                self.error = str(e)
            finally:
                with self.write_lock: self.ser = None
                self.connected = False
                if s:
                    try: s.close()
                    except Exception: pass
            time.sleep(3)


# ---------------- FLASK ----------------
app = Flask(__name__)
esp = Esp32Link()

# ---------------- RELAY CONTROL + AUTO-OFF ----------------
pulse_lock = threading.Lock()
pulse_timers = {}   
pulse_ends = {}     

def _cancel_pulse(ch):
    t = pulse_timers.pop(ch, None)
    if t: t.cancel()
    pulse_ends.pop(ch, None)

def _auto_off(ch):
    with pulse_lock:
        pulse_timers.pop(ch, None)
        pulse_ends.pop(ch, None)
    esp.send(f"R{ch}OFF")

def set_relay(ch, on):
    if ch not in RELAY_BY_CH: return False
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

# --- FIREBASE LISTENER: RECEIVE COMMANDS FROM MOBILE APP ---
def on_cloud_command(col_snapshot, changes, read_time):
    for change in changes:
        if change.type.name == 'ADDED':
            cmd = change.document.to_dict()
            ch = cmd.get("ch")
            on = cmd.get("on", False)
            
            if ch == "all":
                for r in RELAYS:
                    if on and r["pulse"] > 0: continue
                    set_relay(r["ch"], on)
            else:
                set_relay(int(ch), on)
                
            # Delete the command from the database once executed
            change.document.reference.delete()

if db:
    # Continuously watch the 'relayCommands' collection for new button presses
    db.collection('relayCommands').on_snapshot(on_cloud_command)

# ---------------- LOCAL KIOSK ROUTES ----------------
@app.route("/")
def index():
    cfg = { "relays": RELAYS, "moist_low": MOIST_LOW, "moist_high": MOIST_HIGH, "temp_low": TEMP_LOW, "temp_high": TEMP_HIGH, "temp_max": TEMP_SCALE_MAX, "stale_after": STALE_AFTER }
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
        ok = True
        for r in RELAYS:
            if on and r["pulse"] > 0: continue
            ok = set_relay(r["ch"], on) and ok
    elif ch in RELAY_BY_CH:
        ok = set_relay(ch, on)
    else: return jsonify({"ok": False, "error": "unknown relay"}), 400
    return jsonify({"ok": ok})

# ---------------- EXIT APP / SHUT DOWN PI ----------------
def all_relays_off():
    with pulse_lock:
        for ch in list(pulse_timers): _cancel_pulse(ch)
    esp.send("RALLOFF")

def _exit_app():
    subprocess.run(["pkill", "-f", "chromium"])   
    os._exit(0)                                     

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
        if subprocess.run(["sudo", "-n", "true"]).returncode != 0:
            return jsonify({"ok": False}), 403
        all_relays_off()
        threading.Timer(1.0, _shutdown_pi).start()
        return jsonify({"ok": True})
    return jsonify({"ok": False}), 400

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, threaded=True, use_reloader=False)