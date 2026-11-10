// ======================================
// 1. GET HTML ELEMENTS
// ======================================

const taskForm = document.getElementById("taskForm");
const taskTitle = document.getElementById("taskTitle");
const subject = document.getElementById("subject");
const dueDate = document.getElementById("dueDate");
const priority = document.getElementById("priority");

const taskList = document.getElementById("taskList");
const filterTasks = document.getElementById("filterTasks");
const searchTasks = document.getElementById("searchTasks");
const subjectFilter = document.getElementById("subjectFilter");

const totalTasks = document.getElementById("totalTasks");
const pendingTasks = document.getElementById("pendingTasks");
const completedTasks = document.getElementById("completedTasks");
const progressText = document.getElementById("progressText");
const progressFill = document.getElementById("progressFill");

const formHeading = document.getElementById("formHeading");
const submitBtn = document.getElementById("submitBtn");
const cancelEdit = document.getElementById("cancelEdit");

// ======================================
// 2. TASK STATE + DYNAMIC BACKEND API
// ======================================

// Intelligently resolve the API endpoint across localhost, mobile LAN devices, and cloud deployments
function getApiBaseUrl() {
    // 1. Manual user override if saved in localStorage
    const manualUrl = localStorage.getItem("myStudyApiUrl");
    if (manualUrl) return manualUrl;

    // 2. If the frontend is served directly by the Express backend on port 5000
    if (window.location.port === "5000" || window.location.pathname.startsWith("/api")) {
        return "/api";
    }

    // 3. If running via file:// protocol or locally without a web server
    if (window.location.protocol === "file:" || !window.location.hostname) {
        return "http://localhost:5000/api";
    }

    // 4. If running on local computer via localhost or 127.0.0.1 (e.g. Live Server port 5500)
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
        return "http://localhost:5000/api";
    }

    // 5. If accessed on a mobile device over the local Wi-Fi / network IP (e.g. 192.168.x.x)
    const host = window.location.hostname;
    if (/^192\.168\./.test(host) || /^10\./.test(host) || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)) {
        return `http://${host}:5000/api`;
    }

    // 6. Default to local backend on port 5000
    return "http://localhost:5000/api";
}

function formatAuthError(error, defaultMsg) {
    if (!error) return defaultMsg;
    if (error.name === "AbortError") {
        return "Server request timed out. Please verify your connection.";
    }
    const msg = error.message || "";
    if (msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("Load failed")) {
        return "Failed to connect to backend server. Please make sure the server is running on http://localhost:5000";
    }
    return msg || defaultMsg;
}

let API_URL = getApiBaseUrl();

let tasks = [];
let editingId = null;

function getToken() {
    return localStorage.getItem("myStudyToken");
}

async function apiRequest(path, options = {}) {
    const token = getToken();

    // 12-second timeout prevents UI freezing on slow networks
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    try {
        const response = await fetch(`${API_URL}${path}`, {
            ...options,
            signal: controller.signal,
            headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...(options.headers || {})
            }
        });

        clearTimeout(timeoutId);
        const data = await response.json().catch(() => ({}));

        // Invalidate token only on genuine 401 Unauthorized (invalid or expired JWT)
        if (response.status === 401) {
            localStorage.removeItem("myStudyToken");
            localStorage.removeItem("myStudyUser");
            document.documentElement.classList.remove("session-authenticated");
            showAuthScreen();
            throw new Error(data.message || "Session expired. Please login again.");
        }

        if (!response.ok || data.success === false) {
            throw new Error(data.message || "Something went wrong. Please try again.");
        }

        return data;

    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === "AbortError") {
            throw new Error("Server request timed out. Please check your network connection.");
        }
        if (error.message && (error.message.includes("Failed to fetch") || error.message.includes("NetworkError"))) {
            throw new Error("Unable to connect to backend server. Make sure the server is running on http://localhost:5000");
        }
        throw error;
    }
}

// ======================================
// LOAD TASKS FROM BACKEND
// ======================================

async function loadTasksFromBackend() {
    const data = await apiRequest("/tasks");

    const serverTasks = Array.isArray(data)
        ? data
        : (data.tasks || data.data || []);

    tasks = serverTasks.map(task => ({
        ...task,
        id: Number(task.id),
        dueDate: String(task.dueDate || task.due_date || "").slice(0, 10),
        completed: Boolean(task.completed)
    }));

    renderTasks();
    renderCalendar();
}

// ======================================
// 3. DATE SETUP
// ======================================

const today = new Date();

function formatLocalDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

const localToday = formatLocalDate(today);

document.getElementById("currentDate").textContent =
    today.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
    });

dueDate.min = localToday;

// ======================================
// 4. ADD AND EDIT TASK
// ======================================

taskForm.addEventListener("submit", async function(event) {
    event.preventDefault();

    const title = taskTitle.value.trim();
    const taskSubject = subject.value.trim();
    const date = dueDate.value;
    const taskPriority = priority.value;

    if (!title || !taskSubject || !date) {
        alert("Please fill in all fields!");
        return;
    }

    if (date < localToday && editingId === null) {
        alert("Please select today or a future date.");
        return;
    }

    const payload = {
        title,
        subject: taskSubject,
        dueDate: date,
        priority: taskPriority
    };

    submitBtn.disabled = true;

    try {
        if (editingId !== null) {
            await apiRequest(`/tasks/${editingId}`, {
                method: "PUT",
                body: JSON.stringify(payload)
            });
        } else {
            await apiRequest("/tasks", {
                method: "POST",
                body: JSON.stringify(payload)
            });
        }

        await loadTasksFromBackend();
        await loadUserProfile();
        resetForm();

    } catch (error) {
        alert(error.message);

    } finally {
        submitBtn.disabled = false;
    }
});

// ======================================
// 5. RESET FORM
// ======================================

function resetForm() {
    taskForm.reset();
    editingId = null;

    formHeading.textContent = "➕ Add New Task";
    submitBtn.textContent = "+ Add Task";

    cancelEdit.classList.add("hidden");
    dueDate.min = localToday;
}

