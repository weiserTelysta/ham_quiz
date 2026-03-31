let questions = [];
let currentQuestionIndex = 0;
let score = 0;
let selectedOptions = new Set();
let currentBankName = ""; 
let autoTimer = null;
let countdownInterval = null;
let quizCount = 20; // 默认题目数量
let userAnswers = []; // null(未做), true(对), false(错)
let isNoRepeatMode = false; // 默认使用随机模式
let historyStore = JSON.parse(localStorage.getItem('ham_history_v3')) || {}; // 记录做过的题
let searchPool = [];
let userSelections = []; // ★ 新增：记录每道题用户具体选了哪些选项
let isExamMode = false;  // ★ 新增：是否处于考试模式
let examTimer = null;    // ★ 新增：考试倒计时定时器
let examTimeLeft = 0;    // ★ 新增：剩余秒数
let passScore = 0;       // ★ 新增：及格分数线
let wrongStore = JSON.parse(localStorage.getItem('ham_wrong_v3')) || {};

window.onload = async function() {
    renderWrongButtons();
    // 预加载全量题库用于搜索
    try {
        const res = await fetch('full_bank.json');
        searchPool = await res.json();
        initSearch();
    } catch (e) { console.error("搜索库加载失败"); }
};

// 搜索逻辑
function initSearch() {
    const input = document.getElementById('search-input');
    const resultsContainer = document.getElementById('search-results');

    input.oninput = function() {
        const val = this.value.trim().toLowerCase();
        if (val.length < 2) {
            resultsContainer.style.display = 'none';
            return;
        }

        const filtered = searchPool.filter(q => 
            q.id.toLowerCase().includes(val) || 
            q.jid.toLowerCase().includes(val) || 
            q.question.toLowerCase().includes(val)
        ).slice(0, 10); // 只显示前10条，防止卡顿

        if (filtered.length > 0) {
            resultsContainer.style.display = 'block';
            resultsContainer.innerHTML = filtered.map(q => `
                <div class="search-item" onclick="jumpToSingleQuestion('${q.id}')" 
                     style="padding:8px; border-bottom:1px solid #eee; cursor:pointer; font-size:13px;">
                    <div style="color:var(--primary-color); font-weight:bold;">${q.id} / ${q.jid}</div>
                    <div style="color:var(--text-main); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${q.question}</div>
                </div>
            `).join('');
        } else {
            resultsContainer.innerHTML = '<p style="font-size:12px; color:#999; text-align:center;">未找到相关题目</p>';
        }
    };
}

// 点击搜索结果，直接开始这道题的练习
function jumpToSingleQuestion(qid) {
    const target = searchPool.find(q => q.id === qid);
    if (target) {
        questions = [target]; // 变成只有一个题的特殊“题库”
        currentBankName = "full_bank.json"; 
        initQuiz();
        // 隐藏搜索框结果
        document.getElementById('search-results').style.display = 'none';
        document.getElementById('search-input').value = '';
    }
}

// 渲染错题按钮
function renderWrongButtons() {
    const container = document.getElementById('wrong-buttons-container');
    const clearBtn = document.getElementById('clear-wrong-btn'); // 獲取清空按鈕
    container.innerHTML = '';
    const stats = {};
    
    const nameMap = {
        'bank_a.json': 'A 类题库',
        'bank_b.json': 'B 类题库',
        'bank_c.json': 'C 类题库',
        'full_bank.json': '全类目综合练习'
    };

    Object.values(wrongStore).forEach(item => {
        const bank = item.bank || "未知题库";
        stats[bank] = (stats[bank] || 0) + 1;
    });

    // 如果沒有錯題
    if (Object.keys(stats).length === 0) {
        container.innerHTML = '<p style="font-size:13px; color:#999; text-align:center;">暂无错题记录，继续保持！</p>';
        if (clearBtn) clearBtn.style.display = 'none'; // 隱藏清空按鈕
        return;
    }

    // 如果有錯題
    if (clearBtn) clearBtn.style.display = 'block'; // 顯示清空按鈕

    for (const [bank, count] of Object.entries(stats)) {
        const btn = document.createElement('button');
        btn.className = "btn-secondary";
        const displayName = nameMap[bank] || bank.replace('.json', '').toUpperCase();
        btn.innerText = `${displayName} 错题特训 (${count})`;
        btn.onclick = () => startWrongQuiz(bank);
        container.appendChild(btn);
    }
}

