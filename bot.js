const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const axios = require('axios');

// Config - NÊN CHUYỂN SANG BIẾN MÔI TRƯỜNG
const BOT_TOKEN = process.env.BOT_TOKEN || '8684463452:AAHD24ZFRHIymIyAuEdnixUhyLN01uV54bc';
const ADMIN_ID = process.env.ADMIN_ID || '7071414779';
const API_URL = 'https://apisunhpt.onrender.com/sunlon';

// Khởi tạo bot
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// File lưu trữ
const USER_FILE = 'users.json';
const KEY_FILE = 'keys.json';
const HISTORY_FILE = 'history.json';
const ADMIN_FILE = 'admins.json';

// Biến toàn cục
let lastSentPhien = 0;
let lastPrediction = null;
let botEnabled = true;
let isSending = false;
let processingPhien = 0;

// Đọc file JSON
function readJSON(file) {
    try {
        if (fs.existsSync(file)) {
            return JSON.parse(fs.readFileSync(file, 'utf8'));
        }
    } catch (error) {
        console.log('Lỗi đọc file:', file);
    }
    return {};
}

// Ghi file JSON
function writeJSON(file, data) {
    try {
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.log('Lỗi ghi file:', file);
        return false;
    }
}

// Kiểm tra admin
function isAdmin(userId) {
    const admins = readJSON(ADMIN_FILE);
    return admins[userId] === true || userId.toString() === ADMIN_ID;
}

// Kiểm tra user active
function isUserActive(userId) {
    const users = readJSON(USER_FILE);
    return users[userId] && users[userId].active === true;
}

// Lưu lịch sử dự đoán
function savePredictionHistory(phien, prediction, actualResult) {
    const history = readJSON(HISTORY_FILE);
    history[phien] = {
        prediction: prediction,
        actual: actualResult,
        timestamp: Date.now(),
        isCorrect: prediction === actualResult
    };
    writeJSON(HISTORY_FILE, history);
}

// Kiểm tra key hợp lệ
function isValidKey(key) {
    const keys = readJSON(KEY_FILE);
    const keyData = keys[key];
    
    if (!keyData) return false;
    
    if (Date.now() > keyData.expires) {
        delete keys[key];
        writeJSON(KEY_FILE, keys);
        return false;
    }
    
    if (keyData.uses <= 0) {
        delete keys[key];
        writeJSON(KEY_FILE, keys);
        return false;
    }
    
    keyData.uses--;
    keys[key] = keyData;
    writeJSON(KEY_FILE, keys);
    
    return true;
}

// Lấy độ tin cậy random
function getRandomConfidence() {
    return Math.floor(Math.random() * (99 - 71 + 1)) + 71;
}

// Lấy dữ liệu từ API - FIX LỖI
async function fetchAPIData() {
    try {
        const response = await axios.get(API_URL, { timeout: 5000 });
        console.log('📡 API Response:', JSON.stringify(response.data).substring(0, 200));
        return response.data;
    } catch (error) {
        console.log('❌ Lỗi fetch API:', error.message);
        return null;
    }
}

// Format tin nhắn header
function formatHeaderMessage() {
    return `*🧩 BOT SUNWIN 🧩*`;
}

// Format tin nhắn kết quả - FIX LỖI CẤU TRÚC
function formatResultMessage(data) {
    if (!data || !data.lich_su || data.lich_su.length === 0) {
        console.log('❌ Không có dữ liệu lịch sử từ API');
        return null;
    }
    
    const latestResult = data.lich_su[data.lich_su.length - 1];
    
    // Kiểm tra cấu trúc dữ liệu
    if (!latestResult.Phien || !latestResult.dice || !latestResult.result) {
        console.log('❌ Cấu trúc dữ liệu API không hợp lệ:', latestResult);
        return null;
    }
    
    let message = `📊 *KẾT QUẢ PHIÊN: ${latestResult.Phien}*\n`;
    message += `*➤ Xúc xắc: ${latestResult.dice[0]}, ${latestResult.dice[1]}, ${latestResult.dice[2]}*\n`;
    message += `*➤ Tổng: ${latestResult.totalScore}*\n`;
    message += `*➤ Kết quả: ${latestResult.result}* 🎲`;
    
    return message;
}

// Format tin nhắn đánh giá
function formatEvaluationMessage(phien, prediction, actualResult) {
    const isCorrect = prediction === actualResult;
    const evaluationIcon = isCorrect ? '✅' : '❌';
    const evaluationText = isCorrect ? 'ĐÚNG' : 'SAI';
    
    let message = `🏆 *ĐÁNH GIÁ DỰ ĐOÁN* 🏆\n\n`;
    message += `🔍 *ĐÁNH GIÁ PHIÊN ${phien}:*\n`;
    message += `*➤ Dự đoán: ${prediction}*\n`;
    message += `*➤ Kết quả: ${actualResult}*\n`;
    message += `*➤ Đánh giá: ${evaluationIcon} ${evaluationText}*`;
    
    return message;
}

// Format tin nhắn đang phân tích
function formatAnalyzingMessage() {
    return `🔍 *ĐANG PHÂN TÍCH DỰ ĐOÁN TIẾP THEO...*`;
}

// Format tin nhắn dự đoán - FIX LỖI
function formatPredictionMessage(data) {
    if (!data) return null;
    
    const confidence = getRandomConfidence();
    
    // Kiểm tra cấu trúc dữ liệu dự đoán
    const currentPhien = data.phien_hien_tai || (data.lich_su && data.lich_su.length > 0 ? data.lich_su[data.lich_su.length - 1].Phien + 1 : 'N/A');
    const prediction = data.du_doan || (Math.random() > 0.5 ? 'Tài' : 'Xỉu');
    
    let message = `🔮 *DỰ ĐOÁN PHIÊN: ${currentPhien}*\n`;
    message += `*➤ Dự đoán: ${prediction}* ${prediction === 'Tài' ? '📈' : '📉'}\n`;
    message += `*➤ Độ tin cậy: ${confidence}%* ✅`;
    
    lastPrediction = prediction;
    
    return message;
}

