import styles from "./ai-chat.module.css";

export default function DeleteConversationDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return <div className={styles.modalBackdrop} onClick={onCancel} role="dialog" aria-modal="true" aria-labelledby="delete-dialog-title">
    <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
      <p className={styles.modalTitle} id="delete-dialog-title">确定删除这个对话吗？</p>
      <p className={styles.modalDesc}>此操作无法恢复。</p>
      <div className={styles.modalActions}><button className={styles.modalCancel} type="button" onClick={onCancel}>取消</button><button className={styles.modalConfirm} type="button" onClick={onConfirm}>删除</button></div>
    </div>
  </div>;
}
