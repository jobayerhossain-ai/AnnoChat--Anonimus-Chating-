/**
 * js/script.js — Master-level upgrade
 * - Image preview + cancel (upload only when Send)
 * - Voice record -> preview -> send / re-record / cancel
 * - Enter = send, Shift+Enter = newline
 * - Autosize textarea, mobile keyboard offset handling
 * - Typing indicator + presence
 * - Streaming text animation
 */

import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js';
import {
    getDatabase,
    ref,
    push,
    set,
    onChildAdded,
    onValue,
    serverTimestamp,
    onDisconnect,
} from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js';
import {
    getStorage,
    ref as sRef,
    uploadBytes,
    getDownloadURL,
} from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-storage.js';

const DEBUG = true;
const log = (...args) => {
    if (DEBUG) console.log('[AnonChat]', ...args);
};

let app;
let db;
let storage;
let username = 'Guest-' + Math.floor(Math.random() * 10000);
let mediaRecorder = null;
let audioChunks = [];
let typingTimeout = null;
let pendingMedia = null;

const $ = (id) => document.getElementById(id);
const els = {
    messages: $('messages'),
    input: $('messageInput'),
    send: $('sendBtn'),
    emojiBtn: $('emojiBtn'),
    imageBtn: $('imageBtn'),
    imageInput: $('imageInput'),
    recordBtn: $('recordBtn'),
    mediaPreview: $('mediaPreview'),
    mediaPreviewImg: $('mediaPreviewImg'),
    cancelMedia: $('cancelMedia'),
    typingIndicator: $('typingIndicator'),
    userName: $('userName'),
    composer: $('composer'),
    helperLeft: $('helperLeft'),
    charCount: $('charCount'),
};

document.addEventListener('DOMContentLoaded', () => {
    initFirebase().catch((err) => console.error(err));
});

/* ------------- INIT FIREBASE ------------- */
async function initFirebase() {
    if (!firebaseConfig?.apiKey) {
        alert('Firebase config missing (js/firebase-config.js). Running in demo mode.');
        setupLocalDemo();
        return;
    }

    try {
        app = initializeApp(firebaseConfig);
        db = getDatabase(app);
        storage = getStorage(app);
        els.userName.textContent = `You: ${username}`;
        await joinPresence();
        listenTyping();
        listenMessages();
        bindUI();
        log('Firebase initialized');
    } catch (err) {
        console.error('Firebase init error:', err);
        alert('Firebase initialization failed (see console). Running in demo mode.');
        setupLocalDemo();
    }
}

/* ------------- PRESENCE ------------- */
async function joinPresence() {
    const userRef = ref(db, `users/${username}`);
    await set(userRef, { name: username, online: true, lastActive: serverTimestamp() });
    onDisconnect(userRef).remove();
}

/* ------------- TYPING ------------- */
function emitTyping() {
    try {
        set(ref(db, `typing/${username}`), true);
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => set(ref(db, `typing/${username}`), false), 1200);
    } catch (err) {
        log('emitTyping error', err);
    }
}

function listenTyping() {
    const typingRef = ref(db, 'typing');
    onValue(typingRef, (snap) => {
        const val = snap.val() || {};
        const someoneTyping = Object.keys(val).some((u) => val[u] && u !== username);
        els.typingIndicator?.classList.toggle('hidden', !someoneTyping);
    });
}

/* ------------- MESSAGES ------------- */
function listenMessages() {
    const chatRef = ref(db, 'messages/public');
    onChildAdded(chatRef, (snap) => {
        const msg = snap.val();
        appendMessage(
            msg.user,
            msg.text || '',
            msg.type || 'text',
            msg.url || null,
            msg.user === username,
            true
        );
    });
}

/* ------------- SEND FLOW ------------- */
async function sendMessage() {
    if (pendingMedia) {
        await sendPendingMedia();
        return;
    }

    const text = els.input.value.trim();
    if (!text) return;

    try {
        const chatRef = ref(db, 'messages/public');
        await push(chatRef, { user: username, text, type: 'text', ts: Date.now() });
        els.input.value = '';
        autosizeTextarea();
    } catch (err) {
        console.error('sendMessage error:', err);
        showToast('Failed to send message');
    }
}

