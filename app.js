// QR-Pass Application Logic

// ==========================================
// 1. STATE & DEFAULT CONFIGURATIONS
// ==========================================
const DEFAULT_PERIODS = [
    { number: 1, start: "09:00", end: "10:30" },
    { number: 2, start: "10:40", end: "12:10" },
    { number: 3, start: "13:00", end: "14:30" },
    { number: 4, start: "14:40", end: "16:10" },
    { number: 5, start: "16:20", end: "17:50" },
    { number: 6, start: "18:00", end: "19:30" }
];

const DAY_NAMES = ["日曜日", "月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日"];

let state = {
    classes: [],
    history: [],
    periods: JSON.parse(JSON.stringify(DEFAULT_PERIODS))
};

// ==========================================
// 2. INITIALIZATION & PWA SERVICE WORKER
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // Register PWA Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker Registered!', reg.scope))
            .catch(err => console.warn('Service Worker registration failed:', err));
    }

    loadData();
    initApp();
});

// Load data from LocalStorage
function loadData() {
    const savedClasses = localStorage.getItem('qr_pass_classes');
    const savedHistory = localStorage.getItem('qr_pass_history');
    const savedPeriods = localStorage.getItem('qr_pass_periods');

    if (savedClasses) state.classes = JSON.parse(savedClasses);
    if (savedHistory) state.history = JSON.parse(savedHistory);
    if (savedPeriods) state.periods = JSON.parse(savedPeriods);
}

// Save data to LocalStorage
function saveData(key) {
    if (!key || key === 'classes') localStorage.setItem('qr_pass_classes', JSON.stringify(state.classes));
    if (!key || key === 'history') localStorage.setItem('qr_pass_history', JSON.stringify(state.history));
    if (!key || key === 'periods') localStorage.setItem('qr_pass_periods', JSON.stringify(state.periods));
}

// Initialize application components and event listeners
function initApp() {
    // Start real-time clock and active class tracking
    startClock();
    updateDashboard();

    // Navigation setup
    setupNavigation();

    // Timetable screen setup
    setupTimetableScreen();

    // Settings screen setup
    setupSettingsScreen();

    // Modals & Form setup
    setupClassModal();

    // QR Scanner setup
    setupQRScanner();

    // manaba Import setup
    setupManabaImport();

    // Notifications & Reminders setup
    setupNotifications();
    scheduleDailyNotifications();

    // Render today's classes
    renderTodayClasses();

    // Handle manaba URL Parameter Import
    handleURLImport();
}

// ==========================================
// 3. UI NAVIGATION & CLOCK
// ==========================================
function startClock() {
    const timeDisplay = document.getElementById('current-time-display');
    const todayDateString = document.getElementById('today-date-string');
    
    function updateClock() {
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        timeDisplay.textContent = `${hours}:${minutes}`;
        
        // Update date label on home screen
        const month = now.getMonth() + 1;
        const date = now.getDate();
        const dayName = DAY_NAMES[now.getDay()];
        todayDateString.textContent = `${month}月${date}日 (${dayName.charAt(0)})`;
    }
    
    updateClock();
    setInterval(updateClock, 1000);
    // Periodically update active class info (every 30 seconds)
    setInterval(updateDashboard, 30000);
}

function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const screens = document.querySelectorAll('.app-screen');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const screenId = item.getAttribute('data-screen');
            
            // Switch navigation active state
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            // Switch active screen
            screens.forEach(screen => {
                screen.classList.remove('active');
                if (screen.id === `screen-${screenId}`) {
                    screen.classList.add('active');
                }
            });

            // Trigger specific screen refreshes
            if (screenId === 'home') {
                updateDashboard();
                renderTodayClasses();
            } else if (screenId === 'timetable') {
                renderTimetableForCurrentTab();
            } else if (screenId === 'history') {
                renderHistory();
            } else if (screenId === 'settings') {
                renderSettings();
            }
        });
    });
}

// ==========================================
// 4. DASHBOARD & HOME LOGIC
// ==========================================
let currentActiveTargetClass = null; // Stores currently running class if any

function updateDashboard() {
    const info = getCurrentPeriodClass();
    const badge = document.getElementById('current-period-badge');
    const nameEl = document.getElementById('current-class-name');
    const timeEl = document.getElementById('current-class-time');
    const roomEl = document.getElementById('current-class-room');
    const quickUrlContainer = document.getElementById('quick-url-container');
    const lastAttendBtn = document.getElementById('btn-last-attend-url');

    if (info && info.classData) {
        const cls = info.classData;
        currentActiveTargetClass = cls;

        // Group continuous classes for dashboard display
        const now = new Date();
        const currentDay = now.getDay();
        const todayClasses = state.classes.filter(c => Number(c.day) === currentDay);
        todayClasses.sort((a, b) => Number(a.period) - Number(b.period));
        const groupedClasses = groupContinuousClasses(todayClasses);
        const groupedCls = groupedClasses.find(g => g.ids.includes(cls.id));

        if (groupedCls && groupedCls.periods.length > 1) {
            badge.textContent = `${groupedCls.startPeriod}-${groupedCls.endPeriod}限 (開講中)`;
            timeEl.textContent = getPeriodTimeRangeStr(groupedCls.startPeriod, groupedCls.endPeriod);
        } else {
            badge.textContent = `${cls.period}限 (開講中)`;
            const periodTime = state.periods.find(p => p.number === Number(cls.period));
            timeEl.textContent = periodTime ? `${periodTime.start} ~ ${periodTime.end}` : '--:--';
        }
        badge.className = "status-badge active-class";
        nameEl.textContent = cls.name;
        roomEl.textContent = cls.room || '教室情報なし';

        // Check if there is an attendance URL history for this class
        const historyForClass = state.history.filter(h => h.classId === cls.id);
        const fixedUrl = cls.urlTemplate;
        
        if (fixedUrl || historyForClass.length > 0) {
            const targetUrl = fixedUrl || historyForClass[0].url; // Latest is index 0
            quickUrlContainer.classList.remove('hidden');
            lastAttendBtn.href = targetUrl;
            lastAttendBtn.onclick = (e) => {
                // Register attendance event on click
                recordAttendance(cls.id, cls.name, targetUrl);
            };
        } else {
            quickUrlContainer.classList.add('hidden');
        }
    } else {
        currentActiveTargetClass = null;
        badge.className = "status-badge";
        
        if (info && info.periodNumber) {
            badge.textContent = `${info.periodNumber}限`;
            nameEl.textContent = "空きコマ / 授業なし";
            const periodTime = state.periods.find(p => p.number === info.periodNumber);
            timeEl.textContent = periodTime ? `${periodTime.start} ~ ${periodTime.end}` : '--:--';
            roomEl.textContent = "--";
        } else {
            badge.textContent = "時間外";
            nameEl.textContent = "本日の時程は終了しました";
            timeEl.textContent = "--:--";
            roomEl.textContent = "--";
        }
        quickUrlContainer.classList.add('hidden');
    }
    // Directly check for attendance reminders inside dashboard loop
    checkAttendanceReminders();
}

