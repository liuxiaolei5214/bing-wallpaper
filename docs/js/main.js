/**
 * Bing 每日壁纸 - 光影回顾版
 * 适配 zh.2026.json 格式
 */

// ============ 配置 ============
const BING_BASE = 'https://bing.com';

// ============ 工具函数 ============

function getBeijingTime() {
    const now = new Date();
    const beijingStr = now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    return new Date(beijingStr);
}

// 获取"今日"日期字符串 (YYYY-MM-DD)
function getTodayStr() {
    const now = getBeijingTime();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// 构建"光影回顾"详情链接（日期减1天）
function buildDetailUrl(item) {
    let topic = item.title || item.subtitle || '壁纸';
    if (topic.includes('，')) topic = topic.split('，')[0].trim();
    if (topic.includes(',')) topic = topic.split(',')[0].trim();
    topic = topic.replace(/\s*\(©[^)]*\)\s*$/, '');

    let dateParam = item.date || '';
    if (dateParam) {
        const parts = dateParam.split('-');
        const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        date.setDate(date.getDate() - 1);
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        dateParam = y + m + d + '_1600';
    }

    const encodedTopic = encodeURIComponent(topic);
    return `https://cn.bing.com/search?q=${encodedTopic}&form=BGALM&filters=HpDate%3a%22${dateParam}%22+mgzv3configlist%3a%22BingQA_Encyclopedia_Layout%22&pc=W011&bwa=1`;
}

// ============ 从 JSON 文件读取数据 ============

async function loadYearData(year) {
    try {
        const resp = await fetch(`zh.${year}.json`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        return Array.isArray(data) ? data : [];
    } catch (e) {
        console.warn(`加载 ${year} 数据失败:`, e);
        return [];
    }
}

async function loadAllData() {
    const currentYear = new Date().getFullYear();
    const years = [];
    for (let y = 2020; y <= currentYear; y++) {
        years.push(y);
    }

    const results = await Promise.allSettled(years.map(y => loadYearData(y)));

    let all = [];
    results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value.length) {
            const year = years[index];
            const items = result.value.map(item => ({ ...item, year }));
            all = all.concat(items);
        }
    });

    all.sort((a, b) => {
        const da = a.date || '';
        const db = b.date || '';
        return db.localeCompare(da);
    });

    return all;
}

// ============ 渲染今日壁纸 ============

function renderToday(images) {
    const container = document.getElementById('todayCard');
    if (!images || images.length === 0) {
        container.innerHTML = '<div class="error">❌ 暂无壁纸数据</div>';
        return;
    }

    const todayStr = getTodayStr();
    console.log(`📅 今日日期: ${todayStr}`);
    console.log(`📊 总数据量: ${images.length}`);

    // ===== 方式1：精确匹配今天 =====
    let todayItem = images.find(item => {
        const date = item.date ? item.date.trim() : '';
        return date === todayStr;
    });

    // ===== 方式2：如果没有今天的数据，取日期最大的（最新） =====
    if (!todayItem) {
        console.log(`⚠️ 未找到 ${todayStr} 的数据，取最新日期`);
        // 按日期降序排序，取第一条
        const sorted = [...images].sort((a, b) => {
            return (b.date || '').localeCompare(a.date || '');
        });
        todayItem = sorted[0];
        console.log(`✅ 最新数据日期: ${todayItem?.date}`);
    }

    if (!todayItem) {
        container.innerHTML = '<div class="error">❌ 暂无壁纸数据</div>';
        return;
    }

    console.log(`✅ 显示壁纸: ${todayItem.title} (${todayItem.date})`);

    let url = todayItem.bing_url || '';
    url = url.replace(/(https?:\/\/)[^\/]+(\/\/+)/g, '$1$2');

    const rawTitle = todayItem.title || 'Bing 每日壁纸';
    const rawSubtitle = todayItem.subtitle || '';
    const description = todayItem.description || '';

    let displayTitle = rawTitle;
    if (rawSubtitle) {
        displayTitle = `${rawSubtitle} | ${rawTitle}`;
    }

    let hd4kUrl = url;
    let hd1080Url = url.replace(/_UHD\.jpg/g, '_1920x1080.jpg');
    if (hd1080Url === url) {
        hd1080Url = url.replace(/&w=3840&h=2160&rs=1&c=4/g, '');
    }

    const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 4px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;

    let descHtml = description || '';
    if (descHtml) {
        const paragraphs = descHtml.split('\n').filter(p => p.trim());
        descHtml = paragraphs.map(p => `<p>${p.trim()}</p>`).join('');
    }

    const displayUrl = hd1080Url || url;

    container.innerHTML = `
        <img src="${displayUrl}" alt="${displayTitle}" loading="eager" />
        <div class="info">
            <div class="title-line">${displayTitle}</div>
            ${descHtml ? `<div class="desc-line pre-wrap">${descHtml}</div>` : ''}
            <div class="actions">
                <div class="btn-group">
                    <a href="${hd4kUrl}" class="btn btn-primary" target="_blank">${svgIcon} 4K</a>
                    <a href="${hd1080Url}" class="btn btn-secondary" target="_blank">${svgIcon} 1080P</a>
                    <a href="${buildDetailUrl(todayItem)}" class="btn btn-secondary" target="_blank">📖 光影回顾</a>
                    <a href="/archive.html" class="btn btn-secondary">📚 壁纸归档</a>
                </div>
            </div>
        </div>
    `;
}

