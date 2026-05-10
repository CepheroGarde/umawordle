
// Mode Configuration
const GAME_CONFIG = {
    uma: {
        keys: ['sprint', 'mile', 'med', 'long', 'front', 'pace', 'late', 'end', 'turf', 'dirt'],
        headers: ['Spr', 'Mil', 'Med', 'Lon', 'Fro', 'Pac', 'Lat', 'End', 'Trf', 'Drt'],
        data: () => UMAS,
        placeholder: "Enter Umamusume name...",
        resultTitle: "Winning Umamusume",
        storageKey: 'uma_wordle_stats',
        helpDesc: "Guess the Umamusume based on their base Aptitudes!",
        shareTitle: "UMAWORDLE",
        sections: [
            { title: "Distance", keys: ['sprint', 'mile', 'med', 'long'], color: 'blue' },
            { title: "Strategy", keys: ['front', 'pace', 'late', 'end'], color: 'purple' },
            { title: "Track", keys: ['turf', 'dirt'], color: 'orange' }
        ]
    },
    course: {
        keys: ['length', 'surface', 'turn', 'location'],
        headers: ['Length', 'Surface', 'Turn', 'Location'],
        data: () => COURSES,
        placeholder: "Enter G1 Race name...",
        resultTitle: "Winning G1 Race",
        storageKey: 'course_wordle_stats',
        helpDesc: "Guess the G1 Race based on its course features!",
        shareTitle: "RACEWORDLE",
        sections: [
            { title: "Course Info", keys: ['length', 'surface', 'turn', 'location'], color: 'green' }
        ]
    }
};

let currentGameType = 'uma';
let UMAS = [];
let COURSES = [];
const RANK_MAP = { 'S': 6, 'A': 5, 'B': 4, 'C': 3, 'D': 2, 'E': 1, 'F': 0, 'G': -1 };

// Persistent states for both modes
let allPersistentData = {
    uma: { dailyStreak: 0, lastPlayedDate: null, dailyGuesses: [], dailyStatus: 'playing' },
    course: { dailyStreak: 0, lastPlayedDate: null, dailyGuesses: [], dailyStatus: 'playing' }
};

let sessionState = {
    active: false,
    mode: null, // 'daily', 'easy', 'unlimited', 'hard'
    target: null,
    guesses: [],
    clues: [],
    unlimitedScore: 0,
    isGameOver: false,
    knownStats: {}
};

function getUTC8Time() {
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    return new Date(utc + (3600000 * 8));
}

function getDailyString(offsetDays = 0) {
    const date8 = getUTC8Time();
    if (offsetDays !== 0) date8.setDate(date8.getDate() + offsetDays);
    
    // Use getUTC methods to ensure the "Day" is fixed to the UTC+8 calculation
    const y = date8.getUTCFullYear();
    const m = date8.getUTCMonth(); 
    const d = date8.getUTCDate();
    
    return `${y}-${m}-${d}`; 
}

async function loadGameData() {
    try {
        const [umaRes, courseRes] = await Promise.all([
            fetch('data.json'),
            fetch('courses.json')
        ]);
        UMAS = await umaRes.json();
        COURSES = await courseRes.json();
        init();
    } catch (error) {
        console.error("Failed to load data:", error);
    }
}

function init() {
    loadPersistentData();
    switchGameType('uma'); 
    startClock();
    loadTheme();
}

