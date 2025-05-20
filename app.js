// ========== HARDCODED CONFIGURATION ========== //
const SPREADSHEET_ID = '1QBQSYuf1-UxTi33zgCWPTdmPfCi2W2-NdbNUs0kiIbE';
const SHEET_NAME = 'Form Responses 1';
const API_KEY = 'AIzaSyBaCph-vXOUd3OKHvQYnCXky8eyuq_HjzM';
const CLIENT_ID = '30166017670-5sqtme9ru0mgh9u8kmakf7kqlf4uo23n.apps.googleusercontent.com';
const COLUMNS = {
    NAME: 1,        // Column B (index 1)
    PHONE: 2,       // Column C (index 2)
    SALUTATION: 7,  // Column H (index 7)
    ACTION: 8       // Column I (index 8)
};
// ============================================ //

// Global Variables
let tokenClient;
let checkInterval;
let isRunning = false;
let lastCheckedDate = '';
let gapiLoaded = false;
let gisLoaded = false;

// DOM Elements
const authenticateBtn = document.getElementById('authenticateBtn');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusLog = document.getElementById('statusLog');
const progressLog = document.getElementById('progressLog');
const autoStart = document.getElementById('autoStart');

// Initialize on Load
window.onload = function() {
    // Load Google APIs properly
    window.gapiOnLoad = () => {
        gapiLoaded = true;
        initializeGoogleAPI();
    };
    window.gisOnLoad = () => {
        gisLoaded = true;
    };
    lastCheckedDate = localStorage.getItem('lastCheckedDate') || '';
    
    if (autoStart.checked && localStorage.getItem('isAuthenticated') === 'true') {
        setTimeout(() => startAutomation(), 2000);
    }
};

// Google API Initialization (Fixed Authentication Flow)
function initializeGoogleAPI() {
    gapi.load('client', async () => {
        try {
            // Initialize Google Sheets API client
            await gapi.client.init({
                apiKey: API_KEY,
                discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
            }).then(() => {
                log('Google API client initialized successfully');
            });

            // Initialize Google Identity Services
            tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: CLIENT_ID,
                scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
                callback: (tokenResponse) => {
                    if (tokenResponse && tokenResponse.access_token) {
                        log('OAuth token received');
                        localStorage.setItem('isAuthenticated', 'true');
                        startBtn.disabled = false;
                        authenticateBtn.disabled = true;
                        if (autoStart.checked) startAutomation();
                    }
                },
                error_callback: (error) => {
                    log('OAuth error: ' + JSON.stringify(error));
                }
            });

            // Auto-trigger auth if not authenticated
            if (localStorage.getItem('isAuthenticated') !== 'true') {
                log('Initiating OAuth flow...');
                tokenClient.requestAccessToken({prompt: 'consent'});
            } else {
                authenticateBtn.disabled = true;
                startBtn.disabled = false;
            }

        } catch (error) {
            // Improved error handling
            const errorMsg = error.message || JSON.stringify(error);
            log('Google API Error: ' + errorMsg);
            console.error('Full error:', error);
        }
    });
}

// Start Automation
function startAutomation() {
    isRunning = true;
    startBtn.disabled = true;
    stopBtn.disabled = false;
    log('Automation started!');
    checkForBirthdays();
    scheduleNextCheck();
}

// Stop Automation
function stopAutomation() {
    isRunning = false;
    clearTimeout(checkInterval);
    startBtn.disabled = false;
    stopBtn.disabled = true;
    log('Automation stopped.');
}

// Check for Messages to Send (Fixed Data Handling)
async function checkForBirthdays() {
    try {
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

        log(`Found ${recipients.length} messages to send.`);
        for (const recipient of recipients) {
            await sendWhatsAppMessage(recipient);
            updateProgress(recipient);
        }
    } catch (error) {
        log('Error: ' + (error.message || error));
    }
}

// Send WhatsApp Message (Fixed - No Popups)
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

        // Use hidden iframe instead of popup
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = `https://web.whatsapp.com/send?phone=${formattedPhone}&text=${encodeURIComponent(message)}`;
        document.body.appendChild(iframe);
        
        log(`Message sent to ${person.name}`);

    } catch (error) {
        log('Send Error: ' + error.message);
    }
}

// Progress Display
function updateProgress(recipient) {
    const entry = document.createElement('div');
    entry.innerHTML = `
        <strong>Recipient:</strong> ${recipient.name}<br>
        <strong>Number:</strong> ${recipient.phone}<br>
        <small>${new Date().toLocaleTimeString()}</small>
    `;
    progressLog.appendChild(entry);
    progressLog.scrollTop = progressLog.scrollHeight;
}

// Logging Utility
function log(message) {
    const entry = document.createElement('div');
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    statusLog.appendChild(entry);
    statusLog.scrollTop = statusLog.scrollHeight;
}

// Schedule Checks (Fixed Missing Function Call)
function scheduleNextCheck() {
    if (!isRunning) return;
    const now = new Date();
    const [hours, minutes] = document.getElementById('checkTime').value.split(':');
    let nextCheck = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);
    if (nextCheck <= now) nextCheck.setDate(nextCheck.getDate() + 1);
    checkInterval = setTimeout(() => {
        checkForBirthdays(); // Critical fix: Added this line
        scheduleNextCheck();
    }, nextCheck - now);
}
