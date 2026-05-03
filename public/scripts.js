import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  onAuthStateChanged, signOut, updatePassword, setPersistence,
  browserSessionPersistence, EmailAuthProvider, reauthenticateWithCredential,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, collection, query,
  where, getDocs, addDoc, orderBy, onSnapshot, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

// --- Firebase 設定 ---
const firebaseConfig = {
  apiKey: "AIzaSyBtviVzNW_e7sO95GM2OWKU1guexH8wshY",
  authDomain: "final-project-test-698e1.firebaseapp.com",
  projectId: "final-project-test-698e1",
  storageBucket: "final-project-test-698e1.firebasestorage.app",
  messagingSenderId: "43236661210",
  appId: "1:43236661210:web:557832a02a374aa06612e3",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

const BACKEND_URL = "";

// --- 全域變數 ---
let currentUser = {
  name: "", email: "", studentId: "", room: "", bed: "", phone: "",
  role: "student", uid: "", mustChangePassword: false,
};

let currentLoginRole = "student";
window.isManualLogin = false;
let currentPackageFilter = "arrived"; 
let notifications = [];
let packages = [];
let previousNotificationIds = new Set(); 
let isFirstFetch = true;
let isRegisterMode = false;
let currentRejectRequest = null;
window.currentRepairDraft = null; 
window.currentFacPage = 1; 
let adminRepairUnsubscribe = null;
let adminFacilityUnsubscribe = null;
let adminPackageUnsubscribe = null;
let adminStudentAccountUnsubscribe = null;
let notifUnsubscribe = null;
let adminInquiryUnsubscribe = null;

let batchPackageList = [];
let currentPage = 1;
const itemsPerPage = 10;

// --- 閒置 20 分鐘登出機制 ---
let idleTime = 0;
function resetIdleTime() { idleTime = 0; }
window.addEventListener('mousemove', resetIdleTime);
window.addEventListener('keydown', resetIdleTime);
window.addEventListener('scroll', resetIdleTime);
window.addEventListener('click', resetIdleTime);

setInterval(() => {
  if (auth.currentUser) {
    idleTime += 1;
    if (idleTime >= 20) { // 20 分鐘無動作
      window.showCustomAlert("您已閒置超過 20 分鐘，為保護帳號安全，系統已自動登出。").then(() => {
        signOut(auth).then(() => window.location.reload());
      });
    }
  }
}, 60000); // 每 1 分鐘檢查一次

// --- 公告系統 ---
window.loadAnnouncements = async function() {
  const list = document.getElementById("announcementList");
  if (!list) return;

  try {
    const res = await fetch(`${BACKEND_URL}/api/announcements`);
    if (!res.ok) throw new Error("無法取得資料");
    
    const result = await res.json();
    const announcementsData = result.data || []; 

    if (announcementsData.length === 0) {
      const noDataText = window.i18next ? window.i18next.t("no_announcements", { defaultValue: "目前無最新公告" }) : "目前無最新公告";
      list.innerHTML = `<div style='text-align: center; color: #9ca3af;'>${noDataText}</div>`;
      return;
    }

    let html = "";
    announcementsData.forEach(item => {
      // 💡 修改這裡：將超連結改成 onclick 事件，並將網址當作參數傳入
      html += `
        <div class="announcement-item">
          <a href="javascript:void(0)" onclick="openAnnouncementDetail('${item.url}')">
            ${item.title}
          </a>
        </div>
      `;
    });
    
    list.innerHTML = html;
  } catch (error) {
    console.error("載入公告失敗:", error);
    const errText = window.i18next ? window.i18next.t("err_load_announcements", { defaultValue: "無法載入公告，請稍後再試" }) : "無法載入公告，請稍後再試";
    list.innerHTML = `<div style='color: #ef4444;'>${errText}</div>`;
  }
};

// 📌 打開公告詳細內容的 Modal
window.openAnnouncementDetail = async function(url) {
  const modal = document.getElementById("announcementDetailModal");
  const titleEl = document.getElementById("detailModalTitle");
  const bodyEl = document.getElementById("detailModalBody");
  const linkEl = document.getElementById("detailModalOriginalLink"); 

  // 1. 先打開視窗，顯示載入中動畫
  modal.style.display = "flex";
  titleEl.innerText = window.i18next ? window.i18next.t("loading_announcements", { defaultValue: "載入中..." }) : "載入中...";
  bodyEl.innerHTML = `<div style='text-align:center; padding: 40px; color: #94a3b8;'>讀取資料中，請稍候...</div>`;
  linkEl.style.display = "none"; 

  try {
    const res = await fetch(`${BACKEND_URL}/api/announcement-detail?url=${encodeURIComponent(url)}`);
    const result = await res.json();

    if (result.success) {
      let displayTitle = result.data.title;
      if (displayTitle === '宿舍公告') {
        displayTitle = window.i18next ? window.i18next.t("default_modal_title", { defaultValue: "Dorm Announcement" }) : "宿舍公告";
      }
      titleEl.innerText = displayTitle;
      
      // 👉 判斷目前的語系
      const currentLang = window.i18next ? window.i18next.language : 'zh';
      
      // 👉 魔法功能：產生 Google Translate 的全網頁翻譯網址
      const translateUrl = `https://translate.google.com/translate?hl=en&sl=zh-TW&tl=en&u=${encodeURIComponent(url)}`;
      
      // 如果目前是英文版，就在內文最下方自動加入一個顯眼的 Google 翻譯按鈕
      let translateBtnHtml = "";
      if (currentLang && currentLang.startsWith('en')) {
        translateBtnHtml = `
          <div style="margin-top: 24px; padding-top: 20px; border-top: 1px dashed #cbd5e1; text-align: center;">
            <a href="${translateUrl}" target="_blank" class="btn btn-secondary" style="display: inline-block; text-decoration: none; font-weight: bold;">
              Translate to English
            </a>
          </div>
        `;
      }

      // 將原本的內容與翻譯按鈕組合在一起顯示
      bodyEl.innerHTML = result.data.contentHtml + translateBtnHtml;
      
      // 處理視窗左下角的原網站連結
      linkEl.href = url;
      linkEl.style.display = "inline-block";
      
    } else {
      titleEl.innerText = window.i18next && currentLang.startsWith('en') ? "Load Failed" : "載入失敗";
      bodyEl.innerHTML = `<p style='color:#e11d48; text-align:center; padding:20px;'>無法讀取公告內容，請稍後再試。</p>`;
    }
  } catch (error) {
    titleEl.innerText = window.i18next && currentLang.startsWith('en') ? "Connection Error" : "連線錯誤";
    bodyEl.innerHTML = `<p style='color:#e11d48; text-align:center; padding:20px;'>系統發生錯誤，請稍後再試。</p>`;
  }
};
// 📌 新增：關閉 Modal
window.closeAnnouncementDetailModal = function() {
  document.getElementById("announcementDetailModal").style.display = "none";
};

// --- 共用 UI 函數 ---
window.showCustomAlert = function (msgKeyOrText) {
  return new Promise((resolve) => {
    const titleEl = document.getElementById("customAlertTitle");
    if(window.i18next) titleEl.innerText = window.i18next.t("sys_notice");
    const msgEl = document.getElementById("customAlertMessage");
    msgEl.innerText = window.i18next ? window.i18next.t(msgKeyOrText, { defaultValue: msgKeyOrText }) : msgKeyOrText;
    document.getElementById("customAlertModal").style.display = "flex";
    window._customAlertResolve = () => {
      document.getElementById("customAlertModal").style.display = "none";
      resolve();
    };
  });
};

window.showCustomConfirm = function (msgKeyOrText) {
  return new Promise((resolve) => {
    const titleEl = document.getElementById("customConfirmTitle");
    if(window.i18next) titleEl.innerText = window.i18next.t("sys_confirm");
    const msgEl = document.getElementById("customConfirmMessage");
    msgEl.innerText = window.i18next ? window.i18next.t(msgKeyOrText, { defaultValue: msgKeyOrText }) : msgKeyOrText;
    document.getElementById("customConfirmModal").style.display = "flex";
    window._customConfirmResolve = (result) => {
      document.getElementById("customConfirmModal").style.display = "none";
      resolve(result);
    };
  });
};

const courierI18nMap = {
  "T-Cat": "t_cat", "Taiwan Pelican Express": "pelican", "Hsinchu Logistics": "hsinchu",
  "Kerry TJ Logistics": "kerry", "Chunghwa Post": "post", "Shopee Express": "shopee_express", "Other": "other"
};

function getCourierZh(courierName) {
  if (!window.i18next) return courierName;
  const key = courierI18nMap[courierName];
  if (key) return window.i18next.t(key);
  return courierName;
}

// --- 登入與權限管理 ---
onAuthStateChanged(auth, async (user) => {
  const loader = document.getElementById("loginLoader");
  const loginPage = document.getElementById("loginPage");
  const mainApp = document.getElementById("mainApp");

  try {
    if (user) {
      if (!document.getElementById("chatbase-script")) {
        const script = document.createElement("script");
        script.src = "https://www.chatbase.co/embed.min.js";
        script.id = "chatbase-script";
        script.setAttribute("chatbotId", "16vFeNLQSbnbzKOmKYdrr");
        script.setAttribute("domain", "www.chatbase.co");
        script.defer = true;
        document.body.appendChild(script);
      }

      const isAuthorized = await loadUserProfile(user.uid);
      if (!isAuthorized) return;

      if (loginPage) loginPage.style.display = "none";

      if (currentUser.role === "student" && currentUser.mustChangePassword) {
        const modal = document.getElementById("forceChangePasswordModal");
        if (modal) modal.style.display = "flex";
        if (mainApp) mainApp.style.display = "none";
      } else {
        if (mainApp) mainApp.style.display = "block";
        initializeAppUI();
      }
    } else {
      currentUser = null;
      if (adminRepairUnsubscribe) { adminRepairUnsubscribe(); adminRepairUnsubscribe = null; }
      if (adminFacilityUnsubscribe) { adminFacilityUnsubscribe(); adminFacilityUnsubscribe = null; }
      if (adminPackageUnsubscribe) { adminPackageUnsubscribe(); adminPackageUnsubscribe = null; }
      if (adminStudentAccountUnsubscribe) { adminStudentAccountUnsubscribe(); adminStudentAccountUnsubscribe = null; }
      if (notifUnsubscribe) { notifUnsubscribe(); notifUnsubscribe = null; }
      if (adminInquiryUnsubscribe) { adminInquiryUnsubscribe(); adminInquiryUnsubscribe = null; }
      if (loginPage) loginPage.style.display = "flex";
      if (mainApp) mainApp.style.display = "none";

      const script = document.getElementById("chatbase-script");
      if (script) script.remove();
      const widget = document.querySelector('iframe[src*="chatbase"]');
      if (widget) widget.remove();
    }
  } catch (error) {
    console.error("登入處理錯誤:", error);
  } finally {
    if (loader) {
      loader.classList.remove("show");
      loader.style.display = "none";
    }
  }
});

function updateProfileUI() {
  const elName = document.getElementById("userName");
  const elRoom = document.getElementById("userRoom");
  const elBed = document.getElementById("userBed");
  const elSettingsName = document.getElementById("settingsName");
  const elSettingsEmail = document.getElementById("settingsEmail");
  const elSettingsRoom = document.getElementById("settingsRoom");
  const elSettingsBed = document.getElementById("settingsBed");
  const elSettingsPhone = document.getElementById("settingsPhone");
  const facPhone = document.getElementById("facPhone");

  if (elName) elName.textContent = currentUser.name;
  if (elRoom) elRoom.textContent = currentUser.room;
  if (elBed) elBed.textContent = currentUser.bed;

  if (elSettingsName) elSettingsName.value = currentUser.name;
  if (elSettingsEmail) elSettingsEmail.value = currentUser.studentId || currentUser.email;
  if (elSettingsRoom) elSettingsRoom.value = currentUser.room === "未設定" ? "" : currentUser.room;
  if (elSettingsBed) elSettingsBed.value = currentUser.bed === "未設定" ? "" : currentUser.bed;
  if (elSettingsPhone) elSettingsPhone.value = currentUser.phone === "未設定" ? "" : currentUser.phone;
  if (facPhone) facPhone.value = currentUser.phone === "未設定" ? "" : currentUser.phone;
}

async function loadUserProfile(uid) {
  try {
    const docRef = doc(db, "users", uid);
    const docSnap = await getDoc(docRef);
    let data = {};
    if (docSnap.exists()) data = docSnap.data();

    const actualRole = data.role || "student";
    
    // 👈 修改這裡：只有在「手動登入」的情況下，才嚴格檢查頁籤是否正確
    if (window.isManualLogin && actualRole !== currentLoginRole) {
      await window.showCustomAlert(`❌ 登入失敗！\n您的帳號身分為「${actualRole.toUpperCase()}」，請從正確的頁籤登入！`);
      await signOut(auth);
      window.isManualLogin = false; // 發生錯誤也要重置
      return false;
    }

    // 👈 新增這裡：如果是自動登入(重新整理)，直接將當前角色更新為真實角色
    currentLoginRole = actualRole; 
    window.isManualLogin = false; // 登入成功後，把標記重置回 false

    currentUser = {
      uid: uid,
      name: data.name || auth.currentUser?.displayName || "User",
      email: data.email || auth.currentUser?.email || "",
      studentId: data.studentId || "",
      room: data.room || "未設定",
      bed: data.bed || "未設定",
      phone: data.phone || "未設定",
      role: actualRole,
      mustChangePassword: data.mustChangePassword || false,
    };

    const studentItems = document.querySelectorAll(".student-only");
    const adminItems = document.querySelectorAll(".admin-only");
    const langToggle = document.getElementById("langToggle");

    if (currentUser.role === "admin") {
      studentItems.forEach((item) => (item.style.display = "none"));
      adminItems.forEach((item) => (item.style.display = "flex"));
      const topNavNotificationBtn = document.getElementById("topNavNotificationBtn");
      if (topNavNotificationBtn) topNavNotificationBtn.style.display = "none";
      if (langToggle) langToggle.style.display = "none";
      if (window.i18next) {
        window.i18next.changeLanguage("zh");
        if (window.updateContent) window.updateContent();
      }
    } else {
      studentItems.forEach((item) => (item.style.display = ""));
      adminItems.forEach((item) => (item.style.display = "none"));
      const topNavNotificationBtn = document.getElementById("topNavNotificationBtn");
      if (topNavNotificationBtn) topNavNotificationBtn.style.display = "block";
      if (langToggle) langToggle.style.display = "flex";
    }

    updateProfileUI();
    return true;
  } catch (e) {
    console.error("❌ 讀取使用者資料失敗:", e);
    await window.showCustomAlert("讀取使用者資料失敗！\n錯誤詳情：" + e.message);
    return false;
  }
}

window.handleAuthSubmit = async function (event) {
  if (event) event.preventDefault();
  window.isManualLogin = true;
  const loader = document.getElementById("loginLoader");
  if (loader) loader.classList.add("show");

  const authButton = document.getElementById("authButton");
  if (authButton) {
    authButton.disabled = true;
    authButton.innerText = window.i18next ? window.i18next.t("loading_btn") : "Loading...";
  }

  const accountInput = document.getElementById("loginAccount").value.trim();
  const password = document.getElementById("loginPassword").value;

  try {
    if (isRegisterMode) {
      if (currentLoginRole === "admin") {
        const secretInput = document.getElementById("adminSecret").value;
        const adminName = document.getElementById("adminName").value || "Admin";
        const MY_SECRET_KEY = "admin888";

        if (secretInput !== MY_SECRET_KEY) throw new Error("Admin Secret Key is incorrect! 註冊金鑰錯誤！");

        const userCredential = await createUserWithEmailAndPassword(auth, accountInput, password);
        await setDoc(doc(db, "users", userCredential.user.uid), {
          email: accountInput, name: adminName, role: "admin", createdAt: new Date(), mustChangePassword: false,
        });

        await signOut(auth);
        await window.showCustomAlert("Admin 註冊成功！請重新登入。");
        document.getElementById("loginPassword").value = "";
        toggleAuthMode();
        return;
      }
    } else {
        let loginEmail = accountInput;
        if (currentLoginRole === "student" && !accountInput.includes("@")) {
          loginEmail = `${accountInput}@dorm.ccu.edu.tw`;
        }
        // 替換為 Local，讓重新整理不登出
        await setPersistence(auth, browserSessionPersistence);
        await signInWithEmailAndPassword(auth, loginEmail, password);
      }
  } catch (error) {
    console.error("Auth Error:", error);
    if (error.code === "auth/invalid-credential") {
      await window.showCustomAlert("err_login");
    } else if (error.code === "auth/email-already-in-use") {
      await window.showCustomAlert("err_email_used");
    } else {
      await window.showCustomAlert("操作失敗: " + error.message);
    }
  } finally {
    if (authButton) {
      authButton.disabled = false;
      authButton.innerText = window.i18next ? window.i18next.t(isRegisterMode ? "signup_btn" : "login_btn") : (isRegisterMode ? "Sign Up" : "Login");
    }
    if (loader) loader.classList.remove("show");
  }
};

window.switchLoginTab = function (role) {
  currentLoginRole = role;
  const studentTab = document.getElementById("tabStudent");
  const adminTab = document.getElementById("tabAdmin");
  const authSwitchContainer = document.getElementById("authSwitchContainer");
  const accountLabel = document.getElementById("accountLabel");
  const accountInput = document.getElementById("loginAccount");
  const authTitle = document.getElementById("authTitle");
  const forgotPwdContainer = document.getElementById("forgotPwdContainer");

  if (role === "student") {
    studentTab.style.color = "#4a90e2"; studentTab.style.fontWeight = "bold";
    adminTab.style.color = "#ccc"; adminTab.style.fontWeight = "normal";

    authSwitchContainer.style.display = "none";
    accountLabel.innerHTML = '<span data-i18n="student_id"></span>';
    accountInput.setAttribute("data-i18n-placeholder", "enter_student_id");
    accountInput.type = "text";
    authTitle.setAttribute("data-i18n", "login_student_title");
    if (isRegisterMode) toggleAuthMode();
    if(forgotPwdContainer) forgotPwdContainer.style.display = "block";
  } else {
    adminTab.style.color = "#4a90e2"; adminTab.style.fontWeight = "bold";
    studentTab.style.color = "#ccc"; studentTab.style.fontWeight = "normal";

    authSwitchContainer.style.display = "block";
    accountLabel.innerHTML = '<span data-i18n="admin_email"></span>';
    accountInput.setAttribute("data-i18n-placeholder", "enter_admin_email");
    accountInput.type = "email";
    authTitle.setAttribute("data-i18n", "login_admin_title");
    if(forgotPwdContainer) forgotPwdContainer.style.display = "none";
  }
  if (window.updateContent) window.updateContent();
};

window.toggleAuthMode = function () {
  if (currentLoginRole === "student") return;

  isRegisterMode = !isRegisterMode;
  const registerFields = document.getElementById("registerOnlyFields");
  const authButton = document.getElementById("authButton");
  const authTitle = document.getElementById("authTitle");
  const switchText = document.getElementById("authSwitchText");
  const switchLink = document.getElementById("authSwitchLink");
  const loginTabs = document.getElementById("loginTabs");

  if (isRegisterMode) {
    registerFields.style.display = "block";
    authButton.setAttribute("data-i18n", "signup_btn");
    authTitle.setAttribute("data-i18n", "login_admin_register_title");
    switchText.setAttribute("data-i18n", "already_have_account");
    switchLink.setAttribute("data-i18n", "login_btn");
    if (loginTabs) loginTabs.style.display = "none";
  } else {
    registerFields.style.display = "none";
    authButton.setAttribute("data-i18n", "login_btn");
    authTitle.setAttribute("data-i18n", "login_admin_title");
    switchText.setAttribute("data-i18n", "no_admin_account");
    switchLink.setAttribute("data-i18n", "signup_btn");
    if (loginTabs) loginTabs.style.display = "flex";
  }
  if (window.updateContent) window.updateContent();
};

window.showForgotPasswordAlert = function(e) {
  e.preventDefault();
  window.showCustomAlert("forgot_pwd_alert");
};

window.adminResetStudentPassword = async function() {
  const studentIdInput = document.getElementById("resetPwdStudentId");
  const studentId = studentIdInput.value.trim();

  if (!studentId) {
    return window.showCustomAlert("⚠️ 請輸入要重置的學生學號！");
  }

  const ok = await window.showCustomConfirm(`⚠️ 確認操作\n\n您確定已經核對過學號 【${studentId}】 的實體學生證了嗎？\n確認後將把該帳號密碼重置為預設密碼。`);
  if (!ok) return;

  const btn = document.querySelector("button[onclick='adminResetStudentPassword()']");
  const originalText = btn.innerText;
  btn.innerText = "處理中...";
  btn.disabled = true;

  try {
    const response = await fetch(`${BACKEND_URL}/api/admin/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId: studentId })
    });
    
    const result = await response.json();
    
    if (response.ok && result.success) {
      await window.showCustomAlert(`✅ 重置成功！\n學號 ${studentId} 的密碼已恢復為預設 (CCU1234#@)。\n該學生下次登入時會被系統強制要求更改密碼。`);
      studentIdInput.value = "";
    } else {
      await window.showCustomAlert("❌ 重置失敗：" + (result.error || "未知錯誤"));
    }
  } catch (error) {
    await window.showCustomAlert("❌ 系統錯誤：" + error.message);
  } finally {
    btn.innerText = originalText;
    btn.disabled = false;
  }
};

// --- 管理員即時監聽 ---
function listenToAdminRepairCount() {
  if (currentUser.role !== "admin") return;
  const q = query(collection(db, "repairRequests"), where("status", "==", "pending"));
  if (adminRepairUnsubscribe) adminRepairUnsubscribe();

  adminRepairUnsubscribe = onSnapshot(q, (snapshot) => {
    const count = snapshot.size;
    const badge = document.getElementById("adminRepairBadge");
    if (badge) {
      if (count > 0) {
        badge.innerText = count > 99 ? "99+" : count;
        badge.style.display = "inline-flex";
      } else {
        badge.style.display = "none";
      }
    }
  }, (error) => console.error("監聽報修數量失敗:", error));
}

function listenToAdminFacilityCount() {
  if (currentUser.role !== "admin") return;
  const q = query(collection(db, "facilityRequests"), where("status", "==", "pending"));
  if (adminFacilityUnsubscribe) adminFacilityUnsubscribe();

  adminFacilityUnsubscribe = onSnapshot(q, (snapshot) => {
    const count = snapshot.size;
    const badge = document.getElementById("adminFacilityBadge");
    if (badge) {
      badge.innerText = count > 99 ? "99+" : count;
      badge.style.display = count > 0 ? "inline-flex" : "none";
    }
  });
}

function listenToAdminPackageCount() {
  if (currentUser.role !== "admin") return;
  const q = query(collection(db, "inquiries"), where("status", "==", "pending"));
  
  // 👈 下面這兩行把變數名稱改掉，就不會殺掉包裹列表的監聽了！
  if (adminInquiryUnsubscribe) adminInquiryUnsubscribe();

  adminInquiryUnsubscribe = onSnapshot(q, (snapshot) => {
    const count = snapshot.size;
    const badge = document.getElementById("adminPackageBadge");
    if (badge) {
      badge.innerText = count > 99 ? "99+" : count;
      badge.style.display = count > 0 ? "inline-flex" : "none";
    }
  });
}

function listenToAdminStudentAccountCount() {
  if (currentUser.role !== "admin") return;
  const q = query(collection(db, "roomRequests"), where("status", "==", "pending"));
  if (adminStudentAccountUnsubscribe) adminStudentAccountUnsubscribe();

  adminStudentAccountUnsubscribe = onSnapshot(q, (snapshot) => {
    const count = snapshot.size;
    const badge = document.getElementById("adminStudentAccountBadge");
    if (badge) {
      badge.innerText = count > 99 ? "99+" : count;
      badge.style.display = count > 0 ? "inline-flex" : "none";
    }
  });
}

// --- 損壞報修系統 ---
window.previewRepairRequest = async function(e) {
  e.preventDefault();
  const type = document.getElementById("repairType").value;
  const desc = document.getElementById("repairDesc").value.trim();
  const presenceElement = document.querySelector('input[name="repairPresence"]:checked');
  
  if (!presenceElement) {
      await window.showCustomAlert("err_no_presence");
      return;
  }
  
  const presence = presenceElement.value;
  window.currentRepairDraft = { type, desc, presence };

  const studentId = currentUser.studentId || (currentUser.email ? currentUser.email.split("@")[0] : "");
  
  const dispType = window.i18next.t(type === '室內' ? 'repair_indoor' : 'repair_public');
  const dispPresence = window.i18next.t(presence === '不需要' ? 'repair_presence_no_short' : 'repair_presence_yes_short');
  const roomStr = `${currentUser.room} / ${currentUser.bed}`;
  
  const lblName = window.i18next.t('lbl_name') + '：';
  const lblStudentId = window.i18next.t('lbl_student_id') + '：';
  const lblPhone = window.i18next.t('lbl_phone') + '：';
  const lblRoom = window.i18next.t('lbl_room_bed') + '：';
  const lblItem = window.i18next.t('lbl_repair_item') + '：';
  const lblDesc = window.i18next.t('lbl_damage_desc') + '：';
  const lblPresence = window.i18next.t('lbl_presence_req') + '：';

  const confirmHtml = `
    <div style="display: grid; grid-template-columns: 120px 1fr; gap: 12px; text-align: left;">
        <div style="color: #64748b; font-weight: bold;">${lblName}</div><div>${currentUser.name}</div>
        <div style="color: #64748b; font-weight: bold;">${lblStudentId}</div><div>${studentId}</div>
        <div style="color: #64748b; font-weight: bold;">${lblPhone}</div><div>${currentUser.phone}</div>
        <div style="color: #64748b; font-weight: bold;">${lblRoom}</div><div>${roomStr}</div>
    </div>
    <hr style="margin: 16px 0; border-top: 1px dashed #cbd5e1;">
    <div style="display: grid; grid-template-columns: 120px 1fr; gap: 12px; text-align: left;">
        <div style="color: #64748b; font-weight: bold;">${lblItem}</div><div style="color: #ef4444; font-weight: bold;">${dispType}</div>
        <div style="color: #64748b; font-weight: bold;">${lblDesc}</div><div>${desc}</div>
        <div style="color: #64748b; font-weight: bold;">${lblPresence}</div><div><span style="background: ${presence === '需要' ? '#fef08a' : '#d1fae5'}; color: #1f2937; padding: 4px 12px; border-radius: 6px; font-weight: bold;">${dispPresence}</span></div>
    </div>
  `;
  
  document.getElementById("repairConfirmData").innerHTML = confirmHtml;
  document.getElementById("repairConfirmModal").style.display = "flex";
};

window.closeRepairConfirmModal = function() {
  document.getElementById("repairConfirmModal").style.display = "none";
  window.currentRepairDraft = null;
};

window.submitRepairRequest = async function() {
  if (!window.currentRepairDraft) return;

  const btn = document.querySelector("#repairConfirmModal .btn-primary");
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerText = "處理中...";

  try {
    await addDoc(collection(db, "repairRequests"), {
      uid: currentUser.uid,
      name: currentUser.name,
      room: currentUser.room,
      bed: currentUser.bed,
      phone: currentUser.phone,
      type: window.currentRepairDraft.type,
      description: window.currentRepairDraft.desc,
      presence: window.currentRepairDraft.presence,
      status: "pending",
      timestamp: new Date().toISOString(),
      date: new Date().toISOString().split("T")[0]
    });
    
    window.closeRepairConfirmModal();
    document.getElementById("repairForm").reset();

    // 送出成功後，自動收起摺疊表單
    const container = document.getElementById('repairFormContainer');
    if (container) container.style.display = 'none';
    const toggleBtn = document.querySelector('button[onclick*="repairFormContainer"] .toggle-icon');
    if (toggleBtn) toggleBtn.innerText = '▼';

    await window.showCustomAlert("msg_repair_submitted");
    loadUserRepairRequests(); 
  } catch (error) {
    await window.showCustomAlert("送出失敗: " + error.message);
  }

  btn.disabled = false;
  btn.innerHTML = originalText;
};

window.loadUserRepairRequests = async function() {
  const list = document.getElementById("userRepairHistoryList");
  if (!list) return;

  try {
    const q = query(collection(db, "repairRequests"), where("uid", "==", currentUser.uid));
    const snap = await getDocs(q);
    let html = "";
    let requests = snap.docs.map(d => ({id: d.id, ...d.data()}));
    
    requests.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));

    const pendingCount = requests.filter(r => r.status === 'pending').length;
    const countEl = document.getElementById("repairPendingCount");
    if (countEl) countEl.textContent = pendingCount;

    if(requests.length === 0) {
        list.innerHTML = `<div style='text-align: center; color:#9ca3af; padding: 20px;'>${window.i18next.t('no_repair_history')}</div>`;
        return;
    }

    requests.forEach(req => {
      let statusKey = req.status === 'pending' ? 'repair_status_pending' : req.status === 'in_progress' ? 'repair_status_in_progress' : 'repair_status_completed';
      let statusText = window.i18next.t(statusKey);
      let statusColor = req.status === 'pending' ? '#f59e0b' : req.status === 'in_progress' ? '#3b82f6' : '#10b981';
      let statusBg = req.status === 'pending' ? '#fef3c7' : req.status === 'in_progress' ? '#eff6ff' : '#d1fae5';

      let dispType = window.i18next.t(req.type === '室內' ? 'repair_indoor' : 'repair_public');
      let dispPresence = window.i18next.t((req.presence.includes('需要') && req.presence !== '不需要') ? 'repair_presence_yes_short' : 'repair_presence_no_short');
      
      let lblItem = window.i18next.t('lbl_repair_item') + '：';
      let lblDesc = window.i18next.t('lbl_damage_desc') + '：';
      let lblPresenceReq = window.i18next.t('lbl_presence_req') + '：';
      let lblTime = window.i18next.t('lbl_requested_at') + '：';

      html += `
        <div style="border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
          <div style="background: #f8fafc; padding: 12px 16px; cursor: pointer; display: flex; justify-content: space-between; align-items: center;" onclick="document.getElementById('repair-detail-${req.id}').style.display = document.getElementById('repair-detail-${req.id}').style.display === 'none' ? 'block' : 'none'">
            <div style="font-weight: 600; color: #1e293b; display: flex; align-items: center; gap: 8px;">
              <span>📅 ${req.date}</span>
              <span class="repair-type-badge" style="border-radius: 12px;">${dispType}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 12px;">
              <span style="background: ${statusBg}; color: ${statusColor}; font-weight: bold; padding: 4px 10px; border-radius: 6px; font-size: 13px;">${statusText}</span>
              <span style="color: #9ca3af; font-size: 12px;">▼</span>
            </div>
          </div>
          <div id="repair-detail-${req.id}" style="display: none; padding: 16px; border-top: 1px solid #e5e7eb; background: white; font-size: 14px; line-height: 1.8;">
            <div style="display: grid; grid-template-columns: 150px 1fr; gap: 8px;">
                <div style="color: #64748b; font-weight: bold;">${lblItem}</div><div>${dispType}</div>
                <div style="color: #64748b; font-weight: bold;">${lblDesc}</div><div>${req.description}</div>
                <div style="color: #64748b; font-weight: bold;">${lblPresenceReq}</div><div>${dispPresence}</div>
                <div style="color: #64748b; font-weight: bold;">${lblTime}</div><div>${new Date(req.timestamp).toLocaleString()}</div>
            </div>
          </div>
        </div>
      `;
    });
    list.innerHTML = html;
  } catch(e) { console.error(e); }
};