async function sendPendingMedia() {
    if (!pendingMedia) return;
    try {
        const { type, fileOrBlob } = pendingMedia;
        const key = `${type}s/${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const storageRef = sRef(storage, key);
        await uploadBytes(storageRef, fileOrBlob);
        const url = await getDownloadURL(storageRef);
        const chatRef = ref(db, 'messages/public');
        await push(chatRef, { user: username, url, type, ts: Date.now() });
        clearPendingMedia();
        showToast(type === 'image' ? 'Image sent' : 'Voice message sent');
    } catch (err) {
        console.error('sendPendingMedia error', err);
        showToast('Upload failed');
    }
}

function clearPendingMedia() {
    if (!pendingMedia) return;
    if (pendingMedia.previewUrl) {
        try {
            URL.revokeObjectURL(pendingMedia.previewUrl);
        } catch (_) {
            /* ignore */
        }
    }
    pendingMedia = null;
    if (els.mediaPreview) els.mediaPreview.classList.add('hidden');
    if (els.mediaPreviewImg) els.mediaPreviewImg.src = '';
    if (els.helperLeft) els.helperLeft.innerHTML = '';
}

/* ------------- IMAGE PREVIEW ------------- */
function handleImageSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        showToast('Please select an image file');
        e.target.value = '';
        return;
    }

    if (file.size > 8 * 1024 * 1024) {
        showToast('Image too large (max 8MB)');
        e.target.value = '';
        return;
    }

    const url = URL.createObjectURL(file);
    pendingMedia = { type: 'image', fileOrBlob: file, previewUrl: url };

    if (els.mediaPreview && els.mediaPreviewImg) {
        els.mediaPreviewImg.src = url;
        els.mediaPreview.classList.remove('hidden');
    }

    if (els.helperLeft) {
        els.helperLeft.innerHTML = '<span class="text-xs text-slate-300">Image selected</span>';
    }
    log('Image selected (preview)', file);
}

function cancelSelectedMedia() {
    clearPendingMedia();
    if (els.imageInput) els.imageInput.value = '';
    showToast('Selection cancelled');
}

/* ------------- VOICE RECORD FLOW ------------- */
async function toggleRecording() {
    if (mediaRecorder) {
        stopRecording();
    } else {
        startRecording();
    }
}

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
        mediaRecorder.onstop = async () => {
            const blob = new Blob(audioChunks, { type: 'audio/webm' });
            const url = URL.createObjectURL(blob);
            pendingMedia = { type: 'audio', fileOrBlob: blob, previewUrl: url };
            if (els.helperLeft) {
                els.helperLeft.innerHTML = `<audio controls src="${url}" class="max-w-[180px]"></audio>`;
            }
            if (els.mediaPreview) {
                els.mediaPreview.classList.remove('hidden');
                els.mediaPreviewImg.src = '';
            }
            log('Recording done, preview ready');
        };
        mediaRecorder.start();
        if (els.recordBtn) els.recordBtn.textContent = '⏹️';
        if (els.helperLeft) {
            els.helperLeft.innerHTML = '<span class="text-xs text-slate-300">Recording…</span>';
        }
        showToast('Recording started');
    } catch (err) {
        console.error('startRecording error', err);
        alert('Microphone access is required');
    }
}

function stopRecording() {
    if (!mediaRecorder) return;
    mediaRecorder.stop();
    mediaRecorder = null;
    if (els.recordBtn) els.recordBtn.textContent = '🎙️';
    showToast('Recording stopped — preview ready. Press Send to upload');
}

/* ------------- UI BINDINGS ------------- */
function bindUI() {
    els.send?.addEventListener('click', () => sendMessage());
    els.imageBtn?.addEventListener('click', () => els.imageInput?.click());
    els.imageInput?.addEventListener('change', handleImageSelected);
    els.cancelMedia?.addEventListener('click', cancelSelectedMedia);
    els.recordBtn?.addEventListener('click', toggleRecording);

    if (els.input) {
        els.input.addEventListener('input', () => {
            autosizeTextarea();
            emitTyping();
            updateCharCount();
        });

        els.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            } else if (e.key === 'Enter' && e.shiftKey) {
                setTimeout(autosizeTextarea, 0);
            } else {
                emitTyping();
            }
        });

        window.addEventListener('resize', mobileKeyboardFix);
    }

    els.composer?.addEventListener('click', () => els.input?.focus());
}

/* ------------- AUTOSIZE & HELPERS ------------- */
function autosizeTextarea() {
    if (!els.input) return;
    els.input.style.height = 'auto';
    const maxHeight = (window.innerHeight * 0.35) | 0;
    els.input.style.height = Math.min(maxHeight, els.input.scrollHeight) + 'px';
}

function updateCharCount() {
    if (!els.charCount || !els.input) return;
    const len = els.input.value.length;
    if (len > 0) {
        els.charCount.textContent = `${len} chars`;
        els.charCount.classList.remove('hidden');
    } else {
        els.charCount.classList.add('hidden');
    }
}

/* ------------- MESSAGE DISPLAY ------------- */
function appendMessage(user, text, type = 'text', url = null, me = false, animate = false) {
    if (!els.messages) return;
    const div = document.createElement('div');
    div.className = `message ${me ? 'user' : 'other'}`;
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.innerHTML = `<strong>${escapeHTML(user)}</strong><br>`;
    div.appendChild(bubble);

    if (type === 'text') {
        const span = document.createElement('span');
        bubble.appendChild(span);
        els.messages.appendChild(div);
        if (animate) streamText(span, text);
        else span.textContent = text;
    } else if (type === 'image') {
        bubble.innerHTML += `<img src="${url}" alt="image" class="rounded-md" />`;
        els.messages.appendChild(div);
    } else if (type === 'audio') {
        bubble.innerHTML += `<audio controls src="${url}"></audio>`;
        els.messages.appendChild(div);
    }

    requestAnimationFrame(() => {
        els.messages.scrollTo({ top: els.messages.scrollHeight, behavior: 'smooth' });
    });
}

function streamText(el, text) {
    let i = 0;
    const speed = 12;
    const timer = setInterval(() => {
        el.textContent += text[i] ?? '';
        els.messages.scrollTo({ top: els.messages.scrollHeight });
        i++;
        if (i >= text.length) clearInterval(timer);
    }, speed);
}

/* ------------- MOBILE FIXES ------------- */
function mobileKeyboardFix() {
    try {
        const composer = els.composer;
        if (!composer) return;
        if (window.visualViewport) {
            const h = window.visualViewport.height;
            const bottomOffset = Math.max(0, window.innerHeight - h);
            composer.style.bottom = bottomOffset + 'px';
        } else {
            composer.style.bottom = '';
        }
    } catch (err) {
        /* ignore */
    }
}

/* ------------- UTILS ------------- */
function escapeHTML(str) {
    return String(str || '').replace(/[&<>"']/g, (m) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    }[m]));
}

function showToast(msg) {
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText =
        'position:fixed;right:16px;bottom:80px;padding:8px 12px;border-radius:8px;background:linear-gradient(90deg,#00e6ff,#6c6bff);color:#000;font-weight:600;z-index:9999;box-shadow:0 6px 20px rgba(0,0,0,0.4)';
    document.body.appendChild(t);
    setTimeout(() => (t.style.opacity = '0'), 2200);
    setTimeout(() => t.remove(), 2600);
}

/* ------------- DEMO MODE ------------- */
function setupLocalDemo() {
    bindUI();
    els.send.addEventListener('click', () => {
        const txt = els.input.value.trim();
        if (!txt && !pendingMedia) return;
        if (pendingMedia) {
            if (pendingMedia.type === 'image') {
                appendMessage(username, '', 'image', pendingMedia.previewUrl, true, false);
            } else {
                appendMessage(username, '', 'audio', pendingMedia.previewUrl, true, false);
            }
            clearPendingMedia();
            els.input.value = '';
        } else {
            appendMessage(username, txt, 'text', null, true, false);
            els.input.value = '';
        }
        autosizeTextarea();
    });
}

/* ------------- INITIAL SETUP ------------- */
(function initialWire() {
    if (!els.messages) log('Warning: messages element not found');
    if (!els.input) log('Warning: messageInput element not found');
    autosizeTextarea();
})();

window.AnonChat = {
    sendMessage,
    clearPendingMedia,
    get pendingMedia() {
        return pendingMedia;
    },
};

/* ------------- EMOJI & SCROLL ------------- */
els.emojiBtn?.addEventListener('click', () => {
    emojiPanel.classList.toggle('active');
});

emojiPanel.addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON') {
        els.input.value += e.target.textContent;
        autosizeTextarea();
        emojiPanel.classList.remove('active');
        els.input.focus();
    }
});

if (els.messages) {
    els.messages.addEventListener('scroll', () => {
        const nearBottom =
            els.messages.scrollHeight - els.messages.scrollTop - els.messages.clientHeight < 120;
        scrollBtn.classList.toggle('visible', !nearBottom);
    });
}

/* ------------- WELCOME POPUP ------------- */
document.addEventListener('DOMContentLoaded', () => {
    const popup = document.getElementById('welcomePopup');
    const closeBtn = document.getElementById('closePopup');
    const startBtn = document.getElementById('startChatBtn');

    if (popup) {
        setTimeout(() => popup.classList.remove('hidden'), 600);
        const closePopup = () => popup.classList.add('hidden');
        closeBtn?.addEventListener('click', closePopup);
        startBtn?.addEventListener('click', closePopup);
        setTimeout(closePopup, 8000);
    }
});
