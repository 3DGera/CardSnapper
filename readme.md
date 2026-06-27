# CardSnapper 📸

ist eine spezialisierte Web-Applikation, die in einem Docker-Container läuft und ein Handy in einen vollautomatischen Hochleistungs-Scanner für Sammelkarten (optimiert für Pokémon) verwandelt. 

Dieses Projekt wurde speziell für das Hosting auf **Unraid** entwickelt und nutzt **OpenCV.js**, um Karten in einer physischen Scannerbox automatisch zu erkennen, perspektivisch zu korrigieren (Crop) und in Ultra-HD für die anschließende KI-Analyse (VLM) zu speichern.

## ✨ Features

- **Motion Detection:** Erkennt automatisch, wenn eine neue Karte auf den Stapel gelegt wird.
- **HSV-Gelb-Filter:** Sucht gezielt nach dem gelben Pokémon-Kartenrand für maximale Erkennungsrate.
- **Auto-Perspective-Crop:** Korrigiert schräg liegende Karten und entzerrt sie auf ein perfektes Seitenverhältnis (1500x2100px).
- **HD Quality:** Nutzt die volle 4K-Auflösung des iPhones für knackscharfe Texte (ideal für OCR/VLM).
- **Stapel-Modus:** Ermöglicht das Scannen hunderter Karten hintereinander, ohne das Handy zu berühren.
- **Unraid Optimized:** Einfacher Build-Prozess und persistente Speicherung im Appdata-Share.

---

## 🛠 Voraussetzungen

- **Unraid Server** (getestet auf Version 6.12+)
- **Netzwerk:** Smartphone und Docker müssen im selben WLAN/LAN sein.

---

## 🚀 Installation auf Unraid

Da Unraid Images standardmäßig aus der Registry zieht, wir aber ein lokales Dockerfile nutzen, muss das Image einmalig manuell im Terminal gebaut werden.

### 1. Dateien vorbereiten
Kopiere die Projektstruktur in deinen Appdata-Ordner auf Unraid (z.B. per SMB oder mit dem "Krusader" Plugin):
```text
/mnt/user/appdata/cardsnapper/
├── docker-compose.yml
├── Karten/             <-- Hier landen die Fotos
└── app/
    ├── Dockerfile
    ├── package.json
    ├── server.js
    └── public/
        ├── index.html
        └── script.js
```

### 2. Image manuell builden
1. Öffne das Unraid-Terminal (Symbol `>_` oben rechts).
2. Navigiere in den Projektordner:
   ```bash
   cd /mnt/user/appdata/pokescanner
   ```
3. Baue das Docker-Image lokal:
   ```bash
   docker build -t pokescanner ./app
   ```
   *Dieser Befehl erstellt das Image "pokescanner", installiert alle Abhängigkeiten und generiert die SSL-Zertifikate für HTTPS.*

### 3. Container in Unraid GUI anlegen
1. Gehe zum Tab **Docker** und klicke unten auf **Add Container**.
2. **Name:** `CardSnapper`
3. **Repository:** `cardsnapper:latest`
4. **Network Type:** `Bridge`
5. **Port hinzufügen:** 
   - Host Port: `5000` (oder ein freier Port deiner Wahl)
   - Container Port: `3000`
6. **Pfad hinzufügen (Volume):**
   - Host Path: `/mnt/user/appdata/cardsnapper/Karten/`
   - Container Path: `/Karten`
   - Access Mode: `Read/Write`
7. Klicke auf **Apply**.

---

## 📱 Nutzung am Handy

Da die Kamerafunktion im Browser zwingend **HTTPS** erfordert, nutzt der Container ein selbstsigniertes Zertifikat.

1. **Aufrufen:** Öffne Chrome oder Safari auf dem iPhone und gib `https://DEINE-UNRAID-IP:5000` ein.
2. **SSL-Warnung:** Bestätige die Warnung ("Dies ist keine sichere Verbindung") mit **Erweitert -> Website trotzdem besuchen**.
3. **Der Ping-Handshake (Wichtig):** 
   Damit das Handy den Upload erlaubt, öffne einmalig in einem neuen Tab: `https://DEINE-IP:5000/ping`. Wenn dort `{"status":"pong"}` steht, gehe zurück zum Scanner.
4. **Start:**
   - Tippe auf **1. KAMERA STARTEN** und erlaube den Zugriff.
   - Nutze die **Pinch-Geste** (zwei Finger), um die Karte im Rahmen einzuzoomen.
   - Tippe auf **2. AUTOMATION STARTEN**.
5. **Scannen:** Schiebe die Karten nacheinander in die Box. Sobald die Karte still liegt, löst der Scanner automatisch aus.

---

## 📁 Datenablage
Die Bilder werden im Format `JJJJMMDD_00001.png` im Ordner `/mnt/user/appdata/cardsnapper/Karten/` gespeichert. Durch das PNG-Format bleiben alle Details für die spätere KI-Analyse erhalten.