window.loadAdminRepairRequests = async function() {
  const tbody = document.getElementById("adminRepairTableBody");
  if (!tbody) return;

  try {
    const snap = await getDocs(collection(db, "repairRequests"));
    let requests = snap.docs.map(d => ({id: d.id, ...d.data()}));
    requests.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));

    if(requests.length === 0) {
        tbody.innerHTML = "<tr><td colspan='5' style='text-align:center; padding: 20px; color: #9ca3af;'>目前無報修紀錄</td></tr>";
        return;
    }

    const isZh = window.i18next && window.i18next.language && window.i18next.language.startsWith('zh');

    let html = "";
    requests.forEach(req => {
      let optPending = isZh ? '等待處理' : 'Pending';
      let optInProgress = isZh ? '派工維修中' : 'In Progress';
      let optCompleted = isZh ? '已完成維修' : 'Completed';

      const statusSelect = `
        <select class="form-input" style="padding: 6px 10px; font-size: 14px; width: auto; font-weight: bold; cursor: pointer; background: ${req.status === 'pending' ? '#fef3c7' : req.status === 'in_progress' ? '#eff6ff' : '#d1fae5'}; color: ${req.status === 'pending' ? '#b45309' : req.status === 'in_progress' ? '#1d4ed8' : '#047857'}; border: 1px solid transparent;" onchange="updateRepairStatus('${req.id}', this.value, '${req.name}')">
          <option value="pending" ${req.status === 'pending' ? 'selected' : ''}>${optPending}</option>
          <option value="in_progress" ${req.status === 'in_progress' ? 'selected' : ''}>${optInProgress}</option>
          <option value="completed" ${req.status === 'completed' ? 'selected' : ''}>${optCompleted}</option>
        </select>
      `;

      let dispType = req.type === '室內' ? (isZh ? '室內' : 'Indoor') : (isZh ? '公共設施' : 'Public Facility');
      let dispPresence = req.presence.includes('需要') && req.presence !== '不需要' ? (isZh ? '需要' : 'Yes') : (isZh ? '不需要' : 'No');
      let roomStr = isZh ? `${req.room} 房 ${req.bed} 床` : `Rm ${req.room}, Bed ${req.bed}`;

      html += `
        <tr>
          <td><div style="font-weight: 600;">${req.date}</div><div style="font-size: 12px; color: #9ca3af;">${new Date(req.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div></td>
          <td>
            <div style="font-weight: bold; color: #1e293b;">👤 ${req.name}</div>
            <div style="color: #64748b; font-size: 13px;">${roomStr}</div>
            <div style="color: #64748b; font-size: 13px;">📞 ${req.phone}</div>
          </td>
          <td>
            <span class="repair-type-badge">${dispType}</span>
            <div style="margin-top: 6px; font-size: 14px; line-height: 1.5; max-width: 250px; word-wrap: break-word;">${req.description}</div>
          </td>
          <td><span style="background: ${req.presence.includes('需要') && req.presence !== '不需要' ? '#fef08a' : '#f1f5f9'}; padding: 4px 8px; border-radius: 6px; font-size: 13px; font-weight: 600; color: #1f2937;">${dispPresence}</span></td>
          <td>${statusSelect}</td>
        </tr>
      `;
    });
    tbody.innerHTML = html;
  } catch(e) { console.error("載入報修資料失敗", e); }
};

