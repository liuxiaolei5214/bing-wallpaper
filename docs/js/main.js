/**
 * Bing 每日壁纸 - 纯前端项目
 * 精简版：只保留今日壁纸 + 电影感轮播
 */

// ============ 配置 ============
const BING_BASE = 'https://cn.bing.com';
const API_TIMEOUT = 5000;
const MAX_RETRIES = 1;

const CACHE_KEY = 'bing_wallpaper_cache';
const CACHE_EXPIRY = 24 * 60 * 60 * 1000;

// 多个代理，按优先级排列
const PROXIES = [
    (url) => `https://bingdl.lei5214.cc.cd/?target=${encodeURIComponent(url)}`,
    (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    (url) => url
];

function buildBingUrl() {
    const timestamp = Date.now();
    return `https://cn.bing.com/HPImageArchive.aspx?format=js&idx=0&n=8&nc=${timestamp}&pid=hp&FORM=BEHPTB&uhd=1&uhdwidth=3840&uhdheight=2160&setmkt=zh-CN`;
}

// ============ 缓存管理 ============

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

function cleanCopyright(text) {
    if (!text) return '';
    let cleaned = text.replace(/\s*\(©[^)]*\)\s*/g, '');
    cleaned = cleaned.replace(/\s*\(©[^)]*$/, '');
    cleaned = cleaned.replace(/\s*,\s*$/, '');
    return cleaned.trim();
}

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
            data.images.sort((a, b) => parseInt(b.enddate) - parseInt(a.enddate));
            const cleanImages = data.images.map(img => cleanImageData(img));
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

// ============ 渲染今日壁纸 ============

function renderToday(images) {
    const container = document.getElementById('todayCard');
    if (!images || images.length === 0) {
        container.innerHTML = '<div class="error">❌ 暂无壁纸数据</div>';
        return;
    }

    const img = images[0];
    let url = img.url;
    if (url && !url.startsWith('http')) {
        url = BING_BASE + url;
    }
    const dateStr = img.enddate || '';
    const displayDate = formatDisplayDate(dateStr);
    const copyright = img.copyright || 'Bing 每日壁纸';

    // 1080P 链接
    let hd1080Url = url;
    hd1080Url = hd1080Url.replace(/_UHD\.jpg/g, '_1920x1080.jpg');
    hd1080Url = hd1080Url.replace(/&w=3840&h=2160&rs=1&c=4/g, '');

    // 4K 链接
    let hd4kUrl = url;
    hd4kUrl = hd4kUrl.replace(/_1920x1080\.jpg/g, '_UHD.jpg');
    hd4kUrl = hd4kUrl.replace(/1920x1080/g, 'UHD');
    hd4kUrl = hd4kUrl.replace(/&rf=LaDigue_1920x1080\.jpg/g, '');
    hd4kUrl = hd4kUrl.replace(/&w=3840&h=2160&rs=1&c=4/g, '');
    if (hd4kUrl.includes('?')) {
        hd4kUrl = hd4kUrl + '&w=3840&h=2160&rs=1&c=4&uhd=1&uhdwidth=3840&uhdheight=2160';
    } else {
        hd4kUrl = hd4kUrl + '?w=3840&h=2160&rs=1&c=4&uhd=1&uhdwidth=3840&uhdheight=2160';
    }

    const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 4px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;

    container.innerHTML = `
        <img src="${url}" alt="${copyright}" loading="eager" onerror="this.src='${url}'" />
        <div class="info">
            <div class="date">📅 ${displayDate}</div>
            <div class="copyright">📷 ${copyright}</div>
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-top: 14px;">
                <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                    <a href="${hd4kUrl}" class="btn btn-primary" target="_blank" style="display: inline-flex; align-items: center; gap: 4px;">
                        ${svgIcon}
                        4K
                    </a>
                    <a href="${hd1080Url}" class="btn btn-secondary" target="_blank" style="display: inline-flex; align-items: center; gap: 4px;">
                        ${svgIcon}
                        1080P
                    </a>
                </div>
                <a href="/archive.html" class="btn btn-secondary">📚 壁纸归档</a>
            </div>
        </div>
    `;
}

// ============ 电影感壁纸轮播 ============

let movieData = [];
let movieIndex = 0;
let movieInterval = null;