// Check what class is current based on settings and system clock
function getCurrentPeriodClass() {
    const now = new Date();
    const currentDay = now.getDay();
    if (currentDay === 0) return null; // Sunday

    const timeString = now.toTimeString().slice(0, 5); // "HH:MM"
    const getMinutes = (t) => {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
    };
    const nowMins = getMinutes(timeString);

    let activePeriod = null;

    for (const p of state.periods) {
        const startMins = getMinutes(p.start);
        const endMins = getMinutes(p.end);
        
        // 15 minutes buffer before class starts, up to class end time
        if (nowMins >= (startMins - 15) && nowMins <= endMins) {
            activePeriod = p.number;
            break;
        }
    }

    if (activePeriod !== null) {
        const activeClass = state.classes.find(
            c => Number(c.day) === currentDay && Number(c.period) === activePeriod
        );
        return {
            classData: activeClass || null,
            periodNumber: activePeriod
        };
    }

    return null;
}

function renderTodayClasses() {
    const container = document.getElementById('today-classes-list');
    const now = new Date();
    const currentDay = now.getDay();

    if (currentDay === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-mug-hot"></i>
                <p>日曜日は休講日です</p>
            </div>
        `;
        return;
    }

    const todayClasses = state.classes.filter(c => Number(c.day) === currentDay);
    
    if (todayClasses.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-calendar-day"></i>
                <p>今日の授業は登録されていません</p>
            </div>
        `;
        return;
    }

    // Sort classes by period number
    todayClasses.sort((a, b) => Number(a.period) - Number(b.period));
    const groupedTodayClasses = groupContinuousClasses(todayClasses);

    container.innerHTML = '';
    groupedTodayClasses.forEach(cls => {
        const isGrouped = cls.periods.length > 1;
        const periodBadgeText = isGrouped ? `${cls.startPeriod}-${cls.endPeriod}` : `${cls.startPeriod}`;
        const timeStr = getPeriodTimeRangeStr(cls.startPeriod, cls.endPeriod);
        
        const card = document.createElement('div');
        card.className = 'class-card';
        card.innerHTML = `
            <div class="class-card-left">
                <div class="period-badge">
                    <span>${periodBadgeText}</span>
                    <small>限</small>
                </div>
                <div class="class-info">
                    <h4>${cls.name}</h4>
                    <p>
                        <span><i class="fa-solid fa-clock"></i> ${timeStr}</span>
                        <span><i class="fa-solid fa-location-dot"></i> ${cls.room || '未定'}</span>
                    </p>
                </div>
            </div>
            <div class="class-card-right">
                <button class="btn-icon btn-card-scan" data-id="${cls.id}" title="スキャン出席">
                    <i class="fa-solid fa-camera"></i>
                </button>
            </div>
        `;

        // Card action (open edit/detail)
        card.addEventListener('click', (e) => {
            if (e.target.closest('.btn-card-scan')) return; // ignore scanner click
            openEditClassModal(cls.id);
        });

        // Small scan button logic
        card.querySelector('.btn-card-scan').addEventListener('click', (e) => {
            e.stopPropagation();
            startScanning(cls.classes[0]);
        });

        container.appendChild(card);
    });
}

// ==========================================
// 5. TIMETABLE SCREEN LOGIC
// ==========================================
let currentTimetableTabDay = 1; // Default to Monday

function setupTimetableScreen() {
    const tabs = document.querySelectorAll('.tab-day');
    
    // Set active tab based on current day if it is Mon-Sat
    const today = new Date().getDay();
    if (today >= 1 && today <= 6) {
        currentTimetableTabDay = today;
        tabs.forEach(tab => {
            tab.classList.remove('active');
            if (Number(tab.getAttribute('data-day')) === today) {
                tab.classList.add('active');
            }
        });
    }

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentTimetableTabDay = Number(tab.getAttribute('data-day'));
            renderTimetableForCurrentTab();
        });
    });

    document.getElementById('btn-add-class-timetable').addEventListener('click', () => {
        openAddClassModal(currentTimetableTabDay);
    });
}

