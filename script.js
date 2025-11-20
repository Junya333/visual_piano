// --- 設定 ---
// 音階名
const notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// カスタムカラー (ユーザー設定)
const customColors = [
    "rgb(255, 0, 0)",   // C
    "rgb(255, 86, 35)",  // C#
    "rgb(255, 158, 62)",  // D
    "rgb(221, 177, 55)",  // D#
    "rgb(250, 250, 44)",  // E
    "rgb(122, 212, 95)",  // F
    "rgb(72, 231, 103)",   // F#
    "rgb(42, 128, 213)",   // G
    "rgb(34, 73, 146)",   // G#
    "rgb(25, 44, 132)",   // A
    "rgb(95, 44, 88)",   // A#
    "rgb(205, 22, 184)"   // B
];

// HTML要素
const wheelContainer = document.getElementById('wheel');
const centerDisplay = document.getElementById('centerDisplay');
const toneSelector = document.getElementById('toneType');
const rotateLeftBtn = document.getElementById('rotateLeft');
const rotateRightBtn = document.getElementById('rotateRight');
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('startBtn');

// グローバル変数
let audioCtx;
let analyser;
let compressor; // ★追加: 音割れ防止用コンプレッサー

let rotationOffset = 0;
let smoothedVal = 0;
let isAudioReady = false;
let currentBaseColor = 'rgb(255, 255, 255)'; // 現在の色保存用

// --- 初期化 ---
function init() {
    renderWheel();

    startBtn.addEventListener('click', async () => {
        await initAudio();
        if (audioCtx && audioCtx.state === 'running') {
            isAudioReady = true;
            overlay.classList.add('hidden');
            requestAnimationFrame(drawVisual);
        }
    });

    rotateLeftBtn.addEventListener('click', () => {
        rotationOffset -= 1;
        renderWheel();
    });

    rotateRightBtn.addEventListener('click', () => {
        rotationOffset += 1;
        renderWheel();
    });
}

// --- オーディオ初期化 ---
async function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();

        // ★修正: 音響回路の構築 (コンプレッサーの導入)
        // 音の流れ: [各音源] -> [Compressor] -> [Analyser] -> [Destination(スピーカー)]

        // 1. コンプレッサー作成 (リミッターとして設定)
        compressor = audioCtx.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-24, audioCtx.currentTime); // -24dBを超えたら圧縮開始
        compressor.knee.setValueAtTime(30, audioCtx.currentTime);       // 滑らかに圧縮
        compressor.ratio.setValueAtTime(12, audioCtx.currentTime);      // 強く圧縮して音割れを防ぐ
        compressor.attack.setValueAtTime(0.003, audioCtx.currentTime);  // 素早く反応
        compressor.release.setValueAtTime(0.25, audioCtx.currentTime);  // 自然に戻す

        // 2. アナライザー作成
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;

        // 3. 接続
        compressor.connect(analyser);
        analyser.connect(audioCtx.destination);
    }

    if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
    }
}

// --- 円環の描画 ---
function renderWheel() {
    const existingBtns = document.querySelectorAll('.note-btn');
    existingBtns.forEach(btn => btn.remove());

    const radius = 130;
    const centerX = 160;
    const centerY = 160;
    const angleStep = 360 / 12;

    notes.forEach((note, index) => {
        const color = customColors[index];
        const placementAngleDeg = -90 - (index * angleStep) + (rotationOffset * angleStep);
        const placementAngleRad = placementAngleDeg * (Math.PI / 180);

        const x = centerX + radius * Math.cos(placementAngleRad);
        const y = centerY + radius * Math.sin(placementAngleRad);

        const btn = document.createElement('div');
        btn.className = 'note-btn';
        btn.style.backgroundColor = color;
        btn.style.left = (x - 30) + 'px';
        btn.style.top = (y - 30) + 'px';
        btn.innerHTML = `<span class="note-label">${note}</span>`;

        const playHandler = (e) => {
            e.preventDefault();
            playNote(index, color);
        };
        btn.addEventListener('mousedown', playHandler);
        btn.addEventListener('touchstart', playHandler);

        wheelContainer.appendChild(btn);
    });
}

