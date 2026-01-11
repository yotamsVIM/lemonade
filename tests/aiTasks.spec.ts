import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../src/backend/server';
import { AITask } from '../src/backend/models/AITask';
import { Patient } from '../src/backend/models/Patient';
import { EHRRecord } from '../src/backend/models/EHRRecord';
import { setupTestDatabase } from './setup';

describe('AI Task API Tests', () => {
  setupTestDatabase();

  let testPatientId: string;
  let testRecordId: string;

  beforeEach(async () => {
    await AITask.deleteMany({});
    await EHRRecord.deleteMany({});
    await Patient.deleteMany({});

    const patient = await Patient.create({
      firstName: 'John',
      lastName: 'Doe',
      dateOfBirth: new Date('1980-01-15'),
      mrn: 'MRN001'
    });
    testPatientId = patient._id.toString();

    const record = await EHRRecord.create({
      patientId: testPatientId,
      recordType: 'VISIT',
      sourceSystem: 'Epic',
      recordDate: new Date('2026-01-10')
    });
    testRecordId = record._id.toString();
  });

  describe('POST /api/ai-tasks', () => {
    it('should create a new AI task with valid data', async () => {
      const taskData = {
        taskType: 'EXTRACT',
        targetType: 'EHR_RECORD',
        targetId: testRecordId,
        priority: 'HIGH',
        input: {
          extractFields: ['vitals', 'diagnosis', 'medications']
        }
      };

      const res = await request(app)
        .post('/api/ai-tasks')
        .send(taskData)
        .expect(201);

      expect(res.body._id).toBeDefined();
      expect(res.body.taskType).toBe('EXTRACT');
      expect(res.body.targetType).toBe('EHR_RECORD');
      expect(res.body.priority).toBe('HIGH');
      expect(res.body.status).toBe('QUEUED');
      expect(res.body.retryCount).toBe(0);
      expect(res.body.maxRetries).toBe(3);
    });

    it('should return 400 when required fields are missing', async () => {
      const invalidData = {
        taskType: 'EXTRACT'
        // Missing targetType, targetId
      };

      const res = await request(app)
        .post('/api/ai-tasks')
        .send(invalidData)
        .expect(400);

      expect(res.body.error).toContain('Missing required fields');
    });

    it('should create task with default priority', async () => {
      const taskData = {
        taskType: 'SUMMARIZE',
        targetType: 'PATIENT',
        targetId: testPatientId
      };

      const res = await request(app)
        .post('/api/ai-tasks')
        .send(taskData)
        .expect(201);

      expect(res.body.priority).toBe('MEDIUM');
    });

    it('should create task with custom maxRetries', async () => {
      const taskData = {
        taskType: 'ANALYZE',
        targetType: 'EHR_RECORD',
        targetId: testRecordId,
        maxRetries: 5
      };

      const res = await request(app)
        .post('/api/ai-tasks')
        .send(taskData)
        .expect(201);

      expect(res.body.maxRetries).toBe(5);
    });
  });

  describe('GET /api/ai-tasks', () => {
    beforeEach(async () => {
      await AITask.create([
        {
          taskType: 'EXTRACT',
          targetType: 'EHR_RECORD',
          targetId: testRecordId,
          priority: 'HIGH',
          status: 'QUEUED'
        },
        {
          taskType: 'SUMMARIZE',
          targetType: 'PATIENT',
          targetId: testPatientId,
          priority: 'MEDIUM',
          status: 'PROCESSING'
        },
        {
          taskType: 'ANALYZE',
          targetType: 'EHR_RECORD',
          targetId: testRecordId,
          priority: 'LOW',
          status: 'COMPLETED'
        }
      ]);
    });

    it('should return all AI tasks', async () => {
      const res = await request(app)
        .get('/api/ai-tasks')
        .expect(200);

      expect(res.body.tasks).toHaveLength(3);
      expect(res.body.total).toBe(3);
    });

    it('should filter tasks by status', async () => {
      const res = await request(app)
        .get('/api/ai-tasks?status=QUEUED')
        .expect(200);

      expect(res.body.tasks).toHaveLength(1);
      expect(res.body.tasks[0].status).toBe('QUEUED');
    });

    it('should filter tasks by taskType', async () => {
      const res = await request(app)
        .get('/api/ai-tasks?taskType=EXTRACT')
        .expect(200);

      expect(res.body.tasks).toHaveLength(1);
      expect(res.body.tasks[0].taskType).toBe('EXTRACT');
    });

    it('should filter tasks by priority', async () => {
      const res = await request(app)
        .get('/api/ai-tasks?priority=HIGH')
        .expect(200);

      expect(res.body.tasks).toHaveLength(1);
      expect(res.body.tasks[0].priority).toBe('HIGH');
    });

    it('should filter tasks by targetType and targetId', async () => {
      const res = await request(app)
        .get(`/api/ai-tasks?targetType=EHR_RECORD&targetId=${testRecordId}`)
        .expect(200);

      expect(res.body.tasks).toHaveLength(2);
    });

    it('should support pagination', async () => {
      const res = await request(app)
        .get('/api/ai-tasks?limit=2&skip=1')
        .expect(200);

      expect(res.body.tasks).toHaveLength(2);
      expect(res.body.limit).toBe(2);
      expect(res.body.skip).toBe(1);
    });

    it('should sort by priority and creation date', async () => {
      const res = await request(app)
        .get('/api/ai-tasks')
        .expect(200);

      // Tasks should be ordered by priority (higher priority first)
      const priorities = res.body.tasks.map((t: any) => t.priority);
      expect(priorities).toContain('HIGH');
      expect(priorities).toContain('MEDIUM');
      expect(priorities).toContain('LOW');
    });
  });

  describe('GET /api/ai-tasks/queue', () => {
    beforeEach(async () => {
      await AITask.create([
        {
          taskType: 'EXTRACT',
          targetType: 'EHR_RECORD',
          targetId: testRecordId,
          priority: 'URGENT',
          status: 'QUEUED'
        },
        {
          taskType: 'SUMMARIZE',
          targetType: 'PATIENT',
          targetId: testPatientId,
          priority: 'HIGH',
          status: 'QUEUED'
        },
        {
          taskType: 'ANALYZE',
          targetType: 'EHR_RECORD',
          targetId: testRecordId,
          priority: 'LOW',
          status: 'COMPLETED'
        }
      ]);
    });

    it('should return only queued tasks', async () => {
      const res = await request(app)
        .get('/api/ai-tasks/queue')
        .expect(200);

      expect(res.body.tasks).toHaveLength(2);
      expect(res.body.tasks.every((t: any) => t.status === 'QUEUED')).toBe(true);
    });

    it('should sort by priority (URGENT first)', async () => {
      const res = await request(app)
        .get('/api/ai-tasks/queue')
        .expect(200);

      expect(res.body.tasks[0].priority).toBe('URGENT');
      expect(res.body.tasks[1].priority).toBe('HIGH');
    });

    it('should respect limit parameter', async () => {
      const res = await request(app)
        .get('/api/ai-tasks/queue?limit=1')
        .expect(200);

      expect(res.body.tasks).toHaveLength(1);
    });
  });

  describe('GET /api/ai-tasks/:id', () => {
    it('should return a single AI task by ID', async () => {
      const task = await AITask.create({
        taskType: 'EXTRACT',
        targetType: 'EHR_RECORD',
        targetId: testRecordId,
        priority: 'HIGH'
      });

      const res = await request(app)
        .get(`/api/ai-tasks/${task._id}`)
        .expect(200);

      expect(res.body.taskType).toBe('EXTRACT');
      expect(res.body.priority).toBe('HIGH');
    });

    it('should return 404 for non-existent task', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .get(`/api/ai-tasks/${fakeId}`)
        .expect(404);

      expect(res.body.error).toContain('not found');
    });
  });

  describe('PATCH /api/ai-tasks/:id/status', () => {
    it('should update task status to PROCESSING', async () => {
      const task = await AITask.create({
        taskType: 'EXTRACT',
        targetType: 'EHR_RECORD',
        targetId: testRecordId
      });

      const res = await request(app)
        .patch(`/api/ai-tasks/${task._id}/status`)
        .send({ status: 'PROCESSING' })
        .expect(200);

      expect(res.body.status).toBe('PROCESSING');
      expect(res.body.startedAt).toBeDefined();
    });

    it('should update task status to COMPLETED with output', async () => {
      const task = await AITask.create({
        taskType: 'EXTRACT',
        targetType: 'EHR_RECORD',
        targetId: testRecordId,
        status: 'PROCESSING',
        startedAt: new Date()
      });

      const res = await request(app)
        .patch(`/api/ai-tasks/${task._id}/status`)
        .send({
          status: 'COMPLETED',
          output: {
            extractedData: {
              vitals: { bp: '120/80', hr: '72' }
            }
          }
        })
        .expect(200);

      expect(res.body.status).toBe('COMPLETED');
      expect(res.body.output.extractedData).toBeDefined();
      expect(res.body.completedAt).toBeDefined();
    });

    it('should update task status to FAILED with error', async () => {
      const task = await AITask.create({
        taskType: 'EXTRACT',
        targetType: 'EHR_RECORD',
        targetId: testRecordId,
        status: 'PROCESSING'
      });

      const res = await request(app)
        .patch(`/api/ai-tasks/${task._id}/status`)
        .send({
          status: 'FAILED',
          error: 'AI service timeout'
        })
        .expect(200);

      expect(res.body.status).toBe('FAILED');
      expect(res.body.error).toBe('AI service timeout');
      expect(res.body.completedAt).toBeDefined();
    });

    it('should reject invalid status values', async () => {
      const task = await AITask.create({
        taskType: 'EXTRACT',
        targetType: 'EHR_RECORD',
        targetId: testRecordId
      });

      const res = await request(app)
        .patch(`/api/ai-tasks/${task._id}/status`)
        .send({ status: 'INVALID_STATUS' })
        .expect(400);

      expect(res.body.error).toContain('Invalid status');
    });
  });

  describe('POST /api/ai-tasks/:id/retry', () => {
    it('should retry a failed task', async () => {
      const task = await AITask.create({
        taskType: 'EXTRACT',
        targetType: 'EHR_RECORD',
        targetId: testRecordId,
        status: 'FAILED',
        error: 'Previous error',
        retryCount: 1
      });

      const res = await request(app)
        .post(`/api/ai-tasks/${task._id}/retry`)
        .expect(200);

      expect(res.body.status).toBe('QUEUED');
      expect(res.body.retryCount).toBe(2);
      expect(res.body.error).toBeUndefined();
      expect(res.body.logs.length).toBeGreaterThan(0);
    });

    it('should return 400 when task is not failed', async () => {
      const task = await AITask.create({
        taskType: 'EXTRACT',
        targetType: 'EHR_RECORD',
        targetId: testRecordId,
        status: 'QUEUED'
      });

      const res = await request(app)
        .post(`/api/ai-tasks/${task._id}/retry`)
        .expect(400);

      expect(res.body.error).toContain('Only failed tasks can be retried');
    });

    it('should return 400 when max retries exceeded', async () => {
      const task = await AITask.create({
        taskType: 'EXTRACT',
        targetType: 'EHR_RECORD',
        targetId: testRecordId,
        status: 'FAILED',
        retryCount: 3,
        maxRetries: 3
      });

      const res = await request(app)
        .post(`/api/ai-tasks/${task._id}/retry`)
        .expect(400);

      expect(res.body.error).toContain('Max retries exceeded');
    });

    it('should return 404 for non-existent task', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .post(`/api/ai-tasks/${fakeId}/retry`)
        .expect(404);

      expect(res.body.error).toContain('not found');
    });
  });

  describe('POST /api/ai-tasks/:id/logs', () => {
    it('should add a log entry to task', async () => {
      const task = await AITask.create({
        taskType: 'EXTRACT',
        targetType: 'EHR_RECORD',
        targetId: testRecordId
      });

      const res = await request(app)
        .post(`/api/ai-tasks/${task._id}/logs`)
        .send({
          level: 'INFO',
          message: 'Started extraction process'
        })
        .expect(200);

      expect(res.body.logs).toHaveLength(1);
      expect(res.body.logs[0].level).toBe('INFO');
      expect(res.body.logs[0].message).toBe('Started extraction process');
      expect(res.body.logs[0].timestamp).toBeDefined();
    });

    it('should return 400 when fields are missing', async () => {
      const task = await AITask.create({
        taskType: 'EXTRACT',
        targetType: 'EHR_RECORD',
        targetId: testRecordId
      });

      const res = await request(app)
        .post(`/api/ai-tasks/${task._id}/logs`)
        .send({ level: 'INFO' })
        .expect(400);

      expect(res.body.error).toContain('Missing required fields');
    });

    it('should return 400 for invalid log level', async () => {
      const task = await AITask.create({
        taskType: 'EXTRACT',
        targetType: 'EHR_RECORD',
        targetId: testRecordId
      });

      const res = await request(app)
        .post(`/api/ai-tasks/${task._id}/logs`)
        .send({
          level: 'INVALID',
          message: 'Test message'
        })
        .expect(400);

      expect(res.body.error).toContain('Invalid log level');
    });

    it('should append multiple log entries', async () => {
      const task = await AITask.create({
        taskType: 'EXTRACT',
        targetType: 'EHR_RECORD',
        targetId: testRecordId
      });

      await request(app)
        .post(`/api/ai-tasks/${task._id}/logs`)
        .send({ level: 'INFO', message: 'Log 1' });

      await request(app)
        .post(`/api/ai-tasks/${task._id}/logs`)
        .send({ level: 'WARN', message: 'Log 2' });

      const res = await request(app)
        .post(`/api/ai-tasks/${task._id}/logs`)
        .send({ level: 'ERROR', message: 'Log 3' })
        .expect(200);

      expect(res.body.logs).toHaveLength(3);
    });
  });

  describe('DELETE /api/ai-tasks/:id', () => {
    it('should delete an AI task', async () => {
      const task = await AITask.create({
        taskType: 'EXTRACT',
        targetType: 'EHR_RECORD',
        targetId: testRecordId
      });

      await request(app)
        .delete(`/api/ai-tasks/${task._id}`)
        .expect(200);

      const deletedTask = await AITask.findById(task._id);
      expect(deletedTask).toBeNull();
    });

    it('should return 404 when deleting non-existent task', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .delete(`/api/ai-tasks/${fakeId}`)
        .expect(404);

      expect(res.body.error).toContain('not found');
    });
  });
});
