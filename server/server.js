require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const { db, dbRun, dbGet, dbAll, initDb } = require('./db');

const SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is required');
  process.exit(1);
}
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

const app = express();

// Security headers with CSP modified to allow unpkg/jsdelivr assets
// Disable CSP in development to allow inline styles and scripts
if (NODE_ENV === 'production') {
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "https://cdn.jsdelivr.net", "https://unpkg.com", "https://cdnjs.cloudflare.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com"],
        fontSrc: ["'self'", "https://unpkg.com"],
        imgSrc: ["'self'", "data:", "https://*"],
        connectSrc: ["'self'"]
      }
    }
  }));
} else {
  app.use(helmet({
    contentSecurityPolicy: false
  }));
}

// Request logging
app.use(morgan('dev'));

// CORS configuration
const allowedOrigin = process.env.CORS_ORIGIN;
app.use(cors({
  origin: allowedOrigin || true, // Allow true (reflect request origin) if not specified
  credentials: true
}));

// Body and Cookie parsers
app.use(bodyParser.json());
app.use(cookieParser());

// Serve static files from workspace root
app.use(express.static(path.join(__dirname, '..')));

app.get('/', (req, res) => {
  res.redirect('/login.html');
});

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // Limit each IP to 200 requests per window
  message: { error: 'Too many requests from this IP, please try again after 15 minutes' }
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // Limit login/signup to 30 requests per window
  message: { error: 'Too many login attempts, please try again after 15 minutes' }
});

app.use('/api/', apiLimiter);
app.use('/api/login', authLimiter);
app.use('/api/signup', authLimiter);

// JWT token generator
function generateToken(user) {
  return jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role, status: user.status }, SECRET, { expiresIn: '7d' });
}

// Authentication middleware using HTTP-Only Cookie
const requireAuth = (req, res, next) => {
  const token = req.cookies.med_token;
  if (!token) return res.status(401).json({ error: 'Unauthorized: Missing token' });

  jwt.verify(token, SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    
    // Allow access to /api/me, /api/logout regardless of status
    if (req.path !== '/api/me' && req.path !== '/api/logout' && decoded.status !== 'Active' && decoded.role !== 'Admin') {
      return res.status(403).json({ error: 'Account pending approval' });
    }
    
    req.user = decoded;
    next();
  });
};

const requireRole = (roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Forbidden: Insufficient role' });
  next();
};

// --- AUTHENTICATION ENDPOINTS ---