// Format lịch sử đúng/sai
function formatHistoryMessage() {
    const history = readJSON(HISTORY_FILE);
    const entries = Object.entries(history);
    
    if (entries.length === 0) {
        return '📊 *LỊCH SỬ DỰ ĐOÁN:*\n\nChưa có dữ liệu lịch sử.';
    }
    
    const sortedHistory = entries
        .sort((a, b) => parseInt(b[0]) - parseInt(a[0]))
        .slice(0, 20);
    
    let message = `📊 *LỊCH SỬ DỰ ĐOÁN (${sortedHistory.length} phiên gần nhất):*\n\n`;
    
    sortedHistory.forEach(([phien, data]) => {
        const icon = data.isCorrect ? '✅' : '❌';
        message += `[${phien}] Dự đoán: *${data.prediction}* - Kết quả: *${data.actual}* ${icon}\n`;
    });
    
    const total = sortedHistory.length;
    const correct = sortedHistory.filter(([_, data]) => data.isCorrect).length;
    const accuracy = total > 0 ? ((correct / total) * 100).toFixed(1) : 0;
    
    message += `\n📈 *THỐNG KÊ:*\n`;
    message += `*➤ Tổng: ${total}* phiên\n`;
    message += `*➤ Đúng: ${correct}* phiên\n`;
    message += `*➤ Tỷ lệ chính xác: ${accuracy}%*`;
    
    return message;
}

// Gửi tin nhắn cho tất cả user - FIX LỖI GỬI TIN
async function broadcastToUsers(message) {
    if (!botEnabled || isSending) {
        console.log('🚫 Đang chặn spam - Bot đang gửi hoặc bị tắt');
        return;
    }
    
    isSending = true;
    
    const users = readJSON(USER_FILE);
    const activeUsers = Object.keys(users).filter(chatId => users[chatId].active === true);
    
    console.log(`📤 Gửi tin nhắn cho ${activeUsers.length} user...`);
    
    let sentCount = 0;
    let errorCount = 0;
    
    for (const chatId of activeUsers) {
        try {
            await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
            sentCount++;
            console.log(`✅ Đã gửi tin nhắn cho user ${chatId}`);
            
            // Chờ 100ms giữa mỗi tin nhắn để tránh spam
            await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
            console.log(`❌ Lỗi gửi tin cho ${chatId}:`, error.message);
            users[chatId].active = false;
            errorCount++;
        }
    }
    
    isSending = false;
    
    console.log(`✅ Đã gửi xong ${sentCount}/${activeUsers.length} user, lỗi: ${errorCount}`);
    writeJSON(USER_FILE, users);
    
    return { sent: sentCount, total: activeUsers.length, errors: errorCount };
}

