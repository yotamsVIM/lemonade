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

export default router;
