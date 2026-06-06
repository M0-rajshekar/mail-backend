/**
 * Test: Simulate Inbound Email Webhook
 * This tests if your backend can process incoming emails
 */

const BACKEND_URL = 'http://localhost:3001'; // Change if your backend is elsewhere

async function simulateInboundEmail() {
  console.log('========================================');
  console.log('SIMULATING INBOUND EMAIL');
  console.log('========================================\n');
  
  const testEmail = {
    emailAddress: 'yo@trueprop.xyz',
    from: 'test-sender@example.com',
    subject: 'Test Email - Can you receive this?',
    body: 'This is a test email to verify your backend can receive messages.',
    bodyHtml: '<p>This is a test email to verify your backend can receive messages.</p>',
    headers: {
      'from': 'test-sender@example.com',
      'to': 'yo@trueprop.xyz',
      'subject': 'Test Email - Can you receive this?'
    }
  };
  
  console.log('Sending test webhook to:', `${BACKEND_URL}/api/email/webhook/inbound`);
  console.log('Payload:', JSON.stringify(testEmail, null, 2));
  console.log();
  
  try {
    const response = await fetch(`${BACKEND_URL}/api/email/webhook/inbound`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testEmail)
    });
    
    console.log('Response Status:', response.status);
    const data = await response.json().catch(() => null);
    
    if (response.ok) {
      console.log('✅ SUCCESS! Backend received the email');
      console.log('Response:', JSON.stringify(data, null, 2));
    } else {
      console.log('❌ FAILED! Backend returned error');
      console.log('Status:', response.status);
      console.log('Error:', JSON.stringify(data, null, 2));
    }
    
  } catch (error) {
    console.log('❌ CONNECTION FAILED!');
    console.log('Error:', error.message);
    console.log();
    console.log('Make sure your backend is running:');
    console.log('  cd backend && npm run start:dev');
  }
}

simulateInboundEmail();