window.updateRepairStatus = async function(id, newStatus, studentName) {
    try {
        await updateDoc(doc(db, "repairRequests", id), { status: newStatus });
        
        // 根據狀態設定對應的 i18n Key
        let msgKey = newStatus === 'in_progress' ? 'NOTIF_REPAIR_IN_PROGRESS_MSG' : 
                     newStatus === 'completed' ? 'NOTIF_REPAIR_COMPLETED_MSG' : 
                     'NOTIF_REPAIR_PENDING_MSG';
        
        // 這是預設的中文訊息 (存進資料庫做備用)
        let msgZh = newStatus === 'in_progress' ? '您的損壞報修已被管理員受理，目前正在派工維修中。' : 
                    newStatus === 'completed' ? '您的損壞報修已經完成維修作業！' : 
                    '您的損壞報修狀態已變更為等待處理。';
        
        await addDoc(collection(db, "notifications"), {
            receiver: studentName, 
            type: "system", 
            titleKey: "NOTIF_REPAIR_UPDATE_TITLE",  // 這裡改成 i18n Key
            title: "🔧 損壞報修狀態更新", 
            messageKey: msgKey,                     // 這裡改成 i18n Key
            message: msgZh,
            params: {}, 
            read: false, 
            timestamp: new Date().toISOString()
        });
        
        loadAdminRepairRequests();
    } catch (e) {
        await window.showCustomAlert("狀態更新失敗: " + e.message);
    }
};

// --- 場地租借系統 ---
window.submitFacilityRequest = async function(e) {
  e.preventDefault();
  const btn = document.getElementById("facSubmitBtn");
  btn.disabled = true; btn.textContent = "處理中...";

  const club = document.getElementById("facClub").value.trim();
  const pic = document.getElementById("facPic").value.trim();
  const activity = document.getElementById("facActivity").value.trim();
  const phone = document.getElementById("facPhone").value.trim();
  const date = document.getElementById("facDate").value;
  const attendees = document.getElementById("facAttendees").value;
  const timeSlot = document.getElementById("facTimeSlot").value;
  let venue = document.getElementById("facVenue").value;
  if (venue === "other") venue = document.getElementById("facOtherVenue").value.trim();

  try {
    const q = query(collection(db, "facilityRequests"),
      where("venue", "==", venue), where("date", "==", date),
      where("timeSlot", "==", timeSlot), where("status", "in", ["pending", "approved"])
    );
    const snap = await getDocs(q);
    
    if (!snap.empty) {
      await window.showCustomAlert("facility_conflict");
      btn.disabled = false;
      btn.innerHTML = '<span data-i18n="btn_submit_rental">送出申請</span>';
      if(window.updateContent) window.updateContent();
      return;
    }

    await addDoc(collection(db, "facilityRequests"), {
      uid: currentUser.uid, studentName: currentUser.name, club: club, pic: pic,
      activity: activity, phone: phone, date: date, attendees: attendees,
      timeSlot: timeSlot, venue: venue, status: "pending", reason: "",
      regDate: new Date().toISOString().split("T")[0], timestamp: new Date().toISOString()
    });

    document.getElementById("facilityForm").reset();
    document.getElementById("otherVenueGroup").style.display = "none";
    
    // 送出成功後，自動收起摺疊表單
    const container = document.getElementById('facilityFormContainer');
    if (container) container.style.display = 'none';
    const toggleBtn = document.querySelector('button[onclick*="facilityFormContainer"] .toggle-icon');
    if (toggleBtn) toggleBtn.innerText = '▼';

    loadUserFacilityRequests();
    await window.showCustomAlert("msg_fac_submitted");
  } catch (error) {
    await window.showCustomAlert("申請失敗：" + error.message);
  }
  
  btn.disabled = false;
  btn.innerHTML = '<span data-i18n="btn_submit_rental">送出申請</span>';
  if(window.updateContent) window.updateContent();
};

