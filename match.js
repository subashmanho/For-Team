// ==========================================
// 1. STATE MANAGEMENT
// ==========================================
let users = [];
let messages = []; // Array to hold all chat messages
let activeUser = null;
let currentChatUser = null;
let currentMatches = [];

// ==========================================
// 2. LOCAL STORAGE HANDLING
// ==========================================
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
        selector.disabled = false;
        inputsToToggle.forEach(id => document.getElementById(id).disabled = false);
        
        users.forEach(u => {
            const opt = document.createElement('option');
            opt.value = u.id;
            opt.textContent = u.name;
            selector.appendChild(opt);
        });

        if (!activeUser || !users.find(u => u.id === activeUser.id)) {
            activeUser = users[0];
        }
        selector.value = activeUser.id;
        
        renderProfile();
        currentMatches = findMatches(activeUser);
        filterAndSortMatches();
    }
    
    updateGlobalStats();
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
                    <span>📍 ${activeUser.location}</span>
                    <span>⭐ ${activeUser.level}</span>
                </div>
            </div>
        </div>
        <p class="bio">"${activeUser.bio}"</p>
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
    
    // Setup Chat Header
    document.getElementById('chat-header-info').innerHTML = `
        <div class="avatar" style="background-color: ${getAvatarColor(currentChatUser.name)}; width: 40px; height: 40px; font-size: 1rem;">
            ${getInitials(currentChatUser.name)}
        </div>
        <div>
            <h3>${currentChatUser.name}</h3>
            <div class="meta" style="font-size: 0.75rem;">⭐ ${currentChatUser.level}</div>
        </div>
    `;
    
    renderChatMessages();
    document.getElementById('chat-modal').classList.add('show');
    
    // Focus input automatically
    setTimeout(() => document.getElementById('chat-input').focus(), 100);
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
            
            // Format time
            const date = new Date(msg.timestamp);
            const timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
            bubble.innerHTML = `
                ${msg.text}
                <span class="msg-time">${timeString}</span>
            `;
            chatContainer.appendChild(bubble);
        });
    }
    
    // Auto scroll to bottom
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function handleSendMessage(e) {
    e.preventDefault();
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    
    if (!text || !activeUser || !currentChatUser) return;
    
    const newMsg = {
        id: Date.now().toString(),
        senderId: activeUser.id,
        receiverId: currentChatUser.id,
        text: text,
        timestamp: new Date().toISOString()
    };
    
    messages.push(newMsg);
    saveDataToStorage();
    
    input.value = '';
    renderChatMessages();
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

function closeChatModal() {
    document.getElementById('chat-modal').classList.remove('show');
    currentChatUser = null;
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
    
    activeUser = newUser; 
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

function initApp() {
    initTheme();
    loadDataFromStorage();

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
    
    // Chat Modal
    document.getElementById('close-chat-modal').addEventListener('click', closeChatModal);
    document.getElementById('chat-form').addEventListener('submit', handleSendMessage);

    // Initial state setup
    updateUIState();
}

document.addEventListener("DOMContentLoaded", initApp);