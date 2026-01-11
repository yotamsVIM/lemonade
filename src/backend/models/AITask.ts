import mongoose, { Schema, Document } from 'mongoose';

export interface IAITask extends Document {
  taskType: 'EXTRACT' | 'SUMMARIZE' | 'ANALYZE' | 'CLASSIFY' | 'VERIFY';
  targetType: 'SNAPSHOT' | 'EHR_RECORD' | 'PATIENT';
  targetId: mongoose.Types.ObjectId;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  input?: any;
  output?: any;
  error?: string;
  retryCount: number;
  maxRetries: number;
  processingTime?: number; // in milliseconds
  aiModel?: string; // e.g., "gemini-pro", "gpt-4"
  logs: {
    timestamp: Date;
    level: 'INFO' | 'WARN' | 'ERROR';
    message: string;
  }[];
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

const AITaskSchema = new Schema<IAITask>(
  {
    taskType: {
      type: String,
      enum: ['EXTRACT', 'SUMMARIZE', 'ANALYZE', 'CLASSIFY', 'VERIFY'],
      required: true
    },
    targetType: {
      type: String,
      enum: ['SNAPSHOT', 'EHR_RECORD', 'PATIENT'],
      required: true
    },
    targetId: {
      type: Schema.Types.ObjectId,
      required: true,
      refPath: 'targetType' // Dynamic reference based on targetType
    },
    priority: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
      default: 'MEDIUM'
    },
    status: {
      type: String,
      enum: ['QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'],
      default: 'QUEUED',
      index: true
    },
    input: Schema.Types.Mixed,
    output: Schema.Types.Mixed,
    error: String,
    retryCount: {
      type: Number,
      default: 0
    },
    maxRetries: {
      type: Number,
      default: 3
    },
    processingTime: Number,
    aiModel: String,
    logs: [{
      timestamp: { type: Date, default: Date.now },
      level: {
        type: String,
        enum: ['INFO', 'WARN', 'ERROR'],
        required: true
      },
      message: { type: String, required: true }
    }],
    startedAt: Date,
    completedAt: Date
  },
  { timestamps: true }
);

// Indexes for task queue processing
AITaskSchema.index({ status: 1, priority: -1, createdAt: 1 });
AITaskSchema.index({ targetType: 1, targetId: 1 });
AITaskSchema.index({ taskType: 1, status: 1 });

export const AITask = mongoose.models.AITask || mongoose.model<IAITask>('AITask', AITaskSchema);
