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

        // Load Sheets API explicitly
        await gapi.client.load(
          'https://sheets.googleapis.com/$discovery/rest?version=v4',
          () => {
            log('Sheets API successfully loaded');
            resolve();
          }
        );

        tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
          prompt: 'consent',
          callback: (tokenResponse) => {
            if (tokenResponse?.access_token) {
              localStorage.setItem('isAuthenticated', 'true');
              localStorage.setItem('access_token', tokenResponse.access_token);
              gapi.client.setToken(tokenResponse);
              updateButtonStates();
              log('Authentication successful');
            }
          }
        });

        if (localStorage.getItem('isAuthenticated') === 'true') {
          gapi.client.setToken({
            access_token: localStorage.getItem('access_token')
          });
          log('Session restored');
          updateButtonStates();
        }
      } catch (error) {
        log(`Initialization failed: ${error.message}`);
      }
    });
  });
}

// ========== SPREADSHEET OPERATIONS ========== //
async function checkForBirthdays() {
  if (!gapi.client.sheets) {
    log('Error: Sheets API not loaded. Reinitializing...');
    await initializeGoogleAPI();
    return;
  }

  try {
    log('Accessing spreadsheet data...');
    const response = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: SHEET_NAME
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
    console.error('Full error:', error);
  }
}

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
async function sendWhatsAppMessage(person) {
  try {
    const message = document.getElementById('messageTemplate').value
      .replace('{name}', person.name)
      .replace('{salutation}', person.salutation);

    const formattedPhone = person.phone.replace(/\D/g, '');
    if (!formattedPhone.startsWith('+')) {
      log(`Invalid phone number: ${person.name}`);
      return;
    }

    // WhatsApp Web URL
    const whatsappUrl = `https://web.whatsapp.com/send?phone=${formattedPhone}&text=${encodeURIComponent(message)}`;
    
    // Open in hidden iframe
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = whatsappUrl;
    document.body.appendChild(iframe);
    
    log(`Message queued for ${person.name}`);

  } catch (error) {
    log(`Send Error: ${error.message}`);
  }
}

function updateProgress(recipient) {
  const progressLog = document.getElementById('progressLog');
  if (!progressLog) return;
  
  const entry = document.createElement('div');
  entry.innerHTML = `
    <strong>Recipient:</strong> ${recipient.name}<br>
    <strong>Number:</strong> ${recipient.phone}<br>
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
  await initializeGoogleAPI();
  
  // Event listeners
  document.getElementById('authenticateBtn').addEventListener('click', () => {
    tokenClient.requestAccessToken();
  });

  document.getElementById('startBtn').addEventListener('click', startAutomation);
  document.getElementById('stopBtn').addEventListener('click', stopAutomation);

  // Initial states
  updateButtonStates();
});