// 新增：一鍵清空所有錯題邏輯
function clearAllWrong() {
    if (confirm("确定要清空所有错题记录吗？清空后无法恢复。")) {
        wrongStore = {}; // 清空記憶體中的資料
        localStorage.removeItem('ham_wrong_v3'); // 清除瀏覽器緩存中的資料
        renderWrongButtons(); // 重新渲染畫面
    }
}

// 切换题目数量
function setCount(num) {
    quizCount = num;
    document.querySelectorAll('.btn-count').forEach(btn => {
        const btnText = btn.innerText;
        if (num === 0) {
            btn.classList.toggle('active', btnText === '全部');
        } else {
            btn.classList.toggle('active', parseInt(btnText) === num);
        }
    });
}

// 切换抽题模式
function setMode(mode) {
    isNoRepeatMode = (mode === 'norepeat');
    document.querySelectorAll('.btn-mode').forEach(btn => {
        btn.classList.toggle('active', 
            (mode === 'norepeat' && btn.innerText.includes('不重复')) || 
            (mode === 'random' && btn.innerText.includes('随机'))
        );
    });
    
    // 更新提示文案和重置按钮
    const tip = document.getElementById('mode-tip');
    const clearBtn = document.getElementById('clear-history-btn');
    if(isNoRepeatMode) {
        tip.innerText = "优先抽取你未做过的题目";
        clearBtn.style.display = "block";
    } else {
        tip.innerText = "随机抽取，题目可能重复";
        clearBtn.style.display = "none";
    }
}

// 清空刷题进度
function clearHistory() {
    if (confirm("确定要清空所有题库的『已做记录』吗？清空后，不重复模式将从头开始。")) {
        historyStore = {};
        localStorage.setItem('ham_history_v3', JSON.stringify(historyStore));
        alert("刷题进度已重置！");
        location.reload(); // 刷新页面让状态彻底干净
    }
}

// 开始普通练习
async function startQuiz(filename) {
    currentBankName = filename;
    try {
        const response = await fetch(filename);
        const data = await response.json();
        
        let pool = data;

        // 如果开启了“不重复模式”，则过滤掉已经做过的题
        if (isNoRepeatMode) {
            const doneIds = historyStore[filename] || [];
            let unseen = data.filter(q => !doneIds.includes(q.id));
            
            // 题库刷完了的极端情况处理
            if (unseen.length === 0 && data.length > 0) {
                alert("🎉 恭喜你！你已经刷完了本题库的所有题目。系统已自动为你重置该题库的进度，开启新一轮练习！");
                historyStore[filename] = []; // 重置该题库的记录
                localStorage.setItem('ham_history_v3', JSON.stringify(historyStore));
                unseen = data; // 重新使用全量题库
            }
            pool = unseen;
        }

        let shuffled = pool.sort(() => Math.random() - 0.5);
        if (quizCount > 0 && shuffled.length > quizCount) {
            questions = shuffled.slice(0, quizCount);
        } else {
            questions = shuffled;
        }
        initQuiz();
    } catch (e) { 
        console.error(e);
        alert("题库加载失败，请检查网络或文件是否存在。"); 
    }
}

// 开始错题特训
function startWrongQuiz(bankName) {
    currentBankName = bankName;
    let allWrong = Object.values(wrongStore)
        .filter(item => item.bank === bankName)
        .map(item => item.data);

    let shuffled = allWrong.sort(() => Math.random() - 0.5);
    if (quizCount > 0 && shuffled.length > quizCount) {
        questions = shuffled.slice(0, quizCount);
    } else {
        questions = shuffled;
    }
    initQuiz();
}

// 初始化答题环境
function initQuiz() {
    currentQuestionIndex = 0;
    score = 0;
    userAnswers = new Array(questions.length).fill(null);
    userSelections = new Array(questions.length).fill(null); // ★ 新增初始化

    showScreen('quiz-screen');
    
    document.getElementById('left-panel').classList.add('panel-hidden');
    document.getElementById('search-section').style.display = 'none';
    document.getElementById('progress-section').style.display = 'block';
    document.getElementById('right-panel').classList.remove('panel-hidden');
    
    initGrid();
    loadQuestion();
}

