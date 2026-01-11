import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../src/backend/server';
import { EHRRecord } from '../src/backend/models/EHRRecord';
import { Patient } from '../src/backend/models/Patient';
import { setupTestDatabase } from './setup';

describe('EHR Record API Tests', () => {
  setupTestDatabase();

  let testPatientId: string;

  beforeEach(async () => {
    await EHRRecord.deleteMany({});
    await Patient.deleteMany({});

    const patient = await Patient.create({
      firstName: 'John',
      lastName: 'Doe',
      dateOfBirth: new Date('1980-01-15'),
      mrn: 'MRN001'
    });
    testPatientId = patient._id.toString();
  });

  describe('POST /api/ehr-records', () => {
    it('should create a new EHR record with valid data', async () => {
      const recordData = {
        patientId: testPatientId,
        recordType: 'VISIT',
        sourceSystem: 'Epic',
        recordDate: '2026-01-10',
        data: {
          raw: {
            visitType: 'Annual Physical',
            chiefComplaint: 'Routine checkup'
          }
        }
      };

      const res = await request(app)
        .post('/api/ehr-records')
        .send(recordData)
        .expect(201);

      expect(res.body._id).toBeDefined();
      expect(res.body.recordType).toBe('VISIT');
      expect(res.body.sourceSystem).toBe('Epic');
      expect(res.body.extractionStatus).toBe('PENDING');
      expect(res.body.patientId.mrn).toBe('MRN001');
    });

    it('should return 400 when required fields are missing', async () => {
      const invalidData = {
        recordType: 'VISIT'
        // Missing patientId, sourceSystem, recordDate
      };

      const res = await request(app)
        .post('/api/ehr-records')
        .send(invalidData)
        .expect(400);

      expect(res.body.error).toContain('Missing required fields');
    });

    it('should return 404 when patient does not exist', async () => {
      const fakePatientId = new mongoose.Types.ObjectId();
      const recordData = {
        patientId: fakePatientId,
        recordType: 'VISIT',
        sourceSystem: 'Epic',
        recordDate: '2026-01-10'
      };

      const res = await request(app)
        .post('/api/ehr-records')
        .send(recordData)
        .expect(404);

      expect(res.body.error).toContain('Patient not found');
    });

    it('should create record with metadata', async () => {
      const recordData = {
        patientId: testPatientId,
        recordType: 'LAB',
        sourceSystem: 'Cerner',
        recordDate: '2026-01-10',
        metadata: {
          providerId: 'DR001',
          facilityId: 'FAC001',
          orderType: 'Routine'
        }
      };

      const res = await request(app)
        .post('/api/ehr-records')
        .send(recordData)
        .expect(201);

      expect(res.body.metadata.providerId).toBe('DR001');
      expect(res.body.metadata.facilityId).toBe('FAC001');
    });
  });

  describe('GET /api/ehr-records', () => {
    beforeEach(async () => {
      const patient2 = await Patient.create({
        firstName: 'Jane',
        lastName: 'Smith',
        dateOfBirth: new Date('1990-05-20'),
        mrn: 'MRN002'
      });

      await EHRRecord.create([
        {
          patientId: testPatientId,
          recordType: 'VISIT',
          sourceSystem: 'Epic',
          recordDate: new Date('2026-01-10'),
          extractionStatus: 'COMPLETED'
        },
        {
          patientId: testPatientId,
          recordType: 'LAB',
          sourceSystem: 'Epic',
          recordDate: new Date('2026-01-08'),
          extractionStatus: 'PENDING'
        },
        {
          patientId: patient2._id,
          recordType: 'VISIT',
          sourceSystem: 'Cerner',
          recordDate: new Date('2026-01-05'),
          extractionStatus: 'COMPLETED'
        }
      ]);
    });

    it('should return all EHR records', async () => {
      const res = await request(app)
        .get('/api/ehr-records')
        .expect(200);

      expect(res.body.records).toHaveLength(3);
      expect(res.body.total).toBe(3);
    });

    it('should filter records by patientId', async () => {
      const res = await request(app)
        .get(`/api/ehr-records?patientId=${testPatientId}`)
        .expect(200);

      expect(res.body.records).toHaveLength(2);
      expect(res.body.records.every((r: any) => r.patientId._id === testPatientId)).toBe(true);
    });

    it('should filter records by recordType', async () => {
      const res = await request(app)
        .get('/api/ehr-records?recordType=VISIT')
        .expect(200);

      expect(res.body.records).toHaveLength(2);
      expect(res.body.records.every((r: any) => r.recordType === 'VISIT')).toBe(true);
    });

    it('should filter records by extractionStatus', async () => {
      const res = await request(app)
        .get('/api/ehr-records?extractionStatus=COMPLETED')
        .expect(200);

      expect(res.body.records).toHaveLength(2);
      expect(res.body.records.every((r: any) => r.extractionStatus === 'COMPLETED')).toBe(true);
    });

    it('should filter records by date range', async () => {
      const res = await request(app)
        .get('/api/ehr-records?startDate=2026-01-08&endDate=2026-01-10')
        .expect(200);

      expect(res.body.records).toHaveLength(2);
    });

    it('should support pagination', async () => {
      const res = await request(app)
        .get('/api/ehr-records?limit=2&skip=1')
        .expect(200);

      expect(res.body.records).toHaveLength(2);
      expect(res.body.limit).toBe(2);
      expect(res.body.skip).toBe(1);
    });
  });

  describe('GET /api/ehr-records/:id', () => {
    it('should return a single EHR record by ID', async () => {
      const record = await EHRRecord.create({
        patientId: testPatientId,
        recordType: 'VISIT',
        sourceSystem: 'Epic',
        recordDate: new Date('2026-01-10')
      });

      const res = await request(app)
        .get(`/api/ehr-records/${record._id}`)
        .expect(200);

      expect(res.body.recordType).toBe('VISIT');
      expect(res.body.sourceSystem).toBe('Epic');
      expect(res.body.patientId.mrn).toBe('MRN001');
    });

    it('should return 404 for non-existent record', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .get(`/api/ehr-records/${fakeId}`)
        .expect(404);

      expect(res.body.error).toContain('not found');
    });
  });

  describe('GET /api/ehr-records/patient/:patientId', () => {
    beforeEach(async () => {
      await EHRRecord.create([
        {
          patientId: testPatientId,
          recordType: 'VISIT',
          sourceSystem: 'Epic',
          recordDate: new Date('2026-01-10')
        },
        {
          patientId: testPatientId,
          recordType: 'LAB',
          sourceSystem: 'Epic',
          recordDate: new Date('2026-01-08')
        }
      ]);
    });

    it('should return all records for a patient', async () => {
      const res = await request(app)
        .get(`/api/ehr-records/patient/${testPatientId}`)
        .expect(200);

      expect(res.body.records).toHaveLength(2);
      expect(res.body.total).toBe(2);
    });

    it('should filter by recordType', async () => {
      const res = await request(app)
        .get(`/api/ehr-records/patient/${testPatientId}?recordType=LAB`)
        .expect(200);

      expect(res.body.records).toHaveLength(1);
      expect(res.body.records[0].recordType).toBe('LAB');
    });
  });

  describe('PUT /api/ehr-records/:id', () => {
    it('should update EHR record', async () => {
      const record = await EHRRecord.create({
        patientId: testPatientId,
        recordType: 'VISIT',
        sourceSystem: 'Epic',
        recordDate: new Date('2026-01-10')
      });

      const res = await request(app)
        .put(`/api/ehr-records/${record._id}`)
        .send({
          data: {
            structured: {
              diagnosis: 'Hypertension',
              medications: ['Lisinopril']
            }
          }
        })
        .expect(200);

      expect(res.body.data.structured.diagnosis).toBe('Hypertension');
    });
  });

  describe('PATCH /api/ehr-records/:id/status', () => {
    it('should update extraction status', async () => {
      const record = await EHRRecord.create({
        patientId: testPatientId,
        recordType: 'VISIT',
        sourceSystem: 'Epic',
        recordDate: new Date('2026-01-10')
      });

      const res = await request(app)
        .patch(`/api/ehr-records/${record._id}/status`)
        .send({ extractionStatus: 'PROCESSING' })
        .expect(200);

      expect(res.body.extractionStatus).toBe('PROCESSING');
    });

    it('should update status with error message', async () => {
      const record = await EHRRecord.create({
        patientId: testPatientId,
        recordType: 'VISIT',
        sourceSystem: 'Epic',
        recordDate: new Date('2026-01-10')
      });

      const res = await request(app)
        .patch(`/api/ehr-records/${record._id}/status`)
        .send({
          extractionStatus: 'FAILED',
          extractionError: 'AI processing timeout'
        })
        .expect(200);

      expect(res.body.extractionStatus).toBe('FAILED');
      expect(res.body.extractionError).toBe('AI processing timeout');
    });

    it('should reject invalid extraction status', async () => {
      const record = await EHRRecord.create({
        patientId: testPatientId,
        recordType: 'VISIT',
        sourceSystem: 'Epic',
        recordDate: new Date('2026-01-10')
      });

      const res = await request(app)
        .patch(`/api/ehr-records/${record._id}/status`)
        .send({ extractionStatus: 'INVALID_STATUS' })
        .expect(400);

      expect(res.body.error).toContain('Invalid extraction status');
    });
  });

  describe('DELETE /api/ehr-records/:id', () => {
    it('should delete an EHR record', async () => {
      const record = await EHRRecord.create({
        patientId: testPatientId,
        recordType: 'VISIT',
        sourceSystem: 'Epic',
        recordDate: new Date('2026-01-10')
      });

      await request(app)
        .delete(`/api/ehr-records/${record._id}`)
        .expect(200);

      const deletedRecord = await EHRRecord.findById(record._id);
      expect(deletedRecord).toBeNull();
    });

    it('should return 404 when deleting non-existent record', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .delete(`/api/ehr-records/${fakeId}`)
        .expect(404);

      expect(res.body.error).toContain('not found');
    });
  });
});
