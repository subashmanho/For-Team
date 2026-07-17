import { supabase } from './js/supabaseClient.js';

// ==========================================
// 1. STATE MANAGEMENT
// ==========================================
let users = [];
let messages = []; // Array to hold all chat messages
let activeUser = null;
let currentUserId = null;
let currentChatUser = null;
let currentMatches = [];
let localStream = null;
let remoteStream = null;
let peerConnection = null;
let signalingChannel = null;
let callTarget = null;
let currentCallMode = 'video';
let isCaller = false;
let callActive = false;

// ==========================================
// 2. LOCAL STORAGE HANDLING
// =========================================
function loadDataFromStorage() {
    const savedUsers = localStorage.getItem('skill-exchange-users');
    if (savedUsers) users = JSON.parse(savedUsers);

    const savedMessages = localStorage.getItem('skill-exchange-messages');
    if (savedMessages) messages = JSON.parse(savedMessages);
}

function saveDataToStorage() {
    localStorage.setItem('skill-exchange-users', JSON.stringify(users));
    localStorage.setItem('skill-exchange-messages', JSON.stringify(messages));
}

async function loadSessionUser() {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) {
        console.error('Supabase session error:', error.message);
        return null;
    }

    if (!session) {
        return null;
    }

    currentUserId = session.user.id;
    return session;
}

async function loadProfilesFromSupabase() {
    try {
        const { data, error } = await supabase.from('profiles').select('*');
        if (error) {
            console.error('Supabase profiles error:', error.message);
            return;
        }

        if (!data || data.length === 0) {
            console.info('No profiles returned from Supabase.');
            return;
        }

        users = data.map((profile) => ({
            id: profile.id,
            name: profile.full_name || profile.email || 'Unknown',
            email: profile.email || '',
            bio: profile.bio || '',
            location: profile.location || '',
            level: profile.education || profile.occupation || 'N/A',
            education: profile.education || '',
            occupation: profile.occupation || '',
            age: profile.age || '',
            gender: profile.gender || '',
            learningPreference: profile.learning_preference || '',
            availability: profile.availability || '',
            knows: Array.isArray(profile.skills_to_teach) ? profile.skills_to_teach : [],
            wants: Array.isArray(profile.skills_to_learn) ? profile.skills_to_learn : [],
            avatar_url: profile.avatar_url || ''
        }));

        console.log(`Loaded ${users.length} profiles from Supabase.`);
    } catch (err) {
        console.error('Unable to load profiles from Supabase:', err.message || err);
    }
}

function clearAllData() {
    if(confirm("Are you sure you want to delete all user data and chats? This cannot be undone.")) {
        users = [];
        messages = [];
        activeUser = null;
        currentMatches = [];
        saveDataToStorage();
        updateUIState();
    }
}

async function ensureSignalingChannel() {
    if (signalingChannel) return signaledChannelReady();

    signalingChannel = supabase.channel('webrtc-signaling');
    signalingChannel.on('broadcast', { event: 'signal' }, (payload) => {
        console.log('Received signal event', payload);
        const eventPayload = payload?.payload ?? payload;
        if (!eventPayload || eventPayload.targetId !== currentUserId) return;
        if (eventPayload.sourceId === currentUserId) return;
        handleSignalingMessage(eventPayload);
    });

    signalingChannel.on('broadcast', { event: 'chat-message' }, (payload) => {
        console.log('Received chat-message event', payload);
        const eventPayload = payload?.payload ?? payload;
        if (!eventPayload || eventPayload.targetId !== currentUserId) return;
        if (eventPayload.sourceId === currentUserId) return;
        handleIncomingChatMessage(eventPayload);
    });

    const { error, data } = await signalingChannel.subscribe();
    if (error) {
        console.error('Signaling channel subscription failed:', error.message);
        signalingChannel = null;
    } else {
        console.log('Supabase signaling channel subscribed:', data);
    }
}

function signaledChannelReady() {
    return Promise.resolve();
}

async function testSupabaseConnection() {
    const { data, error } = await supabase.from('profiles').select('id').limit(1);
    if (error) {
        console.error('Supabase connectivity check failed:', error.message);
        return false;
    }
    console.log('Supabase connectivity check passed. Profiles count:', data?.length ?? 0);
    return true;
}

async function sendSignal(payload) {
    await ensureSignalingChannel();
    if (!signalingChannel) {
        console.error('Cannot send signal: signaling channel unavailable');
        return;
    }
    const { error } = await signalingChannel.send({
        type: 'broadcast',
        event: 'signal',
        payload
    });
    if (error) {
        console.error('Failed to send signal payload:', error.message);
    }
}

