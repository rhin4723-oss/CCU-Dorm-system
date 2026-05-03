const admin = require('firebase-admin');

// 1. Check if the environment variable is present (for Railway)
// 2. Fall back to your local file if it's not (for local testing)
const serviceAccount = process.env.FIREBASE_KEY 
  ? JSON.parse(process.env.FIREBASE_KEY) 
  : require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
module.exports = { db, admin };

// 這是你要創建的學生名單
const students = [
  { name: "王小明", email: "student01@school.com", password: "password123" },
  { name: "陳大文", email: "student02@school.com", password: "password123" },
  // ... 你可以在這裡加更多人
];

async function createAccounts() {
  console.log("🚀 開始創建帳號...");

  for (const student of students) {
    try {
      // 1. 在 Authentication 創建登入帳號
      const userRecord = await admin.auth().createUser({
        email: student.email,
        password: student.password,
        displayName: student.name,
      });

      console.log(`✅ 帳號創建成功: ${student.email} (UID: ${userRecord.uid})`);

      // 2. 在 Firestore 資料庫幫他們建一個 user 檔案
      await db.collection("users").doc(userRecord.uid).set({
        name: student.name,
        email: student.email,
        role: "student",
        room: "未設定", // 新增這裡：補上預設房號
        phone: "未設定", // 新增這裡：補上預設電話
        createdAt: new Date(),
        mustChangePassword: true,
      });

      console.log(`📝 資料庫檔案已建立`);
    } catch (error) {
      console.error("Auth Error:", error);
  
      if (error.code === "auth/email-already-in-use") {
        alert("此 Email 已被註冊，請直接登入。");
      } else if (error.code === "auth/invalid-credential") {
        // 這是新版 Firebase 統一的錯誤碼
        alert("帳號或密碼錯誤，請重新確認！若是新使用者請先註冊。");
      } else {
        alert("操作失敗: " + error.message);
      }
  
      if (loader) loader.classList.remove("show");
    }
  };
  console.log("🎉 全部完成！");
}

createAccounts();
