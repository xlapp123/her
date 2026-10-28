import { extension_settings, renderExtensionTemplateAsync } from '../../../extensions.js';

const EXTENSION_NAME = 'st-background-keeper';
const defaultSettings = {
    enabled: true,
    intervalSeconds: 20,
};

let heartbeatTimer = null;
let audioContext = null;
let wakeLock = null;

// 初始化配置
function loadSettings() {
    extension_settings[EXTENSION_NAME] = extension_settings[EXTENSION_NAME] || {};
    for (const key in defaultSettings) {
        if (!extension_settings[EXTENSION_NAME].hasOwnProperty(key)) {
            extension_settings[EXTENSION_NAME][key] = defaultSettings[key];
        }
    }
}

// 1. 静音音频管道（利用音频播放占用 Android 媒体焦点，防止浏览器挂起）
function startSilentAudio() {
    try {
        if (!audioContext) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) return;
            audioContext = new AudioContextClass();
        }

        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }

        // 创建静音振荡器循环播放
        const osc = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime); // 极低音量近乎静音

        osc.connect(gainNode);
        gainNode.connect(audioContext.destination);
        osc.start();
    } catch (e) {
        console.warn('[KeepAlive] 无法启动静音音频:', e);
    }
}

// 2. 屏幕与线程唤醒锁 (Screen Wake Lock API)
async function requestWakeLock() {
    if ('wakeLock' in navigator) {
        try {
            wakeLock = await navigator.wakeLock.request('screen');
            wakeLock.addEventListener('release', () => {
                wakeLock = null;
            });
        } catch (err) {
            console.warn('[KeepAlive] 唤醒锁申请失败:', err.message);
        }
    }
}

// 3. 后端心跳 Ping
function sendHeartbeat() {
    fetch('/api/ping', { method: 'GET', cache: 'no-store' })
        .catch(() => {
            // 备用：若 /api/ping 不可用，请求静态资源保持连接
            fetch('/favicon.ico', { method: 'HEAD', cache: 'no-store' }).catch(() => {});
        });
}

function startKeepAlive() {
    stopKeepAlive();
    
    // 启动音频与唤醒锁（需要用户交互上下文）
    startSilentAudio();
    requestWakeLock();

    // 启动定期轮询
    const intervalMs = (extension_settings[EXTENSION_NAME].intervalSeconds || 20) * 1000;
    heartbeatTimer = setInterval(sendHeartbeat, intervalMs);

    // 监听切回前台事件重新获取 WakeLock
    document.addEventListener('visibilitychange', handleVisibilityChange);
    console.log('[KeepAlive] 后台保活服务已启动');
}

function stopKeepAlive() {
    if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
    }
    if (wakeLock) {
        wakeLock.release().catch(() => {});
        wakeLock = null;
    }
    if (audioContext && audioContext.state !== 'closed') {
        audioContext.suspend().catch(() => {});
    }
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    console.log('[KeepAlive] 后台保活服务已停止');
}

function handleVisibilityChange() {
    if (document.visibilityState === 'visible' && extension_settings[EXTENSION_NAME].enabled) {
        requestWakeLock();
        if (audioContext && audioContext.state === 'suspended') {
            audioContext.resume().catch(() => {});
        }
    }
}

// 挂载 UI 控件到 SillyTavern 扩展设置菜单
async function setupUI() {
    const container = document.getElementById('extensions_settings');
    if (!container) return;

    const extHtml = `
        <div class="keepalive-settings-block">
            <div class="inline-drawer">
                <div class="inline-drawer-toggle inline-drawer-header">
                    <b>Termux 后台保活</b>
                    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                </div>
                <div class="inline-drawer-content">
                    <label class="checkbox_label">
                        <input id="keepalive_toggle_enabled" type="checkbox" ${extension_settings[EXTENSION_NAME].enabled ? 'checked' : ''} />
                        <span>启用后台保活 (音频常驻 + 心跳)</span>
                    </label>
                    <div style="margin-top: 8px;">
                        <label>心跳轮询间隔 (秒):</label>
                        <input id="keepalive_input_interval" class="text_pole" type="number" min="5" max="120" value="${extension_settings[EXTENSION_NAME].intervalSeconds}" />
                    </div>
                </div>
            </div>
        </div>
    `;

    container.insertAdjacentHTML('beforeend', extHtml);

    // 绑定交互事件
    const toggleCheckbox = document.getElementById('keepalive_toggle_enabled');
    const intervalInput = document.getElementById('keepalive_input_interval');

    toggleCheckbox.addEventListener('change', (e) => {
        extension_settings[EXTENSION_NAME].enabled = e.target.checked;
        if (e.target.checked) {
            startKeepAlive();
        } else {
            stopKeepAlive();
        }
    });

    intervalInput.addEventListener('change', (e) => {
        const val = parseInt(e.target.value, 10);
        if (val >= 5) {
            extension_settings[EXTENSION_NAME].intervalSeconds = val;
            if (extension_settings[EXTENSION_NAME].enabled) {
                startKeepAlive();
            }
        }
    });

    // 首次交互激活 AudioContext (避免浏览器 Autoplay 限制)
    const unlockAudio = () => {
        if (extension_settings[EXTENSION_NAME].enabled) {
            startKeepAlive();
        }
        window.removeEventListener('click', unlockAudio);
        window.removeEventListener('touchstart', unlockAudio);
    };
    window.addEventListener('click', unlockAudio, { once: true });
    window.addEventListener('touchstart', unlockAudio, { once: true });
}

jQuery(async () => {
    loadSettings();
    await setupUI();
    if (extension_settings[EXTENSION_NAME].enabled) {
        startKeepAlive();
    }
});