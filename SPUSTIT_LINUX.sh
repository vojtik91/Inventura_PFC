#!/bin/bash
cd "$(dirname "$0")"
echo "Aplikace běží na http://localhost:8080"
echo "Pro telefon použijte IP adresu tohoto počítače a port 8080."
python3 -m http.server 8080 --bind 0.0.0.0
