# MedClinic Pro

A comprehensive clinic management system with patient records, appointments, staff management, inventory tracking, vaccinations, and prescription management. Built with Node.js, Express, and SQLite.

## Features

- **Authentication & Authorization**: Secure JWT-based authentication with HTTP-only cookies
- **Patient Management**: Register, search, update, and manage patient records with medical history
- **Staff Management**: Manage clinic staff with roles and contact information
- **Appointment Scheduling**: Book, view, and manage appointments
- **Visit Tracking**: Log patient visits with notes and status
- **Vaccination Records**: Track vaccinations with doses and administration dates
- **Inventory Management**: Add, update, delete, and monitor drug stock levels with reorder alerts
- **Prescription Management**: Create and track prescriptions linked to visits
- **AI Assistance**: Natural language chat for quick data queries and navigation
- **Patient Summaries**: AI-powered patient record summaries with medical history
- **QR Code Generation**: Generate QR codes for patient identification
- **Dashboard**: Real-time statistics and recent activity feed
- **Responsive UI**: Modern, clean interface built with vanilla JavaScript

## Architecture

### Backend
- **Server**: Node.js with Express.js
- **Database**: SQLite with foreign key constraints
- **Authentication**: JWT tokens stored in HTTP-only cookies
- **Security**: Helmet for security headers, rate limiting, input sanitization
- **API**: RESTful API with JSON responses

### Frontend
- **Technology**: Vanilla JavaScript with HTML/CSS
- **Icons**: Tabler Icons (via CDN)
- **QR Codes**: QRCode.js library (via CDN)
- **State Management**: Client-side with API calls
- **Authentication**: Cookie-based session management

## Installation

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn

### Setup

1. **Clone the repository**
```bash
git clone <repository-url>
cd MedClinic Pro
```

2. **Install dependencies**
```bash
cd server
npm install
```

3. **Configure environment variables**
```bash
cp .env.example .env
```

Edit `.env` with your configuration:
```env
PORT=3000
NODE_ENV=development
JWT_SECRET=CHANGE_THIS_TO_A_STRONG_RANDOM_SECRET_AT_LEAST_32_CHARACTERS_LONG
CORS_ORIGIN=http://localhost:3000
```

4. **Start the server**
```bash
npm start
```

The server will initialize the SQLite database with seed data if tables are empty.

5. **Access the application**
- Open http://localhost:3000/login.html to sign in
- Open http://localhost:3000/signup.html to create an account

## Configuration

### Environment Variables

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `PORT` | No | Server port | 3000 |
| `NODE_ENV` | No | Environment (development/production) | development |
| `JWT_SECRET` | Yes | Secret key for JWT token signing | Must be set |
| `CORS_ORIGIN` | Yes (production) | Allowed CORS origin | localhost:3000 (dev only) |

### Security Configuration

**Production Requirements:**
- `JWT_SECRET` must be set to a strong random string (minimum 32 characters)
- `CORS_ORIGIN` must be set to your production domain
- `NODE_ENV` should be set to `production`

**Development Mode:**
- CORS allows localhost:3000 by default
- JWT_SECRET must still be set (no fallback)
- Cookies are not marked as secure (for HTTP)

## API Documentation

### Authentication Endpoints

#### POST /api/signup
Register a new user account.

