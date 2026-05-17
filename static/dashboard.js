// ── 상태 ──────────────────────────────────────────────
let apiKey        = localStorage.getItem('anthropic_api_key') || '';
let elevenKey     = localStorage.getItem('eleven_api_key') || '';
// 이전 버전 키 마이그레이션
const _oldVoiceId = localStorage.getItem('eleven_voice_id');
let agentVoiceId  = localStorage.getItem('eleven_agent_voice_id') || _oldVoiceId || '21m00Tcm4TlvDq8ikWAM';
let friendVoiceId = localStorage.getItem('eleven_friend_voice_id') || _oldVoiceId || 'TxGEqnHWrfWFTfGW9XjX';
let agentState  = 'IDLE';
let isInCall    = false;
let recognition = null;
let synth       = window.speechSynthesis;
let friendHistory = [];   // 친구와의 대화 히스토리
let agentHistory  = [];   // 에이전트 대화 히스토리
let isAgentSpeaking = false;
let audioCtx    = null;
let ringNode    = null;
let durationTimer = null;
let durationSec   = 0;
let currentAudio  = null;
let calleeName  = '친구';
let isAgentMode = false;  // true면 에이전트 답변 중

const WAKE_WORD = '에이전트';
const PHISHING_KEYWORDS = [
  '검사', '경찰', '금융감독원', '계좌이체', '구속영장',
  '범죄', '수사', '코인', '상품권', '긴급출금', '금융범죄'
];

// ── 프롬프트 ──────────────────────────────────────────
function getFriendPrompt(name) {
  return `당신은 "${name}"이라는 친한 친구입니다. 지금 친구와 전화 통화 중입니다.
- 반말로 짧고 자연스럽게 대화하세요. (1~2문장)
- 일상적인 이야기를 나누세요. (약속, 밥, 근황, 주말 계획 등)
- 친구가 "${WAKE_WORD}"라고 말하면 "어, 잠깐?" 이라고만 짧게 말하고 멈추세요.
- 에이전트 답변 후 대화를 자연스럽게 이어가세요.
오직 친구의 말만 출력하세요. JSON 없이 텍스트만.`;
}

const AGENT_PROMPT = `당신은 통화 중 호출된 AI 어시스턴트입니다.
사용자가 "에이전트" 이후에 한 질문에 간결하고 정확하게 한국어로 답변하세요.
2~3문장으로 짧게. 텍스트만 출력하세요.`;

const CALENDAR_PROMPT = `사용자의 말에서 일정 정보를 파악해 아래 JSON으로만 응답하세요.
{
  "message": "확인 메시지",
  "calendar_event": { "title": "일정 제목", "datetime": "날짜 시간" }
}
날짜가 불명확하면 message에서 되물어보세요.`;

// ── 초기화 ────────────────────────────────────────────
window.addEventListener('load', () => {
  if (apiKey)    document.getElementById('apiKeyInput').value    = '••••••••••••••••';
  if (elevenKey) document.getElementById('elevenKeyInput').value = '••••••••••••••••';

  // 에이전트 목소리 복원
  const agentSel   = document.getElementById('voiceSelect');
  const savedAgent = localStorage.getItem('eleven_agent_voice_id') || '21m00Tcm4TlvDq8ikWAM';
  if ([...agentSel.options].find(o => o.value === savedAgent)) {
    agentSel.value = savedAgent;
  } else {
    agentSel.value = 'custom_agent';
    document.getElementById('customAgentVoiceInput').classList.remove('hidden');
    document.getElementById('customAgentVoiceInput').value = savedAgent;
  }

  // 친구 목소리 복원
  const friendSel   = document.getElementById('friendVoiceSelect');
  const savedFriend = localStorage.getItem('eleven_friend_voice_id') || 'TxGEqnHWrfWFTfGW9XjX';
  if ([...friendSel.options].find(o => o.value === savedFriend)) {
    friendSel.value = savedFriend;
  } else {
    friendSel.value = 'custom_friend';
    document.getElementById('customFriendVoiceInput').classList.remove('hidden');
    document.getElementById('customFriendVoiceInput').value = savedFriend;
  }

  const status = [];
  if (apiKey)    status.push('Anthropic ✓');
  if (elevenKey) status.push('ElevenLabs ✓');
  document.getElementById('apiKeyStatus').textContent = status.join('  ');
  updateStatusBadge('IDLE');
});

