const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// API KEYS - Set these as environment variables or replace with your own
const GROQ_API_KEY = process.env.GROQ_API_KEY || "YOUR_GROQ_API_KEY_HERE";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "YOUR_GEMINI_API_KEY_HERE";

// SET ACTIVE AI ENGINE: 'gemini' or 'groq'
const ACTIVE_ENGINE = 'groq';  // Groq is more reliable with better rate limits

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
You are Jarvis, my intelligent, permanent personal AI agent, gaming companion, and life OS. You live on my Windows desktop.

**Identity & Style:**
- **Personality**: Competent, witty, loyal, and highly intelligent. You are not a generic bot; you are MY agent.
- **Tone**: Professional but friendly. Use your internal knowledge to provide insightful answers.
- **Conciseness**: Keep spoken responses efficient (no essays), but do NOT sacrifice intelligence or important details for brevity. If a complex topic requires more depth, provide it.

**User Profile:**
- **Name/Alias**: Chrollo (or User).
- **Location**: Dakar, Senegal.
- **Role**: 18yo student, freelancer, self-taught dev.
- **Languages**: Fluent in English & French.

**Operating Rules:**
1. **Intelligence First**: Don't just give surface-level answers. If asked about a topic, use your training data to explain it well.
2. **Formatting**: 
   - Ensure your output is primarily natural language associated with the user's query.
   - Do NOT output "MEMORY_WRITE" or debug tags unless specifically asked to "Log" something.
   - If you need to perform actions (like System Control), assume the system handles the command logic if you match the trigger words.
3. **Vision**: 
   - If an image is attached, analyze it deeply. Don't just describe pixels; understand the context (e.g., if it's code, debug it; if it's a meme, laugh).

**Capabilities:**
- You can control system apps (Calc, Notepad, Browser, etc.) via keywords.
- You have access to real-time vision (Llama 4 Vision).
- You are the brain of this OS. Act like it.
`;

// System Command Mappings - EXPANDED
function processCommand(instruction) {
    const lower = instruction.toLowerCase();

    // Apps
    if (lower.includes('calc')) return 'calc';
    if (lower.includes('notepad')) return 'notepad';
    if (lower.includes('explorer') || lower.includes('files')) return 'explorer';
    if (lower.includes('cmd') || lower.includes('terminal') || lower.includes('command prompt')) return 'start cmd';
    if (lower.includes('powershell')) return 'start powershell';
    if (lower.includes('task manager')) return 'taskmgr';
    if (lower.includes('chrome') || lower.includes('browser')) return 'start chrome';
    if (lower.includes('edge')) return 'start msedge';
    if (lower.includes('firefox')) return 'start firefox';
    if (lower.includes('screenshot') || lower.includes('snip')) return 'snippingtool';
    if (lower.includes('paint')) return 'mspaint';
    if (lower.includes('word')) return 'start winword';
    if (lower.includes('excel')) return 'start excel';
    if (lower.includes('powerpoint')) return 'start powerpnt';
    if (lower.includes('spotify')) return 'start spotify:';
    if (lower.includes('discord')) return 'start discord:';
    if (lower.includes('vscode') || lower.includes('code') || lower.includes('visual studio')) return 'code';

    // System
    if (lower.includes('settings')) return 'start ms-settings:';
    if (lower.includes('wifi') || lower.includes('network')) return 'start ms-settings:network-wifi';
    if (lower.includes('bluetooth')) return 'start ms-settings:bluetooth';
    if (lower.includes('sound') || lower.includes('audio') || lower.includes('volume')) return 'start ms-settings:sound';
    if (lower.includes('display') || lower.includes('screen') || lower.includes('brightness')) return 'start ms-settings:display';
    if (lower.includes('battery') || lower.includes('power')) return 'start ms-settings:batterysaver';
    if (lower.includes('lock')) return 'rundll32.exe user32.dll,LockWorkStation';
    if (lower.includes('sleep')) return 'rundll32.exe powrprof.dll,SetSuspendState 0,1,0';
    if (lower.includes('restart')) return 'shutdown /r /t 5';
    if (lower.includes('shutdown') || lower.includes('shut down')) return 'shutdown /s /t 5';

    // Web searches
    if (lower.includes('search') || lower.includes('google')) {
        const query = lower.replace(/search|google|for/gi, '').trim();
        return `start chrome "https://www.google.com/search?q=${encodeURIComponent(query)}"`;
    }
    if (lower.includes('youtube')) {
        const query = lower.replace(/youtube|play|video/gi, '').trim();
        return `start chrome "https://www.youtube.com/results?search_query=${encodeURIComponent(query)}"`;
    }

    // Generic open
    if (lower.startsWith('open ')) {
        const target = lower.replace('open ', '').trim();
        return `start ${target}`;
    }

    return null;
}

// --- WEB SEARCH FUNCTION (DuckDuckGo Instant Answers) ---
// Made optional with 3s timeout - will not block main request
async function webSearch(query) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

    try {
        const searchUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`;
        const response = await fetch(searchUrl, { signal: controller.signal });
        clearTimeout(timeoutId);
        const data = await response.json();

        let results = [];

        // Get abstract (main answer)
        if (data.AbstractText) {
            results.push(`Summary: ${data.AbstractText}`);
        }

        // Get related topics
        if (data.RelatedTopics && data.RelatedTopics.length > 0) {
            const topics = data.RelatedTopics.slice(0, 3);
            topics.forEach(topic => {
                if (topic.Text) results.push(topic.Text);
            });
        }

        return results.length > 0 ? results.join('\n') : null;
    } catch (error) {
        clearTimeout(timeoutId);
        // Silently fail - web search is optional
        console.log("Web search skipped (timeout/error)");
        return null;
    }
}

