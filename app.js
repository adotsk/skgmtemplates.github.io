// ========== HARDCODED CONFIGURATION ========== //
const SPREADSHEET_ID = '1QBQSYuf1-UxTi33zgCWPTdmPfCi2W2-NdbNUs0kiIbE';
const SHEET_NAME = 'Form Responses 1';
const API_KEY = 'AIzaSyBaCph-vXOUd3OKHvQYnCXky8eyuq_HjzM';
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

// ========== GLOBAL VARIABLES ========== //
let tokenClient;
let checkInterval;
let isRunning = false;
let lastCheckedDate = '';

// ========== BUTTON STATE MANAGEMENT ========== //
function updateButtonStates() {
  const isAuth = localStorage.getItem('isAuthenticated') === 'true';
  document.getElementById('authenticateBtn').disabled = isAuth;
  document.getElementById('startBtn').disabled = !isAuth || isRunning;
  document.getElementById('stopBtn').disabled = !isRunning;
}

// ========== GOOGLE API INITIALIZATION ========== //
async function initializeGoogleAPI() {
  return new Promise((resolve) => {
    gapi.load('client', async () => {
      try {
        // Initialize core client
        await gapi.client.init({});
        log('Google API core initialized');

        // Load Sheets API specifically
        await gapi.client.load('https://sheets.googleapis.com/$discovery/rest?version=v4');
        log('Sheets API loaded');
        
        tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
          prompt: 'consent',
          callback: async (tokenResponse) => {
            if (tokenResponse?.access_token) {
              // Store token details
              localStorage.setItem('access_token', tokenResponse.access_token);
              localStorage.setItem('expires_at', Date.now() + (tokenResponse.expires_in * 1000));
              
              // Set token for all API requests
              gapi.client.setToken({
                access_token: tokenResponse.access_token,
                expires_in: tokenResponse.expires_in
              });

              localStorage.setItem('isAuthenticated', 'true');
              updateButtonStates();
              log('Authentication successful');
            }
          }
        });

        // Restore session if valid token exists
        if (localStorage.getItem('access_token') && 
            Date.now() < localStorage.getItem('expires_at')) {
          gapi.client.setToken({
            access_token: localStorage.getItem('access_token'),
            expires_in: (localStorage.getItem('expires_at') - Date.now()) / 1000
          });
          log('Session restored');
          updateButtonStates();
        } else {
          log('Starting authentication flow...');
          tokenClient.requestAccessToken();
        }

        resolve();
      } catch (error) {
        log(`Initialization failed: ${error.message}`);
      }
    });
  });
}

// ========== BIRTHDAY CHECK FUNCTION ========== //
async function checkForBirthdays() {
  try {
    if (!gapi.client.sheets) {
      throw new Error('Sheets API not loaded');
    }

    log('Accessing spreadsheet...');    
    const response = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: SHEET_NAME,
      // Explicitly exclude API key
      auth: gapi.client.getToken().access_token
    });
    
    const rows = response.result.values || [];
    const recipients = rows.slice(1).filter(row => 
      row[COLUMNS.ACTION]?.trim().toLowerCase() === 'send'
    ).map(row => ({
      name: row[COLUMNS.NAME],
      phone: row[COLUMNS.PHONE],
      salutation: row[COLUMNS.SALUTATION] || ''
    }));

    log(`Found ${recipients.length} messages to send`);
    
    for (const recipient of recipients) {
      await sendWhatsAppMessage(recipient);
      updateProgress(recipient);
    }

  } catch (error) {
    log(`API Error: ${error.result?.error?.message || error.message}`);
    console.error('API Error Details:', error);
  }
}

// ========== SCHEDULING FUNCTION ========== //
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

// ========== AUTOMATION CONTROL ========== //
function startAutomation() {
  isRunning = true;
  updateButtonStates();
  checkForBirthdays(); // Now defined above
  scheduleNextCheck();
}

function stopAutomation() {
  isRunning = false;
  clearTimeout(checkInterval);
  updateButtonStates();
}

// ========== MAIN INITIALIZATION ========== //

// Add at top of DOMContentLoaded handler
document.addEventListener('DOMContentLoaded', async () => {
  // Clear storage on every reload during development
  if (window.location.hostname === 'localhost') {
    localStorage.clear();
    sessionStorage.clear();
  }
  
//document.addEventListener('DOMContentLoaded', async () => {
  log('Page loaded');
  await initializeGoogleAPI();
  lastCheckedDate = localStorage.getItem('lastCheckedDate') || '';
  // Add with other DOM elements
  const clearStorageBtn = document.getElementById('clearStorageBtn');
  
  // Event listeners for buttons
  document.getElementById('authenticateBtn').addEventListener('click', () => {
    tokenClient.requestAccessToken();
  });

  document.getElementById('startBtn').addEventListener('click', startAutomation);
  document.getElementById('stopBtn').addEventListener('click', stopAutomation);

  // Add with other event listeners
clearStorageBtn.addEventListener('click', () => {
  localStorage.clear();
  sessionStorage.clear();
  log('All app data cleared. Reloading...');
  setTimeout(() => location.reload(), 1000);
});

  // Initial button state
  updateButtonStates();
});
