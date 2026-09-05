import type { Conversation } from "../../lib/ai-conversation-store";
import { SIDEBAR } from "../../lib/ai-copy";
import styles from "./ai-chat.module.css";
import { useDrawerFocus } from "./use-drawer-focus";

type Props = {
  conversations: Conversation[];
  activeId: string | null;
  statusLabel: string;
  statusDetail: string;
  nodeState: "checking" | "offline" | "online";
  id?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
};

function relativeTime(ts: number): string {
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

export default function ConversationSidebar({ id, open, conversations, activeId, statusLabel, statusDetail, nodeState, onOpenChange, onNew, onSelect, onDelete }: Props) {
  const drawerRef = useDrawerFocus(open, () => onOpenChange(false));
  return (
    <aside className={styles.sidebar} id={id} ref={drawerRef} aria-label="历史对话侧栏">
      <div className={styles.sidebarHeader}>
        <div><p className={styles.sectionCode}>{SIDEBAR.sectionCode}</p><h1>{SIDEBAR.title}</h1><p className={styles.description}>{SIDEBAR.description}</p></div>
        <button className={styles.sidebarClose} type="button" aria-label="关闭历史" onClick={() => onOpenChange(false)}>✕</button>
      </div>
      <div className={styles.statusCard} aria-label="AI 服务状态"><span className={`${styles.statusDot} ${nodeState === "online" ? styles.statusOnline : nodeState === "checking" ? styles.statusChecking : styles.statusOffline}`} aria-hidden="true" /><div><strong>{statusLabel}</strong><span>{statusDetail}</span></div></div>
      <button className={styles.newChatButton} type="button" onClick={onNew}><span>＋</span> 新建对话</button>
      <div className={styles.historyLabel}>最近对话</div>
      <nav className={styles.historyList} aria-label="历史对话">
        {conversations.length === 0 ? <p className={styles.historyEmpty}>暂无历史对话</p> : conversations.map((conv) => (
          <div key={conv.id} className={`${styles.historyItem} ${conv.id === activeId ? styles.historyItemActive : ""}`} aria-current={conv.id === activeId ? "true" : undefined}>
            <button className={styles.historyItemMain} type="button" onClick={() => onSelect(conv.id)}><span className={styles.historyItemTitle}>{conv.title}</span><span className={styles.historyItemTime}>{relativeTime(conv.updatedAt)}</span></button>
            <button id={`conversation-delete-${conv.id}`} className={styles.historyItemDelete} type="button" aria-label={`删除对话：${conv.title}`} onClick={() => onDelete(conv.id)}>⋯</button>
          </div>
        ))}
      </nav>
    </aside>
  );
}
