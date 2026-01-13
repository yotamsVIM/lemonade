import { Router } from 'express';
import { Snapshot } from '../models/Snapshot';

const router = Router();

// Create snapshot
router.post('/', async (req, res) => {
  const { htmlBlob, sourceUrl, metadata } = req.body;

  if (!htmlBlob) {
    return res.status(400).json({ error: 'htmlBlob is required' });
  }

  const snapshot = await Snapshot.create({
    htmlBlob,
    sourceUrl,
    metadata,
    status: 'NEW',
    logs: [{
      phase: 'MINER',
      level: 'INFO',
      msg: 'Snapshot created',
      timestamp: new Date()
    }]
  });

  res.status(201).json({ id: snapshot._id, status: snapshot.status });
});

// Get snapshot by ID
router.get('/:id', async (req, res) => {
  const snapshot = await Snapshot.findById(req.params.id);

  if (!snapshot) {
    return res.status(404).json({ error: 'Snapshot not found' });
  }

  res.json(snapshot);
});

// Update snapshot (for Oracle/Forge)
router.patch('/:id', async (req, res) => {
  const snapshot = await Snapshot.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true, runValidators: true }
  );

  if (!snapshot) {
    return res.status(404).json({ error: 'Snapshot not found' });
  }

  res.json(snapshot);
});

// List snapshots (with status filter)
router.get('/', async (req, res) => {
  const { status } = req.query;
  const query = status ? { status } : {};

  const snapshots = await Snapshot.find(query).sort({ createdAt: -1 });
  res.json(snapshots);
});

// Get E2E pipeline status for a snapshot
router.get('/:id/pipeline-status', async (req, res) => {
  const snapshot = await Snapshot.findById(req.params.id);

  if (!snapshot) {
    return res.status(404).json({ error: 'Snapshot not found' });
  }

  // Build pipeline status based on snapshot status and data
  const status = snapshot.status;
  const pipelineStatus = {
    snapshotId: snapshot._id,
    stages: {
      capture: {
        status: 'completed',
        timestamp: snapshot.createdAt,
        data: {
          sourceUrl: snapshot.sourceUrl,
          size: snapshot.htmlBlob.length,
          metadata: snapshot.metadata
        }
      },
      oracle: {
        status: status === 'NEW' ? 'pending' : (snapshot.groundTruth ? 'completed' : 'processing'),
        timestamp: status !== 'NEW' ? snapshot.updatedAt : null,
        data: snapshot.groundTruth || null
      },
      forge: {
        status: status === 'VERIFIED' ? 'completed' : (status === 'ANNOTATED' || status === 'EXTRACTED' ? 'processing' : 'pending'),
        timestamp: (status === 'VERIFIED' || status === 'EXTRACTED') ? snapshot.updatedAt : null,
        data: snapshot.extractorCode ? {
          code: snapshot.extractorCode,
          verified: status === 'VERIFIED'
        } : null
      }
    },
    overallStatus: status,
    logs: snapshot.logs
  };

  res.json(pipelineStatus);
});

export default router;
