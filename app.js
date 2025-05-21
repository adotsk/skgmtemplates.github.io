// ========== HARDCODED CONFIGURATION ========== //
const SPREADSHEET_ID = '1QBQSYuf1-UxTi33zgCWPTdmPfCi2W2-NdbNUs0kiIbE';
const SHEET_NAME = 'Form Responses 1';
const CLIENT_ID = '30166017670-5sqtme9ru0mgh9u8kmakf7kqlf4uo23n.apps.googleusercontent.com';
const COLUMNS = { NAME: 1, PHONE: 2, SALUTATION: 7, ACTION: 8 };
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
    const recipients = rows.slice(1).filter(row => 
      row[COLUMNS.ACTION - 1]?.trim().toLowerCase() === 'Send' // Zero-based index
    );

    log(`Found ${recipients.length} messages to send`);
    
    for (const recipient of recipients) {
      await sendWhatsAppMessage(recipient);
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
  if (!isRunning) return;
  
  const now = new Date();
  const [hours, minutes] = document.getElementById('checkTime').value.split(':');
  let nextCheck = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);
  
  if (nextCheck <= now) nextCheck.setDate(nextCheck.getDate() + 1);
  
  checkInterval = setTimeout(() => {
    checkForBirthdays();
    scheduleNextCheck();
  }, nextCheck - now);
}

// ========== WHATSAPP INTEGRATION ========== //
async function WhatsAppMessage(row) {
  try {
    // Extract data with zero-based indices and default values
    const name = row[COLUMNS.NAME - 1] || '';
    const phone = row[COLUMNS.PHONE - 1] || '';
    const salutation = row[COLUMNS.SALUTATION - 1] || '';

    const message = document.getElementById('messageTemplate').value
      .replace('{name}', name)
      .replace('{salutation}', salutation);

    const formattedPhone = phone.replace(/\D/g, '');
    if (!formattedPhone.startsWith('+')) {
      log(`Invalid phone number: ${name}`);
      return;
    }

    const whatsappUrl = `https://web.whatsapp.com/?phone=${formattedPhone}&text=${encodeURIComponent(message)}`;
    
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = whatsappUrl;
    document.body.appendChild(iframe);
    
    log(`Message queued for ${name}`);

  } catch (error) {
    log(` Error: ${error.message}`);
  }
}

// ========== PROGRESS DISPLAY ========== //
function updateProgress(row) {
  const progressLog = document.getElementById('progressLog');
  if (!progressLog) return;
  
  const name = row[COLUMNS.NAME - 1] || 'Unknown';
  const phone = row[COLUMNS.PHONE - 1] || 'No number';
  
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
  isRunning = true;
  updateButtonStates();
  log('Automation started!');
  checkForBirthdays();
  scheduleNextCheck();
}

function stopAutomation() {
  isRunning = false;
  clearTimeout(checkInterval);
  updateButtonStates();
  log('Automation stopped.');
}

// ========== MAIN INITIALIZATION ========== //
document.addEventListener('DOMContentLoaded', async () => {
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
  
  document.getElementById('authenticateBtn').addEventListener('click', () => {
    tokenClient.requestAccessToken();
  });

  document.getElementById('startBtn').addEventListener('click', startAutomation);
  document.getElementById('stopBtn').addEventListener('click', stopAutomation);

  updateButtonStates();
});
