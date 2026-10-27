# TGBPASS

TG-bPASS (Telangana Building Permission & Approval Self-Certification System) Dashboard and Public Search Portal.

## Overview
- **Backend**: Python Flask REST API with Drive Integration, MySQL database support, and multi-directory proposal document discovery.
- **Frontend**: React + Vite modern responsive UI with real-time analytics, proposal detail modals, and public search capabilities.

## Setup & Running
1. Copy `.env.example` to `.env` and fill in required environment configurations.
2. Install Python dependencies: `pip install -r requirements.txt`
3. Frontend setup:
   ```bash
   cd frontend
   npm install
   npm run build
   ```
4. Run application:
   ```bash
   python run.py
   ```
