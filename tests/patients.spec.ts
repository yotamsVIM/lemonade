import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../src/backend/server';
import { Patient } from '../src/backend/models/Patient';
import { setupTestDatabase } from './setup';

describe('Patient API Tests', () => {
  setupTestDatabase();

  beforeEach(async () => {
    await Patient.deleteMany({});
  });

  describe('POST /api/patients', () => {
    it('should create a new patient with valid data', async () => {
      const patientData = {
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: '1980-01-15',
        mrn: 'MRN001',
        email: 'john.doe@example.com',
        phone: '+1-555-0100'
      };

      const res = await request(app)
        .post('/api/patients')
        .send(patientData)
        .expect(201);

      expect(res.body._id).toBeDefined();
      expect(res.body.firstName).toBe('John');
      expect(res.body.lastName).toBe('Doe');
      expect(res.body.mrn).toBe('MRN001');
      expect(res.body.status).toBe('ACTIVE');
    });

    it('should return 400 when required fields are missing', async () => {
      const invalidData = {
        firstName: 'John'
        // Missing lastName, dateOfBirth, mrn
      };

      const res = await request(app)
        .post('/api/patients')
        .send(invalidData)
        .expect(400);

      expect(res.body.error).toContain('Missing required fields');
    });

    it('should return 409 when MRN already exists', async () => {
      const patientData = {
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: '1980-01-15',
        mrn: 'MRN001'
      };

      await request(app)
        .post('/api/patients')
        .send(patientData)
        .expect(201);

      const res = await request(app)
        .post('/api/patients')
        .send({
          ...patientData,
          firstName: 'Jane'
        })
        .expect(409);

      expect(res.body.error).toContain('MRN already exists');
    });

    it('should create patient with optional fields', async () => {
      const patientData = {
        firstName: 'Jane',
        lastName: 'Smith',
        dateOfBirth: '1990-05-20',
        mrn: 'MRN002',
        email: 'jane.smith@example.com',
        phone: '+1-555-0200',
        address: {
          street: '123 Main St',
          city: 'Boston',
          state: 'MA',
          zipCode: '02101'
        },
        insurance: {
          provider: 'BlueCross',
          policyNumber: 'BC123456'
        }
      };

      const res = await request(app)
        .post('/api/patients')
        .send(patientData)
        .expect(201);

      expect(res.body.address.city).toBe('Boston');
      expect(res.body.insurance.provider).toBe('BlueCross');
    });
  });

  describe('GET /api/patients', () => {
    beforeEach(async () => {
      await Patient.create([
        {
          firstName: 'John',
          lastName: 'Doe',
          dateOfBirth: new Date('1980-01-15'),
          mrn: 'MRN001',
          email: 'john.doe@example.com'
        },
        {
          firstName: 'Jane',
          lastName: 'Smith',
          dateOfBirth: new Date('1990-05-20'),
          mrn: 'MRN002',
          status: 'INACTIVE'
        },
        {
          firstName: 'Bob',
          lastName: 'Johnson',
          dateOfBirth: new Date('1975-12-10'),
          mrn: 'MRN003'
        }
      ]);
    });

    it('should return all patients', async () => {
      const res = await request(app)
        .get('/api/patients')
        .expect(200);

      expect(res.body.patients).toHaveLength(3);
      expect(res.body.total).toBe(3);
    });

    it('should filter patients by status', async () => {
      const res = await request(app)
        .get('/api/patients?status=INACTIVE')
        .expect(200);

      expect(res.body.patients).toHaveLength(1);
      expect(res.body.patients[0].mrn).toBe('MRN002');
    });

    it('should search patients by name', async () => {
      const res = await request(app)
        .get('/api/patients?search=Jane')
        .expect(200);

      expect(res.body.patients).toHaveLength(1);
      expect(res.body.patients[0].firstName).toBe('Jane');
    });

    it('should search patients by MRN', async () => {
      const res = await request(app)
        .get('/api/patients?search=MRN003')
        .expect(200);

      expect(res.body.patients).toHaveLength(1);
      expect(res.body.patients[0].lastName).toBe('Johnson');
    });

    it('should support pagination', async () => {
      const res = await request(app)
        .get('/api/patients?limit=2&skip=1')
        .expect(200);

      expect(res.body.patients).toHaveLength(2);
      expect(res.body.limit).toBe(2);
      expect(res.body.skip).toBe(1);
    });
  });

  describe('GET /api/patients/:id', () => {
    it('should return a single patient by ID', async () => {
      const patient = await Patient.create({
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: new Date('1980-01-15'),
        mrn: 'MRN001'
      });

      const res = await request(app)
        .get(`/api/patients/${patient._id}`)
        .expect(200);

      expect(res.body.mrn).toBe('MRN001');
      expect(res.body.firstName).toBe('John');
    });

    it('should return 404 for non-existent patient', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .get(`/api/patients/${fakeId}`)
        .expect(404);

      expect(res.body.error).toContain('not found');
    });
  });

  describe('PUT /api/patients/:id', () => {
    it('should update patient information', async () => {
      const patient = await Patient.create({
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: new Date('1980-01-15'),
        mrn: 'MRN001'
      });

      const res = await request(app)
        .put(`/api/patients/${patient._id}`)
        .send({
          email: 'john.updated@example.com',
          phone: '+1-555-9999'
        })
        .expect(200);

      expect(res.body.email).toBe('john.updated@example.com');
      expect(res.body.phone).toBe('+1-555-9999');
      expect(res.body.firstName).toBe('John');
    });

    it('should not allow updating to duplicate MRN', async () => {
      await Patient.create([
        {
          firstName: 'John',
          lastName: 'Doe',
          dateOfBirth: new Date('1980-01-15'),
          mrn: 'MRN001'
        },
        {
          firstName: 'Jane',
          lastName: 'Smith',
          dateOfBirth: new Date('1990-05-20'),
          mrn: 'MRN002'
        }
      ]);

      const jane = await Patient.findOne({ mrn: 'MRN002' });

      const res = await request(app)
        .put(`/api/patients/${jane!._id}`)
        .send({ mrn: 'MRN001' })
        .expect(409);

      expect(res.body.error).toContain('MRN already exists');
    });
  });

  describe('PATCH /api/patients/:id/status', () => {
    it('should update patient status', async () => {
      const patient = await Patient.create({
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: new Date('1980-01-15'),
        mrn: 'MRN001'
      });

      const res = await request(app)
        .patch(`/api/patients/${patient._id}/status`)
        .send({ status: 'INACTIVE' })
        .expect(200);

      expect(res.body.status).toBe('INACTIVE');
    });

    it('should reject invalid status values', async () => {
      const patient = await Patient.create({
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: new Date('1980-01-15'),
        mrn: 'MRN001'
      });

      const res = await request(app)
        .patch(`/api/patients/${patient._id}/status`)
        .send({ status: 'INVALID_STATUS' })
        .expect(400);

      expect(res.body.error).toContain('Invalid status');
    });
  });

  describe('DELETE /api/patients/:id', () => {
    it('should delete a patient', async () => {
      const patient = await Patient.create({
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: new Date('1980-01-15'),
        mrn: 'MRN001'
      });

      await request(app)
        .delete(`/api/patients/${patient._id}`)
        .expect(200);

      const deletedPatient = await Patient.findById(patient._id);
      expect(deletedPatient).toBeNull();
    });

    it('should return 404 when deleting non-existent patient', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .delete(`/api/patients/${fakeId}`)
        .expect(404);

      expect(res.body.error).toContain('not found');
    });
  });
});
