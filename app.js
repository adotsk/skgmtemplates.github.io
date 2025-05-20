// ========== HARDCODED CONFIGURATION ========== //
const SPREADSHEET_ID = '1QBQSYuf1-UxTi33zgCWPTdmPfCi2W2-NdbNUs0kiIbE';
const SHEET_NAME = 'Form Responses 1';
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

// DOM Elements
const authenticateBtn = document.getElementById('authenticateBtn');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusLog = document.getElementById('statusLog');
const progressLog = document.getElementById('progressLog');
const autoStart = document.getElementById('autoStart');

// Initialize on Load
window.onload = function() {
    initializeGoogleAPI();

     // Initialize lastCheckedDate to prevent undefined errors
    lastCheckedDate = localStorage.getItem('lastCheckedDate') || '';
    
    if (autoStart.checked && localStorage.getItem('isAuthenticated') === 'true') {
        setTimeout(() => startAutomation(), 2000);
    }
};

// Google API Initialization
function initializeGoogleAPI() {
    gapi.load('client', async () => {
        try {
            await gapi.client.init({
                apiKey: 'AIzaSyBaCph-vXOUd3OKHvQYnCXky8eyuq_HjzM',
                discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
            });
            
            tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: '30166017670-5sqtme9ru0mgh9u8kmakf7kqlf4uo23n.apps.googleusercontent.com',
                scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
                callback: (tokenResponse) => {
                if (tokenResponse?.access_token) {
                    localStorage.setItem('isAuthenticated', 'true');
                    startBtn.disabled = false;
                    authenticateBtn.disabled = true;
                    log('Google Authentication Successful!');

                    // Only auto-start AFTER successful auth
                    if (autoStart.checked) {
                        startAutomation();
                    }
                }
            });
            
            if (localStorage.getItem('isAuthenticated') === 'true') {
                authenticateBtn.disabled = true;
                startBtn.disabled = false;
            }
        } catch (error) {
            log('Google API Error: ' + error.message);
        }
    });
    
    authenticateBtn.addEventListener('click', () => tokenClient.requestAccessToken());
    startBtn.addEventListener('click', startAutomation);
    stopBtn.addEventListener('click', stopAutomation);
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

// Check for Messages to Send
async function checkForBirthdays() {
    try {
        log('=== Starting checkForBirthdays ===');
        
        const today = new Date().toLocaleDateString();
        log(`Today's date: ${today}`);
        log(`Last checked date: ${lastCheckedDate}`);

        // Add this debug line
        log(`Attempting to access spreadsheet: ${SPREADSHEET_ID}`);
        
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: SHEET_NAME
        });

        log('Spreadsheet data fetched successfully');
        log(`Raw response: ${JSON.stringify(response.result.values)}`);
        
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
        log('Error: ' + (error.message || error)); // Handle undefined messages
        console.error(error); // Add console logging
    }
}

// Send WhatsApp Message
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

        const whatsappUrl = `https://web.whatsapp.com/send?phone=${formattedPhone}&text=${encodeURIComponent(message)}`;
        const windowInstance = window.open(whatsappUrl, '_blank');
        
        let checkCount = 0;
        const interval = setInterval(() => {
            if (windowInstance.closed || checkCount++ > 24) {
                clearInterval(interval);
                log(`Processed: ${person.name}`);
            }
        }, 5000);
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

// Schedule Checks
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
