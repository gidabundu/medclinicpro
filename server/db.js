const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbFile = process.env.DB_PATH || path.join(__dirname, 'medclinic.db');
// Ensure the directory exists to avoid SQLITE_CANTOPEN errors
const dbDir = path.dirname(dbFile);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(dbFile);

// Helper function to run queries using promises
const dbRun = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(query, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
};

const dbGet = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const dbAll = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

const initDb = async () => {
  // Enable foreign key support in SQLite
  await dbRun('PRAGMA foreign_keys = ON');

  // Users table
  await dbRun(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    email TEXT UNIQUE,
    password TEXT,
    role TEXT DEFAULT 'Pending',
    status TEXT DEFAULT 'Pending',
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Add role and status columns to existing users table
  try {
    await dbRun(`ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'Pending'`);
  } catch (err) {
    // Column already exists
  }
  try {
    await dbRun(`ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'Pending'`);
  } catch (err) {
    // Column already exists
  }

  // Patients table
  await dbRun(`CREATE TABLE IF NOT EXISTS Patients (
    PatientID INTEGER PRIMARY KEY AUTOINCREMENT,
    NationalID TEXT UNIQUE NOT NULL,
    FullName TEXT NOT NULL,
    DOB TEXT,
    Gender TEXT,
    Phone TEXT,
    Email TEXT,
    Address TEXT,
    BloodType TEXT,
    EmergencyContact TEXT,
    Allergies TEXT,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Add new columns if they don't exist (for existing databases)
  try {
    await dbRun(`ALTER TABLE Patients ADD COLUMN BloodType TEXT`);
  } catch (err) {
    // Column already exists
  }
  try {
    await dbRun(`ALTER TABLE Patients ADD COLUMN EmergencyContact TEXT`);
  } catch (err) {
    // Column already exists
  }
  try {
    await dbRun(`ALTER TABLE Patients ADD COLUMN Allergies TEXT`);
  } catch (err) {
    // Column already exists
  }

  // Staff table
  await dbRun(`CREATE TABLE IF NOT EXISTS Staff (
    StaffID INTEGER PRIMARY KEY AUTOINCREMENT,
    StaffName TEXT NOT NULL,
    Role TEXT,
    Email TEXT,
    Phone TEXT,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Visits table
  await dbRun(`CREATE TABLE IF NOT EXISTS Visits (
    VisitID INTEGER PRIMARY KEY AUTOINCREMENT,
    PatientID INTEGER NOT NULL,
    StaffID INTEGER NOT NULL,
    VisitDate TEXT NOT NULL,
    ReasonForVisit TEXT,
    Notes TEXT,
    Status TEXT DEFAULT 'Scheduled',
    FOREIGN KEY (PatientID) REFERENCES Patients(PatientID) ON DELETE CASCADE,
    FOREIGN KEY (StaffID) REFERENCES Staff(StaffID) ON DELETE SET NULL
  )`);

  // Inventory table
  await dbRun(`CREATE TABLE IF NOT EXISTS Inventory (
    DrugID INTEGER PRIMARY KEY AUTOINCREMENT,
    DrugName TEXT NOT NULL,
    Category TEXT,
    StockLevel INTEGER NOT NULL DEFAULT 0,
    MinRequired INTEGER NOT NULL DEFAULT 0,
    ExpiryDate TEXT,
    UnitPrice REAL
  )`);

  // Prescriptions table
  await dbRun(`CREATE TABLE IF NOT EXISTS Prescriptions (
    PrescriptionID INTEGER PRIMARY KEY AUTOINCREMENT,
    VisitID INTEGER NOT NULL,
    DrugID INTEGER,
    Dosage TEXT,
    Frequency TEXT,
    Duration TEXT,
    Instructions TEXT,
    FOREIGN KEY (VisitID) REFERENCES Visits(VisitID) ON DELETE CASCADE,
    FOREIGN KEY (DrugID) REFERENCES Inventory(DrugID) ON DELETE SET NULL
  )`);

  // Alter Prescriptions table to allow NULL DrugID (for existing databases)
  try {
    await dbRun(`ALTER TABLE Prescriptions ALTER COLUMN DrugID INTEGER`);
  } catch (err) {
    // Column already exists or can't be altered, ignore
  }

  // Appointments table
  await dbRun(`CREATE TABLE IF NOT EXISTS Appointments (
    AppointmentID INTEGER PRIMARY KEY AUTOINCREMENT,
    PatientID INTEGER NOT NULL,
    StaffID INTEGER NOT NULL,
    AppointmentDate TEXT NOT NULL,
    AppointmentType TEXT,
    Room TEXT,
    Status TEXT DEFAULT 'Booked',
    Notes TEXT,
    FOREIGN KEY (PatientID) REFERENCES Patients(PatientID) ON DELETE CASCADE,
    FOREIGN KEY (StaffID) REFERENCES Staff(StaffID) ON DELETE SET NULL
  )`);

  // Vaccinations table
  await dbRun(`CREATE TABLE IF NOT EXISTS Vaccinations (
    VaccinationID INTEGER PRIMARY KEY AUTOINCREMENT,
    PatientID INTEGER NOT NULL,
    StaffID INTEGER NOT NULL,
    AppointmentID INTEGER,
    VaccineName TEXT NOT NULL,
    Dose TEXT,
    AdministrationDate TEXT NOT NULL,
    NextDoseDate TEXT,
    Status TEXT DEFAULT 'Completed',
    Notes TEXT,
    FOREIGN KEY (PatientID) REFERENCES Patients(PatientID) ON DELETE CASCADE,
    FOREIGN KEY (StaffID) REFERENCES Staff(StaffID) ON DELETE SET NULL,
    FOREIGN KEY (AppointmentID) REFERENCES Appointments(AppointmentID) ON DELETE SET NULL
  )`);

  // Seed demo data if tables are empty
  const patientCount = await dbGet('SELECT count(*) as count FROM Patients');
  if (patientCount.count === 0) {
    await dbRun(`INSERT INTO Patients (NationalID, FullName, DOB, Gender, Phone, Email, Address) VALUES 
      ('1234567890', 'Elena Rodriguez', '1989-04-15', 'Female', '+123456789', 'elena@example.com', '123 Oak Drive'),
      ('2345678901', 'Mark Thompson', '1975-10-22', 'Male', '+123456788', 'mark@example.com', '456 Pine Avenue')
    `);
  }

  const staffCount = await dbGet('SELECT count(*) as count FROM Staff');
  if (staffCount.count === 0) {
    await dbRun(`INSERT INTO Staff (StaffName, Role, Email, Phone) VALUES 
      ('Dr. Aris Thorne', 'Doctor', 'aris.thorne@medclinic.com', '+123456780'),
      ('Dr. Sarah Chen', 'Pediatrics', 'sarah.chen@medclinic.com', '+123456782'),
      ('Nurse Marie Bello', 'Nurse', 'marie.nurse@medclinic.com', '+123456781'),
      ('Tech Jordan Kay', 'Lab Technician', 'jordan.kay@medclinic.com', '+123456783')
    `);
  }

  const inventoryCount = await dbGet('SELECT count(*) as count FROM Inventory');
  if (inventoryCount.count === 0) {
    await dbRun(`INSERT INTO Inventory (DrugName, Category, StockLevel, MinRequired, ExpiryDate, UnitPrice) VALUES 
      ('Amoxicillin 500mg', 'Antibiotic', 8, 50, '2025-02-15', 12.50),
      ('Sterile Gauze', 'Supply', 12, 100, '2026-08-30', 0.75),
      ('Ibuprofen 400mg', 'Analgesic', 35, 50, '2026-05-10', 5.00),
      ('Influenza Vaccine', 'Vaccine', 124, 50, '2026-09-10', 15.00),
      ('Paracetamol 500mg', 'Analgesic', 210, 50, '2027-01-01', 2.00)
    `);
  }

  const appointmentCount = await dbGet('SELECT count(*) as count FROM Appointments');
  if (appointmentCount.count === 0) {
    await dbRun(`INSERT INTO Appointments (PatientID, StaffID, AppointmentDate, AppointmentType, Room, Status, Notes) VALUES 
      (1, 1, '2024-10-23 09:00:00', 'General Checkup', 'Room 302', 'Confirmed', 'Annual general consultation'),
      (2, 2, '2024-10-23 10:15:00', 'Vaccination', 'Room 104', 'In Progress', 'Scheduled influenza vaccination')
    `);
  }

  const vaccinationCount = await dbGet('SELECT count(*) as count FROM Vaccinations');
  if (vaccinationCount.count === 0) {
    await dbRun(`INSERT INTO Vaccinations (PatientID, StaffID, AppointmentID, VaccineName, Dose, AdministrationDate, NextDoseDate, Status, Notes) VALUES 
      (2, 3, 2, 'Influenza Vaccine', '0.5 mL', '2024-10-23 10:15:00', NULL, 'Completed', 'Patient vaccinated successfully'),
      (1, 3, NULL, 'COVID-19 Booster', '0.3 mL', '2024-09-10 14:30:00', '2025-09-10 14:30:00', 'Completed', 'Booster given; next due in one year')
    `);
  }

  const visitCount = await dbGet('SELECT count(*) as count FROM Visits');
  if (visitCount.count === 0) {
    await dbRun(`INSERT INTO Visits (PatientID, StaffID, VisitDate, ReasonForVisit, Notes, Status) VALUES 
      (1, 1, '2024-10-23 08:45:00', 'Routine checkup', 'Checked in for routine blood work and vitals.', 'Checked In'),
      (2, 2, '2024-10-23 09:30:00', 'Physical therapy', 'Therapeutic session for joint mobility.', 'In Progress')
    `);
  }

  const prescriptionCount = await dbGet('SELECT count(*) as count FROM Prescriptions');
  if (prescriptionCount.count === 0) {
    await dbRun(`INSERT INTO Prescriptions (VisitID, DrugID, Dosage, Frequency, Duration, Instructions) VALUES 
      (1, 1, '500mg', 'Three times daily', '5 days', 'Take with food'),
      (2, 3, '400mg', 'As needed', '2 weeks', 'Take for joint pain relief')
    `);
  }

  console.log('Database initialized successfully.');
};

module.exports = {
  db,
  dbRun,
  dbGet,
  dbAll,
  initDb
};
