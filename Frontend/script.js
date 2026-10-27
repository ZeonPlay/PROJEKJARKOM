// Konfigurasi Socket.IO
const socket = io();

// Variabel State Utama
let myUserId = "";
let myUserName = "";
let myUserAvatar = "";
let activeChatUserId = "";
let contacts = [];
let messagesHistory = [];

// Elemen DOM Utama
const loginScreen = document.getElementById("loginScreen");
const mainApp = document.getElementById("mainApp");
const contactList = document.getElementById("contactList");
const messagesContainer = document.getElementById("messages");
const messageForm = document.getElementById("messageForm");
const messageInput = document.getElementById("messageInput");

// Elemen DOM Simulator
const simModal = document.getElementById("simModal");
const closeSimBtn = document.getElementById("closeSimBtn");
const movingBlock = document.getElementById("movingBinaryBlock");
const txProgress = document.getElementById("txProgress");
const progressPercent = document.getElementById("progressPercent");
const progressStatusText = document.getElementById("progressStatusText");
const txDetailText = document.getElementById("txDetailText");

function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, ch => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[ch]));
}

// ==========================================
// 1. LOGIKA SLIDING ANIMATED AUTH (LOGIN & REGISTER)
// ==========================================
const authContainer = document.getElementById('authContainer');
const toRegisterBtn = document.getElementById('toRegisterBtn');
const toLoginBtn = document.getElementById('toLoginBtn');

const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');

toRegisterBtn?.addEventListener('click', () => {
    authContainer?.classList.add("right-panel-active");
});

toLoginBtn?.addEventListener('click', () => {
    authContainer?.classList.remove("right-panel-active");
});

loginForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmailInput').value.trim();
    const password = document.getElementById('loginPasswordInput').value;

    socket.emit("login_account", { email, password });
});

registerForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const user_name = document.getElementById('regNameInput').value.trim();
    const user_id = document.getElementById('regUserIdInput').value.trim();
    const email = document.getElementById('regEmailInput').value.trim();
    const password = document.getElementById('regPasswordInput').value;

    socket.emit("register_account", { user_id, user_name, email, password });
});

// Tanggapan Autentikasi Langsung Tanpa OTP
socket.on("auth_response", (data) => {
    if (data.status === "error") {
        alert("⚠️ " + data.message);
    } else if (data.status === "success") {
        if (data.action === "register") {
            alert("✅ " + data.message);
            authContainer?.classList.remove("right-panel-active");
            registerForm?.reset();
        } else if (data.action === "login") {
            myUserId = data.user_id;
            myUserName = data.user_name;
            myUserAvatar = myUserName.charAt(0).toUpperCase();

            messagesHistory = [];
            contacts = [];
            activeChatUserId = "";

            if (data.history && data.history.length > 0) {
                data.history.forEach(msg => {
                    const sentByMe = msg.sender_id === myUserId;
                    const partnerId = sentByMe ? msg.receiver_id : msg.sender_id;
                    const partnerName = (sentByMe ? msg.receiver_name : msg.sender_name) || partnerId.split('_')[0];
                    const decryptedMsg = decryptText(msg.message);

                    let existingContact = contacts.find(c => c.id === partnerId);
                    if (!existingContact) {
                        contacts.push({
                            id: partnerId,
                            name: partnerName.charAt(0).toUpperCase() + partnerName.slice(1),
                            lastMsg: decryptedMsg
                        });
                    } else {
                        existingContact.lastMsg = decryptedMsg;
                    }

                    const timeFormatted = msg.created_at
                        ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : '';

                    messagesHistory.push({
                        sender_id: msg.sender_id,
                        sender_name: msg.sender_name,
                        receiver_id: msg.receiver_id,
                        message: msg.message,
                        raw_text: decryptedMsg,
                        time: timeFormatted
                    });
                });
            }

            if (loginScreen) {
                loginScreen.hidden = true;
                loginScreen.style.display = "none";
            }
            if (mainApp) mainApp.removeAttribute("hidden");

            document.getElementById("myName").textContent = myUserName;
            document.getElementById("myAvatar").textContent = myUserAvatar;
            document.getElementById("myIdDisplay").textContent = `ID: ${myUserId}`;

            if (simModal) simModal.hidden = true;

            renderContacts();
            renderMessages();
        }
    }
});