async function sendChatMessage(payload) {
    await ensureSignalingChannel();
    if (!signalingChannel) {
        console.error('Cannot send chat message: signaling channel unavailable');
        return;
    }
    const { error } = await signalingChannel.send({
        type: 'broadcast',
        event: 'chat-message',
        payload
    });
    if (error) {
        console.error('Failed to send chat payload:', error.message);
    }
}

async function startLocalMedia(mode = 'video') {
    const isAudioOnly = mode === 'audio';
    const constraints = { audio: true, video: !isAudioOnly };

    if (localStream) {
        const hasVideo = localStream.getVideoTracks().length > 0;
        if (hasVideo !== !isAudioOnly) {
            stopLocalMedia();
        } else {
            return localStream;
        }
    }

    try {
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        const localVideo = document.getElementById('local-video');
        if (!isAudioOnly) {
            localVideo.srcObject = localStream;
        } else {
            localVideo.srcObject = null;
        }
        return localStream;
    } catch (err) {
        console.error('Unable to access camera/microphone:', err.message || err);
        alert('Audio/video permission is required to start the call.');
        throw err;
    }
}

function createPeerConnection() {
    if (peerConnection) return peerConnection;

    peerConnection = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    peerConnection.ontrack = (event) => {
        remoteStream = event.streams[0];
        document.getElementById('remote-video').srcObject = remoteStream;
        document.getElementById('remote-audio').srcObject = remoteStream;
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate && callTarget) {
            sendSignal({
                type: 'ice-candidate',
                candidate: event.candidate,
                targetId: callTarget.id,
                sourceId: currentUserId
            });
        }
    };

    if (localStream) {
        localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));
    }

    return peerConnection;
}

async function handleSignalingMessage(payload) {
    if (!payload.type) return;
    if (!callTarget && payload.sourceId) {
        callTarget = users.find(u => u.id === payload.sourceId);
    }

    if (payload.type === 'offer') {
        const incomingMode = payload.callMode === 'audio' ? 'audio' : 'video';
        currentCallMode = incomingMode;

        await ensureSignalingChannel();
        await startLocalMedia(currentCallMode);
        createPeerConnection();
        await peerConnection.setRemoteDescription({ type: 'offer', sdp: payload.sdp });

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        sendSignal({
            type: 'answer',
            sdp: answer.sdp,
            targetId: payload.sourceId,
            sourceId: currentUserId,
            callMode: currentCallMode
        });

        showCallModal('Incoming call — connected', currentCallMode);
    }

    if (payload.type === 'answer' && peerConnection) {
        await peerConnection.setRemoteDescription({ type: 'answer', sdp: payload.sdp });
        showCallModal('Call connected', currentCallMode);
    }

    if (payload.type === 'ice-candidate' && peerConnection && payload.candidate) {
        try {
            await peerConnection.addIceCandidate(payload.candidate);
        } catch (err) {
            console.warn('Failed to add ICE candidate:', err.message || err);
        }
    }

    if (payload.type === 'hangup') {
        cleanupCall();
        closeCallModal();
    }
}

function showCallModal(statusText = 'Connecting...', mode = 'video') {
    const localVideoBox = document.getElementById('local-video-box');
    const remoteVideoBox = document.getElementById('remote-video-box');
    const localVideo = document.getElementById('local-video');
    const remoteVideo = document.getElementById('remote-video');
    const remoteAudio = document.getElementById('remote-audio');

    const isAudioOnly = mode === 'audio';
    localVideoBox.style.display = isAudioOnly ? 'none' : 'block';
    remoteVideo.style.display = isAudioOnly ? 'none' : 'block';
    remoteAudio.style.display = isAudioOnly ? 'block' : 'none';

    document.getElementById('call-header-info').innerHTML = `
        <div>
            <h3>${isAudioOnly ? 'Audio Call' : 'Video Call'} with ${callTarget?.name || 'Peer'}</h3>
            <div class="meta" style="font-size:0.85rem; color: var(--text-secondary)">${isAudioOnly ? 'Audio-only connection using your microphone.' : 'Use your mic and camera to connect.'}</div>
        </div>
    `;
    document.getElementById('call-status').innerText = statusText;
    document.getElementById('call-modal').classList.add('show');
    callActive = true;
}

function closeCallModal() {
    document.getElementById('call-modal').classList.remove('show');
    document.getElementById('call-status').innerText = 'Call ended';
    callActive = false;
}

