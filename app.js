// ========== HARDCODED CONFIGURATION ========== //
const SPREADSHEET_ID = '1QBQSYuf1-UxTi33zgCWPTdmPfCi2W2-NdbNUs0kiIbE';
const SHEET_NAME = 'Form Responses 1';
const API_KEY = 'AIzaSyBaCph-vXOUd3OKHvQYnCXky8eyuq_HjzM';
const CLIENT_ID = '30166017670-5sqtme9ru0mgh9u8kmakf7kqlf4uo23n.apps.googleusercontent.com';
const COLUMNS = { NAME: 1, PHONE: 2, SALUTATION: 7, ACTION: 8 };
// ============================================ //

// Global Variables
let tokenClient;
let checkInterval;
let isRunning = false;
let lastCheckedDate = '';
let gapiInitialized = false;

// Initialize Google API
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
              startBtn.disabled = false;
              authenticateBtn.disabled = true;
              log('Authentication successful');
              if (autoStart.checked) startAutomation();
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
          startBtn.disabled = false;
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

// Modified initialization using DOMContentLoaded
document.addEventListener('DOMContentLoaded', async () => {
  log('Page loaded');
  try {
    await initializeGoogleAPI();
    lastCheckedDate = localStorage.getItem('lastCheckedDate') || '';
    
    if (autoStart.checked && localStorage.getItem('isAuthenticated') === 'true') {
      setTimeout(() => startAutomation(), 2000);
    }
  } catch (error) {
    log(`Critical error: ${error.message}`);
  }
});

// Modified window.onload (🚨 Sequential initialization)
window.onload = async function() {
  log('Page loaded');
  try {
    await initializeGoogleAPI();
    lastCheckedDate = localStorage.getItem('lastCheckedDate') || '';
    if (autoStart.checked && localStorage.getItem('isAuthenticated') === 'true') {
      setTimeout(() => startAutomation(), 2000);
    }
  } catch (error) {
    log(`Critical error: ${error.message}`);
  }
};
