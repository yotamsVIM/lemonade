/**
 * Phase 4: The Forge - Code Generation and Validation Tests
 *
 * Tests the complete code generation pipeline:
 * - Runtime library (EHR_UTILS)
 * - Code generator (Claude Bedrock)
 * - Gauntlet validation harness
 * - Retry loop and error handling
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Snapshot } from '../src/backend/models/Snapshot';
import { processAnnotatedSnapshot } from '../src/forge';
import { codeGenerator } from '../src/forge/code-generator';
import { gauntlet } from '../src/forge/gauntlet';

describe('Phase 4: The Forge - Integration Tests', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);

    // Initialize Gauntlet browser
    await gauntlet.initialize();
  });

  afterAll(async () => {
    await gauntlet.cleanup();
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clear database between tests
    await Snapshot.deleteMany({});
  });

  describe('Gauntlet - Validation Harness', () => {
    it('should execute valid extraction code successfully', async () => {
      const htmlBlob = `
        <html>
          <body>
            <div class="patient-name">John Doe</div>
            <div class="dob">01/15/1980</div>
          </body>
        </html>
      `;

      const extractorCode = `
        function extract() {
          const nameEl = document.querySelector('.patient-name');
          const dobEl = document.querySelector('.dob');

          return {
            patientName: nameEl ? nameEl.textContent.trim() : null,
            dateOfBirth: dobEl ? dobEl.textContent.trim() : null
          };
        }
      `;

      const result = await gauntlet.run(htmlBlob, extractorCode);

      expect(result.success).toBe(true);
      expect(result.extractedData).toEqual({
        patientName: 'John Doe',
        dateOfBirth: '01/15/1980'
      });
      expect(result.executionTime).toBeGreaterThan(0);
    });

    it('should catch syntax errors in extraction code', async () => {
      const htmlBlob = '<html><body></body></html>';
      const invalidCode = `
        function extract() {
          return { invalid syntax here }
        }
      `;

      const result = await gauntlet.run(htmlBlob, invalidCode);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Unexpected');
    });

    it('should catch runtime errors in extraction code', async () => {
      const htmlBlob = '<html><body></body></html>';
      const faultyCode = `
        function extract() {
          throw new Error('Intentional error');
        }
      `;

      const result = await gauntlet.run(htmlBlob, faultyCode);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Intentional error');
    });

    it('should validate against ground truth', async () => {
      const htmlBlob = `
        <html>
          <body>
            <div class="patient-name">John Doe</div>
          </body>
        </html>
      `;

      const extractorCode = `
        function extract() {
          return {
            patientName: document.querySelector('.patient-name')?.textContent?.trim() || null
          };
        }
      `;

      const groundTruth = { patientName: 'John Doe' };

      const result = await gauntlet.run(htmlBlob, extractorCode, groundTruth);

      expect(result.success).toBe(true);
      expect(result.extractedData).toEqual(groundTruth);
    });

    it('should fail validation if extracted data does not match ground truth', async () => {
      const htmlBlob = `<html><body><div class="name">Wrong Name</div></body></html>`;

      const extractorCode = `
        function extract() {
          return {
            patientName: document.querySelector('.name')?.textContent?.trim() || null
          };
        }
      `;

      const groundTruth = { patientName: 'John Doe' };

      const result = await gauntlet.run(htmlBlob, extractorCode, groundTruth);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Validation failed');
      expect(result.error).toContain('patientName');
    });
  });

  describe('Forge Orchestrator - Retry Logic', () => {
    it('should process ANNOTATED snapshot successfully on first try', async () => {
      // Create an ANNOTATED snapshot
      const snapshot = await Snapshot.create({
        htmlBlob: '<html><body><div id="patient-name">Alice Smith</div></body></html>',
        groundTruth: { patientName: 'Alice Smith' },
        status: 'ANNOTATED'
      });

      // Mock the code generator to return valid code
      vi.spyOn(codeGenerator, 'generateExtractor').mockResolvedValue(`
        function extract() {
          const el = document.querySelector('#patient-name');
          return {
            patientName: el ? el.textContent.trim() : null
          };
        }
      `);

      // Process the snapshot
      const processed = await processAnnotatedSnapshot({ maxRetries: 3 });

      expect(processed).toBe(true);

      // Verify database state
      const updated = await Snapshot.findById(snapshot._id);
      expect(updated?.status).toBe('VERIFIED');
      expect(updated?.extractorCode).toBeDefined();
      expect(updated?.logs.some(log => log.phase === 'FORGE' && log.level === 'INFO')).toBe(true);
      expect(updated?.logs.some(log => log.msg.includes('verified'))).toBe(true);
    });

    it('should retry and eventually succeed after failures', async () => {
      const snapshot = await Snapshot.create({
        htmlBlob: '<html><body><div id="patient">Bob Johnson</div></body></html>',
        groundTruth: { patientName: 'Bob Johnson' },
        status: 'ANNOTATED'
      });

      let callCount = 0;

      // Mock generator to fail twice, then succeed
      vi.spyOn(codeGenerator, 'generateExtractor').mockImplementation(async () => {
        callCount++;

        if (callCount === 1) {
          // First attempt: wrong selector
          return `
            function extract() {
              return { patientName: document.querySelector('#wrong-id')?.textContent || null };
            }
          `;
        }

        if (callCount === 2) {
          // Second attempt: syntax error
          return `
            function extract() {
              return { patientName invalid syntax };
            }
          `;
        }

        // Third attempt: correct
        return `
          function extract() {
            return { patientName: document.querySelector('#patient')?.textContent?.trim() || null };
          }
        `;
      });

      const processed = await processAnnotatedSnapshot({ maxRetries: 3 });

      expect(processed).toBe(true);
      expect(callCount).toBe(3);

      const updated = await Snapshot.findById(snapshot._id);
      expect(updated?.status).toBe('VERIFIED');
      expect(updated?.logs.filter(log => log.level === 'WARN').length).toBe(2); // 2 failures
      expect(updated?.logs.some(log => log.msg.includes('verified'))).toBe(true);
    });

    it('should mark as EXTRACTED after max retries exhausted', async () => {
      const snapshot = await Snapshot.create({
        htmlBlob: '<html><body></body></html>',
        groundTruth: { patientName: 'Test' },
        status: 'ANNOTATED'
      });

      // Mock generator to always return invalid code
      vi.spyOn(codeGenerator, 'generateExtractor').mockResolvedValue(`
        function extract() {
          throw new Error('Always fails');
        }
      `);

      const processed = await processAnnotatedSnapshot({ maxRetries: 2 });

      expect(processed).toBe(true);

      const updated = await Snapshot.findById(snapshot._id);
      expect(updated?.status).toBe('EXTRACTED'); // Failed, but code exists
      expect(updated?.logs.some(log => log.level === 'ERROR' && log.msg.includes('Failed after'))).toBe(true);
    });

    it('should return false if no ANNOTATED snapshots exist', async () => {
      const processed = await processAnnotatedSnapshot();
      expect(processed).toBe(false);
    });

    it('should handle missing ground truth gracefully', async () => {
      const snapshot = await Snapshot.create({
        htmlBlob: '<html><body></body></html>',
        status: 'ANNOTATED'
        // No groundTruth
      });

      const processed = await processAnnotatedSnapshot();

      expect(processed).toBe(true);

      const updated = await Snapshot.findById(snapshot._id);
      expect(updated?.status).toBe('EXTRACTED');
      expect(updated?.logs.some(log => log.msg.includes('No ground truth'))).toBe(true);
    });
  });

  describe('Code Generator - Syntax Validation', () => {
    it('should validate correct JavaScript syntax', () => {
      const validCode = `
        function extract() {
          return { patientName: 'Test' };
        }
      `;

      const result = codeGenerator.validateSyntax(validCode);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should detect syntax errors', () => {
      const invalidCode = `
        function extract() {
          return { invalid syntax
        }
      `;

      const result = codeGenerator.validateSyntax(invalidCode);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