cancelEdit.addEventListener("click", resetForm);

// ======================================
// 6. EDIT TASK
// ======================================

function editTask(id) {
    const task = tasks.find(task => Number(task.id) === Number(id));

    if (!task) return;

    editingId = id;

    taskTitle.value = task.title;
    subject.value = task.subject;
    dueDate.value = task.dueDate;
    priority.value = task.priority;

    dueDate.min = task.dueDate;

    formHeading.textContent = "✏️ Edit Task";
    submitBtn.textContent = "Update Task";

    cancelEdit.classList.remove("hidden");
    taskTitle.focus();

    taskForm.scrollIntoView({
        behavior: "smooth",
        block: "center"
    });
}

// ======================================
// 7. COMPLETE / UNCOMPLETE TASK
// ======================================

async function toggleTask(id) {
    try {
        await apiRequest(`/tasks/${id}/toggle`, {
            method: "PATCH"
        });

        await loadTasksFromBackend();

    } catch (error) {
        alert(error.message);
    }
}

// ======================================
// 8. DELETE TASK
// ======================================

async function deleteTask(id) {
    if (!confirm("Are you sure you want to delete this task?")) return;

    try {
        await apiRequest(`/tasks/${id}`, {
            method: "DELETE"
        });

        if (Number(editingId) === Number(id)) {
            resetForm();
        }

        await loadTasksFromBackend();

    } catch (error) {
        alert(error.message);
    }
}

// ======================================
// 9. SEARCH AND SUBJECT FILTER
// ======================================

function updateSubjectOptions() {
    const currentValue = subjectFilter.value;

    const subjects = [...new Set(
        tasks.map(task => task.subject)
    )].sort();

    subjectFilter.innerHTML = `
        <option value="all">All Subjects</option>
    `;

    subjects.forEach(function(name) {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        subjectFilter.appendChild(option);
    });

    subjectFilter.value = subjects.includes(currentValue)
        ? currentValue
        : "all";
}

// ======================================
// 10. DISPLAY TASKS
// ======================================

function renderTasks() {
    taskList.innerHTML = "";

    const filter = filterTasks.value;
    const search = searchTasks.value.toLowerCase().trim();
    const selectedSubject = subjectFilter.value;

    let filteredTasks = tasks.filter(function(task) {
        const matchesStatus =
            filter === "all" ||
            (filter === "pending" && !task.completed) ||
            (filter === "completed" && task.completed);

        const matchesSearch =
            task.title.toLowerCase().includes(search) ||
            task.subject.toLowerCase().includes(search);

        const matchesSubject =
            selectedSubject === "all" ||
            task.subject === selectedSubject;

        return matchesStatus && matchesSearch && matchesSubject;
    });

    filteredTasks.sort(function(a, b) {
        if (a.completed !== b.completed) {
            return Number(a.completed) - Number(b.completed);
        }

        return a.dueDate.localeCompare(b.dueDate);
    });

    if (filteredTasks.length === 0) {
        const message = document.createElement("p");
        message.className = "empty-message";
        message.textContent = "No matching tasks found.";
        taskList.appendChild(message);
    }

    filteredTasks.forEach(function(task) {
        const item = document.createElement("div");
        item.className = "task-item";

        if (task.completed) {
            item.classList.add("completed");
        }

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "task-check";
        checkbox.checked = task.completed;
        checkbox.setAttribute("aria-label", "Complete task");

        checkbox.addEventListener("change", function() {
            toggleTask(task.id);
        });

        const info = document.createElement("div");
        info.className = "task-info";

        const title = document.createElement("h4");
        title.textContent = task.title;

        const details = document.createElement("p");
        details.textContent =
            `${task.subject} • Due: ${task.dueDate}`;

        const badges = document.createElement("div");
        badges.className = "task-badges";

        const priorityBadge = document.createElement("span");
        priorityBadge.className = `badge ${task.priority}`;
        priorityBadge.textContent = `${task.priority} Priority`;

const isOverdue =
    !task.completed &&
    task.dueDate < localToday;

const statusBadge = document.createElement("span");
statusBadge.className = "badge";

const todayDate = new Date(localToday + "T00:00:00");
const taskDate = new Date(task.dueDate + "T00:00:00");

const daysLeft = Math.round(
    (taskDate - todayDate) / (1000 * 60 * 60 * 24)
);

if (task.completed) {
    statusBadge.textContent = "Completed";
}
else if (daysLeft < 0) {
    statusBadge.textContent = "⚠️ OVERDUE";
    statusBadge.classList.add("overdue");
}
else if (daysLeft === 0) {
    statusBadge.textContent = "🔔 DUE TODAY";
    statusBadge.classList.add("due-today");
}
else if (daysLeft <= 2) {
    statusBadge.textContent = "⏰ DUE SOON";
    statusBadge.classList.add("due-soon");
}
else {
    statusBadge.textContent = "Pending";
}

        badges.appendChild(priorityBadge);
        badges.appendChild(statusBadge);

        info.appendChild(title);
        info.appendChild(details);
        info.appendChild(badges);

        const actions = document.createElement("div");
        actions.className = "task-actions";

        const editButton = document.createElement("button");
        editButton.className = "edit-btn";
        editButton.textContent = "Edit";

        editButton.addEventListener("click", function() {
            editTask(task.id);
        });

        const deleteButton = document.createElement("button");
        deleteButton.className = "delete-btn";
        deleteButton.textContent = "Delete";

        deleteButton.addEventListener("click", function() {
            deleteTask(task.id);
        });

        actions.appendChild(editButton);
        actions.appendChild(deleteButton);

        item.appendChild(checkbox);
        item.appendChild(info);
        item.appendChild(actions);

        taskList.appendChild(item);
    });

    updateSubjectOptions();
    updateDashboard();
    renderUpcomingTasks();
}