// --- GOOGLE GEMINI API (2.5 Flash - Late 2024 training data) ---
async function askGemini(text, imageData = null) {
    try {
        // Build contents array
        const parts = [{ text: SYSTEM_PROMPT + "\n\nUser: " + text }];

        // Add image if provided
        if (imageData) {
            // Extract base64 data from data URL
            const base64Data = imageData.split(',')[1];
            const mimeType = imageData.match(/data:(.+);base64/)?.[1] || 'image/png';
            parts.push({
                inline_data: {
                    mime_type: mimeType,
                    data: base64Data
                }
            });
        }

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: parts }],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 2048
                }
            })
        });

        const data = await response.json();

        if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
            return data.candidates[0].content.parts[0].text;
        } else if (data.error) {
            console.error("Gemini API Error:", data.error);
            return "Gemini Error: " + data.error.message;
        } else {
            console.log("Gemini Response:", JSON.stringify(data));
            return "I couldn't process that request. Please try again.";
        }
    } catch (error) {
        console.error("Gemini Fetch Error:", error);
        return "Connection Error: " + error.message;
    }
}

// --- CONVERSATION HISTORY (Memory) ---
let conversationHistory = [];

async function askGroq(text, imageData = null) {
    if (GEMINI_API_KEY === "INSERT_YOUR_KEY_HERE" || !GEMINI_API_KEY) return "Please configure your Groq API Key in Settings.";

    try {
        // Attempt web search for knowledge-based questions
        let searchContext = "";
        const needsSearch = text.toLowerCase().includes("who is") ||
            text.toLowerCase().includes("what is") ||
            text.toLowerCase().includes("tell me about") ||
            text.toLowerCase().includes("explain") ||
            text.toLowerCase().includes("from") ||
            text.toLowerCase().includes("news");

        if (needsSearch && !imageData) {
            const searchResult = await webSearch(text);
            if (searchResult) {
                searchContext = `\n\n[WEB SEARCH RESULTS for "${text}"]\n${searchResult}\n[END RESULTS]\n\nUse the above search results to provide an accurate answer. If the results don't help, use your training data.`;
            }
        }

        // Construct the full message chain
        const messages = [
            { role: "system", content: SYSTEM_PROMPT + searchContext }
        ];

        // Append history
        conversationHistory.forEach(msg => messages.push(msg));

        // Current User Message
        const userContent = [{ type: "text", text: text }];
        if (imageData) {
            userContent.push({
                type: "image_url",
                image_url: { url: imageData }
            });
        }

        // Add current message to temp request list (and save to history later)
        const currentUserMsg = { role: "user", content: userContent };
        messages.push(currentUserMsg);

        // API Call - HYBRID MODEL SELECTION
        // Use Kimi K2 (Moonshot's latest) for text, Scout for vision
        const selectedModel = imageData
            ? "meta-llama/llama-4-scout-17b-16e-instruct"  // Vision-capable
            : "moonshotai/kimi-k2-instruct";               // Latest & smartest

        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${GROQ_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: selectedModel,
                messages: messages,
                temperature: 0.7,
                max_tokens: 2048,  // Increased for detailed responses
                top_p: 1,
                stream: false,
                stop: null
            })
        });

        const data = await response.json();

        if (data.choices && data.choices.length > 0) {
            let reply = data.choices[0].message.content;

            // SANITIZE: Detect repetitive loops and truncate
            const words = reply.split(' ');
            if (words.length > 50) {
                // Check for repetition pattern
                const lastPhrase = words.slice(-10).join(' ');
                const firstPart = words.slice(0, 40).join(' ');
                if (reply.includes(lastPhrase) && reply.indexOf(lastPhrase) !== reply.lastIndexOf(lastPhrase)) {
                    // Detected loop, truncate to first occurrence
                    reply = reply.substring(0, reply.indexOf(lastPhrase) + lastPhrase.length);
                    reply += " [Response truncated due to repetition]";
                }
            }

            // Limit response length to prevent UI overflow
            if (reply.length > 2000) {
                reply = reply.substring(0, 2000) + "...";
            }

            // UPDATE HISTORY
            // We use a simplified text structure for history to save tokens/complexity, 
            // but for vision we might just save the text part or keep structure if needed.
            // keeping it simple:
            conversationHistory.push({ role: "user", content: text }); // Store text-only for history to avoid massive base64 payloads
            conversationHistory.push({ role: "assistant", content: reply });

            // Limit history to last 20 turns to prevent context overflow
            if (conversationHistory.length > 20) conversationHistory = conversationHistory.slice(conversationHistory.length - 20);

            return reply;
        } else if (data.error) {
            console.error("Groq API Error:", data.error);
            return "Groq Error: " + data.error.message;
        } else {
            return "Server Error: No response from Llama.";
        }
    } catch (error) {
        console.error("Server Fetch Error:", error);
        return "Connection Error: " + error.message;
    }
}