**Request:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "SecurePass123"
}
```

**Password Requirements:**
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number

**Response:**
```json
{
  "success": true,
  "name": "John Doe"
}
```

#### POST /api/login
Authenticate a user.

**Request:**
```json
{
  "email": "john@example.com",
  "password": "SecurePass123"
}
```

**Response:**
```json
{
  "success": true,
  "name": "John Doe"
}
```

Sets HTTP-only cookie `med_token` with JWT.

#### POST /api/logout
Clear authentication cookie.

**Response:**
```json
{
  "success": true
}
```

#### GET /api/me
Get current user profile (requires authentication).

**Response:**
```json
{
  "user": {
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com",
    "createdAt": "2024-01-01 00:00:00"
  }
}
```

### Patient Endpoints

#### GET /api/patients
Get all patients or search by name/ID/NationalID.

**Query Parameters:**
- `search` (optional): Search term

**Response:**
```json
[
  {
    "PatientID": 1,
    "NationalID": "1234567890",
    "FullName": "Elena Rodriguez",
    "DOB": "1989-04-15",
    "Gender": "Female",
    "Phone": "+123456789",
    "Email": "elena@example.com",
    "Address": "123 Oak Drive",
    "CreatedAt": "2024-01-01 00:00:00"
  }
]
```

#### POST /api/patients
Register a new patient (requires authentication).

**Request:**
```json
{
  "NationalID": "9876543210",
  "FullName": "Alice Johnson",
  "DOB": "1992-08-30",
  "Gender": "Female",
  "Phone": "+987654321",
  "Email": "alice@example.com",
  "Address": "789 Maple St",
  "BloodType": "O+",
  "EmergencyContact": "John Johnson - +987654322",
  "Allergies": "Penicillin"
}
```

**Response:**
```json
{
  "message": "Patient registered successfully"
}
```

#### PUT /api/patients/:id
Update an existing patient record (requires authentication).

**Request:**
```json
{
  "NationalID": "9876543210",
  "FullName": "Alice Johnson-Smith",
  "DOB": "1992-08-30",
  "Gender": "Female",
  "Phone": "+987654321",
  "Email": "alice.j@example.com",
  "Address": "789 Maple St",
  "BloodType": "O+",
  "EmergencyContact": "John Johnson - +987654322",
  "Allergies": "Penicillin"
}
```

**Response:**
```json
{
  "message": "Patient updated successfully"
}
```

### Staff Endpoints

#### GET /api/staff
Get all staff members (requires authentication).

**Response:**
```json
[
  {
    "StaffID": 1,
    "StaffName": "Dr. Aris Thorne",
    "Role": "Doctor",
    "Email": "aris.thorne@medclinic.com",
    "Phone": "+123456780",
    "CreatedAt": "2024-01-01 00:00:00"
  }
]
```

#### POST /api/staff
Add a new staff member (requires authentication).

**Request:**
```json
{
  "StaffName": "Dr. Robert Carter",
  "Role": "Cardiologist",
  "Email": "robert.carter@medclinic.com",
  "Phone": "+1122334455"
}
```

**Response:**
```json
{
  "message": "Staff member added successfully"
}
```

### Appointment Endpoints

#### GET /api/appointments
Get all appointments or filter by date (requires authentication).

**Query Parameters:**
- `date` (optional): Filter by date (YYYY-MM-DD)

**Response:**
```json
[
  {
    "AppointmentID": 1,
    "PatientID": 1,
    "StaffID": 1,
    "AppointmentDate": "2024-10-23 09:00:00",
    "AppointmentType": "General Checkup",
    "Room": "Room 302",
    "Status": "Confirmed",
    "Notes": "Annual general consultation",
    "PatientName": "Elena Rodriguez",
    "DoctorName": "Dr. Aris Thorne"
  }
]
```

#### POST /api/appointments
Create a new appointment (requires authentication).

**Request:**
```json
{
  "PatientID": 1,
  "StaffID": 1,
  "AppointmentDate": "2024-10-23 14:00:00",
  "AppointmentType": "Cardiology consultation",
  "Room": "Room 401",
  "Status": "Confirmed",
  "Notes": "Follow-up appointment"
}
```

**Response:**
```json
{
  "message": "Appointment created successfully"
}
```

### Visit Endpoints

#### GET /api/visits
Get all patient visits (requires authentication).

**Response:**
```json
[
  {
    "VisitID": 1,
    "PatientID": 1,
    "StaffID": 1,
    "VisitDate": "2024-10-23 08:45:00",
    "ReasonForVisit": "Routine checkup",
    "Notes": "Checked in for routine blood work and vitals.",
    "Status": "Checked In",
    "PatientName": "Elena Rodriguez",
    "StaffName": "Dr. Aris Thorne"
  }
]
```

#### POST /api/visits
Log a new patient visit (requires authentication).

**Request:**
```json
{
  "PatientID": 1,
  "StaffID": 1,
  "VisitDate": "2024-10-23 14:05:00",
  "ReasonForVisit": "Consultation",
  "Notes": "Patient complains of mild chest pain.",
  "Status": "In Progress"
}
```

**Response:**
```json
{
  "message": "Visit logged successfully"
}
```

### Vaccination Endpoints

#### GET /api/vaccinations
Get all vaccination records (requires authentication).

**Response:**
```json
[
  {
    "VaccinationID": 1,
    "PatientID": 2,
    "StaffID": 3,
    "AppointmentID": 2,
    "VaccineName": "Influenza Vaccine",
    "Dose": "0.5 mL",
    "AdministrationDate": "2024-10-23 10:15:00",
    "NextDoseDate": null,
    "Status": "Completed",
    "Notes": "Patient vaccinated successfully",
    "PatientName": "Mark Thompson",
    "StaffName": "Nurse Marie Bello"
  }
]
```

#### POST /api/vaccinations
Record a new vaccination (requires authentication).

**Request:**
```json
{
  "PatientID": 1,
  "StaffID": 1,
  "AppointmentID": null,
  "VaccineName": "COVID-19 Booster",
  "Dose": "0.3 mL",
  "AdministrationDate": "2024-10-23 14:15:00",
  "NextDoseDate": "2025-10-23 14:15:00",
  "Status": "Completed",
  "Notes": "Administered in left shoulder"
}
```

**Response:**
```json
{
  "message": "Vaccination record added successfully"
}
```

### Inventory Endpoints

#### GET /api/inventory
Get all inventory items (requires authentication).

**Response:**
```json
[
  {
    "DrugID": 1,
    "DrugName": "Amoxicillin 500mg",
    "Category": "Antibiotic",
    "StockLevel": 8,
    "MinRequired": 50,
    "ExpiryDate": "2025-02-15",
    "UnitPrice": 12.50
  }
]
```

#### POST /api/inventory
Add a new inventory item (requires authentication).

**Request:**
```json
{
  "DrugName": "Ibuprofen 400mg",
  "Category": "Pain Relief",
  "StockLevel": 100,
  "MinRequired": 30,
  "ExpiryDate": "2026-06-30",
  "UnitPrice": 8.75
}
```

**Response:**
```json
{
  "message": "Inventory item added successfully"
}
```

#### PUT /api/inventory/:id
Update inventory stock level (requires authentication).

**Request:**
```json
{
  "StockLevel": 100
}
```

**Response:**
```json
{
  "message": "Inventory updated successfully"
}
```

#### DELETE /api/inventory/:id
Delete an inventory item (requires authentication).

**Response:**
```json
{
  "message": "Inventory item deleted successfully"
}
```

#### POST /api/inventory/reorder
Process reorder for all items below minimum stock (requires authentication).

**Response:**
```json
{
  "message": "Reorder processed successfully. Stock levels restored."
}
```

### Prescription Endpoints

#### GET /api/prescriptions
Get all prescriptions (requires authentication).

**Response:**
```json
[
  {
    "PrescriptionID": 1,
    "VisitID": 1,
    "DrugID": 1,
    "Dosage": "500mg",
    "Frequency": "Three times daily",
    "Duration": "5 days",
    "Instructions": "Take with food",
    "DrugName": "Amoxicillin 500mg",
    "VisitDate": "2024-10-23 08:45:00",
    "PatientName": "Elena Rodriguez"
  }
]
```

#### POST /api/prescriptions
Create a new prescription (requires authentication).

**Request:**
```json
{
  "VisitID": 1,
  "DrugID": 1,
  "Dosage": "500mg",
  "Frequency": "Three times daily",
  "Duration": "5 days",
  "Instructions": "Take with food"
}
```

**Response:**
```json
{
  "message": "Prescription created successfully"
}
```

### Dashboard Endpoints

#### GET /api/stats
Get dashboard statistics (requires authentication).

**Query Parameters:**
- `date` (optional): Date for appointment count (YYYY-MM-DD)

**Response:**
```json
{
  "appointmentsCount": 2,
  "lowStockCount": 3,
  "vaccinationsCount": 2,
  "patientsCount": 2
}
```

#### GET /api/activity
Get recent activity feed (requires authentication).

**Response:**
```json
[
  {
    "text": "Appointment booked: General Checkup",
    "meta": "Patient: Elena Rodriguez • Scheduled: 2024-10-23 09:00:00",
    "icon": "<i class=\"ti ti-calendar\"></i>",
    "time": "2024-10-23T09:00:00.000Z"
  }
]
```

### AI Assistance Endpoints

#### POST /api/ai/chat
Natural language chat interface for quick data queries and navigation (requires authentication).

**Request:**
```json
{
  "message": "Find patient John",
  "context": {}
}
```

**Supported Queries:**
- Search patients: "Find patient John", "Search for patient with ID 1234567890"
- View appointments: "Show appointments today", "Upcoming appointments"
- Check inventory: "Check inventory", "Show low stock items"
- View staff: "Show staff", "List doctors"
- Navigate: "Go to dashboard", "Navigate to patients page"
- Help: "help", "what can you do"

**Response:**
```json
{
  "response": "Found 2 patient(s) matching \"John\":",
  "action": null,
  "data": [
    {
      "PatientID": 1,
      "FullName": "John Doe",
      "NationalID": "1234567890"
    }
  ]
}
```

#### POST /api/ai/summarize
Generate AI-powered summaries of patient records (requires authentication).

**Request:**
```json
{
  "type": "patient",
  "id": 1
}
```

**Response:**
```json
{
  "summary": "Patient John Doe (DOB: 1985-03-15) has had 3 visits, 2 vaccinations, and 1 prescription in the last 6 months.",
  "details": {
    "patient": { "PatientID": 1, "FullName": "John Doe" },
    "appointments": [...],
    "visits": [...],
    "prescriptions": [...]
  }
}
```

## Security Features

### Authentication
- JWT tokens with 7-day expiration
- HTTP-only cookies to prevent XSS attacks
- Secure cookie flag in production
- SameSite=strict to prevent CSRF

### Input Validation
- Email format validation
- Password complexity requirements (8+ chars, uppercase, lowercase, number)
- Input sanitization to prevent XSS attacks
- SQL injection prevention via parameterized queries

### Rate Limiting
- API endpoints: 200 requests per 15 minutes per IP
- Auth endpoints: 30 requests per 15 minutes per IP

### Security Headers
- Helmet.js for security headers
- Content Security Policy (CSP) with restricted sources
- No unsafe-inline or unsafe-eval scripts
- CORS configuration with origin validation

### Data Protection
- Passwords hashed with bcrypt (10 rounds)
- No sensitive data in error messages
- Environment-based configuration

## Testing

### Run Tests

```bash
cd server
node test.js
```

The test suite:
- Starts a test server on port 3001
- Creates a test user account
- Tests all API endpoints
- Verifies data integrity
- Cleans up after completion

### Test Coverage

- User signup and login
- Profile verification
- Patient CRUD operations
- Staff CRUD operations
- Appointment booking
- Visit logging
- Vaccination records
- Prescription creation
- Inventory management and reorder
- Dashboard statistics

## Deployment

### Production Checklist

1. **Environment Variables**
   - Set strong `JWT_SECRET` (minimum 32 random characters)
   - Set `CORS_ORIGIN` to your production domain
   - Set `NODE_ENV=production`

2. **Security**
   - Use HTTPS
   - Configure reverse proxy (nginx/Apache)
   - Enable firewall rules
   - Regular security updates

3. **Database**
   - Backup SQLite database regularly
   - Consider migrating to PostgreSQL for production
   - Implement database encryption at rest

4. **Monitoring**
   - Set up application monitoring
   - Configure error tracking
   - Monitor rate limits
   - Log authentication attempts

### Deployment with PM2

```bash
npm install -g pm2
pm2 start server.js --name medclinic
pm2 save
pm2 startup
```

### Docker Deployment

Create a `Dockerfile`:

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY server/package*.json ./
RUN npm ci --only=production
COPY server/ .
EXPOSE 3000
CMD ["npm", "start"]
```