function renderTimetableForCurrentTab() {
    const container = document.getElementById('timetable-day-content');
    const dayClasses = state.classes.filter(c => Number(c.day) === currentTimetableTabDay);

    if (dayClasses.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-folder-open"></i>
                <p>${DAY_NAMES[currentTimetableTabDay]}の授業はありません</p>
                <button id="btn-empty-state-add" class="btn btn-secondary btn-sm" style="margin-top:12px; width:auto;">授業を追加する</button>
            </div>
        `;
        document.getElementById('btn-empty-state-add').addEventListener('click', () => {
            openAddClassModal(currentTimetableTabDay);
        });
        return;
    }

    dayClasses.sort((a, b) => Number(a.period) - Number(b.period));
    const groupedDayClasses = groupContinuousClasses(dayClasses);

    container.innerHTML = '';
    groupedDayClasses.forEach(cls => {
        const isGrouped = cls.periods.length > 1;
        const periodBadgeText = isGrouped ? `${cls.startPeriod}-${cls.endPeriod}` : `${cls.startPeriod}`;
        const timeStr = getPeriodTimeRangeStr(cls.startPeriod, cls.endPeriod);

        const card = document.createElement('div');
        card.className = 'class-card';
        card.innerHTML = `
            <div class="class-card-left">
                <div class="period-badge">
                    <span>${periodBadgeText}</span>
                    <small>限</small>
                </div>
                <div class="class-info">
                    <h4>${cls.name}</h4>
                    <p>
                        <span><i class="fa-solid fa-clock"></i> ${timeStr}</span>
                        <span><i class="fa-solid fa-location-dot"></i> ${cls.room || '未定'}</span>
                    </p>
                </div>
            </div>
            <div class="class-card-right">
                <i class="fa-solid fa-chevron-right text-muted"></i>
            </div>
        `;

        card.addEventListener('click', () => {
            openEditClassModal(cls.id);
        });

        container.appendChild(card);
    });
}

// ==========================================
// 6. CLASS MODAL (ADD / EDIT)
// ==========================================
const classModal = document.getElementById('class-modal');
const classForm = document.getElementById('class-form');

function setupClassModal() {
    document.getElementById('btn-close-modal').addEventListener('click', closeModal);
    document.getElementById('btn-cancel-modal').addEventListener('click', closeModal);
    
    document.getElementById('btn-delete-class').addEventListener('click', () => {
        const classId = document.getElementById('form-class-id').value;
        if (confirm('この授業を削除しますか？\n（出席履歴は削除されません）')) {
            state.classes = state.classes.filter(c => c.id !== classId);
            saveData('classes');
            closeModal();
            // Refresh currently visible screens
            renderTodayClasses();
            renderTimetableForCurrentTab();
            updateDashboard();
        }
    });

    classForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const id = document.getElementById('form-class-id').value;
        const name = document.getElementById('form-class-name').value.trim();
        const day = Number(document.getElementById('form-class-day').value);
        const period = Number(document.getElementById('form-class-period').value);
        const room = document.getElementById('form-class-room').value.trim();
        const urlTemplate = document.getElementById('form-class-url').value.trim();
        const memo = document.getElementById('form-class-memo').value.trim();

        if (!name) return;

        // Check for duplicates (same day and period)
        const isDuplicate = state.classes.some(c => 
            c.id !== id && Number(c.day) === day && Number(c.period) === period
        );

        if (isDuplicate) {
            alert('同じ曜日・時限にすでに他の授業が登録されています。');
            return;
        }

        if (id) {
            // Edit existing
            const index = state.classes.findIndex(c => c.id === id);
            if (index !== -1) {
                state.classes[index] = { id, name, day, period, room, urlTemplate, memo };
            }
        } else {
            // Create new
            const newClass = {
                id: 'class-' + Date.now().toString(36),
                name, day, period, room, urlTemplate, memo
            };
            state.classes.push(newClass);
        }

        saveData('classes');
        closeModal();
        renderTodayClasses();
        renderTimetableForCurrentTab();
        updateDashboard();
    });
}

function updateClassPeriodSelect(selectedValue) {
    const select = document.getElementById('form-class-period');
    select.innerHTML = '';
    state.periods.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.number;
        opt.textContent = `${p.number}限`;
        if (p.number === Number(selectedValue)) {
            opt.selected = true;
        }
        select.appendChild(opt);
    });
}

function openAddClassModal(defaultDay = 1) {
    classForm.reset();
    document.getElementById('form-class-id').value = '';
    document.getElementById('modal-title').textContent = '授業の追加';
    document.getElementById('form-class-day').value = defaultDay;
    
    // Dynamically update period choices
    updateClassPeriodSelect();
    
    document.getElementById('btn-delete-class').classList.add('hidden');
    classModal.classList.add('active');
}

function openEditClassModal(classId) {
    const cls = state.classes.find(c => c.id === classId);
    if (!cls) return;

    document.getElementById('form-class-id').value = cls.id;
    document.getElementById('form-class-name').value = cls.name;
    document.getElementById('form-class-day').value = cls.day;
    
    // Dynamically update period choices
    updateClassPeriodSelect(cls.period);
    
    document.getElementById('form-class-room').value = cls.room || '';
    document.getElementById('form-class-url').value = cls.urlTemplate || '';
    document.getElementById('form-class-memo').value = cls.memo || '';

    document.getElementById('modal-title').textContent = '授業情報の編集';
    document.getElementById('btn-delete-class').classList.remove('hidden');
    
    classModal.classList.add('active');
}

function closeModal() {
    classModal.classList.remove('active');
}

// ==========================================
// 7. QR CODE SCANNER (jsQR)
// ==========================================
const scannerOverlay = document.getElementById('scanner-overlay');
const video = document.getElementById('scanner-video');
const canvasElement = document.getElementById('scanner-canvas');
const canvas = canvasElement.getContext('2d');
const scannerStatus = document.getElementById('scanner-status');
const resultPreview = document.getElementById('scanned-result-preview');
const detectedUrlText = document.getElementById('detected-url-text');
const btnConfirmAttend = document.getElementById('btn-confirm-attend');

let stream = null;
let animationFrameId = null;
let scanTargetClass = null; // Class context for scanning
let isScanningActive = false;

function setupQRScanner() {
    document.getElementById('btn-quick-scan').addEventListener('click', () => {
        const activeInfo = getCurrentPeriodClass();
        startScanning(activeInfo ? activeInfo.classData : null);
    });

    document.getElementById('btn-close-scanner').addEventListener('click', stopScanningApp);
    
    btnConfirmAttend.addEventListener('click', () => {
        const url = detectedUrlText.textContent;
        if (url && url !== 'https://...') {
            const classId = scanTargetClass ? scanTargetClass.id : 'unknown';
            const className = scanTargetClass ? scanTargetClass.name : '一般スキャン';
            
            recordAttendance(classId, className, url);
            window.open(url, '_blank');
            stopScanningApp();
        }
    });

    // File Scan Fallback setup
    const fileTrigger = document.getElementById('btn-scan-file-trigger');
    const fileInput = document.getElementById('input-scan-file');

    if (fileTrigger && fileInput) {
        fileTrigger.addEventListener('click', () => {
            fileInput.click();
        });

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            scannerStatus.textContent = "画像ファイルを読み込み中...";

            const reader = new FileReader();
            reader.onload = function(evt) {
                const img = new Image();
                img.onload = function() {
                    // Set target dimensions on canvas
                    canvasElement.width = img.width;
                    canvasElement.height = img.height;
                    canvasElement.classList.remove('hidden');
                    canvas.drawImage(img, 0, 0);
                    
                    try {
                        const imageData = canvas.getImageData(0, 0, canvasElement.width, canvasElement.height);
                        const code = jsQR(imageData.data, imageData.width, imageData.height);
                        
                        if (code && isValidURL(code.data)) {
                            handleScannedURL(code.data);
                        } else {
                            alert('画像から有効な出席用QRコード（URL）を検出できませんでした。');
                            scannerStatus.textContent = "スキャンに失敗しました。他の画像をお試しください。";
                        }
                    } catch (err) {
                        console.error("jsQR error decoding image file:", err);
                        alert('画像のデコードに失敗しました。');
                    }
                };
                img.src = evt.target.result;
            };
            reader.readAsDataURL(file);
            e.target.value = ''; // Reset file input
        });
    }
}

function startScanning(targetClass = null) {
    scanTargetClass = targetClass;
    isScanningActive = true;
    
    const scannerHeaderTitle = scannerOverlay.querySelector('.scanner-header h3');
    if (targetClass) {
        scannerHeaderTitle.textContent = `${targetClass.name} | 出席スキャン`;
    } else {
        scannerHeaderTitle.textContent = `QRコードスキャン`;
    }

    resultPreview.classList.add('hidden');
    scannerStatus.classList.remove('hidden');
    scannerStatus.textContent = "カメラ起動中...";
    canvasElement.classList.add('hidden');
    
    scannerOverlay.classList.add('active');

    // Request camera access - simplified parameters for maximum browser compatibility
    const constraints = {
        video: { facingMode: "environment" }
    };

    navigator.mediaDevices.getUserMedia(constraints)
        .then(function(mediaStream) {
            stream = mediaStream;
            video.srcObject = mediaStream;
            
            // Programmatically force required attributes for iOS Safari WebRTC
            video.setAttribute("playsinline", true);
            video.setAttribute("autoplay", true);
            video.setAttribute("muted", true);
            
            // Wait for metadata to load before calling play() on iOS
            video.onloadedmetadata = function() {
                video.play()
                    .then(() => {
                        animationFrameId = requestAnimationFrame(tick);
                    })
                    .catch(err => {
                        console.error("Failed to start video playback on iOS:", err);
                        // Force frame loop even if autoplay policy blocked it
                        animationFrameId = requestAnimationFrame(tick);
                    });
            };
        })
        .catch(function(err) {
            console.error("Camera access error:", err);
            scannerStatus.innerHTML = `<span class="text-danger"><i class="fa-solid fa-triangle-exclamation"></i> カメラを起動できません。<br>権限がオフか、他アプリで使用中かもしれません。</span>`;
        });
}

function tick() {
    if (!isScanningActive) return;

    if (video.readyState === video.HAVE_ENOUGH_DATA) {
        scannerStatus.textContent = "QRコードを枠内にあわせてください";
        
        // Show canvas overlay for drawing borders if needed
        canvasElement.classList.remove('hidden');
        canvasElement.height = video.videoHeight;
        canvasElement.width = video.videoWidth;
        
        canvas.drawImage(video, 0, 0, canvasElement.width, canvasElement.height);
        
        const imageData = canvas.getImageData(0, 0, canvasElement.width, canvasElement.height);
        
        // jsQR scanning
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "dontInvert",
        });
        
        if (code) {
            // Draw a boundary box around QR code
            drawRect(code.location.topLeftCorner, code.location.topRightCorner, "#38bdf8");
            drawRect(code.location.topRightCorner, code.location.bottomRightCorner, "#38bdf8");
            drawRect(code.location.bottomRightCorner, code.location.bottomLeftCorner, "#38bdf8");
            drawRect(code.location.bottomLeftCorner, code.location.topLeftCorner, "#38bdf8");
            
            // Validate if it is a valid URL
            if (isValidURL(code.data)) {
                handleScannedURL(code.data);
                return; // Stop requesting animation frames
            } else {
                scannerStatus.textContent = "URL以外のQRコードは登録できません";
            }
        }
    }
    animationFrameId = requestAnimationFrame(tick);
}

function drawRect(begin, end, color) {
    canvas.beginPath();
    canvas.moveTo(begin.x, begin.y);
    canvas.lineTo(end.x, end.y);
    canvas.lineWidth = 4;
    canvas.strokeStyle = color;
    canvas.stroke();
}

function isValidURL(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

function handleScannedURL(url) {
    isScanningActive = false;
    
    // Stop camera streaming
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }

    // Vibrate device if supported
    if ('vibrate' in navigator) {
        navigator.vibrate(200);
    }

    scannerStatus.classList.add('hidden');
    resultPreview.classList.remove('hidden');
    detectedUrlText.textContent = url;
}

function stopScanningApp() {
    isScanningActive = false;
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    scannerOverlay.classList.remove('active');
    updateDashboard(); // Refresh URL shortcuts in dashboard
}

// ==========================================
// 8. ATTENDANCE RECORD & HISTORY LOGIC
// ==========================================
function recordAttendance(classId, className, url) {
    const timestamp = new Date().toISOString();
    
    // Add to state history (prepend)
    state.history.unshift({
        id: 'hist-' + Date.now().toString(36),
        classId,
        className,
        url,
        timestamp
    });

    // Keep history maximum size at 100 entries
    if (state.history.length > 100) {
        state.history = state.history.slice(0, 100);
    }

    saveData('history');

    // User Feedback: Map scanned URL back to the class profile template
    if (classId && classId !== 'unknown') {
        const clsIndex = state.classes.findIndex(c => c.id === classId);
        if (clsIndex !== -1) {
            if (state.classes[clsIndex].urlTemplate !== url) {
                state.classes[clsIndex].urlTemplate = url;
                saveData('classes');
                console.log(`Auto-saved QR URL as template for ${className}`);
            }
        }
    }
}

function renderHistory() {
    const container = document.getElementById('history-list-container');
    
    if (state.history.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-clock-rotate-left"></i>
                <p>出席した履歴はここに表示されます</p>
            </div>
        `;
        return;
    }

    container.innerHTML = '';
    state.history.forEach(item => {
        const dateObj = new Date(item.timestamp);
        const datetimeStr = `${dateObj.getMonth() + 1}/${dateObj.getDate()} ${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}`;

        const card = document.createElement('div');
        card.className = 'history-card';
        card.innerHTML = `
            <div class="history-details">
                <h4>${item.className}</h4>
                <p><i class="fa-solid fa-calendar-alt"></i> ${datetimeStr}</p>
                <a class="history-url" href="${item.url}" target="_blank">
                    <i class="fa-solid fa-link"></i> ${item.url}
                </a>
            </div>
            <div class="history-action">
                <a href="${item.url}" target="_blank" class="btn-icon" style="border-radius: 50%;">
                    <i class="fa-solid fa-arrow-up-right-from-square" style="font-size:0.9rem;"></i>
                </a>
            </div>
        `;

        container.appendChild(card);
    });
}

