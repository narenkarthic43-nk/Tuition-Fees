// =========================================================
// TuitionHub — Auto Sync Across All Devices
// =========================================================
// Uses JSONBlob.com (FREE, no signup, no API key needed)
// for instant cross-device cloud syncing.
// 
// How it works:
// 1. First time → creates a cloud data blob → gives you a Sync Code
// 2. On other devices → enter the Sync Code → data syncs automatically
// 3. Polls every 3 seconds for changes from other devices
// 4. Any change is pushed to cloud + pulled from cloud
// =========================================================

const JSONBLOB_API = 'https://jsonblob.com/api/jsonBlob';

// =========================================================
// Sync Manager — Handles all cloud sync operations
// =========================================================
const syncManager = {
    blobId: null,
    syncInterval: null,
    lastDataHash: '',
    isSyncing: false,

    // Check if we already have a sync session
    checkExistingSync() {
        const savedBlobId = localStorage.getItem('tuitionhub_sync_id');
        if (savedBlobId) {
            this.blobId = savedBlobId;
            this.startApp();
        } else {
            // Show the sync setup screen
            document.getElementById('sync-setup-overlay').style.display = 'flex';
            document.getElementById('sync-status').style.display = 'none';
        }
    },

    // Create a new cloud sync blob
    async createNewSync() {
        const btn = document.getElementById('btn-new-sync');
        btn.disabled = true;
        btn.innerHTML = '<ion-icon name="hourglass-outline"></ion-icon> Creating...';

        try {
            // Initialize with empty data
            const initialData = {
                students: [],
                attendance: {},
                fees: {},
                _meta: {
                    createdAt: new Date().toISOString(),
                    lastModified: new Date().toISOString()
                }
            };

            const response = await fetch(JSONBLOB_API, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(initialData)
            });

            if (!response.ok) throw new Error('Failed to create sync: ' + response.status);

            // Extract blob ID from the Location header or response URL
            const locationHeader = response.headers.get('Location');
            if (locationHeader) {
                this.blobId = locationHeader.split('/').pop();
            } else {
                // Fallback: parse from response URL
                const url = response.url;
                this.blobId = url.split('/').pop();
            }

            if (!this.blobId || this.blobId === 'jsonBlob') {
                // If we still can't get the ID, try reading it from response
                const responseData = await response.json();
                throw new Error('Could not get blob ID. Try again.');
            }

            // Save the blob ID
            localStorage.setItem('tuitionhub_sync_id', this.blobId);

            // Save initial data locally
            app.data = { students: [], attendance: {}, fees: {} };
            localStorage.setItem('tuitionAppData', JSON.stringify(app.data));

            // Show the sync code to the user
            this.startApp();

            // Show the sync code modal immediately
            setTimeout(() => {
                this.showSyncCode();
                app.showToast('✅ Cloud sync created! Save your Sync Code.');
            }, 500);

        } catch (error) {
            console.error('Create sync error:', error);
            btn.disabled = false;
            btn.innerHTML = '<ion-icon name="cloud-upload-outline"></ion-icon> Create New Sync';
            alert('Failed to create cloud sync. Please check your internet connection and try again.\n\nError: ' + error.message);
        }
    },

    // Join an existing sync using a code
    async joinExistingSync() {
        const codeInput = document.getElementById('join-sync-code');
        const code = codeInput.value.trim();

        if (!code) {
            alert('Please enter a Sync Code');
            codeInput.focus();
            return;
        }

        const btn = document.getElementById('btn-join-sync');
        btn.disabled = true;
        btn.innerHTML = '<ion-icon name="hourglass-outline"></ion-icon> Connecting...';

        try {
            // Try to fetch data from the blob
            const response = await fetch(`${JSONBLOB_API}/${code}`, {
                headers: { 'Accept': 'application/json' }
            });

            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error('Sync Code not found. Please check and try again.');
                }
                throw new Error('Connection failed: ' + response.status);
            }

            const cloudData = await response.json();

            // Save the blob ID and data
            this.blobId = code;
            localStorage.setItem('tuitionhub_sync_id', this.blobId);

            app.data = {
                students: cloudData.students || [],
                attendance: cloudData.attendance || {},
                fees: cloudData.fees || {}
            };
            localStorage.setItem('tuitionAppData', JSON.stringify(app.data));

            this.startApp();

            setTimeout(() => {
                app.showToast('✅ Connected! Data synced from cloud.');
            }, 500);

        } catch (error) {
            console.error('Join sync error:', error);
            btn.disabled = false;
            btn.innerHTML = '<ion-icon name="log-in-outline"></ion-icon> Connect';
            alert(error.message);
        }
    },

    // Start the main app after sync is established
    startApp() {
        // Hide setup screen, show main app
        document.getElementById('sync-setup-overlay').style.display = 'none';
        document.getElementById('main-sidebar').style.display = 'flex';
        document.getElementById('main-content').style.display = 'block';
        document.getElementById('sync-status').style.display = 'flex';

        // Initialize the app
        app.init();

        // Start auto-sync polling
        this.startAutoSync();

        // Update sync status
        this.updateSyncUI('connected');
    },

    // Push local data to cloud
    async pushToCloud() {
        if (!this.blobId || this.isSyncing) return;
        this.isSyncing = true;

        try {
            this.updateSyncUI('syncing');

            const payload = {
                students: app.data.students || [],
                attendance: app.data.attendance || {},
                fees: app.data.fees || {},
                _meta: {
                    lastModified: new Date().toISOString()
                }
            };

            const response = await fetch(`${JSONBLOB_API}/${this.blobId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error('Push failed: ' + response.status);

            this.lastDataHash = this.hashData(app.data);
            this.updateSyncUI('connected');
            this.updateLastSyncTime();

        } catch (error) {
            console.error('Push to cloud error:', error);
            this.updateSyncUI('error');
        }

        this.isSyncing = false;
    },

    // Pull data from cloud (check for changes from other devices)
    async pullFromCloud() {
        if (!this.blobId || this.isSyncing) return;

        try {
            const response = await fetch(`${JSONBLOB_API}/${this.blobId}`, {
                headers: { 'Accept': 'application/json' },
                cache: 'no-store'
            });

            if (!response.ok) throw new Error('Pull failed: ' + response.status);

            const cloudData = await response.json();

            const cloudPayload = {
                students: cloudData.students || [],
                attendance: cloudData.attendance || {},
                fees: cloudData.fees || {}
            };

            const cloudHash = this.hashData(cloudPayload);

            // If cloud data is different from local, update local
            if (cloudHash !== this.lastDataHash) {
                app.data = cloudPayload;
                localStorage.setItem('tuitionAppData', JSON.stringify(app.data));
                this.lastDataHash = cloudHash;

                // Refresh the current view
                app.refreshAllViews();
                this.updateSyncUI('connected');
                this.updateLastSyncTime();
            }

        } catch (error) {
            console.error('Pull from cloud error:', error);
            this.updateSyncUI('error');
        }
    },

    // Auto-sync: polls cloud every 3 seconds
    startAutoSync() {
        // First pull
        this.pullFromCloud();

        // Then poll periodically
        this.syncInterval = setInterval(() => {
            this.pullFromCloud();
        }, 3000); // Check every 3 seconds
    },

    stopAutoSync() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
        }
    },

    // Simple hash to detect data changes
    hashData(data) {
        return JSON.stringify({
            students: data.students,
            attendance: data.attendance,
            fees: data.fees
        });
    },

    // UI Updates
    updateSyncUI(status) {
        const syncStatus = document.getElementById('sync-status');
        const sidebarSync = document.getElementById('sidebar-sync');
        const syncBadge = document.getElementById('sync-badge');
        const syncBadgeText = document.getElementById('sync-badge-text');

        syncStatus.className = 'sync-status';

        if (status === 'connected') {
            syncStatus.classList.add('connected');
            syncStatus.innerHTML = '<div class="sync-dot"></div><span>☁️ Cloud Connected</span>';
            if (sidebarSync) {
                sidebarSync.className = 'sidebar-sync connected';
                sidebarSync.innerHTML = '<ion-icon name="cloud-done-outline"></ion-icon><span>Cloud Synced</span>';
            }
            if (syncBadge) {
                syncBadge.classList.add('active');
                if (syncBadgeText) syncBadgeText.textContent = 'Live Sync';
            }
            // Auto-hide after 3s
            setTimeout(() => syncStatus.classList.add('hide'), 3000);
        } else if (status === 'syncing') {
            syncStatus.classList.add('syncing');
            syncStatus.innerHTML = '<div class="sync-dot"></div><span>🔄 Syncing...</span>';
            syncStatus.classList.remove('hide');
            if (sidebarSync) {
                sidebarSync.className = 'sidebar-sync syncing';
                sidebarSync.innerHTML = '<ion-icon name="sync-outline"></ion-icon><span>Syncing...</span>';
            }
        } else if (status === 'error') {
            syncStatus.classList.add('disconnected');
            syncStatus.innerHTML = '<div class="sync-dot"></div><span>⚠️ Sync Error — Retrying...</span>';
            syncStatus.classList.remove('hide');
            if (sidebarSync) {
                sidebarSync.className = 'sidebar-sync disconnected';
                sidebarSync.innerHTML = '<ion-icon name="cloud-offline-outline"></ion-icon><span>Retry...</span>';
            }
            if (syncBadge) {
                syncBadge.classList.remove('active');
                if (syncBadgeText) syncBadgeText.textContent = 'Reconnecting...';
            }
        }
    },

    updateLastSyncTime() {
        const el = document.getElementById('last-sync-time');
        if (el) {
            el.textContent = new Date().toLocaleTimeString();
        }
    },

    // Show sync code modal
    showSyncCode() {
        if (!this.blobId) return;
        document.getElementById('sync-code-display').textContent = this.blobId;
        document.getElementById('sync-code-modal').classList.add('active');
    },

    // Copy sync code to clipboard

    copySyncCode() {
        if (!this.blobId) return;
        navigator.clipboard.writeText(this.blobId).then(() => {
            app.showToast('📋 Sync Code copied to clipboard!');
        }).catch(() => {
            // Fallback for older browsers
            const textarea = document.createElement('textarea');
            textarea.value = this.blobId;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            app.showToast('📋 Sync Code copied!');
        });
    },

    // Reset sync (disconnect from cloud)
    resetSync() {
        if (confirm('This will disconnect from cloud sync. Your local data will be kept. Continue?')) {
            this.stopAutoSync();
            localStorage.removeItem('tuitionhub_sync_id');
            this.blobId = null;
            location.reload();
        }
    }
};


// =========================================================
// Core App Logic
// =========================================================
const app = {
    data: {
        students: [],
        attendance: {},
        fees: {}
    },

    init() {
        this.loadData();
        this.bindEvents();
        this.navigate('dashboard');

        document.getElementById('attendance-date').valueAsDate = new Date();
    },

    // --- Data Management ---
    loadData() {
        const stored = localStorage.getItem('tuitionAppData');
        if (stored) {
            this.data = JSON.parse(stored);
            if (!this.data.students) this.data.students = [];
            if (!this.data.attendance) this.data.attendance = {};
            if (!this.data.fees) this.data.fees = {};
        }
    },

    saveData() {
        // Save locally
        localStorage.setItem('tuitionAppData', JSON.stringify(this.data));

        // Push to cloud
        syncManager.pushToCloud();

        // Update dashboard
        this.updateDashboard();
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
        document.querySelectorAll('.nav-links li').forEach(li => {
            li.addEventListener('click', () => this.navigate(li.dataset.target));
        });

        document.getElementById('btn-add-student').addEventListener('click', () => this.openStudentModal());
        document.getElementById('close-modal').addEventListener('click', () => this.closeStudentModal());

        document.getElementById('student-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveStudent();
        });

        document.getElementById('attendance-date').addEventListener('change', () => {
            this.renderAttendance();
        });

        // Close modal on overlay click
        document.getElementById('student-modal').addEventListener('click', (e) => {
            if (e.target.id === 'student-modal') this.closeStudentModal();
        });
        document.getElementById('sync-code-modal').addEventListener('click', (e) => {
            if (e.target.id === 'sync-code-modal') {
                document.getElementById('sync-code-modal').classList.remove('active');
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
                this.showToast('✅ Student updated — syncing...');
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
            this.showToast('✅ Student added — syncing...');
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
            this.showToast('🗑️ Student deleted — syncing...');
        }
    },

    renderStudents() {
        const tbody = document.querySelector('#students-table tbody');
        tbody.innerHTML = '';

        if (this.data.students.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:2rem; color:var(--text-muted);">No students found. Click "Add Student" to get started!</td></tr>';
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
            listContainer.innerHTML = '<p style="padding: 2rem; text-align:center; color:var(--text-muted);">No students added yet.</p>';
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
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:2rem; color:var(--text-muted);">No students found.</td></tr>';
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
        this.showToast('✅ Fee marked as paid — syncing...');
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

// =========================================================
// App Startup
// =========================================================
document.addEventListener('DOMContentLoaded', () => {
    syncManager.checkExistingSync();
});