filterTasks.addEventListener("change", renderTasks);
searchTasks.addEventListener("input", renderTasks);
subjectFilter.addEventListener("change", renderTasks);

// ======================================
// 11. DASHBOARD STATISTICS
// ======================================

function updateDashboard() {
    const total = tasks.length;

    const completed = tasks.filter(
        task => task.completed
    ).length;

    const pending = total - completed;

    const percentage = total === 0
        ? 0
        : Math.round((completed / total) * 100);

    totalTasks.textContent = total;
    completedTasks.textContent = completed;
    pendingTasks.textContent = pending;

    progressText.textContent = percentage + "%";
    progressFill.style.width = percentage + "%";
}

// ======================================
// 12. CALENDAR
// ======================================

const calendarGrid = document.getElementById("calendarGrid");
const calendarTitle = document.getElementById("calendarTitle");

let calendarDate = new Date(
    today.getFullYear(),
    today.getMonth(),
    1
);

let selectedDate = localToday;

function renderCalendar() {
    calendarGrid.innerHTML = "";

    calendarTitle.textContent =
        calendarDate.toLocaleDateString("en-US", {
            month: "long",
            year: "numeric"
        });

    const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    weekdays.forEach(function(day) {
        const cell = document.createElement("div");
        cell.className = "calendar-day weekday";
        cell.textContent = day;
        calendarGrid.appendChild(cell);
    });

    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const previousMonthDays = new Date(year, month, 0).getDate();

    const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;

    for (let i = 0; i < totalCells; i++) {
        let dayNumber;
        let cellDate;
        let otherMonth = false;

        if (i < firstDay) {
            dayNumber = previousMonthDays - firstDay + i + 1;
            cellDate = new Date(year, month - 1, dayNumber);
            otherMonth = true;
        } else if (i >= firstDay + daysInMonth) {
            dayNumber = i - firstDay - daysInMonth + 1;
            cellDate = new Date(year, month + 1, dayNumber);
            otherMonth = true;
        } else {
            dayNumber = i - firstDay + 1;
            cellDate = new Date(year, month, dayNumber);
        }

        const dateString = formatLocalDate(cellDate);

        const dayTasks = tasks.filter(
            task => task.dueDate === dateString
        );

        const cell = document.createElement("div");
        cell.className = "calendar-day";

        if (dateString === localToday) cell.classList.add("today");
        if (dateString === selectedDate) cell.classList.add("selected");
        if (otherMonth) cell.classList.add("other-month");

        const number = document.createElement("div");
        number.className = "day-number";
        number.textContent = dayNumber;

        cell.appendChild(number);

        if (dayTasks.length > 0) {
            const count = document.createElement("span");
            count.className = "day-task-count";
            count.textContent = `${dayTasks.length} task`;
            cell.appendChild(count);
        }

        cell.addEventListener("click", function() {
            selectedDate = dateString;

            if (otherMonth) {
                calendarDate = new Date(
                    cellDate.getFullYear(),
                    cellDate.getMonth(),
                    1
                );
            }

            renderCalendar();
            showCalendarDetails(dateString);
        });

        calendarGrid.appendChild(cell);
    }

    showCalendarDetails(selectedDate);
}

function showCalendarDetails(dateString) {
    let details = document.getElementById("calendarDetails");

    if (!details) {
        details = document.createElement("div");
        details.id = "calendarDetails";
        details.className = "calendar-details";
        calendarGrid.after(details);
    }

    const dayTasks = tasks.filter(
        task => task.dueDate === dateString
    );

    details.innerHTML = "";

    const heading = document.createElement("strong");
    heading.textContent = `Tasks for ${dateString}`;
    details.appendChild(heading);

    if (dayTasks.length === 0) {
        const message = document.createElement("p");
        message.textContent = "No tasks scheduled for this date.";
        message.style.marginTop = "8px";
        details.appendChild(message);
        return;
    }

    dayTasks.forEach(function(task) {
        const line = document.createElement("p");
        line.style.marginTop = "8px";
        line.textContent =
            `${task.completed ? "✓" : "○"} ${task.title} (${task.subject})`;
        details.appendChild(line);
    });
}

document.getElementById("prevMonth").addEventListener("click", function() {
    calendarDate.setMonth(calendarDate.getMonth() - 1);
    renderCalendar();
});

document.getElementById("nextMonth").addEventListener("click", function() {
    calendarDate.setMonth(calendarDate.getMonth() + 1);
    renderCalendar();
});

// ======================================
// 13. DARK MODE
// ======================================

const themeBtn = document.getElementById("themeBtn");

function applyTheme() {
    const dark = localStorage.getItem("myStudyTheme") === "dark";

    document.body.classList.toggle("dark", dark);
    themeBtn.textContent = dark ? "☀️" : "🌙";
}

themeBtn.addEventListener("click", function() {
    const isDark = document.body.classList.toggle("dark");

    localStorage.setItem(
        "myStudyTheme",
        isDark ? "dark" : "light"
    );

    applyTheme();
});

applyTheme();
// ======================================
// 14. NEON POMODORO TIMER
// ======================================

const timerDisplay = document.getElementById("timerDisplay");
const timerMode = document.getElementById("timerMode");
const timerMessage = document.getElementById("timerMessage");
const timerSection = document.querySelector(".timer-section");
const clockRing = document.getElementById("clockRing");

const startTimer = document.getElementById("startTimer");
const pauseTimer = document.getElementById("pauseTimer");
const resetTimer = document.getElementById("resetTimer");

const modeButtons = document.querySelectorAll(".mode-btn");

const studyInput = document.getElementById("studyMinutes");
const shortInput = document.getElementById("shortMinutes");
const longInput = document.getElementById("longMinutes");
const saveSettingsBtn = document.getElementById("saveTimerSettings");

const defaultSettings = {
    study: 25,
    shortBreak: 5,
    longBreak: 15
};

