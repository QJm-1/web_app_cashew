import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from './firebase'; 
import './index.css';

function App() {
  const [view, setView] = useState('home');
  
  // Data States
  const [tempData, setTempData] = useState([]);
  const [regData, setRegData] = useState([]);
  const [progress, setProgress] = useState(0);
  
  // Display Toggle States
  const [isTempActive, setIsTempActive] = useState(false);
  const [isRegActive, setIsRegActive] = useState(false);
  const [isSysActive, setIsSysActive] = useState(false);

  // Alert States
  const [showWarning, setShowWarning] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // LISTEN TO FIREBASE (ALL REAL DATA FROM RASPBERRY PI)
  useEffect(() => {
    // 1. Listen for Temperature Updates
    const tempQuery = query(collection(db, 'temperatureLogs'), orderBy('timestamp', 'desc'), limit(6));
    const unsubscribeTemp = onSnapshot(tempQuery, (snapshot) => {
      const logs = snapshot.docs.map(doc => doc.data());
      setTempData(logs);
      if (logs.length > 0 && logs[0].temp > 170) {
        setShowWarning(true);
      }
    });

    // 2. Listen for Regulation Updates
    const regQuery = query(collection(db, 'regulationLogs'), orderBy('timestamp', 'desc'), limit(6));
    const unsubscribeReg = onSnapshot(regQuery, (snapshot) => {
      setRegData(snapshot.docs.map(doc => doc.data()));
    });

    // 3. Listen for System Progress Updates
    const sysQuery = query(collection(db, 'systemLogs'), orderBy('timestamp', 'desc'), limit(1));
    const unsubscribeSys = onSnapshot(sysQuery, (snapshot) => {
      if (!snapshot.empty) {
        const latestData = snapshot.docs[0].data();
        setProgress(latestData.progress);
        
        // Trigger success modal when hardware reports 100%
        if (latestData.progress >= 100) {
          setShowSuccess(true);
        }
      }
    });

    // Cleanup listeners
    return () => {
      unsubscribeTemp();
      unsubscribeReg();
      unsubscribeSys();
    };
  }, []); 

  // RENDER THE MAIN CONTENT AREA
  const renderContent = () => {
    switch (view) {
      case 'home':
        return (
          <div className="card" style={{ textAlign: 'center', marginTop: '10vh' }}>
            <div className="icon">🌰</div>
            <h1>Welcome to CashewTrack</h1>
            <p style={{fontSize: '18px', color: '#666', lineHeight: '1.6'}}>
              Use the sidebar menu to navigate through the administrative dashboard.<br/>
              <b>Note:</b> You must manually start the monitoring views to see incoming live data from the Raspberry Pi.
            </p>
          </div>
        );
        
      case 'temperature':
        return (
          <div className="card">
            <div className="header-controls">
              <h2>🌡️ Temperature Monitoring</h2>
              <button 
                className={`btn ${isTempActive ? 'btn-danger' : ''}`}
                onClick={() => setIsTempActive(!isTempActive)}
              >
                {isTempActive ? '⏹ Stop Viewing' : '▶ Start Viewing Live Data'}
              </button>
            </div>
            
            {!isTempActive && <p>Display paused. Press Start to view incoming sensor data from the Pi.</p>}
            
            {isTempActive && (
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
            )}
          </div>
        );
        
      case 'regulation':
        return (
          <div className="card">
            <div className="header-controls">
              <h2>💧 Regulation Status</h2>
              <button 
                className={`btn ${isRegActive ? 'btn-danger' : ''}`}
                onClick={() => setIsRegActive(!isRegActive)}
              >
                {isRegActive ? '⏹ Stop Viewing' : '▶ Start Viewing Live Data'}
              </button>
            </div>
            
            {!isRegActive && <p>Display paused. Press Start to view incoming sensor data from the Pi.</p>}

            {isRegActive && (
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
            )}
          </div>
        );
        
      case 'system':
        return (
          <div className="card">
            <div className="header-controls">
              <h2>⚙️ System Status</h2>
              <button 
                className={`btn ${isSysActive ? 'btn-danger' : ''}`}
                onClick={() => setIsSysActive(!isSysActive)}
              >
                {isSysActive ? '⏹ Stop Viewing' : '▶ View Live Progress'}
              </button>
            </div>
            
            {!isSysActive && <p>Display paused. Press Start to view the live extraction progress from the Pi.</p>}

            {isSysActive && (
              <>
                <div style={{textAlign: 'center', margin: '40px 0'}}>
                  <h1 style={{fontSize: '48px', margin: '0'}}>{progress}%</h1>
                  <h3 style={{color: '#666'}}>
                    {progress >= 100 ? 'COMPLETED' : 'PROCESSING...'}
                  </h3>
                </div>
                
                <div className="progress-container">
                  <div className="progress-bar" style={{ width: `${progress}%` }}></div>
                </div>
              </>
            )}
          </div>
        );
      default: return null;
    }
  };

  return (
    <div className="app-layout">
      {/* SIDEBAR NAVIGATION */}
      <div className="sidebar">
        <div className="sidebar-header">
          <div style={{fontSize: '40px'}}>🌰</div>
          <h2>CashewTrack</h2>
          <span style={{fontSize: '12px', opacity: 0.8}}>Admin Console</span>
        </div>
        
        <button className={`nav-btn ${view === 'home' ? 'active' : ''}`} onClick={() => setView('home')}>
          🏠 Dashboard Home
        </button>
        <button className={`nav-btn ${view === 'temperature' ? 'active' : ''}`} onClick={() => setView('temperature')}>
          🌡️ Temperature
        </button>
        <button className={`nav-btn ${view === 'regulation' ? 'active' : ''}`} onClick={() => setView('regulation')}>
          💧 Regulation Status
        </button>
        <button className={`nav-btn ${view === 'system' ? 'active' : ''}`} onClick={() => setView('system')}>
          ⚙️ System Status
        </button>
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="main-content">
        {renderContent()}
      </div>

      {/* WARNING MODAL */}
      {showWarning && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="icon">⚠️</div>
            <h2 style={{color: 'red'}}>CRITICAL WARNING</h2>
            <p>Machine error detected. Internal temperature exceeded 170°C threshold.</p>
            <button className="btn btn-danger" style={{width: '100%'}} onClick={() => setShowWarning(false)}>Acknowledge</button>
          </div>
        </div>
      )}

      {/* SUCCESS MODAL */}
      {showSuccess && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="icon">✅</div>
            <h2 style={{color: 'green'}}>CONGRATULATIONS</h2>
            <p>Extraction process finished successfully.</p>
            <button className="btn" style={{width: '100%'}} onClick={() => setShowSuccess(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

const root = createRoot(document.getElementById('root'));
root.render(<App />);