const server = http.createServer(async (req, res) => {
    console.log(`${req.method} ${req.url}`);

    // CORS HEADERS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // HANDLE PREFLIGHT
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.method === 'POST' && req.url === '/api/chat') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            const data = JSON.parse(body);
            const userText = data.text || '';
            const imageData = data.image || null;
            const cmd = processCommand(userText);

            // Handle New Chat / Reset
            if (userText.toLowerCase().includes("new chat") || userText.toLowerCase().includes("reset memory")) {
                conversationHistory = [];
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ response: "Memory cleared. Starting a fresh conversation." }));
                return;
            }

            let responseText = "";
            let systemAction = null;

            if (cmd) {
                console.log("Executing System Command:", cmd);
                exec(cmd, (err) => { if (err) console.error("Exec Error:", err); });
                responseText = `Executing system protocol: ${userText}`;
                systemAction = cmd;
            } else {
                // USE ACTIVE ENGINE
                if (ACTIVE_ENGINE === 'gemini') {
                    responseText = await askGemini(userText, imageData);
                } else {
                    responseText = await askGroq(userText, imageData);
                }
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ response: responseText, action: systemAction }));
        });
        return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    let pathname = url.pathname;

    // Default to index.html for root
    if (pathname === '/') pathname = '/public/index.html';

    // Ensure we look in the project root (where simple_server.cjs lives)
    const filePath = path.join(__dirname, pathname);
    const extname = path.extname(filePath);
    let contentType = MIME_TYPES[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            console.error(`File Read Error: ${filePath}`, error);
            res.writeHead(error.code == 'ENOENT' ? 404 : 500);
            res.end(error.code == 'ENOENT' ? '404 Not Found' : 'Error: ' + error.code);
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.log('Port 3000 busy, trying fallback...');
        setTimeout(() => server.listen(PORT), 1000);
    }
});

server.listen(PORT, () => {
    console.log(`Zeno Server running at http://localhost:${PORT}/`);
});

