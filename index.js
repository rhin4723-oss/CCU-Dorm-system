const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const path = require('path'); 
const axios = require('axios');       // <--- ADDED: Needed for fetching CCU announcements
const cheerio = require('cheerio');   // <--- ADDED: Needed for parsing HTML
const https = require('https');       // <--- ADDED: Needed to bypass SSL
const fs = require('fs');             // <--- ADDED: Needed for serving index.html at the bottom

const PORT = process.env.PORT || 3000;
const app = express();

// --- Firebase Initialization ---
let serviceAccount;
if (process.env.FIREBASE_KEY) {
    serviceAccount = JSON.parse(process.env.FIREBASE_KEY.trim());
} else {
    serviceAccount = require('./serviceAccountKey.json');
}

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore(); // <--- ADDED: Crucial! Without this, your database queries will crash.

// --- Middleware ---
app.use(cors());
app.use(express.json());

// Rest of your routes...

// --- 通用通知函數 ---
async function createNotification(receiver, type, titleKey, messageKey, params) {
  try {
    await db.collection("notifications").add({
      receiver,
      type,
      titleKey: titleKey, 
      messageKey: messageKey, 
      params: params, 
      read: false,
      timestamp: new Date().toISOString(),
    });
    console.log(`[Notification] Sent to ${receiver}: ${titleKey}`);
  } catch (error) {
    console.error("❌ 通知發送失敗:", error);
  }
}

// ================= API 路由區域 =================
app.get("/api/test", (req, res) => {
  res.json({ message: "Backend API is working!" });
});

// ================= API 路由區域 =================

// 📌 新增：抓取中正大學宿舍公告 API
app.get("/api/announcements", async (req, res) => {
  try {
    const url = 'https://studentlife.ccu.edu.tw/p/403-1034-2790-1.php?Lang=zh-tw';

    // 建立一個 https 代理，讓 Node.js 忽略學校網站可能的 SSL 憑證錯誤
    const httpsAgent = new https.Agent({  
      rejectUnauthorized: false 
    });

    // 1. 發送請求取得 HTML (加上更完整的 Headers 偽裝成真人)
    const response = await axios.get(url, {
      httpsAgent: httpsAgent, // 加入這行繞過憑證檢查
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-TW,zh;q=0.8,en-US;q=0.5,en;q=0.3',
      },
      timeout: 10000 // 設定 10 秒超時，避免卡死
    });

    const html = response.data;
    const $ = cheerio.load(html);
    const announcements = [];

    // 2. 解析 HTML
    $('.mtitle').each((index, element) => {
      if (index >= 8) return false; // 只抓前 5 筆

      const titleElement = $(element).find('a');
      let title = titleElement.text().trim();
      let link = titleElement.attr('href');

      if (link && !link.startsWith('http')) {
        link = `https://studentlife.ccu.edu.tw${link}`;
      }

      if (title) {
        announcements.push({ title: title, url: link });
      }
    });

    res.json({ success: true, data: announcements });

  } catch (error) {
    // 這裡會把真正的錯誤原因印出來，方便我們除錯
    console.error("🔥 抓取公告失敗 詳細原因:", error.message);
    res.status(500).json({ success: false, error: "無法取得公告資料", details: error.message });
  }
});

// 📌 新增：抓取單一公告「詳細內容」與「附件(PDF)」 API
app.get("/api/announcement-detail", async (req, res) => {
  try {
    const targetUrl = req.query.url;
    if (!targetUrl) {
      return res.status(400).json({ success: false, error: "缺少網址參數" });
    }

    const httpsAgent = new https.Agent({ rejectUnauthorized: false });
    const response = await axios.get(targetUrl, {
      httpsAgent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 10000
    });

    const html = response.data;
    const $ = cheerio.load(html);

    // 1. 抓取標題
    const title = $('.mtitle').text().trim() || '宿舍公告';

    // 2. 處理內文區塊 (.mcont) 與附件區塊 (.mfile)
    const $content = $('.mcont');
    const $files = $('.mfile'); // 學校系統通常把 PDF 附件放在這個 class 裡

    // 💡 魔法：把相對路徑的圖片和檔案，補齊成完整的學校網址，否則在你的網站會破圖/無法下載
    const fixLinks = ($elem) => {
      $elem.find('img').each((i, el) => {
        let src = $(el).attr('src');
        if (src && !src.startsWith('http')) {
          $(el).attr('src', 'https://studentlife.ccu.edu.tw' + src);
        }
        $(el).css('max-width', '100%').css('height', 'auto'); // 讓圖片在手機版也不會破版
      });
      $elem.find('a').each((i, el) => {
        let href = $(el).attr('href');
        if (href && !href.startsWith('http') && !href.startsWith('mailto') && !href.startsWith('tel')) {
          $(el).attr('href', 'https://studentlife.ccu.edu.tw' + href);
        }
        $(el).attr('target', '_blank'); // 強制所有的連結(含 PDF) 都在新分頁打開
      });
    };

    if ($content.length) fixLinks($content);
    if ($files.length) fixLinks($files);

    // 組合內文與附件的 HTML
    let contentHtml = $content.html() || '<p>此公告無內文</p>';
    if ($files.length && $files.html().trim() !== '') {
      contentHtml += `<div style="margin-top: 20px; padding-top: 20px; border-top: 1px dashed #cbd5e1;">
                        <h4 style="font-weight: bold; color: #e11d48; margin-bottom: 10px;">📎 附件檔案</h4>
                        ${$files.html()}
                      </div>`;
    }

    res.json({ success: true, data: { title, contentHtml } });

  } catch (error) {
    console.error("🔥 抓取詳細內容失敗:", error.message);
    res.status(500).json({ success: false, error: "無法取得內容" });
  }
});

