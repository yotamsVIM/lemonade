import { Router, Request, Response } from 'express';
import { Patient } from '../models/Patient';

const router = Router();

// GET /api/patients - List all patients
router.get('/', async (req: Request, res: Response) => {
  const { status, search, limit = 50, skip = 0 } = req.query;

  const query: any = {};
  if (status) {
    query.status = status;
  }
  if (search) {
    query.$or = [
      { firstName: new RegExp(search as string, 'i') },
      { lastName: new RegExp(search as string, 'i') },
      { mrn: new RegExp(search as string, 'i') }
    ];
  }

  const patients = await Patient.find(query)
    .limit(Number(limit))
    .skip(Number(skip))
    .sort({ lastName: 1, firstName: 1 });

  const total = await Patient.countDocuments(query);

  res.json({
    patients,
    total,
    limit: Number(limit),
    skip: Number(skip)
  });
});

// GET /api/patients/:id - Get single patient
router.get('/:id', async (req: Request, res: Response) => {
  const patient = await Patient.findById(req.params.id);

  if (!patient) {
    return res.status(404).json({ error: 'Patient not found' });
  }

  res.json(patient);
});

// POST /api/patients - Create new patient
router.post('/', async (req: Request, res: Response) => {
  const { firstName, lastName, dateOfBirth, mrn, email, phone, address, insurance } = req.body;

  if (!firstName || !lastName || !dateOfBirth || !mrn) {
    return res.status(400).json({
      error: 'Missing required fields: firstName, lastName, dateOfBirth, mrn'
    });
  }

  // Check if MRN already exists
  const existingPatient = await Patient.findOne({ mrn });
  if (existingPatient) {
    return res.status(409).json({ error: 'Patient with this MRN already exists' });
  }

  const patient = new Patient({
    firstName,
    lastName,
    dateOfBirth,
    mrn,
    email,
    phone,
    address,
    insurance
  });

  await patient.save();
  res.status(201).json(patient);
});

// PUT /api/patients/:id - Update patient
router.put('/:id', async (req: Request, res: Response) => {
  const { mrn, ...updateData } = req.body;

  // If updating MRN, check for conflicts
  if (mrn) {
    const existingPatient = await Patient.findOne({
      mrn,
      _id: { $ne: req.params.id }
    });
    if (existingPatient) {
      return res.status(409).json({ error: 'Patient with this MRN already exists' });
    }
    updateData.mrn = mrn;
  }

  const patient = await Patient.findByIdAndUpdate(
    req.params.id,
    updateData,
    { new: true, runValidators: true }
  );

  if (!patient) {
    return res.status(404).json({ error: 'Patient not found' });
  }

  res.json(patient);
});

// PATCH /api/patients/:id/status - Update patient status
router.patch('/:id/status', async (req: Request, res: Response) => {
  const { status } = req.body;

  if (!['ACTIVE', 'INACTIVE', 'ARCHIVED'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status value' });
  }

  const patient = await Patient.findByIdAndUpdate(
    req.params.id,
    { status },
    { new: true }
  );

  if (!patient) {
    return res.status(404).json({ error: 'Patient not found' });
  }

  res.json(patient);
});

// DELETE /api/patients/:id - Delete patient
router.delete('/:id', async (req: Request, res: Response) => {
  const patient = await Patient.findByIdAndDelete(req.params.id);

  if (!patient) {
    return res.status(404).json({ error: 'Patient not found' });
  }

  res.json({ message: 'Patient deleted successfully', patient });
});

export default router;
