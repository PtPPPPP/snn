"use client";

import styles from "./ai-chat.module.css";

export type ChatMode = "chat" | "agent";

export default function ModeSwitch({
  mode,
  onChange,
  agentAvailable,
}: {
  mode: ChatMode;
  onChange: (m: ChatMode) => void;
  agentAvailable: boolean | null;
}) {
  return (
    <div className={styles.modeSwitch} role="tablist" aria-label="对话模式">
      <button
        role="tab"
        aria-selected={mode === "chat"}
        aria-controls="chat-panel"
        className={`${styles.modeButton} ${mode === "chat" ? styles.modeButtonActive : ""}`}
        onClick={() => onChange("chat")}
        data-testid="mode-chat"
      >
        Chat
      </button>
      <button
        role="tab"
        aria-selected={mode === "agent"}
        aria-controls="agent-panel"
        className={`${styles.modeButton} ${mode === "agent" ? styles.modeButtonActive : ""}`}
        onClick={() => onChange("agent")}
        disabled={agentAvailable === false}
        title={agentAvailable === false ? "Agent 暂不可用" : undefined}
        data-testid="mode-agent"
      >
        Agent {agentAvailable === false ? "· 不可用" : ""}
      </button>
    </div>
  );
}