// ==========================================
// 9. SETTINGS MANAGEMENT
// ==========================================
function setupSettingsScreen() {
    document.getElementById('btn-save-periods').addEventListener('click', savePeriodsConfig);
    document.getElementById('btn-clear-history').addEventListener('click', clearHistoryData);
    
    // Dynamic period adding
    const btnAddPeriod = document.getElementById('btn-add-period');
    if (btnAddPeriod) {
        btnAddPeriod.addEventListener('click', () => {
            const newNum = state.periods.length + 1;
            let start = "18:00";
            let end = "19:30";
            if (state.periods.length > 0) {
                const lastPeriod = state.periods[state.periods.length - 1];
                const [h, m] = lastPeriod.end.split(':').map(Number);
                const startMins = h * 60 + m + 10; // 10 minutes break
                const sh = Math.floor(startMins / 60);
                const sm = startMins % 60;
                start = `${String(sh).padStart(2, '0')}:${String(sm).padStart(2, '0')}`;
                
                const endMins = startMins + 90; // 90 minutes class
                const eh = Math.floor(endMins / 60);
                const em = endMins % 60;
                end = `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
            }
            state.periods.push({ number: newNum, start, end });
            saveData('periods');
            renderSettings();
            
            // Notify scheduling update
            scheduleDailyNotifications();
        });
    }

    // Backup triggers
    document.getElementById('btn-export-data').addEventListener('click', exportDataToJSON);
    
    const importTrigger = document.getElementById('btn-import-data-trigger');
    const importInput = document.getElementById('input-import-data');
    
    importTrigger.addEventListener('click', () => importInput.click());
    importInput.addEventListener('change', importDataFromJSON);

    document.getElementById('btn-reset-all').addEventListener('click', resetAllApplicationData);

    // Update Logs Notice Center Accordion Toggle
    const toggleBtn = document.getElementById('btn-toggle-notifications');
    const notifContent = document.getElementById('notification-content');
    const notifArrow = document.getElementById('notif-toggle-arrow');
    
    if (toggleBtn && notifContent && notifArrow) {
        toggleBtn.addEventListener('click', () => {
            const isHidden = notifContent.classList.contains('hidden');
            if (isHidden) {
                notifContent.classList.remove('hidden');
                notifArrow.classList.add('open');
            } else {
                notifContent.classList.add('hidden');
                notifArrow.classList.remove('open');
            }
        });
    }

    // Dynamic Bookmarklet Generation & Copy Handler
    const originUrl = window.location.origin + window.location.pathname;
    const bookmarkletCodeText = `javascript:(function(){const text=document.body.innerText;const url='${originUrl}?import_text='+encodeURIComponent(text);window.open(url,'_self');})();`;
    const bookmarkletCode = document.getElementById('bookmarklet-code');
    if (bookmarkletCode) {
        bookmarkletCode.value = bookmarkletCodeText;
    }

    const btnCopyBookmarklet = document.getElementById('btn-copy-bookmarklet');
    if (btnCopyBookmarklet && bookmarkletCode) {
        btnCopyBookmarklet.addEventListener('click', () => {
            bookmarkletCode.select();
            bookmarkletCode.setSelectionRange(0, 99999); // For mobile devices
            
            try {
                navigator.clipboard.writeText(bookmarkletCode.value)
                    .then(() => {
                        const originalText = btnCopyBookmarklet.innerHTML;
                        btnCopyBookmarklet.innerHTML = '<i class="fa-solid fa-check"></i> コピーしました！';
                        btnCopyBookmarklet.classList.remove('btn-secondary');
                        btnCopyBookmarklet.classList.add('btn-success');
                        setTimeout(() => {
                            btnCopyBookmarklet.innerHTML = originalText;
                            btnCopyBookmarklet.classList.remove('btn-success');
                            btnCopyBookmarklet.classList.add('btn-secondary');
                        }, 2000);
                    })
                    .catch(err => {
                        console.error('Failed to copy text: ', err);
                        alert('コピーに失敗しました。テキストエリアを長押しして手動でコピーしてください。');
                    });
            } catch (err) {
                try {
                    document.execCommand('copy');
                    const originalText = btnCopyBookmarklet.innerHTML;
                    btnCopyBookmarklet.innerHTML = '<i class="fa-solid fa-check"></i> コピーしました！';
                    btnCopyBookmarklet.classList.remove('btn-secondary');
                    btnCopyBookmarklet.classList.add('btn-success');
                    setTimeout(() => {
                        btnCopyBookmarklet.innerHTML = originalText;
                        btnCopyBookmarklet.classList.remove('btn-success');
                        btnCopyBookmarklet.classList.add('btn-secondary');
                    }, 2000);
                } catch (e) {
                    alert('コピーに失敗しました。テキストエリアを長押しして手動でコピーしてください。');
                }
            }
        });
    }
}

function renderSettings() {
    const listContainer = document.getElementById('period-settings-list');
    listContainer.innerHTML = '';

    state.periods.forEach((p, idx) => {
        const row = document.createElement('div');
        row.className = 'period-setting-row';
        row.innerHTML = `
            <span>${p.number}限</span>
            <input type="time" id="period-${p.number}-start" value="${p.start}">
            <span class="text-muted">~</span>
            <input type="time" id="period-${p.number}-end" value="${p.end}">
            <button class="btn-delete-period" data-index="${idx}" title="削除">
                <i class="fa-solid fa-trash-can"></i>
            </button>
        `;

        row.querySelector('.btn-delete-period').addEventListener('click', (e) => {
            const index = parseInt(e.currentTarget.getAttribute('data-index'), 10);
            const periodNum = state.periods[index].number;
            
            // Check if active classes depend on this period
            const hasClass = state.classes.some(c => Number(c.period) === periodNum);
            if (hasClass) {
                if (!confirm(`【警告】この${periodNum}限を使用している授業データが存在します。時限設定を削除すると、その授業の時間割表示が崩れる可能性があります。本当に削除しますか？`)) {
                    return;
                }
            } else {
                if (!confirm(`${periodNum}限の設定を削除しますか？`)) {
                    return;
                }
            }

            state.periods.splice(index, 1);
            
            // Normalize period index numbers (1, 2, 3...)
            state.periods = state.periods.map((item, i) => ({
                number: i + 1,
                start: item.start,
                end: item.end
            }));
            
            saveData('periods');
            renderSettings();
            updateDashboard();
            renderTodayClasses();
            scheduleDailyNotifications();
        });

        listContainer.appendChild(row);
    });
}

function savePeriodsConfig() {
    let hasError = false;
    const newPeriods = state.periods.map(p => {
        const start = document.getElementById(`period-${p.number}-start`).value;
        const end = document.getElementById(`period-${p.number}-end`).value;
        
        if (!start || !end) {
            hasError = true;
        }
        return { number: p.number, start, end };
    });

    if (hasError) {
        alert('時間はすべて設定してください。');
        return;
    }

    state.periods = newPeriods;
    saveData('periods');
    alert('時限設定を保存しました。');
    
    updateDashboard();
    renderTodayClasses();
    scheduleDailyNotifications();
}

function clearHistoryData() {
    if (confirm('すべての出席履歴を完全に削除しますか？\n（時間割データは削除されません）')) {
        state.history = [];
        saveData('history');
        renderHistory();
        updateDashboard();
    }
}

function exportDataToJSON() {
    const dataStr = JSON.stringify(state, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    const dateStr = new Date().toISOString().slice(0, 10);
    const a = document.createElement('a');
    a.href = url;
    a.download = `qr-pass-backup-${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function importDataFromJSON(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(evt) {
        try {
            const parsed = JSON.parse(evt.target.result);
            if (parsed.classes && parsed.history && parsed.periods) {
                state.classes = parsed.classes;
                state.history = parsed.history;
                state.periods = parsed.periods;
                
                saveData('classes');
                saveData('history');
                saveData('periods');
                
                alert('バックアップデータを読み込みました！');
                
                // Refresh views
                updateDashboard();
                renderTodayClasses();
                renderSettings();
            } else {
                alert('ファイル形式が正しくありません。QR-Passのバックアップファイルを選択してください。');
            }
        } catch (err) {
            console.error(err);
            alert('ファイルの解析に失敗しました。');
        }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset file input
}

function resetAllApplicationData() {
    if (confirm('警告：すべての授業データ、出席履歴、設定値が初期化されます。よろしいですか？')) {
        localStorage.removeItem('qr_pass_classes');
        localStorage.removeItem('qr_pass_history');
        localStorage.removeItem('qr_pass_periods');
        
        state.classes = [];
        state.history = [];
        state.periods = JSON.parse(JSON.stringify(DEFAULT_PERIODS));
        
        alert('データを初期化しました。');
        
        // Refresh views
        updateDashboard();
        renderTodayClasses();
        renderSettings();
    }
}

// ==========================================
// 10. MANABA IMPORT LOGIC
// ==========================================
let parsedClassesTemp = []; // Temporary stores parsed classes for preview

function setupManabaImport() {
    const importModal = document.getElementById('import-modal');
    const importTrigger = document.getElementById('btn-import-manaba-trigger');
    const closeImportBtn = document.getElementById('btn-close-import-modal');
    const parseBtn = document.getElementById('btn-parse-import');
    const backBtn = document.getElementById('btn-back-import');
    const submitBtn = document.getElementById('btn-submit-import');
    const textarea = document.getElementById('import-textarea');
    
    const stepPaste = document.getElementById('import-step-paste');
    const stepPreview = document.getElementById('import-step-preview');

    // Tabs control
    const tabText = document.getElementById('tab-import-text');
    const tabImage = document.getElementById('tab-import-image');
    const textGroup = document.getElementById('import-text-group');
    const imageGroup = document.getElementById('import-image-group');

    tabText.addEventListener('click', () => {
        tabText.classList.add('active');
        tabImage.classList.remove('active');
        textGroup.classList.remove('hidden');
        imageGroup.classList.add('hidden');
    });

    tabImage.addEventListener('click', () => {
        tabImage.classList.add('active');
        tabText.classList.remove('active');
        imageGroup.classList.remove('hidden');
        textGroup.classList.add('hidden');
    });

    // Image OCR setup
    const ocrZone = document.getElementById('ocr-upload-zone');
    const ocrInput = document.getElementById('input-ocr-image');
    const ocrLoading = document.getElementById('ocr-loading-container');
    const ocrStatus = document.getElementById('ocr-loading-status');

    ocrZone.addEventListener('click', () => ocrInput.click());

    ocrInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        ocrLoading.classList.remove('hidden');
        ocrStatus.textContent = "画像を読み込み中 (Tesseract.js)...";

        Tesseract.recognize(
            file,
            'jpn+eng',
            {
                logger: m => {
                    if (m.status === 'recognizing') {
                        ocrStatus.textContent = `文字を解析中... ${Math.round(m.progress * 100)}%`;
                    }
                }
            }
        ).then(({ data: { text } }) => {
            ocrLoading.classList.add('hidden');
            textarea.value = text;
            tabText.click(); // Switch back to text view to review
            alert('画像の文字起こしが完了しました！テキストを確認の上「解析する」を押してください。');
        }).catch(err => {
            console.error("Tesseract OCR Error:", err);
            ocrLoading.classList.add('hidden');
            alert('画像の解析に失敗しました。別の画像で試すか、テキストをコピーして貼り付けてください。');
        });

        e.target.value = ''; // Reset input
    });

    importTrigger.addEventListener('click', () => {
        textarea.value = '';
        tabText.click();
        stepPaste.classList.remove('hidden');
        stepPreview.classList.add('hidden');
        importModal.classList.add('active');
    });

    closeImportBtn.addEventListener('click', () => {
        importModal.classList.remove('active');
    });

    backBtn.addEventListener('click', () => {
        stepPaste.classList.remove('hidden');
        stepPreview.classList.add('hidden');
    });

    parseBtn.addEventListener('click', () => {
        const text = textarea.value.trim();
        if (!text) {
            alert('テキストを貼り付けるか、スクリーンショットをアップロードしてください。');
            return;
        }

        parsedClassesTemp = parseManabaText(text);

        if (parsedClassesTemp.length === 0) {
            alert('授業情報を抽出できませんでした。曜日と時限（例: 月1, 火2）が含まれているか確認してください。');
            return;
        }

        renderImportPreview();
        stepPaste.classList.add('hidden');
        stepPreview.classList.remove('hidden');
    });

    submitBtn.addEventListener('click', () => {
        const checkedCheckboxes = document.querySelectorAll('.import-preview-checkbox:checked');
        if (checkedCheckboxes.length === 0) {
            alert('登録する授業を1つ以上選択してください。');
            return;
        }

        const importMode = document.querySelector('input[name="import-mode"]:checked').value;
        const classesToImport = [];

        checkedCheckboxes.forEach(cb => {
            const index = parseInt(cb.getAttribute('data-index'), 10);
            const tempCls = parsedClassesTemp[index];
            if (tempCls) {
                classesToImport.push({
                    id: 'class-' + (Date.now() + Math.random()).toString(36).replace('.', ''),
                    name: tempCls.name,
                    day: tempCls.day,
                    period: tempCls.period,
                    room: tempCls.room || '',
                    urlTemplate: '',
                    memo: 'manabaインポート'
                });
            }
        });

        if (importMode === 'overwrite') {
            if (!confirm('現在の時間割データがすべて消去され、選択した授業に上書きされます。よろしいですか？')) {
                return;
            }
            state.classes = classesToImport;
        } else {
            // Merge mode
            let duplicatesCount = 0;
            const mergedClasses = [...state.classes];

            classesToImport.forEach(newCls => {
                const dupIndex = mergedClasses.findIndex(c => Number(c.day) === Number(newCls.day) && Number(c.period) === Number(newCls.period));
                if (dupIndex !== -1) {
                    mergedClasses[dupIndex] = newCls;
                    duplicatesCount++;
                } else {
                    mergedClasses.push(newCls);
                }
            });

            state.classes = mergedClasses;
            if (duplicatesCount > 0) {
                alert(`${duplicatesCount}件の重複する時限の授業が新しい授業で上書きされました。`);
            }
        }

        saveData('classes');
        importModal.classList.remove('active');
        
        // Refresh views
        renderTodayClasses();
        renderTimetableForCurrentTab();
        updateDashboard();
        scheduleDailyNotifications();
        
        alert(`${classesToImport.length}件の授業を登録しました！`);
    });
}

function parseManabaText(text) {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const results = [];
    const dayMap = { '日': 0, '月': 1, '火': 2, '水': 3, '木': 4, '金': 5, '土': 6 };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const periodsFound = [];

        // 曜日と時限のペアを検出
        let reg = /([月火水木金土])\s*(?:曜|曜日)?\s*([1-6])(?:限|限目)?/g;
        let match;
        while ((match = reg.exec(line)) !== null) {
            periodsFound.push({
                dayStr: match[1],
                periodNum: parseInt(match[2], 10)
            });
        }

        // 連続コマ (例: 月1,2 または 火2-3)
        const compactRegex = /([月火水木金土])\s*(?:曜|曜日)?\s*([1-6])\s*[,，・-]\s*([1-6])/;
        const compactMatch = line.match(compactRegex);
        if (compactMatch) {
            const dStr = compactMatch[1];
            const p1 = parseInt(compactMatch[2], 10);
            const p2 = parseInt(compactMatch[3], 10);
            if (!periodsFound.some(p => p.dayStr === dStr && p.periodNum === p1)) {
                periodsFound.push({ dayStr: dStr, periodNum: p1 });
            }
            if (!periodsFound.some(p => p.dayStr === dStr && p.periodNum === p2)) {
                periodsFound.push({ dayStr: dStr, periodNum: p2 });
            }
        }

        if (periodsFound.length > 0) {
            let className = "";

            // 1. 同同一行の曜日時限を除去した部分
            let cleanedLine = line.replace(/([月火水木金土])\s*(?:曜|曜日)?\s*[1-6](?:\s*[,，・-]\s*[1-6])*(?:限|限目)?/g, '').trim();
            cleanedLine = cleanedLine.replace(/^[-/：:；;\s,，・]+|[-/：:；;\s,，・]+$/g, '').trim();

            if (cleanedLine.length >= 2 && !cleanedLine.includes('/') && !cleanedLine.includes('http') && isNaN(cleanedLine)) {
                className = cleanedLine;
            } else if (i > 0) {
                // 2. 1行上
                let prevLine = lines[i - 1];
                if (prevLine.length >= 2 && !prevLine.includes('http') && !prevLine.match(/^[0-9\-\s]{4,}$/)) {
                    className = prevLine;
                }
            }

            if (!className && i > 1) {
                // 3. 2行上
                let prev2Line = lines[i - 2];
                if (prev2Line.length >= 2) {
                    className = prev2Line;
                }
            }

            if (className) {
                className = className.replace(/\s*[\(（][^）\)]*[\)）]\s*/g, '').trim();
                className = className.replace(/\[未読.*\]/g, '').trim();
                className = className.replace(/^[A-Za-z0-9\-\s]{5,}/, '').trim();
                if (className.length < 2) {
                    className = lines[i - 1] || lines[i];
                }
            } else {
                className = "検出された授業";
            }

            periodsFound.forEach(p => {
                const dayNum = dayMap[p.dayStr];
                if (!results.some(r => r.name === className && r.day === dayNum && r.period === p.periodNum)) {
                    results.push({
                        name: className,
                        day: dayNum,
                        period: p.periodNum,
                        room: ""
                    });
                }
            });
        }
    }
    return results;
}

function renderImportPreview() {
    const container = document.getElementById('import-preview-list');
    container.innerHTML = '';

    parsedClassesTemp.forEach((cls, index) => {
        const card = document.createElement('div');
        card.className = 'import-preview-card selected';
        card.setAttribute('data-index', index);
        card.innerHTML = `
            <input type="checkbox" class="import-preview-checkbox" data-index="${index}" checked>
            <div class="import-preview-info">
                <h5>${cls.name}</h5>
                <p>
                    <span><i class="fa-solid fa-calendar-day"></i> ${DAY_NAMES[cls.day]}</span>
                    <span><i class="fa-solid fa-clock"></i> ${cls.period}限</span>
                </p>
            </div>
        `;

        card.addEventListener('click', (e) => {
            const checkbox = card.querySelector('.import-preview-checkbox');
            if (e.target !== checkbox) {
                checkbox.checked = !checkbox.checked;
            }
            
            if (checkbox.checked) {
                card.classList.add('selected');
            } else {
                card.classList.remove('selected');
            }
            updateImportSubmitButtonCount();
        });

        card.querySelector('.import-preview-checkbox').addEventListener('click', (e) => {
            e.stopPropagation();
            if (e.target.checked) {
                card.classList.add('selected');
            } else {
                card.classList.remove('selected');
            }
            updateImportSubmitButtonCount();
        });

        container.appendChild(card);
    });

    updateImportSubmitButtonCount();
}

function updateImportSubmitButtonCount() {
    const checkedCount = document.querySelectorAll('.import-preview-checkbox:checked').length;
    const submitBtn = document.getElementById('btn-submit-import');
    submitBtn.textContent = `一括登録 (${checkedCount}件)`;
}

// ==========================================
// 11. REMINDER & PUSH NOTIFICATIONS
// ==========================================
let notificationTimers = [];

function setupNotifications() {
    if ('Notification' in window) {
        if (Notification.permission === 'default') {
            document.body.addEventListener('click', function requestPerm() {
                Notification.requestPermission().then(permission => {
                    console.log('Push notification permission:', permission);
                    if (permission === 'granted') {
                        scheduleDailyNotifications();
                    }
                });
                document.body.removeEventListener('click', requestPerm);
            }, { once: true });
        }
    }
}

function scheduleDailyNotifications() {
    notificationTimers.forEach(clearTimeout);
    notificationTimers = [];

    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const now = new Date();
    const todayNum = now.getDay();
    if (todayNum === 0) return; // Sunday

    const todayClasses = state.classes.filter(c => Number(c.day) === todayNum);
    const todayDateStr = now.toISOString().slice(0, 10);

    todayClasses.forEach(cls => {
        const period = state.periods.find(p => p.number === Number(cls.period));
        if (!period) return;

        const [sh, sm] = period.start.split(':').map(Number);
        const startTime = new Date();
        startTime.setHours(sh, sm, 0, 0);

        // Schedule notification for 10 minutes before class starts
        const targetTime = new Date(startTime.getTime() - 10 * 60 * 1000);
        const delay = targetTime.getTime() - now.getTime();

        if (delay > 0) {
            const timer = setTimeout(() => {
                const attended = state.history.some(h => {
                    const hDate = new Date(h.timestamp).toISOString().slice(0, 10);
                    return h.classId === cls.id && hDate === todayDateStr;
                });

                if (!attended) {
                    new Notification("出席リマインダー", {
                        body: `授業「${cls.name}」が10分後に始まります。出席登録はしましたか？`,
                        icon: 'icon-192.png'
                    });
                }
            }, delay);
            notificationTimers.push(timer);
        }
    });
}

function checkAttendanceReminders() {
    const alertBox = document.getElementById('attendance-warning-alert');
    const alertText = document.getElementById('attendance-warning-text');
    
    if (!alertBox || !alertText) return;

    const now = new Date();
    const todayNum = now.getDay();
    if (todayNum === 0) {
        alertBox.classList.add('hidden');
        return;
    }

    const todayDateStr = now.toISOString().slice(0, 10);
    const getMinutes = (t) => {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
    };
    const nowMins = now.getHours() * 60 + now.getMinutes();

    const todayClasses = state.classes.filter(c => Number(c.day) === todayNum);
    const missedClasses = [];

    todayClasses.forEach(cls => {
        const period = state.periods.find(p => p.number === Number(cls.period));
        if (!period) return;

        const startMins = getMinutes(period.start);
        
        // Alert if time is 15 mins before starting (or anytime after)
        if (nowMins >= (startMins - 15)) {
            const attended = state.history.some(h => {
                const hDate = new Date(h.timestamp).toISOString().slice(0, 10);
                return h.classId === cls.id && hDate === todayDateStr;
            });

            if (!attended) {
                missedClasses.push(cls.name);
            }
        }
    });

    if (missedClasses.length > 0) {
        alertBox.classList.remove('hidden');
        alertText.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> <strong>出席忘れ警告:</strong> ${missedClasses.join(', ')} の出席登録がまだの可能性があります。`;
    } else {
        alertBox.classList.add('hidden');
    }
}


function renderImportPreview() {
    const container = document.getElementById('import-preview-list');
    container.innerHTML = '';

    parsedClassesTemp.forEach((cls, index) => {
        const card = document.createElement('div');
        card.className = 'import-preview-card selected';
        card.setAttribute('data-index', index);
        card.innerHTML = `
            <input type="checkbox" class="import-preview-checkbox" data-index="${index}" checked>
            <div class="import-preview-info">
                <h5>${cls.name}</h5>
                <p>
                    <span><i class="fa-solid fa-calendar-day"></i> ${DAY_NAMES[cls.day]}</span>
                    <span><i class="fa-solid fa-clock"></i> ${cls.period}限</span>
                </p>
            </div>
        `;

        card.addEventListener('click', (e) => {
            const checkbox = card.querySelector('.import-preview-checkbox');
            if (e.target !== checkbox) {
                checkbox.checked = !checkbox.checked;
            }
            
            if (checkbox.checked) {
                card.classList.add('selected');
            } else {
                card.classList.remove('selected');
            }
            updateImportSubmitButtonCount();
        });

        card.querySelector('.import-preview-checkbox').addEventListener('click', (e) => {
            e.stopPropagation();
            if (e.target.checked) {
                card.classList.add('selected');
            } else {
                card.classList.remove('selected');
            }
            updateImportSubmitButtonCount();
        });

        container.appendChild(card);
    });

    updateImportSubmitButtonCount();
}

function updateImportSubmitButtonCount() {
    const checkedCount = document.querySelectorAll('.import-preview-checkbox:checked').length;
    const submitBtn = document.getElementById('btn-submit-import');
    submitBtn.textContent = `一括登録 (${checkedCount}件)`;
}

// ==========================================
// 12. HELPER FUNCTIONS FOR CONTINUOUS CLASSES & BOOKMARKLET
// ==========================================
function groupContinuousClasses(classesList) {
    if (classesList.length === 0) return [];
    
    const sorted = [...classesList].sort((a, b) => Number(a.period) - Number(b.period));
    const grouped = [];
    let currentGroup = null;

    sorted.forEach(cls => {
        const periodNum = Number(cls.period);
        if (!currentGroup) {
            currentGroup = {
                id: cls.id,
                name: cls.name,
                room: cls.room,
                urlTemplate: cls.urlTemplate,
                day: cls.day,
                startPeriod: periodNum,
                endPeriod: periodNum,
                periods: [periodNum],
                ids: [cls.id],
                classes: [cls]
            };
        } else {
            const isSameName = currentGroup.name === cls.name;
            const isContinuous = periodNum === currentGroup.endPeriod + 1;
            
            if (isSameName && isContinuous) {
                currentGroup.endPeriod = periodNum;
                currentGroup.periods.push(periodNum);
                currentGroup.ids.push(cls.id);
                currentGroup.classes.push(cls);
                if (!currentGroup.room && cls.room) currentGroup.room = cls.room;
                if (!currentGroup.urlTemplate && cls.urlTemplate) currentGroup.urlTemplate = cls.urlTemplate;
            } else {
                grouped.push(currentGroup);
                currentGroup = {
                    id: cls.id,
                    name: cls.name,
                    room: cls.room,
                    urlTemplate: cls.urlTemplate,
                    day: cls.day,
                    startPeriod: periodNum,
                    endPeriod: periodNum,
                    periods: [periodNum],
                    ids: [cls.id],
                    classes: [cls]
                };
            }
        }
    });
    if (currentGroup) {
        grouped.push(currentGroup);
    }
    return grouped;
}

function getPeriodTimeRangeStr(startPeriod, endPeriod) {
    const startP = state.periods.find(p => p.number === Number(startPeriod));
    const endP = state.periods.find(p => p.number === Number(endPeriod));
    if (startP && endP) {
        return `${startP.start}~${endP.end}`;
    } else if (startP) {
        return `${startP.start}~${startP.end}`;
    }
    return '';
}

function handleURLImport() {
    const urlParams = new URLSearchParams(window.location.search);
    const importText = urlParams.get('import_text');
    if (importText) {
        const importModal = document.getElementById('import-modal');
        const textarea = document.getElementById('import-textarea');
        const stepPaste = document.getElementById('import-step-paste');
        const stepPreview = document.getElementById('import-step-preview');
        const tabText = document.getElementById('tab-import-text');

        if (importModal && textarea && stepPaste && stepPreview && tabText) {
            textarea.value = importText;
            tabText.click();
            stepPaste.classList.remove('hidden');
            stepPreview.classList.add('hidden');
            importModal.classList.add('active');

            const parseBtn = document.getElementById('btn-parse-import');
            if (parseBtn) {
                parseBtn.click();
            }

            const newUrl = window.location.pathname;
            window.history.replaceState({}, document.title, newUrl);
        }
    }
}
