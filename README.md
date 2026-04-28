# CivicFlow 🇮🇳🗳️

![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express.js](https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white)
![HTMX](https://img.shields.io/badge/HTMX-336699?style=for-the-badge&logo=htmx&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)
![Gemini AI](https://img.shields.io/badge/Gemini_AI-8E75B2?style=for-the-badge&logo=google&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)

**The Intelligent Indian Election Navigator**

CivicFlow is an AI-powered civic assistant designed to guide Indian citizens through the electoral process. Built with a lightweight HTMX frontend and an Express/Gemini backend, it helps users check voting eligibility, dynamically fetch polling station locations via GPS, and view data on local representatives.

---

## 📑 Table of Contents

1. [Tech Stack](#-tech-stack)
2. [Installation & Quick Start Guide](#-installation--quick-start-guide)
3. [Usage Examples](#-usage-examples)
4. [Contribution Guidelines](#-contribution-guidelines)
5. [License](#-license)
6. [Support & Contact](#-support--contact)

---

## 🛠️ Tech Stack

CivicFlow is built prioritizing performance, minimal client-side JavaScript, and robust AI integration:

* **Frontend**: HTML5, [HTMX](https://htmx.org/) (for zero-JS AJAX state), [Alpine.js](https://alpinejs.dev/) (for lightweight UI reactivity), and [Tailwind CSS](https://tailwindcss.com/) v4.
* **Backend**: Node.js, Express.js (TypeScript).
* **AI Integration**: Google GenAI SDK (`gemini-2.5-flash`) for natural language processing and context-aware responses.
* **Security**: `express-rate-limit` for DDOS protection, `isomorphic-dompurify` for XSS sanitization, and strict CORS configuration.

---

## 🚀 Installation & Quick Start Guide

Follow these steps to get a local development environment running:

### Prerequisites
* Node.js (v18 or higher recommended)
* A valid Google Gemini API Key

### 1. Clone the Repository
```bash
git clone [https://github.com/your-org/civicflow.git](https://github.com/your-org/civicflow.git)
cd civicflow
2. Install Dependencies
Bash
npm install
3. Environment Configuration
Create a .env file in the root directory and add the required environment variables:
```
```Code snippet
# Server Configuration
PORT=3000
SESSION_SECRET=your_secure_random_string_here

# AI Configuration
GEMINI_API_KEY=your_google_gemini_api_key_here
4. Build Tailwind CSS
Compile the utility classes for the frontend:
```
```bash
npm run build
5. Start the Development Server
Bash
npm run dev
The application will be available at http://localhost:3000.
```
### 💡 Usage Examples

Once the application is running, you can interact with the CivicFlow Navigator via the chat interface:

Eligibility Check: Type "Am I eligible to vote?" or "I turn 18 in July." The AI will parse Indian Election Commission rules regarding quarterly qualifying dates and guide you on filling out Form 6.

Polling Booth Locator: Click the GPS/Location Icon next to the chat input or type "Find my polling booth." The system will acquire your coordinates and return a mapped radius for your nearest polling station.

Representative Insights: Click the Know Your Rep suggestion chip to generate a responsive data card displaying local politician statistics (attendance, records) and an interactive "Mark as Voted" tracker.

Language Toggle: Use the dropdown in the top header to switch between English (ENG) and Hindi (HIN) AI responses.
