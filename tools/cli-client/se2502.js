#! /usr/bin/env node
const { Command } = require('commander');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const program = new Command();

const BASE_URL = process.env.SAASPLUG_API_URL || 'http://localhost:8080/api/v1';
const TOKEN_FILE = path.join(__dirname, '.softeng_token');

// --- ΒΟΗΘΗΤΙΚΗ ΣΥΝΑΡΤΗΣΗ ΓΙΑ ΤΟ TOKEN ---
function getToken() {
  if (fs.existsSync(TOKEN_FILE)) {
    const rawToken = fs.readFileSync(TOKEN_FILE, 'utf8');
    return rawToken.trim(); 
  }
  return null;
}

// --- ΒΟΗΘΗΤΙΚΗ ΓΙΑ HEADERS ---
function getAuthHeader() {
  const token = getToken();
  if (!token) {
    return {};
  }
  return { 
      'Authorization': `Bearer ${token}` 
  };
}

program
  .name('se2502_new')
  .description('CLI for EV Charging System')
  .version('1.0.0');

// --- LOGIN COMMAND ---
program.command('login')
  .description('Login to the system')
  .requiredOption('--username <username>', 'User email')
  .requiredOption('--passw <password>', 'User password')
  .action(async (options) => {
    try {
      const payload = {
        email: options.username,
        password: options.passw
      };

      const response = await axios.post(`${BASE_URL}/auth/signin`, payload);

      const token = response.data.token || response.data; 
      
      if (token) {
        fs.writeFileSync(TOKEN_FILE, token);
        console.log("Login successful. Token saved.");
      } else {
        console.error("Login failed: No token received in response.");
        console.error("Debug Response:", JSON.stringify(response.data, null, 2));
      }
    } catch (error) {
       console.error("Login Error:");
       if (error.response) {
         console.error(`Status: ${error.response.status}`);
         console.error(JSON.stringify(error.response.data, null, 2));
       } else {
         console.error(error.message);
       }
    }
  });

// --- LOGOUT COMMAND ---
program.command('logout')
  .description('Logout from the system')
  .action(() => {
    if (fs.existsSync(TOKEN_FILE)) {
      fs.unlinkSync(TOKEN_FILE);
      console.log("Logged out successfully.");
    } else {
      console.log("You are not logged in.");
    }
  });

// "healthcheck" command
program.command('healthcheck')
  .description('Confirms end-to-end connectivity')
  .option('--format <type>', 'Output format', 'csv')
  .action(async (options) => {
    try {
      const response = await axios.get(`${BASE_URL}/admin/healthcheck`, {
        headers: getAuthHeader()
      });
      
      if (options.format === 'json') {
        console.log(JSON.stringify(response.data, null, 2));
      } else {
        const d = response.data;
        console.log("status,dbconnection,n_charge_points,n_charge_points_online,n_charge_points_offline");
        console.log(`${d.status},${d.dbconnection},${d.n_charge_points},${d.n_charge_points_online},${d.n_charge_points_offline}`);
      }
    } catch (error) {
      handleError(error);
    }
  });

// "resetpoints" command
program.command('resetpoints')
  .description('Resets the charging points')
  .option('--format <type>', 'Output format', 'csv')
  .action(async (options) => {
    try {
      const response = await axios.post(`${BASE_URL}/admin/resetpoints`, {}, {
        headers: getAuthHeader()
      });
      
      if (options.format === 'json') {
        console.log(JSON.stringify(response.data, null, 2));
      } else {
        console.log("status");
        console.log(response.data.status);
      }
    } catch (error) {
      handleError(error);
    }
  });

// "addpoints" command
program.command('addpoints')
  .description('Adds new charging points from CSV')
  .requiredOption('--source <file>', 'CSV file')
  .option('--format <type>', 'Output format', 'csv')
  .action(async (options) => {
    try {
      const form = new FormData();
      form.append('file', fs.createReadStream(options.source));

      const response = await axios.post(`${BASE_URL}/admin/addpoints`, form, {
        headers: {
          ...form.getHeaders(),
          ...getAuthHeader() // <--- TOKEN + FORM DATA HEADERS
        }
      });
      
      if (options.format === 'json') {
        console.log(JSON.stringify(response.data, null, 2));
      } else {
        console.log("status");
        console.log(response.data.status || "OK");
      }
    } catch (error) {
      handleError(error);
    }
  });