function renderMovieCarousel(images) {
    const slide = document.getElementById('movieSlide');
    const thumbs = document.getElementById('movieThumbnails');
    const dateEl = document.getElementById('movieDate');
    const titleEl = document.getElementById('movieTitle');
    const downloadBtn = document.getElementById('movieDownloadBtn');
    const viewBtn = document.getElementById('movieViewBtn');

    if (!slide || !thumbs || !images || images.length === 0) {
        if (slide) slide.style.backgroundImage = '';
        if (thumbs) thumbs.innerHTML = '<div style="padding: 10px; color: #666;">暂无历史壁纸</div>';
        return;
    }

    movieData = images.slice(0, 12);
    movieIndex = 0;

    thumbs.innerHTML = movieData.map((img, index) => {
        let url = img.url;
        if (url && !url.startsWith('http')) url = BING_BASE + url;
        return `<div class="thumb-item ${index === 0 ? 'active' : ''}" 
                    style="background-image: url('${url}');" 
                    data-index="${index}"></div>`;
    }).join('');

    updateMovieSlide(movieData[0]);

    thumbs.querySelectorAll('.thumb-item').forEach(el => {
        el.addEventListener('click', function() {
            const idx = parseInt(this.dataset.index);
            if (idx === movieIndex) return;
            movieIndex = idx;
            updateMovieSlide(movieData[idx]);
            updateMovieThumbs();
            resetMovieTimer();
        });
    });

    const prevBtn = document.getElementById('moviePrev');
    const nextBtn = document.getElementById('movieNext');
    if (prevBtn) prevBtn.onclick = () => { changeMovie(-1); };
    if (nextBtn) nextBtn.onclick = () => { changeMovie(1); };

    startMovieTimer();
}

function updateMovieSlide(data) {
    const slide = document.getElementById('movieSlide');
    const dateEl = document.getElementById('movieDate');
    const titleEl = document.getElementById('movieTitle');
    const downloadBtn = document.getElementById('movieDownloadBtn');
    const viewBtn = document.getElementById('movieViewBtn');

    if (!slide || !data) return;

    let url = data.url;
    if (url && !url.startsWith('http')) url = BING_BASE + url;

    slide.style.backgroundImage = `url('${url}')`;

    const dateStr = data.enddate || '';
    if (dateEl) dateEl.textContent = `📅 ${formatDisplayDate(dateStr)}`;
    if (titleEl) titleEl.textContent = data.copyright || 'Bing 壁纸';

    if (downloadBtn) {
        let hdUrl = url;
        hdUrl = hdUrl.replace(/_1920x1080\.jpg/g, '_UHD.jpg');
        hdUrl = hdUrl.replace(/1920x1080/g, 'UHD');
        hdUrl = hdUrl.replace(/&rf=LaDigue_1920x1080\.jpg/g, '');
        if (!hdUrl.includes('uhd=1')) {
            hdUrl = hdUrl.includes('?') ? hdUrl + '&uhd=1&uhdwidth=3840&uhdheight=2160' : hdUrl + '?uhd=1&uhdwidth=3840&uhdheight=2160';
        }
        downloadBtn.href = hdUrl;
    }
    if (viewBtn) viewBtn.href = url;
}

function updateMovieThumbs() {
    document.querySelectorAll('.thumb-item').forEach((el, i) => {
        el.classList.toggle('active', i === movieIndex);
    });
}

function changeMovie(direction) {
    const total = movieData.length;
    if (total === 0) return;
    movieIndex = (movieIndex + direction + total) % total;
    updateMovieSlide(movieData[movieIndex]);
    updateMovieThumbs();
    resetMovieTimer();
}

function startMovieTimer() {
    stopMovieTimer();
    movieInterval = setInterval(() => {
        changeMovie(1);
    }, 5000);
}

function stopMovieTimer() {
    if (movieInterval) {
        clearInterval(movieInterval);
        movieInterval = null;
    }
}

function resetMovieTimer() {
    stopMovieTimer();
    startMovieTimer();
}

// ============ 错误提示 ============

function showError(containerId, message) {
    const container = document.getElementById(containerId);
    if (container) {
        container.innerHTML = `<div class="error">❌ ${message}</div>`;
    }
}

// ============ 主函数 ============

async function main() {
    const todayContainer = document.getElementById('todayCard');
    const slide = document.getElementById('movieSlide');

    if (todayContainer) todayContainer.innerHTML = '<div class="loading">加载今日壁纸中...</div>';
    if (slide) slide.style.backgroundImage = '';

    updateClock();
    setInterval(updateClock, 30000);

    try {
        const images = await fetchWallpapers();

        if (!images || images.length === 0) {
            showError('todayCard', '未能获取壁纸数据，请稍后重试');
            if (slide) slide.style.backgroundImage = '';
            return;
        }

        renderToday(images);
        const todayDate = images[0]?.enddate || '';

        const historyData = await fetchHistoryFromJSON();

        if (historyData && historyData.length > 1) {
            const historyImages = historyData.filter(item => item.enddate !== todayDate);
            renderMovieCarousel(historyImages);
            console.log(`🎬 电影轮播显示 ${Math.min(historyImages.length, 15)} 张`);
        } else {
            const fallbackHistory = images.slice(1);
            renderMovieCarousel(fallbackHistory);
            console.log(`🎬 降级方案：电影轮播显示 ${Math.min(fallbackHistory.length, 15)} 张`);
        }

    } catch (error) {
        console.error('主流程错误:', error);
        showError('todayCard', `加载失败：${error.message || '未知错误'}`);
        if (slide) slide.style.backgroundImage = '';
    }
}

// ============ 页面加载 ============
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
} else {
    main();
}
