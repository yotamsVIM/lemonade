import mongoose, { Schema, Document } from 'mongoose';

export interface ILog {
  phase: 'MINER' | 'ORACLE' | 'FORGE' | 'RUNTIME';
  level: 'INFO' | 'WARN' | 'ERROR';
  msg: string;
  timestamp: Date;
}

export interface ISnapshot extends Document {
  htmlBlob: string;           // The raw DOM (5-10MB+)
  groundTruth?: object;       // From Oracle (semantic analysis)
  extractorCode?: string;     // From Forge (generated JS)
  logs: ILog[];
  status: 'NEW' | 'ANNOTATED' | 'EXTRACTED' | 'VERIFIED';
  createdAt: Date;
  updatedAt: Date;
}

const SnapshotSchema = new Schema<ISnapshot>(
  {
    htmlBlob: {
      type: String,
      required: true,
      // No maxlength - MongoDB supports up to 16MB per document
    },
    groundTruth: {
      type: Schema.Types.Mixed,
      default: null
    },
    extractorCode: {
      type: String,
      default: null
    },
    logs: [{
      phase: {
        type: String,
        enum: ['MINER', 'ORACLE', 'FORGE', 'RUNTIME'],
        required: true
      },
      level: {
        type: String,
        enum: ['INFO', 'WARN', 'ERROR'],
        required: true
      },
      msg: { type: String, required: true },
      timestamp: { type: Date, default: Date.now }
    }],
    status: {
      type: String,
      enum: ['NEW', 'ANNOTATED', 'EXTRACTED', 'VERIFIED'],
      default: 'NEW'
    }
  },
  { timestamps: true }
);

export const Snapshot = mongoose.model<ISnapshot>('Snapshot', SnapshotSchema);
