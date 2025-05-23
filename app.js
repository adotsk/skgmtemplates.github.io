// ========== HARDCODED CONFIGURATION ========== //
const SPREADSHEET_ID = '1QBQSYuf1-UxTi33zgCWPTdmPfCi2W2-NdbNUs0kiIbE';
const SHEET_NAME = 'Form Responses 1';
const CLIENT_ID = '30166017670-5sqtme9ru0mgh9u8kmakf7kqlf4uo23n.apps.googleusercontent.com';
const COLUMNS = { NAME: 2, PHONE: 3, SALUTATION: 8, ACTION: 9 };
// ============================================ //

// ========== ESSENTIAL FUNCTIONS FIRST ========== //
function log(message) {
  const statusLog = document.getElementById('statusLog');
  if (!statusLog) return;
  
  const entry = document.createElement('div');
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  statusLog.appendChild(entry);
  statusLog.scrollTop = statusLog.scrollHeight;
}

// ========== BUTTON STATE MANAGEMENT ========== //
function updateButtonStates() {
  const isAuth = localStorage.getItem('isAuthenticated') === 'true';
  const sheetsReady = sheetsAPILoaded && gapi.client.sheets;
  
  document.getElementById('authenticateBtn').disabled = isAuth;
  document.getElementById('startBtn').disabled = !isAuth || !sheetsReady || isRunning;
  document.getElementById('stopBtn').disabled = !isRunning;
  
  document.getElementById('startBtn').title = sheetsReady ? '' : 'Waiting for Sheets API';
}

// ========== GLOBAL VARIABLES ========== //
let tokenClient;
let checkInterval;
let isRunning = false;
let lastCheckedDate = '';
let sheetsAPILoaded = false;

// ========== GOOGLE API INITIALIZATION ========== //
async function initializeGoogleAPI() {
  return new Promise((resolve) => {
    gapi.load('client', async () => {
      try {
        await gapi.client.init({});
        log('Google API core initialized');

        await new Promise((sheetsResolve, sheetsReject) => {
          gapi.client.load('sheets', 'v4', () => {
            if (gapi.client.sheets) {
              sheetsAPILoaded = true;
              log('Sheets API initialized');
              sheetsResolve();
            } else {
              sheetsReject('Failed to load Sheets API');
            }
          });
        });        
        
        tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
          prompt: 'consent',
          include_granted_scopes: true,
          callback: async (tokenResponse) => {
            if (tokenResponse?.access_token) {
              localStorage.setItem('isAuthenticated', 'true');
              localStorage.setItem('access_token', tokenResponse.access_token);
              localStorage.setItem('expires_at', Date.now() + (tokenResponse.expires_in * 1000));
              
              gapi.client.setToken({
                access_token: tokenResponse.access_token,
                expires_in: tokenResponse.expires_in
              });
              
              updateButtonStates();
              log('Authentication successful');
              
              if (document.getElementById('autoStart').checked) {
                startAutomation();
              }
            }
          }
        });

        // Check token validity
        const expiresAt = localStorage.getItem('expires_at');
        if (localStorage.getItem('isAuthenticated') === 'true' && expiresAt > Date.now()) {
          gapi.client.setToken({
            access_token: localStorage.getItem('access_token'),
            expires_in: (expiresAt - Date.now()) / 1000
          });
          log('Session restored');
          updateButtonStates();
        } else {
          localStorage.removeItem('isAuthenticated');
          localStorage.removeItem('access_token');
          localStorage.removeItem('expires_at');
        }
        
        resolve();
      } catch (error) {
        log(`Initialization failed: ${error.message || error}`);
      }
    });
  });
}

// ========== SPREADSHEET OPERATIONS ========== //
async function checkForBirthdays() {
  try {
    if (!sheetsAPILoaded || !gapi.client.sheets) {
      throw new Error('Sheets API not available');
    }

    // Verify valid token
    if (!gapi.client.getToken()?.access_token || localStorage.getItem('expires_at') < Date.now()) {
      throw new Error('Authentication required');
    }

    log('Accessing spreadsheet data...');
    const response = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: SHEET_NAME
    });

    const rows = response.result.values || [];
    // DEBUG: Log header and first data row
    //log(`Headers: ${rows[0]?.join(', ') || 'No headers found'}`);
    //log(`First row: ${rows[1]?.join(', ') || 'No data rows'}`);
    
    const recipients = rows.slice(1).filter(row => {
        // Ensure row has enough columns and check ACTION value
      return row.length >= COLUMNS.ACTION -1 &&         
        row[COLUMNS.ACTION -1]?.trim() === 'Send'; //.toLowerCase() === 'Send';
        //row[COLUMNS.ACTION - 1]?.trim().toLowerCase() === 'Send' // Zero-based index
    });

    log(`Found ${recipients.length} messages to send`);
    
    for (const recipient of recipients) {
      await WhatsAppMessage(recipient);
      updateProgress(recipient);
    }

  } catch (error) {
    log(`API Error: ${error.result?.error?.message || error.message}`);
    if (error.result?.error?.status === 'UNAUTHENTICATED') {
      localStorage.removeItem('isAuthenticated');
      localStorage.removeItem('access_token');
      localStorage.removeItem('expires_at');
      updateButtonStates();
      log('Session expired. Please re-authenticate.');
    }
    stopAutomation();
  }
}

