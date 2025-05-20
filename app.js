// Configuration
const API_KEY = 'AIzaSyBaCph-vXOUd3OKHvQYnCXky8eyuq_HjzM';
const CLIENT_ID = '30166017670-5sqtme9ru0mgh9u8kmakf7kqlf4uo23n.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets.readonly';

// Global variables
let tokenClient;
let checkInterval;
let isRunning = false;
let lastCheckedDate = '';

// DOM elements
const authenticateBtn = document.getElementById('authenticateBtn');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusLog = document.getElementById('statusLog');
const autoStart = document.getElementById('autoStart');

// Initialize the application when the page loads
window.onload = function() {
    initializeGoogleAPI();
    loadSavedSettings();
    
    if (autoStart.checked && localStorage.getItem('isAuthenticated') === 'true') {
        setTimeout(() => startAutomation(), 2000);
    }
};

// Initialize Google API
function initializeGoogleAPI() {
    log('Initializing Google API...');
    
    gapi.load('client', async () => {
        try {
            await gapi.client.init({
                apiKey: API_KEY,
                discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
            });
            
            log('Google API client initialized');
            
            // Initialize Google Identity Services
            tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: CLIENT_ID,
                scope: SCOPES,
                callback: (tokenResponse) => {
                    if (tokenResponse && tokenResponse.access_token) {
                        log('Successfully authenticated with Google');
                        localStorage.setItem('isAuthenticated', 'true');
                        startBtn.disabled = false;
                        authenticateBtn.disabled = true;
                    }
                },
            });
            
            if (localStorage.getItem('isAuthenticated') === 'true') {
                authenticateBtn.disabled = true;
                startBtn.disabled = false;
            }
            
        } catch (error) {
            log('Error initializing Google API: ' + error.message);
        }
    });
    
    authenticateBtn.addEventListener('click', handleAuthClick);
    startBtn.addEventListener('click', startAutomation);
    stopBtn.addEventListener('click', stopAutomation);
}

// Handle authentication click
function handleAuthClick() {
    tokenClient.requestAccessToken();
}

// Start the automation process
function startAutomation() {
    const spreadsheetId = document.getElementById('spreadsheetId').value;
    const sheetName = document.getElementById('sheetName').value;
    
    if (!spreadsheetId) {
        log('Error: Please enter a Spreadsheet ID');
        return;
    }
    
    saveSettings();
    
    if (localStorage.getItem('isAuthenticated') !== 'true') {
        log('Please authenticate with Google first');
        return;
    }
    
    isRunning = true;
    startBtn.disabled = true;
    stopBtn.disabled = false;
    authenticateBtn.disabled = true;
    
    log('Starting birthday message automation...');
    
    // Immediately check for birthdays
    checkForBirthdays();
    
    // Set up interval to check at the specified time each day
    scheduleNextCheck();
}

// Stop the automation process
function stopAutomation() {
    isRunning = false;
    if (checkInterval) {
        clearTimeout(checkInterval);
    }
    
    startBtn.disabled = false;
    stopBtn.disabled = true;
    log('Automation stopped');
}

// Schedule the next check based on the specified time
function scheduleNextCheck() {
    if (!isRunning) return;
    
    const now = new Date();
    const checkTimeStr = document.getElementById('checkTime').value;
    const [hours, minutes] = checkTimeStr.split(':').map(Number);
    
    let nextCheck = new Date(now);
    nextCheck.setHours(hours, minutes, 0, 0);
    
    // If the time has already passed today, schedule for tomorrow
    if (nextCheck <= now) {
        nextCheck.setDate(nextCheck.getDate() + 1);
    }
    
    const timeUntilNextCheck = nextCheck - now;
    
    log(`Next check scheduled for ${nextCheck.toLocaleString()}`);
    
    checkInterval = setTimeout(() => {
        checkForBirthdays();
        scheduleNextCheck();
    }, timeUntilNextCheck);
}

// Check for birthdays in the Google Sheet
async function checkForBirthdays() {
    try {
        const spreadsheetId = document.getElementById('spreadsheetId').value;
        const sheetName = document.getElementById('sheetName').value;
        const today = new Date();
        const formattedDate = `${today.getMonth() + 1}/${today.getDate()}`;
        
        // Skip if we've already checked today
        if (formattedDate === lastCheckedDate) {
            log(`Already checked for birthdays today (${formattedDate})`);
            return;
        }
        
        lastCheckedDate = formattedDate;
        log(`Checking for birthdays on ${formattedDate}...`);
        
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: spreadsheetId,
            range: sheetName
        });
        
        const rows = response.result.values;
        if (!rows || rows.length === 0) {
            log('No data found in the spreadsheet');
            return;
        }
        
        const nameColIdx = columnLetterToIndex(document.getElementById('nameColumn').value);
        const phoneColIdx = columnLetterToIndex(document.getElementById('phoneColumn').value);
        const birthdayColIdx = columnLetterToIndex(document.getElementById('birthdayColumn').value);
        const salutationColIdx = columnLetterToIndex(document.getElementById('salutationColumn').value);
        const actionColIdx = columnLetterToIndex(document.getElementById('actionColumn').value);
        const receiverNameColIdx = 1;
        
        const birthdayPeople = [];
        
        // Skip header row
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            
            if (row.length <= Math.max(nameColIdx, phoneColIdx, birthdayColIdx, salutationColIdx, actionColIdx, receiverNameColIdx)) {
                continue; // Skip rows with insufficient columns
            }
            
            const name = row[nameColIdx];
            const phone = row[phoneColIdx];
            const birthday = row[birthdayColIdx];
            const salutation = row[salutationColIdx] || '';
            const action = row[actionColIdx] || '';
            const receiverName = row[receiverNameColIdx] || '';
            
            // Check if today is the birthday AND action is 'Send'
            //if (birthday && birthday.includes(formattedDate) && 
            if (action.trim().toLowerCase() === 'send') {
                birthdayPeople.push({ 
                    name, 
                    phone, 
                    salutation,
                    receiverName: receiverName || name // Use receiverName if available, otherwise use name
                });
            }
        }
        
        log(`Found ${birthdayPeople.length} birthdays with 'Send' action today`);
        
        // Send messages to all birthday people
        for (const person of birthdayPeople) {
            await sendWhatsAppMessage(person);
        }
        
    } catch (error) {
        log('Error checking for birthdays: ' + String(error));
    }
}

