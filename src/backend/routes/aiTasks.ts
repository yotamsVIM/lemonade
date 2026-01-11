import { Router, Request, Response } from 'express';
import { AITask } from '../models/AITask';

const router = Router();

// GET /api/ai-tasks - List AI tasks
router.get('/', async (req: Request, res: Response) => {
  const {
    status,
    taskType,
    priority,
    targetType,
    targetId,
    limit = 50,
    skip = 0
  } = req.query;

  const query: any = {};

  if (status) {
    query.status = status;
  }
  if (taskType) {
    query.taskType = taskType;
  }
  if (priority) {
    query.priority = priority;
  }
  if (targetType) {
    query.targetType = targetType;
  }
  if (targetId) {
    query.targetId = targetId;
  }

  const tasks = await AITask.find(query)
    .limit(Number(limit))
    .skip(Number(skip))
    .sort({ priority: -1, createdAt: 1 });

  const total = await AITask.countDocuments(query);

  res.json({
    tasks,
    total,
    limit: Number(limit),
    skip: Number(skip)
  });
});

// GET /api/ai-tasks/queue - Get pending tasks (for task processor)
router.get('/queue', async (req: Request, res: Response) => {
  const { limit = 10 } = req.query;

  const tasks = await AITask.find({
    status: 'QUEUED'
  })
    .limit(Number(limit))
    .sort({ priority: -1, createdAt: 1 });

  res.json({ tasks, count: tasks.length });
});

// GET /api/ai-tasks/:id - Get single AI task
router.get('/:id', async (req: Request, res: Response) => {
  const task = await AITask.findById(req.params.id);

  if (!task) {
    return res.status(404).json({ error: 'AI task not found' });
  }

  res.json(task);
});

// POST /api/ai-tasks - Create new AI task
router.post('/', async (req: Request, res: Response) => {
  const {
    taskType,
    targetType,
    targetId,
    priority,
    input,
    aiModel,
    maxRetries
  } = req.body;

  if (!taskType || !targetType || !targetId) {
    return res.status(400).json({
      error: 'Missing required fields: taskType, targetType, targetId'
    });
  }

  const task = new AITask({
    taskType,
    targetType,
    targetId,
    priority: priority || 'MEDIUM',
    input,
    aiModel,
    maxRetries: maxRetries || 3
  });

  await task.save();
  res.status(201).json(task);
});

// PATCH /api/ai-tasks/:id/status - Update task status
router.patch('/:id/status', async (req: Request, res: Response) => {
  const { status, error, output } = req.body;

  if (!['QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status value' });
  }

  const updateData: any = { status };

  if (status === 'PROCESSING' && !req.body.startedAt) {
    updateData.startedAt = new Date();
  }

  if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(status)) {
    updateData.completedAt = new Date();

    if (updateData.startedAt) {
      updateData.processingTime = updateData.completedAt.getTime() - new Date(updateData.startedAt).getTime();
    }
  }

  if (error) {
    updateData.error = error;
  }

  if (output) {
    updateData.output = output;
  }

  const task = await AITask.findByIdAndUpdate(
    req.params.id,
    updateData,
    { new: true }
  );

  if (!task) {
    return res.status(404).json({ error: 'AI task not found' });
  }

  res.json(task);
});

// POST /api/ai-tasks/:id/retry - Retry a failed task
router.post('/:id/retry', async (req: Request, res: Response) => {
  const task = await AITask.findById(req.params.id);

  if (!task) {
    return res.status(404).json({ error: 'AI task not found' });
  }

  if (task.status !== 'FAILED') {
    return res.status(400).json({ error: 'Only failed tasks can be retried' });
  }

  if (task.retryCount >= task.maxRetries) {
    return res.status(400).json({ error: 'Max retries exceeded' });
  }

  task.status = 'QUEUED';
  task.retryCount += 1;
  task.error = undefined;
  task.logs.push({
    timestamp: new Date(),
    level: 'INFO',
    message: `Task retried (attempt ${task.retryCount + 1}/${task.maxRetries})`
  });

  await task.save();
  res.json(task);
});

// POST /api/ai-tasks/:id/logs - Add log entry
router.post('/:id/logs', async (req: Request, res: Response) => {
  const { level, message } = req.body;

  if (!level || !message) {
    return res.status(400).json({ error: 'Missing required fields: level, message' });
  }

  if (!['INFO', 'WARN', 'ERROR'].includes(level)) {
    return res.status(400).json({ error: 'Invalid log level' });
  }

  const task = await AITask.findByIdAndUpdate(
    req.params.id,
    {
      $push: {
        logs: {
          timestamp: new Date(),
          level,
          message
        }
      }
    },
    { new: true }
  );

  if (!task) {
    return res.status(404).json({ error: 'AI task not found' });
  }

  res.json(task);
});

// DELETE /api/ai-tasks/:id - Delete AI task
router.delete('/:id', async (req: Request, res: Response) => {
  const task = await AITask.findByIdAndDelete(req.params.id);

  if (!task) {
    return res.status(404).json({ error: 'AI task not found' });
  }

  res.json({ message: 'AI task deleted successfully', task });
});

export default router;
