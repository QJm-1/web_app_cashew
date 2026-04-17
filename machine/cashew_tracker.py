import firebase_admin
from firebase_admin import credentials
from firebase_admin import firestore
import time
from datetime import datetime

# 1. Connect to Firebase using your downloaded JSON key
# REPLACE 'your-firebase-adminsdk.json' with the actual filename
cred = credentials.Certificate('your-firebase-adminsdk.json')
firebase_admin.initialize_app(cred)

db = firestore.client()

print("Connected to Firebase! Starting sensor stream...")

def read_temperature_sensor():
    # TODO: Replace this with your actual sensor code (e.g., MLX90614, MAX6675)
    # For now, it returns a hardcoded value so you can test the connection
    return 155.5 

def read_moisture_sensor():
    # TODO: Replace with your actual moisture sensor code
    return 5.2

def read_ph_sensor():
    # TODO: Replace with your actual pH sensor code
    return 6.1

try:
    while True:
        # Get current time formatted exactly how React expects it
        now = datetime.now()
        formatted_time = now.strftime("%I:%M:%S %p")
        # React expects a Javascript Unix timestamp (milliseconds)
        unix_timestamp = int(time.time() * 1000)

        # Read your hardware sensors
        current_temp = read_temperature_sensor()
        current_moisture = read_moisture_sensor()
        current_ph = read_ph_sensor()

        print(f"[{formatted_time}] Sending Temp: {current_temp}°C")

        # 2. Push Temperature Data to Firebase
        db.collection('temperatureLogs').add({
            'time': formatted_time,
            'timestamp': unix_timestamp,
            'temp': current_temp
        })

        # 3. Push Regulation Data to Firebase
        db.collection('regulationLogs').add({
            'time': formatted_time,
            'timestamp': unix_timestamp,
            'moisture': current_moisture,
            'ph': current_ph,
            'temp': current_temp
        })

        # Wait 3 seconds before sending the next reading
        time.sleep(3)

except KeyboardInterrupt:
    print("\nProcess stopped by user.")
