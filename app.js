// =========================================================
// Firebase Configuration — Real-Time Cloud Sync
// =========================================================
// This uses a FREE Firebase Realtime Database for instant
// cross-device syncing. Data is stored in the cloud and
// automatically pushed to every connected device.
// =========================================================

const firebaseConfig = {
    apiKey: "AIzaSyBtuitionhub-demo-key-placeholder",
    authDomain: "tuitionhub-sync.firebaseapp.com",
    databaseURL: "https://tuitionhub-sync-default-rtdb.firebaseio.com",
    projectId: "tuitionhub-sync",
    storageBucket: "tuitionhub-sync.appspot.com",
    messagingSenderId: "000000000000",
    appId: "1:000000000000:web:0000000000000000000000"
};

// Initialize Firebase
let firebaseApp = null;
let database = null;
let dbRef = null;
let isFirebaseConnected = false;

try {
    firebaseApp = firebase.initializeApp(firebaseConfig);
    database = firebase.database();
    dbRef = database.ref('tuitionhub');

    // Monitor connection state
    const connectedRef = database.ref('.info/connected');
    connectedRef.on('value', (snap) => {
        if (snap.val() === true) {
            isFirebaseConnected = true;
            app.updateSyncStatus('connected');
        } else {
            isFirebaseConnected = false;
            app.updateSyncStatus('disconnected');
        }
    });
} catch (error) {
    console.warn('Firebase initialization failed. Using local storage only.', error);
    isFirebaseConnected = false;
}

