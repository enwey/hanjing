import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'hanjing_clinic_jwt_secret_key_2026';

const runTest = async () => {
  // Generate a valid super admin token
  const token = jwt.sign({ id: 1, username: 'admin', role: 'super_admin' }, JWT_SECRET, { expiresIn: '1h' });
  
  try {
    console.log('Sending invoice request using fetch...');
    const response = await fetch('http://localhost:5005/api/admin/orders/20/invoice', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        title: '测试抬头',
        tax_id: ''
      })
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