app.post('/api/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Missing email or password' });
    
    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return res.status(400).json({ error: 'Invalid email format' });
    
    // Password complexity requirements
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    if (!/[A-Z]/.test(password)) return res.status(400).json({ error: 'Password must contain at least one uppercase letter' });
    if (!/[a-z]/.test(password)) return res.status(400).json({ error: 'Password must contain at least one lowercase letter' });
    if (!/[0-9]/.test(password)) return res.status(400).json({ error: 'Password must contain at least one number' });
    
    // Sanitize name to prevent XSS
    const sanitizedName = (name || '').replace(/[<>]/g, '');

    const row = await dbGet('SELECT id FROM users WHERE email = ?', [email]);
    if (row) return res.status(400).json({ error: 'User already exists' });

    const countRow = await dbGet('SELECT COUNT(*) as count FROM users');
    const isFirstUser = countRow.count === 0;
    const role = isFirstUser ? 'Admin' : 'Pending';
    const status = isFirstUser ? 'Active' : 'Pending';

    const hash = await bcrypt.hash(password, 10);
    const result = await dbRun('INSERT INTO users (name, email, password, role, status) VALUES (?, ?, ?, ?, ?)', [sanitizedName, email, hash, role, status]);
    
    const user = { id: result.lastID, name: name || '', email, role, status };
    const token = generateToken(user);

    res.cookie('med_token', token, {
      httpOnly: true,
      secure: NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.json({ success: true, name: user.name });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Missing email or password' });
    
    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return res.status(400).json({ error: 'Invalid email format' });

    const user = await dbGet('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ error: 'Invalid credentials' });

    const token = generateToken(user);

    res.cookie('med_token', token, {
      httpOnly: true,
      secure: NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.json({ success: true, name: user.name });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('med_token');
  res.json({ success: true });
});

app.get('/api/me', requireAuth, async (req, res) => {
  try {
    const user = await dbGet('SELECT id, name, email, role, status, createdAt FROM users WHERE id = ?', [req.user.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (e) {
    res.status(500).json({ error: 'Database error' });
  }
});

// --- USER MANAGEMENT ENDPOINTS ---

app.get('/api/users', requireAuth, requireRole(['Admin']), async (req, res) => {
  try {
    const users = await dbAll('SELECT id, name, email, role, status, createdAt FROM users ORDER BY createdAt DESC');
    res.json(users);
  } catch (e) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.put('/api/users/:id/role', requireAuth, requireRole(['Admin']), async (req, res) => {
  try {
    const { role } = req.body;
    await dbRun('UPDATE users SET role = ? WHERE id = ?', [role, req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.put('/api/users/:id/status', requireAuth, requireRole(['Admin']), async (req, res) => {
  try {
    const { status } = req.body;
    await dbRun('UPDATE users SET status = ? WHERE id = ?', [status, req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Database error' });
  }
});

// --- CLINIC DATA ENDPOINTS ---

// GET stats
app.get('/api/stats', requireAuth, async (req, res) => {
  try {
    const targetDate = req.query.date || '2024-10-23'; // fallback default for dashboard demo

    // Appts count
    const appts = await dbGet('SELECT COUNT(*) as count FROM Appointments WHERE AppointmentDate LIKE ?', [`${targetDate}%`]);
    // Low stock count
    const lowStock = await dbGet('SELECT COUNT(*) as count FROM Inventory WHERE StockLevel < MinRequired');
    // Vaccinations count
    const vacs = await dbGet('SELECT COUNT(*) as count FROM Vaccinations');
    // Total patients count
    const patients = await dbGet('SELECT COUNT(*) as count FROM Patients');

    res.json({
      appointmentsCount: appts.count,
      lowStockCount: lowStock.count,
      vaccinationsCount: vacs.count,
      patientsCount: patients.count
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch stats: ' + e.message });
  }
});

// Patients APIs
app.get('/api/patients', requireAuth, async (req, res) => {
  try {
    const search = req.query.search;
    let query = 'SELECT * FROM Patients ORDER BY CreatedAt DESC';
    let params = [];
    if (search) {
      query = 'SELECT * FROM Patients WHERE FullName LIKE ? OR NationalID LIKE ? OR Email LIKE ? ORDER BY CreatedAt DESC';
      const term = `%${search}%`;
      params = [term, term, term];
    }
    const patients = await dbAll(query, params);
    res.json(patients);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/patients', requireAuth, async (req, res) => {
  try {
    const { NationalID, FullName, DOB, Gender, Phone, Email, BloodType, EmergencyContact, Allergies } = req.body;
    if (!NationalID || !FullName) return res.status(400).json({ error: 'National ID and Full Name are required' });
    
    // Sanitize inputs to prevent XSS
    const sanitizedNationalID = String(NationalID).replace(/[<>]/g, '');
    const sanitizedFullName = String(FullName).replace(/[<>]/g, '');
    const sanitizedDOB = DOB ? String(DOB).replace(/[<>]/g, '') : null;
    const sanitizedGender = Gender ? String(Gender).replace(/[<>]/g, '') : null;
    const sanitizedPhone = Phone ? String(Phone).replace(/[<>]/g, '') : null;
    const sanitizedEmail = Email ? String(Email).replace(/[<>]/g, '') : null;
    const sanitizedBloodType = BloodType ? String(BloodType).replace(/[<>]/g, '') : null;
    const sanitizedEmergencyContact = EmergencyContact ? String(EmergencyContact).replace(/[<>]/g, '') : null;
    const sanitizedAllergies = Allergies ? String(Allergies).replace(/[<>]/g, '') : null;
    
    // Email validation if provided
    if (sanitizedEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(sanitizedEmail)) return res.status(400).json({ error: 'Invalid email format' });
    }

    const existing = await dbGet('SELECT PatientID FROM Patients WHERE NationalID = ?', [sanitizedNationalID]);
    if (existing) return res.status(400).json({ error: 'Patient with this National ID already exists' });

    await dbRun(
      'INSERT INTO Patients (NationalID, FullName, DOB, Gender, Phone, Email, BloodType, EmergencyContact, Allergies) VALUES (?,?,?,?,?,?,?,?,?)',
      [sanitizedNationalID, sanitizedFullName, sanitizedDOB, sanitizedGender, sanitizedPhone, sanitizedEmail, sanitizedBloodType, sanitizedEmergencyContact, sanitizedAllergies]
    );
    res.status(201).json({ message: 'Patient registered successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/patients/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { NationalID, FullName, DOB, Gender, Phone, Email, BloodType, EmergencyContact, Allergies } = req.body;
    if (!NationalID || !FullName) return res.status(400).json({ error: 'National ID and Full Name are required' });
    
    // Sanitize inputs to prevent XSS
    const sanitizedNationalID = String(NationalID).replace(/[<>]/g, '');
    const sanitizedFullName = String(FullName).replace(/[<>]/g, '');
    const sanitizedDOB = DOB ? String(DOB).replace(/[<>]/g, '') : null;
    const sanitizedGender = Gender ? String(Gender).replace(/[<>]/g, '') : null;
    const sanitizedPhone = Phone ? String(Phone).replace(/[<>]/g, '') : null;
    const sanitizedEmail = Email ? String(Email).replace(/[<>]/g, '') : null;
    const sanitizedBloodType = BloodType ? String(BloodType).replace(/[<>]/g, '') : null;
    const sanitizedEmergencyContact = EmergencyContact ? String(EmergencyContact).replace(/[<>]/g, '') : null;
    const sanitizedAllergies = Allergies ? String(Allergies).replace(/[<>]/g, '') : null;
    
    // Email validation if provided
    if (sanitizedEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(sanitizedEmail)) return res.status(400).json({ error: 'Invalid email format' });
    }

    // Check if National ID is being changed and if it conflicts with another patient
    const existing = await dbGet('SELECT PatientID FROM Patients WHERE NationalID = ? AND PatientID != ?', [sanitizedNationalID, id]);
    if (existing) return res.status(400).json({ error: 'Patient with this National ID already exists' });

    await dbRun(
      'UPDATE Patients SET NationalID = ?, FullName = ?, DOB = ?, Gender = ?, Phone = ?, Email = ?, BloodType = ?, EmergencyContact = ?, Allergies = ? WHERE PatientID = ?',
      [sanitizedNationalID, sanitizedFullName, sanitizedDOB, sanitizedGender, sanitizedPhone, sanitizedEmail, sanitizedBloodType, sanitizedEmergencyContact, sanitizedAllergies, id]
    );
    res.json({ message: 'Patient updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Staff APIs
app.get('/api/staff', requireAuth, async (req, res) => {
  try {
    const staff = await dbAll('SELECT * FROM Staff ORDER BY StaffName ASC');
    res.json(staff);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/staff', requireAuth, async (req, res) => {
  try {
    const { StaffName, Role, Email, Phone } = req.body;
    if (!StaffName) return res.status(400).json({ error: 'Staff name is required' });
    
    // Sanitize inputs to prevent XSS
    const sanitizedStaffName = String(StaffName).replace(/[<>]/g, '');
    const sanitizedRole = Role ? String(Role).replace(/[<>]/g, '') : null;
    const sanitizedEmail = Email ? String(Email).replace(/[<>]/g, '') : null;
    const sanitizedPhone = Phone ? String(Phone).replace(/[<>]/g, '') : null;
    
    // Email validation if provided
    if (sanitizedEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(sanitizedEmail)) return res.status(400).json({ error: 'Invalid email format' });
    }
    
    await dbRun('INSERT INTO Staff (StaffName, Role, Email, Phone) VALUES (?,?,?,?)', [sanitizedStaffName, sanitizedRole, sanitizedEmail, sanitizedPhone]);
    res.status(201).json({ message: 'Staff member added successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Appointments APIs
app.get('/api/appointments', requireAuth, async (req, res) => {
  try {
    const date = req.query.date;
    let query = `
      SELECT a.*, p.FullName as PatientName, s.StaffName as DoctorName 
      FROM Appointments a
      JOIN Patients p ON a.PatientID = p.PatientID
      LEFT JOIN Staff s ON a.StaffID = s.StaffID
      ORDER BY a.AppointmentDate ASC
    `;
    let params = [];
    if (date) {
      query = `
        SELECT a.*, p.FullName as PatientName, s.StaffName as DoctorName 
        FROM Appointments a
        JOIN Patients p ON a.PatientID = p.PatientID
        LEFT JOIN Staff s ON a.StaffID = s.StaffID
        WHERE a.AppointmentDate LIKE ?
        ORDER BY a.AppointmentDate ASC
      `;
      params = [`${date}%`];
    }
    const appts = await dbAll(query, params);
    res.json(appts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/appointments', requireAuth, async (req, res) => {
  try {
    const { PatientID, StaffID, AppointmentDate, AppointmentType, Room, Status, Notes } = req.body;
    if (!PatientID || !StaffID || !AppointmentDate) {
      return res.status(400).json({ error: 'Patient ID, Staff ID, and Appointment Date are required' });
    }
    
    // Sanitize inputs to prevent XSS
    const sanitizedAppointmentType = AppointmentType ? String(AppointmentType).replace(/[<>]/g, '') : null;
    const sanitizedRoom = Room ? String(Room).replace(/[<>]/g, '') : null;
    const sanitizedStatus = Status ? String(Status).replace(/[<>]/g, '') : 'Booked';
    const sanitizedNotes = Notes ? String(Notes).replace(/[<>]/g, '') : '';
    
    await dbRun(
      'INSERT INTO Appointments (PatientID, StaffID, AppointmentDate, AppointmentType, Room, Status, Notes) VALUES (?,?,?,?,?,?,?)',
      [PatientID, StaffID, AppointmentDate, sanitizedAppointmentType, sanitizedRoom, sanitizedStatus, sanitizedNotes]
    );
    res.status(201).json({ message: 'Appointment created successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Visits APIs
app.get('/api/visits', requireAuth, async (req, res) => {
  try {
    const visits = await dbAll(`
      SELECT v.*, p.FullName as PatientName, s.StaffName as StaffName 
      FROM Visits v
      JOIN Patients p ON v.PatientID = p.PatientID
      JOIN Staff s ON v.StaffID = s.StaffID
      ORDER BY v.VisitDate DESC
    `);
    res.json(visits);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/visits', requireAuth, async (req, res) => {
  try {
    const { PatientID, StaffID, VisitDate, ReasonForVisit, Notes, Status } = req.body;
    if (!PatientID || !StaffID || !VisitDate) {
      return res.status(400).json({ error: 'Patient ID, Staff ID, and Visit Date are required' });
    }
    
    // Sanitize inputs to prevent XSS
    const sanitizedReasonForVisit = ReasonForVisit ? String(ReasonForVisit).replace(/[<>]/g, '') : null;
    const sanitizedNotes = Notes ? String(Notes).replace(/[<>]/g, '') : null;
    const sanitizedStatus = Status ? String(Status).replace(/[<>]/g, '') : 'Scheduled';
    
    await dbRun(
      'INSERT INTO Visits (PatientID, StaffID, VisitDate, ReasonForVisit, Notes, Status) VALUES (?,?,?,?,?,?)',
      [PatientID, StaffID, VisitDate, sanitizedReasonForVisit, sanitizedNotes, sanitizedStatus]
    );
    res.status(201).json({ message: 'Visit logged successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Vaccinations APIs
app.get('/api/vaccinations', requireAuth, async (req, res) => {
  try {
    const vacs = await dbAll(`
      SELECT v.*, p.FullName as PatientName, s.StaffName as StaffName 
      FROM Vaccinations v
      JOIN Patients p ON v.PatientID = p.PatientID
      JOIN Staff s ON v.StaffID = s.StaffID
      ORDER BY v.AdministrationDate DESC
    `);
    res.json(vacs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/vaccinations', requireAuth, async (req, res) => {
  try {
    const { PatientID, StaffID, AppointmentID, VaccineName, Dose, AdministrationDate, NextDoseDate, Status, Notes } = req.body;
    if (!PatientID || !StaffID || !VaccineName || !AdministrationDate) {
      return res.status(400).json({ error: 'Patient ID, Staff ID, Vaccine Name, and Administration Date are required' });
    }
    
    // Sanitize inputs to prevent XSS
    const sanitizedVaccineName = String(VaccineName).replace(/[<>]/g, '');
    const sanitizedDose = Dose ? String(Dose).replace(/[<>]/g, '') : null;
    const sanitizedStatus = Status ? String(Status).replace(/[<>]/g, '') : 'Completed';
    const sanitizedNotes = Notes ? String(Notes).replace(/[<>]/g, '') : null;
    
    await dbRun(
      'INSERT INTO Vaccinations (PatientID, StaffID, AppointmentID, VaccineName, Dose, AdministrationDate, NextDoseDate, Status, Notes) VALUES (?,?,?,?,?,?,?,?,?)',
      [PatientID, StaffID, AppointmentID || null, sanitizedVaccineName, sanitizedDose, AdministrationDate, NextDoseDate || null, sanitizedStatus, sanitizedNotes]
    );
    res.status(201).json({ message: 'Vaccination record added successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Inventory APIs
app.get('/api/inventory', requireAuth, async (req, res) => {
  try {
    const inventory = await dbAll('SELECT * FROM Inventory ORDER BY DrugName ASC');
    res.json(inventory);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/inventory', requireAuth, async (req, res) => {
  try {
    const { DrugName, Category, StockLevel, MinRequired, ExpiryDate, UnitPrice } = req.body;
    if (!DrugName || !Category) return res.status(400).json({ error: 'DrugName and Category are required' });
    
    // Sanitize inputs
    const sanitizedDrugName = String(DrugName).replace(/[<>]/g, '');
    const sanitizedCategory = String(Category).replace(/[<>]/g, '');
    const sanitizedStockLevel = StockLevel !== undefined ? parseInt(StockLevel) : 0;
    const sanitizedMinRequired = MinRequired !== undefined ? parseInt(MinRequired) : 0;
    const sanitizedExpiryDate = ExpiryDate ? String(ExpiryDate).replace(/[<>]/g, '') : null;
    const sanitizedUnitPrice = UnitPrice !== undefined ? parseFloat(UnitPrice) : 0;

    console.log('Adding inventory item to database:', { sanitizedDrugName, sanitizedCategory, sanitizedStockLevel, sanitizedMinRequired, sanitizedExpiryDate, sanitizedUnitPrice });

    await dbRun(
      'INSERT INTO Inventory (DrugName, Category, StockLevel, MinRequired, ExpiryDate, UnitPrice) VALUES (?,?,?,?,?,?)',
      [sanitizedDrugName, sanitizedCategory, sanitizedStockLevel, sanitizedMinRequired, sanitizedExpiryDate, sanitizedUnitPrice]
    );
    console.log('Inventory item added successfully');
    res.status(201).json({ message: 'Inventory item added successfully' });
  } catch (err) {
    console.error('Error adding inventory item:', err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/inventory/:id', requireAuth, async (req, res) => {
  try {
    const drugId = req.params.id;
    await dbRun('DELETE FROM Inventory WHERE DrugID = ?', [drugId]);
    res.json({ message: 'Inventory item deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/inventory/:id', requireAuth, async (req, res) => {
  try {
    const drugId = req.params.id;
    const { StockLevel, MinRequired } = req.body;
    if (StockLevel === undefined) return res.status(400).json({ error: 'StockLevel is required' });
    await dbRun('UPDATE Inventory SET StockLevel = ? WHERE DrugID = ?', [StockLevel, drugId]);
    res.json({ message: 'Inventory updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/inventory/reorder', requireAuth, async (req, res) => {
  try {
    const lowStock = await dbAll('SELECT * FROM Inventory WHERE StockLevel < MinRequired');
    for (const item of lowStock) {
      await dbRun('UPDATE Inventory SET StockLevel = MinRequired + 50 WHERE DrugID = ?', [item.DrugID]);
    }
    res.json({ message: 'Reorder processed successfully. Stock levels restored.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Prescriptions APIs
app.get('/api/prescriptions', requireAuth, async (req, res) => {
  try {
    const prescs = await dbAll(`
      SELECT pr.*, i.DrugName, v.VisitDate, p.FullName as PatientName
      FROM Prescriptions pr
      JOIN Visits v ON pr.VisitID = v.VisitID
      JOIN Patients p ON v.PatientID = p.PatientID
      LEFT JOIN Inventory i ON pr.DrugID = i.DrugID
      ORDER BY pr.PrescriptionID DESC
    `);
    res.json(prescs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/prescriptions', requireAuth, async (req, res) => {
  try {
    const { VisitID, DrugID, Dosage, Frequency, Duration, Instructions } = req.body;
    if (!VisitID || !DrugID) return res.status(400).json({ error: 'Visit ID and Drug ID are required' });
    
    // Sanitize inputs to prevent XSS
    const sanitizedDosage = Dosage ? String(Dosage).replace(/[<>]/g, '') : null;
    const sanitizedFrequency = Frequency ? String(Frequency).replace(/[<>]/g, '') : null;
    const sanitizedDuration = Duration ? String(Duration).replace(/[<>]/g, '') : null;
    const sanitizedInstructions = Instructions ? String(Instructions).replace(/[<>]/g, '') : null;
    
    await dbRun(
      'INSERT INTO Prescriptions (VisitID, DrugID, Dosage, Frequency, Duration, Instructions) VALUES (?,?,?,?,?,?)',
      [VisitID, DrugID, sanitizedDosage, sanitizedFrequency, sanitizedDuration, sanitizedInstructions]
    );
    res.status(201).json({ message: 'Prescription created successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Dynamic Recent Activity Log API
app.get('/api/activity', requireAuth, async (req, res) => {
  try {
    const patients = await dbAll('SELECT FullName, CreatedAt as timestamp FROM Patients ORDER BY CreatedAt DESC LIMIT 5');
    const appointments = await dbAll(`
      SELECT p.FullName as PatientName, a.AppointmentType, a.AppointmentDate as timestamp 
      FROM Appointments a 
      JOIN Patients p ON a.PatientID = p.PatientID 
      ORDER BY a.AppointmentID DESC LIMIT 5
    `);
    const visits = await dbAll(`
      SELECT p.FullName as PatientName, v.ReasonForVisit, v.VisitDate as timestamp 
      FROM Visits v 
      JOIN Patients p ON v.PatientID = p.PatientID 
      ORDER BY v.VisitID DESC LIMIT 5
    `);
    const vaccinations = await dbAll(`
      SELECT p.FullName as PatientName, vac.VaccineName, vac.AdministrationDate as timestamp 
      FROM Vaccinations vac 
      JOIN Patients p ON vac.PatientID = p.PatientID 
      ORDER BY vac.VaccinationID DESC LIMIT 5
    `);
    const prescriptions = await dbAll(`
      SELECT p.FullName as PatientName, i.DrugName, v.VisitDate as timestamp 
      FROM Prescriptions pr 
      JOIN Visits v ON pr.VisitID = v.VisitID 
      JOIN Patients p ON v.PatientID = p.PatientID 
      LEFT JOIN Inventory i ON pr.DrugID = i.DrugID 
      ORDER BY pr.PrescriptionID DESC LIMIT 5
    `);

    const activities = [];
    patients.forEach(p => {
      activities.push({
        text: `New patient registered: ${p.FullName}`,
        meta: `Registered on ${p.timestamp}`,
        icon: '+1',
        time: new Date(p.timestamp.replace(' ', 'T') || Date.now())
      });
    });

    appointments.forEach(a => {
      activities.push({
        text: `Appointment booked: ${a.AppointmentType}`,
        meta: `Patient: ${a.PatientName} • Scheduled: ${a.timestamp}`,
        icon: '<i class="ti ti-calendar" style="font-size:13px"></i>',
        time: new Date(a.timestamp.replace(' ', 'T') || Date.now())
      });
    });

    visits.forEach(v => {
      activities.push({
        text: `Visit logged: ${v.ReasonForVisit}`,
        meta: `Patient: ${v.PatientName} • Date: ${v.timestamp}`,
        icon: '<i class="ti ti-check" style="font-size:13px"></i>',
        time: new Date(v.timestamp.replace(' ', 'T') || Date.now())
      });
    });

    vaccinations.forEach(vac => {
      activities.push({
        text: `Vaccination recorded: ${vac.VaccineName}`,
        meta: `Patient: ${vac.PatientName} • Date: ${vac.timestamp}`,
        icon: '<i class="ti ti-vaccine" style="font-size:13px"></i>',
        time: new Date(vac.timestamp.replace(' ', 'T') || Date.now())
      });
    });

    prescriptions.forEach(pr => {
      activities.push({
        text: `Prescription authorized: ${pr.DrugName || 'Medication'}`,
        meta: `Patient: ${pr.PatientName} • Date: ${pr.timestamp}`,
        icon: '<i class="ti ti-pill" style="font-size:13px"></i>',
        time: new Date(pr.timestamp.replace(' ', 'T') || Date.now())
      });
    });

    // Sort by time descending
    activities.sort((a, b) => b.time - a.time);

    // Limit to 5 most recent
    res.json(activities.slice(0, 5));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- AI ASSISTANCE ENDPOINTS ---

app.post('/api/ai/chat', requireAuth, async (req, res) => {
  try {
    const { message, context } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required' });

    const lowerMessage = message.toLowerCase();
    let response = '';
    let action = null;
    let data = null;

    // AI Logic for different types of queries
    if (lowerMessage.includes('patient') && (lowerMessage.includes('search') || lowerMessage.includes('find'))) {
      const searchTerm = message.replace(/patient|search|find|for/gi, '').trim();
      if (searchTerm) {
        const patients = await dbAll(
          `SELECT * FROM Patients WHERE FullName LIKE ? OR NationalID LIKE ? OR Email LIKE ? LIMIT 10`,
          [`%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`]
        );
        if (patients.length > 0) {
          response = `Found ${patients.length} patient(s) matching "${searchTerm}":`;
          data = patients;
        } else {
          response = `No patients found matching "${searchTerm}".`;
        }
      } else {
        const patients = await dbAll('SELECT * FROM Patients LIMIT 10');
        response = `Here are the recent patients (${patients.length} total):`;
        data = patients;
      }
    } else if (lowerMessage.includes('appointment') && (lowerMessage.includes('today') || lowerMessage.includes('upcoming'))) {
      const today = new Date().toISOString().split('T')[0];
      const appointments = await dbAll(`
        SELECT a.*, p.FullName as PatientName, s.StaffName as DoctorName
        FROM Appointments a
        JOIN Patients p ON a.PatientID = p.PatientID
        JOIN Staff s ON a.StaffID = s.StaffID
        WHERE DATE(AppointmentDate) >= ?
        ORDER BY AppointmentDate ASC
        LIMIT 10
      `, [today]);
      if (appointments.length > 0) {
        response = `Found ${appointments.length} upcoming appointment(s):`;
        data = appointments;
      } else {
        response = 'No upcoming appointments found.';
      }
    } else if (lowerMessage.includes('inventory') || lowerMessage.includes('stock') || lowerMessage.includes('drug')) {
      const inventory = await dbAll('SELECT * FROM Inventory ORDER BY StockLevel ASC');
      const lowStock = inventory.filter(item => item.StockLevel < item.MinRequired);
      if (lowStock.length > 0) {
        response = `⚠️ ${lowStock.length} item(s) are below minimum stock level. Consider reordering:`;
        data = lowStock;
      } else {
        response = `All inventory items are at satisfactory stock levels. Total items: ${inventory.length}`;
        data = inventory;
      }
    } else if (lowerMessage.includes('staff') || lowerMessage.includes('doctor') || lowerMessage.includes('nurse')) {
      const staff = await dbAll('SELECT * FROM Staff ORDER BY StaffName');
      response = `Here are all staff members (${staff.length} total):`;
      data = staff;
    } else if (lowerMessage.includes('help') || lowerMessage.includes('what can you do')) {
      response = `I can help you with:
• Search for patients by name, ID, or email
• View upcoming appointments
• Check inventory and stock levels
• View staff information
• Navigate to different sections
• Answer questions about the system

Try asking: "Find patient John", "Show appointments", "Check inventory", "Show staff"`;
    } else if (lowerMessage.includes('dashboard')) {
      action = 'navigate';
      response = 'Navigating to Dashboard...';
      data = { page: 'dashboard' };
    } else if (lowerMessage.includes('patient') && (lowerMessage.includes('page') || lowerMessage.includes('section'))) {
      action = 'navigate';
      response = 'Navigating to Patients...';
      data = { page: 'patients' };
    } else if (lowerMessage.includes('appointment') && (lowerMessage.includes('page') || lowerMessage.includes('section'))) {
      action = 'navigate';
      response = 'Navigating to Appointments...';
      data = { page: 'appointments' };
    } else if (lowerMessage.includes('staff') && (lowerMessage.includes('page') || lowerMessage.includes('section'))) {
      action = 'navigate';
      response = 'Navigating to Staff...';
      data = { page: 'staff' };
    } else if (lowerMessage.includes('visit') && (lowerMessage.includes('page') || lowerMessage.includes('section'))) {
      action = 'navigate';
      response = 'Navigating to Visits...';
      data = { page: 'visits' };
    } else if (lowerMessage.includes('vaccination') && (lowerMessage.includes('page') || lowerMessage.includes('section'))) {
      action = 'navigate';
      response = 'Navigating to Vaccinations...';
      data = { page: 'vaccinations' };
    } else if (lowerMessage.includes('inventory') && (lowerMessage.includes('page') || lowerMessage.includes('section'))) {
      action = 'navigate';
      response = 'Navigating to Inventory...';
      data = { page: 'inventory' };
    } else {
      response = `I'm not sure I understood that. Try asking about patients, appointments, inventory, staff, or type "help" for more options.`;
    }

    res.json({ response, action, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ai/summarize', requireAuth, async (req, res) => {
  try {
    const { type, id } = req.body;
    if (!type || !id) return res.status(400).json({ error: 'Type and ID are required' });

    let summary = '';
    let details = null;

    if (type === 'patient') {
      const patient = await dbGet('SELECT * FROM Patients WHERE PatientID = ?', [id]);
      if (patient) {
        const appointments = await dbAll('SELECT * FROM Appointments WHERE PatientID = ? ORDER BY AppointmentDate DESC LIMIT 5', [id]);
        const visits = await dbAll('SELECT * FROM Visits WHERE PatientID = ? ORDER BY VisitDate DESC LIMIT 5', [id]);
        const prescriptions = await dbAll(`
          SELECT pr.*, i.DrugName FROM Prescriptions pr
          JOIN Visits v ON pr.VisitID = v.VisitID
          LEFT JOIN Inventory i ON pr.DrugID = i.DrugID
          WHERE v.PatientID = ? ORDER BY pr.PrescriptionID DESC LIMIT 5
        `, [id]);

        summary = `Patient Summary for ${patient.FullName}:\n`;
        summary += `• Age: ${calculateAge(patient.DOB)}\n`;
        summary += `• Gender: ${patient.Gender}\n`;
        summary += `• Contact: ${patient.Phone} / ${patient.Email}\n`;
        summary += `• Total Appointments: ${appointments.length}\n`;
        summary += `• Total Visits: ${visits.length}\n`;
        summary += `• Recent Prescriptions: ${prescriptions.length}`;

        details = { patient, appointments, visits, prescriptions };
      } else {
        summary = 'Patient not found.';
      }
    } else if (type === 'visit') {
      const visit = await dbGet('SELECT * FROM Visits WHERE VisitID = ?', [id]);
      if (visit) {
        const patient = await dbGet('SELECT * FROM Patients WHERE PatientID = ?', [visit.PatientID]);
        const staff = await dbGet('SELECT * FROM Staff WHERE StaffID = ?', [visit.StaffID]);
        const prescriptions = await dbAll('SELECT pr.*, i.DrugName FROM Prescriptions pr LEFT JOIN Inventory i ON pr.DrugID = i.DrugID WHERE VisitID = ?', [id]);

        summary = `Visit Summary:\n`;
        summary += `• Patient: ${patient ? patient.FullName : 'Unknown'}\n`;
        summary += `• Staff: ${staff ? staff.StaffName : 'Unknown'}\n`;
        summary += `• Date: ${visit.VisitDate}\n`;
        summary += `• Reason: ${visit.ReasonForVisit}\n`;
        summary += `• Status: ${visit.Status}\n`;
        summary += `• Notes: ${visit.Notes}\n`;
        summary += `• Prescriptions: ${prescriptions.length}`;

        details = { visit, patient, staff, prescriptions };
      } else {
        summary = 'Visit not found.';
      }
    } else {
      summary = 'Unsupported type. Use "patient" or "visit".';
    }

    res.json({ summary, details });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper function to calculate age from DOB
function calculateAge(dob) {
  if (!dob) return 'Unknown';
  const birthDate = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

// --- STARTUP ---

initDb().then(() => {
  app.listen(PORT, () => console.log(`Auth & Clinic server running on port ${PORT}`));
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
