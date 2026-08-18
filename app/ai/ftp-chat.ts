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
  UNAVAILABLE_REPLY,
} from "../../lib/ai-copy";

const messages: AiChatMessage[] = [];
let requestVersion = 0;
let streamController: AbortController | null = null;

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
    `<span class="emptyMark">${EMPTY_STATE.mark}</span><h2>${EMPTY_STATE.title}</h2><p>${EMPTY_STATE.description}</p>`;
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
  return bubble;
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
  const activeRequestVersion = requestVersion + 1;
  const controller = new AbortController();

  requestVersion = activeRequestVersion;
  messages.push(message);
  if (messages.length === 1) {
    messageList?.replaceChildren();
  }
  appendMessage(message);
  messages.push(assistantMessage);
  const assistantBubble = appendMessage(assistantMessage);
  input.value = "";
  input.disabled = true;
  sendButton.textContent = "停止生成";
  streamController = controller;

  try {
    await streamChatMessage({
      messages: requestMessages,
      signal: controller.signal,
      onDelta(text) {
        if (requestVersion !== activeRequestVersion || !assistantBubble) {
          return;
        }

        const followStream = shouldFollowMessages();
        assistantMessage.content += text;
        assistantBubble.textContent = assistantMessage.content;
        if (followStream && messageList) {
          messageList.scrollTop = messageList.scrollHeight;
        }
      },
      onDone() {},
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
      appendStreamNotice("生成已停止。");
    } else {
      appendStreamNotice(UNAVAILABLE_REPLY);
      setStatus("offline", STATUS_DETAILS.offline);
    }
  } finally {
    input.disabled = false;
    sendButton.textContent = "发送 ↗";
    streamController = null;
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

renderWelcome();
void refreshStatus();
