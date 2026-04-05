# 🔥 Firebase Setup Guide — Enable Auto-Sync for TuitionHub

Follow these simple steps to enable **real-time auto-sync** across all your devices.

## Step 1: Create a Firebase Project (FREE)

1. Go to [https://console.firebase.google.com](https://console.firebase.google.com)
2. Click **"Create a project"** (or "Add project")
3. Name it: **TuitionHub** (or anything you like)
4. Click **Continue** → Disable Google Analytics (optional) → Click **Create Project**

## Step 2: Enable Realtime Database

1. In the Firebase console, click **"Build"** → **"Realtime Database"** in the left menu
2. Click **"Create Database"**
3. Choose a location (pick the closest to you)
4. Select **"Start in test mode"** (this allows read/write for development)
5. Click **Enable**

## Step 3: Get Your Config

1. In the Firebase console, click the ⚙️ gear icon → **"Project settings"**
2. Scroll down to **"Your apps"** → Click the **Web icon ( </> )**
3. Register app name: **TuitionHub Web**
4. You'll see a config object like this:

```javascript
const firebaseConfig = {
    apiKey: "AIzaSy...",
    authDomain: "your-project.firebaseapp.com",
    databaseURL: "https://your-project-default-rtdb.firebaseio.com",
    projectId: "your-project",
    storageBucket: "your-project.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abc123def456"
};
```

## Step 4: Update Your Code

1. Open `app.js`
2. Replace the `firebaseConfig` object (at the top of the file, around line 10) with YOUR config from Step 3
3. Save the file

## Step 5: Set Database Rules (Important!)

1. In Firebase console → **Realtime Database** → **Rules** tab
2. Replace the rules with:

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

3. Click **Publish**

> ⚠️ These rules allow anyone to read/write. For production, add authentication rules.

## Step 6: Test It!

1. Open your website on your **laptop browser**
2. Open the same website on your **mobile phone browser**
3. Add a student on one device → It instantly appears on the other! 🎉

## How It Works

- Every time you add/edit/delete data, it's saved to **Firebase cloud** AND **local storage**
- Firebase sends updates to ALL connected devices in **real-time**
- If you go offline, data is saved locally and syncs when you reconnect
- The green "Cloud Connected" badge shows your sync status

## Cost

Firebase Realtime Database is **FREE** for:
- 1 GB stored data
- 10 GB/month download
- 100 simultaneous connections

This is more than enough for a tuition management app!
