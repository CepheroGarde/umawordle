const GAME_CONFIG = {
  uma: {
    keys: ['sprint', 'mile', 'med', 'long', 'front', 'pace', 'late', 'end', 'turf', 'dirt'],
    headers: ['Spr', 'Mil', 'Med', 'Lon', 'Fro', 'Pac', 'Lat', 'End', 'Trf', 'Drt'],
    data: () => UMAS,
    placeholder: "Enter Umamusume name...",
    resultTitle: "Winning Umamusume",
    storageKey: 'uma_wordle_stats',
    helpDesc: "Guess the Umamusume based on their base Aptitudes!",
    shareTitle: "TRACENDLE",
    sections: [{
        title: "Distance",
        keys: ['sprint', 'mile', 'med', 'long'],
        color: 'blue'
      },
      {
        title: "Strategy",
        keys: ['front', 'pace', 'late', 'end'],
        color: 'purple'
      },
      {
        title: "Track",
        keys: ['turf', 'dirt'],
        color: 'orange'
      }
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
    shareTitle: "TRACENDLE",
    sections: [{
      title: "Course Info",
      keys: ['length', 'surface', 'turn', 'location'],
      color: 'green'
    }]
  }
};

let currentGameType = 'uma';
let UMAS = [];
let COURSES = [];
const RANK_MAP = {
  'S': 6,
  'A': 5,
  'B': 4,
  'C': 3,
  'D': 2,
  'E': 1,
  'F': 0,
  'G': -1
};

let allPersistentData = {
  uma: {
    dailyStreak: 0,
    easyStreak: 0,
    unlimitedStreak: 0,
    hardStreak: 0,
    lastPlayedDate: null,
    dailyGuesses: [],
    dailyStatus: 'playing',
    rankedGuesses: [],
    rankedStatus: 'playing',
    rankedTargetName: null
  },
  course: {
    dailyStreak: 0,
    easyStreak: 0,
    unlimitedStreak: 0,
    hardStreak: 0,
    lastPlayedDate: null,
    dailyGuesses: [],
    dailyStatus: 'playing',
    rankedGuesses: [],
    rankedStatus: 'playing',
    rankedTargetName: null
  }
};

let sessionState = {
  active: false,
  mode: null,
  target: null,
  guesses: [],
  clues: [],
  unlimitedScore: 0,
  isGameOver: false,
  knownStats: {},
  pendingStreakReset: false,
  streakAtLoss: 0
};

const GRADES = ["G", "F", "E", "D", "C", "B", "A", "S"];
const POINTS_PER_TIER = 200;
const DIV_THRESHOLD = 100;

function getTier(points) {
  if (points >= 1500) return "SS";

  const gradeIndex = Math.floor(points / POINTS_PER_TIER);
  const baseGrade = GRADES[gradeIndex] || "G";

  const progressInGrade = points % POINTS_PER_TIER;
  const suffix = progressInGrade >= DIV_THRESHOLD ? "+" : "";

  const lp = progressInGrade % DIV_THRESHOLD;

  return `${baseGrade}${suffix}`;
}

function getVerifiedRankedStats(mode) {
  const storageKey = `${mode}_ranked_stats`;
  const saved = localStorage.getItem(storageKey);

  if (!saved) return {
    points: 0,
    winStreak: 0,
    lossStreak: 0,
    placements: 0,
    rankProtection: 0
  };

  try {
    const parsed = JSON.parse(saved);
    if (parsed.data && parsed.checksum === generateChecksum(parsed.data)) {
      return parsed.data;
    }
    console.warn(`Tampering detected in ${mode} ranked stats! Goldship is watching you...`);
  } catch (e) {
    console.error("Failed to parse ranked stats", e);
  }

  return {
    points: 0,
    winStreak: 0,
    lossStreak: 0,
    placements: 0,
    rankProtection: 0
  };
}

function updateRankedStats(isWin, mode) {
  const storageKey = `${mode}_ranked_stats`;
  const saved = localStorage.getItem(storageKey);
  let stats;

  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      stats = (parsed.data && parsed.checksum === generateChecksum(parsed.data)) ?
        parsed.data : {
          points: 0,
          winStreak: 0,
          lossStreak: 0,
          placements: 0,
          rankProtection: 0
        };
    } catch (e) {
      stats = {
        points: 0,
        winStreak: 0,
        lossStreak: 0,
        placements: 0,
        rankProtection: 0
      };
    }
  } else {
    stats = {
      points: 0,
      winStreak: 0,
      lossStreak: 0,
      placements: 0,
      rankProtection: 0
    };
  }

  const isRanked = localStorage.getItem('is_ranked_session') === 'true';
  if (!isRanked) return stats;

  if (isWin) {
    const guessCount = sessionState.guesses.length;

    if (stats.placements < 5) {
      let placementGain = 0;
      if (guessCount <= 2) {
        placementGain = 200;
      } else if (guessCount === 3) {
        placementGain = 130;
      } else if (guessCount === 4) {
        placementGain = 80;
      } else {
        placementGain = 40;
      }
      stats.points += placementGain;
    } else {
      stats.winStreak++;
      stats.lossStreak = 0;

      const oldTierIndex = Math.floor(stats.points / 200); //
      let baseGain = 20;
      const efficiencyBonus = guessCount <= 2 ? 15 : 0;
      let gain = baseGain + efficiencyBonus + Math.min(stats.winStreak * 5, 30);

      stats.points += gain;

      const newTierIndex = Math.floor(stats.points / 200);
      if (newTierIndex > oldTierIndex) {
        stats.rankProtection = 2;
      }
    }
  } else {
    stats.winStreak = 0;
    stats.lossStreak++;

    if (stats.placements >= 5) {
      if (stats.rankProtection > 0) {
        stats.rankProtection--;
      } else {
        let lossPenalty = 0;
        if (stats.points >= 800) {
          lossPenalty = 15 + Math.min((stats.lossStreak - 1) * 5, 5);
        } else if (stats.points >= 400) {
          lossPenalty = 5 + Math.min((stats.lossStreak - 1) * 5, 5);
        } else {
          lossPenalty = 0;
        }
        stats.points = Math.max(0, stats.points - lossPenalty);
      }
    }
  }

  if (stats.placements < 5) stats.placements++;

  const storageWrapper = {
    data: stats,
    checksum: generateChecksum(stats)
  };
  localStorage.setItem(storageKey, JSON.stringify(storageWrapper));

  return stats;
}