// --- 音生成 ---
function playNote(noteIndex, colorStr) {
    if (!isAudioReady || !audioCtx || audioCtx.state !== 'running') {
        return;
    }

    const type = toneSelector.value;
    const now = audioCtx.currentTime;

    const mainGain = audioCtx.createGain();

    // ★変更: アナライザーではなくコンプレッサーに接続 (音割れ防止回路を通す)
    mainGain.connect(compressor);

    mainGain.gain.setValueAtTime(0, now);
    mainGain.gain.linearRampToValueAtTime(1.0, now + 0.05);
    mainGain.gain.exponentialRampToValueAtTime(0.001, now + 3.0);

    if (type === 'shepard') {
        const baseC = 16.35;
        const pitchCoef = Math.pow(2, noteIndex / 12);
        const centerFreq = 500;

        for (let octave = 0; octave < 10; octave++) {
            const freq = baseC * Math.pow(2, octave) * pitchCoef;
            if (freq < 20 || freq > 16000) continue;

            const logF = Math.log2(freq);
            const logFc = Math.log2(centerFreq);
            const sigma = 2.0;
            const weight = Math.exp(-Math.pow(logF - logFc, 2) / (2 * Math.pow(sigma, 2)));

            if (weight < 0.01) continue;

            const osc = audioCtx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = freq;
            const oscGain = audioCtx.createGain();
            // ★微調整: 重ね合わせの音量を少し下げる (0.3 -> 0.2)
            oscGain.gain.value = weight * 0.2;
            osc.connect(oscGain);
            oscGain.connect(mainGain);
            osc.start(now);
            osc.stop(now + 3.5);
        }
    } else {
        const baseFreq = 261.63;
        const freq = baseFreq * Math.pow(2, noteIndex / 12);

        // ★微調整: 単音モードの音量も少し下げる (Default 1.0 -> 0.4)
        // コンプレッサー前段で音量を適正にしておく
        const volumeScale = 0.4;

        if (type === 'sine') {
            const osc = audioCtx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = freq;

            const oscGain = audioCtx.createGain();
            oscGain.gain.value = volumeScale;

            osc.connect(oscGain);
            oscGain.connect(mainGain);

            osc.start(now);
            osc.stop(now + 3.5);
        } else if (type === 'epiano') {
            const carrier = audioCtx.createOscillator();
            carrier.type = 'sine';
            carrier.frequency.value = freq;
            const modulator = audioCtx.createOscillator();
            modulator.type = 'sine';
            modulator.frequency.value = freq * 4;
            const modGain = audioCtx.createGain();
            modGain.gain.setValueAtTime(freq * 1.5, now);
            modGain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);

            modulator.connect(modGain);
            modGain.connect(carrier.frequency);

            const carrierGain = audioCtx.createGain();
            carrierGain.gain.value = volumeScale;

            carrier.connect(carrierGain);
            carrierGain.connect(mainGain);

            carrier.start(now);
            modulator.start(now);
            carrier.stop(now + 3.5);
            modulator.stop(now + 3.5);
        }
    }
    updateCenterColor(colorStr);
}

function updateCenterColor(color) {
    currentBaseColor = color;
    centerDisplay.style.backgroundColor = color;
}

function drawVisual() {
    requestAnimationFrame(drawVisual);
    if (!analyser) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteTimeDomainData(dataArray);

    let maxVal = 0;
    for (let i = 0; i < bufferLength; i++) {
        const v = Math.abs(dataArray[i] - 128);
        if (v > maxVal) maxVal = v;
    }

    smoothedVal += (maxVal - smoothedVal) * 0.1;

    if (smoothedVal < 1.0) {
        if (centerDisplay.style.backgroundColor !== 'white') {
            centerDisplay.style.backgroundColor = 'white';
            centerDisplay.style.width = '20px';
            centerDisplay.style.height = '20px';
            centerDisplay.style.boxShadow = 'none';
        }
    } else {
        const size = 50 + (smoothedVal * 3);
        centerDisplay.style.backgroundColor = currentBaseColor;
        centerDisplay.style.width = `${size}px`;
        centerDisplay.style.height = `${size}px`;
        centerDisplay.style.boxShadow = `0 0 ${size / 2}px ${currentBaseColor}`;
    }
}

// 実行
init();
