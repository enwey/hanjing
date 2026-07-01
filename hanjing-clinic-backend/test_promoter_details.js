import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'hanjing_clinic_jwt_secret_key_2026';

const runTest = async () => {
  const token = jwt.sign({ id: 1, username: 'admin', role: 'super_admin' }, JWT_SECRET, { expiresIn: '1h' });
  
  try {
    console.log('Sending GET promoter commissions request...');
    const response = await fetch('http://localhost:5005/api/admin/distribution/promoters/4/commissions', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('Response status:', response.status);
    const bodyText = await response.text();
    console.log('Response body:', bodyText);
  } catch (err) {
    console.error('FETCH ERROR:', err);
  }
  process.exit(0);
};

runTest();