// =========================================================
// Core App Logic with Cloud Sync
// =========================================================
const app = {
    data: {
        students: [],
        attendance: {},
        fees: {}
    },

    syncTimeout: null,
    isListeningToFirebase: false,
    lastSyncTime: null,

    init() {
        this.loadData();
        this.bindEvents();
        this.navigate('dashboard');
        this.startFirebaseListener();

        // Default attendance date to today
        document.getElementById('attendance-date').valueAsDate = new Date();
    },

    // --- Sync Status UI ---
    updateSyncStatus(status) {
        const syncStatus = document.getElementById('sync-status');
        const sidebarSync = document.getElementById('sidebar-sync');
        const syncBadge = document.getElementById('sync-badge');

        syncStatus.className = 'sync-status';

        if (status === 'connected') {
            syncStatus.classList.add('connected');
            syncStatus.innerHTML = '<div class="sync-dot"></div><span>Cloud Connected</span>';
            if (sidebarSync) {
                sidebarSync.innerHTML = '<ion-icon name="cloud-done-outline"></ion-icon><span>Cloud Synced</span>';
                sidebarSync.className = 'sidebar-sync connected';
            }
            if (syncBadge) {
                syncBadge.classList.add('active');
                syncBadge.innerHTML = '<ion-icon name="cloud-done-outline"></ion-icon><span>Live Sync</span>';
            }
        } else if (status === 'syncing') {
            syncStatus.classList.add('syncing');
            syncStatus.innerHTML = '<div class="sync-dot"></div><span>Syncing...</span>';
            if (sidebarSync) {
                sidebarSync.innerHTML = '<ion-icon name="sync-outline"></ion-icon><span>Syncing...</span>';
                sidebarSync.className = 'sidebar-sync syncing';
            }
        } else if (status === 'disconnected') {
            syncStatus.classList.add('disconnected');
            syncStatus.innerHTML = '<div class="sync-dot"></div><span>Offline — Saved Locally</span>';
            if (sidebarSync) {
                sidebarSync.innerHTML = '<ion-icon name="cloud-offline-outline"></ion-icon><span>Offline Mode</span>';
                sidebarSync.className = 'sidebar-sync disconnected';
            }
            if (syncBadge) {
                syncBadge.classList.remove('active');
                syncBadge.innerHTML = '<ion-icon name="cloud-offline-outline"></ion-icon><span>Offline</span>';
            }
        }

        // Auto-hide the floating indicator after 3s when connected
        if (status === 'connected') {
            setTimeout(() => {
                syncStatus.classList.add('hide');
            }, 3000);
        }
    },

    updateLastSyncTime() {
        this.lastSyncTime = new Date();
        const el = document.getElementById('last-sync-time');
        if (el) {
            el.textContent = this.lastSyncTime.toLocaleTimeString();
        }
    },

    // --- Data Management with Cloud Sync ---
    loadData() {
        // First, load from localStorage as immediate cache
        const stored = localStorage.getItem('tuitionAppData');
        if (stored) {
            this.data = JSON.parse(stored);
            if (!this.data.students) this.data.students = [];
            if (!this.data.attendance) this.data.attendance = {};
            if (!this.data.fees) this.data.fees = {};
        }
    },

    saveData() {
        // 1. Always save to localStorage (immediate, offline-safe)
        localStorage.setItem('tuitionAppData', JSON.stringify(this.data));

        // 2. Push to Firebase (cloud sync)
        this.pushToFirebase();

        // 3. Update UI
        this.updateDashboard();
    },

    // Push data to Firebase cloud
    pushToFirebase() {
        if (!dbRef || !isFirebaseConnected) return;

        this.updateSyncStatus('syncing');

        // Debounce Firebase writes to avoid excessive writes
        clearTimeout(this.syncTimeout);
        this.syncTimeout = setTimeout(() => {
            dbRef.set(this.data)
                .then(() => {
                    this.updateSyncStatus('connected');
                    this.updateLastSyncTime();
                    this.showToast('✅ Synced to cloud');
                })
                .catch((error) => {
                    console.error('Firebase write error:', error);
                    this.updateSyncStatus('disconnected');
                    this.showToast('⚠️ Sync failed — saved locally');
                });
        }, 500);
    },

    // Listen for real-time changes from Firebase (from other devices)
    startFirebaseListener() {
        if (!dbRef) return;

        dbRef.on('value', (snapshot) => {
            const cloudData = snapshot.val();
            if (!cloudData) return;

            // Merge cloud data (cloud wins for conflicts)
            const localTimestamp = localStorage.getItem('tuitionAppLastWrite');

            this.data = {
                students: cloudData.students || [],
                attendance: cloudData.attendance || {},
                fees: cloudData.fees || {}
            };

            // Save to local cache
            localStorage.setItem('tuitionAppData', JSON.stringify(this.data));

            // Update all UI views
            this.refreshAllViews();
            this.updateSyncStatus('connected');
            this.updateLastSyncTime();
        }, (error) => {
            console.error('Firebase read error:', error);
            this.updateSyncStatus('disconnected');
        });

        this.isListeningToFirebase = true;
    },

    // Refresh all currently visible views
    refreshAllViews() {
        const activePage = document.querySelector('.page.active');
        if (!activePage) return;

        const pageId = activePage.id;
        if (pageId === 'dashboard') this.updateDashboard();
        if (pageId === 'students') this.renderStudents();
        if (pageId === 'attendance') this.renderAttendance();
        if (pageId === 'fees') this.renderFees();
    },

    // --- Navigation ---
    navigate(pageId) {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.getElementById(pageId).classList.add('active');

        document.querySelectorAll('.nav-links li').forEach(li => {
            li.classList.toggle('active', li.dataset.target === pageId);
        });

        if (pageId === 'dashboard') this.updateDashboard();
        if (pageId === 'students') this.renderStudents();
        if (pageId === 'attendance') this.renderAttendance();
        if (pageId === 'fees') this.renderFees();
    },

    bindEvents() {
        // Navigation links
        document.querySelectorAll('.nav-links li').forEach(li => {
            li.addEventListener('click', () => this.navigate(li.dataset.target));
        });

        // Modals
        document.getElementById('btn-add-student').addEventListener('click', () => this.openStudentModal());
        document.getElementById('close-modal').addEventListener('click', () => this.closeStudentModal());

        // Forms
        document.getElementById('student-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveStudent();
        });

        // Attendance date change
        document.getElementById('attendance-date').addEventListener('change', () => {
            this.renderAttendance();
        });

        // Close modal on overlay click
        document.getElementById('student-modal').addEventListener('click', (e) => {
            if (e.target.id === 'student-modal') {
                this.closeStudentModal();
            }
        });
    },

    // --- UI Helpers ---
    showToast(message) {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },

    // --- Dashboard ---
    updateDashboard() {
        document.getElementById('stat-total-students').textContent = this.data.students.length;

        const todayStr = new Date().toISOString().split('T')[0];
        const todayAtt = this.data.attendance[todayStr] || {};
        const presentCount = Object.values(todayAtt).filter(s => s === 'present').length;
        document.getElementById('stat-present-today').textContent = presentCount;

        const currentMonth = new Date().toISOString().slice(0, 7);
        const pendingCount = this.data.students.filter(student => {
            const lastPaid = this.data.fees[student.id]?.lastPaidMonth;
            return lastPaid !== currentMonth;
        }).length;

        document.getElementById('stat-pending-fees').textContent = pendingCount;
    },

    // --- Students ---
    openStudentModal(student = null) {
        const form = document.getElementById('student-form');
        form.reset();

        if (student) {
            document.getElementById('student-id').value = student.id;
            document.getElementById('student-name').value = student.name;
            document.getElementById('student-phone').value = student.phone;
            document.getElementById('student-fee').value = student.feeAmount;
        } else {
            document.getElementById('student-id').value = '';
        }

        document.getElementById('student-modal').classList.add('active');
    },

    closeStudentModal() {
        document.getElementById('student-modal').classList.remove('active');
    },

    saveStudent() {
        const idInput = document.getElementById('student-id').value;
        const name = document.getElementById('student-name').value;
        const phone = document.getElementById('student-phone').value;
        const feeAmount = document.getElementById('student-fee').value;

        if (idInput) {
            const index = this.data.students.findIndex(s => s.id === idInput);
            if (index > -1) {
                this.data.students[index] = { ...this.data.students[index], name, phone, feeAmount };
                this.showToast('Student updated — syncing...');
            }
        } else {
            const newStudent = {
                id: Date.now().toString(),
                name,
                phone,
                feeAmount,
                joinDate: new Date().toISOString().split('T')[0]
            };
            this.data.students.push(newStudent);
            this.showToast('Student added — syncing...');
        }

        this.saveData();
        this.closeStudentModal();
        this.renderStudents();
    },

    deleteStudent(id) {
        if (confirm('Are you sure you want to delete this student?')) {
            this.data.students = this.data.students.filter(s => s.id !== id);
            this.saveData();
            this.renderStudents();
            this.showToast('Student deleted — syncing...');
        }
    },

    renderStudents() {
        const tbody = document.querySelector('#students-table tbody');
        tbody.innerHTML = '';

        if (this.data.students.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center">No students found. Add one!</td></tr>';
            return;
        }

        this.data.students.forEach(student => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${student.name}</strong></td>
                <td>+${student.phone}</td>
                <td>₹${student.feeAmount}</td>
                <td class="actions-cell">
                    <button class="btn small secondary icon-only" onclick="app.openStudentModal(app.data.students.find(s => s.id === '${student.id}'))"><ion-icon name="pencil"></ion-icon></button>
                    <button class="btn small danger icon-only" onclick="app.deleteStudent('${student.id}')"><ion-icon name="trash"></ion-icon></button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },

    // --- Attendance ---
    renderAttendance() {
        const dateInput = document.getElementById('attendance-date').value;
        if (!dateInput) return;

        const listContainer = document.getElementById('attendance-list');
        listContainer.innerHTML = '';

        if (!this.data.attendance[dateInput]) {
            this.data.attendance[dateInput] = {};
        }

        const dateAttendance = this.data.attendance[dateInput];

        if (this.data.students.length === 0) {
            listContainer.innerHTML = '<p style="padding: 1rem; text-align:center;">No students added yet.</p>';
            return;
        }

        this.data.students.forEach(student => {
            const status = dateAttendance[student.id] || null;

            const item = document.createElement('div');
            item.className = 'attendance-item';

            const statusBadge = status === 'present' ? '<span style="color:var(--success); font-weight:bold; font-size:12px;">PRESENT</span>' :
                (status === 'absent' ? '<span style="color:var(--danger); font-weight:bold; font-size:12px;">ABSENT</span>' : '<span style="color:var(--text-muted); font-size:12px;">NOT MARKED</span>');

            item.innerHTML = `
                <div class="student-info">
                    <h4>${student.name} ${statusBadge}</h4>
                    <p>Parent: +${student.phone}</p>
                </div>
                <div class="attendance-controls">
                    <button class="btn small ${status === 'present' ? 'success' : 'secondary'}" onclick="app.markAttendance('${dateInput}', '${student.id}', 'present')"><ion-icon name="checkmark"></ion-icon> Present</button>
                    <button class="btn small ${status === 'absent' ? 'danger' : 'secondary'}" onclick="app.markAttendance('${dateInput}', '${student.id}', 'absent')"><ion-icon name="close"></ion-icon> Absent</button>
                    ${status === 'absent' ? `<button class="btn small success" onclick="app.sendWhatsAppMsg('absent', '${student.id}', '${dateInput}')"><ion-icon name="logo-whatsapp"></ion-icon> Notify Parent</button>` : ''}
                </div>
            `;
            listContainer.appendChild(item);
        });
    },

    markAttendance(dateStr, studentId, status) {
        if (!this.data.attendance[dateStr]) this.data.attendance[dateStr] = {};
        this.data.attendance[dateStr][studentId] = status;
        this.saveData();
        this.renderAttendance();
    },

    // --- Fees ---
    renderFees() {
        const tbody = document.querySelector('#fees-table tbody');
        tbody.innerHTML = '';

        const currentMonth = new Date().toISOString().slice(0, 7);
        const todayDay = new Date().getDate();

        if (this.data.students.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center">No students found.</td></tr>';
            return;
        }

        this.data.students.forEach(student => {
            const studentFees = this.data.fees[student.id] || {};
            const lastPaid = studentFees.lastPaidMonth;

            let statusHtml = '';
            let isDelayed = false;

            if (lastPaid === currentMonth) {
                statusHtml = '<span style="color:var(--success); font-weight:600;">Paid</span>';
            } else {
                statusHtml = '<span style="color:var(--warning); font-weight:600;">Pending</span>';
                if (todayDay >= 5) {
                    statusHtml = '<span style="color:var(--danger); font-weight:600;">Delayed (Due 5th)</span>';
                    isDelayed = true;
                }
            }

            const formatMonth = (ym) => {
                if (!ym) return 'Never';
                const parts = ym.split('-');
                return new Date(parts[0], parts[1] - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
            };

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${student.name}</strong></td>
                <td>₹${student.feeAmount}</td>
                <td>${formatMonth(lastPaid)}</td>
                <td>${statusHtml}</td>
                <td class="actions-cell">
                    ${lastPaid !== currentMonth ? `<button class="btn small success" onclick="app.payFee('${student.id}', '${currentMonth}')"><ion-icon name="checkmark"></ion-icon> Mark Paid</button>` : `<button class="btn small secondary" onclick="app.unpayFee('${student.id}')">Undo</button>`}
                    ${isDelayed ? `<button class="btn small primary" onclick="app.sendWhatsAppMsg('fee', '${student.id}', '${currentMonth}')"><ion-icon name="logo-whatsapp"></ion-icon> Reminder</button>` : ''}
                </td>
            `;
            tbody.appendChild(tr);
        });
    },

    payFee(studentId, monthStr) {
        if (!this.data.fees[studentId]) this.data.fees[studentId] = {};
        this.data.fees[studentId].lastPaidMonth = monthStr;
        this.saveData();
        this.renderFees();
        this.showToast('Fee marked as paid — syncing...');
    },

    unpayFee(studentId) {
        if (this.data.fees[studentId]) {
            this.data.fees[studentId].lastPaidMonth = null;
            this.saveData();
            this.renderFees();
        }
    },

    // --- WhatsApp ---
    sendWhatsAppMsg(type, studentId, contextData) {
        const student = this.data.students.find(s => s.id === studentId);
        if (!student) return;

        let message = '';

        if (type === 'absent') {
            const dateObj = new Date(contextData);
            const dateStr = dateObj.toLocaleDateString();
            message = `Hello, this is to inform you that your ward, ${student.name}, is absent from tuition classes today (${dateStr}). Regards.`;
        } else if (type === 'fee') {
            const dateObj = new Date(contextData + '-01');
            const monthStr = dateObj.toLocaleString('default', { month: 'long' });
            message = `Hello! This is a gentle reminder that the tuition fee of ₹${student.feeAmount} for the month of ${monthStr} for ${student.name} is currently pending. Please arrange to pay at your earliest convenience. Thank you.`;
        }

        const encodedMsg = encodeURIComponent(message);
        const phoneClean = student.phone.replace(/[^0-9]/g, '');

        const waUrl = `https://wa.me/${phoneClean}?text=${encodedMsg}`;
        window.open(waUrl, '_blank');
    }
};

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    app.init();
});