// ── API 키 저장 ───────────────────────────────────────
function saveApiKey(type) {
  if (type === 'anthropic') {
    const input = document.getElementById('apiKeyInput').value.trim();
    if (!input || input.startsWith('•')) return;
    apiKey = input.replace(/[^\x20-\x7E]/g, '');
    localStorage.setItem('anthropic_api_key', apiKey);
    document.getElementById('apiKeyInput').value = '••••••••••••••••';
  } else if (type === 'eleven') {
    const input = document.getElementById('elevenKeyInput').value.trim();
    if (!input || input.startsWith('•')) return;
    elevenKey = input.replace(/[^\x20-\x7E]/g, '');
    localStorage.setItem('eleven_api_key', elevenKey);
    document.getElementById('elevenKeyInput').value = '••••••••••••••••';
  }
  const status = [];
  if (apiKey)    status.push('Anthropic ✓');
  if (elevenKey) status.push('ElevenLabs ✓');
  document.getElementById('apiKeyStatus').textContent = status.join('  ');
}

function saveVoice(role) {
  if (role === 'agent') {
    const sel = document.getElementById('voiceSelect');
    const custom = document.getElementById('customAgentVoiceInput');
    if (sel.value === 'custom_agent') {
      custom.classList.remove('hidden');
      agentVoiceId = custom.value.trim() || agentVoiceId;
    } else {
      custom.classList.add('hidden');
      agentVoiceId = sel.value;
    }
    localStorage.setItem('eleven_agent_voice_id', agentVoiceId);
  } else if (role === 'friend') {
    const sel = document.getElementById('friendVoiceSelect');
    const custom = document.getElementById('customFriendVoiceInput');
    if (sel.value === 'custom_friend') {
      custom.classList.remove('hidden');
      friendVoiceId = custom.value.trim() || friendVoiceId;
    } else {
      custom.classList.add('hidden');
      friendVoiceId = sel.value;
    }
    localStorage.setItem('eleven_friend_voice_id', friendVoiceId);
  }
}

// ── 링톤 ──────────────────────────────────────────────
function startRingtone() {
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  function playRingCycle() {
    if (!audioCtx) return;
    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc1.frequency.value = 440;
    osc2.frequency.value = 480;
    osc1.type = 'sine';
    osc2.type = 'sine';
    gain.gain.value = 0.15;
    osc1.connect(gain); osc2.connect(gain); gain.connect(audioCtx.destination);
    const now = audioCtx.currentTime;
    osc1.start(now); osc2.start(now);
    osc1.stop(now + 1.2); osc2.stop(now + 1.2);
  }
  playRingCycle();
  ringNode = setInterval(playRingCycle, 2000);
}

function stopRingtone() {
  if (ringNode && typeof ringNode === 'number') clearInterval(ringNode);
  if (audioCtx) { audioCtx.close(); audioCtx = null; }
  ringNode = null;
}

// ── 통화 시간 타이머 ──────────────────────────────────
function startDurationTimer() {
  durationSec = 0;
  document.getElementById('callDuration').classList.remove('hidden');
  const phoneTime = document.getElementById('phoneCallTime');
  if (phoneTime) phoneTime.classList.remove('hidden');

  durationTimer = setInterval(() => {
    durationSec++;
    const m = String(Math.floor(durationSec / 60)).padStart(2, '0');
    const s = String(durationSec % 60).padStart(2, '0');
    const timeStr = `${m}:${s}`;
    document.getElementById('callDuration').textContent = timeStr;
    if (phoneTime) phoneTime.textContent = timeStr;
  }, 1000);
}

function stopDurationTimer() {
  clearInterval(durationTimer);
  durationTimer = null;
  document.getElementById('callDuration').classList.add('hidden');
}

// ── 아바타 상태 ───────────────────────────────────────
function setAvatarState(state) {
  const circle = document.getElementById('avatarCircle');
  const icon   = document.getElementById('avatarIcon');
  const waves  = document.querySelectorAll('.ring-wave');
  waves.forEach(w => w.classList.remove('active'));
  circle.className = 'avatar-circle';
  if (state === 'ringing') {
    waves.forEach(w => w.classList.add('active'));
    circle.classList.add('ringing');
    icon.textContent = '📳';
  } else if (state === 'answered') {
    circle.classList.add('answered');
    icon.textContent = '🙂';
  } else if (state === 'agent') {
    circle.classList.add('answered');
    icon.textContent = '🤖';
  } else {
    icon.textContent = '📵';
  }
}