function generateChecksum(obj) {
  const salt = "Satono Diamond";
  const str = JSON.stringify(obj) + salt;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(16);
}

function getUTC8Time() {
  return new Date(Date.now() + 28800000);
}

function getDailyString(offsetDays = 0) {
  const date8 = getUTC8Time();
  if (offsetDays !== 0) date8.setDate(date8.getDate() + offsetDays);

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
checkDevMode();
  loadPersistentData();
  switchGameType('uma');
  startClock();
  loadTheme()
}

function switchGameType(type) {
  currentGameType = type;
  const config = GAME_CONFIG[type];

  const tabUma = document.getElementById('tab-uma');
  const tabCourse = document.getElementById('tab-course');
  if (type === 'uma') {
    tabUma.className = "flex-1 py-2 rounded-lg font-bold transition-all bg-white shadow-sm text-green-700";
    tabCourse.className = "flex-1 py-2 rounded-lg font-bold transition-all text-gray-500 hover:text-gray-700";
  } else {
    tabCourse.className = "flex-1 py-2 rounded-lg font-bold transition-all bg-white shadow-sm text-green-700";
    tabUma.className = "flex-1 py-2 rounded-lg font-bold transition-all text-gray-500 hover:text-gray-700";
  }

  document.getElementById('menu-description').innerText = config.helpDesc;

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

  const headRow = document.createElement('tr');
  headRow.className = "text-[10px] md:text-xs font-bold uppercase";

  const nameTh = document.createElement('th');
  nameTh.className = "name-col p-1 bg-gray-100 text-gray-600 rounded-t-lg text-[9px]";
  nameTh.innerText = "Name";
  headRow.appendChild(nameTh);

  config.headers.forEach((header, index) => {
    const th = document.createElement('th');
    th.className = `p-2 ${index === 0 ? 'rounded-tl-lg' : ''} ${index === config.headers.length - 1 ? 'rounded-tr-lg cell-group-end' : ''}`;
    if (type === 'uma') {
      if (index < 4) th.className += " head-dist";
      else if (index < 8) th.className += " head-strat";
      else th.className += " head-track";
    } else {
      th.className += " head-course";
    }
    th.innerText = header;
    headRow.appendChild(th);
  });
  document.getElementById('guess-head').innerHTML = '';
  document.getElementById('guess-head').appendChild(headRow);
  document.getElementById('uma-input').placeholder = config.placeholder;
}

function loadPersistentData() {
  const saved = localStorage.getItem('uma_wordle_v2_stats');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);

      if (parsed.data && parsed.checksum) {
        const actualChecksum = generateChecksum(parsed.data);

        if (actualChecksum === parsed.checksum) {
          allPersistentData = parsed.data;
        } else {
          console.warn("Stats tampering detected. Resetting to default Three Godesses will curse you.");
        }
      } else {
        allPersistentData = parsed;
        savePersistentData(); // 
      }
    } catch (e) {
      console.error("Failed to parse persistent data:", e);
    }
  }
}