const venueI18nMap = {
  "大AB1": "venue_big_ab1", "小AB1": "venue_small_ab1", "大CB1": "venue_big_cb1", "小CB1": "venue_small_cb1",
  "CD棟前近樓梯處(限借桌1張、椅2張)": "venue_cd_stairs", "EB1前空地": "venue_eb1_space"
};

function translateReason(reason) {
  if (!reason || !window.i18next) return reason;
  const reasonMap = {
    "已租借給其他單位": window.i18next.t("reject_rented"),
    "場地維修": window.i18next.t("reject_maintenance"),
    "場地不開放": window.i18next.t("reject_closed")
  };
  return reasonMap[reason] || reason; // 如果是"其他"手寫的原因，就直接顯示原文字
}

window.loadUserFacilityRequests = async function() {
  const tbody = document.getElementById("userFacilityTableBody");
  if (!tbody) return;

  try {
    const q = query(collection(db, "facilityRequests"), where("uid", "==", currentUser.uid));
    const snap = await getDocs(q);
    
    let html = "";
    const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    list.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    const pendingFacCount = list.filter(r => r.status === 'pending').length;
    const facCountEl = document.getElementById("facilityPendingCount");
    if (facCountEl) facCountEl.textContent = pendingFacCount;

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#9ca3af;">${window.i18next.t('no_facility_history')}</td></tr>`;
      return;
    }

    list.forEach(req => {
      let statusKey = req.status === "pending" ? "status_pending" : req.status === "approved" ? "status_approved" : "status_rejected";
      let statusClass = req.status === "pending" ? "status-pending" : req.status === "approved" ? "status-approved" : "status-rejected";
      let statusText = window.i18next ? window.i18next.t(statusKey) : req.status;
      let venueKey = venueI18nMap[req.venue];
      let displayVenue = (window.i18next && venueKey) ? window.i18next.t(venueKey) : req.venue;
      let displayReason = req.reason ? translateReason(req.reason) : "-";

      html += `
        <tr>
          <td>${req.date}</td>
          <td>${window.i18next ? window.i18next.t(req.timeSlot === "上午 (08:00-12:00)" ? "time_morning" : req.timeSlot === "下午 (13:00-17:00)" ? "time_afternoon" : req.timeSlot === "晚上 (18:00-22:00)" ? "time_evening" : "time_fullday") || req.timeSlot : req.timeSlot}</td>
          <td>${displayVenue}</td>
          <td>${req.activity}</td>
          <td><span class="status-badge ${statusClass}">${statusText}</span></td>
          <td>${displayReason}</td>
        </tr>
      `;
    });
    tbody.innerHTML = html;
  } catch (err) { console.error(err); }
};

window.loadAdminFacilityRequests = async function() {
  const listDiv = document.getElementById("adminFacilityApprovalList");
  if (!listDiv) return;

  try {
    const q = query(collection(db, "facilityRequests"), where("status", "==", "pending"));
    const snap = await getDocs(q);
    
    if (snap.empty) {
      listDiv.innerHTML = `<div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 16px;">目前沒有待處理的場地申請</div>`;
      return;
    }

    let html = "";
    snap.docs.forEach(docSnap => {
      const req = docSnap.data();
      html += `
        <div style="background: #f8fafc; padding: 20px; border-radius: 8px; border: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px;">
          <div>
            <div style="font-weight: 600; font-size: 18px; margin-bottom: 6px; color: #1e293b;">
              📝 ${req.activity} <span style="color: #64748b; font-size: 16px; font-weight: 400;">(社團/系級: ${req.club})</span>
            </div>
            <div style="color: #475569; font-size: 16px; line-height: 1.6;">
              <span style="color: #64748b;">場地:</span> <b>${req.venue}</b> | 
              <span style="color: #64748b;">日期/時段:</span> <b>${req.date} ${req.timeSlot}</b><br/>
              <span style="color: #64748b;">負責人:</span> ${req.pic} (${req.phone}) | 
              <span style="color: #64748b;">人數:</span> ${req.attendees}人
            </div>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-success" style="padding: 10px 20px; font-size: 16px;" onclick="approveFacilityRequest('${docSnap.id}', '${req.studentName}', '${req.venue}', '${req.date}')">核准</button>
            <button class="btn btn-danger" style="padding: 10px 20px; font-size: 16px;" onclick="rejectFacilityRequest('${docSnap.id}', '${req.studentName}', '${req.venue}', '${req.date}')">拒絕</button>
          </div>
        </div>
      `;
    });
    listDiv.innerHTML = html;
  } catch (err) { console.error(err); }
};

window.loadAdminFacilitySchedule = async function() {
  const tbody = document.getElementById("adminFacilityScheduleBody");
  if (!tbody) return;

  const dateFilter = document.getElementById("adminFacilityDateFilter").value;
  
  try {
    let q;
    if (dateFilter) {
      q = query(collection(db, "facilityRequests"), where("status", "==", "approved"), where("date", "==", dateFilter));
    } else {
      q = query(collection(db, "facilityRequests"), where("status", "==", "approved"));
    }
    const snap = await getDocs(q);
    
    let html = "";
    const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    list.sort((a, b) => new Date(a.date) - new Date(b.date)); 

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#9ca3af;">沒有排定的借用紀錄</td></tr>`;
      document.getElementById("adminFacilityPaginationControls").innerHTML = "";
      return;
    }

    const itemsPerPage = 10;
    const totalPages = Math.max(1, Math.ceil(list.length / itemsPerPage));
    if (window.currentFacPage > totalPages) window.currentFacPage = totalPages;
    
    const startIndex = (window.currentFacPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const currentItems = list.slice(startIndex, endIndex);

    currentItems.forEach(req => {
      html += `
        <tr>
          <td>${req.date}</td>
          <td>${req.timeSlot}</td>
          <td><b>${req.venue}</b></td>
          <td>${req.club}</td>
          <td>${req.pic}</td>
          <td>${req.phone}</td>
          <td><span class="status-badge status-approved">已核准</span></td>
        </tr>
      `;
    });
    tbody.innerHTML = html;

    renderFacPaginationControls(list.length, totalPages);
  } catch (err) { console.error(err); }
};

function renderFacPaginationControls(totalItems, totalPages) {
    const container = document.getElementById("adminFacilityPaginationControls");
    if (!container) return;
    container.innerHTML = "";

    const prevBtn = document.createElement("div");
    prevBtn.className = `page-item ${window.currentFacPage === 1 ? "disabled" : ""}`;
    prevBtn.innerHTML = "❮";
    prevBtn.onclick = () => { if (window.currentFacPage > 1) { window.currentFacPage--; window.loadAdminFacilitySchedule(); } };
    container.appendChild(prevBtn);

    for (let i = 1; i <= totalPages; i++) {
      const pageBtn = document.createElement("div");
      pageBtn.className = `page-item ${window.currentFacPage === i ? "active" : ""}`;
      pageBtn.innerHTML = i;
      pageBtn.onclick = () => { window.currentFacPage = i; window.loadAdminFacilitySchedule(); }
      container.appendChild(pageBtn);
    }

    const nextBtn = document.createElement("div");
    nextBtn.className = `page-item ${window.currentFacPage === totalPages ? "disabled" : ""}`;
    nextBtn.innerHTML = "❯";
    nextBtn.onclick = () => { if (window.currentFacPage < totalPages) { window.currentFacPage++; window.loadAdminFacilitySchedule(); } };
    container.appendChild(nextBtn);
}

window.approveFacilityRequest = async function(id, studentName, venue, date) {
  const ok = await window.showCustomConfirm("confirm_approve_fac");
  if(!ok) return;
  try {
    await updateDoc(doc(db, "facilityRequests", id), { status: "approved" });
    await addDoc(collection(db, "notifications"), {
      receiver: studentName, type: "system", titleKey: "NOTIF_FAC_APPROVED_TITLE",
      messageKey: "NOTIF_FAC_APPROVED_MSG", params: { venue: venue, date: date },
      read: false, timestamp: new Date().toISOString(),
    });
    await window.showCustomAlert("已核准該申請！");
    loadAdminFacilityRequests();
    loadAdminFacilitySchedule();
  } catch (e) { await window.showCustomAlert("Error: " + e.message); }
};

window.rejectFacilityRequest = function(id, studentName, venue, date) {
  currentRejectRequest = { id, studentName, venue, date };
  document.getElementById("rejectFacilityReason").value = "";
  document.getElementById("rejectFacilityOtherReason").value = "";
  document.getElementById("otherRejectReasonGroup").style.display = "none";
  document.getElementById("rejectFacilityModal").style.display = "flex";
};

window.closeRejectFacilityModal = function() {
  document.getElementById("rejectFacilityModal").style.display = "none";
  currentRejectRequest = null;
};

window.submitRejectFacility = async function(e) {
  e.preventDefault();
  if (!currentRejectRequest) return;
  
  let reason = document.getElementById("rejectFacilityReason").value;
  if (reason === "其他") {
    reason = document.getElementById("rejectFacilityOtherReason").value.trim();
  }

  try {
    // 存入 facilityRequests 資料庫的還是保留中文
    await updateDoc(doc(db, "facilityRequests", currentRejectRequest.id), { 
      status: "rejected", reason: reason
    });

    // 👇 這裡我們把丟進通知裡的 reason 用 translateReason 轉換一下
    // 這樣如果是固定選項，通知裡的變數就會被轉成本地語言 (或確保學生讀取時是被翻譯過的)
    let notifyReason = translateReason(reason);

    await addDoc(collection(db, "notifications"), {
      receiver: currentRejectRequest.studentName, type: "system", titleKey: "NOTIF_FAC_DECLINED_TITLE",
      messageKey: "NOTIF_FAC_DECLINED_MSG", 
      params: { venue: currentRejectRequest.venue, date: currentRejectRequest.date, reason: notifyReason }, // 👇 更新這裡
      read: false, timestamp: new Date().toISOString(),
    });
    await window.showCustomAlert("已成功拒絕該申請，並通知學生！");
    closeRejectFacilityModal();
    loadAdminFacilityRequests();
  } catch (e) { await window.showCustomAlert("Error: " + e.message); }
};

// --- 設定與學生資料管理 ---
window.loadRoomRequests = async function () {
  const approvalList = document.getElementById("approvalList");
  if (!approvalList) return;

  try {
    const q = query(collection(db, "roomRequests"), where("status", "==", "pending"));
    const querySnapshot = await getDocs(q);
    let requestsHtml = "";
    querySnapshot.forEach((docSnap) => {
      const req = docSnap.data();
      requestsHtml += `
        <div style="background: #f8fafc; padding: 20px; border-radius: 8px; border: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px;">
          <div>
            <div style="font-weight: 600; font-size: 18px; margin-bottom: 6px; color: #1e293b;">
              👤 ${req.name} <span style="color: #64748b; font-size: 16px; font-weight: 400;">(學號: ${req.studentId || "N/A"})</span>
            </div>
            <div style="color: #475569; font-size: 16px; line-height: 1.6;">
              <span style="color: #64748b;">原房號/床號:</span> <span style="margin-right: 8px;">${req.oldRoom} (床位 ${req.oldBed})</span><br/>
              <span style="color: #2563eb; font-weight: 600; font-size: 18px;">➔ 申請更改為: ${req.newRoom} (床位 ${req.newBed})</span>
            </div>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-success" style="padding: 10px 20px; font-size: 16px;" onclick="approveRequest('${docSnap.id}', '${req.uid}', '${req.newRoom}', '${req.newBed}', '${req.name}')">批准</button>
            <button class="btn btn-danger" style="padding: 10px 20px; font-size: 16px;" onclick="rejectRequest('${docSnap.id}', '${req.name}')">拒絕</button>
          </div>
        </div>
      `;
    });
    if (requestsHtml !== "") approvalList.innerHTML = requestsHtml;
    else approvalList.innerHTML = `<div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 16px;">目前沒有待處理的申請</div>`;
  } catch (error) { console.error(error); }
};