// "points" command
program.command('points')
  .description('Returns all charging points')
  .option('--status <status>', 'Filter by status (available, charging, offline, etc.)')
  .option('--format <type>', 'Output format (json or csv)', 'csv')
  .action(async (options) => {
    try {
      let url = `${BASE_URL}/points`;
      
      if (options.status) {
        // --- CHANGE HERE: Map 'offline' to 'outage' ---
        // The API expects 'outage', but the CLI user types 'offline'
        const queryStatus = (options.status === 'offline') ? 'outage' : options.status;
        url += `?status=${queryStatus}`;
      }

      const response = await axios.get(url, {
        headers: getAuthHeader()
      });
      
      if (options.format === 'json') {
        console.log(JSON.stringify(response.data, null, 2));
      } else {
        // CSV Output
        const list = response.data.points || response.data; 

        if (!Array.isArray(list) || list.length === 0) {
            console.log("No points found.");
        } else {
            // Header
            console.log("pointid,providerName,lon,lat,status,cap"); 
            
            list.forEach(p => {
                const pid = p.pointid;
                const prov = p.providerName || "null";
                const lon = p.lon;
                const lat = p.lat;
                const stat = p.status;
                const cap = p.cap;

                console.log(`${pid},${prov},${lon},${lat},${stat},${cap}`);
            });
        }
      }
    } catch (error) {
       handleError(error);
    }
  });

// "point" command
program.command('point')
  .description('Returns details for a specific charging point')
  .requiredOption('--id <id>', 'The ID of the charging point')
  .option('--format <type>', 'Output format (json or csv)', 'csv')
  .action(async (options) => {
    try {
      const response = await axios.get(`${BASE_URL}/points/${options.id}`, {
        headers: getAuthHeader()
      });
      
      if (options.format === 'json') {
        console.log(JSON.stringify(response.data, null, 2));
      } else {
        // CSV Output
        const p = response.data;
        
        // Header
        console.log("pointid,lon,lat,status,cap,reservationendtime,kwhprice");
        
        const pid = p.pointid;
        const lon = p.lon;
        const lat = p.lat;
        const stat = p.status;
        const cap = p.cap;
        const resEnd = p.reservationendtime;
        const price = p.kwhprice;

        console.log(`${pid},${lon},${lat},${stat},${cap},${resEnd},${price}`);
      }
    } catch (error) {
       handleError(error);
    }
  });

// "reserve" command
program.command('reserve')
  .description('Reserve a charging point')
  .requiredOption('--id <id>', 'Station ID')
  .requiredOption('--minutes <minutes>', 'Duration in minutes', '30')
  .option('--format <type>', 'Output format', 'csv')
  .action(async (options) => {
    try {
      let url = `${BASE_URL}/reserve/${options.id}`;
      if (options.minutes) url += `/${options.minutes}`;

      const response = await axios.post(url, {}, {
          headers: getAuthHeader()
      });
      
      if (options.format === 'json') {
        console.log(JSON.stringify(response.data, null, 2));
      } else {
        // CSV Output
        console.log("pointid,status,reservationendtime");
        
        const r = response.data;
        // Χειρισμός για την περίπτωση που το reservationendtime είναι null/undefined
        const endTime = r.reservationendtime || "";
        
        console.log(`${r.pointid},${r.status},${endTime}`);
      }
    } catch (error) {
      handleError(error);
    }
  });

// "updpoint" command
program.command('updpoint')
  .description('Update charging point status or price')
  .requiredOption('--id <id>', 'Station ID')
  .option('--status <status>', 'New status (available, charging, etc.)')
  .option('--price <price>', 'New price per kWh')
  .option('--format <type>', 'Output format', 'csv')
  .action(async (options) => {
    try {
      // Πρέπει να υπάρχει τουλάχιστον status ή price
      if (!options.status && !options.price) {
          console.error("Error: You must provide at least --status or --price.");
          process.exit(1);
      }

      const payload = {};
      if (options.status) payload.status = options.status;
      if (options.price) payload.kwhprice = parseFloat(options.price);

      const response = await axios.post(`${BASE_URL}/updpoint/${options.id}`, payload, {
          headers: getAuthHeader()
      });
      
      if (options.format === 'json') {
        console.log(JSON.stringify(response.data, null, 2));
      } else {
        // CSV Output
        console.log("pointid,status,kwhprice");
        const d = response.data;
        // Χειρισμός για τιμές που ίσως λείπουν
        const pId = d.pointid || d.id || "";
        const stat = d.status || "";
        const pr = d.kwhprice !== undefined ? d.kwhprice : "";
        
        console.log(`${pId},${stat},${pr}`);
      }
    } catch (error) {
      handleError(error);
    }
  });