function savePersistentData() {
  const storageWrapper = {
    data: allPersistentData,
    checksum: generateChecksum(allPersistentData)
  };
  localStorage.setItem('uma_wordle_v2_stats', JSON.stringify(storageWrapper));
}

function getTargetForDate(dateStr, dataList) {
  if (!dataList || dataList.length === 0) return null;

  let bestItem = dataList[0];
  let maxScore = -Infinity;

  for (const item of dataList) {
    const combinedStr = dateStr + item.name;
    let score = 0;
    for (let i = 0; i < combinedStr.length; i++) {
      score = ((score << 5) - score) + combinedStr.charCodeAt(i);
      score |= 0; 
    }

    if (score > maxScore) {
      maxScore = score;
      bestItem = item;
    }
  }
  return bestItem;
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
  if (!clockEl) return;

  setInterval(() => {
    const now8 = getUTC8Time();
    
    const nextMidnight8 = new Date(now8);
    nextMidnight8.setUTCDate(nextMidnight8.getUTCDate() + 1);
    nextMidnight8.setUTCHours(0, 0, 0, 0);
    
    const diff = nextMidnight8 - now8;
    
    if (diff <= 0) {
        location.reload();
        return; 
    }

    const h = String(Math.floor((diff / (1000 * 60 * 60)) % 24)).padStart(2, '0');
    const m = String(Math.floor((diff / (1000 * 60)) % 60)).padStart(2, '0');
    const s = String(Math.floor((diff / 1000) % 60)).padStart(2, '0');
    
    clockEl.innerText = `NEXT DAILY IN: ${h}:${m}:${s}`;
  }, 1000);
}

function toggleTheme() {
  const body = document.body;
  body.classList.toggle('dark');
  localStorage.setItem('theme', body.classList.contains('dark') ? 'dark' : 'light');
}

function loadTheme() {
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === null || savedTheme === 'dark') {
    document.body.classList.add('dark');
    if (savedTheme === null) localStorage.setItem('theme', 'dark');
  }
}

function showResult(isWin) {
  const modal = document.getElementById('result-modal');
  const title = document.getElementById('result-title');
  const content = document.getElementById('result-content');
  const target = sessionState.target;

  const isRanked = localStorage.getItem('is_ranked_session') === 'true';
  let rankedStats = null;

  if (isRanked) {
    rankedStats = updateRankedStats(isWin, sessionState.mode);
  }

  if (isWin) {
    resultTitle.textContent = "Victory!";
    resultTitle.className = "text-2xl font-bold text-green-600 mb-2";
  } else {
    resultTitle.textContent = "Better luck next time!";
    resultTitle.className = "text-2xl font-bold text-red-600 mb-2";
  }

  title.innerText = isWin ? "Victory!" : "Better Luck Next Time";
  title.className = isWin ? "text-2xl font-bold text-green-600" : "text-2xl font-bold text-red-600";

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

  modal.classList.remove('hidden');
  modal.classList.add('flex');

}

function startGame(mode) {
  if (mode === 'ranked') {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('silencesuzuka') !== 'true') return;
  }
  const config = GAME_CONFIG[currentGameType];
  const dataList = config.data();
  const today = getDailyString();

  if (mode === 'ranked') {
    localStorage.setItem('is_ranked_session', 'true');
  } else {
    localStorage.setItem('is_ranked_session', 'false');
  }
  sessionState.active = true;
  sessionState.mode = mode;
  sessionState.guesses = [];
  sessionState.clues = [];
  sessionState.isGameOver = false;
  sessionState.knownStats = {};
  sessionState.maxGuesses = mode === 'daily' ? 5 :
    mode === 'hard' ? 2 :
    mode === 'easy' ? Infinity :
    5;

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
  } else if (mode === 'ranked') {
    const pData = allPersistentData[currentGameType];
    if (pData.rankedStatus === 'playing' && pData.rankedTargetName && pData.rankedGuesses && pData.rankedGuesses.length > 0) {
      const savedTarget = dataList.find(item => item.name === pData.rankedTargetName);
      if (savedTarget) {
        sessionState.target = savedTarget;
        sessionState.guesses = [...pData.rankedGuesses];
      } else {
        sessionState.target = dataList[Math.floor(Math.random() * dataList.length)];
        pData.rankedGuesses = [];
        pData.rankedStatus = 'playing';
        pData.rankedTargetName = sessionState.target.name;
        savePersistentData();
      }
    } else {
      sessionState.target = dataList[Math.floor(Math.random() * dataList.length)];
      pData.rankedGuesses = [];
      pData.rankedStatus = 'playing';
      pData.rankedTargetName = sessionState.target.name;
      savePersistentData();
    }
  } else {
    sessionState.target = dataList[Math.floor(Math.random() * dataList.length)];
  }

  if (mode === 'hard') {
    const otherItems = dataList.filter(item => item.name !== sessionState.target.name);
    const shuffled = otherItems.sort(() => 0.5 - Math.random());
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

  if (mode === 'ranked' && sessionState.guesses.length > 0) {
    sessionState.guesses.forEach(g => {
      updateKnownStats(g);
      addGuessRow(g, false);
    });
    updateGuessCountUI();
  }

  if (mode === 'hard') {
    sessionState.clues.forEach(c => addGuessRow(c, true));
    setTimeout(() => {
      const inp = document.getElementById('uma-input');
      if (inp) inp.focus();
      renderSuggestions('');
    }, 200);
  }
}

