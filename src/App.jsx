import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from './firebase'; 
import './index.css';

// Custom Cashew SVG Component
const CashewIcon = ({ size = "48px" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path 
      d="M15.5 3C18.5 3 21 6.5 21 11C21 16 17 21 12 21C7 21 3 17 3 12C3 7 7 4 9.5 4C11.5 4 12 6 11 7.5C10 9 8 9.5 8 12C8 14.5 10 16.5 12 16.5C14.5 16.5 16.5 14 16.5 11C16.5 8.5 14.5 7 13 7C12 7 11.5 6 12 4.5C12.5 3.5 14 3 15.5 3Z" 
      fill="#EEDCBE" 
      stroke="#C29B6A" 
      strokeWidth="1"
    />
  </svg>
);

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
  const [showTempWarning, setShowTempWarning] = useState(false);
  const [showJamWarning, setShowJamWarning] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // LISTEN TO FIREBASE
  useEffect(() => {
    // 1. Listen for Temperature Updates
    const tempQuery = query(collection(db, 'temperatureLogs'), orderBy('timestamp', 'desc'), limit(6));
    const unsubscribeTemp = onSnapshot(tempQuery, (snapshot) => {
      const logs = snapshot.docs.map(doc => doc.data());
      setTempData(logs);
      
      // TERM Plan Fix: Trigger warning at 180°C instead of 170°C
      if (logs.length > 0 && logs[0].temp > 180) {
        setShowTempWarning(true);
      }
    });

    // 2. Listen for Regulation Updates (Moisture, pH, Temp, Current)
    const regQuery = query(collection(db, 'regulationLogs'), orderBy('timestamp', 'desc'), limit(6));
    const unsubscribeReg = onSnapshot(regQuery, (snapshot) => {
      const logs = snapshot.docs.map(doc => doc.data());
      setRegData(logs);

      // TERM Plan Fix: Trigger Mechanical Jam alert if current > 5.5A
      if (logs.length > 0 && logs[0].current > 5.5) {
        setShowJamWarning(true);
      }
    });

    // 3. Listen for System Progress Updates
    const sysQuery = query(collection(db, 'systemLogs'), orderBy('timestamp', 'desc'), limit(1));
    const unsubscribeSys = onSnapshot(sysQuery, (snapshot) => {
      if (!snapshot.empty) {
        const latestData = snapshot.docs[0].data();
        setProgress(latestData.progress);
        
        // TERM Plan Fix: Trigger completion logic
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
            <div className="icon"><CashewIcon size="64px" /></div>
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
                    <tr key={i} className={d.temp > 180 ? 'danger-row' : ''}>
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
                {/* TERM Plan Fix: Added Current (A) to the table header */}
                <thead><tr><th>Time</th><th>Moisture</th><th>pH</th><th>Temp</th><th>Current (A)</th></tr></thead>
                <tbody>
                  {regData.map((d, i) => (
                    <tr key={i} className={d.current > 5.5 ? 'danger-row' : ''}>
                      <td>{d.time}</td>
                      <td>{d.moisture}%</td>
                      <td>{d.ph}</td>
                      <td>{d.temp}°C</td>
                      {/* Displays 0A if the field doesn't exist yet to prevent blank spaces */}
                      <td>{d.current || 0}A</td> 
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
            
            {!isSysActive && <p>Display paused. Press Start to view the live conditioning progress from the Pi.</p>}

            {isSysActive && (
              <>
                <div style={{textAlign: 'center', margin: '40px 0'}}>
                  <h1 style={{fontSize: '48px', margin: '0'}}>{progress}%</h1>
                  <h3 style={{color: '#666'}}>
                    {progress >= 100 ? 'COMPLETED' : 'CONDITIONING...'}
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
          <div><CashewIcon size="40px" /></div>
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

      {/* THERMAL WARNING MODAL */}
      {showTempWarning && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="icon">⚠️</div>
            <h2 style={{color: 'red'}}>Excessive Temperature</h2>
            <p>Internal temperature exceeded the 180°C safety threshold.</p>
            <button className="btn btn-danger" style={{width: '100%'}} onClick={() => setShowTempWarning(false)}>Acknowledge</button>
          </div>
        </div>
      )}

      {/* MECHANICAL JAM WARNING MODAL */}
      {showJamWarning && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="icon">⚙️</div>
            <h2 style={{color: 'red'}}>Mechanical Jam</h2>
            <p>Motor current exceeded 5.5A threshold. Emergency stop engaged.</p>
            <button className="btn btn-danger" style={{width: '100%'}} onClick={() => setShowJamWarning(false)}>Acknowledge</button>
          </div>
        </div>
      )}

      {/* SUCCESS MODAL */}
      {showSuccess && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="icon">✅</div>
            <h2 style={{color: 'green'}}>Conditioning Process Complete</h2>
            <p>Batch pH and moisture levels have successfully stabilized.</p>
            <button className="btn" style={{width: '100%'}} onClick={() => setShowSuccess(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

const root = createRoot(document.getElementById('root'));
root.render(<App />);