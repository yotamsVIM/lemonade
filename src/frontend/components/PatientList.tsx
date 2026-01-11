import React, { useState, useEffect } from 'react';

interface Patient {
  _id: string;
  firstName: string;
  lastName: string;
  mrn: string;
  dateOfBirth: string;
  email?: string;
  phone?: string;
  status: string;
}

const PatientList: React.FC = () => {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchPatients();
  }, []);

  const fetchPatients = async () => {
    try {
      setLoading(true);
      const response = await fetch('http://localhost:3000/api/patients');
      if (!response.ok) {
        throw new Error('Failed to fetch patients');
      }
      const data = await response.json();
      setPatients(data.patients || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const filteredPatients = patients.filter(patient =>
    searchTerm === '' ||
    patient.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    patient.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    patient.mrn.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  if (loading) {
    return <div className="loading">Loading patients...</div>;
  }

  if (error) {
    return (
      <div className="error">
        <p>Error: {error}</p>
        <button onClick={fetchPatients}>Retry</button>
      </div>
    );
  }

  return (
    <div className="patient-list">
      <div className="search-box">
        <input
          type="text"
          placeholder="Search by name or MRN..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {filteredPatients.length === 0 ? (
        <p className="no-data">No patients found</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>MRN</th>
              <th>Name</th>
              <th>Date of Birth</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredPatients.map((patient) => (
              <tr key={patient._id}>
                <td className="mrn">{patient.mrn}</td>
                <td className="name">{patient.lastName}, {patient.firstName}</td>
                <td>{formatDate(patient.dateOfBirth)}</td>
                <td>{patient.email || '-'}</td>
                <td>{patient.phone || '-'}</td>
                <td>
                  <span className={`status-badge status-${patient.status.toLowerCase()}`}>
                    {patient.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default PatientList;
