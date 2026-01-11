import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import 'express-async-errors';
import { connectDB } from './config/db';
import snapshotRoutes from './routes/snapshots';
import patientRoutes from './routes/patients';
import ehrRecordRoutes from './routes/ehrRecords';
import aiTaskRoutes from './routes/aiTasks';
import workerRoutes from './routes/worker';
import { errorHandler } from './middleware/errorHandler';

const app = express();
const PORT = process.env.PORT || 3000;

// CRITICAL: Increase payload limit for large DOMs
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// CORS for Chrome Extension
app.use(cors({
  origin: ['chrome-extension://*', 'http://localhost:*'],
  credentials: true
}));

// Routes
app.use('/api/snapshots', snapshotRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/ehr-records', ehrRecordRoutes);
app.use('/api/ai-tasks', aiTaskRoutes);
app.use('/api/worker', workerRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling
app.use(errorHandler);

// Start server
const start = async () => {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`🚀 API running on port ${PORT}`);
    });

    // Start AI task worker if enabled
    if (process.env.AI_WORKER_ENABLED !== 'false') {
      console.log('🤖 Starting AI task worker...');
      const { taskWorker } = await import('./services/taskWorker');
      await taskWorker.start();
    } else {
      console.log('⏸️  AI task worker disabled');
    }
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

if (require.main === module) {
  start();
}

export { app };
