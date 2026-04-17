import firebase_admin
from firebase_admin import credentials
from firebase_admin import firestore
import time
from datetime import datetime

# Connect to Firebase using your downloaded JSON key
# IMPORTANT: Make sure this filename matches your actual downloaded key!
cred = credentials.Certificate('your-firebase-adminsdk.json')
firebase_admin.initialize_app(cred)

db = firestore.client()
print("Connected to Firebase! Starting sensor and progress stream...")

def read_temperature_sensor():
    # Replace with your actual sensor code
    return 155.5 

def read_moisture_sensor():
    # Replace with your actual sensor code
    return 5.2

def read_ph_sensor():
    # Replace with your actual sensor code
    return 6.1

# Initialize our physical extraction progress tracker
extraction_progress = 0

try:
    while True:
        now = datetime.now()
        formatted_time = now.strftime("%I:%M:%S %p")
        unix_timestamp = int(time.time() * 1000)

        # 1. Calculate new progress (Increments by 5% every loop for testing)
        if extraction_progress < 100:
            extraction_progress += 5
            if extraction_progress > 100:
                extraction_progress = 100

        # 2. Read hardware sensors
        current_temp = read_temperature_sensor()
        current_moisture = read_moisture_sensor()
        current_ph = read_ph_sensor()

        print(f"[{formatted_time}] Temp: {current_temp}°C | Progress: {extraction_progress}%")

        # 3. Push Temperature Data
        db.collection('temperatureLogs').add({
            'time': formatted_time,
            'timestamp': unix_timestamp,
            'temp': current_temp
        })

        # 4. Push Regulation Data
        db.collection('regulationLogs').add({
            'time': formatted_time,
            'timestamp': unix_timestamp,
            'moisture': current_moisture,
            'ph': current_ph,
            'temp': current_temp
        })

        # 5. Push System Progress Data
        db.collection('systemLogs').add({
            'time': formatted_time,
            'timestamp': unix_timestamp,
            'progress': extraction_progress
        })

        # Wait 3 seconds before the next reading
        time.sleep(3)

except KeyboardInterrupt:
    print("\nProcess stopped by user.")