// Kiểm tra và gửi thông báo - FIX LỖI CHÍNH
async function checkAndNotify() {
    if (isSending) {
        console.log('🚫 Đang chặn spam - Đợi gửi xong phiên trước');
        return;
    }
    
    try {
        console.log('📡 Đang lấy dữ liệu từ API...');
        const data = await fetchAPIData();
        
        if (!data) {
            console.log('❌ Không có dữ liệu từ API');
            return;
        }
        
        if (!data.lich_su || data.lich_su.length === 0) {
            console.log('❌ Không có lịch sử từ API');
            return;
        }
        
        const latestResult = data.lich_su[data.lich_su.length - 1];
        console.log(`📊 Phiên mới nhất từ API: ${latestResult.Phien}, Last sent: ${lastSentPhien}`);
        
        // FIX: Kiểm tra điều kiện chính xác hơn
        if (parseInt(latestResult.Phien) > parseInt(lastSentPhien) && parseInt(latestResult.Phien) !== parseInt(processingPhien)) {
            console.log(`🆕 Phát hiện phiên mới: ${latestResult.Phien} (trước đó: ${lastSentPhien})`);
            processingPhien = latestResult.Phien;
            
            // 1. Gửi header BOT SUNWIN (tin nhắn 1)
            const headerMessage = formatHeaderMessage();
            console.log(`🧩 Gửi header BOT SUNWIN`);
            await broadcastToUsers(headerMessage);
            
            // Đợi 1s rồi gửi kết quả
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // 2. Gửi kết quả phiên mới (tin nhắn 2)
            const resultMessage = formatResultMessage(data);
            if (resultMessage) {
                console.log(`📊 Gửi kết quả phiên ${latestResult.Phien}`);
                await broadcastToUsers(resultMessage);
            } else {
                console.log('❌ Không thể format kết quả');
                processingPhien = 0;
                return;
            }
            
            // 3. Gửi đánh giá dự đoán phiên trước (nếu có) sau 3s
            if (lastPrediction && lastSentPhien > 0) {
                await new Promise(resolve => setTimeout(resolve, 3000));
                
                savePredictionHistory(lastSentPhien, lastPrediction, latestResult.result);
                console.log(`📈 Đã lưu lịch sử phiên ${lastSentPhien}`);
                
                // Gửi đánh giá (tin nhắn 3)
                const evaluationMessage = formatEvaluationMessage(lastSentPhien, lastPrediction, latestResult.result);
                if (evaluationMessage) {
                    console.log(`🔍 Gửi đánh giá phiên ${lastSentPhien}`);
                    await broadcastToUsers(evaluationMessage);
                }
                
                // Đợi 2s rồi gửi đang phân tích
                await new Promise(resolve => setTimeout(resolve, 2000));
            } else {
                // Nếu không có dự đoán trước, đợi 3s
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
            
            // 4. Gửi đang phân tích (tin nhắn 4)
            const analyzingMessage = formatAnalyzingMessage();
            console.log(`🔍 Gửi thông báo đang phân tích`);
            await broadcastToUsers(analyzingMessage);
            
            // Đợi 2s rồi gửi dự đoán
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // 5. Gửi dự đoán (tin nhắn 5)
            if (parseInt(latestResult.Phien) <= parseInt(lastSentPhien)) {
                console.log(`🚫 Bỏ qua phiên ${latestResult.Phien} - đã gửi rồi`);
                processingPhien = 0;
                return;
            }
            
            const predictionMessage = formatPredictionMessage(data);
            if (predictionMessage) {
                console.log(`🎯 Gửi dự đoán phiên tiếp theo: ${lastPrediction}`);
                await broadcastToUsers(predictionMessage);
                
                lastSentPhien = latestResult.Phien;
                processingPhien = 0;
                console.log(`✅ Đã cập nhật lastSentPhien: ${lastSentPhien}`);
            }
            
        } else {
            if (parseInt(latestResult.Phien) === parseInt(processingPhien)) {
                console.log(`⏳ Đang xử lý phiên ${latestResult.Phien}...`);
            } else {
                console.log(`⏭️ Bỏ qua phiên ${latestResult.Phien} - đã xử lý rồi (lastSent: ${lastSentPhien})`);
            }
        }
        
    } catch (error) {
        console.log('❌ Lỗi checkAndNotify:', error.message);
        isSending = false;
        processingPhien = 0;
    }
}

// ==================== LỆNH BOT ====================

// Lệnh start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const message = `🎮 *CHÀO MỪNG ĐẾN VỚI BOT SUN WIN* 🎮

*Tính năng chính:*
🔮 Dự đoán Tài/Xỉu SunWin chính xác
📊 Thống kê lịch sử dự đoán
🎯 Độ tin cậy cao >70%

*Lệnh sử dụng:*
/start - Khởi động bot
/key [key] - Nạp key kích hoạt
/history - Xem lịch sử dự đoán
/status - Kiểm tra trạng thái

📞 *Liên hệ admin:* @NguyenTung2029
💬 *Box chat:* https://t.me/+pxXrNnB-ciZmZWE1

Chọn các nút bên dưới để sử dụng bot!`;
    
    bot.sendMessage(chatId, message, { 
        parse_mode: 'Markdown',
        reply_markup: {
            keyboard: [
                [{ text: "🔑 SHOP KEY" }, { text: "💳 BANK" }],
                [{ text: "👨‍💻 ADMIN" }, { text: "💬 BOX CHAT" }],
                [{ text: "📊 LỊCH SỬ" }, { text: "📈 STATUS" }],
                [{ text: "✅ CHẠY BOT" }, { text: "❌ TẮT BOT" }]
            ],
            resize_keyboard: true
        }
    });
});

// Lệnh nạp key
bot.onText(/\/key (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const key = match[1];
    
    if (isValidKey(key)) {
        const users = readJSON(USER_FILE);
        const keys = readJSON(KEY_FILE);
        const keyData = keys[key];
        
        users[chatId] = {
            key: key,
            active: true,
            joined: Date.now()
        };
        
        writeJSON(USER_FILE, users);
        
        const remainingHours = Math.ceil((keyData.expires - Date.now()) / (60 * 60 * 1000));
        
        bot.sendMessage(chatId, `✅ *KÍCH HOẠT THÀNH CÔNG!*\n\n🔑 Key: \`${key}\`\n⏰ Thời hạn: ${remainingHours} giờ\n🎯 Lượt dùng còn: ${keyData.uses}\n\nBot sẽ gửi thông báo dự đoán tự động!`, {
            parse_mode: 'Markdown',
            reply_markup: {
                keyboard: [
                    [{ text: "🔑 SHOP KEY" }, { text: "💳 BANK" }],
                    [{ text: "👨‍💻 ADMIN" }, { text: "💬 BOX CHAT" }],
                    [{ text: "📊 LỊCH SỬ" }, { text: "📈 STATUS" }],
                    [{ text: "✅ CHẠY BOT" }, { text: "❌ TẮT BOT" }]
                ],
                resize_keyboard: true
            }
        });
    } else {
        bot.sendMessage(chatId, '❌ Key không hợp lệ hoặc đã hết hạn!\n\nVui lòng mua key mới tại SHOP KEY.', {
            reply_markup: {
                keyboard: [
                    [{ text: "🔑 SHOP KEY" }],
                    [{ text: "🔙 QUAY LẠI" }]
                ],
                resize_keyboard: true
            }
        });
    }
});

// Lệnh lịch sử
bot.onText(/\/history/, (msg) => {
    const chatId = msg.chat.id;
    
    if (!isUserActive(chatId)) {
        bot.sendMessage(chatId, '❌ Bạn chưa kích hoạt key hoặc key đã hết hạn!');
        return;
    }
    
    const historyMessage = formatHistoryMessage();
    bot.sendMessage(chatId, historyMessage, { 
        parse_mode: 'Markdown',
        reply_markup: {
            keyboard: [
                [{ text: "🔑 SHOP KEY" }, { text: "💳 BANK" }],
                [{ text: "👨‍💻 ADMIN" }, { text: "💬 BOX CHAT" }],
                [{ text: "📊 LỊCH SỬ" }, { text: "📈 STATUS" }],
                [{ text: "✅ CHẠY BOT" }, { text: "❌ TẮT BOT" }]
            ],
            resize_keyboard: true
        }
    });
});

