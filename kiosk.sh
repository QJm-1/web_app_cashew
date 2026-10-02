#!/bin/bash
# Starts the Flask panel (inside the venv) and opens it full screen in Chromium.

# go to the project folder and activate the virtual environment
cd "$HOME/Desktop/project"
source venv/bin/activate

# go to the app folder and start the server
cd cashew
python app.py &
SERVER_PID=$!

# stop the server when this script ends (e.g. after Alt+F4)
trap "kill $SERVER_PID 2>/dev/null" EXIT

# wait until the server answers
until curl -s http://localhost:5000 > /dev/null; do sleep 1; done

BROWSER=$(command -v chromium-browser || command -v chromium)
"$BROWSER" --kiosk --noerrdialogs --disable-infobars --incognito \
  --disable-session-crashed-bubble --check-for-update-interval=31536000 \
  http://localhost:5000
