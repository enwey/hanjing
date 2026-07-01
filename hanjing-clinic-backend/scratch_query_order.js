import { get, query } from './db.js';

const run = async () => {
  try {
    const patient = await get('SELECT * FROM patients WHERE user_id = 33');
    console.log('Patient details:', patient);
    if (patient) {
      const appts = await query('SELECT * FROM appointments WHERE patient_id = ?', [patient.id]);
      console.log('Appointments for patient:', appts);
      const records = await query('SELECT * FROM medical_records WHERE patient_id = ?', [patient.id]);
      console.log('Medical records for patient:', records);
    }
  } catch (err) {
    console.error(err);
  }
  process.exit(0);
};

run();