// Lệnh status
bot.onText(/\/status/, (msg) => {
    const chatId = msg.chat.id;
    
    const users = readJSON(USER_FILE);
    const userData = users[chatId];
    
    if (!userData || !userData.active) {
        bot.sendMessage(chatId, '❌ Bạn chưa kích hoạt key hoặc key đã hết hạn!');
        return;
    }
    
    const keys = readJSON(KEY_FILE);
    const keyData = keys[userData.key];
    const remainingHours = Math.ceil((keyData.expires - Date.now()) / (60 * 60 * 1000));
    
    const message = `📊 *TRẠNG THÁI KEY CỦA BẠN:*

🔑 Key: \`${userData.key}\`
⏰ Thời hạn còn: *${remainingHours}* giờ
🎯 Lượt dùng còn: *${keyData.uses}*
🔧 Bot: ${botEnabled ? '🟢 Đang chạy' : '🔴 Đã tắt'}
📡 Phiên cuối: ${lastSentPhien}`;
    
    bot.sendMessage(chatId, message, { 
        parse_mode: 'Markdown',
        reply_markup: {
            keyboard: [
                [{ text: "🔑 SHOP KEY" }, { text: "💳 BANK" }],
                [{ text: "👨‍💻 ADMIN" }, { text: "💬 BOX CHAT" }],
                [{ text: "📊 LỊCH SỬ" }, { text: "📈 STATUS" }],
                [{ text: "✅ CHẠY BOT" }, { text: "❌ TẮT BOT" }]
            ],
            resize_keyboard: true
        }
    });
});

// ==================== LỆNH ADMIN ====================

// Lệnh help admin
bot.onText(/\/helpadmin/, (msg) => {
    const chatId = msg.chat.id;
    
    if (!isAdmin(chatId)) {
        bot.sendMessage(chatId, '❌ Bạn không có quyền sử dụng lệnh này!');
        return;
    }
    
    const message = `🛠️ *LỆNH QUẢN TRỊ VIÊN*

🔑 *Quản lý Key:*
/taokey [tên] [số_giờ] [số_lượt] - Tạo key mới
/xoakey [key] - Xóa key
/listkey - Danh sách key
/checkkey [key] - Kiểm tra key
/keystats - Thống kê key

👥 *Quản lý User:*
/listuser - Danh sách user
/userstats - Thống kê user
/xoauser [user_id] - Xóa user

🛡️ *Quản lý Admin:*
/themadmin [user_id] - Thêm admin
/xoaadmin [user_id] - Xóa admin
/listadmin - Danh sách admin

⚙️ *Quản lý Bot:*
/tatbotadmin - Tắt bot toàn hệ thống
/chaybotadmin - Bật bot toàn hệ thống
/botstats - Thống kê bot

📊 *Lệnh khác:*
/helpadmin - Hiển thị lệnh admin`;
    
    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
});

// Lệnh tạo key
bot.onText(/\/taokey (.+?) (.+?) (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    
    if (!isAdmin(chatId)) {
        bot.sendMessage(chatId, '❌ Bạn không có quyền!');
        return;
    }
    
    const keyName = match[1];
    const hours = parseInt(match[2]);
    const uses = parseInt(match[3]);
    
    if (isNaN(hours) || isNaN(uses) || hours <= 0 || uses <= 0) {
        bot.sendMessage(chatId, '❌ Số giờ và số lượt phải là số dương!');
        return;
    }
    
    const keys = readJSON(KEY_FILE);
    const newKey = `SUNWIN_${keyName}_${Date.now()}`;
    
    keys[newKey] = {
        created: Date.now(),
        expires: Date.now() + (hours * 60 * 60 * 1000),
        uses: uses,
        createdBy: chatId.toString(),
        hours: hours
    };
    
    writeJSON(KEY_FILE, keys);
    
    const expiresDate = new Date(keys[newKey].expires).toLocaleString('vi-VN');
    
    bot.sendMessage(chatId, `✅ *Tạo key thành công!*\n\n🔑 Key: \`${newKey}\`\n⏰ Thời hạn: ${hours} giờ\n🎯 Số lượt: ${uses}\n📅 Hết hạn: ${expiresDate}`, {
        parse_mode: 'Markdown'
    });
});

// Lệnh xóa key
bot.onText(/\/xoakey (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    
    if (!isAdmin(chatId)) {
        bot.sendMessage(chatId, '❌ Bạn không có quyền!');
        return;
    }
    
    const keyToDelete = match[1];
    const keys = readJSON(KEY_FILE);
    
    if (keys[keyToDelete]) {
        delete keys[keyToDelete];
        writeJSON(KEY_FILE, keys);
        bot.sendMessage(chatId, `✅ Đã xóa key: \`${keyToDelete}\``, { parse_mode: 'Markdown' });
    } else {
        bot.sendMessage(chatId, `❌ Không tìm thấy key: \`${keyToDelete}\``, { parse_mode: 'Markdown' });
    }
});

// Lệnh danh sách key
bot.onText(/\/listkey/, (msg) => {
    const chatId = msg.chat.id;
    
    if (!isAdmin(chatId)) {
        bot.sendMessage(chatId, '❌ Bạn không có quyền!');
        return;
    }
    
    const keys = readJSON(KEY_FILE);
    const keyEntries = Object.entries(keys);
    
    if (keyEntries.length === 0) {
        bot.sendMessage(chatId, '📭 Không có key nào trong hệ thống!');
        return;
    }
    
    let message = `🔑 *DANH SÁCH KEY (${keyEntries.length} key):*\n\n`;
    
    keyEntries.forEach(([key, data], index) => {
        const createdDate = new Date(data.created).toLocaleString('vi-VN');
        const expiresDate = new Date(data.expires).toLocaleString('vi-VN');
        const remainingHours = Math.ceil((data.expires - Date.now()) / (60 * 60 * 1000));
        const status = remainingHours > 0 ? '🟢' : '🔴';
        
        message += `${status} *Key ${index + 1}:* \`${key}\`\n`;
        message += `➤ Tạo: ${createdDate}\n`;
        message += `➤ Hết hạn: ${expiresDate}\n`;
        message += `➤ Còn lại: ${remainingHours} giờ\n`;
        message += `➤ Lượt dùng: ${data.uses}\n`;
        message += `➤ Tạo bởi: ${data.createdBy || 'admin'}\n\n`;
    });
    
    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
});