// 初始化右侧进度网格
function initGrid() {
    const container = document.getElementById('progress-grid');
    container.innerHTML = '';
    questions.forEach((_, index) => {
        const item = document.createElement('div');
        item.className = 'grid-item';
        item.id = `grid-item-${index}`;
        item.innerText = index + 1;
        item.onclick = () => jumpToQuestion(index);
        container.appendChild(item);
    });
}

// 更新网格状态
function updateGridVisuals() {
    questions.forEach((_, index) => {
        const item = document.getElementById(`grid-item-${index}`);
        if (!item) return;
        
        item.classList.remove('current', 'correct', 'wrong');
        
        if (index === currentQuestionIndex) item.classList.add('current');
        if (userAnswers[index] === true) item.classList.add('correct');
        if (userAnswers[index] === false) item.classList.add('wrong');
    });
}

// 加载题目
function loadQuestion() {
    resetTimers();
    selectedOptions.clear();
    const q = questions[currentQuestionIndex];
    const isMultiple = q.type === 'multiple';

    const wrongInfo = wrongStore[q.id];
    const streakHtml = (wrongInfo && wrongInfo.count > 0) ? `<span class="wrong-tag">连对 ${wrongInfo.count} 次</span>` : '';

    // --- 核心修复：图片处理逻辑 ---
    let imageHtml = '';
    // 只有当 q.image 存在且不为空时，才生成图片 HTML
    if (q.image) {
        // 兼容性处理：如果后端数据没带后缀，前端自动补全
        let imgSrc = q.image;
        if (!imgSrc.includes('.')) {
            imgSrc += '.webp'; 
        }

        imageHtml = `
            <div class="question-image-container" style="margin: 15px 0; text-align: center;">
                <img src="images/${imgSrc}" alt="题目附图" 
                     style="max-width: 100%; max-height: 300px; border-radius: 8px; cursor: zoom-in; border: 1px solid #eee;" 
                     onclick="window.open(this.src)"
                     onerror="this.parentElement.style.display='none'"> 
            </div>
        `;
    }

    // 将 ID、文字、图片统一渲染
    document.getElementById('question-text').innerHTML = `
        <span class="question-id">ID: ${q.id} ${streakHtml}</span>
        <div style="margin-bottom: 10px;">${q.question}</div>
        ${imageHtml} 
    `;

    document.getElementById('progress').innerText = `${currentQuestionIndex + 1} / ${questions.length}`;
    document.getElementById('score-display').innerText = `得分: ${score}`;
    
    document.getElementById('prev-btn').classList.toggle('hidden', currentQuestionIndex === 0);
    document.getElementById('submit-btn').classList.remove('hidden');
    document.getElementById('submit-btn').disabled = true;
    document.getElementById('next-btn').classList.add('hidden');
    document.getElementById('next-btn').innerText = "下一题"; 
    document.getElementById('feedback-area').classList.add('hidden');

    const typeBadge = document.getElementById('question-type');
    typeBadge.innerText = isMultiple ? "多选题" : "单选题";
    typeBadge.className = `badge ${isMultiple ? 'multiple' : 'single'}`;

    const container = document.getElementById('options-container');
    container.innerHTML = '';
    container.className = `options-grid ${isMultiple ? 'mode-multiple' : 'mode-single'}`;

    for (const [key, value] of Object.entries(q.options)) {
        const div = document.createElement('div');
        div.className = 'option-item';
        div.innerHTML = `<div class="indicator"></div><span class="option-label">${key}.</span><span>${value}</span>`;
        div.onclick = () => handleOptionClick(div, key, isMultiple);
        container.appendChild(div);
    }
    
    updateGridVisuals();

    if (userAnswers[currentQuestionIndex] !== null) {
        const savedSelections = userSelections[currentQuestionIndex] || [];
        const isCorrect = userAnswers[currentQuestionIndex];
        
        // 恢复选项的视觉状态
        document.querySelectorAll('.option-item').forEach(el => {
            const key = el.querySelector('span:nth-child(2)').innerText.replace('.', '').trim();
            if (q.answer.includes(key)) el.classList.add('correct');
            else if (savedSelections.includes(key)) el.classList.add('wrong');
            
            if (savedSelections.includes(key)) el.classList.add('selected');
        });

        // 按钮状态：隐藏确认按钮，显示下一题/查看结果
        document.getElementById('submit-btn').classList.add('hidden');
        document.getElementById('next-btn').classList.remove('hidden');
        document.getElementById('next-btn').innerText = currentQuestionIndex === questions.length - 1 ? "查看结果" : "下一题";
        
        // 显示反馈区域，但不触发 3 秒倒计时
        const fb = document.getElementById('feedback-area');
        fb.classList.remove('hidden');
        fb.className = `feedback ${isCorrect ? 'success' : 'error'}`;
        fb.innerHTML = isCorrect ? "✅ 回答正确！" : `❌ 错误。正确答案: ${q.answer.join('')}`;
        
        // 清除任何可能的自动下一题提示
        document.getElementById('auto-next-tip').innerText = "";
    }
}

