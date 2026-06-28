/**
 * Bing 每日壁纸 - 纯前端项目
 * 使用多个 CORS 代理，带自动重试 + 浏览器缓存
 * 精简版：只保留必要字段，去掉版权符号
 * 历史壁纸从 history.json 读取，不限数量
 * 新增：历史壁纸轮播
 */

// ============ 配置 ============
const BING_BASE = 'https://cn.bing.com';
const API_TIMEOUT = 5000;
const MAX_RETRIES = 1;
const HISTORY_LIMIT = 10; // 历史壁纸显示数量
const CAROUSEL_COUNT = 20; // 轮播显示数量
const SLIDES_PER_VIEW = 5; // 轮播每次显示数量

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

// ============ 渲染历史壁纸网格 ============

function renderHistoryFromData(history) {
    const container = document.getElementById('historyGrid');
    if (!history || history.length === 0) {
        container.innerHTML = '<div class="loading">暂无历史壁纸</div>';
        return;
    }

    const limited = history.slice(0, HISTORY_LIMIT);

    container.innerHTML = limited.map(img => {
        let url = img.url;
        if (url && !url.startsWith('http')) {
            url = BING_BASE + url;
        }
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

// ============ 历史壁纸轮播 ============

let carouselData = [];
let currentIndex = 0;
let autoPlayTimer = null;

function renderCarousel(images) {
    const track = document.getElementById('carouselTrack');
    const dots = document.getElementById('carouselDots');
    const prevBtn = document.getElementById('carouselPrev');
    const nextBtn = document.getElementById('carouselNext');
    
    if (!track) return;
    
    if (!images || images.length === 0) {
        track.innerHTML = '<div style="padding: 20px; text-align: center; color: #666; width:100%;">暂无历史壁纸</div>';
        if (dots) dots.innerHTML = '';
        return;
    }
    
    // 截取前 CAROUSEL_COUNT 张
    const slideImages = images.slice(0, CAROUSEL_COUNT);
    carouselData = slideImages;
    currentIndex = 0;
    
    // 生成幻灯片
    track.innerHTML = slideImages.map((img, index) => {
        let url = img.url;
        if (url && !url.startsWith('http')) {
            url = BING_BASE + url;
        }
        const dateStr = img.enddate || '';
        const displayDate = formatDisplayDate(dateStr);
        const copyright = img.copyright || 'Bing 壁纸';
        
        return `
            <div class="carousel-slide" data-index="${index}" onclick="window.open('${url}', '_blank')">
                <img src="${url}" alt="${copyright}" loading="lazy" onerror="this.style.display='none'" />
                <div class="slide-info">
                    <div class="slide-date">📅 ${displayDate}</div>
                    <div class="slide-title">${copyright}</div>
                </div>
            </div>
        `;
    }).join('');
    
    // 计算总页数
    const totalDots = Math.ceil(slideImages.length / SLIDES_PER_VIEW);
    
    // 生成指示点
    if (dots) {
        dots.innerHTML = Array.from({ length: totalDots }, (_, i) => 
            `<button class="dot ${i === 0 ? 'active' : ''}" data-index="${i}"></button>`
        ).join('');
    }
    
    // 更新按钮状态
    updateCarouselButtons();
    
    // 绑定事件
    if (prevBtn) {
        prevBtn.onclick = () => moveCarousel(-1);
        prevBtn.classList.remove('disabled');
    }
    if (nextBtn) {
        nextBtn.onclick = () => moveCarousel(1);
        nextBtn.classList.remove('disabled');
    }
    if (dots) {
        dots.querySelectorAll('.dot').forEach(dot => {
            dot.onclick = () => goToCarousel(parseInt(dot.dataset.index));
        });
    }
    
    // 启动自动播放
    startAutoPlay();
}

function updateCarouselButtons() {
    const prevBtn = document.getElementById('carouselPrev');
    const nextBtn = document.getElementById('carouselNext');
    const total = Math.ceil(carouselData.length / SLIDES_PER_VIEW);
    
    if (prevBtn) {
        prevBtn.classList.toggle('disabled', currentIndex === 0);
    }
    if (nextBtn) {
        nextBtn.classList.toggle('disabled', currentIndex >= total - 1 || total === 0);
    }
    
    // 更新指示点
    const dots = document.querySelectorAll('.carousel-dots .dot');
    dots.forEach((dot, i) => {
        dot.classList.toggle('active', i === currentIndex);
    });
}

function moveCarousel(direction) {
    const total = Math.ceil(carouselData.length / SLIDES_PER_VIEW);
    if (total === 0) return;
    const newIndex = Math.max(0, Math.min(total - 1, currentIndex + direction));
    if (newIndex === currentIndex) return;
    currentIndex = newIndex;
    updateCarouselPosition();
    updateCarouselButtons();
    resetAutoPlay();
}

function goToCarousel(index) {
    const total = Math.ceil(carouselData.length / SLIDES_PER_VIEW);
    if (index < 0 || index >= total) return;
    currentIndex = index;
    updateCarouselPosition();
    updateCarouselButtons();
    resetAutoPlay();
}

function updateCarouselPosition() {
    const track = document.getElementById('carouselTrack');
    if (!track) return;
    const firstSlide = track.querySelector('.carousel-slide');
    if (!firstSlide) return;
    const slideWidth = firstSlide.offsetWidth || 0;
    const gap = 12;
    const offset = currentIndex * (slideWidth + gap) * SLIDES_PER_VIEW;
    track.style.transform = `translateX(-${offset}px)`;
}

function startAutoPlay() {
    stopAutoPlay();
    autoPlayTimer = setInterval(() => {
        const total = Math.ceil(carouselData.length / SLIDES_PER_VIEW);
        if (total === 0) return;
        if (currentIndex >= total - 1) {
            currentIndex = 0;
        } else {
            currentIndex++;
        }
        updateCarouselPosition();
        updateCarouselButtons();
    }, 4000);
}

function stopAutoPlay() {
    if (autoPlayTimer) {
        clearInterval(autoPlayTimer);
        autoPlayTimer = null;
    }
}

function resetAutoPlay() {
    stopAutoPlay();
    startAutoPlay();
}

// 窗口尺寸变化时重新计算位置
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        updateCarouselPosition();
    }, 200);
});

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
    const historyContainer = document.getElementById('historyGrid');
    const carouselTrack = document.getElementById('carouselTrack');

    if (todayContainer) todayContainer.innerHTML = '<div class="loading">加载今日壁纸中...</div>';
    if (historyContainer) historyContainer.innerHTML = '<div class="loading">加载历史壁纸中...</div>';
    if (carouselTrack) carouselTrack.innerHTML = '<div class="loading">加载历史壁纸中...</div>';

    updateClock();
    setInterval(updateClock, 30000);

    try {
        const images = await fetchWallpapers();

        if (!images || images.length === 0) {
            showError('todayCard', '未能获取壁纸数据，请稍后重试');
            if (historyContainer) historyContainer.innerHTML = '';
            if (carouselTrack) carouselTrack.innerHTML = '';
            return;
        }

        renderToday(images);
        const todayDate = images[0]?.enddate || '';

        const historyData = await fetchHistoryFromJSON();

        if (historyData && historyData.length > 1) {
            const historyImages = historyData.filter(item => item.enddate !== todayDate);
            renderCarousel(historyImages);
            renderHistoryFromData(historyImages);
            console.log(`📚 轮播显示 ${Math.min(historyImages.length, CAROUSEL_COUNT)} 张，网格显示 ${historyImages.length} 张`);
        } else {
            const fallbackHistory = images.slice(1);
            renderCarousel(fallbackHistory);
            renderHistoryFromData(fallbackHistory);
            console.log(`📚 降级方案：轮播显示 ${Math.min(fallbackHistory.length, CAROUSEL_COUNT)} 张`);
        }

    } catch (error) {
        console.error('主流程错误:', error);
        showError('todayCard', `加载失败：${error.message || '未知错误'}`);
        if (historyContainer) historyContainer.innerHTML = '';
        if (carouselTrack) carouselTrack.innerHTML = '';
    }
}

// ============ 页面加载 ============
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
} else {
    main();
}