function switchGameType(type) {
    currentGameType = type;
    const config = GAME_CONFIG[type];
    
    // Update Menu Tabs UI
    const tabUma = document.getElementById('tab-uma');
    const tabCourse = document.getElementById('tab-course');
    if (type === 'uma') {
        tabUma.className = "flex-1 py-2 rounded-lg font-bold transition-all bg-white shadow-sm text-green-700";
        tabCourse.className = "flex-1 py-2 rounded-lg font-bold transition-all text-gray-500 hover:text-gray-700";
    } else {
        tabCourse.className = "flex-1 py-2 rounded-lg font-bold transition-all bg-white shadow-sm text-green-700";
        tabUma.className = "flex-1 py-2 rounded-lg font-bold transition-all text-gray-500 hover:text-gray-700";
    }

    // Update Menu Content
    document.getElementById('menu-description').innerText = config.helpDesc;
    
    // Update Daily Info
    const today = getDailyString();
    const yesterday = getDailyString(-1);
    const pData = allPersistentData[type];
    if (pData.lastPlayedDate !== today) {
        pData.dailyGuesses = [];
        pData.dailyStatus = 'playing';
        if (pData.lastPlayedDate !== yesterday) {
            pData.dailyStreak = 0;
        }
        savePersistentData();
    }
    
    updateStatsUI();
    checkDailyStatus();
    displayYesterdayAnswer();

    // Reset Table Headers
    const headRow = document.createElement('tr');
    headRow.className = "text-[10px] md:text-xs font-bold uppercase";
    
    // Name header
    const nameTh = document.createElement('th');
    nameTh.className = "w-1/6 name-col p-2 bg-gray-100 text-gray-600 rounded-t-lg";
    nameTh.innerText = "Name";
    headRow.appendChild(nameTh);

    config.headers.forEach((header, index) => {
        const th = document.createElement('th');
        th.className = `p-2 ${index === 0 ? 'rounded-tl-lg' : ''} ${index === config.headers.length - 1 ? 'rounded-tr-lg cell-group-end' : ''}`;
        // Set background color based on section if in uma mode
        if (type === 'uma') {
            if (index < 4) th.className += " head-dist";
            else if (index < 8) th.className += " head-strat";
            else th.className += " head-track";
        } else {
            th.className += " head-course"; // Custom style for course mode headers
        }
        th.innerText = header;
        headRow.appendChild(th);
    });
    document.getElementById('guess-head').innerHTML = '';
    document.getElementById('guess-head').appendChild(headRow);

    // Hard mode is only for Uma for now (since we have clues for Umas)
    if (type === 'course') {
        document.getElementById('hard-btn').classList.add('hidden');
        document.getElementById('hard-mode-desc').classList.add('hidden');
    } else {
        document.getElementById('hard-btn').classList.remove('hidden');
        document.getElementById('hard-mode-desc').classList.remove('hidden');
    }

    // Update input placeholder
    document.getElementById('uma-input').placeholder = config.placeholder;
}

function loadPersistentData() {
    const saved = localStorage.getItem('uma_wordle_v2_stats');
    if (saved) {
        allPersistentData = JSON.parse(saved);
    }
}

function savePersistentData() {
    localStorage.setItem('uma_wordle_v2_stats', JSON.stringify(allPersistentData));
}

function getTargetForDate(dateStr, dataList) {
    let hash = 0;
    for (let i = 0; i < dateStr.length; i++) {
        hash = ((hash << 5) - hash) + dateStr.charCodeAt(i);
        hash |= 0;
    }
    const index = Math.abs(hash) % dataList.length;
    return dataList[index];
}

function displayYesterdayAnswer() {
    const config = GAME_CONFIG[currentGameType];
    const dataList = config.data();
    const yesterdayStr = getDailyString(-1);
    const yesterdayTarget = getTargetForDate(yesterdayStr, dataList);
    document.getElementById('yesterday-info').innerText = `Yesterday's Answer: ${yesterdayTarget.name}`;
}

function startClock() {
    const clockEl = document.getElementById('server-time');
    setInterval(() => {
        const now8 = getUTC8Time();
        const resetTime = new Date(now8);
        resetTime.setDate(resetTime.getDate() + 1);
        resetTime.setHours(0, 0, 0, 0);
        const diff = resetTime - now8;
        if (diff <= 0) { location.reload(); return; }
        const h = String(Math.floor((diff / (1000 * 60 * 60)) % 24)).padStart(2, '0');
        const m = String(Math.floor((diff / (1000 * 60)) % 60)).padStart(2, '0');
        const s = String(Math.floor((diff / 1000) % 60)).padStart(2, '0');
        clockEl.innerText = `NEXT RESET IN: ${h}:${m}:${s}`;
    }, 1000);
}

function toggleTheme() {
    const body = document.body;
    body.classList.toggle('dark');
    localStorage.setItem('theme', body.classList.contains('dark') ? 'dark' : 'light');
}

function loadTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') document.body.classList.add('dark');
}
function showResult(isWin) {
    const modal = document.getElementById('result-modal');
    const title = document.getElementById('result-title');
    const content = document.getElementById('result-content');
    const target = GAME_STATE.target;

    // 1. Set the Title
    title.innerText = isWin ? "Victory!" : "Better Luck Next Time";
    title.className = isWin ? "text-2xl font-bold text-green-600" : "text-2xl font-bold text-red-600";

    // 2. Populate Content
    content.innerHTML = `
    <div class="flex flex-col items-center gap-4">
        <p class="text-lg">The ${GAME_CONFIG[GAME_STATE.mode].resultTitle} was:</p>
        <div class="font-black text-3xl tracking-wider text-green-800">${target.name}</div>
        ${target.image ? `
    <div class="w-full flex justify-center my-2">
        <img src="${target.image}" 
             class="max-h-48 w-auto object-contain rounded-lg shadow-sm border border-gray-100" 
             alt="${target.name}">
    </div>` : ''}
        `;

    // 3. Reveal the Modal
    modal.classList.remove('hidden');
    modal.classList.add('flex'); // Ensure flex is added if using Tailwind center utilities
}
function startGame(mode) {
    const config = GAME_CONFIG[currentGameType];
    const dataList = config.data();
    const today = getDailyString();
    
    sessionState.active = true;
    sessionState.mode = mode;
    sessionState.guesses = [];
    sessionState.clues = [];
    sessionState.isGameOver = false;
    sessionState.knownStats = {};

    if (mode === 'daily') {
        sessionState.target = getTargetForDate(today, dataList);
        const pData = allPersistentData[currentGameType];
        if (pData.lastPlayedDate === today) {
            sessionState.guesses = [...pData.dailyGuesses];
            if (pData.dailyStatus !== 'playing') sessionState.isGameOver = true;
        } else {
            pData.lastPlayedDate = today;
            pData.dailyGuesses = [];
            pData.dailyStatus = 'playing';
            savePersistentData();
        }
    } else {
        sessionState.target = dataList[Math.floor(Math.random() * dataList.length)];
    }

    if (mode === 'hard' && currentGameType === 'uma') {
        const otherUmas = dataList.filter(u => u.name !== sessionState.target.name);
        const shuffled = otherUmas.sort(() => 0.5 - Math.random());
        sessionState.clues = shuffled.slice(0, 3);
    }

    renderGameLayout();
    
    if (mode === 'daily' && sessionState.guesses.length > 0) {
        sessionState.guesses.forEach(g => {
            updateKnownStats(g);
            addGuessRow(g, false);
        });
        if (sessionState.isGameOver) {
            document.getElementById('input-container').classList.add('hidden');
            const pData = allPersistentData[currentGameType];
            if (pData.dailyStatus === 'won') {
                showModal("Goal In!", `You found the answer!`, false);
            } else {
                showModal("Retired...", `The correct answer was ${sessionState.target.name}. Try again tomorrow!`, false);
            }
        }
    }

    if (mode === 'hard' && currentGameType === 'uma') {
        sessionState.clues.forEach(c => addGuessRow(c, true));
    }
}