// ==========================================
// 2. LOGIKA HOVER PANEL INFORMASI IP
// ==========================================
const infoButton = document.getElementById("infoButton");
const ipAddressElem = document.getElementById("ipAddress");
const ipLocationElem = document.getElementById("ipLocation");
let isIpFetched = false;

infoButton?.addEventListener("mouseenter", () => {
    if (!isIpFetched) fetchIpInformation();
});

function fetchIpInformation() {
    if (ipAddressElem) ipAddressElem.textContent = "Memuat IP...";
    if (ipLocationElem) ipLocationElem.textContent = "Memuat Lokasi...";

    fetch("https://ipapi.co/json/")
        .then(response => {
            if (!response.ok) throw new Error("Gagal mengambil data IP");
            return response.json();
        })
        .then(data => {
            if (ipAddressElem) ipAddressElem.textContent = data.ip || "Tidak diketahui";
            const locationText = `${data.city || ""}, ${data.region || ""}, ${data.country_name || ""} (${data.org || ""})`;
            if (ipLocationElem) ipLocationElem.textContent = locationText;
            isIpFetched = true;
        })
        .catch(() => {
            fetch("https://ip-api.com/json/?fields=status,country,regionName,city,isp,query")
                .then(res => res.json())
                .then(data => {
                    if (data.status === "success") {
                        if (ipAddressElem) ipAddressElem.textContent = data.query;
                        if (ipLocationElem) ipLocationElem.textContent = `${data.city}, ${data.regionName}, ${data.country} (${data.isp})`;
                        isIpFetched = true;
                    }
                })
                .catch(() => {
                    if (ipAddressElem) ipAddressElem.textContent = "127.0.0.1";
                    if (ipLocationElem) ipLocationElem.textContent = "Jaringan Lokal";
                });
        });
}

fetchIpInformation();

// ==========================================
// 3. ENKRIPSI & DEKRIPSI AES-256
// ==========================================
const SECRET_KEY = "NetTrackKey2026";

function encryptText(text) {
    return CryptoJS.AES.encrypt(text, SECRET_KEY).toString();
}

function decryptText(ciphertext) {
    try {
        const bytes = CryptoJS.AES.decrypt(ciphertext, SECRET_KEY);
        const originalText = bytes.toString(CryptoJS.enc.Utf8);
        return originalText || ciphertext;
    } catch (e) {
        return ciphertext;
    }
}

// ==========================================
// 4. FITUR TAMBAH KONTAK & RENDER KONTAK
// ==========================================
const addContactBtn = document.getElementById("addContactBtn");

addContactBtn?.addEventListener("click", () => {
    const targetId = prompt("Masukkan ID Teman (contoh: ryuu_wdkmp):");
    if (!targetId) return;

    const cleanTargetId = targetId.trim().toLowerCase();
    if (cleanTargetId === myUserId) {
        alert("Kamu tidak bisa menambahkan ID diri sendiri!");
        return;
    }

    let existingContact = contacts.find(c => c.id === cleanTargetId);
    if (!existingContact) {
        const namePart = cleanTargetId.split('_')[0];
        const formattedName = namePart.charAt(0).toUpperCase() + namePart.slice(1);
        existingContact = { id: cleanTargetId, name: formattedName, lastMsg: "Ketuk untuk memulai chat" };
        contacts.push(existingContact);
    }

    renderContacts();
    selectContact(cleanTargetId);
});

function renderContacts() {
    if (!contactList) return;
    contactList.innerHTML = "";
    if (contacts.length === 0) {
        contactList.innerHTML = `<div style="padding: 15px; color: #94a3b8; font-size: 12px; text-align: center;">Belum ada kontak. Klik "Tambah Teman via ID".</div>`;
        return;
    }

    contacts.forEach(c => {
        const item = document.createElement("div");
        item.className = `contact-item ${c.id === activeChatUserId ? "active" : ""}`;
        item.onclick = () => selectContact(c.id);

        item.innerHTML = `
            <div class="avatar">${escapeHtml(c.name.charAt(0).toUpperCase())}</div>
            <div class="contact-info">
                <strong>${escapeHtml(c.name)}</strong>
                <p>${escapeHtml(c.lastMsg || "Ketuk untuk memulai chat")}</p>
            </div>
        `;
        contactList.appendChild(item);
    });
}

