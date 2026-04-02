# Performance Management System

A call center performance management system for scoring agents, managing scorecards, and calculating pay-for-performance.

## Running Locally (Recommended)

The easiest way to run this is with **Docker Desktop**. It handles everything — the database, backend, and frontend — with a single command.

### Step 1: Install Docker Desktop

- Download from: https://www.docker.com/products/docker-desktop/
- Install and start it (you'll see the Docker whale icon in your taskbar/menu bar)

### Step 2: Get the code

Open a terminal (Command Prompt on Windows, Terminal on Mac) and run:

```bash
git clone https://github.com/drewski1k/performance_system.git
cd performance_system
git checkout claude/performance-management-system-KoZOX
```

### Step 3: Start the system

```bash
docker compose up --build
```

Wait for the logs to show `Application startup complete` (takes about 1-2 minutes the first time).

### Step 4: Open the app

Open your browser and go to: **http://localhost:5173**

### Step 5: Load your data

1. Click **Import** in the left sidebar
2. Upload your Excel file (the system auto-detects the sheet type)
3. Click **Preview**, then **Import**
4. Repeat for each sheet (HC Data first, then Combined Data)
5. Go to the **Dashboard** to see scores

---

## Stopping the system

Press `Ctrl+C` in the terminal, then run:
```bash
docker compose down
```

Your data is saved in a Docker volume and will be there next time you start it.

To wipe all data and start fresh:
```bash
docker compose down -v
```

---

## Architecture

- **Frontend**: React + TypeScript + Tailwind CSS (port 5173)
- **Backend**: FastAPI + Python (port 8000)
- **Database**: PostgreSQL 16