function stopLocalMedia() {
    if (!localStream) return;
    localStream.getTracks().forEach((track) => track.stop());
    localStream = null;
}

function addIncomingMessage(message) {
    messages.push(message);
    saveDataToStorage();
    updateRecentChats();
    if (currentChatUser && currentChatUser.id === message.senderId) {
        renderChatPanel();
    }
}

function handleIncomingChatMessage(payload) {
    const message = payload.message;
    if (!message || !message.senderId || !message.receiverId) return;

    message.read = false;
    messages.push(message);
    saveDataToStorage();
    updateRecentChats();

    if (currentChatUser && currentChatUser.id === message.senderId) {
        renderChatPanel();
    }
}

function cleanupCall() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    stopLocalMedia();
    if (remoteStream) {
        remoteStream.getTracks().forEach(track => track.stop());
        remoteStream = null;
    }
    callTarget = null;
    isCaller = false;
    callActive = false;
    document.getElementById('local-video').srcObject = null;
    document.getElementById('remote-video').srcObject = null;
}

async function openCall(userId, mode = 'video') {
    if (!currentUserId) return;
    if (userId === currentUserId) return;

    currentCallMode = mode === 'audio' ? 'audio' : 'video';
    callTarget = users.find(u => u.id === userId);
    if (!callTarget) return;

    await ensureSignalingChannel();
    await startLocalMedia(currentCallMode);
    createPeerConnection();

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    sendSignal({
        type: 'offer',
        sdp: offer.sdp,
        targetId: userId,
        sourceId: currentUserId,
        callMode: currentCallMode
    });

    isCaller = true;
    showCallModal('Calling ' + callTarget.name + '...', currentCallMode);
}

function hangUpCall() {
    if (callTarget && currentUserId) {
        sendSignal({
            type: 'hangup',
            targetId: callTarget.id,
            sourceId: currentUserId
        });
    }
    cleanupCall();
    closeCallModal();
}

window.openCall = openCall;
window.hangUpCall = hangUpCall;

// ==========================================
// 3. CORE MATCHING ALGORITHM
// ==========================================
function calculateMatch(userA, userB) {
    if (userA.id === userB.id) return null;

    const aKnows = userA.knows.map(s => s.toLowerCase());
    const aWants = userA.wants.map(s => s.toLowerCase());
    const bKnows = userB.knows.map(s => s.toLowerCase());
    const bWants = userB.wants.map(s => s.toLowerCase());

    const aCanTeachB = userA.knows.filter(skill => bWants.includes(skill.toLowerCase()));
    const bCanTeachA = userB.knows.filter(skill => aWants.includes(skill.toLowerCase()));

    const teachScore = userB.wants.length > 0 ? (aCanTeachB.length / userB.wants.length) : 0;
    const learnScore = userA.wants.length > 0 ? (bCanTeachA.length / userA.wants.length) : 0;

    const finalScore = Math.round(((teachScore + learnScore) / 2) * 100);

    if (finalScore === 0) return null;

    return {
        user: userB,
        score: finalScore,
        teachSkills: bCanTeachA, 
        learnSkills: aCanTeachB, 
        sharedCount: aCanTeachB.length + bCanTeachA.length,
        category: getCategory(finalScore)
    };
}

function getCategory(score) {
    if (score >= 90) return { label: "Perfect Exchange", color: "var(--cat-perfect)" };
    if (score >= 75) return { label: "Excellent Match", color: "var(--cat-excellent)" };
    if (score >= 60) return { label: "Strong Match", color: "var(--cat-strong)" };
    if (score >= 40) return { label: "Good Match", color: "var(--cat-good)" };
    if (score >= 20) return { label: "One-Way Mentor", color: "var(--cat-mentor)" };
    return { label: "Weak Match", color: "var(--cat-weak)" };
}

function findMatches(selectedUser) {
    if (!selectedUser) return [];
    let matches = [];
    users.forEach(otherUser => {
        const matchData = calculateMatch(selectedUser, otherUser);
        if (matchData) matches.push(matchData);
    });
    return matches;
}