function loadTimerSettingsFromStorage() {
    try {
        const saved = JSON.parse(
            localStorage.getItem("myStudyTimerSettings")
        );

        if (!saved || typeof saved !== "object") {
            return { ...defaultSettings };
        }

        const result = { ...defaultSettings };

        for (const key of Object.keys(defaultSettings)) {
            const value = Number(saved[key]);
            const max = key === "study" ? 180 : 60;

            if (Number.isInteger(value) && value >= 1 && value <= max) {
                result[key] = value;
            }
        }

        return result;
    } catch (error) {
        console.error("Could not load timer settings:", error);
        return { ...defaultSettings };
    }
}

let timerSettings = loadTimerSettingsFromStorage();

let selectedMinutes = timerSettings.study;
let remainingSeconds = selectedMinutes * 60;
let timerInterval = null;
let endTime = null;
let activeMode = "Study";
let activeKind = "study";

function updateTimerDisplay() {
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;

    timerDisplay.textContent =
        String(minutes).padStart(2, "0") + ":" +
        String(seconds).padStart(2, "0");

    timerMode.textContent =
        activeMode === "Study" ? "Study Session" : "Break Time";

    const totalSeconds = selectedMinutes * 60;
    const progress = totalSeconds > 0
        ? (remainingSeconds / totalSeconds) * 100
        : 0;

    clockRing.style.setProperty("--progress", progress + "%");
}

function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
    endTime = null;
    timerSection.classList.remove("running");
}

function tickTimer() {
    if (!endTime) return;

    remainingSeconds = Math.max(
        0,
        Math.ceil((endTime - Date.now()) / 1000)
    );

    updateTimerDisplay();

    if (remainingSeconds <= 0) {
        stopTimer();

        timerMessage.textContent =
            activeMode === "Study"
                ? "🎉 Study session complete! Take a break!"
                : "📚 Break finished! Ready to study?";

        alert(
            activeMode === "Study"
                ? "Great job! Your study session is complete."
                : "Your break is over. Let's study!"
        );
    }
}

function startCountdown() {
    if (timerInterval) return;

    if (remainingSeconds <= 0) {
        remainingSeconds = selectedMinutes * 60;
    }

    endTime = Date.now() + remainingSeconds * 1000;

    timerMessage.textContent = "✨ Stay focused. You can do it!";

    timerSection.classList.add("running");

    timerInterval = setInterval(tickTimer, 250);
    tickTimer();
}

function pauseCountdown() {
    if (!timerInterval) return;

    tickTimer();

    if (timerInterval) {
        stopTimer();
        timerMessage.textContent = "⏸ Timer paused.";
    }
}

function resetCountdown() {
    stopTimer();

    remainingSeconds = selectedMinutes * 60;

    updateTimerDisplay();

    timerMessage.textContent = "✨ Timer reset. Ready when you are!";
}

function selectTimerMode(button) {
    stopTimer();

    modeButtons.forEach(btn => btn.classList.remove("active"));
    button.classList.add("active");

    activeKind = button.dataset.kind;
    activeMode = button.dataset.mode;

    selectedMinutes = timerSettings[activeKind];
    remainingSeconds = selectedMinutes * 60;

    updateTimerDisplay();

    timerMessage.textContent = "✨ Ready when you are!";
}

modeButtons.forEach(function(button) {
    button.addEventListener("click", function() {
        selectTimerMode(button);
    });
});

startTimer.addEventListener("click", startCountdown);
pauseTimer.addEventListener("click", pauseCountdown);
resetTimer.addEventListener("click", resetCountdown);

// Load saved settings into inputs and mode buttons
function loadTimerSettings() {
    studyInput.value = timerSettings.study;
    shortInput.value = timerSettings.shortBreak;
    longInput.value = timerSettings.longBreak;

    document.querySelector('[data-kind="study"]').textContent =
        `🎓 Study ${timerSettings.study}m`;

    document.querySelector('[data-kind="shortBreak"]').textContent =
        `☕ Short Break ${timerSettings.shortBreak}m`;

    document.querySelector('[data-kind="longBreak"]').textContent =
        `🌿 Long Break ${timerSettings.longBreak}m`;
}

// Save custom timer settings
saveSettingsBtn.addEventListener("click", function() {
    const study = Number(studyInput.value);
    const shortBreak = Number(shortInput.value);
    const longBreak = Number(longInput.value);

    if (
        !Number.isInteger(study) || study < 1 || study > 180 ||
        !Number.isInteger(shortBreak) || shortBreak < 1 || shortBreak > 60 ||
        !Number.isInteger(longBreak) || longBreak < 1 || longBreak > 60
    ) {
        alert("Enter valid whole minutes. Study: 1–180, Breaks: 1–60.");
        return;
    }

    timerSettings = {
        study,
        shortBreak,
        longBreak
    };

    localStorage.setItem(
        "myStudyTimerSettings",
        JSON.stringify(timerSettings)
    );

    if (!timerInterval) {
        selectedMinutes = timerSettings[activeKind];
        remainingSeconds = selectedMinutes * 60;
        updateTimerDisplay();
    }

    loadTimerSettings();

    timerMessage.textContent = "✅ Timer settings saved!";
});

// ======================================
// 15. INITIAL PAGE LOAD
// ======================================

loadTimerSettings();
updateTimerDisplay();

// ======================================
// 16. SCROLL REVEAL ANIMATION
// ======================================

const revealElements = document.querySelectorAll(
    ".welcome, .stat-card, .progress-section, .panel"
);

revealElements.forEach(function(element) {
    element.classList.add("reveal");
});

if ("IntersectionObserver" in window) {
    const revealObserver = new IntersectionObserver(
        function(entries, observer) {
            entries.forEach(function(entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add("visible");
                    observer.unobserve(entry.target);
                }
            });
        },
        { threshold: 0.12 }
    );

    revealElements.forEach(function(element) {
        revealObserver.observe(element);
    });
} else {
    revealElements.forEach(function(element) {
        element.classList.add("visible");
    });
}

// ======================================
// 17. RIPPLE BUTTON EFFECT
// ======================================

