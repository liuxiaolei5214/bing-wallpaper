/**
 * Bing 每日壁纸 - 纯前端项目
 * 使用多个 CORS 代理，带自动重试 + 浏览器缓存
 * 精简版：只保留必要字段，去掉版权符号
 * 历史壁纸从 history.json 读取，不受 API 限制
 */

// ============ 配置 ============
const BING_BASE = 'https://cn.bing.com';
const API_TIMEOUT = 5000; // 5 秒超时
const MAX_RETRIES = 1;    // 每个代理最多重试 1 次
const HISTORY_COUNT = 10; // 首页显示的历史壁纸数量

// 缓存配置
const CACHE_KEY = 'bing_wallpaper_cache';
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 小时

// 多个代理，按优先级排列
const PROXIES = [
    // 1. 你自己的 Cloudflare Worker
    (url) => `https://bingdl.lei5214.cc.cd/?target=${encodeURIComponent(url)}`,
    
    // 2. 备选公共代理
    (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    
    // 3. 直接请求（仅本地测试可用）
    (url) => url
];

function buildBingUrl() {
    const timestamp = Date.now();
    return `https://cn.bing.com/HPImageArchive.aspx?format=js&idx=0&n=8&nc=${timestamp}&pid=hp&FORM=BEHPTB&uhd=1&uhdwidth=3840&uhdheight=2160&setmkt=zh-CN`;
}

// ============ 缓存管理 ============

/** 读取缓存 */
function getCachedWallpapers() {
    try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (!cached) return null;
        const data = JSON.parse(cached);
        if (Date.now() - data.timestamp > CACHE_EXPIRY) {
            localStorage.removeItem(CACHE_KEY);
            return null;
        }
        const today = new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' });
        if (data.date !== today) {
            localStorage.removeItem(CACHE_KEY);
            return null;
        }
        console.log('📂 使用缓存的壁纸数据，共', data.images.length, '张');
        return data.images;
    } catch (e) {
        return null;
    }
}

/** 保存缓存 */
function setCachedWallpapers(images) {
    try {
        const today = new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' });
        localStorage.setItem(CACHE_KEY, JSON.stringify({
            images: images,
            date: today,
            timestamp: Date.now()
        }));
        console.log('💾 壁纸数据已缓存');
    } catch (e) {
        console.warn('缓存保存失败:', e);
    }
}

// ============ 工具函数 ============

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
        // 不再加 1 天（与 enddate 保持一致）
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

// ============ ⭐ 核心：精简数据（只保留必要字段，去掉版权符号） ============

/** 清理版权信息，去掉 (© xxx) 部分 */
function cleanCopyright(text) {
    if (!text) return '';
    let cleaned = text.replace(/\s*\(©[^)]*\)\s*/g, '');
    cleaned = cleaned.replace(/\s*\(©[^)]*$/, '');
    cleaned = cleaned.replace(/\s*,\s*$/, '');
    return cleaned.trim();
}

/** 精简图片数据，只保留必要字段 */
function cleanImageData(img) {
    return {
        startdate: img.startdate || '',
        enddate: img.enddate || '',
        url: img.url || '',
        urlbase: img.urlbase || '',
        copyright: cleanCopyright(img.copyright || '')
    };
}

// ============ 从 history.json 读取历史数据 ============

async function fetchHistoryFromJSON() {
    try {
        const response = await fetch('history.json');
        if (!response.ok) throw new Error('无法加载 history.json');
        const data = await response.json();
        if (!Array.isArray(data) || data.length === 0) {
            throw new Error('历史数据为空');
        }
        // 按 enddate 降序排列（最新的在前）
        data.sort((a, b) => parseInt(b.enddate) - parseInt(a.enddate));
        console.log('📚 从 history.json 读取历史数据，共', data.length, '条');
        return data;
    } catch (error) {
        console.warn('⚠️ 无法从 history.json 读取历史数据:', error);
        return null;
    }
}

// ============ 核心：并行请求 + 缓存 ============