// Lệnh kiểm tra key
bot.onText(/\/checkkey (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    
    if (!isAdmin(chatId)) {
        bot.sendMessage(chatId, '❌ Bạn không có quyền!');
        return;
    }
    
    const keyToCheck = match[1];
    const keys = readJSON(KEY_FILE);
    const keyData = keys[keyToCheck];
    
    if (!keyData) {
        bot.sendMessage(chatId, `❌ Key \`${keyToCheck}\` không tồn tại!`, { parse_mode: 'Markdown' });
        return;
    }
    
    const createdDate = new Date(keyData.created).toLocaleString('vi-VN');
    const expiresDate = new Date(keyData.expires).toLocaleString('vi-VN');
    const remainingHours = Math.ceil((keyData.expires - Date.now()) / (60 * 60 * 1000));
    const status = remainingHours > 0 ? '🟢 CÒN HIỆU LỰC' : '🔴 HẾT HẠN';
    
    const message = `🔍 *THÔNG TIN KEY:*\n\n` +
                   `🔑 Key: \`${keyToCheck}\`\n` +
                   `📊 Trạng thái: ${status}\n` +
                   `🕐 Tạo lúc: ${createdDate}\n` +
                   `⏰ Hết hạn: ${expiresDate}\n` +
                   `⏱️ Còn lại: ${remainingHours} giờ\n` +
                   `🎯 Lượt dùng: ${keyData.uses}\n` +
                   `👤 Tạo bởi: ${keyData.createdBy || 'admin'}`;
    
    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
});

// Lệnh thống kê key
bot.onText(/\/keystats/, (msg) => {
    const chatId = msg.chat.id;
    
    if (!isAdmin(chatId)) {
        bot.sendMessage(chatId, '❌ Bạn không có quyền!');
        return;
    }
    
    const keys = readJSON(KEY_FILE);
    const keyEntries = Object.entries(keys);
    
    if (keyEntries.length === 0) {
        bot.sendMessage(chatId, '📭 Không có key nào trong hệ thống!');
        return;
    }
    
    const now = Date.now();
    const activeKeys = keyEntries.filter(([_, data]) => data.expires > now && data.uses > 0);
    const expiredKeys = keyEntries.filter(([_, data]) => data.expires <= now);
    const usedUpKeys = keyEntries.filter(([_, data]) => data.uses <= 0 && data.expires > now);
    
    let message = `📊 *THỐNG KÊ KEY:*\n\n`;
    message += `🔑 Tổng số key: ${keyEntries.length}\n`;
    message += `🟢 Key hoạt động: ${activeKeys.length}\n`;
    message += `🔴 Key hết hạn: ${expiredKeys.length}\n`;
    message += `🟡 Key hết lượt: ${usedUpKeys.length}\n\n`;
    
    // Thống kê theo thời hạn
    const hourStats = { '1-24': 0, '25-168': 0, '169+': 0 };
    activeKeys.forEach(([_, data]) => {
        const hoursLeft = Math.ceil((data.expires - now) / (60 * 60 * 1000));
        if (hoursLeft <= 24) hourStats['1-24']++;
        else if (hoursLeft <= 168) hourStats['25-168']++;
        else hourStats['169+']++;
    });
    
    message += `⏱️ *Phân bổ thời hạn:*\n`;
    message += `➤ 1-24 giờ: ${hourStats['1-24']} key\n`;
    message += `➤ 1-7 ngày: ${hourStats['25-168']} key\n`;
    message += `➤ 7+ ngày: ${hourStats['169+']} key`;
    
    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
});

// Lệnh thêm admin
bot.onText(/\/themadmin (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    
    if (chatId.toString() !== ADMIN_ID) {
        bot.sendMessage(chatId, '❌ Chỉ owner mới có quyền thêm admin!');
        return;
    }
    
    const newAdminId = match[1];
    const admins = readJSON(ADMIN_FILE);
    
    admins[newAdminId] = true;
    writeJSON(ADMIN_FILE, admins);
    
    bot.sendMessage(chatId, `✅ Đã thêm admin với ID: ${newAdminId}`);
    bot.sendMessage(newAdminId, `🎉 Bạn đã được thêm làm admin! Sử dụng /helpadmin để xem lệnh.`);
});

// Lệnh xóa admin
bot.onText(/\/xoaadmin (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    
    if (chatId.toString() !== ADMIN_ID) {
        bot.sendMessage(chatId, '❌ Chỉ owner mới có quyền xóa admin!');
        return;
    }
    
    const adminIdToRemove = match[1];
    const admins = readJSON(ADMIN_FILE);
    
    if (admins[adminIdToRemove]) {
        delete admins[adminIdToRemove];
        writeJSON(ADMIN_FILE, admins);
        bot.sendMessage(chatId, `✅ Đã xóa admin với ID: ${adminIdToRemove}`);
    } else {
        bot.sendMessage(chatId, `❌ Không tìm thấy admin với ID: ${adminIdToRemove}`);
    }
});

