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
    let todayItem = images.find(item => item.date === todayStr);
    if (!todayItem) {
        todayItem = images[0];
    }

    // ✅ 清理 URL 中的双斜杠
    let url = todayItem.bing_url || '';
    url = url.replace(/(https?:\/\/)[^\/]+(\/\/+)/g, '$1$2');

    // ✅ 修正数据：title 是副标题，subtitle 是主标题
    const rawTitle = todayItem.title || 'Bing 每日壁纸';
    const rawSubtitle = todayItem.subtitle || '';
    const description = todayItem.description || '';
    const dateStr = todayItem.date || '';

    // ✅ 正确的标题：subtitle 是主标题（位置/主题），title 是副标题（描述）
    const mainTitle = rawSubtitle || rawTitle;
    const subTitle = (rawSubtitle && rawTitle !== rawSubtitle) ? rawTitle : '';

    // ✅ 构建展示名称：主标题 | 副标题 - 日期
    let displayTitle = mainTitle;
    if (subTitle) {
        displayTitle = `${mainTitle} | ${subTitle}`;
    }
    if (dateStr) {
        displayTitle = `${displayTitle} - ${dateStr}`;
    }

    // ✅ 4K 链接：直接使用原始链接（已经是 UHD）
    let hd4kUrl = url;
    // ✅ 1080P 链接：替换为 1920x1080（用于页面显示）
    let hd1080Url = url.replace(/_UHD\.jpg/g, '_1920x1080.jpg');
    // ✅ 如果替换后没有变化，尝试其他格式
    if (hd1080Url === url) {
        hd1080Url = url.replace(/&w=3840&h=2160&rs=1&c=4/g, '');
    }

    const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 4px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;

    // 处理描述文字
    let descHtml = description || '';
    if (descHtml) {
        const paragraphs = descHtml.split('\n').filter(p => p.trim());
        descHtml = paragraphs.map(p => `<p>${p.trim()}</p>`).join('');
    }

    // ✅ 页面默认使用 1080P 图片（加载更快）
    const displayUrl = hd1080Url || url;

    container.innerHTML = `
        <img src="${displayUrl}" alt="${mainTitle}" loading="eager" />
        <div class="info">
            <div class="title-line">${displayTitle}</div>
            ${subTitle ? `<div class="subtitle-line">${subTitle}</div>` : ''}
            ${descHtml ? `<div class="desc-line pre-wrap">${descHtml}</div>` : ''}
            <div class="actions">
                <div class="btn-group">
                    <a href="${hd4kUrl}" class="btn btn-primary" target="_blank">${svgIcon} 4K</a>
                    <a href="${hd1080Url}" class="btn btn-secondary" target="_blank">${svgIcon} 1080P</a>
                    <a href="${buildDetailUrl(todayItem)}" class="btn btn-secondary" target="_blank">📖 光影回顾</a>
                </div>
                <a href="/archive.html" class="btn btn-secondary">📚 壁纸归档</a>
            </div>
        </div>
    `;

    container.onclick = function(e) {
        if (e.target.closest('a')) return;
        openModal(todayItem);
    };
}

// ============ 模态框 ==========

function openModal(item) {
    const overlay = document.getElementById('modalOverlay');
    if (!overlay) {
        createModal();
        setTimeout(() => openModal(item), 50);
        return;
    }

    // ✅ 修正数据：title 是副标题，subtitle 是主标题
    const rawTitle = item.title || '壁纸';
    const rawSubtitle = item.subtitle || '';
    const dateStr = item.date || '';
    const mainTitle = rawSubtitle || rawTitle;
    const subTitle = (rawSubtitle && rawTitle !== rawSubtitle) ? rawTitle : '';

    // ✅ 构建模态框标题
    let modalTitle = mainTitle;
    if (subTitle) {
        modalTitle = `${mainTitle} | ${subTitle}`;
    }
    if (dateStr) {
        modalTitle = `${modalTitle} - ${dateStr}`;
    }
    document.getElementById('modalTitle').textContent = modalTitle;

    document.getElementById('modalImg').src = item.bing_url || '';

    const subtitleEl = document.getElementById('modalSubtitle');
    if (subTitle) {
        subtitleEl.textContent = subTitle;
        subtitleEl.style.display = 'block';
    } else {
        subtitleEl.style.display = 'none';
    }

    // 处理描述文字
    let desc = item.description || '暂无详细介绍';
    desc = desc.replace(/\r\n/g, '\n');
    desc = desc.replace(/\r/g, '\n');
    desc = desc.replace(/<br\s*\/?>/gi, '\n');

    const paragraphs = desc.split('\n')
        .map(p => p.trim())
        .filter(p => p !== '');

    const descHtml = paragraphs.map(p => `<p>${p}</p>`).join('');
    document.getElementById('modalDesc').innerHTML = descHtml;

    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    const overlay = document.getElementById('modalOverlay');
    if (overlay) {
        overlay.classList.remove('open');
        document.body.style.overflow = '';
    }
}

function createModal() {
    const modalHTML = `
        <div class="modal-overlay" id="modalOverlay">
            <div class="modal-box">
                <button class="modal-close" id="modalClose">&times;</button>
                <div class="modal-image">
                    <img id="modalImg" src="" alt="壁纸大图" />
                </div>
                <div class="modal-content">
                    <div class="modal-title" id="modalTitle"></div>
                    <div class="modal-subtitle" id="modalSubtitle"></div>
                    <div class="modal-desc" id="modalDesc"></div>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    document.getElementById('modalClose').addEventListener('click', closeModal);
    document.getElementById('modalOverlay').addEventListener('click', function(e) {
        if (e.target === this) closeModal();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });
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

    movieData = images.slice(0, 15);
    movieIndex = 0;

    thumbs.innerHTML = movieData.map((img, index) => {
        // ✅ 使用 1080P 图片作为缩略图
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

    slide.onclick = function(e) {
        if (e.target.closest('.movie-actions')) return;
        if (movieData[movieIndex]) {
            openModal(movieData[movieIndex]);
        }
    };

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

    // ✅ 使用 1080P 图片作为轮播背景（加载更快）
    let displayUrl = data.bing_url || '';
    displayUrl = displayUrl.replace(/_UHD\.jpg/g, '_1920x1080.jpg');
    slide.style.backgroundImage = `url('${displayUrl}')`;

    // ✅ 修正标题显示
    const rawTitle = data.title || 'Bing 壁纸';
    const rawSubtitle = data.subtitle || '';
    const dateStr = data.date || '';
    const mainTitle = rawSubtitle || rawTitle;
    const subTitle = (rawSubtitle && rawTitle !== rawSubtitle) ? rawTitle : '';

    if (dateEl) dateEl.textContent = `📅 ${dateStr || ''}`;

    let displayTitle = mainTitle;
    if (subTitle) {
        displayTitle = `${mainTitle} | ${subTitle}`;
    }
    if (titleEl) titleEl.textContent = displayTitle;

    // ✅ 下载按钮使用 4K 链接
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

    function updateClock() {
        const el = document.getElementById('currentTime');
        if (!el) return;
        const now = getBeijingTime();
        el.textContent = `🕐 ${now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })} (北京时间)`;
    }
    updateClock();
    setInterval(updateClock, 30000);

    createModal();

    try {
        const images = await loadAllData();

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
