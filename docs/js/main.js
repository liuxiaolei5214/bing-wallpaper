/**
 * Bing 每日壁纸 - 纯前端项目
 * 使用 CORS 代理解决跨域问题
 */

// ========== 配置 ==========
// n=50 表示获取 20 张壁纸（1 张今日 + 49 张历史）
const BING_API = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(
    'https://cn.bing.com/HPImageArchive.aspx?format=js&idx=0&n=50&nc=1612409408851&pid=hp&FORM=BEHPTB&uhd=1&uhdwidth=3840&uhdheight=2160'
);
const BING_BASE = 'https://cn.bing.com';
const API_TIMEOUT = 15000;

// ========== 工具函数 ==========

function getBeijingTime() {
    const now = new Date();
    const beijingStr = now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    return new Date(beijingStr);
}

// 格式化日期：API 返回 20260624，需要加 1 天补偿时区
function formatDisplayDate(dateStr) {
    if (dateStr && dateStr.length === 8) {
        const year = parseInt(dateStr.slice(0,4));
        const month = parseInt(dateStr.slice(4,6)) - 1;
        const day = parseInt(dateStr.slice(6,8));
        const date = new Date(year, month, day);
        // 加 1 天，补偿时区差异
        date.setDate(date.getDate() + 1);
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

// ========== API 请求 ==========

function fetchWithTimeout(url, timeout = API_TIMEOUT) {
    return Promise.race([
        fetch(url),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('请求超时，请稍后重试')), timeout)
        )
    ]);
}

async function fetchWallpapers() {
    try {
        console.log('正在获取壁纸数据...');
        const response = await fetchWithTimeout(BING_API);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const data = await response.json();
        if (!data.images || data.images.length === 0) {
            throw new Error('API 返回数据为空');
        }
        console.log('✅ 获取成功，共', data.images.length, '张壁纸');
        return data.images;
    } catch (error) {
        console.error('获取壁纸失败:', error);
        throw error;
    }
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

    // 跳过第一张（今日）
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