window.approveRequest = async function (requestId, userUid, newRoom, newBed, userName) {
  const ok = await window.showCustomConfirm("confirm_approve_room");
  if(!ok) return;
  try {
    await updateDoc(doc(db, "users", userUid), { room: newRoom, bed: newBed });
    await updateDoc(doc(db, "roomRequests", requestId), { status: "approved" });
    await addDoc(collection(db, "notifications"), {
      receiver: userName, type: "system", titleKey: "NOTIF_ROOM_APPROVED_TITLE",
      messageKey: "NOTIF_ROOM_APPROVED_MSG", params: { room: newRoom, bed: newBed },
      read: false, timestamp: new Date().toISOString(),
    });
    await window.showCustomAlert("已成功批准申請！");
    loadRoomRequests();
  } catch (error) { await window.showCustomAlert("Error: " + error.message); }
};

window.rejectRequest = async function (requestId, userName) {
  const ok = await window.showCustomConfirm("confirm_reject_room");
  if(!ok) return;
  try {
    await updateDoc(doc(db, "roomRequests", requestId), { status: "rejected" });
    await addDoc(collection(db, "notifications"), {
      receiver: userName, type: "system", titleKey: "NOTIF_ROOM_DECLINED_TITLE",
      messageKey: "NOTIF_ROOM_DECLINED_MSG", params: {}, read: false, timestamp: new Date().toISOString(),
    });
    await window.showCustomAlert("已拒絕該申請！");
    loadRoomRequests();
  } catch (error) { await window.showCustomAlert("Error: " + error.message); }
};

window.updatePhone = async function () {
  const phoneInput = document.getElementById("settingsPhone");
  if (!phoneInput) return await window.showCustomAlert("System Error!");
  const newPhone = phoneInput.value.trim();
  if (!newPhone) return await window.showCustomAlert("Phone number cannot be empty!");
  try {
    await updateDoc(doc(db, "users", currentUser.uid), { phone: newPhone });
    currentUser.phone = newPhone;
    updateProfileUI();
    await window.showCustomAlert("Phone number updated successfully");
  } catch (error) { await window.showCustomAlert("Failed to update phone number: " + error.message); }
};

window.submitForceChangePassword = async function () {
  const newPass = document.getElementById("forceNewPassword").value;
  const confirmPass = document.getElementById("forceConfirmPassword").value;
  if (newPass.length < 6) return await window.showCustomAlert("Password must be at least 6 characters.");
  if (newPass !== confirmPass) return await window.showCustomAlert("Passwords do not match.");
  try {
    await updatePassword(auth.currentUser, newPass);
    await updateDoc(doc(db, "users", currentUser.uid), { mustChangePassword: false });
    await window.showCustomAlert("Password updated successfully!");
    document.getElementById("forceChangePasswordModal").style.display = "none";
    currentUser.mustChangePassword = false;
    document.getElementById("mainApp").style.display = "block";
    initializeAppUI();
    window.loadAIChatbot();
  } catch (error) { await window.showCustomAlert("Error: " + error.message); }
};

window.changePassword = async function (event) {
  const currentPwd = document.getElementById("currentPassword").value;
  const newPwd = document.getElementById("newPassword").value;
  const confirmPwd = document.getElementById("confirmPassword").value;
  if (!currentPwd || !newPwd || !confirmPwd) return await window.showCustomAlert("Please fill in all password fields.");
  if (newPwd !== confirmPwd) return await window.showCustomAlert("New password and confirm password do not match!");
  if (newPwd.length < 6) return await window.showCustomAlert("New password must be at least 6 characters long.");
  const user = auth.currentUser;
  try {
    const btn = event ? event.target : document.querySelector("button[onclick*='changePassword']");
    let originalText = btn ? btn.textContent : "";
    if (btn) { btn.textContent = "Updating..."; btn.disabled = true; }
    const credential = EmailAuthProvider.credential(user.email, currentPwd);
    await reauthenticateWithCredential(user, credential);
    await updatePassword(user, newPwd);
    await window.showCustomAlert("Password changed successfully!");
    document.getElementById("currentPassword").value = "";
    document.getElementById("newPassword").value = "";
    document.getElementById("confirmPassword").value = "";
    if (btn) { btn.textContent = originalText; btn.disabled = false; }
  } catch (error) {
    if (error.code === "auth/invalid-credential" || error.code === "auth/wrong-password") {
      await window.showCustomAlert("Current password is incorrect. Please try again.");
    } else { await window.showCustomAlert("Error: " + error.message); }
    const btn = event ? event.target : document.querySelector("button[onclick*='changePassword']");
    if (btn) btn.disabled = false;
  }
};

window.importStudents = async function () {
  const fileInput = document.getElementById("importStudentFile");
  const file = fileInput.files[0];
  if (!file) return await window.showCustomAlert("請先選擇一個 JSON 檔案。");
  const reader = new FileReader();
  reader.onload = async function (e) {
    const loader = document.getElementById("pageLoader");
    let studentsData;
    try {
      studentsData = JSON.parse(e.target.result);
      if (studentsData.students) studentsData = studentsData.students;
      if (!Array.isArray(studentsData)) return await window.showCustomAlert("❌ JSON 格式錯誤");
    } catch (err) { return await window.showCustomAlert("❌ 檔案格式錯誤"); }
    try {
      if (loader) loader.classList.add("show");
      const response = await fetch(`${BACKEND_URL}/api/admin/import-students`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ students: studentsData }),
      });
      const result = await response.json();
      if (loader) loader.classList.remove("show");
      if (response.ok && result.success) {
        await window.showCustomAlert(`✅ 成功匯入 ${result.count} 筆學生資料！`); fileInput.value = "";
      } else { await window.showCustomAlert("❌ 匯入失敗：" + result.error); }
    } catch (err) {
      if (loader) loader.classList.remove("show"); await window.showCustomAlert("❌ API 請求失敗");
    }
  };
  reader.readAsText(file);
};

window.logout = async function () {
  const ok = await window.showCustomConfirm("confirm_logout");
  if (ok) { signOut(auth).then(() => { window.location.reload(); }); }
};

// --- UI Navigation & Notifications ---
window.showPage = showPage;
window.toggleSidebar = toggleSidebar;
window.closeSidebar = closeSidebar;
window.toggleNotifications = toggleNotifications;
window.markAllRead = markAllRead;
window.markAsRead = markAsRead;

function initializeAppUI() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
  window.addEventListener("focus", () => {
    document.title = window.i18next ? window.i18next.t("title") : "Dormitory Management System";
  });
  updateProfileUI();
  fetchNotifications();
  
  // 啟動包裹真・即時更新
  window.listenToPackages();
  window.listenToInternalAnnouncements();

  if (currentUser.role === "admin") {
    listenToAdminRepairCount(); 
    listenToAdminFacilityCount();        
    listenToAdminPackageCount();        
    listenToAdminStudentAccountCount();
    showPage("packageAdmin");
    if (typeof window.loadRoomRequests === "function") window.loadRoomRequests();
    if (typeof window.loadAdminInquiries === "function") window.loadAdminInquiries();
    if (typeof window.loadAdminFacilityRequests === "function") window.loadAdminFacilityRequests();
    if (typeof window.loadAdminFacilitySchedule === "function") window.loadAdminFacilitySchedule();
    if (typeof window.loadAdminRepairRequests === "function") window.loadAdminRepairRequests();
  } else {
    showPage("dashboard");
    if (typeof window.loadAnnouncements === "function") window.loadAnnouncements();
    if (typeof window.loadUserFacilityRequests === "function") window.loadUserFacilityRequests();
    if (typeof window.loadUserRepairRequests === "function") window.loadUserRepairRequests();
  }
}

function renderPaginationControls(totalItems, containerId, renderCallback) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = "";
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));

  const prevBtn = document.createElement("div");
  prevBtn.className = `page-item ${currentPage === 1 ? "disabled" : ""}`;
  prevBtn.innerHTML = "❮";
  prevBtn.onclick = () => { if (currentPage > 1) { currentPage--; renderCallback(false); } };
  container.appendChild(prevBtn);

  for (let i = 1; i <= totalPages; i++) {
    const pageBtn = document.createElement("div");
    pageBtn.className = `page-item ${currentPage === i ? "active" : ""}`;
    pageBtn.innerHTML = i;
    pageBtn.onclick = () => { currentPage = i; renderCallback(false); }
    container.appendChild(pageBtn);
  }

  const nextBtn = document.createElement("div");
  nextBtn.className = `page-item ${currentPage === totalPages ? "disabled" : ""}`;
  nextBtn.innerHTML = "❯";
  nextBtn.onclick = () => { if (currentPage < totalPages) { currentPage++; renderCallback(false); } };
  container.appendChild(nextBtn);
}

function showPage(pageName, event) {
  const loader = document.getElementById(`pageLoader`);
  if (loader) loader.classList.add(`show`);
  setTimeout(() => {
    if (pageName === "laundryUser") window.loadLaundryData();
    
    const pages = [`dashboard`, `packageUser`, `facilityUser`, `repairUser`, `laundryUser`, `settings`, `faq`, `packageAdmin`, `facilityAdmin`, `repairAdmin`, `studentAccountAdmin`, `annAdmin`]; 
    const menuItems = document.querySelectorAll(`.sidebar-menu-item`);
    pages.forEach((page) => {
      const el = document.getElementById(page + `Page`);
      if (el) el.style.display = `none`;
    });
    menuItems.forEach((item) => item.classList.remove(`active`));
    const targetPage = document.getElementById(pageName + `Page`);
    if (targetPage) targetPage.style.display = `block`;

    if (event && event.target) {
      const menuItem = event.target.closest(`.sidebar-menu-item`);
      if (menuItem) menuItem.classList.add(`active`);
    } else {
      const defaultMenu = document.getElementById(`nav-` + pageName);
      if (defaultMenu) defaultMenu.classList.add(`active`);
    }

    const titles = { dashboard: `Home`, packageUser: `My Packages`, facilityUser: `Facility Rental`, repairUser: `Repair Request`, settings: `User Settings`, faq: `FAQ`, packageAdmin: `包裹管理`, facilityAdmin: `場地租借`, repairAdmin: `損壞報修管理`, studentAccountAdmin: `學生帳號`, annAdmin: `公告管理` };
    const pageTitle = document.getElementById(`pageTitle`);
    if (pageTitle) {
      if (currentUser.role === "admin") {
        pageTitle.textContent = titles[pageName];
      } else {
        pageTitle.setAttribute("data-i18n", pageName === "dashboard" ? "home" : pageName === "packageUser" ? "my_packages" : pageName === "facilityUser" ? "facility_rental" : pageName === "repairUser" ? "nav_repair" : pageName === "laundryUser" ? "nav_laundry" : pageName);
        if (window.updateContent) window.updateContent();
      }
    }
    if (window.innerWidth <= 768) closeSidebar();
    if (loader) loader.classList.remove(`show`);
  }, 1000);
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('overlay');
  const mainContent = document.getElementById('mainContent');

  if (window.innerWidth <= 768) {
    // 手機版邏輯：滑出側邊欄並顯示黑色遮罩
    sidebar.classList.toggle('mobile-show');
    overlay.classList.toggle('show');
  } else {
    // 電腦版邏輯：隱藏側邊欄，主內容區塊往左延展 (不顯示遮罩)
    sidebar.classList.toggle('collapsed');
    mainContent.classList.toggle('expanded');
  }
}
function closeSidebar() {
  document.getElementById(`sidebar`).classList.remove(`mobile-show`);
  document.getElementById(`overlay`).classList.remove(`show`);
}
function toggleNotifications() {
  document.getElementById(`notificationPanel`).classList.toggle(`show`);
  renderNotifications();
  document.title = window.i18next ? window.i18next.t("title") : "Dormitory Management System";
}