async function fetchWallpapers() {
    // 1. 先检查缓存
    const cached = getCachedWallpapers();
    if (cached) {
        return cached;
    }

    console.log('🌐 缓存未命中，请求 API...');
    const bingUrl = buildBingUrl();

    const urlsToTry = [];
    for (const proxyFn of PROXIES) {
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            urlsToTry.push({
                url: proxyFn(bingUrl),
                proxyIndex: PROXIES.indexOf(proxyFn),
                attempt: attempt
            });
        }
    }

    function fetchWithTimeout(url, timeout = API_TIMEOUT) {
        return Promise.race([
            fetch(url),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error(`请求超时 (${timeout}ms)`)), timeout)
            )
        ]);
    }

    const promises = urlsToTry.map(async ({ url, proxyIndex, attempt }) => {
        try {
            console.log(`⏳ 尝试代理 ${proxyIndex + 1}/${PROXIES.length}，第 ${attempt + 1} 次...`);
            const response = await fetchWithTimeout(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            if (!data.images || data.images.length === 0) {
                throw new Error('API 返回数据为空');
            }
            return { success: true, data, proxyIndex, attempt };
        } catch (error) {
            return { success: false, error: error.message, proxyIndex, attempt };
        }
    });

    const results = await Promise.allSettled(promises);

    for (const result of results) {
        if (result.status === 'fulfilled' && result.value.success) {
            const { data, proxyIndex, attempt } = result.value;
            console.log(`✅ 代理 ${proxyIndex + 1} 第 ${attempt + 1} 次尝试成功！共 ${data.images.length} 张壁纸`);
            
            // ⭐ 排序：按 enddate 降序
            data.images.sort((a, b) => parseInt(b.enddate) - parseInt(a.enddate));
            
            // ⭐ 精简数据：只保留必要字段，去掉版权符号
            const cleanImages = data.images.map(img => cleanImageData(img));
            
            // 保存缓存
            setCachedWallpapers(cleanImages);
            return cleanImages;
        }
    }

    const errors = results
        .filter(r => r.status === 'fulfilled' && !r.value.success)
        .map(r => r.value.error);
    console.error('❌ 所有代理均失败:', errors);
    throw new Error(`无法获取壁纸数据：${errors.slice(0, 3).join('；')}`);
}

// ============ 渲染函数 ============

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
            <div class="copyright">📷 ${copyright}</div>
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-top: 14px;">
                <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                    <a href="${hdUrl}" class="btn btn-primary" target="_blank">⬇️ 下载 4K</a>
                    <a href="${url}" class="btn btn-secondary" target="_blank">🖼️ 查看原图</a>
                </div>
                <a href="/archive.html" class="btn btn-secondary">📚 壁纸归档</a>
            </div>
        </div>
    `;
}

/** 从数据数组渲染历史壁纸 */
function renderHistoryFromData(history) {
    const container = document.getElementById('historyGrid');
    if (!history || history.length === 0) {
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

// ============ 主函数 ============

async function main() {
    const todayContainer = document.getElementById('todayCard');
    const historyContainer = document.getElementById('historyGrid');

    if (todayContainer) todayContainer.innerHTML = '<div class="loading">加载今日壁纸中...</div>';
    if (historyContainer) historyContainer.innerHTML = '<div class="loading">加载历史壁纸中...</div>';

    updateClock();
    setInterval(updateClock, 30000);

    try {
        // 1. 获取今日壁纸（从 API）
        const images = await fetchWallpapers();

        if (!images || images.length === 0) {
            showError('todayCard', '未能获取壁纸数据，请稍后重试');
            if (historyContainer) historyContainer.innerHTML = '';
            return;
        }

        // 2. 渲染今日壁纸（取第一张）
        renderToday(images);

        // 3. 获取今日的日期（用于排除）
        const todayDate = images[0]?.enddate || '';

        // 4. ⭐ 从 history.json 读取历史数据
        const historyData = await fetchHistoryFromJSON();

        if (historyData && historyData.length > 1) {
            // 排除今日（第一张），取后面的历史记录
            const historyImages = historyData.filter(item => item.enddate !== todayDate);
            // 取前 N 张（由 HISTORY_COUNT 控制）
            const limitedHistory = historyImages.slice(0, HISTORY_COUNT);
            renderHistoryFromData(limitedHistory);
            console.log(`📚 显示 ${limitedHistory.length} 张历史壁纸（从 history.json）`);
        } else {
            // 如果 history.json 没有数据，用 API 返回的历史数据（降级方案）
            const fallbackHistory = images.slice(1);
            renderHistoryFromData(fallbackHistory);
            console.log(`📚 降级方案：显示 ${fallbackHistory.length} 张历史壁纸（从 API）`);
        }

    } catch (error) {
        console.error('主流程错误:', error);
        showError('todayCard', `加载失败：${error.message || '未知错误'}`);
        if (historyContainer) historyContainer.innerHTML = '';
    }
}

// ============ 页面加载 ============
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
} else {
    main();
}