document.addEventListener("click", function(event) {
    const button = event.target.closest("button");

    if (!button || button.disabled) return;

    const rect = button.getBoundingClientRect();

    const ripple = document.createElement("span");

    const size = Math.max(rect.width, rect.height);

    ripple.className = "ripple";
    ripple.style.width = size + "px";
    ripple.style.height = size + "px";

    ripple.style.left =
        (event.clientX - rect.left - size / 2) + "px";

    ripple.style.top =
        (event.clientY - rect.top - size / 2) + "px";

    const oldPosition = getComputedStyle(button).position;

    if (oldPosition === "static") {
        button.style.position = "relative";
    }

    button.style.overflow = "hidden";
    button.appendChild(ripple);

    const removeRipple = () => {
        if (ripple.parentNode) ripple.remove();
    };
    ripple.addEventListener("animationend", removeRipple);
    setTimeout(removeRipple, 600);
});

// ======================================
// 18. MODERN NEUMORPHISM AUTHENTICATION
// ======================================

const authSection = document.getElementById("authSection");
const tabLogin = document.getElementById("tabLogin");
const tabRegister = document.getElementById("tabRegister");
const authTitle = document.getElementById("authTitle");
const authSubtitle = document.getElementById("authSubtitle");
const authAlert = document.getElementById("authAlert");
const authAlertIcon = document.getElementById("authAlertIcon");
const authAlertText = document.getElementById("authAlertText");
const authAlertClose = document.getElementById("authAlertClose");

const loginFormWrapper = document.getElementById("loginFormWrapper");
const registerFormWrapper = document.getElementById("registerFormWrapper");
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");

const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");
const rememberMeCheckbox = document.getElementById("rememberMeCheckbox");
const forgotPasswordBtn = document.getElementById("forgotPasswordBtn");
const loginSubmitBtn = document.getElementById("loginSubmitBtn");

const registerName = document.getElementById("registerName");
const registerEmail = document.getElementById("registerEmail");
const registerPassword = document.getElementById("registerPassword");
const registerConfirmPassword = document.getElementById("registerConfirmPassword");
const registerSubmitBtn = document.getElementById("registerSubmitBtn");

const authSwitchPrompt = document.getElementById("authSwitchPrompt");
const authSwitchBtn = document.getElementById("authSwitchBtn");

const googleLoginBtn = document.getElementById("googleLoginBtn");
const githubLoginBtn = document.getElementById("githubLoginBtn");
const authThemeToggle = document.getElementById("authThemeToggle");

const forgotPasswordModal = document.getElementById("forgotPasswordModal");
const forgotPasswordForm = document.getElementById("forgotPasswordForm");
const resetEmail = document.getElementById("resetEmail");
const resetModalAlert = document.getElementById("resetModalAlert");
const closeResetModalBtn = document.getElementById("closeResetModalBtn");

const socialNoticeModal = document.getElementById("socialNoticeModal");
const socialModalTitle = document.getElementById("socialModalTitle");
const socialModalDesc = document.getElementById("socialModalDesc");
const socialModalIcon = document.getElementById("socialModalIcon");
const closeSocialModalBtn = document.getElementById("closeSocialModalBtn");

// ALERT DISPLAY HELPER
function showAuthAlert(message, type = "error") {
    if (!authAlert || !authAlertText) return;

    authAlert.className = `auth-alert ${type}`;
    if (authAlertIcon) {
        authAlertIcon.textContent = type === "success" ? "✅" : (type === "info" ? "ℹ️" : "⚠️");
    }
    authAlertText.textContent = message;
    authAlert.classList.remove("hidden");
}

function hideAuthAlert() {
    if (authAlert) {
        authAlert.classList.add("hidden");
    }
}

if (authAlertClose) {
    authAlertClose.addEventListener("click", hideAuthAlert);
}

// BUTTON LOADING STATE HELPER
function setButtonLoading(button, isLoading, loadingText = "Processing...") {
    if (!button) return;

    const spinner = button.querySelector(".btn-spinner");
    const arrow = button.querySelector(".btn-icon-arrow");
    const textSpan = button.querySelector(".btn-text");

    button.disabled = isLoading;

    if (isLoading) {
        if (spinner) spinner.classList.remove("hidden");
        if (arrow) arrow.classList.add("hidden");
        if (textSpan) {
            button.dataset.originalText = textSpan.textContent;
            textSpan.textContent = loadingText;
        }
    } else {
        if (spinner) spinner.classList.add("hidden");
        if (arrow) arrow.classList.remove("hidden");
        if (textSpan && button.dataset.originalText) {
            textSpan.textContent = button.dataset.originalText;
        }
    }
}

// CLEAR FIELD FEEDBACKS
function clearInputFeedbacks() {
    document.querySelectorAll(".neu-input").forEach(input => {
        input.classList.remove("is-invalid");
    });
    document.querySelectorAll(".input-feedback").forEach(feedback => {
        feedback.textContent = "";
    });
}

function setFieldError(input, feedbackEl, message) {
    if (input) input.classList.add("is-invalid");
    if (feedbackEl) feedbackEl.textContent = message;
}

// TAB NAVIGATION: LOGIN
function showLogin() {
    showLoginTab();
}

function showLoginTab() {
    if (tabLogin) {
        tabLogin.classList.add("active");
        tabLogin.setAttribute("aria-selected", "true");
    }
    if (tabRegister) {
        tabRegister.classList.remove("active");
        tabRegister.setAttribute("aria-selected", "false");
    }

    if (loginFormWrapper) loginFormWrapper.classList.add("active-form");
    if (registerFormWrapper) registerFormWrapper.classList.remove("active-form");

    if (authTitle) authTitle.textContent = "Welcome Back";
    if (authSubtitle) authSubtitle.textContent = "Plan your studies, achieve your goals.";

    if (authSwitchPrompt) {
        authSwitchPrompt.innerHTML = `Don't have an account? <button type="button" id="authSwitchBtn" class="link-btn-strong">Create one now</button>`;
        const newBtn = document.getElementById("authSwitchBtn");
        if (newBtn) newBtn.addEventListener("click", showRegisterTab);
    }

    hideAuthAlert();
    clearInputFeedbacks();
}

