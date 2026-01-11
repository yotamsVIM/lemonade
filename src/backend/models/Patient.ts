import mongoose, { Schema, Document } from 'mongoose';

export interface IPatient extends Document {
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  mrn: string; // Medical Record Number
  email?: string;
  phone?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
  };
  insurance?: {
    provider?: string;
    policyNumber?: string;
  };
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  createdAt: Date;
  updatedAt: Date;
}

const PatientSchema = new Schema<IPatient>(
  {
    firstName: {
      type: String,
      required: true,
      trim: true
    },
    lastName: {
      type: String,
      required: true,
      trim: true
    },
    dateOfBirth: {
      type: Date,
      required: true
    },
    mrn: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      trim: true,
      lowercase: true
    },
    phone: {
      type: String,
      trim: true
    },
    address: {
      street: String,
      city: String,
      state: String,
      zipCode: String
    },
    insurance: {
      provider: String,
      policyNumber: String
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE', 'ARCHIVED'],
      default: 'ACTIVE'
    }
  },
  { timestamps: true }
);

// Indexes for searching patients
PatientSchema.index({ firstName: 1, lastName: 1 });
PatientSchema.index({ mrn: 1 }, { unique: true });

export const Patient = mongoose.models.Patient || mongoose.model<IPatient>('Patient', PatientSchema);