function fetchNotifications() {
  if (!currentUser || !currentUser.name) return;

  // 避免 setInterval 重複建立監聽器，如果已經連線了就直接 return
  if (notifUnsubscribe) return;

  const q = query(
    collection(db, "notifications"), 
    where("receiver", "==", currentUser.name)
  );

  // 啟動 Firestore 即時監聽 (一有新通知瞬間觸發)
  notifUnsubscribe = onSnapshot(q, (snapshot) => {
    let all = [];
    snapshot.forEach((doc) => {
      all.push({ id: doc.id, ...doc.data() });
    });

    // 依照時間反向排序 (最新的在最上面)
    all.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // --- 檢查是否有「開著網頁時才送來」的新通知 ---
    if (!isFirstFetch && currentUser.role === "student") {
      const newNotifs = all.filter(n => !n.read && !previousNotificationIds.has(n.id));

      if (newNotifs.length > 0) {
        // 1. 更改 Google Tab 的標題 (加上 🔔 提示)
        document.title = `(${newNotifs.length}) 🔔 新通知 New Notification!`;

        // 2. 如果瀏覽器有給權限，推播桌面/系統通知
        if ("Notification" in window && Notification.permission === "granted") {
          const latest = newNotifs[0]; // 拿最新的一則通知來顯示
          let notifTitle = latest.titleKey && window.i18next ? window.i18next.t(latest.titleKey, latest.params) : (latest.title || "新通知");
          let notifMsg = latest.messageKey && window.i18next ? window.i18next.t(latest.messageKey, latest.params) : (latest.message || "您有新的宿舍通知");
          
          new Notification(notifTitle, {
            body: notifMsg,
            icon: "./images/notifications.png"
          });
        }
      }
    }

    // 更新追蹤名單，把現在抓到的所有 ID 記下來
    previousNotificationIds = new Set(all.map(n => n.id));
    isFirstFetch = false;

    notifications = all;
    updateNotificationBadges();

    // 如果使用者的通知面板剛好是打開的狀態，即時刷新裡面的畫面
    const panel = document.getElementById("notificationPanel");
    if (panel && panel.classList.contains("show")) {
      renderNotifications();
    }
  }, (error) => {
    console.error("監聽通知失敗:", error);
  });
}

function updateNotificationBadges() {
  const unreadCount = notifications.filter((n) => !n.read).length;
  const badge = document.getElementById("notificationBadge");
  if (badge) {
    badge.style.display = unreadCount > 0 ? "flex" : "none";
    badge.textContent = unreadCount;
  }
  const el = document.getElementById(`unreadCount`);
  if (el) el.textContent = unreadCount;
}

window.renderNotifications = function() {
  const list = document.getElementById(`notificationList`);
  if (!list) return;

  if (notifications.length === 0) {
    list.innerHTML = `<div style="padding:20px; text-align:center; color:#999;">${window.i18next.t("NOTIF_NONE")}</div>`;
    return;
  }

  list.innerHTML = notifications.map((n) => {
      let finalTitle = n.titleKey ? window.i18next.t(n.titleKey, n.params) : (n.title || "");
      let finalMessage = n.messageKey ? window.i18next.t(n.messageKey, n.params) : (n.message || "");
      let timeString = n.timestamp ? getTimeAgo(n.timestamp) : "";

      return `
      <div class="notification-item ${n.read ? `` : `unread`}" onclick="handleNotificationClick('${n.id}')" style="position: relative; cursor: pointer;">
          <div style="display: flex; gap: 12px; align-items: center;">
              <div style="flex: 1;">
                  <div style="font-weight: 600;">${finalTitle}</div>
                  <div style="font-size: 14px; color: #6B7280; margin-bottom: 4px;">${finalMessage}</div>
                  <div style="font-size: 12px; color: #9CA3AF; margin-top: 6px;"> ${timeString}</div>
              </div>
              ${!n.read ? `<div style="width: 8px; height: 8px; border-radius: 50%; background: #4A90E2;"></div>` : ``}
              <div class="delete-btn" onclick="deleteNotification('${n.id}', event)" style="z-index: 10;">✕</div>
          </div>
      </div>
      `;
  }).join(``);
};

window.clearAllNotifications = async function () {
  if (notifications.length === 0) return;
  const ok = await window.showCustomConfirm("confirm_clear_notif");
  if (!ok) return;

  try {
    await fetch(`${BACKEND_URL}/api/notifications/all/${encodeURIComponent(currentUser.name)}`, { method: "DELETE" });
    notifications = [];
    renderNotifications();
    updateNotificationBadges();
  } catch (error) { console.error("刪除全部通知失敗:", error); }
};

window.deleteNotification = async function (id, event) {
  event.stopPropagation();
  try {
    await fetch(`${BACKEND_URL}/api/notifications/${id}`, { method: "DELETE" });
    notifications = notifications.filter(n => n.id !== id);
    renderNotifications();
    updateNotificationBadges();
  } catch (error) { console.error("刪除通知失敗:", error); }
};

async function markAllRead() {
  notifications.forEach((n) => (n.read = true));
  renderNotifications();
  await fetch(`${BACKEND_URL}/api/notifications/read-all`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ receiver: currentUser.name }),
  });
  updateNotificationBadges();
}

function markAsRead(id) {
  const n = notifications.find((n) => n.id === id);
  if (n) { 
    n.read = true; 
    renderNotifications(); 
    updateNotificationBadges();
  }
}

// --- 包裹系統 ---
window.filterPackages = function(status) {
  currentPackageFilter = status;
  currentPage = 1;
  renderPackages(status);
}

window.reRenderCurrentPackages = function () {
  if (currentUser.role !== "admin") renderPackages(currentPackageFilter, false);
};

// --- 包裹系統即時監聽 ---
window.listenToPackages = function() {
  if (adminPackageUnsubscribe) adminPackageUnsubscribe();
  
  let q = collection(db, "packages");
  if (currentUser.role === "student") {
    q = query(q, where("receiver", "==", currentUser.name));
  }

  // 只要資料庫有變動，這個函數就會瞬間被觸發
  adminPackageUnsubscribe = onSnapshot(q, (snapshot) => {
    packages = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    // 即時重新渲染畫面
    if (currentUser.role === "admin") {
      renderAdminPackages(false);
    } else {
      renderPackages(currentPackageFilter, false);
    }
  });
};

async function renderPackages(filter = currentPackageFilter, showLoading = false) {
  const list = document.getElementById(`packageList`);
  if (!list) return;
  if (showLoading) list.innerHTML = "<div>Loading...</div>";
  
  const arrivedTab = document.getElementById("arrivedTab");
  const receivedTab = document.getElementById("receivedTab");
  if(arrivedTab) arrivedTab.style.borderBottom = "3px solid transparent";
  if(receivedTab) receivedTab.style.borderBottom = "3px solid transparent";
  
  const activeTab = document.getElementById(filter + "Tab");
  if(activeTab) activeTab.style.borderBottom = `3px solid #4A90E2`;

  let display = packages.filter((p) => p.receiver === currentUser.name && p.status === filter);
  const count = packages.filter((p) => p.receiver === currentUser.name && p.status === `arrived`).length;
  if (document.getElementById(`activePackageCount`)) document.getElementById(`activePackageCount`).textContent = count;

  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentItems = display.slice(startIndex, endIndex);

  if (display.length === 0) {
    list.innerHTML = `<div style="text-align: center; padding: 40px; color: #9ca3af;">${window.i18next ? window.i18next.t("no_packages") : "No packages"}</div>`;
  } else {
    list.innerHTML = currentItems.map((p) => {
      let courierKey = courierI18nMap[p.courier];
      let displayCourier = (window.i18next && courierKey) ? window.i18next.t(courierKey) : p.courier;

      return `
      <div class="card" style="background: #F9FAFB; margin-bottom: 16px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
              <div>
                <div style="font-weight: 600; font-size: 18px;">${displayCourier}</div>
                <div style="color: #6B7280;">${window.i18next ? window.i18next.t("tracking") : "Tracking"}: ${p.tracking}</div>
              </div>
              <span class="status-badge status-${p.status}">${window.i18next ? window.i18next.t(p.status).toUpperCase() : p.status.toUpperCase()}</span>
          </div>
          <div style="color: #9ca3af; font-size: 14px;">${window.i18next ? window.i18next.t("registered_on") : "Registered on"}: ${p.registeredDate || "N/A"}</div>
      </div>
      `;
    }).join("");
  }
  renderPaginationControls(display.length, "paginationControls", () => renderPackages(filter, false));
}

document.getElementById("adminSearchInput")?.addEventListener("input", () => { currentPage = 1; renderAdminPackages(false); });
document.getElementById("adminStatusFilter")?.addEventListener("change", () => { currentPage = 1; renderAdminPackages(false); });
document.getElementById("adminSearchField")?.addEventListener("change", () => { currentPage = 1; renderAdminPackages(false); });

window.updateAdminSearchPlaceholder = function() {
    const field = document.getElementById("adminSearchField")?.value;
    const input = document.getElementById("adminSearchInput");
    if (!input) return;
    
    if (field === 'name') input.placeholder = "請輸入姓名 (例: 吳勇謙)...";
    else if (field === 'room') input.placeholder = "請輸入房號 (例: 1216)...";
    else if (field === 'phone') input.placeholder = "請輸入電話全碼或後3碼...";
    else if (field === 'tracking') input.placeholder = "請輸入物流單號...";
    else input.placeholder = "可搜尋：房號、姓名、電話 或 物流單號...";
    
    currentPage = 1;
    renderAdminPackages(false);
};

window.adminRegisterPackage = async function (e) {
  e.preventDefault();
  const room = document.getElementById("adminAddRoom").value.trim();
  const bed = document.getElementById("adminAddBed").value.trim();
  const tracking = document.getElementById("adminAddTracking").value.trim();
  const courier = document.getElementById("adminAddCourier").value;

  const btn = document.getElementById("adminAddPkgBtn");
  btn.disabled = true; btn.textContent = "查詢與發送中...";

  try {
    const q = query(collection(db, "users"), where("room", "==", room), where("bed", "==", bed));
    const snap = await getDocs(q);

    if (snap.empty) {
      await window.showCustomAlert("❌ 找不到該房號與床位的學生資料！請確認輸入是否正確。");
      btn.disabled = false; btn.textContent = "登記並通知";
      return;
    }

    const userData = snap.docs[0].data();

    const p = {
      tracking: tracking, courier: courier, status: "arrived", receiver: userData.name, 
      room: userData.room, phone: userData.phone, fragile: false, refrigeration: false,
      registeredDate: new Date().toISOString().split("T")[0],
    };

    const res = await fetch(`${BACKEND_URL}/api/packages`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p),
    });

    if (res.ok) {
      await window.showCustomAlert(`✅ 包裹已成功新增，並已發送通知給學生：${userData.name}`);
      document.getElementById("adminAddRoom").value = "";
      document.getElementById("adminAddBed").value = "";
      document.getElementById("adminAddTracking").value = ""; 
      renderAdminPackages(false);
    } else { throw new Error("伺服器回應錯誤"); }
  } catch (err) { await window.showCustomAlert("❌ 處理失敗: " + err.message); }
  btn.disabled = false; btn.textContent = "登記並通知";
};

window.showBatchRegisterModal = function() {
  document.getElementById("batchRegisterModal").style.display = "flex";
  batchPackageList = [];
  renderBatchList();
  
  document.getElementById("batchRoom").value = "";
  document.getElementById("batchBed").value = "";
  document.getElementById("batchTracking").value = "";
  setTimeout(() => document.getElementById("batchRoom").focus(), 100);
}

window.closeBatchRegisterModal = function() {
  document.getElementById("batchRegisterModal").style.display = "none";
}

window.addPackageToBatchList = function(e) {
  e.preventDefault();
  const room = document.getElementById("batchRoom").value.trim();
  const bed = document.getElementById("batchBed").value.trim();
  const tracking = document.getElementById("batchTracking").value.trim();
  const courier = document.getElementById("batchCourier").value;

  batchPackageList.push({ room, bed, tracking, courier });
  renderBatchList();

  document.getElementById("batchRoom").value = "";
  document.getElementById("batchBed").value = "";
  document.getElementById("batchTracking").value = "";
  document.getElementById("batchRoom").focus();
}

window.removeBatchItem = function(index) {
  batchPackageList.splice(index, 1);
  renderBatchList();
}

window.renderBatchList = function() {
  const container = document.getElementById("batchPackageListContainer");
  const submitBtn = document.getElementById("submitBatchBtn");
  
  submitBtn.textContent = `確認並送出全部 (${batchPackageList.length})`;
  submitBtn.disabled = batchPackageList.length === 0;

  if (batchPackageList.length === 0) {
    container.innerHTML = `<p style="text-align: center; color: #9ca3af; font-size: 14px; margin: 10px 0;">目前無暫存包裹</p>`;
    return;
  }

  container.innerHTML = batchPackageList.map((p, i) => `
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; border-bottom: 1px solid #e5e7eb;">
      <div style="font-size: 14px; color: #374151;">
        <b>房 ${p.room}-${p.bed}</b> | 📦 ${p.tracking} (${p.courier})
      </div>
      <button class="btn btn-danger" style="padding: 4px 8px; font-size: 12px; background-color: #ef4444; border: none;" onclick="removeBatchItem(${i})">刪除</button>
    </div>
  `).join("");
}

