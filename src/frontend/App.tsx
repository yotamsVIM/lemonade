import React, { useState } from 'react';
import PatientList from './components/PatientList';
import PatientForm from './components/PatientForm';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState<'patients' | 'records' | 'tasks'>('patients');
  const [showAddPatient, setShowAddPatient] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const handlePatientAdded = () => {
    setShowAddPatient(false);
    setRefreshKey(prev => prev + 1);
  };

  return (
    <div className="app">
      <header className="header">
        <h1>Lemonade EHR Integration Platform</h1>
        <p>Automated AI-Powered EHR Data Extraction</p>
      </header>

      <nav className="nav-tabs">
        <button
          className={activeTab === 'patients' ? 'active' : ''}
          onClick={() => setActiveTab('patients')}
        >
          Patients
        </button>
        <button
          className={activeTab === 'records' ? 'active' : ''}
          onClick={() => setActiveTab('records')}
        >
          EHR Records
        </button>
        <button
          className={activeTab === 'tasks' ? 'active' : ''}
          onClick={() => setActiveTab('tasks')}
        >
          AI Tasks
        </button>
      </nav>

      <main className="main-content">
        {activeTab === 'patients' && (
          <div className="patients-view">
            <div className="view-header">
              <h2>Patient Management</h2>
              <button
                className="btn btn-primary"
                onClick={() => setShowAddPatient(!showAddPatient)}
              >
                {showAddPatient ? 'Cancel' : 'Add Patient'}
              </button>
            </div>

            {showAddPatient && (
              <PatientForm onPatientAdded={handlePatientAdded} />
            )}

            <PatientList key={refreshKey} />
          </div>
        )}

        {activeTab === 'records' && (
          <div className="records-view">
            <h2>EHR Records</h2>
            <p>Coming soon...</p>
          </div>
        )}

        {activeTab === 'tasks' && (
          <div className="tasks-view">
            <h2>AI Processing Tasks</h2>
            <p>Coming soon...</p>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
