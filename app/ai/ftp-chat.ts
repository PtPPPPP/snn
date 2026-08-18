import {
  getAiStatus,
  streamChatMessage,
  type AiChatMessage,
} from "../../lib/ai-client";
import {
  EMPTY_STATE,
  NODE_STATES,
  STATUS_DETAILS,
  STATUS_LABELS,
  THINKING_MODE,
  UNAVAILABLE_REPLY,
} from "../../lib/ai-copy";

const messages: AiChatMessage[] = [];
let requestVersion = 0;
let streamController: AbortController | null = null;
let thinkingMode = false;
let thinkingStartedAt: number | null = null;
const THINKING_STORAGE_KEY = "snn-ai-thinking-mode";

const messageList = document.querySelector<HTMLElement>("#ai-messages");
const statusLabel = document.querySelector<HTMLElement>("#ai-status-label");
const statusDetail = document.querySelector<HTMLElement>("#ai-status-detail");
const statusDot = document.querySelector<HTMLElement>("#ai-status-dot");
const panelState = document.querySelector<HTMLElement>("#ai-panel-state");
const form = document.querySelector<HTMLFormElement>("#ai-composer");
const input = document.querySelector<HTMLTextAreaElement>("#ai-message");
const sendButton = document.querySelector<HTMLButtonElement>("#ai-send");
const newChatButton = document.querySelector<HTMLButtonElement>("#ai-new-chat");
const thinkingToggle = document.querySelector<HTMLButtonElement>("#ai-thinking-toggle");

function renderWelcome() {
  if (!messageList) {
    return;
  }

  messageList.replaceChildren();
  const emptyState = document.createElement("div");
  emptyState.className = "emptyState";
  emptyState.innerHTML =
    `<span class="emptyMark">${EMPTY_STATE.mark}</span><h2>${EMPTY_STATE.title}</h2><p>${EMPTY_STATE.description}</p>`;
  messageList.append(emptyState);
}

function appendMessage(message: AiChatMessage, isThinking = false) {
  if (!messageList) {
    return { bubble: undefined, row: undefined, thinkingLine: undefined };
  }

  const followStream = shouldFollowMessages();
  const row = document.createElement("article");
  const isUser = message.role === "user";

  row.className = `messageRow ${isUser ? "userMessageRow" : "assistantMessageRow"}`;
  const label = document.createElement("span");
  label.className = "messageLabel";
  label.textContent = isUser ? "YOU" : "SNN AI";
  let thinkingLine: HTMLSpanElement | undefined;
  if (!isUser && isThinking) {
    thinkingLine = document.createElement("span");
    thinkingLine.className = "thinkingLine";
    thinkingLine.textContent = THINKING_MODE.thinking;
  }
  const bubble = document.createElement("p");
  bubble.className = `messageBubble${isUser ? " userBubble" : ""}`;
  bubble.textContent = message.content;
  row.append(label, ...(thinkingLine ? [thinkingLine] : []), bubble);
  messageList.append(row);
  if (followStream) {
    messageList.scrollTop = messageList.scrollHeight;
  }
  return { bubble, row, thinkingLine };
}

function shouldFollowMessages() {
  if (!messageList) {
    return false;
  }

  return messageList.scrollHeight - messageList.scrollTop - messageList.clientHeight < 80;
}

function appendStreamNotice(message: string) {
  if (!messageList) {
    return;
  }

  const notice = document.createElement("p");
  notice.className = "streamNotice";
  notice.textContent = message;
  messageList.append(notice);
}

function setStatus(state: "checking" | "offline" | "online", detail: string) {
  if (!statusLabel || !statusDetail || !statusDot) {
    return;
  }

  statusLabel.textContent =
    state === "checking"
      ? STATUS_LABELS.checking
      : state === "online"
        ? STATUS_LABELS.online
        : STATUS_LABELS.offline;
  statusDetail.textContent = detail;
  statusDot.className = `statusDot status${state[0].toUpperCase()}${state.slice(1)}`;
  if (panelState) {
    panelState.textContent = state === "online" ? NODE_STATES.ready : NODE_STATES.offline;
  }
}

