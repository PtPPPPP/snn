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
import {
  createConversation,
  deleteConversation as deleteConv,
  generateTitle,
  getActiveConversationId,
  getConversation,
  listConversations,
  saveConversation,
  setActiveConversationId,
  type Conversation,
} from "../../lib/ai-conversation-store";

const THINKING_STORAGE_KEY = "snn-ai-thinking-mode";

// Runtime state for the currently active conversation
let activeId: string | null = null;
let conversations: Conversation[] = [];
let messages: AiChatMessage[] = [];
let requestVersion = 0;
let requestConversationId: string | null = null;
let streamController: AbortController | null = null;
let thinkingMode = false;
let thinkingStartedAt: number | null = null;
let currentAssistantBubble: HTMLParagraphElement | null = null;
let currentAssistantContent = "";

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
const historyList = document.querySelector<HTMLElement>("#ai-history-list");
const sidebarToggle = document.querySelector<HTMLButtonElement>("#ai-sidebar-toggle");
const sidebarClose = document.querySelector<HTMLButtonElement>("#ai-sidebar-close");
const sidebar = document.querySelector<HTMLElement>(".sidebar");
const backdrop = document.querySelector<HTMLElement>("#ai-backdrop");
const scrollToBottomBtn = document.querySelector<HTMLButtonElement>("#ai-scroll-to-bottom");
const SEND_ICON = '<span aria-hidden="true">↑</span>';
// Same geometry as the React composer's StopIcon (app/ai/chat-input.tsx):
// a solid rounded square rendered at ~9x9px inside the 16x16 icon slot.
const STOP_ICON = '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false"><rect x="4.375" y="4.375" width="11.25" height="11.25" rx="1.875" fill="currentColor"></rect></svg>';

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "昨天";
  if (day < 30) return `${day} 天前`;
  return new Date(ts).toLocaleDateString("zh-CN", { month: "long", day: "numeric" });
}

function shouldFollowMessages() {
  if (!messageList) return false;
  return messageList.scrollHeight - messageList.scrollTop - messageList.clientHeight < 80;
}

function renderWelcome() {
  if (!messageList) return;
  messageList.replaceChildren();
  const el = document.createElement("div");
  el.className = "emptyState";
  el.innerHTML = `<span class="emptyMark">${EMPTY_STATE.mark}</span><h2>${EMPTY_STATE.title}</h2><p>${EMPTY_STATE.description}</p>`;
  messageList.append(el);
}

function appendMessage(message: AiChatMessage, isThinking = false) {
  if (!messageList) return null;
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
  if (shouldFollowMessages()) {
    messageList.scrollTop = messageList.scrollHeight;
  }
  return { bubble, row, thinkingLine };
}

function appendStreamNotice(message: string) {
  if (!messageList) return;
  const notice = document.createElement("p");
  notice.className = "streamNotice";
  notice.textContent = message;
  messageList.append(notice);
}

function renderMessages(msgs: AiChatMessage[]) {
  if (!messageList) return;
  messageList.replaceChildren();
  if (msgs.length === 0) {
    renderWelcome();
    return;
  }
  for (const m of msgs) {
    appendMessage(m);
  }
}

function renderHistoryList() {
  if (!historyList) return;
  historyList.replaceChildren();
  if (conversations.length === 0) {
    const empty = document.createElement("p");
    empty.className = "historyEmpty";
    empty.textContent = "暂无历史对话";
    historyList.append(empty);
    return;
  }
  for (const conv of conversations) {
    const item = document.createElement("div");
    item.className = `historyItem${conv.id === activeId ? " historyItemActive" : ""}`;
    item.setAttribute("aria-current", conv.id === activeId ? "true" : "");

    const main = document.createElement("button");
    main.className = "historyItemMain";
    main.type = "button";
    main.addEventListener("click", () => switchConversation(conv.id));

    const title = document.createElement("span");
    title.className = "historyItemTitle";
    title.textContent = conv.title;

    const time = document.createElement("span");
    time.className = "historyItemTime";
    time.textContent = formatRelativeTime(conv.updatedAt);

    main.append(title, time);

    const del = document.createElement("button");
    del.className = "historyItemDelete";
    del.type = "button";
    del.setAttribute("aria-label", "删除对话");
    del.textContent = "⋯";
    del.addEventListener("click", (e) => {
      e.stopPropagation();
      showDeleteModal(conv.id, conv.title);
    });

    item.append(main, del);
    historyList.append(item);
  }
}