window.submitBatchPackages = async function() {
  if (batchPackageList.length === 0) return;
  const btn = document.getElementById("submitBatchBtn");
  btn.disabled = true; btn.textContent = "處理中，請稍候...";

  let successCount = 0; let failCount = 0; let failDetails = [];

  for (let i = 0; i < batchPackageList.length; i++) {
    const pkg = batchPackageList[i];
    try {
      const q = query(collection(db, "users"), where("room", "==", pkg.room), where("bed", "==", pkg.bed));
      const snap = await getDocs(q);

      if (snap.empty) {
        failCount++;
        failDetails.push(`房號 ${pkg.room}-${pkg.bed} (單號: ${pkg.tracking}) 找不到對應學生`);
        continue;
      }

      const userData = snap.docs[0].data();
      const p = {
        tracking: pkg.tracking, courier: pkg.courier, status: "arrived", receiver: userData.name,
        room: userData.room, phone: userData.phone, fragile: false, refrigeration: false,
        registeredDate: new Date().toISOString().split("T")[0],
      };

      const res = await fetch(`${BACKEND_URL}/api/packages`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p),
      });

      if (res.ok) successCount++;
      else { failCount++; failDetails.push(`單號: ${pkg.tracking} 伺服器回傳錯誤`); }
    } catch(err) { failCount++; failDetails.push(`單號: ${pkg.tracking} 發生系統異常`); }
  }

  let msg = `✅ 批量處理完成！\n成功登記並通知: ${successCount} 筆`;
  if (failCount > 0) msg += `\n\n❌ 失敗: ${failCount} 筆\n詳細錯誤:\n${failDetails.join("\n")}`;
  
  await window.showCustomAlert(msg);
  closeBatchRegisterModal();
  renderAdminPackages(false);
  
  btn.disabled = false;
  btn.textContent = `確認並送出全部 (${batchPackageList.length})`;
}

async function renderAdminPackages(showLoading = false) {
  const tbody = document.getElementById("adminPackageTableBody");
  if (!tbody) return;

  const arrivedEl = document.getElementById("adminArrivedCount");
  if (arrivedEl) arrivedEl.textContent = packages.filter((p) => p.status === "arrived").length;
  
  const receivedEl = document.getElementById("adminReceivedCount");
  if (receivedEl) receivedEl.textContent = packages.filter((p) => p.status === "received").length;

  let display = packages;
  const term = document.getElementById("adminSearchInput")?.value.toLowerCase();
  const status = document.getElementById("adminStatusFilter")?.value;
  const searchField = document.getElementById("adminSearchField")?.value || "all";

  if (term) {
    display = display.filter((p) => {
      if (searchField === 'name') return (p.receiver || "").toLowerCase().includes(term);
      if (searchField === 'room') return (p.room || "").includes(term);
      if (searchField === 'phone') return (p.phone && p.phone.includes(term));
      if (searchField === 'tracking') return (p.tracking || "").toLowerCase().includes(term);
      
      return (p.receiver || "").toLowerCase().includes(term) || 
             (p.tracking || "").toLowerCase().includes(term) || 
             (p.room || "").includes(term) ||
             (p.phone && p.phone.includes(term));
    });
  }
  
  if (status && status !== "all") {
    display = display.filter((p) => p.status === status);
  }

  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentItems = display.slice(startIndex, endIndex);

  const statusMap = { arrived: "已到達", received: "已領取" };

  if (currentItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color: #9ca3af;">目前沒有包裹紀錄</td></tr>`;
  } else {
    tbody.innerHTML = currentItems.map((p) => {
      let displayCourier = getCourierZh(p.courier);
      
      return `
      <tr>
          <td><span style="font-weight: 600;">${p.registeredDate || "N/A"}</span></td>
          <td>${p.receiver || "N/A"}</td>
          <td>${p.room || "N/A"}</td>
          <td>${p.phone ? p.phone.slice(-3) : "N/A"}</td>
          <td>${p.tracking || "N/A"}</td>
          <td>${displayCourier || "N/A"}</td>
          <td><span class="status-badge status-${p.status}">${statusMap[p.status] || (p.status || "").toUpperCase()}</span></td>
          <td>
              ${p.status === "arrived" ? `<button class="btn btn-primary" style="padding: 6px 12px; font-size: 13px;" onclick="window.markPackageReceived('${p.id}')">標為已領取</button>` : ""}
              ${p.status === "received" ? `<button class="btn btn-danger" style="padding: 6px 12px; font-size: 13px; background-color: #f59e0b; border: none; color: white;" onclick="window.revertToArrived('${p.id}')">↺ 轉回已到達</button>` : ""}
          </td>
      </tr>
      `;
    }).join("");
  }
  
  renderPaginationControls(display.length, "adminPaginationControls", () => renderAdminPackages(false));
}

window.markPackageReceived = async function (id) {
  const ok = await window.showCustomConfirm("confirm_pkg_received");
  if (ok) await updatePackageStatus(id, "received");
};

window.revertToArrived = async function (id) {
  const ok = await window.showCustomConfirm("confirm_pkg_revert");
  if (ok) await updatePackageStatus(id, "arrived");
};

