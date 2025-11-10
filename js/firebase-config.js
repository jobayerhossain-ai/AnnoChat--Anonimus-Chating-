/**
 * =====================================================
 * Firebase Configuration for Messenger Clone
 * =====================================================
 * 1️⃣ Go to: https://console.firebase.google.com/
 * 2️⃣ Open your project (or create a new one)
 * 3️⃣ Click the "</>" (Web) icon to register a web app
 * 4️⃣ Copy the config snippet shown under
 *      "Firebase SDK setup and configuration"
 * 5️⃣ Replace the placeholders below with your real keys
 * -----------------------------------------------------
 * Example of what real keys look like:
 *   apiKey: "AIzaSyA8H8hH4xxxxxxxxxxxxxxxxxx",
 *   authDomain: "anonmessenger-12345.firebaseapp.com",
 *   databaseURL: "https://anonmessenger-12345-default-rtdb.firebaseio.com",
 *   projectId: "anonmessenger-12345",
 *   storageBucket: "anonmessenger-12345.appspot.com",
 *   messagingSenderId: "1234567890",
 *   appId: "1:1234567890:web:abcdefabcdefabcdef"
 * -----------------------------------------------------
 * Do NOT include any comments or extra text inside
 * the config object — only the real key/value pairs.
 */

export const firebaseConfig = {
    apiKey: 'AIzaSyXXXXXXX',
    authDomain: 'anonchat-5bf53.firebaseapp.com',
    databaseURL: 'https://anonchat-5bf53-default-rtdb.firebaseio.com',
    projectId: 'anonchat-5bf53',
    storageBucket: 'anonchat-5bf53.appspot.com',
    messagingSenderId: 'YOUR_SENDER_ID',
    appId: 'YOUR_APP_ID'
};

/**
 * =====================================================
 * Quick Setup Checklist
 * =====================================================
 * ✅ Realtime Database → Build → Create → Start in Test Mode
 * ✅ Storage → Build → Create → Start in Test Mode
 * ✅ Rules (for testing):
 *     {
 *       "rules": {
 *         ".read": true,
 *         ".write": true
 *       }
 *     }
 * ✅ Run locally with:
 *     npx http-server -c-1
 *     # or
 *     python3 -m http.server 8080
 * ✅ Open http://localhost:8080
 * ✅ You should see:
 *     "✅ Firebase initialized"
 * in your browser console
 * =====================================================
 */
