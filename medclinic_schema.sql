-- MedClinic Pro MySQL schema
-- Use this script to create the database tables and optional demo data in MySQL.
-- Run: mysql -u YOUR_USER -p YOUR_DATABASE < medclinic_schema.sql

CREATE TABLE IF NOT EXISTS Patients (
    PatientID INT AUTO_INCREMENT PRIMARY KEY,
    NationalID VARCHAR(20) UNIQUE NOT NULL,
    FullName VARCHAR(100) NOT NULL,
    DOB DATE,
    Gender VARCHAR(10),
    Phone VARCHAR(20),
    Email VARCHAR(100),
    Address VARCHAR(200),
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS Staff (
    StaffID INT AUTO_INCREMENT PRIMARY KEY,
    StaffName VARCHAR(100) NOT NULL,
    Role VARCHAR(50),
    Email VARCHAR(100),
    Phone VARCHAR(20),
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS Visits (
    VisitID INT AUTO_INCREMENT PRIMARY KEY,
    PatientID INT NOT NULL,
    StaffID INT NOT NULL,
    VisitDate DATETIME NOT NULL,
    ReasonForVisit TEXT,
    Notes TEXT,
    Status VARCHAR(30) DEFAULT 'Scheduled',
    FOREIGN KEY (PatientID) REFERENCES Patients(PatientID) ON DELETE CASCADE,
    FOREIGN KEY (StaffID) REFERENCES Staff(StaffID) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS Inventory (
    DrugID INT AUTO_INCREMENT PRIMARY KEY,
    DrugName VARCHAR(100) NOT NULL,
    Category VARCHAR(50),
    StockLevel INT NOT NULL DEFAULT 0,
    MinRequired INT NOT NULL DEFAULT 0,
    ExpiryDate DATE,
    UnitPrice DECIMAL(10,2)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS Prescriptions (
    PrescriptionID INT AUTO_INCREMENT PRIMARY KEY,
    VisitID INT NOT NULL,
    DrugID INT NOT NULL,
    Dosage VARCHAR(50),
    Frequency VARCHAR(50),
    Duration VARCHAR(50),
    Instructions TEXT,
    FOREIGN KEY (VisitID) REFERENCES Visits(VisitID) ON DELETE CASCADE,
    FOREIGN KEY (DrugID) REFERENCES Inventory(DrugID) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS Appointments (
    AppointmentID INT AUTO_INCREMENT PRIMARY KEY,
    PatientID INT NOT NULL,
    StaffID INT NOT NULL,
    AppointmentDate DATETIME NOT NULL,
    AppointmentType VARCHAR(50),
    Room VARCHAR(50),
    Status VARCHAR(30) DEFAULT 'Booked',
    Notes TEXT,
    FOREIGN KEY (PatientID) REFERENCES Patients(PatientID) ON DELETE CASCADE,
    FOREIGN KEY (StaffID) REFERENCES Staff(StaffID) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS Vaccinations (
    VaccinationID INT AUTO_INCREMENT PRIMARY KEY,
    PatientID INT NOT NULL,
    StaffID INT NOT NULL,
    AppointmentID INT,
    VaccineName VARCHAR(100) NOT NULL,
    Dose VARCHAR(50),
    AdministrationDate DATETIME NOT NULL,
    NextDoseDate DATETIME,
    Status VARCHAR(30) DEFAULT 'Completed',
    Notes TEXT,
    FOREIGN KEY (PatientID) REFERENCES Patients(PatientID) ON DELETE CASCADE,
    FOREIGN KEY (StaffID) REFERENCES Staff(StaffID) ON DELETE SET NULL,
    FOREIGN KEY (AppointmentID) REFERENCES Appointments(AppointmentID) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Optional demo data
INSERT INTO Patients (NationalID, FullName, DOB, Gender, Phone, Email, Address)
VALUES
    ('1234567890', 'Elena Rodriguez', '1989-04-15', 'Female', '+123456789', 'elena@example.com', '123 Oak Drive'),
    ('2345678901', 'Mark Thompson', '1975-10-22', 'Male', '+123456788', 'mark@example.com', '456 Pine Avenue');

INSERT INTO Staff (StaffName, Role, Email, Phone)
VALUES
    ('Dr. Aris Thorne', 'Doctor', 'aris.thorne@medclinic.com', '+123456780'),
    ('Nurse Marie', 'Nurse', 'marie.nurse@medclinic.com', '+123456781');

INSERT INTO Inventory (DrugName, Category, StockLevel, MinRequired, ExpiryDate, UnitPrice)
VALUES
    ('Amoxicillin 500mg', 'Antibiotic', 50, 8, '2025-02-15', 12.50),
    ('Sterile Gauze', 'Supply', 100, 12, '2026-08-30', 0.75);

INSERT INTO Appointments (PatientID, StaffID, AppointmentDate, AppointmentType, Room, Status)
VALUES
    (1, 1, '2024-10-23 09:00:00', 'Consultation', 'Room 302', 'Confirmed'),
    (2, 1, '2024-10-23 10:15:00', 'Vaccination', 'Room 104', 'In Progress');

INSERT INTO Vaccinations (PatientID, StaffID, AppointmentID, VaccineName, Dose, AdministrationDate, NextDoseDate, Status, Notes)
VALUES
    (2, 2, 2, 'Influenza Vaccine', '0.5 mL', '2024-10-23 10:15:00', NULL, 'Completed', 'Patient vaccinated successfully'),
    (1, 2, NULL, 'COVID-19 Booster', '0.3 mL', '2024-09-10 14:30:00', '2025-09-10 14:30:00', 'Completed', 'Booster given; next due in one year');