// ── 통화 제어 ─────────────────────────────────────────
function startCall(mode = 'friend') {
  if (!apiKey) { alert('먼저 API 키를 저장해주세요.'); return; }
  if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
    alert('Chrome 브라우저를 사용해주세요.'); return;
  }

  calleeName = document.getElementById('calleeInput').value.trim() || '친구';
  friendHistory = [];
  agentHistory  = [];
  isAgentMode   = false;

  document.getElementById('chatMessages').innerHTML = '';
  document.getElementById('alertBanner').classList.add('hidden');
  document.getElementById('callBtnFriend').classList.add('hidden');
  document.getElementById('callBtnAbsent').classList.add('hidden');
  document.getElementById('hangupBtn').classList.remove('hidden');
  document.getElementById('calleeInput').disabled = true;

  setAvatarState('ringing');
  startRingtone();
  document.getElementById('callerInfo').textContent = `${calleeName}에게 전화 중...`;
  addSystemMessage(`${calleeName}에게 전화를 겁니다...`);

  let ringCount = 0;
  const ringInterval = setInterval(() => {
    if (++ringCount >= 3) {
      clearInterval(ringInterval);
      stopRingtone();
      if (mode === 'absent') {
        agentPickUpForAbsent();
      } else {
        friendPickUp();
      }
    }
  }, 2000);
}

function friendPickUp() {
  isInCall = true;
  setAgentState('MONITORING');
  setAvatarState('answered');
  startDurationTimer();
  document.getElementById('callerInfo').textContent = `${calleeName}과 통화 중`;
  document.getElementById('micStatus').classList.remove('hidden');
  syncPhoneScreen();
  addSystemMessage(`${calleeName}이(가) 전화를 받았습니다. "에이전트"라고 말하면 AI가 도움을 줍니다.`);
  callFriend('(전화 연결됨. 친구에게 먼저 인사해줘)');
}

function agentPickUpForAbsent() {
  isInCall = true;
  setAgentState('MONITORING');
  setAvatarState('agent');
  startDurationTimer();
  document.getElementById('callerInfo').textContent = `${calleeName} (AI 비서) 통화 중`;
  document.getElementById('micStatus').classList.remove('hidden');
  syncPhoneScreen();

  const greeting = `안녕하세요, ${calleeName}의 AI 비서입니다. 지금 자리를 비우셨습니다. 무엇을 도와드릴까요?`;
  addSystemMessage(`${calleeName}이(가) 부재중입니다. 에이전트가 대신 응답합니다.`);
  addMessage('agent', greeting);
  speak(greeting, 'agent');
}

function endCall() {
  isInCall    = false;
  isAgentMode = false;
  stopListening();
  stopRingtone();
  stopDurationTimer();
  synth.cancel();
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  setAgentState('IDLE');
  setAvatarState('idle');
  document.getElementById('callBtnFriend').classList.remove('hidden');
  document.getElementById('callBtnAbsent').classList.remove('hidden');
  document.getElementById('hangupBtn').classList.add('hidden');
  document.getElementById('micStatus').classList.add('hidden');
  document.getElementById('callerInfo').textContent = '대기 중...';
  document.getElementById('calleeInput').disabled = false;
  document.getElementById('alertBanner').classList.add('hidden');
  addSystemMessage('통화가 종료되었습니다.');
}

// ── 음성 인식 ─────────────────────────────────────────
function startListening() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SR();
  recognition.lang = 'ko-KR';
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.onresult = (e) => {
    const text = e.results[e.results.length - 1][0].transcript.trim();
    if (text) handleUserSpeech(text);
  };
  recognition.onend = () => {
    if (isInCall && !isAgentSpeaking) recognition.start();
  };
  recognition.start();
}

function stopListening() {
  if (recognition) { recognition.stop(); recognition = null; }
}

// ── 발화 처리 ─────────────────────────────────────────
function handleUserSpeech(text) {
  addMessage('user', text);

  // 보이스피싱 키워드 감지
  const foundKeywords = PHISHING_KEYWORDS.filter(k => text.includes(k));
  if (foundKeywords.length >= 2) {
    triggerPhishingAlert(foundKeywords);
    return;
  }

  // 부재중 모드: 에이전트가 모든 대화 처리
  if (agentState === 'MONITORING' && document.getElementById('callerInfo').textContent.includes('AI 비서')) {
    callAbsentAgent(text);
    return;
  }

  // 에이전트 호출 감지
  if (text.includes(WAKE_WORD)) {
    isAgentMode = true;
    setAgentState('ASSIST');
    setAvatarState('agent');
    document.getElementById('callerInfo').textContent = '에이전트 답변 중...';
    callAgent(text);
    return;
  }

  // 일반 대화 → 친구가 응답
  callFriend(text);
}

