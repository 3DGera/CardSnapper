FROM node:18-slim
RUN apt-get update && apt-get install -y openssl
WORKDIR /app
COPY package.json .
RUN npm install
# Zuerst alles kopieren...
COPY . .
# ...dann die Zertifikate im Container frisch generieren (überschreibt evtl. kaputte lokale Dateien)
RUN openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -sha256 -days 365 -nodes -subj "/CN=localhost"
EXPOSE 3000
CMD ["node", "server.js"]