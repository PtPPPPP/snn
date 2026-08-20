export function buildConversationSnapshot(base, requestMessages, assistantMessage, assistantContent) {
  return {
    ...base,
    messages: [
      ...requestMessages,
      ...(assistantContent.trim() ? [{ ...assistantMessage, content: assistantContent }] : []),
    ],
  };
}

export function canApplyGeneration(activeGeneration, generationToken, activeConversationId, requestConversationId) {
  return activeGeneration === generationToken && activeConversationId === requestConversationId;
}

export function canApplyNavigation(token, latestToken, requestedId, loadedId) {
  return token === latestToken && requestedId === loadedId;
}