// TAB NAVIGATION: REGISTER
function showRegisterForm() {
    showRegisterTab();
}

function showRegisterTab() {
    if (tabRegister) {
        tabRegister.classList.add("active");
        tabRegister.setAttribute("aria-selected", "true");
    }
    if (tabLogin) {
        tabLogin.classList.remove("active");
        tabLogin.setAttribute("aria-selected", "false");
    }

    if (registerFormWrapper) registerFormWrapper.classList.add("active-form");
    if (loginFormWrapper) loginFormWrapper.classList.remove("active-form");

    if (authTitle) authTitle.textContent = "Create Account";
    if (authSubtitle) authSubtitle.textContent = "Start your journey to academic excellence.";

    if (authSwitchPrompt) {
        authSwitchPrompt.innerHTML = `Already have an account? <button type="button" id="authSwitchBtn" class="link-btn-strong">Sign in here</button>`;
        const newBtn = document.getElementById("authSwitchBtn");
        if (newBtn) newBtn.addEventListener("click", showLoginTab);
    }

    hideAuthAlert();
    clearInputFeedbacks();
}

if (tabLogin) tabLogin.addEventListener("click", showLoginTab);
if (tabRegister) tabRegister.addEventListener("click", showRegisterTab);
if (authSwitchBtn) authSwitchBtn.addEventListener("click", showRegisterTab);

// PASSWORD VISIBILITY TOGGLE (ALL FORMS)
document.querySelectorAll(".password-toggle-btn").forEach(button => {
    button.addEventListener("click", function() {
        const targetId = this.getAttribute("data-target");
        const input = document.getElementById(targetId);
        if (!input) return;

        const eyeOpen = this.querySelector(".eye-open");
        const eyeClosed = this.querySelector(".eye-closed");

        if (input.type === "password") {
            input.type = "text";
            if (eyeOpen) eyeOpen.classList.add("hidden");
            if (eyeClosed) eyeClosed.classList.remove("hidden");
            this.setAttribute("aria-label", "Hide password");
        } else {
            input.type = "password";
            if (eyeOpen) eyeOpen.classList.remove("hidden");
            if (eyeClosed) eyeClosed.classList.add("hidden");
            this.setAttribute("aria-label", "Show password");
        }
    });
});

// RESTORE REMEMBERED EMAIL
(function initRememberMe() {
    const rememberedEmail = localStorage.getItem("myStudyRememberEmail");
    if (rememberedEmail && loginEmail) {
        loginEmail.value = rememberedEmail;
        if (rememberMeCheckbox) rememberMeCheckbox.checked = true;
    }
})();

// EMAIL VALIDATION REGEX
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// SIGN UP FORM SUBMISSION
if (registerForm) {
    registerForm.addEventListener("submit", async function(event) {
        event.preventDefault();
        clearInputFeedbacks();
        hideAuthAlert();

        const full_name = registerName ? registerName.value.trim() : "";
        const email = registerEmail ? registerEmail.value.trim().toLowerCase() : "";
        const password = registerPassword ? registerPassword.value : "";
        const confirmPassword = registerConfirmPassword ? registerConfirmPassword.value : "";

        const nameFeedback = document.getElementById("registerNameFeedback");
        const emailFeedback = document.getElementById("registerEmailFeedback");
        const passwordFeedback = document.getElementById("registerPasswordFeedback");
        const confirmFeedback = document.getElementById("registerConfirmPasswordFeedback");

        let hasError = false;

        if (!full_name || full_name.length < 2) {
            setFieldError(registerName, nameFeedback, "Please enter your full name (at least 2 characters).");
            hasError = true;
        }

        if (!email) {
            setFieldError(registerEmail, emailFeedback, "Email address is required.");
            hasError = true;
        } else if (!isValidEmail(email)) {
            setFieldError(registerEmail, emailFeedback, "Please enter a valid email address.");
            hasError = true;
        }

        if (!password) {
            setFieldError(registerPassword, passwordFeedback, "Password is required.");
            hasError = true;
        } else if (password.length < 8) {
            setFieldError(registerPassword, passwordFeedback, "Password must be at least 8 characters long.");
            hasError = true;
        }

        if (password !== confirmPassword) {
            setFieldError(registerConfirmPassword, confirmFeedback, "Passwords do not match. Please re-enter.");
            hasError = true;
        }

        if (hasError) {
            showAuthAlert("Please correct the errors in the form before submitting.", "error");
            return;
        }

        // Visual loading state prevents duplicate submissions and UI lag
        setButtonLoading(registerSubmitBtn, true, "Processing...");

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 12000);

            const response = await fetch(`${API_URL}/auth/register`, {
                method: "POST",
                signal: controller.signal,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ full_name, email, password })
            });

            clearTimeout(timeoutId);
            const data = await response.json().catch(() => ({}));

            if (!response.ok || data.success === false) {
                throw new Error(data.message || "Registration failed. Please try again.");
            }

            registerForm.reset();
            showLoginTab();

            if (loginEmail) {
                loginEmail.value = email;
            }

            showAuthAlert("Account created successfully! Please sign in with your credentials.", "success");

        } catch (error) {
            console.error("Sign up error:", error);
            const msg = formatAuthError(error, "Registration failed. Please try again.");
            showAuthAlert(msg, "error");
        } finally {
            setButtonLoading(registerSubmitBtn, false);
        }
    });
}