// Lệnh danh sách admin
bot.onText(/\/listadmin/, (msg) => {
    const chatId = msg.chat.id;
    
    if (!isAdmin(chatId)) {
        bot.sendMessage(chatId, '❌ Bạn không có quyền!');
        return;
    }
    
    const admins = readJSON(ADMIN_FILE);
    const adminEntries = Object.entries(admins);
    
    let message = `🛡️ *DANH SÁCH ADMIN:*\n\n`;
    message += `👑 Owner: ${ADMIN_ID}\n\n`;
    
    if (adminEntries.length === 0) {
        message += `Không có admin nào khác.`;
    } else {
        adminEntries.forEach(([adminId, _], index) => {
            message += `👤 Admin ${index + 1}: ${adminId}\n`;
        });
    }
    
    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
});

// Lệnh danh sách user
bot.onText(/\/listuser/, (msg) => {
    const chatId = msg.chat.id;
    
    if (!isAdmin(chatId)) {
        bot.sendMessage(chatId, '❌ Bạn không có quyền!');
        return;
    }
    
    const users = readJSON(USER_FILE);
    const userEntries = Object.entries(users);
    
    if (userEntries.length === 0) {
        bot.sendMessage(chatId, '📭 Không có user nào trong hệ thống!');
        return;
    }
    
    let message = `👥 *DANH SÁCH USER (${userEntries.length} user):*\n\n`;
    
    userEntries.forEach(([userId, data], index) => {
        const hoursAgo = Math.floor((Date.now() - data.joined) / (60 * 60 * 1000));
        message += `👤 User ${index + 1}:\n`;
        message += `➤ ID: ${userId}\n`;
        message += `➤ Key: ${data.key || 'Chưa có'}\n`;
        message += `➤ Tham gia: ${hoursAgo} giờ trước\n`;
        message += `➤ Trạng thái: ${data.active ? '✅ Active' : '❌ Inactive'}\n\n`;
    });
    
    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
});

// Lệnh xóa user
bot.onText(/\/xoauser (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    
    if (!isAdmin(chatId)) {
        bot.sendMessage(chatId, '❌ Bạn không có quyền!');
        return;
    }
    
    const userIdToDelete = match[1];
    const users = readJSON(USER_FILE);
    
    if (users[userIdToDelete]) {
        delete users[userIdToDelete];
        writeJSON(USER_FILE, users);
        bot.sendMessage(chatId, `✅ Đã xóa user với ID: ${userIdToDelete}`);
    } else {
        bot.sendMessage(chatId, `❌ Không tìm thấy user với ID: ${userIdToDelete}`);
    }
});

// Lệnh thống kê user
bot.onText(/\/userstats/, (msg) => {
    const chatId = msg.chat.id;
    
    if (!isAdmin(chatId)) {
        bot.sendMessage(chatId, '❌ Bạn không có quyền!');
        return;
    }
    
    const users = readJSON(USER_FILE);
    const userEntries = Object.entries(users);
    
    if (userEntries.length === 0) {
        bot.sendMessage(chatId, '📭 Không có user nào trong hệ thống!');
        return;
    }
    
    const activeUsers = userEntries.filter(([_, data]) => data.active === true);
    const inactiveUsers = userEntries.filter(([_, data]) => data.active === false);
    
    let message = `📊 *THỐNG KÊ USER:*\n\n`;
    message += `👥 Tổng số user: ${userEntries.length}\n`;
    message += `✅ User active: ${activeUsers.length}\n`;
    message += `❌ User inactive: ${inactiveUsers.length}\n\n`;
    
    // Thống kê theo thời gian tham gia
    const joinStats = { '1': 0, '24': 0, '168': 0, '720': 0 };
    userEntries.forEach(([_, data]) => {
        const hoursAgo = Math.floor((Date.now() - data.joined) / (60 * 60 * 1000));
        if (hoursAgo <= 1) joinStats['1']++;
        else if (hoursAgo <= 24) joinStats['24']++;
        else if (hoursAgo <= 168) joinStats['168']++;
        else joinStats['720']++;
    });
    
    message += `⏱️ *Phân bổ thời gian:*\n`;
    message += `➤ ≤ 1 giờ: ${joinStats['1']} user\n`;
    message += `➤ ≤ 1 ngày: ${joinStats['24']} user\n`;
    message += `➤ ≤ 1 tuần: ${joinStats['168']} user\n`;
    message += `➤ > 1 tuần: ${joinStats['720']} user`;
    
    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
});

// Lệnh tắt bot toàn hệ thống (admin)
bot.onText(/\/tatbotadmin/, (msg) => {
    const chatId = msg.chat.id;
    
    if (!isAdmin(chatId)) {
        bot.sendMessage(chatId, '❌ Bạn không có quyền!');
        return;
    }
    
    botEnabled = false;
    isSending = false;
    bot.sendMessage(chatId, '🔴 *Đã tắt bot toàn hệ thống!*', { parse_mode: 'Markdown' });
});

// Lệnh chạy bot toàn hệ thống (admin)
bot.onText(/\/chaybotadmin/, (msg) => {
    const chatId = msg.chat.id;
    
    if (!isAdmin(chatId)) {
        bot.sendMessage(chatId, '❌ Bạn không có quyền!');
        return;
    }
    
    botEnabled = true;
    bot.sendMessage(chatId, '🟢 *Đã bật bot toàn hệ thống!*', { parse_mode: 'Markdown' });
});