// ── 친구 Claude 호출 ──────────────────────────────────
async function callFriend(userText) {
  friendHistory.push({ role: 'user', content: userText });
  const typingId = addTypingIndicator('friend');

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        system: getFriendPrompt(calleeName),
        messages: friendHistory.slice(-10)
      })
    });

    removeTypingIndicator(typingId);
    if (!res.ok) { addSystemMessage(`API 오류: ${res.status}`); return; }

    const data = await res.json();
    const reply = data.content[0].text.trim();
    friendHistory.push({ role: 'assistant', content: reply });

    addMessage('caller', reply);
    speak(reply, 'friend');
  } catch (err) {
    removeTypingIndicator(typingId);
    addSystemMessage(`오류: ${err.message}`);
  }
}

// ── 부재중 에이전트 Claude 호출 ──────────────────────
async function callAbsentAgent(userText) {
  agentHistory.push({ role: 'user', content: userText });
  const typingId = addTypingIndicator('agent');

  const prompt = `당신은 부재중인 "${calleeName}"을 대신해 전화를 받은 AI 비서입니다.
- 정중하고 친절하게 응대하세요.
- 일정 등록 요청이 있으면 반드시 아래 JSON 형식으로 응답하세요.
- 일반 대화는 텍스트만 응답하세요.

일정 요청 시:
{"message": "확인 메시지", "calendar_event": {"title": "제목", "datetime": "날짜 시간"}}

일반 대화 시: 텍스트만`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: prompt,
        messages: agentHistory.slice(-10)
      })
    });

    removeTypingIndicator(typingId);
    if (!res.ok) { addSystemMessage(`API 오류: ${res.status}`); return; }

    const data  = await res.json();
    const raw   = data.content[0].text.trim();
    agentHistory.push({ role: 'assistant', content: raw });

    let message = raw;
    let calendar_event = null;

    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        message        = parsed.message || raw;
        calendar_event = parsed.calendar_event || null;
      }
    } catch {}

    addMessage('agent', message);
    if (calendar_event) {
      addCalendarEvent(calendar_event);
      setAgentState('CALENDAR');
      setTimeout(() => setAgentState('MONITORING'), 2000);
    }
    speak(message, 'agent');
  } catch (err) {
    removeTypingIndicator(typingId);
    addSystemMessage(`오류: ${err.message}`);
  }
}

// ── 에이전트 Claude 호출 ──────────────────────────────
async function callAgent(userText) {
  agentHistory.push({ role: 'user', content: userText });
  const typingId = addTypingIndicator('agent');

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: AGENT_PROMPT,
        messages: agentHistory.slice(-6)
      })
    });

    removeTypingIndicator(typingId);
    if (!res.ok) { addSystemMessage(`API 오류: ${res.status}`); return; }

    const data = await res.json();
    const reply = data.content[0].text.trim();
    agentHistory.push({ role: 'assistant', content: reply });

    addMessage('agent', reply);

    // 에이전트 답변 후 친구 대화 복귀
    await speak(reply, 'agent');
    isAgentMode = false;
    setAgentState('MONITORING');
    setAvatarState('answered');
    document.getElementById('callerInfo').textContent = `${calleeName}과 통화 중`;
    // 친구가 에이전트 답변 듣고 반응
    callFriend('(에이전트가 방금 답변해줬어. 자연스럽게 대화를 이어가줘)');
  } catch (err) {
    removeTypingIndicator(typingId);
    addSystemMessage(`오류: ${err.message}`);
  }
}

// ── 보이스피싱 알림 ───────────────────────────────────
function triggerPhishingAlert(keywords) {
  setAgentState('TAKEOVER');
  const text = document.getElementById('alertText');
  text.textContent = `보이스피싱 의심! 키워드: ${keywords.join(', ')} — 에이전트가 대응합니다.`;
  document.getElementById('alertBanner').classList.remove('hidden');
  addSystemMessage('⚠️ 보이스피싱 의심 통화가 감지되었습니다.');
}

// ── TTS ───────────────────────────────────────────────
async function speak(text, role = 'agent') {
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  synth.cancel();
  stopListening();
  isAgentSpeaking = true;

  return new Promise((resolve) => {
    if (elevenKey) {
      speakElevenLabs(text, role).then(resolve);
    } else {
      speakBrowser(text, resolve);
    }
  });
}