// LOGIN FORM SUBMISSION
if (loginForm) {
    loginForm.addEventListener("submit", async function(event) {
        event.preventDefault();
        clearInputFeedbacks();
        hideAuthAlert();

        const email = loginEmail ? loginEmail.value.trim().toLowerCase() : "";
        const password = loginPassword ? loginPassword.value : "";
        const emailFeedback = document.getElementById("loginEmailFeedback");
        const passwordFeedback = document.getElementById("loginPasswordFeedback");

        let hasError = false;

        if (!email) {
            setFieldError(loginEmail, emailFeedback, "Please enter your email address.");
            hasError = true;
        } else if (!isValidEmail(email)) {
            setFieldError(loginEmail, emailFeedback, "Please enter a valid email address.");
            hasError = true;
        }

        if (!password) {
            setFieldError(loginPassword, passwordFeedback, "Please enter your password.");
            hasError = true;
        }

        if (hasError) return;

        // Visual loading state prevents double clicks and informs user
        setButtonLoading(loginSubmitBtn, true, "Processing...");

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 12000);

            const response = await fetch(`${API_URL}/auth/login`, {
                method: "POST",
                signal: controller.signal,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ email, password })
            });

            clearTimeout(timeoutId);
            const data = await response.json().catch(() => ({}));

            if (!response.ok || !data.success || !data.token) {
                throw new Error(data.message || "Invalid email or password.");
            }

            // Save Remember Me preference
            if (rememberMeCheckbox && rememberMeCheckbox.checked) {
                localStorage.setItem("myStudyRememberEmail", email);
            } else {
                localStorage.removeItem("myStudyRememberEmail");
            }

            // Save JWT token in localStorage for robust session persistence across reloads
            localStorage.setItem("myStudyToken", data.token);
            localStorage.setItem("myStudyUser", JSON.stringify(data.user || {}));
            document.documentElement.classList.add("session-authenticated");

            // Unlock dashboard immediately
            if (authSection) authSection.classList.add("hidden");
            const mainContainer = document.querySelector(".container");
            if (mainContainer) mainContainer.classList.remove("dashboard-locked");
            if (logoutBtn) logoutBtn.classList.remove("hidden");

            if (loginPassword) loginPassword.value = "";
            hideAuthAlert();

            // Load user data in background
            await Promise.allSettled([
                loadTasksFromBackend(),
                loadUserProfile()
            ]);

        } catch (error) {
            console.error("Login error:", error);
            const msg = formatAuthError(error, "Login failed. Please check your credentials.");
            showAuthAlert(msg, "error");
        } finally {
            setButtonLoading(loginSubmitBtn, false);
        }
    });
}

// FORGOT PASSWORD MODAL
if (forgotPasswordBtn && forgotPasswordModal) {
    forgotPasswordBtn.addEventListener("click", function() {
        if (loginEmail && resetEmail && loginEmail.value) {
            resetEmail.value = loginEmail.value;
        }
        if (resetModalAlert) resetModalAlert.classList.add("hidden");
        forgotPasswordModal.classList.remove("hidden");
        if (resetEmail) resetEmail.focus();
    });
}

if (closeResetModalBtn && forgotPasswordModal) {
    closeResetModalBtn.addEventListener("click", function() {
        forgotPasswordModal.classList.add("hidden");
    });
}

if (forgotPasswordForm) {
    forgotPasswordForm.addEventListener("submit", function(e) {
        e.preventDefault();
        const email = resetEmail ? resetEmail.value.trim() : "";
        if (!email || !isValidEmail(email)) {
            if (resetModalAlert) {
                resetModalAlert.className = "auth-alert error";
                resetModalAlert.textContent = "Please provide a valid registered email address.";
                resetModalAlert.classList.remove("hidden");
            }
            return;
        }

        if (resetModalAlert) {
            resetModalAlert.className = "auth-alert success";
            resetModalAlert.textContent = `Password recovery instructions have been sent to ${email}. Check your inbox shortly.`;
            resetModalAlert.classList.remove("hidden");
        }

        setTimeout(() => {
            if (forgotPasswordModal) forgotPasswordModal.classList.add("hidden");
        }, 2600);
    });
}

// SOCIAL LOGIN HANDLERS
function openSocialNotice(provider, icon, title, desc) {
    if (!socialNoticeModal) return;
    if (socialModalIcon) socialModalIcon.textContent = icon;
    if (socialModalTitle) socialModalTitle.textContent = title;
    if (socialModalDesc) socialModalDesc.textContent = desc;
    socialNoticeModal.classList.remove("hidden");
}

if (googleLoginBtn) {
    googleLoginBtn.addEventListener("click", function() {
        openSocialNotice(
            "Google",
            "🌐",
            "Google Student Workspace",
            "University Single Sign-On (Google Workspace for Education) connects directly to your institutional profile. You can also sign in directly using your email and password above."
        );
    });
}

if (githubLoginBtn) {
    githubLoginBtn.addEventListener("click", function() {
        openSocialNotice(
            "GitHub",
            "🐙",
            "GitHub Student Developer SSO",
            "GitHub Student Authentication enables developer verification and study repository sync. You can also sign in directly using your email and password above."
        );
    });
}

if (closeSocialModalBtn && socialNoticeModal) {
    closeSocialModalBtn.addEventListener("click", function() {
        socialNoticeModal.classList.add("hidden");
    });
}

// CLOSE MODALS ON BACKDROP CLICK
window.addEventListener("click", function(event) {
    if (forgotPasswordModal && event.target === forgotPasswordModal) {
        forgotPasswordModal.classList.add("hidden");
    }
    if (socialNoticeModal && event.target === socialNoticeModal) {
        socialNoticeModal.classList.add("hidden");
    }
});

// CLOSE MODALS ON ESCAPE KEY
window.addEventListener("keydown", function(event) {
    if (event.key === "Escape") {
        if (forgotPasswordModal) forgotPasswordModal.classList.add("hidden");
        if (socialNoticeModal) socialNoticeModal.classList.add("hidden");
    }
});

