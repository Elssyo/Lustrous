/* =========================
   DOM 参照の取得
========================= */
const overlay = document.querySelector("#overlay");
const bar = document.querySelector("#bar");
const textContainer = document.querySelector("#text");
const seekbar = document.querySelector("#seekbar");
const paintedSeekbar = seekbar.querySelector("div");
const msg = document.getElementById("message");
// 「輝いて」を出現順で 7 色ローテーション
const RAINBOW_LEN = 7;
let kagayaiteCount = -1;  // 最初は -1、最初の出現で 0 に

/* =========================
   TextAlive 初期化
========================= */
const { Player, Ease } = TextAliveApp;

// TextAlive Player を初期化
const player = new Player({
  app: { token: "your-token-here" },             // ← あなたのトークン
  mediaElement: document.querySelector("#media"),
  mediaBannerPosition: "bottom right"
});

/* =========================
   歌詞生成用の状態
========================= */
let prevBeat = null;  // 直前のビート
let c = null;         // 直前に表示した文字

/* =========================
   監視リスナの登録
========================= */
player.addListener({
  /* APIの準備ができたら呼ばれる */
  onAppReady(app) {
    if (app.managed) {
      document.querySelector("#control").className = "disabled";
    }
    if (!app.songUrl) {
      document.querySelector("#media").className = "disabled";

      // ラストラス / *Luna
      player.createFromSongUrl("https://www.nicovideo.jp/watch/so45125163", {
        video: {
          // ここに固定したい ID を必要に応じて指定
          // beatId / chordId / repetitiveSegmentId / lyricId / lyricDiffId など
          lyricId: 72788,
          beatId: 4732975
        }
      });
    }
  },

  /* 楽曲が変わったら呼ばれる */
  onAppMediaChange() {
    // 画面表示をリセット
    overlay.className = "";
    bar.className = "";
    resetChars();
  },

  /* 楽曲情報が取れたら呼ばれる */
  onVideoReady(video) {
    // 楽曲情報を表示
    document.querySelector("#artist span").textContent =
      player.data?.song?.artist?.name ?? "-";
    document.querySelector("#song span").textContent =
      player.data?.song?.name ?? "-";

    // 最後に表示した文字の情報をリセット
    c = null;
  },

  /* 再生コントロールができるようになったら呼ばれる */
  onTimerReady() {
    overlay.classList.add("disabled");
    const media = document.querySelector("#media");
    media && media.classList.remove("disabled");
    document.querySelector("#control > a#play").className = "";
    document.querySelector("#control > a#stop").className = "";
  },

  
  /* 再生位置の情報が更新されたら呼ばれる */
  onTimeUpdate(position) {
    try {
      const video = player.video;
      if (!video) return;

      /* ====== 1) 波形（ビートに合わせて描画） ====== */
      const beat = player.findBeat(position);
      let intensity = 0;
      if (beat && typeof beat.progress === "function") {
        const p = beat.progress(position);          // 0 → 1
        const quintOut = (t) => 1 - Math.pow(1 - t, 5);
        intensity = 1 - (Ease?.quintOut?.(p) ?? quintOut(p));
        if (intensity < 0) intensity = 0;
        if (intensity > 1) intensity = 1;
      }
      drawReactiveWave(intensity, position);

      /* ====== 2) シークバー ====== */
      const duration = video.duration;
      if (duration && paintedSeekbar) {
        paintedSeekbar.style.width = `${
          Math.floor((position * 1000) / duration) / 10
        }%`;
      }

      /* ====== 3) ビートバーのクラス切替（任意の補助演出） ====== */
      if (prevBeat !== beat) {
        if (beat && bar) {
          requestAnimationFrame(() => {
            bar.className = "active";
            requestAnimationFrame(() => {
              bar.className = "active beat";
            });
          });
        }
        prevBeat = beat;
      }

      /* ====== 4) 歌詞の逐文字表示 ====== */
      // 歌詞情報がなければこれで処理を終わる
      if (!video.firstChar) return;

      // 巻き戻っていたら歌詞表示をリセットする
      if (c && c.startTime > position + 1000) {
        resetChars();
      }

      // 500ms先に発声される文字を取得
      let current = c || video.firstChar;
      while (current && current.startTime < position + 500) {
        // 新しい文字が発声されようとしている
        if (c !== current) {
          newChar(current);
          c = current;
        }
        current = current.next;
      }
    } catch (err) {
      console.error("[onTimeUpdate error]", err);
    }
  },

  /* 楽曲の再生が始まったら呼ばれる */
  onPlay() {
    // 再生開始ヒントを隠す
    if (msg) msg.classList.add("hidden");

    // 再生ボタン表示を ⏸ に
    const a = document.querySelector("#control > a#play");
    if (a) a.textContent = "⏸";
  },

  /* 楽曲の再生が止まったら呼ばれる */
  onPause() {
    const a = document.querySelector("#control > a#play");
    if (a) a.textContent = "▶";
  },

  onStop() {
    const a = document.querySelector("#control > a#play");
    if (a) a.textContent = "▶";
  }
});

/* =========================
   再生・一時停止ボタン
========================= */
document.querySelector("#control > a#play").addEventListener("click", (e) => {
  e.preventDefault();
  if (!player) return false;
  if (player.isPlaying) {
    player.requestPause();
  } else {
    player.requestPlay();
  }
  return false;
});

