/**
 * Bing 每日壁纸 - 纯前端项目
 * 直接调用 Bing API，无需后端
 */

// ========== 配置 ==========
const BING_API = 'https://cn.bing.com/HPImageArchive.aspx?format=js&idx=0&n=10&nc=1612409408851&pid=hp&FORM=BEHPTB&uhd=1&uhdwidth=3840&uhdheight=2160';
const BING_BASE = 'https://cn.bing.com';
const API_TIMEOUT = 15000; // 15秒超时

// ========== 工具函数 ==========

/** 获取北京时间 */
function getBeijingTime() {
    const now = new Date();
    // 使用 toLocaleString 直接获取北京时间
    const beijingStr = now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    return new Date(beijingStr);
}

/** 格式化日期：YYYY-MM-DD */
function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/** 格式化日期显示 */
function formatDisplayDate(dateStr) {
    // enddate 格式: 20260625
    if (dateStr && dateStr.length === 8) {
        return `${dateStr.slice(0,4)}-${dateStr.slice(4,6)}-${dateStr.slice(6,8)}`;
    }
    return dateStr || '未知日期';
}

/** 获取当前时间显示 */
function updateClock() {
    const el = document.getElementById('currentTime');
    if (!el) return;
    const now = getBeijingTime();
    el.textContent = `🕐 ${now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })} (北京时间)`;
}

// ========== API 请求 ==========

/** 带超时的 fetch */
function fetchWithTimeout(url, timeout = API_TIMEOUT) {
    return Promise.race([
        fetch(url),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('请求超时，请稍后重试')), timeout)
        )
    ]);
}

/** 获取壁纸数据 */
async function fetchWallpapers() {
    try {
        const response = await fetchWithTimeout(BING_API);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const data = await response.json();
        if (!data.images || data.images.length === 0) {
            throw new Error('API 返回数据为空');
        }
        return data.images;
    } catch (error) {
        console.error('获取壁纸失败:', error);
        throw error;
    }
}

// ========== 渲染函数 ==========

/** 渲染今日壁纸 */
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

    // 构建 4K 高清链接
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
                <button class="btn" onclick="window.open('${hdUrl}', '_blank')">🔄 新窗口打开</button>
            </div>
        </div>
    `;
}

/** 渲染历史壁纸 */
function renderHistory(images) {
    const container = document.getElementById('historyGrid');
    if (!images || images.length < 2) {
        container.innerHTML = '<div class="loading">暂无历史壁纸</div>';
        return;
    }

    // 跳过第一张（今日），显示接下来的 9 张
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

/** 显示错误信息 */
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

    // 显示加载状态
    if (todayContainer) todayContainer.innerHTML = '<div class="loading">加载今日壁纸中</div>';
    if (historyContainer) historyContainer.innerHTML = '<div class="loading">加载历史壁纸中</div>';

    // 启动时钟
    updateClock();
    setInterval(updateClock, 30000); // 每30秒更新一次

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

// ========== 页面加载完成后执行 ==========
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
} else {
    main();
}