function setThinkingMode(enabled: boolean) {
  thinkingMode = enabled;
  if (!thinkingToggle) {
    return;
  }

  thinkingToggle.setAttribute("aria-pressed", String(enabled));
  thinkingToggle.classList.toggle("thinkingToggleActive", enabled);
  thinkingToggle.innerHTML = `<span aria-hidden="true">◇</span> ${THINKING_MODE.label}`;
  try {
    window.localStorage.setItem(THINKING_STORAGE_KEY, String(enabled));
  } catch {
    // The current page still keeps the in-memory setting.
  }
}

async function refreshStatus() {
  setStatus("checking", STATUS_DETAILS.checking);
  const status = await getAiStatus();

  setStatus(
    status.online ? "online" : "offline",
    status.online ? status.model ?? STATUS_DETAILS.ready : STATUS_DETAILS.offline,
  );
}

async function handleSubmit(event: SubmitEvent) {
  event.preventDefault();
  if (streamController) {
    streamController.abort();
    return;
  }

  const content = input?.value.trim();
  if (!content || !input || !sendButton) {
    return;
  }

  const message: AiChatMessage = { role: "user", content };
  const assistantMessage: AiChatMessage = { role: "assistant", content: "" };
  const requestMessages = [...messages, message];
  const activeThinking = thinkingMode;
  const activeRequestVersion = requestVersion + 1;
  const controller = new AbortController();

  requestVersion = activeRequestVersion;
  messages.push(message);
  if (messages.length === 1) {
    messageList?.replaceChildren();
  }
  appendMessage(message);
  messages.push(assistantMessage);
  const { bubble: assistantBubble, row: assistantRow } = appendMessage(assistantMessage);
  let thinkingLine: HTMLSpanElement | undefined;
  input.value = "";
  input.disabled = true;
  sendButton.textContent = "停止生成";
  streamController = controller;
  thinkingStartedAt = null;
  thinkingToggle?.setAttribute("disabled", "");

  try {
    await streamChatMessage({
      messages: requestMessages,
      thinking: activeThinking,
      signal: controller.signal,
      onReasoningStart() {
        if (requestVersion !== activeRequestVersion || !activeThinking || !assistantRow || !assistantBubble) {
          return;
        }

        thinkingStartedAt = performance.now();
        thinkingLine = document.createElement("span");
        thinkingLine.className = "thinkingLine";
        thinkingLine.textContent = THINKING_MODE.thinking;
        assistantRow.insertBefore(thinkingLine, assistantBubble);
      },
      onDelta(text) {
        if (requestVersion !== activeRequestVersion || !assistantBubble) {
          return;
        }

        const followStream = shouldFollowMessages();
        assistantMessage.content += text;
        assistantBubble.textContent = assistantMessage.content;
        if (thinkingStartedAt !== null && thinkingLine) {
          thinkingLine.textContent = `已思考 ${((performance.now() - thinkingStartedAt) / 1_000).toFixed(1)} 秒`;
          thinkingStartedAt = null;
        }
        if (followStream && messageList) {
          messageList.scrollTop = messageList.scrollHeight;
        }
      },
      onDone(metadata) {
        if (
          metadata.reasoningObserved &&
          typeof metadata.thinkingMs === "number" &&
          thinkingLine
        ) {
          thinkingLine.textContent = "已思考 " + (metadata.thinkingMs / 1_000).toFixed(1) + " 秒";
        }
        thinkingStartedAt = null;
      },
      onError(message) {
        if (requestVersion === activeRequestVersion) {
          appendStreamNotice(message);
        }
      },
    });
  } catch {
    if (requestVersion !== activeRequestVersion) {
      return;
    }

    if (controller.signal.aborted) {
      appendStreamNotice(activeThinking ? THINKING_MODE.stopped : "生成已停止。");
    } else {
      appendStreamNotice(UNAVAILABLE_REPLY);
      setStatus("offline", STATUS_DETAILS.offline);
    }
  } finally {
    input.disabled = false;
    sendButton.textContent = "发送 ↗";
    streamController = null;
    thinkingStartedAt = null;
    thinkingToggle?.removeAttribute("disabled");
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
  streamController?.abort();
  streamController = null;
  requestVersion += 1;
  messages.splice(0, messages.length);
  renderWelcome();
  input?.focus();
});
thinkingToggle?.addEventListener("click", () => {
  if (!streamController) {
    setThinkingMode(!thinkingMode);
  }
});

renderWelcome();
try {
  setThinkingMode(window.localStorage.getItem(THINKING_STORAGE_KEY) === "true");
} catch {
  setThinkingMode(false);
}
void refreshStatus();