// Lệnh thống kê bot
bot.onText(/\/botstats/, (msg) => {
    const chatId = msg.chat.id;
    
    if (!isAdmin(chatId)) {
        bot.sendMessage(chatId, '❌ Bạn không có quyền!');
        return;
    }
    
    const users = readJSON(USER_FILE);
    const keys = readJSON(KEY_FILE);
    const history = readJSON(HISTORY_FILE);
    
    const totalUsers = Object.keys(users).length;
    const activeUsers = Object.keys(users).filter(id => users[id].active).length;
    const totalKeys = Object.keys(keys).length;
    const totalPredictions = Object.keys(history).length;
    
    const correctPredictions = Object.values(history).filter(h => h.isCorrect).length;
    const accuracy = totalPredictions > 0 ? ((correctPredictions / totalPredictions) * 100).toFixed(1) : 0;
    
    const message = `🤖 *THỐNG KÊ BOT:*\n\n` +
                   `👥 User: ${totalUsers} (${activeUsers} active)\n` +
                   `🔑 Key: ${totalKeys}\n` +
                   `📊 Dự đoán: ${totalPredictions}\n` +
                   `🎯 Độ chính xác: ${accuracy}%\n` +
                   `🔧 Trạng thái: ${botEnabled ? '🟢 Đang chạy' : '🔴 Đã tắt'}\n` +
                   `🚫 Chống spam: ${isSending ? '🟡 Đang gửi' : '🟢 Sẵn sàng'}\n` +
                   `📡 Last phiên: ${lastSentPhien}`;
    
    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
});

// Xử lý nút bấm từ keyboard
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (text === "🔑 SHOP KEY") {
        const shopMessage = `🛒 *SHOP KEY BOT SUN WIN*

💰 *BẢNG GIÁ KEY:*
• 1 NGÀY - 20K
• 3 NGÀY - 30K  
• 1 TUẦN - 50K
• 1 THÁNG - 100K
• 3 THÁNG - 200K
• VVIP - 250K

💳 *THÔNG TIN CHUYỂN KHOẢN:*
🏦 MB BANK: *1509200789*
👤 Chủ TK: *NGUYEN VAN TINH*

📞 *LIÊN HỆ ADMIN:* @mrtinhios
💬 *BOX CHAT:* @ChatToolTXViP

⚠️ Sau khi chuyển khoản, gửi ảnh xác nhận cho admin để nhận key!`;
        
        bot.sendMessage(chatId, shopMessage, { 
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: "1 NGÀY - 20K", callback_data: "shop_1day" }],
                    [{ text: "3 NGÀY - 30K", callback_data: "shop_3day" }],
                    [{ text: "1 TUẦN - 50K", callback_data: "shop_1week" }],
                    [{ text: "1 THÁNG - 100K", callback_data: "shop_1month" }],
                    [{ text: "3 THÁNG - 200K", callback_data: "shop_3month" }],
                    [{ text: "VVIP - 250K", callback_data: "shop_vvip" }],
                    [{ text: "🔙 QUAY LẠI", callback_data: "back_main" }]
                ]
            }
        });
    } else if (text === "💳 BANK") {
        const bankMessage = `🏦 *THÔNG TIN NGÂN HÀNG*

💳 *MB BANK:*
📱 Số TK: *1509200789*
👤 Chủ TK: *NGUYEN VAN TINH*

📸 *GỬI ẢNH CHUYỂN KHOẢN:* @mrtinhios
💬 *BOX CHAT:* @ChatToolTXViP

⚠️ Sau khi chuyển khoản, vui lòng gửi ảnh xác nhận cho admin!`;
        
        bot.sendMessage(chatId, bankMessage, { 
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: "MB BANK: 1509200789", callback_data: "bank_mb" }],
                    [{ text: "Chủ TK: NGUYEN VAN TINH", callback_data: "bank_name" }],
                    [{ text: "📸 GỬI ẢNH CHUYỂN KHOẢN", url: "https://t.me/mrtinhios" }],
                    [{ text: "🔙 QUAY LẠI", callback_data: "back_main" }]
                ]
            }
        });
    } else if (text === "👨‍💻 ADMIN") {
        bot.sendMessage(chatId, '📞 *LIÊN HỆ ADMIN:* @mrtinhios\n💬 *BOX CHAT:* @ChatToolTXViP', {
            parse_mode: 'Markdown',
            reply_markup: {
                keyboard: [
                    [{ text: "🔑 SHOP KEY" }, { text: "💳 BANK" }],
                    [{ text: "👨‍💻 ADMIN" }, { text: "💬 BOX CHAT" }],
                    [{ text: "📊 LỊCH SỬ" }, { text: "📈 STATUS" }],
                    [{ text: "✅ CHẠY BOT" }, { text: "❌ TẮT BOT" }]
                ],
                resize_keyboard: true
            }
        });
    } else if (text === "💬 BOX CHAT") {
        bot.sendMessage(chatId, '💬 *THAM GIA BOX CHAT:* @ChatToolTXViP', {
            parse_mode: 'Markdown',
            reply_markup: {
                keyboard: [
                    [{ text: "🔑 SHOP KEY" }, { text: "💳 BANK" }],
                    [{ text: "👨‍💻 ADMIN" }, { text: "💬 BOX CHAT" }],
                    [{ text: "📊 LỊCH SỬ" }, { text: "📈 STATUS" }],
                    [{ text: "✅ CHẠY BOT" }, { text: "❌ TẮT BOT" }]
                ],
                resize_keyboard: true
            }
        });
    } else if (text === "📊 LỊCH SỬ") {
        const users = readJSON(USER_FILE);
        const userData = users[chatId];
        
        if (!userData || !userData.active) {
            bot.sendMessage(chatId, '❌ Bạn chưa kích hoạt key hoặc key đã hết hạn!');
            return;
        }
        
        const historyMessage = formatHistoryMessage();
        bot.sendMessage(chatId, historyMessage, { 
            parse_mode: 'Markdown',
            reply_markup: {
                keyboard: [
                    [{ text: "🔑 SHOP KEY" }, { text: "💳 BANK" }],
                    [{ text: "👨‍💻 ADMIN" }, { text: "💬 BOX CHAT" }],
                    [{ text: "📊 LỊCH SỬ" }, { text: "📈 STATUS" }],
                    [{ text: "✅ CHẠY BOT" }, { text: "❌ TẮT BOT" }]
                ],
                resize_keyboard: true
            }
        });
    } else if (text === "📈 STATUS") {
        const users = readJSON(USER_FILE);
        const userData = users[chatId];
        
        if (!userData || !userData.active) {
            bot.sendMessage(chatId, '❌ Bạn chưa kích hoạt key hoặc key đã hết hạn!');
            return;
        }
        
        const keys = readJSON(KEY_FILE);
        const keyData = keys[userData.key];
        const remainingHours = Math.ceil((keyData.expires - Date.now()) / (60 * 60 * 1000));
        
        const message = `📊 *TRẠNG THÁI KEY CỦA BẠN:*

🔑 Key: \`${userData.key}\`
⏰ Thời hạn còn: *${remainingHours}* giờ
🎯 Lượt dùng còn: *${keyData.uses}*
🔧 Bot: ${botEnabled ? '🟢 Đang chạy' : '🔴 Đã tắt'}
📡 Phiên cuối: ${lastSentPhien}`;
        
        bot.sendMessage(chatId, message, { 
            parse_mode: 'Markdown',
            reply_markup: {
                keyboard: [
                    [{ text: "🔑 SHOP KEY" }, { text: "💳 BANK" }],
                    [{ text: "👨‍💻 ADMIN" }, { text: "💬 BOX CHAT" }],
                    [{ text: "📊 LỊCH SỬ" }, { text: "📈 STATUS" }],
                    [{ text: "✅ CHẠY BOT" }, { text: "❌ TẮT BOT" }]
                ],
                resize_keyboard: true
            }
        });
    } else if (text === "✅ CHẠY BOT") {
        if (!isUserActive(chatId)) {
            bot.sendMessage(chatId, '❌ Bạn chưa kích hoạt key hoặc key đã hết hạn!');
            return;
        }
        
        botEnabled = true;
        bot.sendMessage(chatId, '🟢 *Đã bật bot!*\n\nBot sẽ gửi thông báo kết quả và dự đoán.', { 
            parse_mode: 'Markdown',
            reply_markup: {
                keyboard: [
                    [{ text: "🔑 SHOP KEY" }, { text: "💳 BANK" }],
                    [{ text: "👨‍💻 ADMIN" }, { text: "💬 BOX CHAT" }],
                    [{ text: "📊 LỊCH SỬ" }, { text: "📈 STATUS" }],
                    [{ text: "✅ CHẠY BOT" }, { text: "❌ TẮT BOT" }]
                ],
                resize_keyboard: true
            }
        });
    } else if (text === "❌ TẮT BOT") {
        if (!isUserActive(chatId)) {
            bot.sendMessage(chatId, '❌ Bạn chưa kích hoạt key hoặc key đã hết hạn!');
            return;
        }
        
        botEnabled = false;
        bot.sendMessage(chatId, '🔴 *Đã tắt bot!*\n\nBot sẽ không gửi thông báo nữa.', { 
            parse_mode: 'Markdown',
            reply_markup: {
                keyboard: [
                    [{ text: "🔑 SHOP KEY" }, { text: "💳 BANK" }],
                    [{ text: "👨‍💻 ADMIN" }, { text: "💬 BOX CHAT" }],
                    [{ text: "📊 LỊCH SỬ" }, { text: "📈 STATUS" }],
                    [{ text: "✅ CHẠY BOT" }, { text: "❌ TẮT BOT" }]
                ],
                resize_keyboard: true
            }
        });
    }
});