function renderGameLayout() {
  document.getElementById('menu-screen').classList.add('hidden');
  document.getElementById('game-screen').classList.remove('hidden');
  document.getElementById('mode-indicator').innerText = currentGameType + " / " + sessionState.mode;
  document.getElementById('guess-grid').innerHTML = '';
  document.getElementById('uma-input').value = '';
  document.getElementById('input-container').classList.remove('hidden');
  document.getElementById('input-container').classList.remove('hidden'); 

  document.getElementById('mode-indicator').innerText = currentGameType + " / " + sessionState.mode;
  document.getElementById('guess-grid').innerHTML = '';
  document.getElementById('uma-input').value = '';

  const nameCols = document.querySelectorAll('.name-col');
  nameCols.forEach(col => {
    if (sessionState.mode === 'hard') col.classList.add('hidden');
    else col.classList.remove('hidden');
  });

  updateGuessCountUI();
  updateScoreUI();
  renderSuggestions('');
}

function updateGuessCountUI() {
  const maxAttempts = sessionState.mode === 'daily' ?
    5 :
    sessionState.mode === 'hard' ?
    2 :
    sessionState.mode === 'easy' ?
    '∞' :
    5;

  if (maxAttempts === '∞') {
    document.getElementById('remaining-guesses').innerText = 'Unlimited';
  } else {
    const remaining = maxAttempts - sessionState.guesses.length;
    document.getElementById('remaining-guesses').innerText = Math.max(0, remaining);
  }
}

function showMenu() {
  localStorage.setItem('is_ranked_session', 'false');
  document.getElementById('menu-screen').classList.remove('hidden');
  document.getElementById('game-screen').classList.add('hidden');
  
  document.getElementById('input-container').classList.add('hidden'); 

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

  if (sessionState.mode === 'daily') {
    el.innerText = `Daily Streak: ${pData.dailyStreak}`;
  } else {
    const modeKey = `${sessionState.mode}Streak`;
    const currentStreak = pData[modeKey] || 0;
    el.innerText = `${sessionState.mode.charAt(0).toUpperCase() + sessionState.mode.slice(1)} Streak: ${currentStreak}`;
  }
}

function updateStatsUI() {
  const pData = allPersistentData[currentGameType];
  document.getElementById('stats-summary').innerHTML = `<span class="text-xs uppercase text-gray-400">Daily Streak:</span> ${pData.dailyStreak}`;
  const rankedData = getVerifiedRankedStats(currentGameType);

  const tierNameEl = document.getElementById('menu-tier-name');
  const tierPointsEl = document.getElementById('menu-tier-points');
  const placementEl = document.getElementById('menu-placements');
  const streakBadge = document.getElementById('streak-badge');

  if (rankedData.placements < 5) {
    tierNameEl.innerText = "UNRANKED";
    tierPointsEl.innerText = "Complete placement matches";
    placementEl.innerText = `Placements: ${rankedData.placements}/5`;
    streakBadge.classList.add('hidden');
  } else {
    tierNameEl.innerText = `${getTier(rankedData.points)} TIER`;
    tierPointsEl.innerText = `${rankedData.points} Points`;
    placementEl.innerText = "Rank Active";

    if (rankedData.winStreak >= 2) {
      streakBadge.innerText = `🔥 ${rankedData.winStreak} STREAK`;
      streakBadge.classList.remove('hidden');
    } else {
      streakBadge.classList.add('hidden');
    }
  }
}

const input = document.getElementById('uma-input');
function updateKnownStats(item) {
  const config = GAME_CONFIG[currentGameType];
  config.keys.forEach(key => {
    if (item[key] === sessionState.target[key]) {
      sessionState.knownStats[key] = item[key];
    }
  });
}

