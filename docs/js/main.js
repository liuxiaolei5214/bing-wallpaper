/**
 * Bing 每日壁纸 - 纯前端项目
 * 使用多个 CORS 代理，带自动重试 + 浏览器缓存
 * 精简版：只保留必要字段，去掉版权符号
 */

// ============ 配置 ============
const BING_BASE = 'https://cn.bing.com';
const API_TIMEOUT = 5000; // 5 秒超时
const MAX_RETRIES = 1;    // 每个代理最多重试 1 次

// 缓存配置
const CACHE_KEY = 'bing_wallpaper_cache';
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 小时

// 多个代理，按优先级排列
const PROXIES = [
    // 1. 你自己的 Cloudflare Worker（如果有的话，取消注释并修改）
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
        // 加 1 天，补偿时区差异（如果不需要可以注释掉）
        //date.setDate(date.getDate() + 1);
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
    // 移除 (© xxx) 或 (© xxx) 及后面内容
    let cleaned = text.replace(/\s*\(©[^)]*\)\s*/g, '');
    // 移除末尾不完整的 (© xxx
    cleaned = cleaned.replace(/\s*\(©[^)]*$/, '');
    // 移除多余的逗号和空格
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
    // ⭐ 已经清理过版权信息，直接使用
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
            <div class="copyright">
                📷 ${copyright}
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
        // ⭐ 已经清理过版权信息，直接使用
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

// ============ 页面加载 ============
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
} else {
    main();
}