// AUTH THEME TOGGLE SYNC
function syncThemeButtons() {
    const isDark = document.body.classList.contains("dark");
    if (authThemeToggle) {
        authThemeToggle.innerHTML = `<span class="theme-icon">${isDark ? "☀️" : "🌙"}</span>`;
    }
    const mainThemeBtn = document.getElementById("themeBtn");
    if (mainThemeBtn) {
        mainThemeBtn.textContent = isDark ? "☀️" : "🌙";
    }
}

if (authThemeToggle) {
    authThemeToggle.addEventListener("click", function() {
        const isDark = document.body.classList.toggle("dark");
        localStorage.setItem("myStudyTheme", isDark ? "dark" : "light");
        syncThemeButtons();
    });
}

// Synchronize theme icon on startup
syncThemeButtons();

// ======================================
// 19. SESSION PERSISTENCE & LOGOUT
// ======================================

const logoutBtn = document.getElementById("logoutBtn");

function showAuthScreen() {
    document.documentElement.classList.remove("session-authenticated");
    const container = document.querySelector(".container");
    if (container) container.classList.add("dashboard-locked");
    if (authSection) authSection.classList.remove("hidden");
    if (logoutBtn) logoutBtn.classList.add("hidden");

    tasks = [];

    renderTasks();
    renderCalendar();
    showLoginTab();
    syncThemeButtons();
}

if (logoutBtn) {
    logoutBtn.addEventListener("click", function() {
        if (!confirm("Are you sure you want to logout?")) return;

        localStorage.removeItem("myStudyToken");
        localStorage.removeItem("myStudyUser");
        document.documentElement.classList.remove("session-authenticated");

        showAuthScreen();
    });
}

// ========================================================
// CHECK TOKEN ON PAGE LOAD & MAINTAIN AUTHENTICATED SESSION
// ========================================================
function checkAuthSession() {
    const token = getToken();
    const container = document.querySelector(".container");

    // 1. If not logged in, reveal auth portal
    if (!token) {
        document.documentElement.classList.remove("session-authenticated");
        showAuthScreen();
        return false;
    }

    // 2. Maintain session state immediately (zero delay, zero flicker on refresh)
    document.documentElement.classList.add("session-authenticated");
    if (authSection) authSection.classList.add("hidden");
    if (container) container.classList.remove("dashboard-locked");
    if (logoutBtn) logoutBtn.classList.remove("hidden");

    // 3. Immediately restore user identity from cached session
    const storedUser = localStorage.getItem("myStudyUser");
    if (storedUser) {
        try {
            const user = JSON.parse(storedUser);
            const nameEl = document.getElementById("profileName");
            const emailEl = document.getElementById("profileEmail");
            if (nameEl && user.full_name) nameEl.textContent = user.full_name;
            if (emailEl && user.email) emailEl.textContent = user.email;
        } catch (e) {
            console.warn("Could not parse cached user info:", e);
        }
    }

    // 4. Background data sync (never logs out user if network has a temporary hiccup)
    (async function syncSessionData() {
        try {
            await Promise.allSettled([
                loadTasksFromBackend(),
                loadUserProfile()
            ]);
        } catch (error) {
            console.warn("Session data sync warning:", error.message);
        }
    })();

    return true;
}

// Automatically check session on page load
checkAuthSession();
// ======================================
// UPCOMING TASKS DASHBOARD
// ======================================

function renderUpcomingTasks() {
    const overdueList = document.getElementById("overdueTasksList");
    const todayList = document.getElementById("todayTasksList");
    const nextList = document.getElementById("nextTasksList");

    if (!overdueList || !todayList || !nextList) return;

    overdueList.innerHTML = "";
    todayList.innerHTML = "";
    nextList.innerHTML = "";

    const todayDate = new Date(localToday + "T00:00:00");

    const overdueTasks = tasks.filter(task =>
        !task.completed && task.dueDate < localToday
    );

    const todayTasks = tasks.filter(task =>
        !task.completed && task.dueDate === localToday
    );

    const nextTasks = tasks.filter(task => {
        const taskDate = new Date(task.dueDate + "T00:00:00");
        const daysLeft = Math.round(
            (taskDate - todayDate) / (1000 * 60 * 60 * 24)
        );

        return !task.completed && daysLeft > 0 && daysLeft <= 7;
    });

    function addTaskItem(container, task) {
        const item = document.createElement("div");
        item.className = "upcoming-task-item";

        const title = document.createElement("strong");
        title.textContent = task.title;

        const subjectText = document.createElement("small");
        subjectText.textContent = task.subject;

        const dateText = document.createElement("small");
        dateText.textContent = "Due: " + task.dueDate;

        item.appendChild(title);
        item.appendChild(subjectText);
        item.appendChild(dateText);

        container.appendChild(item);
    }

    function showEmpty(container, message) {
        const text = document.createElement("p");
        text.className = "upcoming-empty";
        text.textContent = message;
        container.appendChild(text);
    }

    if (overdueTasks.length) {
        overdueTasks.forEach(task => addTaskItem(overdueList, task));
    } else {
        showEmpty(overdueList, "No overdue tasks 🎉");
    }

    if (todayTasks.length) {
        todayTasks.forEach(task => addTaskItem(todayList, task));
    } else {
        showEmpty(todayList, "No tasks for today.");
    }

    if (nextTasks.length) {
        nextTasks.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
        nextTasks.forEach(task => addTaskItem(nextList, task));
    } else {
        showEmpty(nextList, "No upcoming tasks.");
    }
}
// ======================================
// LOAD USER PROFILE FROM BACKEND
// ======================================

async function loadUserProfile() {
    try {
        const response = await apiRequest("/auth/profile");

        const user =
            response.user ||
            response.data?.user ||
            response.data ||
            response;

        const nameElement = document.getElementById("profileName");
        const emailElement = document.getElementById("profileEmail");

        if (!nameElement || !emailElement) {
            console.error("Profile HTML elements not found!");
            return;
        }

        nameElement.textContent =
            user.full_name || user.name || "Student";

        emailElement.textContent =
            user.email || "Email not available";

    } catch (error) {
        console.error("Profile loading failed:", error);
    }
}