// 点击选项逻辑
function handleOptionClick(el, key, isMultiple) {
    if (userAnswers[currentQuestionIndex] !== null) return;
    if (!document.getElementById('next-btn').classList.contains('hidden')) return;
    if (isMultiple) {
        selectedOptions.has(key) ? selectedOptions.delete(key) : selectedOptions.add(key);
        el.classList.toggle('selected');
    } else {
        selectedOptions.clear();
        selectedOptions.add(key);
        document.querySelectorAll('.option-item').forEach(i => i.classList.remove('selected'));
        el.classList.add('selected');
    }
    document.getElementById('submit-btn').disabled = selectedOptions.size === 0;
}

// 提交答案
function submitAnswer() {
    const q = questions[currentQuestionIndex];
    const isCorrect = selectedOptions.size === q.answer.length && [...selectedOptions].every(v => q.answer.includes(v));

    userAnswers[currentQuestionIndex] = isCorrect; 
    userSelections[currentQuestionIndex] = [...selectedOptions];
    
    document.querySelectorAll('.option-item').forEach(el => {
        const key = el.querySelector('span:nth-child(2)').innerText.replace('.', '').trim();
        if (q.answer.includes(key)) el.classList.add('correct');
        else if (selectedOptions.has(key)) el.classList.add('wrong');
    });

    if (isCorrect) {
        score++;
        if (wrongStore[q.id]) {
            wrongStore[q.id].count++;
            if (wrongStore[q.id].count >= 3) delete wrongStore[q.id];
        }
    } else {
        wrongStore[q.id] = { data: q, count: 0, bank: currentBankName };
    }
    
    localStorage.setItem('ham_wrong_v3', JSON.stringify(wrongStore));
    if (!historyStore[currentBankName]) historyStore[currentBankName] = [];
    if (!historyStore[currentBankName].includes(q.id)) {
        historyStore[currentBankName].push(q.id);
        localStorage.setItem('ham_history_v3', JSON.stringify(historyStore));
    }

    localStorage.setItem('ham_wrong_v3', JSON.stringify(wrongStore));
    updateGridVisuals(); 
    renderWrongButtons();

    const fb = document.getElementById('feedback-area');
    fb.classList.remove('hidden');
    fb.className = `feedback ${isCorrect ? 'success' : 'error'}`;
    fb.innerHTML = isCorrect ? "✅ 回答正确！" : `❌ 错误。正确答案: ${q.answer.join('')}`;

    document.getElementById('submit-btn').classList.add('hidden');
    document.getElementById('next-btn').classList.remove('hidden');

    if (currentQuestionIndex < questions.length - 1) {
        if (isCorrect) {
            // 回答正确：0.5秒后直接下一题，不显示倒计时文字
            autoTimer = setTimeout(() => nextQuestion(), 500);
        } else {
            // 回答错误：调用自动跳转逻辑，给 3 秒时间看正确答案
            startAutoNext(3); 
        }
    } else {
        document.getElementById('next-btn').innerText = "查看结果";
    }
}

// 自动下一题
function startAutoNext(seconds) {
    let timeLeft = seconds;
    const tipEl = document.getElementById('auto-next-tip');
    
    // 显示提示
    tipEl.innerText = `${timeLeft} 秒后自动下一题...`;
    
    // 倒计时数字变动
    countdownInterval = setInterval(() => {
        timeLeft--;
        if (timeLeft > 0) {
            tipEl.innerText = `${timeLeft} 秒后自动下一题...`;
        } else {
            tipEl.innerText = "";
            clearInterval(countdownInterval);
        }
    }, 1000);

    // 真正的跳转执行
    autoTimer = setTimeout(() => nextQuestion(), seconds * 1000);
}