Build and run:

```bash
docker build -t medclinic .
docker run -p 3000:3000 --env-file .env medclinic
```

## Troubleshooting

### Server won't start

**Error:** `FATAL: JWT_SECRET environment variable is required`

**Solution:** Set the `JWT_SECRET` in your `.env` file.

### CORS errors

**Error:** CORS policy blocked the request

**Solution:** Set `CORS_ORIGIN` in `.env` to match your frontend domain.

### Database locked

**Error:** Database is locked

**Solution:** Ensure only one server instance is running. Check for zombie processes.

### Password validation fails

**Error:** Password requirements not met

**Solution:** Ensure password has:
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number

### CSP errors in browser

**Error:** Content Security Policy violation

**Solution:** The CSP is configured for security. If using custom scripts, update the CSP configuration in `server.js`.

## Database Schema

### Tables

- **users**: User accounts for authentication
- **Patients**: Patient records
- **Staff**: Clinic staff members
- **Appointments**: Appointment scheduling
- **Visits**: Patient visit logs
- **Vaccinations**: Vaccination records
- **Inventory**: Drug inventory
- **Prescriptions**: Prescription records

### Relationships

- Patients → Appointments (one-to-many)
- Staff → Appointments (one-to-many)
- Patients → Visits (one-to-many)
- Staff → Visits (one-to-many)
- Visits → Prescriptions (one-to-many)
- Inventory → Prescriptions (one-to-many)
- Patients → Vaccinations (one-to-many)
- Staff → Vaccinations (one-to-many)
- Appointments → Vaccinations (one-to-one, optional)

## License

This project is provided as-is for educational and demonstration purposes.

## Support

For issues, questions, or contributions, please refer to the project repository.