function setStatus(state: "checking" | "offline" | "online", detail: string) {
  if (!statusLabel || !statusDetail || !statusDot) return;
  statusLabel.textContent =
    state === "checking" ? STATUS_LABELS.checking
      : state === "online" ? STATUS_LABELS.online : STATUS_LABELS.offline;
  statusDetail.textContent = detail;
  statusDot.className = `statusDot status${state[0].toUpperCase()}${state.slice(1)}`;
  if (panelState) {
    panelState.textContent = state === "online" ? NODE_STATES.ready : NODE_STATES.offline;
  }
}

function setThinkingMode(enabled: boolean) {
  thinkingMode = enabled;
  if (!thinkingToggle) return;
  thinkingToggle.setAttribute("aria-pressed", String(enabled));
  thinkingToggle.classList.toggle("thinkingToggleActive", enabled);
  thinkingToggle.innerHTML = `<span aria-hidden="true">◇</span> 深度思考`;
  try {
    window.localStorage.setItem(THINKING_STORAGE_KEY, String(enabled));
  } catch {
    // keep in-memory
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

function persistCurrentMessages(convId: string) {
  const conv = conversations.find((c) => c.id === convId);
  if (!conv) return;
  const stored = messages.filter((m) => m.content.trim() !== "");
  const updated: Conversation = {
    id: convId,
    title: conv.title,
    createdAt: conv.createdAt,
    updatedAt: Date.now(),
    messages: stored,
    version: 1,
  };
  saveConversation(updated).then(refreshConversationList);
}

async function refreshConversationList() {
  conversations = await listConversations();
  renderHistoryList();
}

function openSidebar() {
  sidebar?.classList.add("sidebarOpen");
  backdrop?.classList.add("backdropVisible");
}
function closeSidebar() {
  sidebar?.classList.remove("sidebarOpen");
  backdrop?.classList.remove("backdropVisible");
}

async function switchConversation(id: string) {
  if (id === activeId) {
    closeSidebar();
    return;
  }
  streamController?.abort();
  streamController = null;
  requestConversationId = null;
  if (activeId) {
    persistCurrentMessages(activeId);
  }
  const conv = await getConversation(id);
  if (!conv) {
    closeSidebar();
    return;
  }
  activeId = id;
  setActiveConversationId(id);
  messages = [...conv.messages];
  renderMessages(messages);
  setIsResponding(false);
  setStreamNotice(null);
  thinkingStartedAt = null;
  currentAssistantBubble = null;
  currentAssistantContent = "";
  closeSidebar();
  await refreshConversationList();
}

function startNewConversation() {
  streamController?.abort();
  streamController = null;
  requestConversationId = null;
  if (activeId) {
    persistCurrentMessages(activeId);
  }
  const fresh = createConversation();
  activeId = fresh.id;
  setActiveConversationId(fresh.id);
  messages = [];
  renderWelcome();
  setIsResponding(false);
  setStreamNotice(null);
  thinkingStartedAt = null;
  currentAssistantBubble = null;
  currentAssistantContent = "";
  closeSidebar();
  refreshConversationList();
}

function setIsResponding(v: boolean) {
  if (!sendButton || !input) return;
  // Icon-only stop button, matching the React composer (sendButtonStop state class).
  sendButton.classList.toggle("sendButtonStop", v);
  if (v) {
    sendButton.innerHTML = STOP_ICON;
    sendButton.setAttribute("aria-label", "停止生成");
    sendButton.title = "停止生成";
    input.disabled = true;
    thinkingToggle?.setAttribute("disabled", "");
  } else {
    sendButton.innerHTML = SEND_ICON;
    sendButton.setAttribute("aria-label", "发送");
    sendButton.title = "发送";
    input.disabled = false;
    thinkingToggle?.removeAttribute("disabled");
    input.focus();
  }
}

function setStreamNotice(msg: string | null) {
  const existing = messageList?.querySelector(".streamNotice");
  if (existing) existing.remove();
  if (msg) appendStreamNotice(msg);
}

function showDeleteModal(id: string, title: string) {
  const existing = document.querySelector("#ai-delete-modal");
  if (existing) existing.remove();

  const backdropEl = document.createElement("div");
  backdropEl.id = "ai-delete-modal";
  backdropEl.className = "modalBackdrop";
  backdropEl.setAttribute("role", "dialog");
  backdropEl.setAttribute("aria-modal", "true");

  const modal = document.createElement("div");
  modal.className = "modal";
  modal.innerHTML = `
    <p class="modalTitle">确定删除这个对话吗？</p>
    <p class="modalDesc">「${title.replace(/</g, "&lt;")}」此操作无法恢复。</p>
    <div class="modalActions">
      <button class="modalCancel" type="button">取消</button>
      <button class="modalConfirm" type="button">删除</button>
    </div>`;

  const cancelBtn = modal.querySelector(".modalCancel") as HTMLButtonElement;
  const confirmBtn = modal.querySelector(".modalConfirm") as HTMLButtonElement;

  function close() {
    backdropEl.remove();
    document.removeEventListener("keydown", onKey);
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") close();
  }

  backdropEl.addEventListener("click", (e) => {
    if (e.target === backdropEl) close();
  });
  cancelBtn.addEventListener("click", close);
  confirmBtn.addEventListener("click", async () => {
    close();
    await deleteConv(id);
    conversations = await listConversations();
    renderHistoryList();
    if (id === activeId) {
      if (conversations.length > 0) {
        await switchConversation(conversations[0].id);
      } else {
        const fresh = createConversation();
        activeId = fresh.id;
        setActiveConversationId(fresh.id);
        messages = [];
        renderWelcome();
      }
    }
  });
  document.addEventListener("keydown", onKey);
  backdropEl.append(modal);
  document.body.append(backdropEl);
  confirmBtn.focus();
}

async function handleSubmit(event: SubmitEvent) {
  event.preventDefault();
  if (streamController) {
    streamController.abort();
    return;
  }
  const content = input?.value.trim();
  if (!content || !input || !sendButton || !activeId) return;

  const convId = activeId;
  const userMessage: AiChatMessage = { role: "user", content };
  const assistantMessage: AiChatMessage = { role: "assistant", content: "" };
  const requestMessages = [...messages, userMessage];
  const activeThinking = thinkingMode;
  const activeRequestVersion = requestVersion + 1;
  const controller = new AbortController();

  requestVersion = activeRequestVersion;
  requestConversationId = convId;
  messages.push(userMessage);
  if (messages.length === 1) {
    messageList?.replaceChildren();
  }
  appendMessage(userMessage);
  messages.push(assistantMessage);
  const result = appendMessage(assistantMessage);
  currentAssistantBubble = result?.bubble ?? null;
  currentAssistantContent = "";
  let thinkingLine: HTMLSpanElement | undefined = result?.thinkingLine;
  input.value = "";
  setIsResponding(true);
  streamController = controller;
  thinkingStartedAt = null;

  // Save user message + auto title. This snapshot (with its derived title) is
  // the authoritative record for the whole request lifecycle; the finally
  // block persists the completed version of the SAME snapshot instead of
  // re-deriving the title from the (possibly stale) conversations list.
  const conv = conversations.find((c) => c.id === convId);
  const isFirstMessage = messages.length <= 2; // user + empty assistant
  const updatedConv: Conversation = {
    id: convId,
    title: isFirstMessage ? generateTitle(content) : conv?.title ?? "新对话",
    createdAt: conv?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
    messages: requestMessages,
    version: 1,
  };
  saveConversation(updatedConv).then(refreshConversationList);

  try {
    await streamChatMessage({
      messages: requestMessages,
      thinking: activeThinking,
      signal: controller.signal,
      onReasoningStart() {
        if (requestConversationId !== convId || !activeThinking) return;
        thinkingStartedAt = performance.now();
        if (currentAssistantBubble && result?.row && !thinkingLine) {
          thinkingLine = document.createElement("span");
          thinkingLine.className = "thinkingLine";
          thinkingLine.textContent = THINKING_MODE.thinking;
          result.row.insertBefore(thinkingLine, currentAssistantBubble);
        }
      },
      onDelta(text) {
        if (requestConversationId !== convId || !currentAssistantBubble) return;
        const followStream = shouldFollowMessages();
        currentAssistantContent += text;
        assistantMessage.content = currentAssistantContent;
        currentAssistantBubble.textContent = currentAssistantContent;
        if (thinkingStartedAt !== null && thinkingLine) {
          thinkingLine.textContent = `已思考 ${((performance.now() - thinkingStartedAt) / 1000).toFixed(1)} 秒`;
          thinkingStartedAt = null;
        }
        if (followStream && messageList) {
          messageList.scrollTop = messageList.scrollHeight;
        }
      },
      onDone(metadata) {
        if (metadata.reasoningObserved && typeof metadata.thinkingMs === "number" && thinkingLine) {
          thinkingLine.textContent = "已思考 " + (metadata.thinkingMs / 1000).toFixed(1) + " 秒";
        }
        thinkingStartedAt = null;
      },
      onError(message) {
        if (requestConversationId === convId) {
          appendStreamNotice(message);
        }
      },
    });
  } catch {
    if (requestConversationId !== convId) return;
    if (controller.signal.aborted) {
      appendStreamNotice(activeThinking ? THINKING_MODE.stopped : "生成已停止。");
    } else {
      appendStreamNotice(UNAVAILABLE_REPLY);
      setStatus("offline", STATUS_DETAILS.offline);
    }
  } finally {
    if (requestConversationId === convId) {
      // Update the assistant message content in memory (may be partial)
      const idx = messages.indexOf(assistantMessage);
      if (idx >= 0) {
        messages[idx] = { role: "assistant", content: currentAssistantContent };
      }
      setIsResponding(false);
      streamController = null;
      thinkingStartedAt = null;
      currentAssistantBubble = null;
      currentAssistantContent = "";
      // Persist final state from the request snapshot (title survives completion)
      saveConversation({
        ...updatedConv,
        updatedAt: Date.now(),
        messages: messages.filter((m) => m.content.trim() !== ""),
      }).then(refreshConversationList);
      requestConversationId = null;
    }
  }
}

// Event listeners
form?.addEventListener("submit", handleSubmit);
input?.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form?.requestSubmit();
  }
});
newChatButton?.addEventListener("click", startNewConversation);
thinkingToggle?.addEventListener("click", () => {
  if (!streamController) {
    setThinkingMode(!thinkingMode);
  }
});
sidebarToggle?.addEventListener("click", openSidebar);
sidebarClose?.addEventListener("click", closeSidebar);
backdrop?.addEventListener("click", closeSidebar);