function renderSuggestions(filterText = "") {
  const val = filterText.toLowerCase().trim();
  const pickerGrid = document.getElementById('picker-grid');
  if (!pickerGrid) return;

  pickerGrid.innerHTML = '';

  const config = GAME_CONFIG[currentGameType];
  const dataList = config.data();
  const guessedNames = sessionState.guesses.map(g => g.name);
  const MATCH_THRESHOLD = currentGameType === 'uma' ? 999 : 2;

  let matches = dataList.filter(u =>
    !guessedNames.includes(u.name) &&
    (val === '' || u.name.toLowerCase().includes(val))
  );

  matches.sort((a, b) => a.name.localeCompare(b.name));

  if (matches.length === 0 && val !== '') {
    pickerGrid.innerHTML = `<p class="picker-empty">No matches for "<strong>${filterText}</strong>"</p>`;
    return;
  }

  matches.forEach(match => {
    let matchCount = 0;
    Object.entries(sessionState.knownStats).forEach(([key, value]) => {
      if (match[key] === value) matchCount++;
    });
    const displayBadge = currentGameType === 'uma' && matchCount >= MATCH_THRESHOLD;

    const card = document.createElement('div');
    card.className = 'picker-card' + (displayBadge ? ' potential-match' : '');
    card.dataset.name = match.name;
    card.innerHTML = `
      <img src="${match.image}" alt="${match.name}" class="picker-card-img">
      <span class="picker-card-name">${match.name}</span>
      ${displayBadge ? `<span class="picker-card-badge">⭐</span>` : ''}
    `;
    card.onclick = () => {
      submitGuess(match);
      const inp = document.getElementById('uma-input');
      if (inp) inp.value = '';
      renderSuggestions('');
    };
    pickerGrid.appendChild(card);
  });
}

input.addEventListener('input', (e) => renderSuggestions(e.target.value));

function submitGuess(guessItem) {
  if (sessionState.isGameOver) return;
  if (sessionState.guesses.some(g => g.name === guessItem.name)) return;

  const pData = allPersistentData[currentGameType];

  sessionState.guesses.push(guessItem);
  updateKnownStats(guessItem);

  if (sessionState.mode === 'daily') {
    pData.dailyGuesses = [...sessionState.guesses];
    savePersistentData();
  }

  if (sessionState.mode === 'ranked') {
    pData.rankedGuesses = [...sessionState.guesses];
    savePersistentData();
  }

  const animDuration = addGuessRow(guessItem, false, true);
  updateGuessCountUI();

  if (sessionState.mode === 'hard' && guessItem.name !== sessionState.target.name) {
    const totalCells = GAME_CONFIG[currentGameType].keys.length;
    const reopenDelay = (totalCells - 1) * 300 + 500 + 200;
    setTimeout(() => {
      const inp = document.getElementById('uma-input');
      if (inp && !sessionState.isGameOver) {
        inp.value = '';
        inp.focus();
        renderSuggestions('');
      }
    }, reopenDelay);
  }

  if (guessItem.name === sessionState.target.name) {
    handleWin(animDuration);
  } else if (sessionState.guesses.length >= sessionState.maxGuesses) {
    handleLoss(animDuration);
  }
}

function launchConfetti() {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999;';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const COLORS = ['#6aaa64','#c9b458','#f59e0b','#3b82f6','#ec4899','#8b5cf6','#ffffff'];
  const pieces = Array.from({ length: 140 }, () => ({
    x: Math.random() * canvas.width,
    y: -10 - Math.random() * 200,
    w: 8 + Math.random() * 8,
    h: 5 + Math.random() * 5,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    rotation: Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() - 0.5) * 0.15,
    vx: (Math.random() - 0.5) * 3,
    vy: 2.5 + Math.random() * 3.5,
    opacity: 1
  }));

  let frame;
  const start = performance.now();

  function draw(now) {
    const elapsed = now - start;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let alive = false;
    pieces.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.06; 
      p.rotation += p.rotSpeed;
      if (elapsed > 1800) p.opacity = Math.max(0, p.opacity - 0.012);

      if (p.y < canvas.height + 20 && p.opacity > 0) alive = true;

      ctx.save();
      ctx.globalAlpha = p.opacity;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });

    if (alive && elapsed < 4000) {
      frame = requestAnimationFrame(draw);
    } else {
      cancelAnimationFrame(frame);
      canvas.remove();
    }
  }
  frame = requestAnimationFrame(draw);
}

