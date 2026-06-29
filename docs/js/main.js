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

function formatDisplayDate(dateStr) {
    if (!dateStr) return '未知日期';
    return dateStr;
}

// 获取"今日"日期字符串 (YYYY-MM-DD)
function getTodayStr() {
    const now = getBeijingTime();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// 构建"光影回顾"详情链接
function buildDetailUrl(item) {
    let topic = item.title || item.subtitle || '壁纸';
    if (topic.includes('，')) topic = topic.split('，')[0].trim();
    if (topic.includes(',')) topic = topic.split(',')[0].trim();
    topic = topic.replace(/\s*\(©[^)]*\)\s*$/, '');

    // ✅ 日期减1天
    let dateParam = item.date || '';
    if (dateParam) {
        // 将 YYYY-MM-DD 转换为 Date 对象
        const parts = dateParam.split('-');
        const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        // 减1天
        date.setDate(date.getDate() - 1);
        // 格式化为 YYYYMMDD
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

    const url = todayItem.bing_url || '';
    const title = todayItem.title || 'Bing 每日壁纸';
    const subtitle = todayItem.subtitle || '';
    const description = todayItem.description || '';
    const dateStr = todayItem.date || '';

    // 判断 subtitle 是否显示（不为空且不等于 title）
    const showSubtitle = subtitle && subtitle !== title;

    // 4K 链接：直接使用原始链接（已经是 UHD）
    let hd4kUrl = url;
    // 1080P 链接：替换为 1920x1080
    let hd1080Url = url.replace(/_UHD\.jpg/g, '_1920x1080.jpg');

    const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 4px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;

    // 处理描述文字：将 \n 转换为 <br>，并添加首行缩进
    let descHtml = description || '';
    if (descHtml) {
        // 将换行符转换为 <br>，并包裹在 p 标签中实现每段缩进
        const paragraphs = descHtml.split('\n').filter(p => p.trim());
        descHtml = paragraphs.map(p => `<p>${p.trim()}</p>`).join('');
    }

    container.innerHTML = `
        <img src="${url}" alt="${title}" loading="eager" />
        <div class="info">
            <div class="title-line">${title}</div>
            ${showSubtitle ? `<div class="subtitle-line">${subtitle}</div>` : ''}
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
}

// ============ 模态框 ==========

function openModal(item) {
    const overlay = document.getElementById('modalOverlay');
    if (!overlay) {
        createModal();
        setTimeout(() => openModal(item), 50);
        return;
    }
    document.getElementById('modalImg').src = item.bing_url || '';
    document.getElementById('modalTitle').textContent = item.title || '壁纸';

    const subtitle = item.subtitle || '';
    const subtitleEl = document.getElementById('modalSubtitle');
    if (subtitle && subtitle !== item.title) {
        subtitleEl.textContent = subtitle;
        subtitleEl.style.display = 'block';
    } else {
        subtitleEl.style.display = 'none';
    }

    // ✅ 处理描述文字：去除多余空行
    let desc = item.description || '暂无详细介绍';

    // 统一换行符
    desc = desc.replace(/\r\n/g, '\n');
    desc = desc.replace(/\r/g, '\n');
    desc = desc.replace(/<br\s*\/?>/gi, '\n');

    // ✅ 分割段落，过滤空段落，去除首尾空格
    const paragraphs = desc.split('\n')
        .map(p => p.trim())
        .filter(p => p !== '');

    // ✅ 如果只有一个段落但包含多个句子，用句号分割
    if (paragraphs.length === 1 && desc.length > 50) {
        const sentences = desc.split(/[。？！；]\s*/)
            .map(s => s.trim())
            .filter(s => s !== '');
        
        if (sentences.length > 1) {
            const grouped = [];
            for (let i = 0; i < sentences.length; i += 2) {
                let group = sentences.slice(i, i + 2).join('。');
                if (group) {
                    if (!group.endsWith('。') && !group.endsWith('？') && !group.endsWith('！')) {
                        group = group + '。';
                    }
                    grouped.push(group);
                }
            }
            // ✅ 用 <p> 包裹，段落之间没有空行
            const descHtml = grouped.map(p => `<p>${p}</p>`).join('');
            document.getElementById('modalDesc').innerHTML = descHtml;
            overlay.classList.add('open');
            document.body.style.overflow = 'hidden';
            return;
        }
    }

    // ✅ 正常情况：每个段落用 <p> 包裹，没有空行
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
        return `<div class="thumb-item ${index === 0 ? 'active' : ''}" 
                    style="background-image: url('${img.bing_url}');" 
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

    slide.style.backgroundImage = `url('${data.bing_url}')`;

    if (dateEl) dateEl.textContent = `📅 ${data.date || ''}`;
    
    let displayTitle = data.title || 'Bing 壁纸';
    if (data.subtitle && data.subtitle !== data.title) {
        displayTitle = `${data.subtitle} | ${data.title}`;
    }
    if (titleEl) titleEl.textContent = displayTitle;

    if (downloadBtn) {
        let hdUrl = data.bing_url || '';
        hdUrl = hdUrl.replace(/_UHD\.jpg/g, '_1920x1080.jpg');
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

    // 更新时钟
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
