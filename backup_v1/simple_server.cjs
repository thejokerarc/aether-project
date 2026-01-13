const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// !!! REPLACE WITH YOUR ACTUAL GEMINI API KEY !!!
const GEMINI_API_KEY = "AIzaSyDwlts5WwhJXmzojEtgq5WeuXAYgvq_YM8";

const PORT = 3000;
const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg'
};

const SYSTEM_PROMPT = `
You are Jarvis, my permanent personal AI assistant and life OS.

You are optimized ONLY for me: a young male student and freelance web/tech worker living in Dakar, Senegal, born in the UK, fully bilingual (French/English). Your job is to track my life over time, remember key details, and help me think clearly and efficiently.

User core facts:
- Age: 18 years old.
- Gender: male.
- Location: Dakar, Sénégal (time zone: Africa/Dakar).
- Birth: born in the UK, now living in Senegal.
- Languages: French and English, both fluent; default to English unless I clearly switch.
- Phone for business: 774075688 (format and country code as needed for Senegal).
- Website / portfolio: https://vortixtech.netlify.app/
- Online alias / handle: chrollo (and any others the user adds later).

User skills and studies:
- Status: lycée-level student + self-taught programmer + small freelance/side web work.
- Coding baseline: Python, JavaScript, basic shell, web dev (WordPress, a bit of Django/Flask), game modding.
- Experience level: needs very detailed, step-by-step explanations for code and tooling.
- Typical school work: Essays, Memorization subjects, School management tools.

User projects:
- Personal website at vortixtech.netlify.app.
- School management plugins (Pronote-like).
- Building this Jarvis assistant (Gemini + ElevenLabs).

Response length and format rules (CRITICAL):
- The app interface is small.
- ALL answers must be SIMPLE, PRECISE, and SHORT by default.
- Default target:
  - 1–3 short sentences OR
  - 3–6 short bullet points max.
- No paragraphs longer than 3 sentences.
- No long introductions, no summaries, no conclusions.
- Only include code or long content if the user explicitly asks for it (e.g. “show full code”, “detailed version”).
- Cut all filler, motivation, and small talk. Focus only on the action or information requested.

Memory policy:
- If I ask to "Remember" or "Save", or give new goals/projects/schedule:
  1) Restate what should be stored concisely.
  2) Tag it (school, fitness, coding, contacts).
  3) Output strictly: MEMORY_WRITE: category=<category>; summary=<short description>; detail=<longer detail >

SYSTEM CONTROL:
- If I ask to open an app (Calculator, Notepad, Chrome, Settings), acknowledge it briefly.
`;

// System Command Mappings
function processCommand(instruction) {
    const lower = instruction.toLowerCase();
    if (lower.includes('calc')) return 'calc';
    if (lower.includes('notepad')) return 'notepad';
    if (lower.includes('explorer')) return 'explorer';
    if (lower.includes('cmd')) return 'start cmd';
    if (lower.includes('task manager')) return 'taskmgr';
    if (lower.includes('chrome') || lower.includes('browser')) return 'start chrome';
    if (lower.includes('screenshot')) return 'snippingtool';
    if (lower.includes('settings')) return 'start ms-settings:';
    if (lower.startsWith('open ')) {
        const target = lower.replace('open ', '').trim();
        return `start ${target}`;
    }
    return null;
}

// Call Gemini API
async function askGemini(text) {
    if (GEMINI_API_KEY === "INSERT_YOUR_KEY_HERE") return "Please configure your Gemini API Key in simple_server.cjs";

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    role: "user",
                    parts: [{ text: SYSTEM_PROMPT + "\n\nUSER QUERY: " + text }]
                }]
            })
        });
        const data = await response.json();

        if (data.candidates && data.candidates.length > 0) {
            return data.candidates[0].content.parts[0].text;
        } else if (data.error) {
            console.error("Gemini API Error:", data.error);
            return "API Error: " + data.error.message;
        } else {
            return "I am unable to process that request. (Check Server Logs)";
        }
    } catch (err) {
        console.error("Gemini API Connection Failed:", err);
        return "Critical Failure: Neural Net Disconnected.";
    }
}

http.createServer(async (req, res) => {
    console.log(`${req.method} ${req.url}`);

    // --- API: CHAT / COMMANDS ---
    if (req.method === 'POST' && req.url === '/api/chat') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            const data = JSON.parse(body);
            const userText = data.text || '';
            const cmd = processCommand(userText);

            let responseText = "";
            let systemAction = null;

            if (cmd) {
                console.log("Executing System Command:", cmd);
                exec(cmd, (err) => { if (err) console.error("Exec Error:", err); });
                responseText = `Executing system protocol: ${userText}`;
                systemAction = cmd;
            } else {
                // No regex command -> Ask AI
                responseText = await askGemini(userText);
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                reply: responseText,
                action: systemAction
            }));
        });
        return;
    }

    // --- STATIC FILES ---
    let filePath = '.' + req.url;
    if (filePath === './') {
        filePath = './public/index.html';
    }

    const extname = path.extname(filePath);
    let contentType = MIME_TYPES[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code == 'ENOENT') {
                res.writeHead(404);
                res.end('404 Not Found');
            } else {
                res.writeHead(500);
                res.end('Error: ' + error.code);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });

}).listen(PORT);

console.log(`Zeno Server (System + Gemini Active) running at http://localhost:${PORT}/`);
