export async function deleteConversationLifecycle({
  targetConversationId,
  activeConversationId,
  abortActiveRequest,
  invalidateGeneration,
  invalidateNavigation,
  deleteConversation,
  listConversations,
  selectConversation,
  selectEmpty,
}) {
  const isActive = targetConversationId === activeConversationId;
  if (isActive) {
    invalidateGeneration();
    invalidateNavigation();
    abortActiveRequest();
  }

  await deleteConversation(targetConversationId);
  const remaining = await listConversations();
  if (isActive) {
    const next = remaining[0] ?? null;
    if (next) await selectConversation(next);
    else selectEmpty();
  }
  return { isActive, remaining };
}

export async function saveConversationWithNotice({ conversation, saveConversation, setNotice }) {
  try {
    await saveConversation(conversation);
    setNotice(null);
    return true;
  } catch {
    setNotice("本次对话未保存");
    return false;
  }
}
