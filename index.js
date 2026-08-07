index.js                <input type="text" id="phone" placeholder="Enter number with country code (e.g. 923...)">
                <button onclick="requestCode()">Generate Pairing Code</button>
                <div id="status"></div>
            </div>
            <script>
                async function requestCode() {
                    const phone = document.getElementById('phone').value.trim();
                    const status = document.getElementById('status');
                    if (!phone) { status.innerHTML = "<span style='color: #ef4444;'>Please enter a valid phone number!</span>"; return; }
                    status.innerHTML = "Requesting pairing code, please wait...";
                    try {
                        let res = await fetch('/pair?phone=' + phone);
                        let data = await res.json();
                        if (data.code) {
                            status.innerHTML = "Your Pairing Code: <br><b style='font-size: 24px; color: #4ade80; background: #1f2937; padding: 10px; display: inline-block; margin-top: 10px; border-radius: 6px;'>" + data.code + "</b><br><small style='color:#9ca3af'>Check WhatsApp Linked Devices to enter this code.</small>";
                        } else {
                            status.innerHTML = "<span style='color: #ef4444;'>Error: " + (data.error || "Failed") + "</span>";
                        }
                    } catch (e) {
                        status.innerHTML = "<span style='color: #ef4444;'>Network error! Try again.</span>";
                    }
                }
            </script>
        </body>
        </html>
    `);
});

// Pairing Backend Logic
app.get('/pair', async (req, res) => {
    let num = req.query.phone;
    if (!num) return res.json({ error: "Phone number is missing" });
    
    num = num.replace(/[^0-9]/g, '');
    const sessionDir = `./session_${num}`;

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    try {
        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            logger: pino({ level: 'silent' }),
            browser: Browsers.macOS("Chrome")
        });

        if (!sock.authState.creds.registered) {
            await delay(1500);
            let code = await sock.requestPairingCode(num);
            code = code?.match(/.{1,4}/g)?.join("-") || code;
            res.json({ code });
        } else {
            res.json({ error: "Already registered session!" });
        }

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection } = update;
            if (connection === 'open') {
                await delay(10000);
                try {
                    const credsPath = `${sessionDir}/creds.json`;
                    if (fs.existsSync(credsPath)) {
                        const credsData = fs.readFileSync(credsPath, 'utf8');
                        const base64Session = Buffer.from(credsData).toString('base64');
                        const sessionIdMsg = `*JOKER-XD SESSION ID* 🃏\n\nHere is your session ID. Do not share it with anyone:\n\n\`JOKER-XD~${base64Session}\``;
                        await sock.sendMessage(sock.user.id, { text: sessionIdMsg });
                    }
                } catch (e) {
                    console.log("Error sending session:", e);
                }

                setTimeout(() => {
                    fs.rmSync(sessionDir, { recursive: true, force: true });
                }, 15000);
            }
        });

    } catch (err) {
        console.log(err);
        res.status(500).json({ error: "Service busy, try again later." });
    }
});

app.listen(PORT, () => {
    console.log(`Joker-XD Pairing Server running on port ${PORT}`);
});
  
