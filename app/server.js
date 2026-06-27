const express = require('express');
const https = require('https');
const fs = require('fs');
const path = require('path');
const app = express();

const options = {
    key: fs.readFileSync('key.pem'),
    cert: fs.readFileSync('cert.pem')
};

app.use(express.static('public'));
app.use(express.json({ limit: '100mb' }));

const TARGET_DIR = '/Karten';
if (!fs.existsSync(TARGET_DIR)) fs.mkdirSync(TARGET_DIR);

app.get('/ping', (req, res) => res.json({ status: 'pong' }));

app.post('/log', (req, res) => {
    console.log(`[IPHONE] ${req.body.msg}`);
    res.sendStatus(200);
});

app.post('/upload', (req, res) => {
    try {
        const imgData = req.body.image.replace(/^data:image\/png;base64,/, "");
        const now = new Date();
        const dateStr = now.getFullYear() + 
                        String(now.getMonth() + 1).padStart(2, '0') + 
                        String(now.getDate()).padStart(2, '0');

        const files = fs.readdirSync(TARGET_DIR);
        const todayFiles = files.filter(f => f.startsWith(dateStr));
        const nextNum = String(todayFiles.length + 1).padStart(5, '0');
        const fileName = `${dateStr}_${nextNum}.png`;

        fs.writeFile(path.join(TARGET_DIR, fileName), imgData, 'base64', (err) => {
            if (err) return res.status(500).json({status: 'error'});
            console.log("Karte gespeichert:", fileName);
            res.json({ status: 'ok', file: fileName });
        });
    } catch (e) {
        res.status(500).json({status: 'error'});
    }
});

https.createServer(options, app).listen(3000, '0.0.0.0', () => {
    console.log('PokeScanner HD Server läuft auf Port 3000');
});