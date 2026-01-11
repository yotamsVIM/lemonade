import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { app } from '../src/backend/server';

describe('Phase 1: Backend Integration Tests', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    // Spin up in-memory MongoDB
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it('should handle 10MB+ HTML blob without truncation', async () => {
    // Generate a 10MB dummy string (simulating bloated EHR page)
    const chunkSize = 1024; // 1KB
    const totalSize = 10 * 1024 * 1024; // 10MB
    const iterations = Math.ceil(totalSize / chunkSize);

    let dummyHTML = '<html><body>';
    for (let i = 0; i < iterations; i++) {
      dummyHTML += `<div id="test-${i}">${'x'.repeat(chunkSize - 30)}</div>`;
    }
    dummyHTML += '</body></html>';

    const originalSize = Buffer.byteLength(dummyHTML, 'utf8');
    console.log(`Generated test HTML: ${(originalSize / 1024 / 1024).toFixed(2)}MB`);

    // POST to API
    const createRes = await request(app)
      .post('/api/snapshots')
      .send({ htmlBlob: dummyHTML })
      .expect(201);

    const { id } = createRes.body;
    expect(id).toBeDefined();

    // Fetch it back
    const getRes = await request(app)
      .get(`/api/snapshots/${id}`)
      .expect(200);

    // CRITICAL ASSERTION: No truncation occurred
    expect(getRes.body.htmlBlob).toBe(dummyHTML);
    expect(Buffer.byteLength(getRes.body.htmlBlob, 'utf8')).toBe(originalSize);
    expect(getRes.body.status).toBe('NEW');
  });

  it('should return 400 if htmlBlob is missing', async () => {
    await request(app)
      .post('/api/snapshots')
      .send({})
      .expect(400);
  });

  it('should filter snapshots by status', async () => {
    // Create snapshots with different statuses
    const snap1 = await request(app)
      .post('/api/snapshots')
      .send({ htmlBlob: '<div>test1</div>' });

    await request(app)
      .patch(`/api/snapshots/${snap1.body.id}`)
      .send({ status: 'ANNOTATED' });

    const snap2 = await request(app)
      .post('/api/snapshots')
      .send({ htmlBlob: '<div>test2</div>' });

    // Query for NEW status
    const newSnaps = await request(app)
      .get('/api/snapshots?status=NEW')
      .expect(200);

    expect(newSnaps.body.length).toBeGreaterThanOrEqual(1);
    expect(newSnaps.body.every((s: any) => s.status === 'NEW')).toBe(true);
  });
});