// "newsession" command
program.command('newsession')
  .description('Record a new charging session')
  .requiredOption('--id <id>', 'Station ID')
  .requiredOption('--starttime <time>', 'Start time (YYYY-MM-DD HH:MM)')
  .requiredOption('--endtime <time>', 'End time (YYYY-MM-DD HH:MM)')
  .requiredOption('--startsoc <soc>', 'Starting SoC %')
  .requiredOption('--endsoc <soc>', 'Ending SoC %')
  .requiredOption('--totalkwh <kwh>', 'Total Energy in kWh')
  .requiredOption('--kwhprice <price>', 'Price per kWh')
  .requiredOption('--amount <amount>', 'Total Cost')
  .option('--format <type>', 'Output format', 'csv')
  .action(async (options) => {
    try {
      const payload = {
        pointid: options.id,
        starttime: options.starttime,
        endtime: options.endtime,
        startsoc: parseInt(options.startsoc),
        endsoc: parseInt(options.endsoc),
        totalkwh: parseFloat(options.totalkwh),
        kwhprice: parseFloat(options.kwhprice),
        amount: parseFloat(options.amount)
      };

      const response = await axios.post(`${BASE_URL}/newsession`, payload, {
          headers: getAuthHeader()
      });
      
      if (options.format === 'json') {
        console.log(JSON.stringify(response.data || {}, null, 2));
      } else {
        // CSV Output:
        console.log("status");
        console.log("OK");
      }
    } catch (error) {
      handleError(error);
    }
  });

// "sessions" command
program.command('sessions')
  .description('List charging sessions for a point')
  .requiredOption('--id <id>', 'Station ID')
  .requiredOption('--from <date>', 'From Date (YYYYMMDD)')
  .requiredOption('--to <date>', 'To Date (YYYYMMDD)')
  .option('--format <type>', 'Output format', 'csv')
  .action(async (options) => {
    try {
      // Καθαρισμός ημερομηνιών (π.χ. 2025-01-01 -> 20250101)
      const fromDate = options.from.replace(/-/g, '');
      const toDate = options.to.replace(/-/g, '');

      const response = await axios.get(`${BASE_URL}/sessions/${options.id}/${fromDate}/${toDate}`, {
          headers: getAuthHeader()
      });
      
      if (options.format === 'json') {
        console.log(JSON.stringify(response.data, null, 2));
      } else {
        // CSV Output
        console.log("starttime,endtime,startsoc,endsoc,totalkwh,kwhprice,amount");
        
        const list = response.data;
        if (Array.isArray(list)) {
            list.forEach(s => {
                // Χειρισμός null τιμών για ασφάλεια
                const start = s.starttime || "";
                const end = s.endtime || "";
                const sSoc = s.startsoc ?? 0;
                const eSoc = s.endsoc ?? 0;
                const kwh = s.totalkwh ?? 0;
                const price = s.kwhprice ?? 0;
                const amt = s.amount ?? 0;

                console.log(`${start},${end},${sSoc},${eSoc},${kwh},${price},${amt}`);
            });
        }
      }
    } catch (error) {
      handleError(error);
    }
  });

// "pointstatus" command
program.command('pointstatus')
  .description('List status changes for a point')
  .requiredOption('--id <id>', 'Station ID')
  .requiredOption('--from <date>', 'From Date (YYYYMMDD)')
  .requiredOption('--to <date>', 'To Date (YYYYMMDD)')
  .option('--format <type>', 'Output format', 'csv')
  .action(async (options) => {
    try {
      const fromDate = options.from.replace(/-/g, '');
      const toDate = options.to.replace(/-/g, '');

      const response = await axios.get(`${BASE_URL}/pointstatus/${options.id}/${fromDate}/${toDate}`, {
          headers: getAuthHeader()
      });
      
      if (options.format === 'json') {
        console.log(JSON.stringify(response.data, null, 2));
      } else {
        // CSV Output
        console.log("timeref,old_state,new_state");
        
        const list = response.data;
        if (Array.isArray(list)) {
            list.forEach(h => {
                const time = h.timeref || "";
                const oldS = h.old_state || "";
                const newS = h.new_state || "";
                console.log(`${time},${oldS},${newS}`);
            });
        }
      }
    } catch (error) {
      handleError(error);
    }
  });

// "addcard" command
program.command('addcard')
  .description('Adds a mock payment method to the user')
  .action(async () => {
    try {
      const url = `${BASE_URL}/payments/save-method`; 
      
      const payload = {
        paymentMethodId: "mock_pm_" + Date.now(), // ΑΥΤΟ ΠΕΡΙΜΕΝΕΙ ΤΟ ZOD
        provider: "mock",
        tokenLast4: "4242"
      };

      const response = await axios.post(url, payload, {
          headers: getAuthHeader()
      });
      
      console.log("status");
      console.log("OK");
      
    } catch (error) {
       handleError(error);
    }
  });

// --- Generic Error Handler ---
function handleError(error) {
    if (error.response) {
        if (error.response.status === 401) {
            console.error("Error: Unauthorized. Please login using 'se2502_new login'.");
        } else {
            console.error(`Status Code: ${error.response.status}`);
            console.error("Server Message:", JSON.stringify(error.response.data, null, 2));
        }
    } else {
        console.error("Error:", error.message);
    }
    // Τερματισμός με Error Code
    process.exit(1);
}

program.parse(process.argv);