function handleWin(animDuration = 0) {
  sessionState.isGameOver = true;
  const pData = allPersistentData[currentGameType];

  if (sessionState.mode === 'daily') {
    pData.dailyStatus = 'won';
    pData.dailyStreak++;
  } else if (sessionState.mode === 'ranked') {
    pData.rankedStatus = 'won';
    pData.rankedGuesses = [...sessionState.guesses];
  } else {
    const modeKey = `${sessionState.mode}Streak`;
    if (pData[modeKey] === undefined) pData[modeKey] = 0;
    pData[modeKey]++;
  }
  updateRankedStats(true, currentGameType);
  updateStatsUI();
  savePersistentData();

  const confettiDelay = animDuration + 100;
  setTimeout(launchConfetti, confettiDelay);

  document.getElementById('input-container').classList.add('hidden');
  setTimeout(() => {
    showModal("Goal In!", `Excellent work! You've identified ${sessionState.target.name}!`, true);
    updateScoreUI();
    updateStatsUI();
  }, animDuration + 600);
}

function handleLoss(animDuration = 0) {
  sessionState.isGameOver = true;
  const pData = allPersistentData[currentGameType];

  if (sessionState.mode === 'daily') {
    pData.dailyStatus = 'lost';
    pData.dailyStreak = 0;
    pData.dailyGuesses = [...sessionState.guesses];
    pData.lastPlayedDate = getDailyString();
    sessionState.pendingStreakReset = false;
    sessionState.streakAtLoss = 0;
    savePersistentData();
  } else if (sessionState.mode === 'ranked') {
    pData.rankedStatus = 'lost';
    pData.rankedGuesses = [...sessionState.guesses];
    sessionState.pendingStreakReset = false;
    sessionState.streakAtLoss = 0;
    savePersistentData();
  } else {
    const modeKey = `${sessionState.mode}Streak`;
    sessionState.streakAtLoss = pData[modeKey] || 0;
    sessionState.pendingStreakReset = true;
  }

  updateRankedStats(false, currentGameType);
  updateStatsUI();

  document.getElementById('input-container').classList.add('hidden');
  setTimeout(() => {
    showModal("LOST...", `The correct answer was ${sessionState.target.name}.`, true);
    updateScoreUI();
    updateStatsUI();
  }, animDuration + 600);
}

function addGuessRow(item, isClue = false, animate = true) {
  const grid = document.getElementById('guess-grid');
  const row = document.createElement('tr');
  if (isClue) row.classList.add('clue-row');

  const config = GAME_CONFIG[currentGameType];

  const nameCell = document.createElement('td');
  nameCell.className = "name-col p-2 bg-white/80 font-bold border-b border-gray-200";
  if (sessionState.mode === 'hard') nameCell.classList.add('hidden');
  if (!isClue) {
    const imgClass = currentGameType === 'course'
      ? 'course-img w-14 h-14 object-contain mx-auto rounded-md shadow-sm'
      : 'w-10 h-10 object-cover mx-auto rounded-full shadow-sm';
    nameCell.innerHTML = `
      <img src="${item.image}" alt="${item.name}" title="${item.name}"
           class="${imgClass}" />
    `;
  } else {
    nameCell.textContent = '???';
  }
  row.appendChild(nameCell);

  const isAnswer = !isClue && item.name === sessionState.target.name;

  const FLIP_MS = 500;
  const STAGGER_MS = 300;

  const cellData = config.keys.map(key => {
    const val = item[key];
    const targetVal = sessionState.target[key];
    let status = 'absent';
    let arrow = '';

    if (currentGameType === 'uma') {
      const tRank = RANK_MAP[targetVal] ?? -2;
      const gRank = RANK_MAP[val] ?? -2;
      if (val === targetVal) status = 'correct';
      else if (Math.abs(tRank - gRank) <= 1) status = 'present';
      if (gRank < tRank) arrow = ' ↑';
      else if (gRank > tRank) arrow = ' ↓';
    } else {
      if (val === targetVal) {
        status = 'correct';
      } else if (key === 'length') {
        if (Math.abs(parseInt(val) - parseInt(targetVal)) <= 400) status = 'present';
      }
    }
    return { val, arrow, status };
  });

  cellData.forEach(({ val, arrow, status }, i) => {
    const cell = document.createElement('td');
    cell.className = `p-2 wordle-cell font-black tracking-wide${isAnswer ? ' answer-cell' : ''}`;
    cell.innerText = val + arrow;

    if (animate && !isClue) {
      const delay = i * STAGGER_MS;
      cell.style.animationDelay = `${delay}ms`;
      cell.classList.add('wordle-flip');
      setTimeout(() => {
        cell.classList.add(status);
      }, delay + FLIP_MS / 2);
    } else {
      cell.classList.add(status);
    }

    row.appendChild(cell);
  });

  grid.appendChild(row);

  if (isAnswer) {
    const lastDelay = animate && !isClue
      ? (cellData.length - 1) * STAGGER_MS + FLIP_MS
      : 0;
    setTimeout(() => {
      row.classList.add('correct-answer');
      nameCell.classList.add('correct');
    }, lastDelay);
  }

  return animate && !isClue
    ? (cellData.length - 1) * STAGGER_MS + FLIP_MS
    : 0;
}

