/**
 * saasPlug CLI API Tester
 * Εκτέλεση: node api-tester.js
 */

const BASE_URL = 'http://localhost:8080';
const API_URL = `${BASE_URL}/api/v1`;

// Χρώματα για το τερματικό
const colors = {
    reset: "\x1b[0m",
    green: "\x1b[32m",
    red: "\x1b[31m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m"
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Βοηθητική συνάρτηση για τα requests
async function makeRequest(method, endpoint, body = null, token = null) {
    const headers = {
        'Content-Type': 'application/json'
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const options = { method, headers };
    if (body) {
        options.body = JSON.stringify(body);
    }

    try {
        const response = await fetch(`${endpoint.startsWith('http') ? endpoint : API_URL + endpoint}`, options);
        const isJson = response.headers.get('content-type')?.includes('application/json');
        const data = isJson ? await response.json() : await response.text();
        
        return { status: response.status, data };
    } catch (error) {
        return { status: 500, error: error.message };
    }
}

// Συνάρτηση εκτύπωσης αποτελέσματος
function printResult(testName, success, details = "") {
    if (success) {
        console.log(`${colors.green}✔ PASS${colors.reset} | ${testName} ${details ? `(${details})` : ''}`);
    } else {
        console.log(`${colors.red}✖ FAIL${colors.reset} | ${testName}`);
        if (details) console.log(`   Λεπτομέρειες: ${colors.yellow}${JSON.stringify(details, null, 2)}${colors.reset}`);
    }
    return success;
}

// Κύρια ροή δοκιμών
async function runTests() {
    console.log(`${colors.blue}=== Ξεκινάει ο Έλεγχος του saasPlug API ===${colors.reset}\n`);
    let passed = 0;
    let failed = 0;
    let jwtToken = null;
    
    const testEmail = `testuser_${Date.now()}@example.com`;
    const testPassword = "securepassword123";

    // 1. Έλεγχος Healthcheck (API Gateway)
    let res = await makeRequest('GET', `${BASE_URL}/api/health`);
    let success = res.status === 200 && res.data.ok === true;
    success ? passed++ : failed++;
    printResult('API Gateway Healthcheck', success);

    if (!success) {
        console.log(`${colors.red}Το API Gateway δεν είναι διαθέσιμο. Σταματάω τις δοκιμές.${colors.reset}`);
        process.exit(1);
    }

    // 2. Δημιουργία Χρήστη (Auth Service)
    res = await makeRequest('POST', '/auth/signup', { email: testEmail, password: testPassword });
    success = [201, 409].includes(res.status); // Επιτυχία αν δημιουργήθηκε ή υπάρχει ήδη (409)
    success ? passed++ : failed++;
    printResult('Δημιουργία Χρήστη (Signup)', success, success ? `Email: ${testEmail}` : res);

    // 3. Σύνδεση Χρήστη (Auth Service) -> Λήψη Token
    res = await makeRequest('POST', '/auth/signin', { email: testEmail, password: testPassword });
    success = res.status === 200 && res.data.token;
    if (success) jwtToken = res.data.token;
    success ? passed++ : failed++;
    printResult('Σύνδεση Χρήστη (Signin)', success, success ? "Token ελήφθη" : res);

    if (!jwtToken) {
        console.log(`${colors.red}Δεν μπόρεσα να πάρω JWT Token. Οι επόμενες δοκιμές θα αποτύχουν.${colors.reset}`);
        process.exit(1);
    }

    // 3.5 Προσθήκη Μεθόδου Πληρωμής μέσω Billing Service (Stripe API)
    res = await makeRequest('POST', '/payments/save-method', { paymentMethodId: "pm_card_visa" }, jwtToken);
    let cardSuccess = res.status === 201; 
    cardSuccess ? passed++ : failed++;
    printResult('Προσθήκη Κάρτας (POST /payments/save-method)', cardSuccess, cardSuccess ? "Η κάρτα προστέθηκε στο Billing" : res);

    // 3.6 Προσθήκη Οχήματος μέσω Car Ownership API
    // Υποθέτουμε ότι υπάρχει αυτοκίνητο με id=1 στη βάση δεδομένων από το seeding
    res = await makeRequest('POST', '/car-ownership/1', { color: "RED" }, jwtToken);
    let vehicleSuccess = [201, 409].includes(res.status); // 409 σημαίνει ότι το έχει ήδη προσθέσει
    vehicleSuccess ? passed++ : failed++;
    printResult('Προσθήκη Οχήματος (POST /car-ownership/1)', vehicleSuccess, vehicleSuccess ? "Το όχημα προστέθηκε" : res);

    if (cardSuccess || vehicleSuccess) {
        console.log(`${colors.yellow}   ⏳ Αναμονή 2 δευτερολέπτων για συγχρονισμό του RabbitMQ...${colors.reset}`);
        await sleep(2000);
    }

    // 4. Ανάκτηση Σημείων Φόρτισης (Integration Service <-> Provider APIs)
    res = await makeRequest('GET', '/points', null, jwtToken);
    success = res.status === 200 && Array.isArray(res.data);
    success ? passed++ : failed++;
    printResult('Ανάκτηση Σημείων (GET /points)', success, success ? `Βρέθηκαν ${res.data.length} σημεία` : res);

    let testPointId = null;
    if (success && res.data.length > 0) {
        // Επιλέγουμε ένα τυχαίο διαθέσιμο σημείο για το επόμενο test
        const availablePoint = res.data.find(p => p.status === 'available');
        testPointId = availablePoint ? availablePoint.pointid : res.data[0].pointid;
    }

    // 5. Κράτηση Σημείου Φόρτισης (Reservation Service <-> Integration Service)
    if (testPointId) {
        res = await makeRequest('POST', `/reserve/${testPointId}`, null, jwtToken);
        // Επιτυχία αν γίνει κράτηση (200) ή αν κάποιος άλλος/εμείς έχουμε ήδη κάνει κράτηση (400, 409)
        success = [200, 400, 409].includes(res.status); 
        success ? passed++ : failed++;
        printResult(`Κράτηση Σημείου (POST /reserve/${testPointId})`, success, `Status: ${res.status} | Data: ${JSON.stringify(res.data)}`);   

        // 6. Ακύρωση Κράτησης (αν έγινε επιτυχώς)
        if (res.status === 200) {
            let cancelRes = await makeRequest('POST', `/reserve/${testPointId}/cancel`, null, jwtToken);
            let cancelSuccess = cancelRes.status === 200;
            cancelSuccess ? passed++ : failed++;
            printResult(`Ακύρωση Κράτησης (POST /reserve/${testPointId}/cancel)`, cancelSuccess, cancelSuccess ? "Ακυρώθηκε" : cancelRes);
        }
    } else {
        console.log(`${colors.yellow}⚠ ΠΑΡΑΚΑΜΨΗ${colors.reset} | Κράτηση Σημείου (Δεν βρέθηκαν σημεία)`);
    }

    // --- Σύνοψη ---
    console.log(`\n${colors.blue}=== Σύνοψη Δοκιμών ===${colors.reset}`);
    console.log(`Συνολικά Tests: ${passed + failed}`);
    console.log(`${colors.green}Επιτυχίες: ${passed}${colors.reset}`);
    if (failed > 0) console.log(`${colors.red}Αποτυχίες: ${failed}${colors.reset}`);

    process.exit(failed > 0 ? 1 : 0);
}

runTests();