function resetTimers() {
    clearTimeout(autoTimer);
    clearInterval(countdownInterval);
    const tipEl = document.getElementById('auto-next-tip');
    if(tipEl) tipEl.innerText = "";
}

function nextQuestion() {
    resetTimers();
    if (currentQuestionIndex < questions.length - 1) {
        currentQuestionIndex++;
        loadQuestion();
    } else {
        showResult();
    }
}

function prevQuestion() {
    if (currentQuestionIndex > 0) {
        resetTimers();
        currentQuestionIndex--;
        loadQuestion();
    }
}

function jumpToQuestion(index) {
    resetTimers();
    currentQuestionIndex = index;
    loadQuestion();
    
    const activeItem = document.getElementById(`grid-item-${index}`);
    if (activeItem) {
        activeItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

// 结束并展示结果
function showResult() {
    // 结果页隐藏所有侧边栏
    document.getElementById('left-panel').classList.add('panel-hidden');
    document.getElementById('right-panel').classList.add('panel-hidden');
    
    clearInterval(examTimer); // 停止倒计时
    document.getElementById('exam-timer-display').classList.add('hidden');
    
    showScreen('result-screen');
    
    document.getElementById('total-q').innerText = questions.length;
    document.getElementById('correct-q').innerText = score;
    
    const accuracy = questions.length > 0 ? Math.round((score / questions.length) * 100) : 0;
    document.getElementById('accuracy').innerText = `${accuracy}%`;

    // ★ 新增：考试模式及格判定展示
    const statusEl = document.getElementById('exam-status');
    if (isExamMode) {
        statusEl.style.display = 'block';
        if (score >= passScore) {
            statusEl.innerHTML = `<h3 style="color: var(--success-color); margin: 20px 0;">✅ 恭喜！模拟考核通过 (及格线: ${passScore}分)</h3>`;
        } else {
            statusEl.innerHTML = `<h3 style="color: var(--error-color); margin: 20px 0;">❌ 遗憾！模拟考核未通过 (及格线: ${passScore}分)</h3>`;
        }
    } else {
        statusEl.style.display = 'none';
    }
    
    isExamMode = false; // 重置状态
}

// 返回主页
function goBackHome() {
    // 刷新或手动重置状态
    document.getElementById('search-section').style.display = 'block';
    document.getElementById('progress-section').style.display = 'none';
    location.reload(); 
}

// ★ 新增：全真模拟考试组卷逻辑
async function startMockExam(level) {
    isExamMode = true;
    
    // 依据官方 2025 新规配置
    const examConfig = {
        'A': { file: 'bank_a.json', single: 32, multi: 8, time: 40 * 60, pass: 30 },
        'B': { file: 'bank_b.json', single: 45, multi: 15, time: 60 * 60, pass: 45 },
        'C': { file: 'bank_c.json', single: 70, multi: 20, time: 90 * 60, pass: 70 }
    }[level];

    passScore = examConfig.pass;
    examTimeLeft = examConfig.time;

    try {
        const response = await fetch(examConfig.file);
        const data = await response.json();
        
        // 区分单选和多选并打乱
        const singles = data.filter(q => q.type !== 'multiple').sort(() => Math.random() - 0.5);
        const multis = data.filter(q => q.type === 'multiple').sort(() => Math.random() - 0.5);

        // 抽取规定数量合并后再次打乱
        const selectedQuestions = [
            ...singles.slice(0, examConfig.single),
            ...multis.slice(0, examConfig.multi)
        ].sort(() => Math.random() - 0.5);

        questions = selectedQuestions;
        
        document.getElementById('exam-timer-display').classList.remove('hidden');
        startExamTimer();
        initQuiz();
    } catch (e) {
        console.error(e);
        alert("考卷加载失败，请检查题库文件。");
    }
}

function startExamTimer() {
    clearInterval(examTimer);
    updateTimerUI();
    examTimer = setInterval(() => {
        examTimeLeft--;
        updateTimerUI();
        if (examTimeLeft <= 0) {
            clearInterval(examTimer);
            alert("⏰ 考试时间到！系统已自动为您交卷。");
            showResult();
        }
    }, 1000);
}

function updateTimerUI() {
    const m = Math.floor(examTimeLeft / 60).toString().padStart(2, '0');
    const s = (examTimeLeft % 60).toString().padStart(2, '0');
    document.getElementById('exam-timer-display').innerText = `倒计时: ${m}:${s}`;
}