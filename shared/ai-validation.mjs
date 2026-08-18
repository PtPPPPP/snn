// 共享的消息校验逻辑，供 ai-node 与 cloudflare-ai-gateway 复用。
// 两边必须保持一致，避免一处改动另一处遗漏。

export const VALID_ROLES = new Set(["assistant", "system", "user"]);
export const MAX_MESSAGES = 24;
export const MAX_MESSAGE_CHARACTERS = 12_000;
export const MAX_TOTAL_CHARACTERS = 48_000;

export function validateMessages(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_MESSAGES) {
    return null;
  }

  let totalCharacters = 0;
  const messages = [];

  for (const message of value) {
    if (
      !message ||
      typeof message !== "object" ||
      !VALID_ROLES.has(message.role) ||
      typeof message.content !== "string"
    ) {
      return null;
    }

    const content = message.content.trim();
    if (!content || content.length > MAX_MESSAGE_CHARACTERS) {
      return null;
    }

    totalCharacters += content.length;
    if (totalCharacters > MAX_TOTAL_CHARACTERS) {
      return null;
    }

    messages.push({ role: message.role, content });
  }

  return messages;
}
