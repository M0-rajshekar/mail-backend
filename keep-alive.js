#!/usr/bin/env node
/**
 * Keep-Alive Ping for Render Backend
 * Run this every 10 minutes to prevent Render free tier from sleeping
 * 
 * Setup options:
 * 1. Cloudflare Cron Trigger (recommended)
 * 2. GitHub Actions scheduled workflow
 * 3. External service: UptimeRobot, Pingdom, etc.
 * 4. Local cron job: */10 * * * * node keep-alive.js
 */

const BACKEND_URL = 'https://mail-b.onrender.com';

async function ping() {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Pinging ${BACKEND_URL}...`);
  
  try {
    const response = await fetch(`${BACKEND_URL}/health`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });
    
    if (response.ok) {
      console.log(`✅ Backend is awake (${response.status})`);
    } else {
      console.log(`⚠️ Backend responded with ${response.status}`);
    }
  } catch (error) {
    console.log(`❌ Failed to ping: ${error.message}`);
    console.log('   This is normal if backend is sleeping - it will wake up on next request');
  }
}

// Run immediately
ping();

// Then every 10 minutes
setInterval(ping, 10 * 60 * 1000);

console.log('Keep-alive service running...');
console.log('Press Ctrl+C to stop');
