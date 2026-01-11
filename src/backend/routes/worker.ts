import { Router, Request, Response } from 'express';
import { taskWorker } from '../services/taskWorker';

const router = Router();

// GET /api/worker/status - Get worker status
router.get('/status', (req: Request, res: Response) => {
  const status = taskWorker.getStatus();
  res.json(status);
});

// POST /api/worker/start - Start the worker
router.post('/start', async (req: Request, res: Response) => {
  try {
    await taskWorker.start();
    res.json({ message: 'Worker started', status: taskWorker.getStatus() });
  } catch (error) {
    res.status(500).json({ error: 'Failed to start worker' });
  }
});

// POST /api/worker/stop - Stop the worker
router.post('/stop', (req: Request, res: Response) => {
  taskWorker.stop();
  res.json({ message: 'Worker stopped', status: taskWorker.getStatus() });
});

export default router;