function selectContact(userId) {
    activeChatUserId = userId;
    const targetContact = contacts.find(c => c.id === userId);

    const chatNameElem = document.getElementById("chatName");
    const chatAvatarElem = document.getElementById("chatAvatar");

    if (chatNameElem) chatNameElem.textContent = targetContact ? `${targetContact.name} (${targetContact.id})` : userId;
    if (chatAvatarElem) chatAvatarElem.textContent = targetContact ? targetContact.name.charAt(0).toUpperCase() : "?";

    renderContacts();
    renderMessages();
}

// ==========================================
// 5. GEOLOCATION
// ==========================================
document.getElementById("locationBtn")?.addEventListener("click", () => {
    if (!activeChatUserId) {
        alert("Pilih kontak penerima terlebih dahulu!");
        return;
    }

    if ("geolocation" in navigator) {
        const locBtn = document.getElementById("locationBtn");
        const originalText = locBtn.textContent;
        locBtn.textContent = "⏳";

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;

                const mapsUrl = `https://www.google.com/maps?q=${lat},${lon}`;
                const locationMessage = `📍 Lokasi Saya: ${mapsUrl}`;

                const encryptedMessage = encryptText(locationMessage);
                const timeNow = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                const msgData = {
                    sender_id: myUserId,
                    sender_name: myUserName,
                    receiver_id: activeChatUserId,
                    message: encryptedMessage,
                    raw_text: locationMessage,
                    time: timeNow
                };

                messagesHistory.push(msgData);

                const contact = contacts.find(c => c.id === activeChatUserId);
                if (contact) contact.lastMsg = locationMessage;

                socket.emit("send_message", msgData);

                renderContacts();
                renderMessages();
                locBtn.textContent = originalText;
            },
            (error) => {
                locBtn.textContent = "📍";
                alert("Gagal mendapatkan lokasi.");
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    } else {
        alert("Browser kamu tidak mendukung Geolocation.");
    }
});

// ==========================================
// 6. CHAT & BUBBLE RENDER
// ==========================================
messageForm?.addEventListener("submit", function (e) {
    e.preventDefault();
    const rawMessage = messageInput.value.trim();
    if (!rawMessage || !activeChatUserId) {
        if (!activeChatUserId) alert("Pilih kontak penerima terlebih dahulu!");
        return;
    }

    const encryptedMessage = encryptText(rawMessage);
    const timeNow = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const msgData = {
        sender_id: myUserId,
        sender_name: myUserName,
        receiver_id: activeChatUserId,
        message: encryptedMessage,
        raw_text: rawMessage,
        time: timeNow
    };

    messagesHistory.push(msgData);

    const contact = contacts.find(c => c.id === activeChatUserId);
    if (contact) contact.lastMsg = rawMessage;

    socket.emit("send_message", msgData);

    messageInput.value = "";
    renderContacts();
    renderMessages();
});

socket.on("receive_message", (data) => {
    if (data.sender_id === myUserId || data.receiver_id !== myUserId) return;

    data.raw_text = decryptText(data.message);
    messagesHistory.push(data);

    const contact = contacts.find(c => c.id === data.sender_id);
    if (contact) {
        contact.lastMsg = data.raw_text;
    } else {
        contacts.push({ id: data.sender_id, name: data.sender_name, lastMsg: data.raw_text });
    }

    renderContacts();
    renderMessages();
});

socket.on("message_error", (data) => {
    alert("⚠️ " + data.message);
});

