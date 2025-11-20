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

const wheelContainer = document.getElementById('wheel');
const centerDisplay = document.getElementById('centerDisplay');
const toneSelector = document.getElementById('toneType');

let audioCtx;
let analyser;

// --- 初期化 ---
function init() {
    const radius = 130;
    const centerX = 160;
    const centerY = 160;

    notes.forEach((note, index) => {
        const color = customColors[index];

        // 反時計回りに配置 (C=Top)
        const angleStep = 360 / 12;
        const placementAngleDeg = (-90 - (index * angleStep));
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

    requestAnimationFrame(drawVisual);
}

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        const masterGain = audioCtx.createGain();
        masterGain.gain.value = 0.6;
        masterGain.connect(analyser);
        analyser.connect(audioCtx.destination);
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

// --- 音生成のメインロジック ---
function playNote(noteIndex, colorStr) {
    initAudio();

    const type = toneSelector.value;
    const now = audioCtx.currentTime;

    // 音量エンベロープ用 (共通)
    const mainGain = audioCtx.createGain();
    mainGain.connect(analyser);

    // アタック・ディケイ設定 (長く伸びる設定)
    mainGain.gain.setValueAtTime(0, now);
    mainGain.gain.linearRampToValueAtTime(1.0, now + 0.05); // Attack
    mainGain.gain.exponentialRampToValueAtTime(0.001, now + 3.0); // Decay

    if (type === 'shepard') {
        // --- シェパードトーン生成 ---
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
        // --- 通常の音色 (Sine, E-Piano) ---
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

let currentBaseColor = 'rgb(255, 255, 255)';

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

    if (maxVal < 2) {
        if (centerDisplay.style.backgroundColor !== 'white') {
            centerDisplay.style.backgroundColor = 'white';
            centerDisplay.style.width = '20px';
            centerDisplay.style.height = '20px';
            centerDisplay.style.boxShadow = 'none';
        }
    } else {
        const size = 50 + (maxVal * 3);
        centerDisplay.style.backgroundColor = currentBaseColor;
        centerDisplay.style.width = `${size}px`;
        centerDisplay.style.height = `${size}px`;
        centerDisplay.style.boxShadow = `0 0 ${size / 2}px ${currentBaseColor}`;
    }
}

// 実行
init();
