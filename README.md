# Legal Query System

This is a full-stack AI-powered Legal Query System. It consists of a React/Vite frontend, a Node.js Express backend for authentication and chat history, and a Python Flask backend for the RAG (Retrieval-Augmented Generation) pipeline using Groq AI.

## Prerequisites

Before starting, ensure you have the following installed:
- [Node.js](https://nodejs.org/) (v18 or higher)
- [Python](https://www.python.org/) (v3.8 or higher)
- MongoDB Atlas account (or local MongoDB)
- Groq API Key (from [console.groq.com](https://console.groq.com/keys))


---

## 🛠️ Step 1: Environment Setup

You need to create two `.env` files in different directories.

### 1. Node.js Backend `.env`
Navigate to `backend/server` and create a `.env` file with the following content:
```env
PORT=3001
MONGODB_URI="your_mongodb_connection_string_here"
```
*(If your MongoDB password contains special characters like `@` or `!`, ensure they are URL-encoded, or simply change your database password to avoid special characters.)*

### 2. Python AI Backend `.env`
Navigate to `backend/rag_model` and create a `.env` file with the following content:
```env
GROQ_API_KEY="your_groq_api_key_here"
```

---

## 🚀 How to Run the Project

To run the application, you need to open **three separate terminals** and run each part of the project simultaneously.

### Terminal 1: Python AI Backend (RAG Model)
This server handles the AI logic and PDF document processing. It runs on Port 5000.

1. Open a terminal and navigate to the `rag_model` directory:
   ```bash
   cd backend/rag_model
   ```
2. Activate your virtual environment (if you created one):
   ```bash
   .\venv\Scripts\activate
   ```
3. Install the required Python packages (only needed the first time):
   ```bash
   pip install -r requirements.txt
   ```
4. Start the Python server:
   ```bash
   python app.py
   ```

### Terminal 2: Node.js Backend Server
This server handles user authentication and saves chat history to MongoDB. It runs on Port 3001.

1. Open a **new** terminal and navigate to the `server` directory:
   ```bash
   cd backend/server
   ```
2. Install the required Node packages (only needed the first time):
   ```bash
   npm install
   ```
3. Start the Node server:
   ```bash
   npm start
   ```
   *(You should see "Connected to MongoDB" in the console).*

### Terminal 3: React Frontend
This is the user interface. It runs on Vite's default port (usually 5173).

1. Open a **third** terminal and navigate to the `frontend` directory:
   ```bash
   cd frontend
   ```
2. Install the required React packages (only needed the first time):
   ```bash
   npm install
   ```
3. Start the frontend application:
   ```bash
   npm run dev
   ```

---

## 🧠 Conversation Memory (short-term + long-term)

Long consultations would otherwise resend the whole chat to the LLM every turn, so prompt size (and cost) grows with every message. The RAG service keeps two layers of memory instead:

- **Short-term:** the last 4 messages, sent word for word.
- **Long-term:** one rolling summary of everything older, stored on the chat session in MongoDB (`memorySummary`, `summarizedCount`).

When more than 10 unsummarized messages pile up, all but the last 4 are folded into the summary with a small fast model (`llama-3.1-8b-instant`): `new_summary = summarize(old_summary + evicted_messages)`. The summary always covers the whole conversation but stays bounded in size, and compaction runs only when the window overflows — not on every request. If the summarizer fails, the service falls back to a bounded recent window and retries next turn.

Settings (in `backend/rag_model/.env`, all optional):

```env
MEMORY_STRATEGY=summary          # summary | window (last 6 messages) | full (entire history)
MEMORY_TRIGGER_MESSAGES=10       # compact when unsummarized history exceeds this
MEMORY_SHORT_TERM_MESSAGES=4     # always sent verbatim
MEMORY_SUMMARY_MODEL=llama-3.1-8b-instant
```

Every LLM call (translation, act detection, summarization, answer) is metered per request; the token counts are returned by `/api/query` and stored on each assistant message.

### Measure the token saving

```bash
cd backend/rag_model
python -m unittest discover -s tests -v          # memory logic, no API calls
python eval/benchmark_memory.py                  # replays a 20-turn consultation with full / window / summary memory
```

The benchmark uses Groq's reported token usage for every call (summarization included, so the saving is net) and writes a report to `eval/results/`, including each strategy's answer to a final question that checks whether facts from turn 1 were remembered.

---

## 🎉 Access the Application
Once all three servers are running, open your web browser and go to the link provided by the frontend terminal (usually `http://localhost:5173`).
