import { Router, Request, Response } from 'express';
import { EHRRecord } from '../models/EHRRecord';
import { Patient } from '../models/Patient';

const router = Router();

// GET /api/ehr-records - List EHR records
router.get('/', async (req: Request, res: Response) => {
  const {
    patientId,
    recordType,
    extractionStatus,
    startDate,
    endDate,
    limit = 50,
    skip = 0
  } = req.query;

  const query: any = {};

  if (patientId) {
    query.patientId = patientId;
  }
  if (recordType) {
    query.recordType = recordType;
  }
  if (extractionStatus) {
    query.extractionStatus = extractionStatus;
  }
  if (startDate || endDate) {
    query.recordDate = {};
    if (startDate) query.recordDate.$gte = new Date(startDate as string);
    if (endDate) query.recordDate.$lte = new Date(endDate as string);
  }

  const records = await EHRRecord.find(query)
    .populate('patientId', 'firstName lastName mrn')
    .limit(Number(limit))
    .skip(Number(skip))
    .sort({ recordDate: -1 });

  const total = await EHRRecord.countDocuments(query);

  res.json({
    records,
    total,
    limit: Number(limit),
    skip: Number(skip)
  });
});

// GET /api/ehr-records/:id - Get single EHR record
router.get('/:id', async (req: Request, res: Response) => {
  const record = await EHRRecord.findById(req.params.id)
    .populate('patientId', 'firstName lastName mrn dateOfBirth')
    .populate('snapshotId');

  if (!record) {
    return res.status(404).json({ error: 'EHR record not found' });
  }

  res.json(record);
});

// GET /api/ehr-records/patient/:patientId - Get all records for a patient
router.get('/patient/:patientId', async (req: Request, res: Response) => {
  const { recordType, limit = 100 } = req.query;

  const query: any = { patientId: req.params.patientId };
  if (recordType) {
    query.recordType = recordType;
  }

  const records = await EHRRecord.find(query)
    .limit(Number(limit))
    .sort({ recordDate: -1 });

  res.json({ records, total: records.length });
});

// POST /api/ehr-records - Create new EHR record
router.post('/', async (req: Request, res: Response) => {
  const {
    patientId,
    recordType,
    sourceSystem,
    recordDate,
    data,
    snapshotId,
    metadata
  } = req.body;

  if (!patientId || !recordType || !sourceSystem || !recordDate) {
    return res.status(400).json({
      error: 'Missing required fields: patientId, recordType, sourceSystem, recordDate'
    });
  }

  // Verify patient exists
  const patient = await Patient.findById(patientId);
  if (!patient) {
    return res.status(404).json({ error: 'Patient not found' });
  }

  const record = new EHRRecord({
    patientId,
    recordType,
    sourceSystem,
    recordDate,
    data,
    snapshotId,
    metadata
  });

  await record.save();

  const populatedRecord = await EHRRecord.findById(record._id)
    .populate('patientId', 'firstName lastName mrn');

  res.status(201).json(populatedRecord);
});

// PUT /api/ehr-records/:id - Update EHR record
router.put('/:id', async (req: Request, res: Response) => {
  const updateData = req.body;

  const record = await EHRRecord.findByIdAndUpdate(
    req.params.id,
    updateData,
    { new: true, runValidators: true }
  ).populate('patientId', 'firstName lastName mrn');

  if (!record) {
    return res.status(404).json({ error: 'EHR record not found' });
  }

  res.json(record);
});

// PATCH /api/ehr-records/:id/status - Update extraction status
router.patch('/:id/status', async (req: Request, res: Response) => {
  const { extractionStatus, extractionError } = req.body;

  if (!['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'].includes(extractionStatus)) {
    return res.status(400).json({ error: 'Invalid extraction status value' });
  }

  const updateData: any = { extractionStatus };
  if (extractionError) {
    updateData.extractionError = extractionError;
  }

  const record = await EHRRecord.findByIdAndUpdate(
    req.params.id,
    updateData,
    { new: true }
  );

  if (!record) {
    return res.status(404).json({ error: 'EHR record not found' });
  }

  res.json(record);
});

// DELETE /api/ehr-records/:id - Delete EHR record
router.delete('/:id', async (req: Request, res: Response) => {
  const record = await EHRRecord.findByIdAndDelete(req.params.id);

  if (!record) {
    return res.status(404).json({ error: 'EHR record not found' });
  }

  res.json({ message: 'EHR record deleted successfully', record });
});

export default router;