function renderGameLayout() {
    document.getElementById('menu-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
    document.getElementById('mode-indicator').innerText = currentGameType + " / " + sessionState.mode;
    document.getElementById('guess-grid').innerHTML = '';
    document.getElementById('uma-input').value = '';
    document.getElementById('input-container').classList.remove('hidden');
    
    const nameCols = document.querySelectorAll('.name-col');
    nameCols.forEach(col => {
        if (sessionState.mode === 'hard') col.classList.add('hidden');
        else col.classList.remove('hidden');
    });

    updateGuessCountUI();
    updateScoreUI();
}

function updateGuessCountUI() {
    const maxAttempts = sessionState.mode === 'daily'
        ? 5
        : sessionState.mode === 'hard'
            ? 2
            : sessionState.mode === 'easy'
                ? '∞'
                : 5;

    if (maxAttempts === '∞') {
        document.getElementById('remaining-guesses').innerText = 'Unlimited';
    } else {
        const remaining = maxAttempts - sessionState.guesses.length;
        document.getElementById('remaining-guesses').innerText = Math.max(0, remaining);
    }
}

function showMenu() {
    document.getElementById('menu-screen').classList.remove('hidden');
    document.getElementById('game-screen').classList.add('hidden');
    checkDailyStatus();
}

function checkDailyStatus() {
    const today = getDailyString();
    const statusDiv = document.getElementById('daily-status');
    const pData = allPersistentData[currentGameType];
    if (pData.lastPlayedDate === today && pData.dailyStatus !== 'playing') {
        statusDiv.innerText = `Daily ${currentGameType.toUpperCase()} Wordle completed for today!`;
        statusDiv.classList.add('text-green-600');
    } else {
        statusDiv.innerText = "";
        statusDiv.classList.remove('text-green-600');
    }
}

function updateScoreUI() {
    const el = document.getElementById('score-display');
    const pData = allPersistentData[currentGameType];
    if (['unlimited', 'hard', 'easy'].includes(sessionState.mode)) {
        el.innerText = `Win Streak: ${sessionState.unlimitedScore}`;
    } else {
        el.innerText = `Daily Streak: ${pData.dailyStreak}`;
    }
}

function updateStatsUI() {
    const pData = allPersistentData[currentGameType];
    document.getElementById('stats-summary').innerHTML = `<span class="text-xs uppercase text-gray-400">Daily Streak:</span> ${pData.dailyStreak}`;
}

const input = document.getElementById('uma-input');
const autoBox = document.getElementById('autocomplete-list');

function updateKnownStats(item) {
    const config = GAME_CONFIG[currentGameType];
    config.keys.forEach(key => {
        if (item[key] === sessionState.target[key]) {
            sessionState.knownStats[key] = item[key];
        }
    });
}

function renderSuggestions(filterText = "") {
    const val = filterText.toLowerCase();
    autoBox.innerHTML = '';
    const config = GAME_CONFIG[currentGameType];
    const dataList = config.data();
    
    const guessedNames = sessionState.guesses.map(g => g.name);
    const clueNames = sessionState.clues.map(c => c.name);
    
    let matches = dataList.filter(u => 
        u.name.toLowerCase().includes(val) && 
        !guessedNames.includes(u.name) && 
        !clueNames.includes(u.name)
    );

    matches.sort((a, b) => a.name.localeCompare(b.name));

    const sortedMatches = matches.map(match => {
        let matchCount = 0;
        Object.entries(sessionState.knownStats).forEach(([key, value]) => {
            if (match[key] === value) matchCount++;
        });
        return { ...match, matchCount };
    });

    if (sortedMatches.length > 0) {
        autoBox.classList.remove('hidden');
        sortedMatches.forEach(match => {
            const div = document.createElement('div');
            // Added 'flex' and 'items-center' to align the image and text
            div.className = "p-2 hover:bg-green-100 cursor-pointer border-b border-gray-100 flex items-center transition-colors";

            const MATCH_THRESHOLD = currentGameType === 'uma' ? 5 : 2;
            const displayBadge = currentGameType === 'uma' && match.matchCount >= MATCH_THRESHOLD;

            // Added <img> tag to the innerHTML
            div.innerHTML = `
                <img src="${match.image}" alt="${match.name}" 
                     class="w-10 h-10 rounded-md mr-3 object-cover bg-gray-200 border border-gray-100">
                <div class="flex flex-col">
                    <span class="font-bold text-sm sm:text-base text-gray-800">${match.name}</span>
                    ${displayBadge ? `<span class="text-[10px] text-green-600 font-semibold uppercase tracking-wider">Potential Match</span>` : ''}
                </div>
            `;
            
            div.onclick = (e) => {
                e.stopPropagation();
                submitGuess(match);
                autoBox.classList.add('hidden');
                input.value = '';
            };
            autoBox.appendChild(div);
        });
    } else {
        autoBox.classList.add('hidden');
    }
    
}

input.addEventListener('focus', () => renderSuggestions(input.value));
input.addEventListener('click', () => renderSuggestions(input.value));
input.addEventListener('input', (e) => renderSuggestions(e.target.value));

document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !autoBox.contains(e.target)) {
        autoBox.classList.add('hidden');
    }
});

