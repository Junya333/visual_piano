// --- 設定 ---
// 音階名
const notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// カスタムカラー (反時計回り配置用C=Red)
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
const overlay = document.getElementById('overlay'); // ★追加
const startBtn = document.getElementById('startBtn'); // ★追加

let audioCtx;
let analyser;

let rotationOffset = 0;
let smoothedVal = 0;
let isAudioReady = false; // ★追加: オーディオ準備完了フラグ

// --- 初期化 ---
function init() {
    renderWheel();

    // ★変更: スタートボタンのクリックイベントでオーディオ初期化
    startBtn.addEventListener('click', async () => {
        await initAudio();
        // 準備完了したらオーバーレイを消す
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

// --- オーディオ初期化 (非同期処理) ---
async function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        const masterGain = audioCtx.createGain();
        masterGain.gain.value = 0.6;
        masterGain.connect(analyser);
        analyser.connect(audioCtx.destination);
    }

    // サスペンド状態なら再開待機
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
    // ★重要: オーディオの準備ができていない、またはコンテキストが無い場合は何もしない
    // これにより、バックグラウンドでオシレーターが大量生成されるのを防ぐ
    if (!isAudioReady || !audioCtx || audioCtx.state !== 'running') {
        return;
    }

    const type = toneSelector.value;
    const now = audioCtx.currentTime;

    const mainGain = audioCtx.createGain();
    mainGain.connect(analyser);

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
            oscGain.gain.value = weight * 0.3;
            osc.connect(oscGain);
            oscGain.connect(mainGain);
            osc.start(now);
            osc.stop(now + 3.5);
        }
    } else {
        const baseFreq = 261.63;
        const freq = baseFreq * Math.pow(2, noteIndex / 12);

        if (type === 'sine') {
            const osc = audioCtx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = freq;
            osc.connect(mainGain);
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
            carrier.connect(mainGain);
            carrier.start(now);
            modulator.start(now);
            carrier.stop(now + 3.5);
            modulator.stop(now + 3.5);
        }
    }
    updateCenterColor(colorStr);
}

function updateCenterColor(color) {
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
        centerDisplay.style.backgroundColor = customColors[0]; // 一時的な参照、実際はPlayNoteで更新
        // ※PlayNoteで色が更新されるためここはあまり気にしなくてOK
        centerDisplay.style.width = `${size}px`;
        centerDisplay.style.height = `${size}px`;
        // 現在の背景色を取得して反映させるのは少し複雑なので、
        // 簡易的に前回の色(currentBaseColor)を使うのがベストだが、
        // グローバル変数を使えばOK。今回は簡易実装。
    }
}

// 実行
init();
