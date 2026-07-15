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
    // Set initial selected timeline day (today, fallback Sunday[0] to Monday[1])
    let today = new Date().getDay();
    state.selectedTimelineDay = today === 0 ? 1 : today;

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

    // Setup home timeline day tabs
    setupTimelineTabs();

    // Render timeline classes
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
        
        // Update date label on home screen if exists
        if (todayDateString) {
            const month = now.getMonth() + 1;
            const date = now.getDate();
            const dayName = DAY_NAMES[now.getDay()];
            todayDateString.textContent = `${month}月${date}日 (${dayName.charAt(0)})`;
        }
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
    
    if (info && info.classData) {
        currentActiveTargetClass = info.classData;
    } else {
        currentActiveTargetClass = null;
    }

    // Refresh the new timeline view to update ongoing highlight indicator
    renderTodayClasses();

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

function setupTimelineTabs() {
    const tabsContainer = document.getElementById('timeline-day-tabs');
    if (!tabsContainer) return;

    const tabs = tabsContainer.querySelectorAll('.timeline-tab-card');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            const dayNum = Number(tab.getAttribute('data-day'));
            state.selectedTimelineDay = dayNum;
            renderTodayClasses();
        });
    });

    updateTimelineDayCounts();
}

function updateTimelineDayCounts() {
    for (let day = 1; day <= 6; day++) {
        const countBadge = document.getElementById(`count-day-${day}`);
        if (countBadge) {
            const count = state.classes.filter(c => Number(c.day) === day).length;
            countBadge.textContent = `${count}コマ`;
        }
    }

    const tabsContainer = document.getElementById('timeline-day-tabs');
    if (tabsContainer) {
        const tabs = tabsContainer.querySelectorAll('.timeline-tab-card');
        tabs.forEach(tab => {
            tab.classList.remove('active');
            if (Number(tab.getAttribute('data-day')) === state.selectedTimelineDay) {
                tab.classList.add('active');
            }
        });
    }
}

function isPeriodOngoing(startPeriodNum, endPeriodNum, dayNum) {
    const now = new Date();
    const currentDay = now.getDay();
    if (currentDay !== dayNum) return false;

    const startP = state.periods.find(p => p.number === Number(startPeriodNum));
    const endP = state.periods.find(p => p.number === Number(endPeriodNum));
    if (!startP) return false;

    const currentStr = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    const startTime = startP.start;
    const endTime = endP ? endP.end : startP.end;

    return currentStr >= startTime && currentStr <= endTime;
}