function submitGuess(guessItem) {
    if (sessionState.isGameOver) return;
    if (sessionState.guesses.some(g => g.name === guessItem.name)) return;

    sessionState.guesses.push(guessItem);
    updateKnownStats(guessItem);

    if (sessionState.mode === 'daily') {
        const pData = allPersistentData[currentGameType];
        pData.dailyGuesses = [...sessionState.guesses];
        savePersistentData();
    }
    addGuessRow(guessItem, false);
    updateGuessCountUI();
    
    if (guessItem.name === sessionState.target.name) {
        handleWin();
    } else {
        const maxAttempts = sessionState.mode === 'daily'
            ? 5
            : sessionState.mode === 'hard'
                ? 2
                : sessionState.mode === 'easy'
                    ? Infinity
                    : 5;
        if (sessionState.guesses.length >= maxAttempts) {
            handleLoss();
        }
    }
}

function handleWin() {
    sessionState.isGameOver = true;
    const pData = allPersistentData[currentGameType];

    if (sessionState.mode === 'daily') {
        pData.dailyStatus = 'won';
        pData.dailyStreak++;
        savePersistentData();
    } else {
        sessionState.unlimitedScore++;
    }

    if (sessionState.mode === 'unlimited') {
        updateScoreUI();
        setTimeout(() => startGame('unlimited'), 1200);
        return;
    }

    document.getElementById('input-container').classList.add('hidden');
    setTimeout(() => {
        showModal("Goal In!", `Excellent work! You've identified ${sessionState.target.name}!`, true);
        updateScoreUI();
        updateStatsUI();
    }, 1000);
}

function handleLoss() {
    sessionState.isGameOver = true;
    const pData = allPersistentData[currentGameType];
    if (sessionState.mode === 'daily') {
        pData.dailyStatus = 'lost';
        pData.dailyStreak = 0;
        pData.dailyGuesses = [...sessionState.guesses];
        pData.lastPlayedDate = getDailyString();
        savePersistentData();
    }
    document.getElementById('input-container').classList.add('hidden');
    setTimeout(() => {
        showModal("LOST...", `The correct answer was ${sessionState.target.name}.`, true);
        updateScoreUI();
        updateStatsUI();
    }, 1000);
}

function addGuessRow(item, isClue = false) {
    const grid = document.getElementById('guess-grid');
    const row = document.createElement('tr');
    if (isClue) row.classList.add('clue-row');

    const config = GAME_CONFIG[currentGameType];
    
    // Name cell
    const nameCell = document.createElement('td');
    nameCell.className = "name-col p-2 bg-white/80 font-bold border-b border-gray-200";
    if (sessionState.mode === 'hard') nameCell.classList.add('hidden');
    if (!isClue) {
        nameCell.innerHTML = `
    <img src="${item.image}" alt="${item.name}" title="${item.name}" 
         class="w-10 h-10 object-cover mx-auto rounded-full shadow-sm" />
`;
    } else {
        nameCell.textContent = '???';
    }
    row.appendChild(nameCell);

    const isAnswer = !isClue && item.name === sessionState.target.name;
    if (isAnswer) {
        row.classList.add('correct-answer');
        nameCell.classList.add('correct');
    }

    config.keys.forEach(key => {
        const cell = document.createElement('td');
        const val = item[key];
        const targetVal = sessionState.target[key];
        
        let status = 'absent';
        let arrow = '';

        if (currentGameType === 'uma') {
            const tRank = RANK_MAP[targetVal] ?? -2;
            const gRank = RANK_MAP[val] ?? -2;
            if (val === targetVal) {
                status = 'correct';
            } else if (Math.abs(tRank - gRank) <= 1) {
                status = 'present';
            }
            if (gRank < tRank) arrow = ' ↑';
            else if (gRank > tRank) arrow = ' ↓';
        } else {
            // Course mode logic
            if (val === targetVal) {
                status = 'correct';
            } else if (key === 'length') {
                const diff = Math.abs(parseInt(val) - parseInt(targetVal));
                if (diff <= 400) status = 'present';
                if (parseInt(val) < parseInt(targetVal)) arrow = ' ↑';
                else if (parseInt(val) > parseInt(targetVal)) arrow = ' ↓';
            }
        }

        cell.className = `p-2 ${status} animate-flip${isAnswer ? ' answer-cell' : ''}`;
        cell.innerText = val + arrow;
        row.appendChild(cell);
    });

    grid.appendChild(row);
}