async function speakElevenLabs(text, role = 'agent') {
  const vid = role === 'friend' ? friendVoiceId : agentVoiceId;

  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${vid}`, {
      method: 'POST',
      headers: { 'xi-api-key': elevenKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 }
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      addSystemMessage(`ElevenLabs 오류: ${err?.detail?.message || res.status} → 브라우저 TTS 대체`);
      return new Promise(r => speakBrowser(text, r));
    }

    return new Promise((resolve) => {
      res.blob().then(blob => {
        const url   = URL.createObjectURL(blob);
        const audio = new Audio(url);
        currentAudio = audio;
        audio.onended = () => {
          currentAudio = null;
          isAgentSpeaking = false;
          URL.revokeObjectURL(url);
          if (isInCall) startListening();
          resolve();
        };
        audio.onerror = () => { speakBrowser(text, resolve); };
        audio.play();
      });
    });
  } catch (err) {
    addSystemMessage(`ElevenLabs 실패: ${err.message} → 브라우저 TTS 대체`);
    return new Promise(r => speakBrowser(text, r));
  }
}

function speakBrowser(text, resolve) {
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'ko-KR';
  utter.rate = 1.0;
  utter.onend = () => {
    isAgentSpeaking = false;
    if (isInCall) startListening();
    if (resolve) resolve();
  };
  synth.speak(utter);
}

async function testElevenLabs() {
  if (!elevenKey) { addSystemMessage('ElevenLabs API 키를 먼저 저장해주세요.'); return; }
  addSystemMessage('목소리 테스트 중...');
  isAgentSpeaking = true;
  await speakElevenLabs('안녕하세요, 저는 AI 어시스턴트입니다. 테스트 중입니다.');
}

// ── UI 헬퍼 ───────────────────────────────────────────
function setAgentState(state) {
  agentState = state;
  const badge = document.getElementById('agentStatus');
  badge.textContent = state;
  badge.className = `status-badge ${state}`;
  const labels = {
    IDLE: '', MONITORING: '통화 중', TAKEOVER: '⚠️ 보이스피싱 대응 중',
    ASSIST: '🤖 에이전트 답변 중', CALENDAR: '📅 일정 등록 중'
  };
  const label = labels[state] || '';
  // 핸드폰 화면 상태 업데이트
  const phoneInfo = document.getElementById('phoneChatMode');
  if (phoneInfo) phoneInfo.textContent = label;
}

function syncPhoneScreen() {
  const nameEl = document.getElementById('phoneCallerName');
  const timeEl = document.getElementById('phoneCallTime');
  if (!nameEl) return;

  if (agentState === 'IDLE') {
    nameEl.textContent = '대기 중';
    if (timeEl) timeEl.classList.add('hidden');
  } else {
    nameEl.textContent = calleeName || '통화 중';
    if (timeEl) timeEl.classList.remove('hidden');
  }
}

function updateStatusBadge(state) { setAgentState(state); }

function addMessage(role, text) {
  const container = document.getElementById('chatMessages');
  container.querySelector('.chat-empty')?.remove();
  const labels = { caller: calleeName, agent: '에이전트', user: '나', system: '시스템' };
  const div = document.createElement('div');
  div.className = `message ${role}`;
  div.innerHTML = `
    <div class="message-label">${labels[role] || role}</div>
    <div class="message-bubble">${escapeHtml(text)}</div>
  `;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function addSystemMessage(text) { addMessage('system', text); }

function addTypingIndicator(role = 'agent') {
  const container = document.getElementById('chatMessages');
  const id  = 'typing-' + Date.now();
  const labels = { agent: '에이전트', friend: calleeName };
  const div = document.createElement('div');
  div.className = `message ${role === 'friend' ? 'caller' : 'agent'} typing`;
  div.id = id;
  div.innerHTML = `<div class="message-label">${labels[role] || role}</div><div class="message-bubble"></div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return id;
}

function removeTypingIndicator(id) {
  document.getElementById(id)?.remove();
}

function addCalendarEvent(event) {
  const list  = document.getElementById('eventList');
  list.querySelector('.empty')?.remove();
  const li = document.createElement('li');
  li.className = 'event-item';
  li.innerHTML = `
    <div class="event-time">${escapeHtml(event.datetime || '')}</div>
    <div class="event-title">${escapeHtml(event.title || '')}</div>
  `;
  list.appendChild(li);
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