// ==========================================
// 4. FILTERING AND SORTING
// ==========================================
function filterAndSortMatches() {
    if(!activeUser) return;

    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    const minMatch = parseInt(document.getElementById('filter-min-match').value);
    const reqLevel = document.getElementById('filter-level').value;
    const reqAvail = document.getElementById('filter-availability').value;
    const sortMode = document.getElementById('sort-matches').value;

    let filtered = currentMatches.filter(match => {
        const u = match.user;
        if (match.score < minMatch) return false;
        if (reqLevel && u.level !== reqLevel) return false;
        if (reqAvail && u.availability !== reqAvail) return false;
        
        if (searchTerm) {
            const inName = u.name.toLowerCase().includes(searchTerm);
            const inLoc = u.location.toLowerCase().includes(searchTerm);
            const inSkills = [...u.knows, ...u.wants].some(s => s.toLowerCase().includes(searchTerm));
            if (!inName && !inLoc && !inSkills) return false;
        }
        return true;
    });

    filtered.sort((a, b) => {
        if (sortMode === 'highest') return b.score - a.score;
        if (sortMode === 'lowest') return a.score - b.score;
        if (sortMode === 'alphabetical') return a.user.name.localeCompare(b.user.name);
        if (sortMode === 'shared') return b.sharedCount - a.sharedCount;
        return 0;
    });

    renderMatches(filtered);
}