function showModal(title, msg, isNewGameOver = true) {
    const modal = document.getElementById('result-modal');
    const config = GAME_CONFIG[currentGameType];
    
    document.getElementById('result-title').innerText = title;
    document.getElementById('result-msg').innerText = msg;
    const targetNameElement = document.getElementById('target-name');
// Shows the target's image and name regardless of mode
    targetNameElement.innerHTML = `
        <div class="flex flex-col items-center gap-2">
            <img src="${sessionState.target.image}" alt="${sessionState.target.name}" 
            <span class="text-2xl font-black">${sessionState.target.name}</span>
        </div>
    `;
    document.getElementById('target-label').innerText = config.resultTitle;
    document.getElementById('share-title-text').innerText = config.shareTitle;

    // Build the stats grid in the modal
    const targetGrid = document.getElementById('target-stats-grid');
    targetGrid.innerHTML = '';
    
    config.sections.forEach(section => {
        const sectionDiv = document.createElement('div');
        sectionDiv.className = section.title === "Course Info" ? "pt-2" : "space-y-3";
        
        const h4 = document.createElement('h4');
        h4.className = `text-[10px] font-bold text-${section.color}-600 uppercase mb-2`;
        h4.innerText = section.title;
        sectionDiv.appendChild(h4);

        const statsDiv = document.createElement('div');
        statsDiv.className = "grid grid-cols-2 gap-2";
        
        section.keys.forEach(key => {
            const statBox = document.createElement('div');
            statBox.className = "bg-white p-2 rounded-lg border border-slate-200 flex justify-between items-center shadow-sm";
            
            const label = document.createElement('span');
            label.className = "text-[9px] font-bold text-slate-400 uppercase";
            label.innerText = key;
            
            const val = document.createElement('span');
            val.className = "font-black text-slate-700";
            val.innerText = sessionState.target[key];
            
            statBox.appendChild(label);
            statBox.appendChild(val);
            statsDiv.appendChild(statBox);
        });
        
        sectionDiv.appendChild(statsDiv);
        targetGrid.appendChild(sectionDiv);
    });

    // Share Text
    const shareInfo = document.getElementById('share-info-text');
    const today = getDailyString();
    shareInfo.innerText = `${sessionState.mode} | ${today} | Guesses: ${sessionState.guesses.length}`;

    const scoreText = document.getElementById('result-score');
    if (sessionState.mode === 'daily') {
        scoreText.innerText = `Win streak: ${allPersistentData[currentGameType].dailyStreak}`;
    } else {
        scoreText.innerText = `Win Streak: ${sessionState.unlimitedScore}`;
    }
    
    renderShareEmojis();
    
    modal.classList.remove('hidden');
}

function renderShareEmojis() {
    const preview = document.getElementById('share-block-preview');
    preview.innerHTML = '';
    const config = GAME_CONFIG[currentGameType];

    sessionState.guesses.forEach(guess => {
        let rowStr = '';
        config.keys.forEach(key => {
            const val = guess[key];
            const targetVal = sessionState.target[key];
            if (val === targetVal) rowStr += '🟩';
            else if (currentGameType === 'uma') {
                if (Math.abs(RANK_MAP[val] - RANK_MAP[targetVal]) <= 1) rowStr += '🟨';
                else rowStr += '⬛';
            } else if (key === 'length' && Math.abs(parseInt(val) - parseInt(targetVal)) <= 400) {
                rowStr += '🟨';
            } else {
                rowStr += '⬛';
            }
        });
        const div = document.createElement('div');
        div.innerText = rowStr;
        preview.appendChild(div);
    });
}

