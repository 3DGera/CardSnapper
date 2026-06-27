let video = document.getElementById('video');
let btnStart = document.getElementById('btnStart');
let statusTxt = document.getElementById('status-text');
let zoomLabel = document.getElementById('zoom-label');

let isCvReady = false;
let autoActive = false;
let track = null;
let zoomVal = 1.0;
let lastFrame = null;
let motion = false;
let stable = 0;

// Fehler-Reporting an Unraid Log
async function reportLog(msg) {
    console.log(msg);
    try {
        await fetch('/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ msg: msg })
        });
    } catch(e) { console.error("Log-Senden fehlgeschlagen"); }
}

function cvReady() {
    isCvReady = true;
    statusTxt.innerText = "System bereit";
    btnStart.disabled = false;
    btnStart.innerText = "1. KAMERA STARTEN";
}

async function startCam() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { 
                facingMode: "environment", 
                width: { ideal: 3840 }, 
                height: { ideal: 2160 } 
            }
        });
        video.srcObject = stream;
        track = stream.getVideoTracks()[0];
        await video.play();
        setupPinchZoom();
        btnStart.innerText = "2. AUTOMATION STARTEN";
        btnStart.style.background = "#ff9500";
        statusTxt.innerText = "Kamera aktiv";
        return true;
    } catch (e) {
        reportLog("Fehler Kamera-Start: " + e.message);
        return false;
    }
}

function setupPinchZoom() {
    let startDist = 0;
    video.addEventListener('touchstart', e => {
        if (e.touches.length === 2) {
            e.preventDefault();
            startDist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
        }
    }, { passive: false });

    video.addEventListener('touchmove', async e => {
        if (e.touches.length === 2 && track) {
            e.preventDefault();
            let dist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
            let delta = (dist - startDist) / 120;
            startDist = dist;
            const caps = track.getCapabilities();
            if (caps.zoom) {
                zoomVal = Math.min(Math.max(zoomVal + delta, caps.zoom.min), caps.zoom.max);
                await track.applyConstraints({ advanced: [{ zoom: zoomVal }] });
                zoomLabel.innerText = `Zoom: ${zoomVal.toFixed(1)}x`;
            }
        }
    }, { passive: false });
}

btnStart.onclick = async () => {
    if (!track) { await startCam(); return; }
    autoActive = !autoActive;
    btnStart.classList.toggle('active', autoActive);
    btnStart.innerText = autoActive ? "SCANNER STOPPEN" : "2. AUTOMATION STARTEN";
    if (autoActive) loop();
};

function loop() {
    if (!autoActive || !isCvReady) return;
    let canvas = document.createElement('canvas');
    canvas.width = 160; canvas.height = 120;
    let ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, 160, 120);
    let curr = ctx.getImageData(0, 0, 160, 120).data;

    if (lastFrame) {
        let totalDiff = 0;
        for (let i = 0; i < curr.length; i += 40) {
            let pDiff = Math.abs(curr[i] - lastFrame[i]) + Math.abs(curr[i+1] - lastFrame[i+1]) + Math.abs(curr[i+2] - lastFrame[i+2]);
            if (pDiff > 45) totalDiff += pDiff;
        }

        if (totalDiff > 18000) { 
            motion = true; stable = 0;
            statusTxt.innerText = "Karte wird bewegt...";
        } else if (motion) {
            stable++;
            statusTxt.innerText = `Fokus stabilisieren... (${stable}/12)`;
            if (stable >= 12) {
                motion = false; stable = 0;
                capture();
            }
        } else {
            statusTxt.innerText = "Warte auf Karte...";
        }
    }
    lastFrame = curr;
    setTimeout(loop, 90);
}

