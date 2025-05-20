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
  if (!statusLog) {
    console.error('Status log container missing!');
    return;
  }
  
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
let gapiInitialized = false;

// ========== GOOGLE API INITIALIZATION ========== //
function initializeGoogleAPI() {
  return new Promise((resolve, reject) => {
    gapi.load('client', async () => {
      try {
        await gapi.client.init({
          apiKey: API_KEY,
          discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
        });
        log('Google Sheets API initialized');

        tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          redirect_uri: 'https://adotsk.github.io/skgmtemplates.github.io/',
          scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
          prompt: 'consent',
          callback: (tokenResponse) => {
            if (tokenResponse?.access_token) {
              localStorage.setItem('isAuthenticated', 'true');
              document.getElementById('startBtn').disabled = false;
              document.getElementById('authenticateBtn').disabled = true;
              log('Authentication successful');
              if (document.getElementById('autoStart').checked) startAutomation();
            }
          },
          error_callback: (error) => {
            log(`OAuth Error: ${error.type} - ${error.message}`);
          }
        });

        if (localStorage.getItem('isAuthenticated') !== 'true') {
          log('Starting authentication flow...');
          tokenClient.requestAccessToken();
        } else {
          log('Already authenticated');
          document.getElementById('startBtn').disabled = false;
        }

        gapiInitialized = true;
        resolve();
      } catch (error) {
        log(`Initialization failed: ${error.message}`);
        reject(error);
      }
    });
  });
}

// ========== MAIN INITIALIZATION ========== //
document.addEventListener('DOMContentLoaded', async () => {
  // Wait for Google APIs to load
  await new Promise(resolve => {
    if (window.gapi) resolve();
    window.gapiOnLoad = resolve;
  });

  // Initialize authentication
  try {
    await initializeGoogleAPI();
    log('Authentication system ready');
    
    if (localStorage.getItem('isAuthenticated') === 'true') {
      startAutomation();
    }
  } catch (error) {
    log(`Initialization error: ${error.message}`);
  }
});

// Remove the duplicate window.onload initialization
