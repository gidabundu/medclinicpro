const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const testDbPath = path.join(__dirname, 'medclinic_test.db');
// Remove old test db if it exists
if (fs.existsSync(testDbPath)) {
  try { fs.unlinkSync(testDbPath); } catch (e) {}
}

const PORT = 3001; // use separate port for testing to avoid conflicts
process.env.PORT = PORT;
process.env.JWT_SECRET = 'test_secret_for_clinic_management_123';
process.env.NODE_ENV = 'test';
process.env.DB_PATH = testDbPath;

// Start the server
const serverProcess = spawn('node', [path.join(__dirname, 'server.js')], {
  env: process.env,
  stdio: ['ignore', 'pipe', 'pipe']
});

let serverOutput = '';
serverProcess.stdout.on('data', (data) => {
  serverOutput += data.toString();
});

serverProcess.stderr.on('data', (data) => {
  console.error('Server Stderr:', data.toString());
});

// Wait for server to start
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('Waiting for test server to start on port', PORT, '...');
  await delay(2000);

  if (!serverOutput.includes(`running on port ${PORT}`)) {
    console.log('Server output:', serverOutput);
  }

  const baseUrl = `http://localhost:${PORT}`;
  let cookieHeader = '';

  const testEmail = `testuser_${Date.now()}@medclinic.com`;
  const testPassword = 'SecurePass123';
  const testNationalID = `${Date.now()}1234567890`.slice(0, 10);

  try {
    // 1. Sign Up Test
    console.log('Testing User Signup...');
    const signupRes = await fetch(`${baseUrl}/api/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test Administrator',
        email: testEmail,
        password: testPassword
      })
    });
    
    if (signupRes.status !== 200) {
      throw new Error(`Signup failed with status ${signupRes.status}: ${await signupRes.text()}`);
    }
    
    const signupData = await signupRes.json();
    if (!signupData.success) {
      throw new Error('Signup response success property was not true');
    }
    
    // Extract token cookie
    const setCookie = signupRes.headers.get('set-cookie');
    if (!setCookie) {
      throw new Error('Signup response did not contain set-cookie header');
    }
    cookieHeader = setCookie.split(';')[0];
    console.log('Signup verified successfully. Cookie:', cookieHeader);

    // 2. Validate Profile check (/api/me)
    console.log('Testing Profile /api/me with session cookie...');
    const meRes = await fetch(`${baseUrl}/api/me`, {
      headers: { 'Cookie': cookieHeader }
    });
    
    if (meRes.status !== 200) {
      throw new Error(`Profile check failed with status ${meRes.status}`);
    }
    const meData = await meRes.json();
    if (meData.user.email !== testEmail) {
      throw new Error(`Profile email mismatch: expected ${testEmail}, got ${meData.user.email}`);
    }
    console.log('Profile verification passed for user:', meData.user.name);

    // 3. Patients API check
    console.log('Testing Patients List...');
    const patientsRes = await fetch(`${baseUrl}/api/patients`, {
      headers: { 'Cookie': cookieHeader }
    });
    const patients = await patientsRes.json();
    if (!Array.isArray(patients) || patients.length < 2) {
      throw new Error('Expected at least 2 seeded patients');
    }
    console.log(`Seeded Patients found: ${patients.map(p => p.FullName).join(', ')}`);

    // 4. Register new Patient
    console.log('Testing Patient Creation...');
    const newPatientRes = await fetch(`${baseUrl}/api/patients`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookieHeader
      },
      body: JSON.stringify({
        NationalID: testNationalID,
        FullName: 'Alice Johnson',
        DOB: '1992-08-30',
        Gender: 'Female',
        Phone: '+987654321',
        Email: 'alice@example.com',
        Address: '789 Maple St'
      })
    });
    if (newPatientRes.status !== 201) {
      throw new Error(`Patient creation failed with status ${newPatientRes.status}`);
    }
    console.log('New patient registered successfully.');

    // Verify patient search
    const searchRes = await fetch(`${baseUrl}/api/patients?search=Alice`, {
      headers: { 'Cookie': cookieHeader }
    });
    const searchPatients = await searchRes.json();
    if (searchPatients.length === 0 || searchPatients[0].FullName !== 'Alice Johnson') {
      throw new Error('Search did not return registered patient Alice Johnson');
    }
    const aliceId = searchPatients[0].PatientID;
    console.log('Patient search verification passed. PatientID:', aliceId);

    // 5. Staff API Check
    console.log('Testing Staff Roster API...');
    const staffRes = await fetch(`${baseUrl}/api/staff`, {
      headers: { 'Cookie': cookieHeader }
    });
    const staff = await staffRes.json();
    if (staff.length < 2) {
      throw new Error('Expected seeded staff members');
    }
    console.log(`Staff Roster found: ${staff.map(s => s.StaffName).join(', ')}`);
    const doctorId = staff[0].StaffID;

    // 6. Create Staff member
    console.log('Testing Staff Member Creation...');
    const createStaffRes = await fetch(`${baseUrl}/api/staff`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookieHeader
      },
      body: JSON.stringify({
        StaffName: 'Dr. Robert Carter',
        Role: 'Cardiologist',
        Email: 'robert.carter@medclinic.com',
        Phone: '+1122334455'
      })
    });
    if (createStaffRes.status !== 201) {
      throw new Error('Staff creation failed');
    }
    console.log('Staff member Dr. Robert Carter added.');

    // 7. Appointments Booking Check
    console.log('Testing Appointment Booking...');
    const bookRes = await fetch(`${baseUrl}/api/appointments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookieHeader
      },
      body: JSON.stringify({
        PatientID: aliceId,
        StaffID: doctorId,
        AppointmentDate: '2024-10-23 14:00:00',
        AppointmentType: 'Cardiology consultation',
        Room: 'Room 401',
        Status: 'Confirmed'
      })
    });
    if (bookRes.status !== 201) {
      throw new Error(`Appointment booking failed with status ${bookRes.status}`);
    }
    console.log('Appointment booked for Alice Johnson.');

    // Verify booked slot status
    const apptsRes = await fetch(`${baseUrl}/api/appointments?date=2024-10-23`, {
      headers: { 'Cookie': cookieHeader }
    });
    const appts = await apptsRes.json();
    const hasAliceAppt = appts.some(a => a.PatientID === aliceId && a.AppointmentDate.includes('14:00:00'));
    if (!hasAliceAppt) {
      throw new Error('Alice appointment not found in booked appointment query');
    }
    console.log('Appointment scheduling verified.');

    // 8. Log Patient Visit Check
    console.log('Testing Visit Log API...');
    const visitRes = await fetch(`${baseUrl}/api/visits`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookieHeader
      },
      body: JSON.stringify({
        PatientID: aliceId,
        StaffID: doctorId,
        VisitDate: '2024-10-23 14:05:00',
        ReasonForVisit: 'Consultation',
        Notes: 'Patient complains of mild chest pain.',
        Status: 'In Progress'
      })
    });
    if (visitRes.status !== 201) {
      throw new Error('Visit logging failed');
    }
    console.log('Patient visit logged.');

    // Fetch visits
    const visitsGet = await fetch(`${baseUrl}/api/visits`, {
      headers: { 'Cookie': cookieHeader }
    });
    const visits = await visitsGet.json();
    if (visits.length === 0 || !visits.some(v => v.PatientID === aliceId)) {
      throw new Error('Registered visit not retrieved');
    }
    const visitId = visits[0].VisitID;
    console.log('Visit Log verified.');

    // 9. Prescriptions Check
    console.log('Testing Prescription Creation...');
    const prescRes = await fetch(`${baseUrl}/api/prescriptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookieHeader
      },
      body: JSON.stringify({
        VisitID: visitId,
        DrugID: 1, // Amoxicillin
        Dosage: '500mg',
        Frequency: 'Three times daily',
        Duration: '5 days',
        Instructions: 'Take with full glass of water'
      })
    });
    if (prescRes.status !== 201) {
      throw new Error('Prescription creation failed');
    }
    console.log('Prescription added.');

    // 10. Vaccinations Check
    console.log('Testing Vaccinations APIs...');
    const vacRes = await fetch(`${baseUrl}/api/vaccinations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookieHeader
      },
      body: JSON.stringify({
        PatientID: aliceId,
        StaffID: doctorId,
        VaccineName: 'COVID-19 Booster',
        Dose: '0.3 mL',
        AdministrationDate: '2024-10-23 14:15:00',
        Status: 'Completed',
        Notes: 'Administered in left shoulder'
      })
    });
    if (vacRes.status !== 201) {
      throw new Error('Vaccination log failed');
    }
    console.log('Vaccination record saved.');

    // 11. Inventory Reorder Check
    console.log('Testing Inventory and Reorder flow...');
    const invRes1 = await fetch(`${baseUrl}/api/inventory`, {
      headers: { 'Cookie': cookieHeader }
    });
    const inventory1 = await invRes1.json();
    const amoxicillin = inventory1.find(i => i.DrugName.includes('Amoxicillin'));
    console.log('Amoxicillin current stock level:', amoxicillin.StockLevel);

    // Manually reduce stock to below minimum to test reorder functionality
    const reduceRes = await fetch(`${baseUrl}/api/inventory/${amoxicillin.DrugID}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookieHeader
      },
      body: JSON.stringify({ StockLevel: 5 })
    });
    if (reduceRes.status !== 200) {
      throw new Error('Failed to reduce stock level for test');
    }

    // Verify stock was reduced
    const invResCheck = await fetch(`${baseUrl}/api/inventory`, {
      headers: { 'Cookie': cookieHeader }
    });
    const inventoryCheck = await invResCheck.json();
    const amoxicillinCheck = inventoryCheck.find(i => i.DrugName.includes('Amoxicillin'));
    console.log('Amoxicillin stock level after reduction:', amoxicillinCheck.StockLevel);
    if (amoxicillinCheck.StockLevel >= amoxicillinCheck.MinRequired) {
      throw new Error('Stock reduction failed - stock still above minimum');
    }

    // Call reorder
    const reorderRes = await fetch(`${baseUrl}/api/inventory/reorder`, {
      method: 'POST',
      headers: { 'Cookie': cookieHeader }
    });
    if (reorderRes.status !== 200) {
      throw new Error('Inventory reorder failed');
    }
    
    const invRes2 = await fetch(`${baseUrl}/api/inventory`, {
      headers: { 'Cookie': cookieHeader }
    });
    const inventory2 = await invRes2.json();
    const amoxicillin2 = inventory2.find(i => i.DrugName.includes('Amoxicillin'));
    console.log('Amoxicillin stock level after reorder:', amoxicillin2.StockLevel);
    if (amoxicillin2.StockLevel <= amoxicillinCheck.StockLevel) {
      throw new Error('Stock level was not restored on reorder');
    }
    console.log('Inventory reorder verification passed.');

    // 12. Stats Check
    console.log('Testing Dashboard Stats Summary API...');
    const statsRes = await fetch(`${baseUrl}/api/stats?date=2024-10-23`, {
      headers: { 'Cookie': cookieHeader }
    });
    const stats = await statsRes.json();
    console.log('Retrieved dashboard statistics:', stats);
    if (stats.appointmentsCount === undefined || stats.lowStockCount === undefined) {
      throw new Error('Stats payload missing required summary fields');
    }
    console.log('Stats verification passed.');

    console.log('\n======================================');
    console.log('ALL API SERVICE INTEGRATION TESTS PASSED!');
    console.log('======================================');
    cleanup(0);
  } catch (err) {
    console.error('\n!!! TEST FAILED !!!');
    console.error(err);
    cleanup(1);
  }
}

function cleanup(exitCode) {
  console.log('Terminating test server...');
  serverProcess.kill();
  
  // Clean up test database file
  const testDbPath = process.env.DB_PATH;
  if (testDbPath && fs.existsSync(testDbPath)) {
    try { fs.unlinkSync(testDbPath); } catch (e) {}
  }
  
  process.exit(exitCode);
}

runTests();
