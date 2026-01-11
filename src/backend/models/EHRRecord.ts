import mongoose, { Schema, Document } from 'mongoose';

export interface IEHRRecord extends Document {
  patientId: mongoose.Types.ObjectId;
  snapshotId?: mongoose.Types.ObjectId;
  recordType: 'VISIT' | 'LAB' | 'IMAGING' | 'MEDICATION' | 'DIAGNOSIS' | 'OTHER';
  sourceSystem: string; // e.g., "Epic", "Cerner", "Manual Entry"
  recordDate: Date;
  data: {
    raw?: any; // Raw extracted data
    structured?: any; // AI-processed structured data
  };
  extractionStatus: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  extractionError?: string;
  metadata?: {
    providerId?: string;
    facilityId?: string;
    encounterType?: string;
    [key: string]: any;
  };
  createdAt: Date;
  updatedAt: Date;
}

const EHRRecordSchema = new Schema<IEHRRecord>(
  {
    patientId: {
      type: Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true
    },
    snapshotId: {
      type: Schema.Types.ObjectId,
      ref: 'Snapshot'
    },
    recordType: {
      type: String,
      enum: ['VISIT', 'LAB', 'IMAGING', 'MEDICATION', 'DIAGNOSIS', 'OTHER'],
      required: true
    },
    sourceSystem: {
      type: String,
      required: true,
      trim: true
    },
    recordDate: {
      type: Date,
      required: true,
      index: true
    },
    data: {
      raw: Schema.Types.Mixed,
      structured: Schema.Types.Mixed
    },
    extractionStatus: {
      type: String,
      enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'],
      default: 'PENDING'
    },
    extractionError: String,
    metadata: {
      type: Schema.Types.Mixed,
      default: {}
    }
  },
  { timestamps: true }
);

// Indexes for efficient querying
EHRRecordSchema.index({ patientId: 1, recordDate: -1 });
EHRRecordSchema.index({ recordType: 1, recordDate: -1 });
EHRRecordSchema.index({ extractionStatus: 1 });

export const EHRRecord = mongoose.models.EHRRecord || mongoose.model<IEHRRecord>('EHRRecord', EHRRecordSchema);