async function updatePackageStatus(id, status) {
  try {
    if (!id || id === 'undefined') {
      await window.showCustomAlert("❌ 發生錯誤：系統找不到這個包裹的 ID！請確認資料庫。");
      return;
    }
    const res = await fetch(`${BACKEND_URL}/api/packages/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error(`伺服器連線失敗 (狀態碼: ${res.status})`);

    if (currentUser.role === "admin") {
      const r = await fetch(`${BACKEND_URL}/api/packages`);
      packages = await r.json();
      renderAdminPackages(false);
    } else {
      renderPackages(currentPackageFilter, false);
    }
  } catch (error) { await window.showCustomAlert("❌ 狀態更新失敗！\n詳細原因：" + error.message); }
}

window.showInquiryModal = function() { document.getElementById("inquiryModal").style.display = "flex"; }
window.closeInquiryModal = function() { document.getElementById("inquiryModal").style.display = "none"; }

window.submitInquiry = async function(e) {
  e.preventDefault();
  const tracking = document.getElementById("inquiryTracking").value.trim();
  const courier = document.getElementById("inquiryCourier").value;
  const btn = document.getElementById("inquirySubmitBtn");
  btn.disabled = true; btn.textContent = "...";
  
  try {
      await addDoc(collection(db, "inquiries"), {
          uid: currentUser.uid, name: currentUser.name, room: currentUser.room,
          bed: currentUser.bed, phone: currentUser.phone, tracking: tracking,
          courier: courier, status: "pending", timestamp: new Date().toISOString()
      });
      await window.showCustomAlert("msg_inquiry_submitted");
      document.getElementById("inquiryTracking").value = "";
      closeInquiryModal();
  } catch(err) { await window.showCustomAlert("Error: " + err.message); }
  btn.disabled = false; btn.textContent = "Submit";
}

window.loadAdminInquiries = async function() {
  const list = document.getElementById("adminInquiriesList");
  if (!list) return;

  try {
    const q = query(collection(db, "inquiries"), where("status", "==", "pending"));
    const snap = await getDocs(q);

    if (snap.empty) {
        list.innerHTML = `<div style="padding:16px; text-align:center; color:#9ca3af; font-size: 16px;">目前沒有待處理的詢問</div>`;
        return;
    }

    let html = "";
    snap.forEach(docSnap => {
        const data = docSnap.data();
        let displayCourier = getCourierZh(data.courier);

        html += `
        <div style="background: white; border: 1px solid #e5e7eb; padding: 20px; border-radius: 8px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
            <div>
                <div style="font-weight: 600; font-size: 18px; margin-bottom: 6px;">👤 ${data.name} (${data.room} 房 - ${data.bed} 床) 📞 電話: ${data.phone}</div>
                <div style="color: #6b7280; font-size: 16px;">單號: <span style="color:#2563eb; font-weight: 600;">${data.tracking}</span> (${displayCourier})</div>
                <div style="color: #9ca3af; font-size: 14px; margin-top: 4px;">詢問時間: ${new Date(data.timestamp).toLocaleString()}</div>
            </div>
            <div style="display: flex; gap: 12px;">
                <button class="btn btn-success" style="font-size: 16px; padding: 10px 20px;" onclick="window.replyInquiry('${docSnap.id}', true, '${data.tracking}', '${data.courier}', '${data.name}', '${data.room}', '${data.phone}')">確實已收到</button>
                <button class="btn btn-secondary" style="font-size: 16px; padding: 10px 20px;" onclick="window.replyInquiry('${docSnap.id}', false, '${data.tracking}', '', '${data.name}', '', '')">尚未送達</button>
            </div>
        </div>
        `;
    });
    list.innerHTML = html;
  } catch (error) { console.error(error); }
}

window.replyInquiry = async function(id, isReceived, tracking, courier, name, room, phone) {
  const confirmKey = isReceived ? "confirm_inquiry_received" : "confirm_inquiry_not_found";
  const ok = await window.showCustomConfirm(confirmKey);

  if (!ok) return;

  try {
      await updateDoc(doc(db, "inquiries", id), { status: isReceived ? "resolved" : "rejected" });
      
      if (isReceived) {
          const p = { 
            tracking, courier, status: "arrived", receiver: name, 
            room: room, phone: phone, fragile: false, refrigeration: false, 
            registeredDate: new Date().toISOString().split("T")[0] 
          };
          await fetch(`${BACKEND_URL}/api/packages`, { 
            method: "POST", headers: { "Content-Type": "application/json" }, 
            body: JSON.stringify(p) 
          });
      } else {
          await addDoc(collection(db, "notifications"), {
              receiver: name, type: "system", titleKey: "NOTIF_PKG_NOT_FOUND_TITLE",
              messageKey: "NOTIF_PKG_NOT_FOUND_MSG", params: { tracking: tracking },
              read: false, timestamp: new Date().toISOString()
          });
      }
      await window.showCustomAlert("✅ 已成功回覆學生！");
      window.loadAdminInquiries(); 
      if (isReceived) renderAdminPackages(false); 
  } catch(e) { await window.showCustomAlert("Error: " + e.message); }
}

function getTimeAgo(timestamp) {
  if (!timestamp) return "";
  const now = new Date();
  const past = new Date(timestamp);
  const diffMs = now - past;
  
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return window.i18next.t("time_just_now");
  if (diffMins < 60) return window.i18next.t("time_mins_ago", { count: diffMins });
  if (diffHours < 24) return window.i18next.t("time_hours_ago", { count: diffHours });
  return window.i18next.t("time_days_ago", { count: diffDays });
}

window.handleNotificationClick = function(id) {
  const n = notifications.find(notif => notif.id === id);
  markAsRead(id);

  const panel = document.getElementById("notificationPanel");
  if (panel && panel.classList.contains("show")) panel.classList.remove("show");

  if (currentUser && currentUser.role === "admin") {
    showPage("packageAdmin");
  } else {
    if (!n) { showPage("dashboard"); return; }
    
    const tk = n.titleKey || n.title || "";
    
    if (tk.includes("PKG") || tk.includes("包裹")) {
      showPage("packageUser");
      if (tk.includes("REC")) filterPackages("received");
      else filterPackages("arrived");
    } 
    else if (tk.includes("FAC") || tk.includes("場地")) showPage("facilityUser");
    else if (tk.includes("ROOM") || tk.includes("房號")) showPage("settings");
    else if (tk.includes("報修")) showPage("repairUser");
    else showPage("dashboard");
  }
};

window.switchLanguage = function(lang) {
  if (window.i18next) {
    window.i18next.changeLanguage(lang).then(() => {
      if (typeof window.updateContent === "function") window.updateContent();
      if (typeof renderNotifications === "function") renderNotifications();
      if (currentUser && currentUser.role === "admin") {
        if (typeof renderAdminPackages === "function") renderAdminPackages(false);
      } else {
        if (typeof renderPackages === "function") renderPackages(currentPackageFilter, false);
      }
      console.log(`Language switched to: ${lang}`);
    });
  } else { console.error("i18next is not initialized yet."); }
};

window.loadAIChatbot = function () {
  if (document.getElementById("chatbase-script")) return;
  const script = document.createElement("script");
  script.src = "https://www.chatbase.co/embed.min.js";
  script.id = "chatbase-script";
  script.setAttribute("chatbotId", "16vFeNLQSbnbzKOmKYdrr");
  script.setAttribute("domain", "www.chatbase.co");
  script.defer = true;
  document.body.appendChild(script);
};

// --- 洗衣機狀態 ---
window.laundrySubs = { washer: null, dryer: null };
window.laundryPollingInterval = null;

window.loadLaundryData = async function() {
  const container = document.getElementById("laundryMachinesContainer");
  const selectEl = document.getElementById("laundryLocationSelect");
  if (!container || !selectEl) return;

  const code = selectEl.value;
  const locationName = selectEl.options[selectEl.selectedIndex].text;

  const titleEl = document.getElementById("laundryMainTitle");
  if (titleEl && window.i18next) {
      titleEl.innerText = window.i18next.t('laundry_building_title', { building: locationName });
  }

  container.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #64748b; font-size: 18px;">
    ⏳ ${window.i18next.t('laundry_loading')}
  </div>`;

  try {
    const res = await fetch(`${BACKEND_URL}/api/laundry/${code}`);
    const result = await res.json();

    if (!res.ok || !result.success) throw new Error(result.error || "Unknown error");

    const machines = result.data;
    if (machines.length === 0) {
      container.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #9ca3af;">無法取得機器資料。</div>`;
      return;
    }

    machines.forEach(m => {
        let mName = (m.alias || m.name || "").toUpperCase();

        if (mName.includes("洗")) {
            mName = mName.replace(/洗/g, "W");
        }
        if (mName.includes("烘")) {
            mName = mName.replace(/烘/g, "D");
        }

        m.alias = mName;
        m.name = mName;

        if (mName.includes("W")) {
            m.type = "washer";
        } else if (mName.includes("D")) {
            m.type = "dryer";
        }
    });

    const washers = machines.filter(m => m.type === 'washer');
    const dryers = machines.filter(m => m.type === 'dryer');

    const allWashersFull = washers.length > 0 && washers.every(m => m.status === 'in_use');
    const allDryersFull = dryers.length > 0 && dryers.every(m => m.status === 'in_use');

    const renderMachine = (m) => {
      let isWasher = m.type === "washer";
      let icon = isWasher ? "🌊" : "♨️"; 
      let typeName = isWasher ? window.i18next.t('laundry_washer') : window.i18next.t('laundry_dryer');
      
      let statusText, statusClass, extraStyle = "";
      
      if (m.status === "available") {
         statusText = window.i18next.t('laundry_available');
         statusClass = "status-approved"; 
      } else if (m.status === "in_use") {
         statusText = window.i18next.t('laundry_in_use');
         statusClass = "status-rejected"; 
      } else if (m.status === "finished") {
         statusText = window.i18next.t('laundry_finished');
         statusClass = "status-pending";  
      } else {
         statusText = window.i18next.t('laundry_offline');
         statusClass = ""; 
         extraStyle = "background: #e5e7eb; color: #4b5563;"; 
      }

      let timeHtml = "";
      if (m.status === "in_use" && m.lastRun) {
        let startTime = new Date(parseInt(m.lastRun) * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        timeHtml = `<div style="margin-top: 12px; font-size: 14px; color: #475569; font-weight: bold; display: flex; align-items: center; gap: 8px;">
          <span>${window.i18next.t('laundry_started_at', {time: startTime})}</span>
          <div class="laundry-loader"></div>
        </div>`;
      }

      return `
        <div style="background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); display: flex; flex-direction: column; justify-content: space-between;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <div style="font-size: 24px;">${icon}</div>
              <div>
                <div style="font-weight: bold; font-size: 18px; color: #1e293b;">${m.alias || m.name}</div>
                <div style="font-size: 13px; color: #64748b;">${typeName}</div>
              </div>
            </div>
            <span class="status-badge ${statusClass}" style="${extraStyle}">${statusText}</span>
          </div>
          ${timeHtml}
        </div>
      `;
    };

    let html = "";
    
    if (washers.length > 0) {
        html += `<div style="grid-column: 1 / -1; display: flex; justify-content: space-between; align-items: center; margin-top: 10px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">
                   <h4 style="font-size: 20px; font-weight: bold; color: #1e3a8a;">🌊 ${window.i18next.t('laundry_washers_sec')}</h4>
                   <button class="btn btn-secondary" style="font-size: 14px; padding: 6px 12px; background: #fef3c7; color: #b45309;" onclick="subscribeLaundry('washer', '${code}', '${locationName}', ${allWashersFull})">${window.i18next.t('laundry_notify_washer')}</button>
                 </div>`;
        html += washers.map(renderMachine).join("");
    }

    html += `<div style="grid-column: 1 / -1; height: 20px;"></div>`;

    if (dryers.length > 0) {
        html += `<div style="grid-column: 1 / -1; display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">
                   <h4 style="font-size: 20px; font-weight: bold; color: #1e3a8a;">♨️ ${window.i18next.t('laundry_dryers_sec')}</h4>
                   <button class="btn btn-secondary" style="font-size: 14px; padding: 6px 12px; background: #fef3c7; color: #b45309;" onclick="subscribeLaundry('dryer', '${code}', '${locationName}', ${allDryersFull})">${window.i18next.t('laundry_notify_dryer')}</button>
                 </div>`;
        html += dryers.map(renderMachine).join("");
    }

    container.innerHTML = html;

  } catch (error) {
    console.error("讀取洗衣機資料失敗:", error);
    container.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #ef4444; font-size: 16px;">
      ❌ ${window.i18next.t('laundry_error')}
    </div>`;
  }
};

window.subscribeLaundry = async function(type, code, locationName, isFull) {
  if (!isFull) {
     const msgKey = type === 'washer' ? 'laundry_not_full_washer' : 'laundry_not_full_dryer';
     return await window.showCustomAlert(msgKey);
  }

  window.laundrySubs[type] = { code, locationName };
  await window.showCustomAlert('laundry_sub_success');
  
  if (!window.laundryPollingInterval) {
    window.laundryPollingInterval = setInterval(async () => {
      for (let t of ['washer', 'dryer']) {
        const sub = window.laundrySubs[t];
        if (sub) {
           try {
             const res = await fetch(`${BACKEND_URL}/api/laundry/${sub.code}`);
             const result = await res.json();
             if (result.success) {
                const hasAvailable = result.data.some(m => m.type === t && (m.status === 'available' || m.status === 'finished'));
                if (hasAvailable) {
                   let typeName = t === 'washer' ? window.i18next.t('laundry_washer') : window.i18next.t('laundry_dryer');
                   
                   await addDoc(collection(db, "notifications"), {
                     receiver: currentUser.name, type: "system", titleKey: "NOTIF_LAUNDRY_TITLE",
                     messageKey: "NOTIF_LAUNDRY_MSG", params: { type: typeName, location: sub.locationName },
                     read: false, timestamp: new Date().toISOString()
                   });
                   
                   window.laundrySubs[t] = null;
                   
                   if (document.getElementById("laundryUserPage").style.display !== "none") {
                     window.loadLaundryData();
                   }
                   if(typeof fetchNotifications === "function") fetchNotifications();
                }
             }
           } catch(e) { console.error("背景檢查洗衣機失敗", e); }
        }
      }
      
      if (!window.laundrySubs.washer && !window.laundrySubs.dryer) {
         clearInterval(window.laundryPollingInterval);
         window.laundryPollingInterval = null;
      }
    }, 60000); 
  }
};

window.openAIAssistant = function() {
  try {
    if (window.chatbase && typeof window.chatbase === 'function') {
      window.chatbase("open");
    } else {
      const chatbaseBubble = document.getElementById("chatbase-bubble-button");
      if (chatbaseBubble) {
         chatbaseBubble.click();
      } else {
         window.showCustomAlert(window.i18next.t("ai_loading_msg"));
      }
    }
  } catch (e) { console.error("打開 AI 小助理失敗:", e); }
};

// --- 內部公告系統 (管理員發布) ---

// 管理員：發布公告
window.publishInternalAnnouncement = async function(e) {
  e.preventDefault();
  const title = document.getElementById("annTitle").value.trim();
  const content = document.getElementById("annContent").value.trim();
  const fileInput = document.getElementById("annFile");
  const btn = document.getElementById("annSubmitBtn");
  
  btn.disabled = true;
  btn.innerText = "上傳並發布中...";

  try {
    let fileUrl = "";
    let fileName = "";

    // 如果有選擇檔案，先上傳到 Storage
    if (fileInput.files.length > 0) {
      const file = fileInput.files[0];
      const storageRef = ref(storage, `announcements/${Date.now()}_${file.name}`);
      const snapshot = await uploadBytes(storageRef, file);
      fileUrl = await getDownloadURL(snapshot.ref);
      fileName = file.name;
    }

    // 存入 Firestore
    await addDoc(collection(db, "internalAnnouncements"), {
      title,
      content,
      fileUrl,
      fileName,
      author: currentUser.name,
      timestamp: new Date().toISOString(),
      date: new Date().toLocaleDateString()
    });

    await window.showCustomAlert("✅ 公告已成功發布！");
    document.getElementById("internalAnnouncementForm").reset();
  } catch (error) {
    console.error("發布失敗:", error);
    await window.showCustomAlert("❌ 發布失敗: " + error.message);
  } finally {
    btn.disabled = false;
    btn.innerText = "發布公告通知";
  }
};

// 學生與管理員：載入內部公告
window.listenToInternalAnnouncements = function() {
  const q = query(collection(db, "internalAnnouncements"), orderBy("timestamp", "desc"));
  
  onSnapshot(q, (snapshot) => {
    const announcements = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderInternalAnnouncements(announcements);
    
    // 如果是管理員，也渲染管理列表
    if (currentUser && currentUser.role === "admin") {
      renderAdminAnnManagement(announcements);
    }
  });
};

// 用於儲存內部公告以便點擊後開啟 Modal
window.internalAnnsData = [];

function renderInternalAnnouncements(list) {
  const container = document.getElementById("internalAnnouncementList");
  const section = document.getElementById("internalAnnouncementSection");
  if (!container) return;

  if (list.length === 0) {
    section.style.display = "none";
    return;
  }
  
  section.style.display = "block";
  window.internalAnnsData = list; // 儲存資料供彈出視窗使用

  container.innerHTML = list.map(ann => {
    // 改用與一般公告相同的 announcement-item 樣式，並把日期字體放大到 16px
    return `
      <div class="announcement-item" style="justify-content: space-between; cursor: pointer;" onclick="openInternalAnnDetail('${ann.id}')">
        <a href="javascript:void(0)" style="flex: 1; margin-right: 12px;">${ann.title}</a>
        <span style="font-size: 16px; color: #64748b; white-space: nowrap;">${ann.date}</span>
      </div>
    `;
  }).join("");
}

// 新增：點擊內部公告開啟詳細視窗 (共用原有 announcementDetailModal)
window.openInternalAnnDetail = function(id) {
  const ann = window.internalAnnsData.find(a => a.id === id);
  if (!ann) return;

  const modal = document.getElementById("announcementDetailModal");
  const titleEl = document.getElementById("detailModalTitle");
  const bodyEl = document.getElementById("detailModalBody");
  const linkEl = document.getElementById("detailModalOriginalLink"); 

  modal.style.display = "flex";
  titleEl.innerText = ann.title;
  linkEl.style.display = "none"; // 隱藏外部原網站連結

  const isImage = ann.fileUrl && (ann.fileUrl.match(/\.(jpeg|jpg|gif|png)$/i) || ann.fileUrl.includes("image"));
  
  let html = `<div style="white-space: pre-wrap; margin-top: 8px; color: #475569; font-size: 16px;">${ann.content}</div>`;
  
  if (ann.fileUrl) {
    html += `
      <div style="margin-top: 16px; padding: 12px; background: #f8fafc; border-radius: 8px; border: 1px dashed #cbd5e1;">
        ${isImage ? 
          `<img src="${ann.fileUrl}" style="max-width: 100%; border-radius: 4px; margin-bottom: 8px;" />` : 
          `📄 <a href="${ann.fileUrl}" target="_blank" style="color: #4a90e2; text-decoration: underline;">${ann.fileName || '查看附件檔案'}</a>`
        }
      </div>
    `;
  }
  
  // 在最下方加上發布日期
  html += `<div style="margin-top: 20px; font-size: 14px; color: #94a3b8; text-align: right;">發佈日期：${ann.date}</div>`;

  bodyEl.innerHTML = html;
};
// 管理員：渲染公告管理列表 (含刪除功能)
function renderAdminAnnManagement(list) {
  const container = document.getElementById("adminAnnHistory");
  if (!container) return;
  
  container.innerHTML = list.map(ann => `
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid #eee;">
      <div>
        <div style="font-weight: 600;">${ann.title}</div>
        <div style="font-size: 12px; color: #999;">${ann.date}</div>
      </div>
      <button class="btn btn-danger" style="padding: 4px 10px; font-size: 12px;" onclick="deleteAnnouncement('${ann.id}')">刪除</button>
    </div>
  `).join("");
}

window.deleteAnnouncement = async function(id) {
  if (await window.showCustomConfirm("確定要刪除這則公告嗎？")) {
    await deleteDoc(doc(db, "internalAnnouncements", id));
  }
};