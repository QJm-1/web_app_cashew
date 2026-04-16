import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { collection, addDoc, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from './firebase';
import './index.css';

function App() {
  const [view, setView] = useState('landing');
  const [tempData, setTempData] = useState([]);
  const [regData, setRegData] = useState([]);
  const [progress, setProgress] = useState(0);
  const [showWarning, setShowWarning] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Listen to Firebase Real-time Updates
  useEffect(() => {
    const tempQuery = query(collection(db, 'temperatureLogs'), orderBy('timestamp', 'desc'), limit(5));
    const unsubscribeTemp = onSnapshot(tempQuery, (snapshot) => {
      const logs = snapshot.docs.map(doc => doc.data());
      setTempData(logs);
      if (logs.length > 0 && logs[0].temp > 170 && !showWarning) {
        setShowWarning(true);
      }
    });

    const regQuery = query(collection(db, 'regulationLogs'), orderBy('timestamp', 'desc'), limit(5));
    const unsubscribeReg = onSnapshot(regQuery, (snapshot) => {
      setRegData(snapshot.docs.map(doc => doc.data()));
    });

    return () => {
      unsubscribeTemp();
      unsubscribeReg();
    };
  }, []);

  // Simulate Sensor Data & Write to Firebase
  useEffect(() => {
    if (view === 'landing') return;

    const interval = setInterval(async () => {
      const now = new Date();
      const formattedTime = now.toLocaleTimeString();
      const timestamp = now.getTime();
      
      const tempBase = 150;
      const newTemp = Math.random() > 0.9 ? 172 + Math.floor(Math.random() * 5) : tempBase + Math.floor(Math.random() * 15 - 7);
      
      try {
        await addDoc(collection(db, 'temperatureLogs'), {
          time: formattedTime, timestamp, temp: newTemp
        });

        const moisture = (5 + Math.random() - 0.5).toFixed(1);
        const ph = (6.0 + (Math.random() * 0.4 - 0.2)).toFixed(1);
        
        await addDoc(collection(db, 'regulationLogs'), {
          time: formattedTime, timestamp, moisture, ph, temp: newTemp
        });
      } catch (error) {
        console.error("Firebase write error:", error);
      }

      if (progress < 100 && view === 'system') {
        setProgress(p => {
          const next = p + Math.floor(Math.random() * 15);
          if (next >= 100 && !showSuccess) {
            setShowSuccess(true);
            return 100;
          }
          return next > 100 ? 100 : next;
        });
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [view, progress]);

  const renderView = () => {
    switch (view) {
      case 'landing':
        return (
          <div className="card" style={{ marginTop: '100px' }}>
            <div className="icon">🌰</div>
            <h1>CashewTrack</h1>
            <p>Processing Condition Monitor</p>
            <button className="btn" onClick={() => setView('dashboard')}>START</button>
          </div>
        );
      case 'dashboard':
        return (
          <div className="card">
            <h2>Dashboard Menu</h2>
            <button className="btn" onClick={() => setView('temperature')}>🌡️ Monitor Temperature</button>
            <button className="btn" onClick={() => setView('regulation')}>💧 Regulation Status</button>
            <button className="btn" onClick={() => setView('system')}>⚙️ System Status</button>
          </div>
        );
      case 'temperature':
        return (
          <div className="card">
            <h2>Temperature Logs</h2>
            <table>
              <thead><tr><th>Timestamp</th><th>Temperature (°C)</th></tr></thead>
              <tbody>
                {tempData.map((d, i) => (
                  <tr key={i} className={d.temp > 170 ? 'danger-row' : ''}>
                    <td>{d.time}</td>
                    <td>{d.temp}°C</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="btn btn-secondary" style={{ marginTop: '20px' }} onClick={() => setView('dashboard')}>Back</button>
          </div>
        );
      case 'regulation':
        return (
          <div className="card">
            <h2>Moisture & pH Logs</h2>
            <table>
              <thead><tr><th>Time</th><th>Moisture</th><th>pH</th><th>Temp</th></tr></thead>
              <tbody>
                {regData.map((d, i) => (
                  <tr key={i}>
                    <td>{d.time}</td><td>{d.moisture}%</td><td>{d.ph}</td><td>{d.temp}°C</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="btn btn-secondary" style={{ marginTop: '20px' }} onClick={() => setView('dashboard')}>Back</button>
          </div>
        );
      case 'system':
        return (
          <div className="card">
            <div className="icon">⚙️</div>
            <h2>PROCESSING...</h2>
            <h2>{progress}%</h2>
            <div className="progress-container">
              <div className="progress-bar" style={{ width: `${progress}%` }}></div>
            </div>
            <button className="btn btn-secondary" onClick={() => setView('dashboard')}>Back</button>
          </div>
        );
      default: return null;
    }
  };

  return (
    <div className="app-container">
      {renderView()}
      {showWarning && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="icon">⚠️</div>
            <h2 style={{color: 'red'}}>WARNING</h2>
            <p>Machine error detected. High temperature.</p>
            <button className="btn" style={{backgroundColor: '#F44336'}} onClick={() => setShowWarning(false)}>Close</button>
          </div>
        </div>
      )}
      {showSuccess && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="icon">✅</div>
            <h2 style={{color: 'green'}}>CONGRATULATIONS</h2>
            <p>Process finished successfully.</p>
            <button className="btn" onClick={() => {setShowSuccess(false); setProgress(0);}}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

const root = createRoot(document.getElementById('root'));
root.render(<App />);