// ==========================================
// 5. UI RENDERING & UPDATES
// ==========================================
function getAvatarColor(name) {
    const colors = ['#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#f43f5e'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
}

function getInitials(name) {
    return name.substring(0, 2).toUpperCase();
}

function updateUIState() {
    const selector = document.getElementById('user-selector');
    const inputsToToggle = ['search-input', 'filter-min-match', 'filter-level', 'filter-availability', 'sort-matches'];
    
    selector.innerHTML = '';
    if (users.length === 0) {
        selector.innerHTML = '<option value="">No users available...</option>';
        selector.disabled = true;
        inputsToToggle.forEach(id => document.getElementById(id).disabled = true);
        
        document.getElementById('active-profile').innerHTML = `
            <div class="empty-state">
                <p style="font-size: 2rem; margin-bottom:1rem;">👋</p>
                <p>No users in the system.</p>
                <p style="font-size:0.9rem; margin-top:0.5rem; color:var(--primary);">Click "+ Add User" above to get started!</p>
            </div>
        `;
        document.getElementById('matches-container').innerHTML = `
            <div class="empty-state-large" style="grid-column: 1/-1;">
                <h3>Ready to Match!</h3>
                <p>Add at least two users to see the matching algorithm in action.</p>
            </div>
        `;
        document.getElementById('match-count').innerText = "0";
    } else {
        selector.innerHTML = '';
        selector.disabled = true;
        inputsToToggle.forEach(id => document.getElementById(id).disabled = false);

        const opt = document.createElement('option');
        opt.value = activeUser.id;
        opt.textContent = `${activeUser.name} (You)`;
        selector.appendChild(opt);
        selector.value = activeUser.id;

        renderProfile();
        currentMatches = findMatches(activeUser);
        filterAndSortMatches();
    }
    
    updateGlobalStats();
    updateRecentChats();
    renderChatPanel();
}

function renderProfile() {
    if (!activeUser) return;
    const container = document.getElementById('active-profile');
    container.innerHTML = `
        <div class="profile-header">
            <div class="avatar" style="background-color: ${getAvatarColor(activeUser.name)}">
                ${getInitials(activeUser.name)}
            </div>
            <div class="profile-info">
                <h2>${activeUser.name}</h2>
                <div class="meta">
                    ${activeUser.email ? `<span>✉️ ${activeUser.email}</span>` : ''}
                    ${activeUser.location ? `<span>📍 ${activeUser.location}</span>` : ''}
                    ${activeUser.level ? `<span>⭐ ${activeUser.level}</span>` : ''}
                </div>
            </div>
        </div>
        ${activeUser.bio ? `<p class="bio">"${activeUser.bio}"</p>` : ''}
        <div class="profile-summary meta" style="margin-top: 1rem; display: grid; gap: 0.5rem;">
            ${activeUser.education ? `<span>🎓 Education: ${activeUser.education}</span>` : ''}
            ${activeUser.occupation ? `<span>💼 Occupation: ${activeUser.occupation}</span>` : ''}
            ${activeUser.age ? `<span>🧑 Age: ${activeUser.age}</span>` : ''}
            ${activeUser.gender ? `<span>⚧ Gender: ${activeUser.gender}</span>` : ''}
            ${activeUser.learningPreference ? `<span>🌐 Learning: ${activeUser.learningPreference}</span>` : ''}
            ${activeUser.availability ? `<span>🕒 Availability: ${activeUser.availability}</span>` : ''}
        </div>
        <div class="skills-section">
            <h4>Can Teach (Knows)</h4>
            <div class="skill-tags">
                ${activeUser.knows.map(s => `<span class="tag knows">${s}</span>`).join('')}
            </div>
        </div>
        <div class="skills-section">
            <h4>Wants to Learn</h4>
            <div class="skill-tags">
                ${activeUser.wants.map(s => `<span class="tag wants">${s}</span>`).join('')}
            </div>
        </div>
        <div class="meta" style="margin-top: 1rem; color: var(--text-secondary)">
            <span>🕒 Availability: ${activeUser.availability}</span>
        </div>
    `;
}

function generateMutualReason(match) {
    const aTeachesB = match.learnSkills.length > 0; 
    const bTeachesA = match.teachSkills.length > 0; 

    if (aTeachesB && bTeachesA) {
        return "Both users can help each other learn! Perfect mutual exchange.";
    } else if (aTeachesB && !bTeachesA) {
        return `You can mentor ${match.user.name}, but they don't have skills you currently want.`;
    } else if (!aTeachesB && bTeachesA) {
        return `${match.user.name} can mentor you, but you don't have skills they currently want.`;
    }
    return "Partial interest found.";
}

// Expose openChat to the global window object so inline HTML onclick can use it
window.openChat = function(userId) {
    currentChatUser = users.find(u => u.id === userId);
    if (!currentChatUser || !activeUser) return;

    renderChatPanel();
    updateRecentChats();
    document.getElementById('chat-panel-input').focus();
}

function renderChatMessages() {
    const chatContainer = document.getElementById('chat-messages');
    chatContainer.innerHTML = '';

    // Filter messages between activeUser and currentChatUser
    const conversation = messages.filter(m => 
        (m.senderId === activeUser.id && m.receiverId === currentChatUser.id) ||
        (m.senderId === currentChatUser.id && m.receiverId === activeUser.id)
    );

    if (conversation.length === 0) {
        chatContainer.innerHTML = `
            <div class="empty-state">
                <p>No messages yet.</p>
                <p>Say hi to ${currentChatUser.name}!</p>
            </div>
        `;
    } else {
        conversation.forEach(msg => {
            const isSentByMe = msg.senderId === activeUser.id;
            const bubble = document.createElement('div');
            bubble.className = `chat-bubble ${isSentByMe ? 'msg-sent' : 'msg-received'}`;
            
            const date = new Date(msg.timestamp);
            const timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
            bubble.innerHTML = `
                <div class="chat-text">${msg.text}</div>
                <span class="msg-time">${timeString}</span>
            `;
            chatContainer.appendChild(bubble);
        });
    }
    
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function renderChatPanel() {
    const titleEl = document.getElementById('chat-panel-title');
    const statusEl = document.getElementById('chat-panel-status');
    const messageEl = document.getElementById('chat-panel-messages');
    const inputEl = document.getElementById('chat-panel-input');
    const submitBtn = document.querySelector('#chat-panel-form button[type="submit"]');
    const callBtn = document.getElementById('chat-panel-call-btn');

    if (!currentChatUser) {
        titleEl.textContent = 'Chat Panel';
        statusEl.textContent = 'Select a user and click Message.';
        messageEl.innerHTML = `
            <div class="empty-state">
                <p>No active conversation.</p>
                <p>Click a message button to start chat.</p>
            </div>
        `;
        inputEl.value = '';
        inputEl.disabled = true;
        submitBtn.disabled = true;
        callBtn.disabled = true;
        callBtn.onclick = null;
        return;
    }

    titleEl.textContent = `Chat with ${currentChatUser.name}`;
    statusEl.textContent = `${currentChatUser.location || 'Unknown location'} • ${currentChatUser.level || 'No level'}`;
    inputEl.disabled = false;
    submitBtn.disabled = false;
    callBtn.disabled = false;
    callBtn.onclick = () => openCall(currentChatUser.id, 'video');

    const audioBtn = document.getElementById('chat-panel-audio-call-btn');
    if (audioBtn) {
        audioBtn.disabled = false;
        audioBtn.onclick = () => openCall(currentChatUser.id, 'audio');
    }

    renderChatPanelMessages();
}

function renderChatPanelMessages() {
    const chatContainer = document.getElementById('chat-panel-messages');
    chatContainer.innerHTML = '';

    if (!currentChatUser) {
        chatContainer.innerHTML = `
            <div class="empty-state">
                <p>No conversation selected.</p>
            </div>
        `;
        return;
    }

    markMessagesReadForChat(currentChatUser.id);

    const conversation = messages
        .filter(m =>
            (m.senderId === activeUser.id && m.receiverId === currentChatUser.id) ||
            (m.senderId === currentChatUser.id && m.receiverId === activeUser.id)
        )
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    if (conversation.length === 0) {
        chatContainer.innerHTML = `
            <div class="empty-state">
                <p>No messages yet.</p>
                <p>Say hi to ${currentChatUser.name}!</p>
            </div>
        `;
    } else {
        conversation.forEach((msg) => {
            const isSentByMe = msg.senderId === activeUser.id;
            const bubble = document.createElement('div');
            bubble.className = `chat-bubble ${isSentByMe ? 'msg-sent' : 'msg-received'}`;
            const timeString = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            bubble.innerHTML = `
                <div class="chat-text">${msg.text}</div>
                <span class="msg-time">${timeString}</span>
            `;
            chatContainer.appendChild(bubble);
        });
    }
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function updateRecentChats() {
    const recentContainer = document.getElementById('recent-messages');
    if (!activeUser) {
        recentContainer.innerHTML = `
            <div class="empty-state">
                <p>No recent chats yet.</p>
                <p>Open a conversation to start messaging.</p>
            </div>
        `;
        return;
    }

    const chatSummaries = {};
    messages.forEach((msg) => {
        if (msg.senderId !== activeUser.id && msg.receiverId !== activeUser.id) return;

        const otherId = msg.senderId === activeUser.id ? msg.receiverId : msg.senderId;
        const otherUser = users.find(u => u.id === otherId) || { name: 'Unknown', id: otherId };
        const previous = chatSummaries[otherId];
        if (!previous || new Date(msg.timestamp) > new Date(previous.timestamp)) {
            chatSummaries[otherId] = {
                ...msg,
                otherId,
                otherName: otherUser.name,
                unread: msg.receiverId === activeUser.id && !msg.read
            };
        }
    });

    const recentList = Object.values(chatSummaries).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    if (recentList.length === 0) {
        recentContainer.innerHTML = `
            <div class="empty-state">
                <p>No recent chats yet.</p>
                <p>Open a conversation to start messaging.</p>
            </div>
        `;
        return;
    }

    recentContainer.innerHTML = recentList.map((item) => {
        const timeString = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const unreadBadge = item.unread ? '<span class="badge unread-badge">New</span>' : '';
        return `
            <button class="recent-chat-item" onclick="window.openChat('${item.otherId}')">
                <div>
                    <strong>${item.otherName}</strong>
                    <p>${item.text}</p>
                </div>
                <div class="recent-meta">
                    <span>${timeString}</span>
                    ${unreadBadge}
                </div>
            </button>
        `;
    }).join('');
}

function markMessagesReadForChat(userId) {
    let updated = false;
    messages = messages.map((m) => {
        if (m.senderId === userId && m.receiverId === activeUser.id && !m.read) {
            updated = true;
            return { ...m, read: true };
        }
        return m;
    });
    if (updated) {
        saveDataToStorage();
        updateRecentChats();
    }
}

async function handleSendMessage(e) {
    e.preventDefault();
    const input = document.getElementById('chat-panel-input');
    const text = input.value.trim();
    
    if (!text || !activeUser || !currentChatUser) return;
    
    const newMsg = {
        id: Date.now().toString(),
        senderId: activeUser.id,
        receiverId: currentChatUser.id,
        text: text,
        timestamp: new Date().toISOString(),
        read: true
    };
    
    messages.push(newMsg);
    saveDataToStorage();
    updateRecentChats();
    await sendChatMessage({
        message: newMsg,
        targetId: currentChatUser.id,
        sourceId: currentUserId
    });
    
    input.value = '';
    renderChatPanelMessages();
}

function renderMatches(matchesArray) {
    const container = document.getElementById('matches-container');
    document.getElementById('match-count').innerText = matchesArray.length;
    container.innerHTML = '';

    if (users.length < 2) {
        container.innerHTML = `
            <div class="empty-state-large" style="grid-column: 1/-1;">
                <h3>Need more people</h3>
                <p>Add at least one more user to find matches.</p>
            </div>
        `;
        return;
    }

    if (matchesArray.length === 0) {
        container.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: var(--text-secondary); padding: 2rem;">No matching users found based on current criteria.</p>`;
        return;
    }

    matchesArray.forEach((match, index) => {
        const u = match.user;
        const card = document.createElement('div');
        card.className = 'match-card';
        card.style.animationDelay = `${index * 0.05}s`;
        
        card.innerHTML = `
            <div class="mc-header" title="Click to Message ${u.name}" onclick="window.openChat('${u.id}')">
                <div class="avatar" style="background-color: ${getAvatarColor(u.name)}; width: 50px; height: 50px; font-size: 1.2rem;">
                    ${getInitials(u.name)}
                </div>
                <div>
                    <h3 style="margin-bottom: 0.2rem;">${u.name}</h3>
                    <div class="meta">📍 ${u.location} • ⭐ ${u.level}</div>
                </div>
                <div class="category-badge" style="background-color: ${match.category.color}">
                    ${match.category.label}
                </div>
            </div>
            
            <div class="mc-body">
                <div class="score-wrapper">
                    <div class="score-header">
                        <span style="font-weight: 600; font-size: 0.9rem; color: var(--text-secondary)">Match Score</span>
                        <span class="score-num" style="color: ${match.category.color}">${match.score}%</span>
                    </div>
                    <div class="progress-track">
                        <div class="progress-fill" style="background-color: ${match.category.color}" data-width="${match.score}%"></div>
                    </div>
                </div>

                <div class="match-details">
                    ${match.teachSkills.length > 0 ? `
                        <div class="detail-row">
                            <h5>${u.name} can teach you:</h5>
                            <p>${match.teachSkills.join(', ')}</p>
                        </div>
                    ` : ''}
                    
                    ${match.learnSkills.length > 0 ? `
                        <div class="detail-row">
                            <h5>You can teach ${u.name}:</h5>
                            <p>${match.learnSkills.join(', ')}</p>
                        </div>
                    ` : ''}
                </div>
                
                <div class="mutual-reason">
                    ${generateMutualReason(match)}
                </div>
                
                <div class="match-actions">
                    <span class="meta" style="font-size: 0.8rem; margin-right: auto;">🕒 ${u.availability}</span>
                    <button class="btn btn-secondary btn-small" onclick="window.openCall('${u.id}', 'audio')">📞 Audio</button>
                    <button class="btn btn-secondary btn-small" onclick="window.openCall('${u.id}', 'video')">🎥 Video</button>
                    <button class="btn btn-primary btn-small" onclick="window.openChat('${u.id}')">💬 Message</button>
                </div>
            </div>
        `;
        container.appendChild(card);
    });

    setTimeout(() => {
        const cards = document.querySelectorAll('.match-card');
        cards.forEach(c => c.classList.add('fade-in'));
        const bars = document.querySelectorAll('.progress-fill');
        bars.forEach(bar => { bar.style.width = bar.getAttribute('data-width'); });
    }, 50);
}

function updateGlobalStats() {
    let totalPossibleMatches = 0;
    let perfectCount = 0;
    let totalScoreSum = 0;
    let validPairs = 0;
    let skillCounts = {};

    if (users.length > 1) {
        for (let i = 0; i < users.length; i++) {
            [...users[i].knows, ...users[i].wants].forEach(s => {
                const sL = s.toLowerCase();
                skillCounts[sL] = (skillCounts[sL] || 0) + 1;
            });

            for (let j = i + 1; j < users.length; j++) {
                const m1 = calculateMatch(users[i], users[j]);
                if (m1) {
                    totalPossibleMatches++;
                    validPairs++;
                    totalScoreSum += m1.score;
                    if (m1.score >= 90) perfectCount++;
                }
            }
        }
    } else if (users.length === 1) {
        [...users[0].knows, ...users[0].wants].forEach(s => {
            const sL = s.toLowerCase();
            skillCounts[sL] = (skillCounts[sL] || 0) + 1;
        });
    }

    const avgScore = validPairs > 0 ? Math.round(totalScoreSum / validPairs) : 0;
    
    let topSkill = "N/A";
    let topCount = 0;
    for(let s in skillCounts) {
        if(skillCounts[s] > topCount) {
            topCount = skillCounts[s];
            topSkill = s.charAt(0).toUpperCase() + s.slice(1);
        }
    }

    document.getElementById('dashboard-stats').innerHTML = `
        <div class="stat-item"><div class="stat-value">${users.length}</div><div class="stat-label">Total Users</div></div>
        <div class="stat-item"><div class="stat-value">${totalPossibleMatches}</div><div class="stat-label">Total Matches</div></div>
        <div class="stat-item"><div class="stat-value">${perfectCount}</div><div class="stat-label">Perfect Matches</div></div>
        <div class="stat-item"><div class="stat-value">${avgScore}%</div><div class="stat-label">Avg Match Score</div></div>
        <div class="stat-item" style="grid-column: 1/-1;"><div class="stat-value" style="font-size: 1.2rem;">${topSkill}</div><div class="stat-label">Most Popular Skill</div></div>
    `;
}

// ==========================================
// 6. MODAL & FORM HANDLING
// ==========================================
function toggleAddUserModal(show) {
    const modal = document.getElementById('add-user-modal');
    if (show) {
        modal.classList.add('show');
    } else {
        modal.classList.remove('show');
        document.getElementById('add-user-form').reset();
    }
}

function handleAddUser(e) {
    e.preventDefault();
    
    const parseSkills = (str) => str.split(',').map(s => s.trim()).filter(Boolean);

    const newUser = {
        id: Date.now().toString(),
        name: document.getElementById('reg-name').value.trim(),
        bio: document.getElementById('reg-bio').value.trim(),
        location: document.getElementById('reg-location').value.trim(),
        level: document.getElementById('reg-level').value,
        availability: document.getElementById('reg-availability').value,
        knows: parseSkills(document.getElementById('reg-knows').value),
        wants: parseSkills(document.getElementById('reg-wants').value)
    };

    users.push(newUser);
    saveDataToStorage();
    
    toggleAddUserModal(false);
    updateUIState();
}

// ==========================================
// 7. INITIALIZATION & EVENTS
// ==========================================
function initTheme() {
    const savedTheme = localStorage.getItem('skill-exchange-theme') || 'light';
    if (savedTheme === 'dark') {
        document.body.setAttribute('data-theme', 'dark');
        document.getElementById('theme-toggle').textContent = '☀️';
    }
}

function toggleTheme() {
    const isDark = document.body.getAttribute('data-theme') === 'dark';
    if (isDark) {
        document.body.removeAttribute('data-theme');
        localStorage.setItem('skill-exchange-theme', 'light');
        document.getElementById('theme-toggle').textContent = '🌙';
    } else {
        document.body.setAttribute('data-theme', 'dark');
        localStorage.setItem('skill-exchange-theme', 'dark');
        document.getElementById('theme-toggle').textContent = '☀️';
    }
}

async function initApp() {
    initTheme();

    const session = await loadSessionUser();
    if (!session) {
        window.location.href = 'index.html';
        return;
    }

    const connected = await testSupabaseConnection();
    if (!connected) {
        alert('Unable to connect to Supabase. Please check your Supabase URL, anon key, and network access.');
        return;
    }

    loadDataFromStorage();
    await ensureSignalingChannel();
    await loadProfilesFromSupabase();

    activeUser = users.find(u => u.id === currentUserId);
    if (!activeUser) {
        const userName = session.user.user_metadata?.full_name || session.user.email || 'You';
        activeUser = {
            id: currentUserId,
            name: userName,
            bio: '',
            location: '',
            level: 'N/A',
            availability: '',
            knows: [],
            wants: [],
            avatar_url: ''
        };
        users.unshift(activeUser);
    }

    // User Selection / Filters
    document.getElementById('user-selector').addEventListener('change', (e) => {
        activeUser = users.find(u => u.id === e.target.value);
        updateUIState();
    });

    const inputs = ['search-input', 'filter-min-match', 'filter-level', 'filter-availability', 'sort-matches'];
    inputs.forEach(id => document.getElementById(id).addEventListener('input', filterAndSortMatches));

    // UI Buttons
    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
    document.getElementById('btn-clear-data').addEventListener('click', clearAllData);
    
    // Add User Modal
    document.getElementById('btn-add-user').addEventListener('click', () => toggleAddUserModal(true));
    document.getElementById('close-modal').addEventListener('click', () => toggleAddUserModal(false));
    document.getElementById('btn-cancel-modal').addEventListener('click', () => toggleAddUserModal(false));
    document.getElementById('add-user-form').addEventListener('submit', handleAddUser);
    
    // Chat Panel
    document.getElementById('chat-panel-form').addEventListener('submit', handleSendMessage);

    // Call Modal
    document.getElementById('close-call-modal').addEventListener('click', hangUpCall);
    document.getElementById('btn-end-call').addEventListener('click', hangUpCall);
    document.getElementById('call-modal').addEventListener('click', (event) => {
        if (event.target.id === 'call-modal') hangUpCall();
    });

    // Initial state setup
    updateUIState();
    updateRecentChats();
}

document.addEventListener("DOMContentLoaded", initApp);