// Send WhatsApp message
async function sendWhatsAppMessage(person) {
    try {
        const messageTemplate = document.getElementById('messageTemplate').value;
        const message = messageTemplate
            .replace('{name}', person.name)
            .replace('{salutation}', person.salutation);
        
        log(`Preparing to send message to ${person.name} (${person.phone}), Receiver: ${person.receiverName}`);
        
        // Format phone number - remove any non-digit characters
        const formattedPhone = person.phone.replace(/\D/g, '');
        
        // Create WhatsApp Web URL
        const whatsappUrl = `https://web.whatsapp.com/send?phone=${formattedPhone}&text=${encodeURIComponent(message)}`;
        
        // Open WhatsApp Web in a new window
        const whatsappWindow = window.open(whatsappUrl, '_blank');
        
        // Inform the user to complete the action
        log(`WhatsApp opened for ${person.receiverName}. Please click Send in the WhatsApp window.`);
        
        // We'll check every 5 seconds if the window is still open (up to 2 minutes)
        let checkCount = 0;
        const checkWindow = setInterval(() => {
            checkCount++;
            
            // If window is closed or check has been running for 2 minutes
            if (whatsappWindow.closed || checkCount > 24) {
                clearInterval(checkWindow);
                log(`Message to ${person.receiverName} handled`);
            }
        }, 5000);
        
    } catch (error) {
        log('Error sending WhatsApp message: ' + error.message);
    }
}

// Save settings to localStorage
function saveSettings() {
    const settings = {
        spreadsheetId: document.getElementById('spreadsheetId').value,
        sheetName: document.getElementById('sheetName').value,
        nameColumn: document.getElementById('nameColumn').value,
        phoneColumn: document.getElementById('phoneColumn').value,
        birthdayColumn: document.getElementById('birthdayColumn').value,
        salutationColumn: document.getElementById('salutationColumn').value,
        actionColumn: document.getElementById('actionColumn').value,        
        messageTemplate: document.getElementById('messageTemplate').value,
        checkTime: document.getElementById('checkTime').value,
        autoStart: document.getElementById('autoStart').checked
    };
    
    localStorage.setItem('birthday_app_settings', JSON.stringify(settings));
    log('Settings saved');
}

// Load settings from localStorage
function loadSavedSettings() {
    const savedSettings = localStorage.getItem('birthday_app_settings');
    if (savedSettings) {
        const settings = JSON.parse(savedSettings);
        
        document.getElementById('spreadsheetId').value = settings.spreadsheetId || '';
        document.getElementById('sheetName').value = settings.sheetName || 'Sheet1';
        document.getElementById('nameColumn').value = settings.nameColumn || 'A';
        document.getElementById('phoneColumn').value = settings.phoneColumn || 'B';
        document.getElementById('birthdayColumn').value = settings.birthdayColumn || 'C';
        document.getElementById('salutationColumn').value = settings.salutationColumn || 'D';
        document.getElementById('actionColumn').value = settings.actionColumn || 'E';        
        document.getElementById('messageTemplate').value = settings.messageTemplate || 'Happy Birthday {salutation} {name}! Wishing you a wonderful day filled with joy and happiness.';
        document.getElementById('checkTime').value = settings.checkTime || '09:00';
        document.getElementById('autoStart').checked = settings.autoStart || false;
        
        log('Settings loaded from local storage');
    }
}

// Helper function to convert column letter to index (A=0, B=1, etc.)
function columnLetterToIndex(letter) {
    letter = letter.toUpperCase();
    let sum = 0;
    
    for (let i = 0; i < letter.length; i++) {
        sum = sum * 26 + (letter.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
    }
    
    return sum - 1;
}

// Log message to status log
function log(message) {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.textContent = `[${timestamp}] ${message}`;
    statusLog.appendChild(logEntry);
    statusLog.scrollTop = statusLog.scrollHeight;
    console.log(`[${timestamp}] ${message}`);
}