function showModal(title, msg, isNewGameOver = true) {
  const modal = document.getElementById('result-modal');
  const config = GAME_CONFIG[currentGameType];

  document.getElementById('result-title').innerText = title;
  document.getElementById('result-msg').innerText = msg;

  const targetNameElement = document.getElementById('target-name');
  const targetLabel = document.getElementById('target-label');
  const shareTitleText = document.getElementById('share-title-text');

  if (targetNameElement) {
    targetNameElement.innerHTML = `<span class="text-lg font-black text-green-700">${sessionState.target.name}</span>`;
    const imgWrap = document.getElementById('target-img-wrap');
    if (imgWrap) {
      imgWrap.innerHTML = sessionState.target.image
        ? `<img src="${sessionState.target.image}" alt="${sessionState.target.name}" class="result-target-thumb">`
        : '';
    }
  }

  if (targetLabel) targetLabel.innerText = config.resultTitle;
  if (shareTitleText) shareTitleText.innerText = config.shareTitle;

  const targetGrid = document.getElementById('target-stats-grid');
  if (targetGrid) {
    targetGrid.innerHTML = '';
    config.sections.forEach(section => {
      const sectionDiv = document.createElement('div');
      sectionDiv.className = "result-stat-section";

      const h4 = document.createElement('h4');
      h4.className = `result-stat-section-title text-${section.color}-600`;
      h4.innerText = section.title;
      sectionDiv.appendChild(h4);

      const statsDiv = document.createElement('div');
      statsDiv.className = "result-stat-row";

      section.keys.forEach(key => {
        const statBox = document.createElement('div');
        statBox.className = "result-stat-pill";

        const label = document.createElement('span');
        label.className = "result-stat-pill-label";
        label.innerText = key;

        const val = document.createElement('span');
        val.className = "result-stat-pill-value";
        val.innerText = sessionState.target[key];

        statBox.appendChild(label);
        statBox.appendChild(val);
        statsDiv.appendChild(statBox);
      });

      sectionDiv.appendChild(statsDiv);
      targetGrid.appendChild(sectionDiv);
    });
  }

  const rankedProfileContainer = document.getElementById('ranked-result-profile');
  const isRankedSession = localStorage.getItem('is_ranked_session') === 'true';

  if (isRankedSession && rankedProfileContainer) {
    const storageKey = `${currentGameType}_ranked_stats`;
    const saved = localStorage.getItem(storageKey);
    let stats = {
      points: 0,
      placements: 0
    };

    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        stats = parsed.data || stats;
      } catch (e) {
        console.error("Error loading stats for modal", e);
      }
    }

    rankedProfileContainer.classList.remove('hidden');

    if (stats.placements < 5) {
      rankedProfileContainer.innerHTML = `
                <div class="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center mb-4">
                    <div class="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Current Rank</div>
                    <div class="text-2xl font-black text-blue-800 uppercase">UNRANKED</div>
                    <div class="text-xs font-bold text-blue-700 mt-1">Placement: ${stats.placements} / 5 Matches</div>
                </div>`;
    } else {
      rankedProfileContainer.innerHTML = `
                <div class="bg-gradient-to-r from-amber-50 to-orange-50 border border-orange-200 rounded-lg p-3 text-center mb-4 shadow-sm">
                    <div class="text-[10px] font-bold text-orange-600 uppercase tracking-widest">Current Rank</div>
                    <div class="text-2xl font-black text-orange-900">${getTier(stats.points)} TIER</div>
                    <div class="text-xs font-bold text-orange-700">${stats.points} Rating Points</div>
                </div>`;
    }
  } else if (rankedProfileContainer) {
    rankedProfileContainer.classList.add('hidden');
  }

  const shareInfo = document.getElementById('share-info-text');
  if (shareInfo) {
    shareInfo.innerText = `${sessionState.mode} | ${getDailyString()} | Guesses: ${sessionState.guesses.length}`;
  }

  const streakBanner = document.getElementById('loss-streak-banner');
  const isLoss = !sessionState.guesses.some(g => g.name === sessionState.target.name);
  if (streakBanner) {
    if (isLoss && sessionState.pendingStreakReset && (sessionState.mode === 'unlimited' || sessionState.mode === 'hard')) {
      const modeName = sessionState.mode === 'hard' ? 'Hard' : 'Normal';
      streakBanner.innerHTML = `
        <div class="flex flex-col items-center gap-1">
          <span class="streak-banner-label">Final Streak Score</span>
          <span class="streak-banner-score">${sessionState.streakAtLoss}</span>
          <span class="streak-banner-sub">${modeName} Mode Streak Lost</span>
        </div>`;
      streakBanner.classList.remove('hidden');
    } else {
      streakBanner.classList.add('hidden');
    }
  }

  const actionBtn = document.getElementById('modal-action-btn');
  if (actionBtn) {
    actionBtn.textContent = 'Continue';
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
  const modal = document.getElementById('result-modal');
  modal.classList.add('hidden');

  if (sessionState.pendingStreakReset) {
    const pData = allPersistentData[currentGameType];
    const modeKey = `${sessionState.mode}Streak`;
    pData[modeKey] = 0;
    sessionState.pendingStreakReset = false;
    savePersistentData();
    updateStatsUI();
    updateScoreUI();
  }

  const isWin = sessionState.guesses.some(g => g.name === sessionState.target.name);
  if (sessionState.isGameOver && (sessionState.mode === 'unlimited' || sessionState.mode === 'hard') && isWin) {
    startGame(sessionState.mode);
    return;
  }

  if (sessionState.isGameOver && sessionState.mode === 'ranked') {
    const isWin = sessionState.guesses.some(g => g.name === sessionState.target.name);

    const pData = allPersistentData[currentGameType];
    pData.rankedGuesses = [];
    pData.rankedStatus = 'playing';
    pData.rankedTargetName = null;
    savePersistentData();

    if (isWin) {
      startGame('ranked');
    }
  }
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
                <div>
                    <h3 class="font-bold text-gray-800 border-b pb-1 mb-2">Game Modes</h3>
                    <ul class="list-disc list-inside text-sm space-y-2 ml-1">
                        <li><strong>Daily Mode:</strong> A new puzzle every day at midnight JST!</li>
                        <li><strong>Unlimited Mode:</strong> Play as many puzzles as you want!</li>
                        <li><strong>Easy Mode:</strong> A more forgiving difficulty level for new players!</li>
                        <li><strong>Normal Mode:</strong> The classic experience!</li>
                        <li><strong>Hard Mode:</strong> no names, only 3 clues, and just 2 attempts! Good Luck!</li>
                    </ul>
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
                    <h3 class="font-bold text-gray-800 border-b pb-1 mb-2">Game Modes</h3>
                    <ul class="list-disc list-inside text-sm space-y-2 ml-1">
                        <li><strong>Daily Mode:</strong> A new puzzle every day at midnight JST!</li>
                        <li><strong>Unlimited Mode:</strong> Play as many puzzles as you want!</li>
                        <li><strong>Easy Mode:</strong> A more forgiving difficulty level for new players!</li>
                        <li><strong>Normal Mode:</strong> The classic experience!</li>
                        <li><strong>Hard Mode:</strong> no names, only 3 clues, and just 2 attempts! Good Luck!</li>
                    </ul>
                </div>
            `;
    }
  }

  modal.classList.toggle('hidden', !show);
}

function showAutocomplete() { /* picker panel is always visible — no-op */ }
function hideAutocomplete() { /* picker panel is always visible — no-op */ }

function checkDevMode() {
  const urlParams = new URLSearchParams(window.location.search);
  const isDev = urlParams.get('silencesuzuka') === 'true';

  const rankedView = document.getElementById('ranked-profile-view');
  const rankedBtn = document.querySelector("button[onclick=\"startGame('ranked')\"]");
  const rankedWarning = document.querySelector(".text-purple-500.italic");
  

  if (!isDev) {
    if (rankedView) rankedView.classList.add('hidden');
    if (rankedBtn) rankedBtn.classList.add('hidden');
    if (rankedWarning) rankedWarning.classList.add('hidden');
  } else {
    if (rankedView) rankedView.classList.remove('hidden');
        if (rankedBtn) rankedBtn.classList.remove('hidden');
        if (rankedWarning) rankedWarning.classList.remove('hidden');
    }
}

const CURRENT_VERSION = '1.0';

function openChangelog() {
    const modal = document.getElementById('changelog-modal');
    modal.classList.remove('hidden');
}

function closeChangelog() {
    const modal = document.getElementById('changelog-modal');
    modal.classList.add('hidden');
    if (localStorage.getItem('uma_wordle_version') !== CURRENT_VERSION) {
        localStorage.setItem('uma_wordle_version', CURRENT_VERSION);
    }
}

window.addEventListener('load', () => {
  setTimeout(checkChangelog, 500);
});

function checkChangelog() {
    const savedVersion = localStorage.getItem('uma_wordle_version');
    if (savedVersion !== CURRENT_VERSION) {
        openChangelog();
    }
}

loadGameData();