function renderMessages() {
    if (!messagesContainer) return;
    messagesContainer.innerHTML = "";

    const activeMessages = messagesHistory.filter(
        m => (m.sender_id === myUserId && m.receiver_id === activeChatUserId) ||
             (m.sender_id === activeChatUserId && m.receiver_id === myUserId)
    );

    activeMessages.forEach((msg) => {
        const isSent = msg.sender_id === myUserId;
        const msgText = msg.raw_text || decryptText(msg.message);

        const safeText = escapeHtml(msgText);
        const formattedText = safeText.replace(
            /(https:\/\/www\.google\.com\/maps[^\s]*)/g,
            (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color: #38bdf8; text-decoration: underline; font-weight: 600;">Buka di Google Maps 📍</a>`
        );

        const msgDiv = document.createElement("div");
        msgDiv.className = `message-item ${isSent ? "sent" : "received"}`;

        msgDiv.innerHTML = `
            <div class="message-bubble">${formattedText}</div>
            <button class="sim-btn" type="button">📊 Simulator Sinyal & Data Frame</button>
            <span class="time">${escapeHtml(msg.time || '')}</span>
        `;
        msgDiv.querySelector(".sim-btn").addEventListener("click", () => openSimulator(msgText));

        messagesContainer.appendChild(msgDiv);
    });

    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// ==========================================
// 7. SIMULATOR ANIMASI NRZ-I
// ==========================================
let simAnimationTimer = null;

window.openSimulator = function (text) {
    if (!simModal) return;
    simModal.hidden = false;
    simModal.style.display = "flex";

    const displayElem = document.getElementById("simCurrentTextDisplay");
    if (displayElem) displayElem.textContent = `"${text}"`;

    startSimulation(text);
};

closeSimBtn?.addEventListener("click", () => {
    if (simModal) {
        simModal.hidden = true;
        simModal.style.display = "none";
    }
    if (simAnimationTimer) cancelAnimationFrame(simAnimationTimer);
});

function resetSimUI() {
    if (simAnimationTimer) cancelAnimationFrame(simAnimationTimer);

    if (txProgress) txProgress.style.width = "0%";
    if (progressPercent) progressPercent.textContent = "0%";
    if (progressStatusText) progressStatusText.textContent = "Menunggu...";
    if (txDetailText) txDetailText.textContent = "Memulai transmisi...";

    const txBadge = document.getElementById("txStatusBadge");
    const senderBadge = document.getElementById("senderBadge");
    const receiverBadge = document.getElementById("receiverBadge");

    if (txBadge) txBadge.textContent = "Siap";
    if (senderBadge) { senderBadge.textContent = "Siap"; senderBadge.className = "badge-status"; }
    if (receiverBadge) { receiverBadge.textContent = "Siap"; receiverBadge.className = "badge-status"; }

    if (movingBlock) {
        movingBlock.hidden = true;
        movingBlock.style.left = "5%";
        movingBlock.style.transition = "none";
    }

    for (let i = 1; i <= 7; i++) {
        const card = document.getElementById(`step${i}`);
        if (card) {
            card.className = "step-card";
            const badge = card.querySelector(".step-badge");
            if (badge) badge.textContent = "Menunggu";
        }
    }

    const frameTableBody = document.getElementById("frameTableBody");
    if (frameTableBody) frameTableBody.innerHTML = "";

    if (document.getElementById("rxBinary")) document.getElementById("rxBinary").textContent = "-";
    if (document.getElementById("rxAscii")) document.getElementById("rxAscii").textContent = "-";
    if (document.getElementById("rxText")) document.getElementById("rxText").textContent = "-";

    const canvas = document.getElementById("signalCanvas");
    if (canvas) {
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
}

function updateStepStatus(stepNum, status) {
    const card = document.getElementById(`step${stepNum}`);
    if (!card) return;
    const badge = card.querySelector(".step-badge");

    if (status === "active") {
        card.className = "step-card active";
        if (badge) badge.textContent = "Sedang berjalan";
    } else if (status === "completed") {
        card.className = "step-card completed";
        if (badge) badge.textContent = "Selesai";
    }
}

function startSimulation(text) {
    resetSimUI();

    let blocks = [];
    let fullBinary = "";
    const frameTableBody = document.getElementById("frameTableBody");

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const decimal = char.charCodeAt(0);
        const binary = decimal.toString(2).padStart(7, '0');
        blocks.push(binary);
        fullBinary += binary;

        if (frameTableBody) {
            const row = document.createElement("tr");
            row.innerHTML = `<td>${char === ' ' ? '[Space]' : escapeHtml(char)}</td><td>${decimal}</td><td>${binary}</td>`;
            frameTableBody.appendChild(row);
        }
    }

    updateStepStatus(1, "active");
    const senderBadge = document.getElementById("senderBadge");
    const txBadge = document.getElementById("txStatusBadge");
    if (senderBadge) { senderBadge.textContent = "Proses"; senderBadge.className = "badge-status active"; }
    if (txBadge) txBadge.textContent = "Memproses Pesan";

    setTimeout(() => {
        updateStepStatus(1, "completed");
        updateStepStatus(2, "active");

        setTimeout(() => {
            updateStepStatus(2, "completed");
            updateStepStatus(3, "active");
            drawNRZISignal(fullBinary);

            setTimeout(() => {
                updateStepStatus(3, "completed");
                updateStepStatus(4, "active");
                if (senderBadge) senderBadge.textContent = "Mengirim";
                if (txBadge) txBadge.textContent = "Mengirim Sinyal";

                runTransmissionBlocks(blocks, fullBinary, text);
            }, 500);
        }, 500);
    }, 400);
}

function runTransmissionBlocks(blocks, fullBinary, originalText) {
    const totalBlocks = blocks.length;

    if (movingBlock) {
        movingBlock.hidden = false;
        movingBlock.style.transition = "none";
    }

    function animateSingleBlock(blockIndex) {
        if (blockIndex >= totalBlocks) {
            if (movingBlock) movingBlock.hidden = true;

            updateStepStatus(4, "completed");
            const senderBadge = document.getElementById("senderBadge");
            const receiverBadge = document.getElementById("receiverBadge");
            const txBadge = document.getElementById("txStatusBadge");

            if (senderBadge) { senderBadge.textContent = "Selesai"; senderBadge.className = "badge-status success"; }

            updateStepStatus(5, "active");
            if (document.getElementById("rxBinary")) document.getElementById("rxBinary").textContent = fullBinary;

            setTimeout(() => {
                updateStepStatus(5, "completed");
                updateStepStatus(6, "active");
                if (document.getElementById("rxAscii")) {
                    document.getElementById("rxAscii").textContent = originalText.split('').map(c => c.charCodeAt(0)).join(' ');
                }

                setTimeout(() => {
                    updateStepStatus(6, "completed");
                    updateStepStatus(7, "completed");

                    if (document.getElementById("rxText")) document.getElementById("rxText").textContent = originalText;
                    if (receiverBadge) { receiverBadge.textContent = "Diterima"; receiverBadge.className = "badge-status success"; }
                    if (txBadge) txBadge.textContent = "Selesai";
                    if (progressStatusText) progressStatusText.textContent = "Transmisi Selesai";
                }, 400);
            }, 400);

            return;
        }

        const blockBiner = blocks[blockIndex];
        if (movingBlock) movingBlock.textContent = blockBiner;

        let startTime = null;
        const duration = 650;

        function step(timestamp) {
            if (!startTime) startTime = timestamp;
            const elapsed = timestamp - startTime;
            const progress = Math.min(elapsed / duration, 1);

            const currentPosPercent = 5 + (progress * 80);
            if (movingBlock) movingBlock.style.left = `${currentPosPercent}%`;

            const totalProgressPercent = Math.round(((blockIndex + progress) / totalBlocks) * 100);
            if (txProgress) txProgress.style.width = `${totalProgressPercent}%`;
            if (progressPercent) progressPercent.textContent = `${totalProgressPercent}%`;
            if (txDetailText) txDetailText.textContent = `Mengirim blok ${blockIndex + 1} dari ${totalBlocks}: ${blockBiner}`;
            if (progressStatusText) progressStatusText.textContent = "Mengirim sinyal melalui kanal transmisi";

            if (progress < 1) {
                simAnimationTimer = requestAnimationFrame(step);
            } else {
                setTimeout(() => {
                    animateSingleBlock(blockIndex + 1);
                }, 80);
            }
        }

        simAnimationTimer = requestAnimationFrame(step);
    }

    animateSingleBlock(0);
}

function drawNRZISignal(binaryStr) {
    const canvas = document.getElementById("signalCanvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, canvas.height / 2);
    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();

    if (!binaryStr) return;

    const bitWidth = Math.min(30, (canvas.width - 20) / binaryStr.length);
    const yHigh = 30;
    const yLow = 90;

    ctx.strokeStyle = "#22c55e";
    ctx.lineWidth = 3;
    ctx.beginPath();

    let x = 10;
    let level = 1;
    let currentY = level === 1 ? yHigh : yLow;
    ctx.moveTo(x, currentY);

    for (let i = 0; i < binaryStr.length; i++) {
        const bit = binaryStr[i];
        if (bit === '1') {
            level = level === 1 ? 0 : 1;
            const newY = level === 1 ? yHigh : yLow;
            ctx.lineTo(x, newY);
            currentY = newY;
        }
        x += bitWidth;
        ctx.lineTo(x, currentY);
    }
    ctx.stroke();
}