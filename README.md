# [Sanatan Ayurveda Frontend Demo]

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node Version](https://img.shields.io/badge/node->=14.0.0-brightgreen.svg)

[A lightweight, modular backend that supports audio/video calling, real-time chat rooms, doctor–patient availability tracking, and WebRTC signaling using WebSockets.]

## 📋 Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [Running the Project](#running-the-project)

## 🛠 Prerequisites

Before you begin, ensure you have met the following requirements:

* **npm** or **yarn**: Package manager installed.

## 🚀 Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/Raghavv5846/telemed-frontend.git
    cd telemed-frontend
    ```

2.  **Install dependencies:**
    ```bash
    # If using npm
    npm install
    ```

## 🔐 Environment Variables

To run this project, you will need to add the following environment variables to your `.env` file.

1.  Create a file named `.env` in the root directory.
2.  Copy the contents of `.env.example` (if available) or add the following:

```env
VITE_API_BACKEND_URL= http://localhost:3000/api
VITE_API_SIGNALING_URL= ws://localhost:3000/ws
```

## 🚀 Running the Project
1.  Developement
    (Runs the server with nodemon ,restarts on file changes).
```
npm run dev
```
2.  Production build
```
npm run build
```

##  📱 How to Use (Workflow)
Here is the standard flow for testing the application:

1. Registration & Login:

  - Users can register as either a Patient or a Doctor.

  - Log in to access the respective dashboards.

2. Patient Dashboard:

  - Upon logging in, the patient sees a list of registered doctors.

  - Real-time Updates: Whenever a doctor logs in or goes online, the patient's dashboard updates instantly (via Sockets) to show the doctor as "Online" without needing to refresh the page.

3. Initiating a Call:

  - The patient clicks the "Call" button on an online doctor's card.

  - This triggers a WebRTC signal to the doctor.

4. Doctor Interaction:

  - The doctor receives an Incoming Call Modal instantly.

  - The doctor can choose to Accept or Reject the call.

5. Live Session:

  - Once accepted, both parties enter a video room.

  - Live Chat: A chat feature is available within the call screen, allowing text communication while the video is active.