function closeModal() {
    document.getElementById('result-modal').classList.add('hidden');
}

function shareToTwitter() {
    const config = GAME_CONFIG[currentGameType];
    const today = getDailyString();
    const shareInfo = `${sessionState.mode} | ${today} | Guesses: ${sessionState.guesses.length}`;
    const emojiGrid = renderShareEmojisText();
    const shareText = `${config.shareTitle}\n${shareInfo}\n${emojiGrid}\n\nPlay UmaWordle!`;
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
    window.open(twitterUrl, '_blank');
}

function shareToFacebook() {
    const config = GAME_CONFIG[currentGameType];
    const today = getDailyString();
    const shareInfo = `${sessionState.mode} | ${today} | Guesses: ${sessionState.guesses.length}`;
    const emojiGrid = renderShareEmojisText();
    const shareText = `${config.shareTitle}\n${shareInfo}\n${emojiGrid}\n\nPlay UmaWordle!`;
    const facebookUrl = `https://www.facebook.com/sharer/sharer.php?quote=${encodeURIComponent(shareText)}`;
    window.open(facebookUrl, '_blank');
}

function renderShareEmojisText() {
    let result = '';
    const config = GAME_CONFIG[currentGameType];

    sessionState.guesses.forEach(guess => {
        config.keys.forEach(key => {
            const val = guess[key];
            const targetVal = sessionState.target[key];
            if (val === targetVal) result += '🟩';
            else if (currentGameType === 'uma') {
                if (Math.abs(RANK_MAP[val] - RANK_MAP[targetVal]) <= 1) result += '🟨';
                else result += '⬛';
            } else if (key === 'length' && Math.abs(parseInt(val) - parseInt(targetVal)) <= 400) {
                result += '🟨';
            } else {
                result += '⬛';
            }
        });
        result += '\n';
    });
    return result.trim();
}

function toggleHelp(show) {
    const modal = document.getElementById('help-modal');
    const helpContent = document.getElementById('help-content');
    
    if (show) {
        if (currentGameType === 'uma') {
            helpContent.innerHTML = `
                <p>Identify the hidden Umamusume by their base Aptitudes (A to G).</p>
                <div>
                    <h3 class="font-bold text-gray-800 border-b pb-1 mb-2">Color Indicators</h3>
                    <div class="space-y-2">
                        <div class="flex items-center"><span class="help-dot bg-[#6aaa64]"></span> <strong>Green:</strong> Exact match!</div>
                        <div class="flex items-center"><span class="help-dot bg-[#c9b458]"></span> <strong>Yellow:</strong> Near match (within 1 rank, e.g., A vs B).</div>
                        <div class="flex items-center"><span class="help-dot bg-[#787c7e]"></span> <strong>Gray:</strong> Far match.</div>
                    </div>
                </div>
                <div>
                    <h3 class="font-bold text-gray-800 border-b pb-1 mb-2">Rank Hints (Arrows)</h3>
                    <p>↑: Target rank is higher. ↓: Target rank is lower.</p>
                </div>
            `;
        } else {
            helpContent.innerHTML = `
                <p>Identify the hidden G1 Race by its course features.</p>
                <div>
                    <h3 class="font-bold text-gray-800 border-b pb-1 mb-2">Color Indicators</h3>
                    <div class="space-y-2">
                        <div class="flex items-center"><span class="help-dot bg-[#6aaa64]"></span> <strong>Green:</strong> Exact match!</div>
                        <div class="flex items-center"><span class="help-dot bg-[#c9b458]"></span> <strong>Yellow:</strong> Close (Length within 400m).</div>
                        <div class="flex items-center"><span class="help-dot bg-[#787c7e]"></span> <strong>Gray:</strong> Incorrect.</div>
                    </div>
                </div>
                <div>
                    <h3 class="font-bold text-gray-800 border-b pb-1 mb-2">Hints</h3>
                    <p>↑/↓ on Length tells you if the target course is longer or shorter.</p>
                </div>
            `;
        }
    }
    
    modal.classList.toggle('hidden', !show);
}

// Global initialization call
loadGameData();