function renderTodayClasses() {
    const container = document.getElementById('timeline-classes-list');
    if (!container) return;

    // Keep tabs active and counts synchronized
    updateTimelineDayCounts();

    const selectedDay = state.selectedTimelineDay || 1;
    const dayClasses = state.classes.filter(c => Number(c.day) === selectedDay);
    
    // Sort classes by period number
    dayClasses.sort((a, b) => Number(a.period) - Number(b.period));
    const groupedDayClasses = groupContinuousClasses(dayClasses);

    container.innerHTML = '';

    // Walk through all configured periods and render classes/empty slots in order
    const sortedPeriods = [...state.periods].sort((a, b) => a.number - b.number);
    const renderedGroupIds = new Set();

    sortedPeriods.forEach(p => {
        // Find if this period number is covered by any grouped class
        const targetGroup = groupedDayClasses.find(g => g.periods.includes(p.number));

        if (targetGroup) {
            // Render class card (only once per group to handle continuous classes)
            if (!renderedGroupIds.has(targetGroup.id)) {
                renderedGroupIds.add(targetGroup.id);

                const isGrouped = targetGroup.periods.length > 1;
                const periodText = isGrouped ? `${targetGroup.startPeriod}-${targetGroup.endPeriod}` : `${targetGroup.startPeriod}`;
                const timeStr = getPeriodTimeRangeStr(targetGroup.startPeriod, targetGroup.endPeriod);
                const mainCls = targetGroup.classes[0];
                
                const isOngoing = isPeriodOngoing(targetGroup.startPeriod, targetGroup.endPeriod, selectedDay);
                const semesterBadgeHtml = getSemesterBadgeHtml(mainCls.semester);

                const card = document.createElement('div');
                card.className = `timeline-card ${isOngoing ? 'ongoing' : ''}`;
                card.innerHTML = `
                    <div class="timeline-left">
                        <div class="timeline-period-badge">${periodText}限</div>
                        <div class="timeline-time-str">${timeStr}</div>
                        ${isOngoing ? '<div class="timeline-ongoing-badge">進行中</div>' : ''}
                        <div class="timeline-line-container">
                            <div class="timeline-line-dot"></div>
                        </div>
                    </div>
                    <div class="timeline-right">
                        <div class="timeline-class-title-tag">
                            <i class="fa-solid fa-book"></i> ${targetGroup.name} ${semesterBadgeHtml}
                        </div>
                        <div class="timeline-meta-row">
                            <i class="fa-solid fa-user"></i>
                            <span>担当：${mainCls.teacher || '未登録'}</span>
                        </div>
                        <div class="timeline-meta-row">
                            <i class="fa-solid fa-location-dot"></i>
                            <span>教室：${mainCls.room || '未登録'}</span>
                        </div>
                    </div>
                `;

                // Add card click listener
                card.addEventListener('click', () => {
                    const historyForClass = state.history.filter(h => h.classId === mainCls.id);
                    const targetUrl = mainCls.urlTemplate || (historyForClass.length > 0 ? historyForClass[0].url : null);
                    
                    if (targetUrl) {
                        recordAttendance(mainCls.id, mainCls.name, targetUrl);
                        window.open(targetUrl, '_blank');
                    } else {
                        alert(`「${mainCls.name}」の出席用URLが登録されていません。編集画面を開きますので、URLを登録してください。`);
                        openEditClassModal(mainCls.id);
                    }
                });

                container.appendChild(card);
            }
        } else {
            // Render empty period slot (授業なし)
            const emptyCard = document.createElement('div');
            emptyCard.className = 'timeline-card empty-timeline';
            emptyCard.innerHTML = `
                <div class="timeline-left">
                    <div class="timeline-period-badge">${p.number}限</div>
                    <div class="timeline-time-str">${p.start}~${p.end}</div>
                    <div class="timeline-line-container">
                        <div class="timeline-line-dot"></div>
                    </div>
                </div>
                <div class="timeline-right">
                    <div class="timeline-empty-message">
                        <i class="fa-solid fa-bed"></i>
                        <span>💤 このコマは授業なし</span>
                    </div>
                </div>
            `;

            // Click empty period to quick-add class
            emptyCard.addEventListener('click', () => {
                openAddClassModal(selectedDay, p.number);
            });

            container.appendChild(emptyCard);
        }
    });

    if (state.periods.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-circle-info"></i>
                <p>設定画面から時間割の校時（時限データ）を追加してください</p>
            </div>
        `;
    }
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
    container.innerHTML = '';

    const dayClasses = state.classes.filter(c => Number(c.day) === currentTimetableTabDay);
    dayClasses.sort((a, b) => Number(a.period) - Number(b.period));
    const groupedDayClasses = groupContinuousClasses(dayClasses);

    // Track which periods are already rendered as part of grouped classes
    const renderedPeriods = new Set();

    // Sort periods config to ensure we loop from 1限 upwards
    const sortedPeriods = [...state.periods].sort((a, b) => a.number - b.number);

    if (sortedPeriods.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-folder-open"></i>
                <p>時限設定が登録されていません</p>
            </div>
        `;
        return;
    }

    sortedPeriods.forEach(period => {
        const periodNum = period.number;
        
        // Skip if this period was already rendered (e.g. as 2nd period of a 1-2 group)
        if (renderedPeriods.has(periodNum)) return;

        // Check if there is a class at this period
        const cls = groupedDayClasses.find(c => c.periods.includes(periodNum));

        if (cls) {
            // Render class card (Has Class - Double Size)
            const isGrouped = cls.periods.length > 1;
            const periodBadgeText = isGrouped ? `${cls.startPeriod}-${cls.endPeriod}` : `${cls.startPeriod}`;
            const timeStr = getPeriodTimeRangeStr(cls.startPeriod, cls.endPeriod);
            const semesterBadgeHtml = getSemesterBadgeHtml(cls.classes[0].semester);

            const card = document.createElement('div');
            card.className = 'class-card has-class'; // Size doubling
            card.innerHTML = `
                <div class="class-card-left">
                    <div class="period-badge">
                        <span>${periodBadgeText}</span>
                        <small>限</small>
                    </div>
                    <div class="class-info">
                        <h4>${cls.name}${semesterBadgeHtml}</h4>
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

            // Mark all periods in this class group as rendered
            cls.periods.forEach(p => renderedPeriods.add(p));
        } else {
            // Render empty class card (No Class - Compact Size)
            const card = document.createElement('div');
            card.className = 'class-card empty-class';
            card.innerHTML = `
                <div class="class-card-left">
                    <div class="period-badge">
                        <span>${periodNum}</span>
                        <small>限</small>
                    </div>
                    <div class="class-info">
                        <h4>授業なし (空きコマ)</h4>
                        <p>
                            <span><i class="fa-solid fa-clock"></i> ${period.start}~${period.end}</span>
                        </p>
                    </div>
                </div>
                <div class="class-card-right">
                    <i class="fa-solid fa-plus text-muted" style="font-size: 0.8rem;"></i>
                </div>
            `;

            // Tap empty period to add a new class directly preset to this day & period
            card.addEventListener('click', () => {
                openAddClassModal(currentTimetableTabDay, periodNum);
            });

            container.appendChild(card);
        }
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
        const semester = document.getElementById('form-class-semester').value;
        const day = Number(document.getElementById('form-class-day').value);
        const period = Number(document.getElementById('form-class-period').value);
        const teacher = document.getElementById('form-class-teacher').value.trim();
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
                state.classes[index] = { id, name, semester, day, period, teacher, room, urlTemplate, memo };
            }
        } else {
            // Create new
            const newClass = {
                id: 'class-' + Date.now().toString(36),
                name, semester, day, period, teacher, room, urlTemplate, memo
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

function openAddClassModal(defaultDay = 1, defaultPeriod = null) {
    classForm.reset();
    document.getElementById('form-class-id').value = '';
    document.getElementById('modal-title').textContent = '授業の追加';
    document.getElementById('form-class-day').value = defaultDay;
    document.getElementById('form-class-semester').value = '前期';
    document.getElementById('form-class-teacher').value = '';
    
    // Dynamically update period choices
    updateClassPeriodSelect(defaultPeriod);
    
    document.getElementById('btn-delete-class').classList.add('hidden');
    classModal.classList.add('active');
}

function openEditClassModal(classId) {
    const cls = state.classes.find(c => c.id === classId);
    if (!cls) return;

    document.getElementById('form-class-id').value = cls.id;
    document.getElementById('form-class-name').value = cls.name;
    document.getElementById('form-class-semester').value = cls.semester || '前期';
    document.getElementById('form-class-day').value = cls.day;
    
    // Dynamically update period choices
    updateClassPeriodSelect(cls.period);
    
    document.getElementById('form-class-teacher').value = cls.teacher || '';
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
    const btnQuickScan = document.getElementById('btn-quick-scan');
    if (btnQuickScan) {
        btnQuickScan.addEventListener('click', () => {
            const activeInfo = getCurrentPeriodClass();
            startScanning(activeInfo ? activeInfo.classData : null);
        });
    }

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

            // Camera Zoom Capabilities Resolution
            const track = mediaStream.getVideoTracks()[0];
            if (track && typeof track.getCapabilities === 'function') {
                const capabilities = track.getCapabilities();
                if (capabilities.zoom) {
                    const zoomContainer = document.getElementById('camera-zoom-container');
                    const zoomSlider = document.getElementById('camera-zoom-slider');
                    const zoomLabel = document.getElementById('camera-zoom-label');
                    
                    if (zoomContainer && zoomSlider && zoomLabel) {
                        zoomSlider.min = capabilities.zoom.min || 1;
                        zoomSlider.max = capabilities.zoom.max || 5;
                        zoomSlider.step = capabilities.zoom.step || 0.1;
                        zoomSlider.value = 1.0; // Reset zoom to 1.0x on start
                        zoomLabel.textContent = "1.0x";
                        
                        zoomContainer.classList.remove('hidden');
                        
                        zoomSlider.oninput = function(e) {
                            const val = parseFloat(e.target.value);
                            zoomLabel.textContent = `${val.toFixed(1)}x`;
                            track.applyConstraints({
                                advanced: [{ zoom: val }]
                            }).catch(err => {
                                console.warn("Failed to apply zoom constraints:", err);
                            });
                        };
                    }
                }
            }
            
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

    // Hide and clean up zoom control
    const zoomContainer = document.getElementById('camera-zoom-container');
    const zoomSlider = document.getElementById('camera-zoom-slider');
    if (zoomContainer) {
        zoomContainer.classList.add('hidden');
    }
    if (zoomSlider) {
        zoomSlider.oninput = null;
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
                semester: cls.semester,
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
                if (!currentGroup.semester && cls.semester) currentGroup.semester = cls.semester;
            } else {
                grouped.push(currentGroup);
                currentGroup = {
                    id: cls.id,
                    name: cls.name,
                    room: cls.room,
                    urlTemplate: cls.urlTemplate,
                    semester: cls.semester,
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

// Base64 UTF-8 decode helper
function decodeBase64Utf8(str) {
    return decodeURIComponent(escape(atob(str)));
}

function handleURLImport() {
    const urlParams = new URLSearchParams(window.location.search);
    const importText = urlParams.get('import_text');
    const importJson = urlParams.get('import_json');

    if (importJson) {
        try {
            const jsonText = decodeBase64Utf8(importJson.replace(/\s/g, ''));
            const importedClasses = JSON.parse(jsonText);
            
            if (Array.isArray(importedClasses) && importedClasses.length > 0) {
                const importModal = document.getElementById('import-modal');
                const stepPaste = document.getElementById('import-step-paste');
                const stepPreview = document.getElementById('import-step-preview');
                
                if (importModal && stepPaste && stepPreview) {
                    parsedClassesTemp = importedClasses;
                    renderImportPreview();
                    stepPaste.classList.add('hidden');
                    stepPreview.classList.remove('hidden');
                    importModal.classList.add('active');

                    // Clear URL params
                    const newUrl = window.location.pathname;
                    window.history.replaceState({}, document.title, newUrl);
                    return;
                }
            }
        } catch (err) {
            console.error('Failed to parse import_json:', err);
            alert('時間割データの読み込みに失敗しました。データが破損している可能性があります。');
        }
    }

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

function getSemesterBadgeHtml(semester) {
    if (!semester) return '';
    let badgeClass = 'semester-zenki';
    if (semester === '後期') badgeClass = 'semester-koki';
    if (semester === '通年') badgeClass = 'semester-tsunen';
    return `<span class="semester-badge ${badgeClass}">${semester}</span>`;
}