function updateScrollButton() {
  if (!messageList || !scrollToBottomBtn) return;
  const isNearBottom = shouldFollowMessages();
  scrollToBottomBtn.style.display = (!isNearBottom && messages.length > 0) ? "grid" : "none";
}

messageList?.addEventListener("scroll", updateScrollButton);
scrollToBottomBtn?.addEventListener("click", () => {
  if (messageList) {
    messageList.scrollTo({ top: messageList.scrollHeight, behavior: "smooth" });
  }
});

// Floating composer content reservation: keep --snn-composer-extent on the
// chat panel in sync with the live composer geometry (mirrors the React
// version in ai-chat.tsx). The CSS derives the messages bottom padding from
// this single variable, so no static padding magic numbers are needed.
const chatPanel = document.querySelector<HTMLElement>(".chatPanel");
function syncComposerReservation() {
  if (!chatPanel || !form) return;
  const extent = Math.ceil(
    chatPanel.getBoundingClientRect().bottom - form.getBoundingClientRect().top,
  );
  chatPanel.style.setProperty("--snn-composer-extent", `${extent}px`);
}
syncComposerReservation();
if (typeof ResizeObserver !== "undefined" && chatPanel && form) {
  const composerObserver = new ResizeObserver(syncComposerReservation);
  composerObserver.observe(form);
  composerObserver.observe(chatPanel);
}

// Initialize
async function init() {
  try {
    setThinkingMode(window.localStorage.getItem(THINKING_STORAGE_KEY) === "true");
  } catch {
    setThinkingMode(false);
  }
  conversations = await listConversations();
  renderHistoryList();
  const storedActiveId = getActiveConversationId();
  const target =
    (storedActiveId && conversations.find((c) => c.id === storedActiveId)) ||
    conversations[0] ||
    null;
  if (target) {
    activeId = target.id;
    setActiveConversationId(target.id);
    messages = [...target.messages];
    renderMessages(messages);
  } else {
    const fresh = createConversation();
    activeId = fresh.id;
    setActiveConversationId(fresh.id);
    messages = [];
    renderWelcome();
  }
  void refreshStatus();
}

void init();
