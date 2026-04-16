# CashewTrack

A responsive React web application for monitoring cashew processing conditions (temperature, moisture, pH level, and system status) integrated with Firebase Realtime Firestore.

## Features
* Clean, card-based dashboard layout.
* Dynamic, simulated data streams for processing metrics.
* Real-time database reads/writes using Firebase Firestore.
* Automatic warning alerts for high-temperature triggers (> 170°C).
* Progress tracking and success states.

## Setup Instructions

1. Clone this repository.
2. Ensure you have a Firebase project set up with Firestore enabled (Test Mode).
3. Add your Firebase config credentials to `src/firebase.js`.
4. Run the following commands in your terminal:

\`\`\`bash
npm install
npm run dev
\`\`\`
