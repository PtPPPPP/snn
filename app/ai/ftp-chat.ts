import {
  getAiStatus,
  sendChatMessage,
  type AiChatMessage,
} from "../../lib/ai-client";

const unavailableReply = "SNN AI 节点当前未连接，请稍后再试。";
const messages: AiChatMessage[] = [];
let requestVersion = 0;

const messageList = document.querySelector<HTMLElement>("#ai-messages");
const statusLabel = document.querySelector<HTMLElement>("#ai-status-label");
const statusDetail = document.querySelector<HTMLElement>("#ai-status-detail");
const statusDot = document.querySelector<HTMLElement>("#ai-status-dot");
const panelState = document.querySelector<HTMLElement>("#ai-panel-state");
const form = document.querySelector<HTMLFormElement>("#ai-composer");
const input = document.querySelector<HTMLTextAreaElement>("#ai-message");
const sendButton = document.querySelector<HTMLButtonElement>("#ai-send");
const newChatButton = document.querySelector<HTMLButtonElement>("#ai-new-chat");

function renderWelcome() {
  if (!messageList) {
    return;
  }

  messageList.replaceChildren();
  const emptyState = document.createElement("div");
  emptyState.className = "emptyState";
  emptyState.innerHTML =
    '<span class="emptyMark">SNN / AI</span><h2>从一个问题开始。</h2><p>这里将连接 SNN 本地 AI 节点。节点离线时，页面会保留消息并提示服务暂不可用。</p>';
  messageList.append(emptyState);
}

function appendMessage(message: AiChatMessage) {
  if (!messageList) {
    return;
  }

  const row = document.createElement("article");
  const isUser = message.role === "user";

  row.className = `messageRow ${isUser ? "userMessageRow" : "assistantMessageRow"}`;
  const label = document.createElement("span");
  label.className = "messageLabel";
  label.textContent = isUser ? "YOU" : "SNN AI";
  const bubble = document.createElement("p");
  bubble.className = `messageBubble${isUser ? " userBubble" : ""}`;
  bubble.textContent = message.content;
  row.append(label, bubble);
  messageList.append(row);
  messageList.scrollTop = messageList.scrollHeight;
}

function setStatus(state: "checking" | "offline" | "online", detail: string) {
  if (!statusLabel || !statusDetail || !statusDot) {
    return;
  }

  statusLabel.textContent =
    state === "checking"
      ? "Checking AI Node..."
      : state === "online"
        ? "SNN AI · Online"
        : "SNN AI · Offline";
  statusDetail.textContent = detail;
  statusDot.className = `statusDot status${state[0].toUpperCase()}${state.slice(1)}`;
  if (panelState) {
    panelState.textContent = state === "online" ? "NODE READY" : "NODE OFFLINE";
  }
}

async function refreshStatus() {
  setStatus("checking", "正在检查本地 AI 节点");
  const status = await getAiStatus();

  setStatus(
    status.online ? "online" : "offline",
    status.online ? status.model ?? "AI 节点已就绪" : "本地模型尚未连接",
  );
}

async function handleSubmit(event: SubmitEvent) {
  event.preventDefault();
  const content = input?.value.trim();
  if (!content || !input || !sendButton) {
    return;
  }

  const message: AiChatMessage = { role: "user", content };
  const activeRequestVersion = requestVersion + 1;

  requestVersion = activeRequestVersion;
  messages.push(message);
  if (messages.length === 1) {
    messageList?.replaceChildren();
  }
  appendMessage(message);
  input.value = "";
  input.disabled = true;
  sendButton.disabled = true;
  sendButton.textContent = "思考中";

  try {
    const response = await sendChatMessage({ messages });
    if (requestVersion !== activeRequestVersion) {
      return;
    }

    const reply: AiChatMessage = { role: "assistant", content: response.reply };
    messages.push(reply);
    appendMessage(reply);
  } catch {
    if (requestVersion !== activeRequestVersion) {
      return;
    }

    const reply: AiChatMessage = { role: "assistant", content: unavailableReply };
    messages.push(reply);
    appendMessage(reply);
    setStatus("offline", "本地模型尚未连接");
  } finally {
    input.disabled = false;
    sendButton.disabled = false;
    sendButton.textContent = "发送 ↗";
    input.focus();
  }
}

form?.addEventListener("submit", handleSubmit);
input?.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form?.requestSubmit();
  }
});
newChatButton?.addEventListener("click", () => {
  requestVersion += 1;
  messages.splice(0, messages.length);
  renderWelcome();
  input?.focus();
});

renderWelcome();
void refreshStatus();