// ... 下面是你原本其他的 API ...

app.get("/api/packages", async (req, res) => {
  try {
    const receiverName = req.query.receiver;
    let query = db.collection("packages");
    if (receiverName) query = query.where("receiver", "==", receiverName);
    const snapshot = await query.get();
    const list = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/notifications", async (req, res) => {
  try {
    const receiverName = req.query.receiver;
    let query = db.collection("notifications");
    if (receiverName) query = query.where("receiver", "==", receiverName);
    const snapshot = await query.get();
    let list = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    list.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 📌 將特定使用者的所有通知標示為已讀
app.put("/api/notifications/read-all", async (req, res) => {
  try {
    const { receiver } = req.body;
    if (!receiver) return res.status(400).json({ error: "Missing receiver" });
    const snapshot = await db
      .collection("notifications")
      .where("receiver", "==", receiver)
      .where("read", "==", false)
      .get();
    if (snapshot.empty) return res.json({ success: true });
    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.update(doc.ref, { read: true }));
    await batch.commit();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 🗑️ 刪除單一通知
app.delete("/api/notifications/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await db.collection("notifications").doc(id).delete();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 🗑️ 刪除該使用者的所有通知
app.delete("/api/notifications/all/:receiver", async (req, res) => {
  try {
    const { receiver } = req.params;
    const snapshot = await db.collection("notifications").where("receiver", "==", receiver).get();
    
    // Firestore 批次處理有上限，但這裡假設通知數量正常不會爆
    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});


// 新增包裹 API
app.post("/api/packages", async (req, res) => {
  try {
    const newPackageData = req.body;
    const result = await db.collection("packages").add(newPackageData);

    if (newPackageData.status === "arrived") {
        await createNotification(
            newPackageData.receiver, "package", "NOTIF_PKG_ARR_TITLE", "NOTIF_PKG_ARR_MSG", { tracking: newPackageData.tracking }
        );
    } else {
        await createNotification(
            newPackageData.receiver, "package", "NOTIF_PKG_REG_TITLE", "NOTIF_PKG_REG_MSG", { tracking: newPackageData.tracking }
        );
    }
    
    res.json({ success: true, id: result.id });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 📌 新增：管理員重置學生密碼 API
app.post("/api/admin/reset-password", async (req, res) => {
  try {
    const { studentId } = req.body;
    if (!studentId) {
      return res.status(400).json({ success: false, error: "缺少學號參數" });
    }

    // 拼湊出學生的登入 Email
    const email = `${studentId}@dorm.ccu.edu.tw`;
    const defaultPassword = "CCU1234#@";

    let userRecord;
    try {
      // 1. 從 Firebase Auth 找出這個帳號
      userRecord = await admin.auth().getUserByEmail(email);
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        return res.status(404).json({ success: false, error: "找不到該學號的帳號，請確認該學生是否已註冊或被匯入系統" });
      }
      throw err;
    }

    // 2. 更新 Firebase Auth 密碼
    await admin.auth().updateUser(userRecord.uid, {
      password: defaultPassword
    });

    // 3. 更新 Firestore 資料庫，強制觸發「初次登入修改密碼」機制
    await db.collection("users").doc(userRecord.uid).update({
      mustChangePassword: true
    });

    console.log(`✅ 管理員已重置學號 ${studentId} 的密碼`);
    res.json({ success: true });

  } catch (error) {
    console.error("🔥 重置密碼 API 發生錯誤:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 更新包裹狀態
app.put("/api/packages/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updatedData = req.body;
    const packageRef = db.collection("packages").doc(id);
    const docSnap = await packageRef.get();
    if (!docSnap.exists) return res.status(404).json({ success: false, error: "Not Found" });
    
    await packageRef.update(updatedData);
    const data = docSnap.data();

    // 發送通知 (已到達 或 已領取)
    if (updatedData.status === "arrived") {
      await createNotification(
        data.receiver, "package", "NOTIF_PKG_ARR_TITLE", "NOTIF_PKG_ARR_MSG", { tracking: data.tracking }
      );
    } else if (updatedData.status === "received") {
      await createNotification(
        data.receiver, "package", "NOTIF_PKG_REC_TITLE", "NOTIF_PKG_REC_MSG", { tracking: data.tracking }
      );
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 📌 新增：洗衣機/烘乾機狀態即時 API
app.get("/api/laundry/:code", async (req, res) => {
  try {
    const { code } = req.params;
    const url = 'http://monitor.isesa.com.tw/monitor/dispatch.ajax';

    // 模擬前端發送的 Form Data
    const params = new URLSearchParams();
    params.append('code', code);
    params.append('ran', Math.floor(Math.random() * 10000).toString());
    params.append('funcName', 'F_CUSTOMER');
    params.append('subFuncName', 'SUB_QUERY_CODE');

    // 發送請求，並帶上完整的「偽裝 Header」突破防爬蟲機制
    const response = await axios.post(url, params, {
      headers: {
        'Origin': 'http://monitor.isesa.com.tw',
        'Referer': `http://monitor.isesa.com.tw/monitor/?code=${code}`,
        'X-Requested-With': 'XMLHttpRequest',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    let rawData = response.data;
    
    // 防呆：確保拿到的是字串形式
    if (typeof rawData !== 'string') {
      rawData = JSON.stringify(rawData);
    }

    // 移除學校加在前面的防護碼 while(1);
    rawData = rawData.replace(/^while\(1\);/, '').trim();
    
    if (!rawData) {
       throw new Error("伺服器回傳空資料，防護機制尚未解除");
    }

    // 破解亂碼：如果出現特定的亂碼特徵，轉回正確的中文 (解雙重編碼)
    if (rawData.includes('ä¸')) {
      rawData = Buffer.from(rawData, 'latin1').toString('utf8');
    }

    // 正式解析乾淨的 JSON
    const parsed = JSON.parse(rawData);
    const machineArray = parsed.jsonObj.machineArray || [];

    const machines = machineArray.map(m => {
      // 根據機器名字判斷：有 'W' 是洗衣機，'D' 是烘衣機
      const isWasher = m.machineName.toUpperCase().includes('W');
      const type = isWasher ? 'washer' : 'dryer';

      // 判斷機台狀態
      let status = 'offline';
      if (m.isOnline) {
         if (m.status.includes('空機')) status = 'available';
         else if (m.status.includes('運轉中')) status = 'in_use';
         else if (m.status.includes('結束')) status = 'finished';
         else status = 'in_use'; // 預設防呆
      }

      // 嘗試從狀態文字中萃取「數字」(例如 "運轉中 25分") 作為倒數時間
      let remainTime = m.lastRun || 0; 
      let timeMatch = m.status.match(/(\d+)/);
      if (timeMatch) {
          remainTime = parseInt(timeMatch[1]);
      }

      return {
        name: m.machineName,
        alias: m.gaiaMachineAlias,
        type: type,
        status: status,
        time: remainTime, 
        lastRun: m.lastRun || null,
        rawStatus: m.status // 保留原始狀態以防萬一
      };
    });

    // 按照別名 (如 1D1, 1D2... 1W1, 1W2...) 排序，畫面會更整齊
    machines.sort((a, b) => (a.alias || a.name).localeCompare((b.alias || b.name), undefined, {numeric: true}));

    res.json({ success: true, data: machines });
  } catch (error) {
    console.error("🔥 洗衣機 API 錯誤:", error.message);
    // 加入詳細錯誤日誌，萬一又失敗我們能立刻知道原因
    if (error.response) {
        console.error("伺服器狀態碼:", error.response.status);
        console.error("伺服器回傳內容:", error.response.data);
    }
    res.status(500).json({ success: false, error: "無法取得洗衣機資料" });
  }
});

app.post("/api/admin/import-students", async (req, res) => {
  console.log("📥 收到批次匯入請求，開始處理...");
  try {
    const { students } = req.body;
    if (!students || !Array.isArray(students)) {
      return res.status(400).json({ success: false, error: "無效的學生資料格式" });
    }
    let successCount = 0;
    let errorLogs = [];
    for (const student of students) {
      try {
        const email = `${student.studentId}@dorm.ccu.edu.tw`;
        const defaultPassword = "CCU1234#@";
        const userRecord = await admin.auth().createUser({
          email: email,
          password: defaultPassword,
          displayName: student.name,
        });
        await db.collection("users").doc(userRecord.uid).set({
            uid: userRecord.uid,
            email: email,
            name: student.name,
            studentId: student.studentId,
            room: student.room || "未設定",
            bed: student.bed || "未設定",
            phone: student.phone || "未設定",
            role: "student",
            mustChangePassword: true,
            createdAt: new Date().toISOString(),
          });
        successCount++;
        console.log(`✅ 成功建立: ${student.studentId}`);
      } catch (err) {
        console.error(`❌ 學生 ${student.studentId} 失敗:`, err.message);
        errorLogs.push({ studentId: student.studentId, error: err.message });
      }
    }
    console.log(`🏁 處理完成，共成功 ${successCount} 筆`);
    res.json({
      success: true,
      count: successCount,
      errors: errorLogs.length > 0 ? errorLogs : undefined,
    });
  } catch (error) {
    console.error("🔥 Import API 發生錯誤:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// --- 3. 靜態檔案與萬用路由 ---
app.use(express.static(path.join(__dirname, "public")));

app.get(/.*/, (req, res) => {
  const indexPath = path.join(__dirname, "public", "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send(`<h1>Error</h1><p>找不到 public/index.html，請確認檔案位置。</p>`);
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});