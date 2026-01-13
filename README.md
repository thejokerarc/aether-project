# Zeno OS - AI Assistant

This is the full source code for Zeno OS. Since you are resetting your PC, follow these steps to get it running again.

## 🚀 Post-Reset Setup

1. **Install Node.js**: Download from [nodejs.org](https://nodejs.org/).
2. **Install Git**: Download from [git-scm.com](https://git-scm.com/).
3. **Clone this Repo**:
   ```bash
   git clone https://github.com/thejokerarc/aether-project.git
   cd aether-project
   ```
4. **Install Dependencies**:
   ```bash
   npm install
   ```
5. **Set API Keys**:
   - Open `simple_server.cjs`
   - Replace `YOUR_GROQ_API_KEY_HERE` with your Groq key.
   - Replace `YOUR_GEMINI_API_KEY_HERE` with your Gemini key.

## 🛠️ How to Build the .exe

To create the Windows executable:
```bash
npm run dist
```
The `.exe` will be generated in the `dist/` folder.

## 🎙️ Features
- **Voice Recognition**: Wake word "Jarvis" or Click Mic.
- **Vision**: Capture webcam or Upload images.
- **Chat UI**: Interactive logs with 💬 icon.
- **Dual Brain**: Switch between Gemini (Latest Info) and Groq (Fast/Kimi K2).