// ========== SCHEDULING ========== //
function scheduleNextCheck() {
  if (!isRunning) {
    log('Scheduler stopped: Automation not running');
    return;
  }

  const now = new Date();
  const checkTimeInput = document.getElementById('checkTime').value;
  const [checkHours, checkMinutes] = checkTimeInput.split(':').map(Number);

  // Validate input
  if (isNaN(checkHours) || isNaN(checkMinutes)) {
    log('Invalid check time format. Use HH:mm (24-hour)');
    return;
  }

  // Create target time for TODAY
  const nextCheck = new Date();
  nextCheck.setHours(checkHours, checkMinutes, 0, 0); // Reset seconds/milliseconds

  // If time already passed today, schedule for tomorrow
  if (nextCheck <= now) {
    log('Target time passed today - scheduling for tomorrow');
    nextCheck.setDate(nextCheck.getDate() + 1);
  }

  const delay = nextCheck - now;

  // Safety checks
  if (delay < 0) {
    log('Invalid negative delay detected. Resetting scheduler.');
    return;
  }

  log(`Next check in ${Math.round(delay/1000)} seconds at ${nextCheck.toLocaleTimeString()}`);

  // Clear previous timeout to prevent duplicates
  if (checkInterval) clearTimeout(checkInterval);

  checkInterval = setTimeout(() => {
    log('--- CHECK TIME TRIGGERED ---');
    checkForBirthdays()
      .then(() => scheduleNextCheck()) // Re-schedule AFTER completion
      .catch(error => log(`Scheduler error: ${error.message}`));
  }, delay);
}

// ========== WHATSAPP INTEGRATION ========== //
async function WhatsAppMessage(row) {
  try {
    // Extract data with zero-based indices
    const name = row[COLUMNS.NAME - 1] || '';
    const phone = row[COLUMNS.PHONE - 1] || '';
    const salutation = row[COLUMNS.SALUTATION - 1] || '';

    // Validate and format phone number
    const formattedPhone = phone.replace(/[^\d+]/g, '');
    if (!formattedPhone.startsWith('+')) {
      log(`Invalid phone number format: ${formattedPhone}`);
      return;
    }

    // Construct message with template
    const message = document.getElementById('messageTemplate').value
      .replace('{name}', name)
      .replace('{salutation}', salutation);

    // Create WhatsApp deep link
    const whatsappUrl = `https://web.whatsapp.com/send?phone=${formattedPhone}&text=${encodeURIComponent(message)}`;
    
    // Try to use existing "WhatsApp" tab or create new one
    const whatsappWindow = window.open(whatsappUrl, 'WhatsApp');
    
    if (!whatsappWindow || whatsappWindow.closed) {
      log('Allow popups and keep WhatsApp Web tab open!');
      return;
    }

    // Focus the existing tab
    setTimeout(() => {
      try {
        whatsappWindow.focus();
        log(`Message ready to send to ${name} - Press ENTER in WhatsApp tab`);
        
        // Auto-send attempt (works only if same origin)
        setTimeout(() => {
          const enterEvent = new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            bubbles: true
          });
          whatsappWindow.document.dispatchEvent(enterEvent);
        }, 3000);
        
      } catch (error) {
        log('Security restriction: Please manually press ENTER');
      }
    }, 2000);

  } catch (error) {
    log(`Send Error: ${error.message}`);
  }
}
// ========== PROGRESS DISPLAY ========== //
function updateProgress(row) {
  const progressLog = document.getElementById('progressLog');
  if (!progressLog) return;
  
  const name = row[COLUMNS.NAME -1] || 'Unknown';
  const phone = row[COLUMNS.PHONE -1] || 'No number';
  
  const entry = document.createElement('div');
  entry.innerHTML = `
    <strong>Recipient:</strong> ${name}<br>
    <strong>Number:</strong> ${phone}<br>
    <small>${new Date().toLocaleTimeString()}</small>
  `;
  progressLog.appendChild(entry);
  progressLog.scrollTop = progressLog.scrollHeight;
}

// ========== AUTOMATION CONTROL ========== //
function startAutomation() {
  if (!isRunning) {
    isRunning = true;
    updateButtonStates();
    log('Automation started!');
    scheduleNextCheck(); // Start scheduling without immediate execution
  }
}

function stopAutomation() {
  isRunning = false;
  clearTimeout(checkInterval);
  updateButtonStates();
  log('Automation stopped.');
}

// ========== MAIN INITIALIZATION ========== //
document.addEventListener('DOMContentLoaded', async () => {
  // WhatsApp initialization warning (runs FIRST)
  if (!window.OTPWarningShown) {
    alert(`Enable these settings:
1. Keep WhatsApp Web open in a background tab
2. Disable popup blockers for this site
3. Stay logged into WhatsApp Web`);
    window.OTPWarningShown = true;
  }

  // Original initialization flow
  log('Page loaded');
  try {
    await initializeGoogleAPI();
    setInterval(() => {
      if (!sheetsAPILoaded) {
        log('Reinitializing Sheets API...');
        initializeGoogleAPI();
      }
    }, 5000);
  } catch (error) {
    log(`Fatal initialization error: ${error.message}`);
  }

  // Event listeners
  document.getElementById('authenticateBtn').addEventListener('click', () => {
    tokenClient.requestAccessToken();
  });

  document.getElementById('startBtn').addEventListener('click', startAutomation);
  document.getElementById('stopBtn').addEventListener('click', stopAutomation);

  updateButtonStates();
});