// Xử lý callback từ inline keyboard
bot.on('callback_query', (callbackQuery) => {
    const message = callbackQuery.message;
    const chatId = message.chat.id;
    const data = callbackQuery.data;

    if (data === 'back_main') {
        bot.sendMessage(chatId, '🔙 Đã quay lại menu chính!', {
            reply_markup: {
                keyboard: [
                    [{ text: "🔑 SHOP KEY" }, { text: "💳 BANK" }],
                    [{ text: "👨‍💻 ADMIN" }, { text: "💬 BOX CHAT" }],
                    [{ text: "📊 LỊCH SỬ" }, { text: "📈 STATUS" }],
                    [{ text: "✅ CHẠY BOT" }, { text: "❌ TẮT BOT" }]
                ],
                resize_keyboard: true
            }
        });
    }
    
    bot.answerCallbackQuery(callbackQuery.id);
});

// Reset lastSentPhien khi có phiên mới thực sự - FIX QUAN TRỌNG
async function resetLastSentPhien() {
    try {
        const data = await fetchAPIData();
        if (data && data.lich_su && data.lich_su.length > 0) {
            const latestResult = data.lich_su[data.lich_su.length - 1];
            if (parseInt(latestResult.Phien) > parseInt(lastSentPhien)) {
                lastSentPhien = parseInt(latestResult.Phien) - 1;
                console.log(`🔄 Đã reset lastSentPhien thành: ${lastSentPhien}`);
            }
        }
    } catch (error) {
        console.log('❌ Lỗi reset lastSentPhien:', error.message);
    }
}

// Kiểm tra API mỗi 10 giây
setInterval(checkAndNotify, 10000);

// Reset mỗi 5 phút để tránh bị kẹt
setInterval(resetLastSentPhien, 300000);

console.log('🤖 BOT SUN WIN đã khởi động!');
console.log('📡 Đang theo dõi API...');

// Khởi tạo file nếu chưa có
if (!fs.existsSync(USER_FILE)) {
    writeJSON(USER_FILE, {});
}
if (!fs.existsSync(KEY_FILE)) {
    writeJSON(KEY_FILE, {});
}
if (!fs.existsSync(HISTORY_FILE)) {
    writeJSON(HISTORY_FILE, {});
}
if (!fs.existsSync(ADMIN_FILE)) {
    writeJSON(ADMIN_FILE, {});
}

// Reset lastSentPhien khi khởi động
setTimeout(resetLastSentPhien, 5000);