/* =========================
   停止ボタン
========================= */
document.querySelector("#control > a#stop").addEventListener("click", (e) => {
  e.preventDefault();
  if (!player) return false;
  player.requestStop();

  // 再生を停止したら画面表示をリセットする
  bar.className = "";
  resetChars();
  return false;
});

/* =========================
   シークバー
========================= */
seekbar.addEventListener("click", (e) => {
  e.preventDefault();
  if (player && player.video?.duration) {
    player.requestMediaSeek(
      (player.video.duration * e.offsetX) / seekbar.clientWidth
    );
  }
  return false;
});

/* =========================
 * 新しい文字の発声時に呼ばれる
 * Called when a new character is being vocalized
========================= */

function markKagayaiRun(startChar) {
  const a = startChar;
  const b = a?.next || null;
  const c = b?.next || null;
  const s = (a?.text || "") + (b?.text || "") + (c?.text || "");
  if (s === "輝いて") {
    kagayaiteCount = (kagayaiteCount + 1) % RAINBOW_LEN;
    const idx = kagayaiteCount;
    if (a) a.__kColorIndex = idx;
    if (b) b.__kColorIndex = idx;
    if (c) c.__kColorIndex = idx;
    return true;
  }
  return false;
}

function newChar(current) {
  // 品詞…
  const classes = [];
  if (
    current.parent.pos === "N" ||
    current.parent.pos === "PN" ||
    current.parent.pos === "X"
  ) {
    classes.push("noun");
  }

  // フレーズの最後の文字か否か
  if (current.parent.parent.lastChar === current) {
    classes.push("lastChar");
  }

  // 英単語の最初か最後の文字か否か
  if (current.parent.language === "en") {
    if (current.parent.lastChar === current) {
      classes.push("lastCharInEnglishWord");
    } else if (current.parent.firstChar === current) {
      classes.push("firstCharInEnglishWord");
    }
  }

  // === 追加：「輝いて」を3文字連続で検出し、3文字すべてに同じレインボーインデックスを付与する ===
  if (current.__kColorIndex == null) {
   // まだマークされていない場合のみ、現在の文字から検出を試みる
    markKagayaiRun(current);
  }
  if (current.__kColorIndex != null) {
    classes.push("kagayai", `kagayai-${current.__kColorIndex}`);
  }

  // noun, lastChar クラスを必要に応じて追加
  const div = document.createElement("div");
  div.appendChild(document.createTextNode(current.text));

  // 文字を画面上に追加
  const container = document.createElement("div");
  container.className = classes.join(" ");
  container.appendChild(div);
  container.addEventListener("click", () => {
    player.requestMediaSeek(current.startTime);
  });
  textContainer.appendChild(container);
}

/* =========================
 * 歌詞表示をリセットする
 * Reset lyrics view
========================= */
function resetChars() {
  c = null;
  while (textContainer.firstChild)
    textContainer.removeChild(textContainer.firstChild);
}

/* =========================================================
   ▼ 波形（Canvas）初期化と描画関数 ＊コメントはそのまま流用
========================================================= */
// --- 波形画布初始化 ---
const waveCanvas = document.getElementById('wave');
const waveCtx = waveCanvas.getContext('2d');

function resizeWaveCanvas() {
  // 像素级尺寸要用设备像素比来放大，保证清晰
  const dpr = window.devicePixelRatio || 1;
  const cssW = waveCanvas.clientWidth;
  const cssH = waveCanvas.clientHeight;
  waveCanvas.width = Math.max(1, Math.floor(cssW * dpr));
  waveCanvas.height = Math.max(1, Math.floor(cssH * dpr));
  waveCtx.setTransform(dpr, 0, 0, dpr, 0, 0); // 用 CSS 像素坐标作图
}
window.addEventListener('resize', resizeWaveCanvas);
// 初始化
requestAnimationFrame(resizeWaveCanvas);

// --- 波形绘制 ---
let lastPhase = 0;  
function drawReactiveWave(intensity, tMs) {
  const ctx = waveCtx;
  if (!ctx) return;
  const w = waveCanvas.clientWidth;
  const h = waveCanvas.clientHeight;
  if (w === 0 || h === 0) return;

  ctx.clearRect(0, 0, w, h);

  // 颜色（你的米黄 #ffdec1）+ 柔和光晕
  ctx.strokeStyle = '#ffdec1';
  ctx.lineWidth = 2;
  ctx.shadowColor = 'rgba(255,222,193,0.85)';
  ctx.shadowBlur = 8;

  const midY = h / 2;

  
  const baseAmp = 6;        
  const pulseAmp = 22;      
  const amp = baseAmp + pulseAmp * intensity;

  
  const baseFreq = 0.018;                
  const freq = baseFreq * (1 + 0.4 * intensity);
  
  lastPhase = (tMs * 0.01) % (Math.PI * 2);

  ctx.beginPath();
  
  for (let x = 0; x <= w; x += 2) {
    const y =
      midY
      + Math.sin(x * freq + lastPhase) * amp                   
      + Math.sin(x * freq * 0.5 + lastPhase * 0.7) * (amp * 0.15); 
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

 
  ctx.shadowBlur = 0;
}