function sortCorners(points) {
    let pts = points.map(p => ({ x: p.x, y: p.y }));
    let sorted = new Array(4);
    let sums = pts.map(p => p.x + p.y);
    sorted[0] = pts[sums.indexOf(Math.min(...sums))]; 
    sorted[2] = pts[sums.indexOf(Math.max(...sums))]; 
    let diffs = pts.map(p => p.y - p.x);
    sorted[1] = pts[diffs.indexOf(Math.min(...diffs))]; 
    sorted[3] = pts[diffs.indexOf(Math.max(...diffs))]; 
    return sorted;
}

async function capture() {
    statusTxt.innerText = "📸 ANALYSE...";
    
    // Matrizen als null initialisieren für sicheres Löschen im finally
    let src = null, hsv = null, mask = null, contours = null, hierarchy = null, M = null;
    
    try {
        if (track.applyConstraints) await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] });
        await new Promise(r => setTimeout(r, 850));

        const offscreenCanvas = document.createElement('canvas');
        offscreenCanvas.width = video.videoWidth;
        offscreenCanvas.height = video.videoHeight;
        offscreenCanvas.getContext('2d').drawImage(video, 0, 0);
        
        src = cv.imread(offscreenCanvas);
        hsv = new cv.Mat();
        mask = new cv.Mat();

        cv.cvtColor(src, hsv, cv.COLOR_RGBA2RGB);
        cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV);

        // Pokémon Gelb-Filter
        let low = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [15, 80, 70, 0]);
        let high = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [45, 255, 255, 255]);
        cv.inRange(hsv, low, high, mask);
        low.delete(); high.delete();

        M = cv.Mat.ones(5, 5, cv.CV_8U);
        cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, M);

        contours = new cv.MatVector();
        hierarchy = new cv.Mat();
        cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

        let found = null;
        let maxA = 0;
        for (let i = 0; i < contours.size(); ++i) {
            let cnt = contours.get(i);
            let area = cv.contourArea(cnt);
            if (area > 80000) {
                let peri = cv.arcLength(cnt, true);
                let approx = new cv.Mat();
                cv.approxPolyDP(cnt, approx, 0.025 * peri, true);
                if (approx.rows === 4 && area > maxA) {
                    if (found) found.delete();
                    found = approx;
                    maxA = area;
                } else { approx.delete(); }
            }
        }

        let finalData;
        if (found) {
            let dw = 1500; let dh = 2100; 
            let rawPoints = [];
            for (let i = 0; i < 4; i++) rawPoints.push({ x: found.data32S[i * 2], y: found.data32S[i * 2 + 1] });
            let s = sortCorners(rawPoints);
            let srcCoords = cv.matFromArray(4, 1, cv.CV_32FC2, [s[0].x, s[0].y, s[1].x, s[1].y, s[2].x, s[2].y, s[3].x, s[3].y]);
            let dstCoords = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, dw, 0, dw, dh, 0, dh]);
            let M_trans = cv.getPerspectiveTransform(srcCoords, dstCoords);
            let result = new cv.Mat();
            cv.warpPerspective(src, result, M_trans, new cv.Size(dw, dh));
            const tempCanvas = document.getElementById('tempCanvas');
            tempCanvas.width = dw; tempCanvas.height = dh;
            cv.imshow('tempCanvas', result);
            finalData = tempCanvas.toDataURL('image/png');
            M_trans.delete(); result.delete(); srcCoords.delete(); dstCoords.delete(); found.delete();
            statusTxt.innerText = "CROP GESPEICHERT!";
        } else {
            finalData = offscreenCanvas.toDataURL('image/png');
            statusTxt.innerText = "BACKUP GESPEICHERT!";
        }

        await fetch('/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: finalData })
        });
        
        document.body.style.opacity = "0.5";
        setTimeout(() => { document.body.style.opacity = "1"; }, 150);

    } catch (e) {
        reportLog("Kritischer Fehler Capture: " + (e.message || e.toString()));
    } finally {
        // Sicherer Cleanup: Nur löschen, was initialisiert wurde
        if (src) src.delete();
        if (hsv) hsv.delete();
        if (mask) mask.delete();
        if (contours) contours.delete();
        if (hierarchy) hierarchy.delete();
        if (M) M.delete();
    }
}