// ============ 电影感壁纸轮播 ==========

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
    const detailBtn = document.getElementById('movieDetailBtn');

    if (!slide || !thumbs || !images || images.length === 0) {
        if (slide) slide.style.backgroundImage = '';
        if (thumbs) thumbs.innerHTML = '<div style="padding: 10px; color: #666;">暂无历史壁纸</div>';
        return;
    }

    // ===== 过滤掉今天的数据，只显示昨天及之前的壁纸 =====
    const todayStr = getTodayStr();
    const filteredImages = images.filter(item => {
        const date = item.date ? item.date.trim() : '';
        return date !== todayStr;
    });

    if (filteredImages.length === 0) {
        if (thumbs) thumbs.innerHTML = '<div style="padding: 10px; color: #666;">暂无历史壁纸</div>';
        return;
    }

    movieData = filteredImages.slice(0, 20);
    movieIndex = 0;

    thumbs.innerHTML = movieData.map((img, index) => {
        let thumbUrl = img.bing_url || '';
        thumbUrl = thumbUrl.replace(/_UHD\.jpg/g, '_1920x1080.jpg');
        return `<div class="thumb-item ${index === 0 ? 'active' : ''}" 
                    style="background-image: url('${thumbUrl}');" 
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
    const detailBtn = document.getElementById('movieDetailBtn');

    if (!slide || !data) return;

    let displayUrl = data.bing_url || '';
    displayUrl = displayUrl.replace(/_UHD\.jpg/g, '_1920x1080.jpg');
    slide.style.backgroundImage = `url('${displayUrl}')`;

    // 页面显示标题：subtitle | title（title 已包含日期）
    const rawTitle = data.title || 'Bing 壁纸';
    const rawSubtitle = data.subtitle || '';
    const dateStr = data.date || '';

    let displayTitle = rawTitle;
    if (rawSubtitle) {
        displayTitle = `${rawSubtitle} | ${rawTitle}`;
    }

    if (titleEl) titleEl.textContent = displayTitle;
    // 日期已包含在标题中，不再单独显示
    if (dateEl) dateEl.textContent = '';

    if (downloadBtn) {
        let hdUrl = data.bing_url || '';
        downloadBtn.href = hdUrl;
    }
    if (viewBtn) viewBtn.href = data.bing_url || '';
    if (detailBtn) {
        detailBtn.href = buildDetailUrl(data);
    }
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

// ============ 主函数 ============

async function main() {
    const todayContainer = document.getElementById('todayCard');
    const slide = document.getElementById('movieSlide');

    if (todayContainer) todayContainer.innerHTML = '<div class="loading">加载今日壁纸中...</div>';
    if (slide) slide.style.backgroundImage = '';

    try {
        const images = await loadAllData();

        console.log(`📊 loadAllData 返回 ${images.length} 条数据`);

        if (!images || images.length === 0) {
            todayContainer.innerHTML = '<div class="error">❌ 未能获取壁纸数据</div>';
            return;
        }

        renderToday(images);
        renderMovieCarousel(images.filter(item => item.date !== getTodayStr()));

    } catch (error) {
        console.error('主流程错误:', error);
        todayContainer.innerHTML = `<div class="error">❌ 加载失败：${error.message || '未知错误'}</div>`;
    }
}

document.addEventListener('DOMContentLoaded', main);
