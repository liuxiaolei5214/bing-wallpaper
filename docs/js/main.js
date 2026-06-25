/**
 * Bing 每日壁纸 - 纯前端项目
 * 使用多个 CORS 代理，带自动重试
 */

// ========== 配置 ==========
const BING_BASE = 'https://cn.bing.com';
const API_TIMEOUT = 10000; // 10秒超时
const MAX_RETRIES = 2;

// 多个代理，按优先级排列
const PROXIES = [
    // 方案1: 使用 allorigins（最常用）
    (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    // 方案2: 使用 corsproxy.io（备选）
    (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    // 方案3: 直接请求（如果浏览器支持）
    (url) => url
];

// 构建 Bing API URL（带时间戳防缓存）
function buildBingUrl() {
    const timestamp = Date.now();
    return `https://cn.bing.com/HPImageArchive.aspx?format=js&idx=0&n=19&nc=${timestamp}&pid=hp&FORM=BEHPTB&uhd=1&uhdwidth=3840&uhdheight=2160&setmkt=zh-CN`;
}

// ========== 工具函数 ==========

function getBeijingTime() {
    const now = new Date();
    const beijingStr = now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    return new Date(beijingStr);
}

function formatDisplayDate(dateStr) {
    if (dateStr && dateStr.length === 8) {
        const year = parseInt(dateStr.slice(0,4));
        const month = parseInt(dateStr.slice(4,6)) - 1;
        const day = parseInt(dateStr.slice(6,8));
        const date = new Date(year, month, day);
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    return dateStr || '未知日期';
}

function updateClock() {
    const el = document.getElementById('currentTime');
    if (!el) return;
    const now = getBeijingTime();
    el.textContent = `🕐 ${now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })} (北京时间)`;
}

// ========== API 请求（带重试和多代理） ==========

function fetchWithTimeout(url, timeout = API_TIMEOUT) {
    return Promise.race([
        fetch(url),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('请求超时')), timeout)
        )
    ]);
}

async function fetchWallpapers() {
    const bingUrl = buildBingUrl();
    const errors = [];

    for (let i = 0; i < PROXIES.length; i++) {
        const proxyFn = PROXIES[i];
        const proxyUrl = proxyFn(bingUrl);

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                console.log(`尝试代理 ${i+1}/${PROXIES.length}，第 ${attempt+1} 次...`);
                const response = await fetchWithTimeout(proxyUrl);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const data = await response.json();
                if (!data.images || data.images.length === 0) throw new Error('API 返回数据为空');
                
                // ⭐ 关键：按 enddate 降序排列，最新的在前
                data.images.sort((a, b) => {
                    return parseInt(b.enddate) - parseInt(a.enddate);
                });
                
                console.log('📸 第一张图片的 enddate:', data.images[0].enddate);
                console.log('📸 第一张图片的 copyright:', data.images[0].copyright);
                console.log(`✅ 获取成功！共 ${data.images.length} 张壁纸`);
                return data.images;
            } catch (error) {
                errors.push(`代理${i+1}-尝试${attempt+1}: ${error.message}`);
                console.warn(`第 ${attempt+1} 次尝试失败:`, error.message);
                if (attempt === MAX_RETRIES) {
                    await new Promise(r => setTimeout(r, 500));
                }
            }
        }
    }

    console.error('所有请求均失败:', errors);
    throw new Error(`无法获取壁纸数据：${errors.join('；')}`);
}

// ========== 渲染函数 ==========

function renderToday(images) {
    const container = document.getElementById('todayCard');
    if (!images || images.length === 0) {
        container.innerHTML = '<div class="error">❌ 暂无壁纸数据</div>';
        return;
    }

    const img = images[0];
    const url = BING_BASE + img.url;
    const dateStr = img.enddate || '';
    const displayDate = formatDisplayDate(dateStr);
    const copyright = img.copyright || 'Bing 每日壁纸';
    const copyrightLink = img.copyrightlink || '#';

    const hdUrl = url.includes('?')
        ? url + '&uhd=1&uhdwidth=3840&uhdheight=2160'
        : url + '?uhd=1&uhdwidth=3840&uhdheight=2160';

    container.innerHTML = `
        <img
            src="${url}"
            alt="${copyright}"
            loading="eager"
            onerror="this.src='${url}'"
        />
        <div class="info">
            <div class="date">📅 ${displayDate}</div>
            <div class="copyright">
                📷 ${copyright}
                ${copyrightLink && copyrightLink !== '#' ? ` · <a href="${copyrightLink}" target="_blank">了解详情</a>` : ''}
            </div>
            <div class="actions">
                <a href="${hdUrl}" class="btn btn-primary" target="_blank">⬇️ 下载 4K</a>
                <a href="${url}" class="btn btn-secondary" target="_blank">🖼️ 查看原图</a>
            </div>
        </div>
    `;
}

function renderHistory(images) {
    const container = document.getElementById('historyGrid');
    if (!images || images.length < 2) {
        container.innerHTML = '<div class="loading">暂无历史壁纸</div>';
        return;
    }

    const history = images.slice(1);

    if (history.length === 0) {
        container.innerHTML = '<div class="loading">暂无历史壁纸</div>';
        return;
    }

    container.innerHTML = history.map(img => {
        const url = BING_BASE + img.url;
        const dateStr = img.enddate || '';
        const displayDate = formatDisplayDate(dateStr);
        const copyright = img.copyright || 'Bing 壁纸';

        return `
            <div class="history-item" title="${copyright}" onclick="window.open('${url}', '_blank')">
                <img
                    src="${url}"
                    alt="${copyright}"
                    loading="lazy"
                    onerror="this.style.display='none'"
                />
                <div class="info">
                    <div class="date">📅 ${displayDate}</div>
                    <div class="copyright">${copyright}</div>
                </div>
            </div>
        `;
    }).join('');
}

function showError(containerId, message) {
    const container = document.getElementById(containerId);
    if (container) {
        container.innerHTML = `<div class="error">❌ ${message}</div>`;
    }
}

// ========== 主函数 ==========

async function main() {
    const todayContainer = document.getElementById('todayCard');
    const historyContainer = document.getElementById('historyGrid');

    if (todayContainer) todayContainer.innerHTML = '<div class="loading">加载今日壁纸中...</div>';
    if (historyContainer) historyContainer.innerHTML = '<div class="loading">加载历史壁纸中...</div>';

    updateClock();
    setInterval(updateClock, 30000);

    try {
        const images = await fetchWallpapers();

        if (!images || images.length === 0) {
            showError('todayCard', '未能获取壁纸数据，请稍后重试');
            if (historyContainer) historyContainer.innerHTML = '';
            return;
        }

        renderToday(images);
        renderHistory(images);

    } catch (error) {
        console.error('主流程错误:', error);
        showError('todayCard', `加载失败：${error.message || '未知错误'}`);
        if (historyContainer) historyContainer.innerHTML = '';
    }
}

// ========== 页面加载 ==========
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
} else {
    main();
}
